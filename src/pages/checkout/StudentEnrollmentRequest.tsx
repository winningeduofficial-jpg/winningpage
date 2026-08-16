import type { User } from "@supabase/supabase-js";
import { type KeyboardEvent, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import checkboxUnselected from "../../assets/checkout/checkbox-24.svg";
import checkboxSelected from "../../assets/checkout/checkbox-24-selected.svg";
import sectionArrow from "../../assets/checkout/section-arrow-38.svg";
import successCheck from "../../assets/checkout/success-check-60.svg";
import ConfirmModal from "../../components/checkout/ConfirmModal";
import { formatKRW } from "../../data/pricingCatalog";
import { getApprovedParentLink } from "../../lib/parentLink";
import { type ServiceProduct, useProducts } from "../../lib/products";
import { supabase } from "../../lib/supabase";

// 학생 — 결제 요청(수강신청) 화면. Figma 실측 재작업(2026-08-12b, 팀 리드가
// get_design_context 로 직접 뽑은 전문 기준 — 이전 라운드는 Figma 접근 없이
// 산문 설명만으로 만들어져 폐기됐다). 3921:7066(선택) / 3921:7480(학부모
// 미연결 실패 모달) / 3921:7792(완료) 3개 상태를 한 컴포넌트 안에서 status
// 전환으로 담는다(팀 리드 지시 — 별도 라우트를 만들지 않는다). 여기서는
// 결제를 하지 않는다 — "요청"만 만들고 학부모가 마이페이지에서 수락+결제한다
// (sql/68·sql/69 제품 규칙 확정, ParentCheckout.jsx 상단 `?order=` 진입
// 규약 주석과 짝). /pricing 도 학생 로그인 시 이 컴포넌트를 그대로 재사용한다
// (Pricing.jsx 역할 분기 참고 — 화면을 두 벌 만들지 않는다).
//
// 상품 그룹핑 — 팀 리드 스펙 문구는 program_key(target/mentor/suhaeng) 기준이지만
// 기존 조회 훅(src/lib/products.js)은 service_key(goal/mentor/suhaeng)로
// 그룹핑한다(Pricing.jsx 가 이미 이 훅을 그렇게 쓴다). dev DB 실측 결과 이 3개
// 서비스는 service_key ↔ program_key 가 1:1 대응이라(goal↔target, mentor↔mentor,
// suhaeng↔suhaeng) 그룹 구성 결과가 동일하므로 기존 훅을 그대로 재사용한다.
const ALLOWED_SERVICE_KEYS = ["goal", "mentor", "suhaeng"];

// 그룹당 1개 선택 안내 — 시안 실측 문구(3921:7066, 목표관리·수행평가 섹션
// 하단에만 있고 콜멘토엔 없다 — 아래 렌더 조건 `products.length > 1`이 이를
// 자연스럽게 처리한다). src/data/pricingCatalog.js 의 SINGLE_SELECT_NOTICE 와
// 다른 문구다 — 그 상수는 Pricing.jsx 전용 시안(1882 시리즈) 실측이고 이 화면은
// 별도 시안 노드(3921 시리즈)에서 뽑은 문구라 여기서만 쓰는 로컬 상수로 둔다.
// (주의: 팀 리드가 저해상도 스크린샷으로 "여러 옵션"이라 오독해 앞서 다르게
// 지시했었다 — 정본은 "여러 플랜"이다, 이번 실측으로 정정.)
const SINGLE_PLAN_NOTICE =
  "한 서비스 내에서 여러 플랜을 동시 선택할 수 없어요. 하나의 플랜만 선택 가능합니다.";

// 학부모 미연결 실패 모달(시안 3921:7480) 본문 — 시안 원문 그대로(3줄 줄바꿈
// 유지). 제목의 시안 오타 "실패했습니다.," → "실패했습니다."로 정정(사용자 확정).
const FAIL_MODAL_BODY = (
  <>
    아직 연결된 학부모 계정이 없어요.
    <br />
    마이페이지에 있는 내 연결코드를
    <br />
    학부모님께 알려드리면 결제 요청을 보낼 수 있어요.
  </>
);

// 서버 제출 실패(학부모 미연결 이외의 사유) — 제목은 기존 승인 문구
// ("결제요청에 실패했습니다.") 재사용. 본문은 신규 문구(사용자 승인 대기).
const GENERIC_SUBMIT_FAIL = {
  title: "결제요청에 실패했습니다.",
  body: "잠시 후 다시 시도해 주세요.",
};

// WC043(fn_request_enrollment 의 중복 open 요청 게이트, sql/71) 응답 —
// 같은 학생·학부모 쌍에 이미 응답 대기 중인 요청이 있다는 뜻이다. 신규
// 문구(사용자 승인 대기).
const DUPLICATE_REQUEST_FAIL = {
  title: "이미 진행 중인 결제 요청이 있어요.",
  body: "학부모님의 확인을 기다리고 있어요. 마이페이지에서 요청 현황을 확인해 주세요.",
};

interface SelectedItem {
  id: string;
  serviceKey: string;
  serviceName: string;
  name: string;
  listPrice: number;
  price: number;
}

interface SubmitError {
  title: string;
  body: string;
}

interface CompletedOrder {
  id: string;
  amount: number;
}

export default function StudentEnrollmentRequest() {
  const navigate = useNavigate();
  const { services, loading, error, refetch } = useProducts();

  // 서비스별 단일 선택: { [serviceKey]: productId } — Pricing.jsx 와 동일 규칙
  // (그룹당 1개, 서로 다른 그룹은 동시 선택 가능).
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [user, setUser] = useState<User | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showFailModal, setShowFailModal] = useState(false);
  // { title, body } | null — 학부모 미연결 이외의 서버 제출 실패(일반 오류/중복 요청).
  const [submitError, setSubmitError] = useState<SubmitError | null>(null);
  // null = 선택 화면, {id, amount} = 완료 화면(시안 3921-7792).
  const [completedOrder, setCompletedOrder] = useState<CompletedOrder | null>(
    null,
  );

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!alive) return;
      setUser(data?.session?.user ?? null);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const filteredServices = useMemo(
    () => services.filter((s) => ALLOWED_SERVICE_KEYS.includes(s.key)),
    [services],
  );
  const hasNoServices = Boolean(error) || filteredServices.length === 0;

  function toggle(serviceKey: string, productId: string) {
    setSelected((prev) => {
      const next = { ...prev };
      if (next[serviceKey] === productId) delete next[serviceKey];
      else next[serviceKey] = productId;
      return next;
    });
  }

  // Escape = 그룹 선택 해제, 화살표 = 이동+선택. Pricing.jsx radiogroup 과 동일
  // 규약이다(전체 근거는 그쪽 handleRadioKeyDown 주석 참고 — 두 화면이 같은
  // 상호작용을 쓰므로 여기서 반복 설명하지 않는다).
  function handleRadioKeyDown(
    e: KeyboardEvent<HTMLButtonElement>,
    serviceKey: string,
    products: ServiceProduct[],
    currentIndex: number,
  ) {
    if (e.key === "Escape") {
      if (!(serviceKey in selected)) return;
      e.preventDefault();
      setSelected((prev) => {
        const next = { ...prev };
        delete next[serviceKey];
        return next;
      });
      return;
    }

    let delta = 0;
    if (e.key === "ArrowDown" || e.key === "ArrowRight") delta = 1;
    else if (e.key === "ArrowUp" || e.key === "ArrowLeft") delta = -1;
    else return;
    e.preventDefault();

    const nextIndex =
      (currentIndex + delta + products.length) % products.length;
    const nextProduct = products[nextIndex];
    if (!nextProduct) return;
    setSelected((prev) => ({ ...prev, [serviceKey]: nextProduct.id }));

    const group = e.currentTarget.closest('[role="radiogroup"]');
    const nextEl =
      group?.querySelectorAll<HTMLElement>('[role="radio"]')[nextIndex];
    nextEl?.focus();
  }

  const selectedItems = useMemo(() => {
    const items: SelectedItem[] = [];
    filteredServices.forEach((service) => {
      const pid = selected[service.key];
      if (!pid) return;
      const product = service.products.find((p) => p.id === pid);
      if (!product) return;
      items.push({
        id: product.id,
        serviceKey: service.key,
        serviceName: service.name,
        name: product.name,
        // 다운스트림 합계 계산(listTotal/subtotal)이 이미 `|| 0` 폴백을 쓰므로
        // null/undefined를 0으로 정규화해도 값 의미는 동일하다.
        listPrice: product.listPrice ?? 0,
        price: product.price ?? 0,
      });
    });
    return items;
  }, [filteredServices, selected]);

  const listTotal = selectedItems.reduce(
    (s, i) => s + Number(i.listPrice || i.price || 0),
    0,
  );
  const subtotal = selectedItems.reduce((s, i) => s + Number(i.price || 0), 0);
  const discountTotal = listTotal - subtotal;

  const canSubmit = selectedItems.length > 0 && !submitting;

  async function handleSubmit() {
    if (!canSubmit || !user) return;
    setSubmitting(true);
    try {
      // 학부모 연결 판정 — 버튼은 처음부터 비활성화하지 않는다(시안 B는 "시도 후
      // 실패" 모달이다, 팀 리드 지시). 연결이 없으면 여기서 모달을 띄우고 중단한다.
      // (서버도 같은 판정을 다시 한다 — 이 클라이언트 조회는 UX 용이고, 신뢰
      // 경계는 api/request-enrollment.js 다.)
      const parentLink = await getApprovedParentLink(user.id);
      if (!parentLink) {
        setShowFailModal(true);
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) {
        setShowFailModal(true);
        return;
      }

      let response: Response | undefined;
      let payload:
        | { error?: string; orderId?: string; amount?: number }
        | undefined;
      try {
        response = await fetch("/api/request-enrollment", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          // id 만 보낸다 — parentProfileId·금액류는 서버가 신뢰하지 않고 무시한다
          // (api/request-enrollment.js 신뢰 경계 주석 참고).
          body: JSON.stringify({
            items: selectedItems.map((i) => ({ id: i.id })),
          }),
        });
        payload = await response.json();
      } catch {
        setSubmitError(GENERIC_SUBMIT_FAIL);
        return;
      }

      if (!response.ok) {
        if (payload?.error === "no_linked_parent") {
          setShowFailModal(true);
          return;
        }
        if (payload?.error === "duplicate_open_request") {
          setSubmitError(DUPLICATE_REQUEST_FAIL);
          return;
        }
        setSubmitError(GENERIC_SUBMIT_FAIL);
        return;
      }

      // 서버가 실제로 만든 주문의 id/금액을 그대로 쓴다(표시가는 서버 신뢰값).
      // response.ok=true 경로에서 payload/orderId/amount는 기존에도 항상 있다고
      // 가정해온 값 — 타입만 좁힌다(런타임 동작 변경 없음, 실제 누락 가능성은 보고).
      setCompletedOrder({ id: payload!.orderId!, amount: payload!.amount! });
    } finally {
      setSubmitting(false);
    }
  }

  // 완료 화면으로 넘어갈 때 맨 위로 올린다. 요청 폼은 상품 목록이 길어 대부분
  // 아래쪽까지 스크롤한 상태에서 제출하는데, 라우트 이동이 아니라 같은 페이지의
  // 상태 전환이라 브라우저가 스크롤 위치를 그대로 유지한다 — 그러면 완료 화면의
  // 제목이 화면 밖에 있어 "아무 일도 안 일어난" 것처럼 보인다.
  useEffect(() => {
    if (!completedOrder) return;
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [completedOrder]);

  // 화면 3 — 완료(시안 3921:7792). 헤더/푸터는 렌더하지 않는다 — SiteLayout
  // (App.jsx 의 /checkout·/pricing 공통 레이아웃 라우트)이 이미 전역으로 감싼다.
  if (completedOrder) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white px-5 py-16 lg:px-[12.5rem] lg:py-[6.25rem]">
        <div className="flex w-full flex-col items-center gap-10 lg:gap-[3.75rem]">
          <div className="flex flex-col items-center gap-5">
            <img
              src={successCheck}
              alt=""
              aria-hidden="true"
              className="size-12 lg:size-[3.75rem]"
            />
            <h1 className="whitespace-nowrap text-center text-[1.75rem] font-semibold leading-[1.4] tracking-[-0.035rem] text-ink lg:text-[3.125rem] lg:tracking-[-0.0625rem]">
              결제 요청이 완료 되었어요!
            </h1>
          </div>

          <dl className="w-full max-w-[39.125rem] space-y-1 rounded-[1.25rem] border border-line px-3 py-5">
            <div className="flex items-center justify-between gap-4 bg-white px-4 py-3">
              <dt className="shrink-0 text-[0.875rem] font-medium text-ink">
                주문번호
              </dt>
              {/* orders.id 형식(order_<timestamp>_<hex>)을 그대로 쓴다 — 시안의
                  '1234567-1234567'은 더미다. 길어서 줄바꿈되도 값을 자르지 않는다. */}
              <dd className="min-w-0 break-all text-right text-[0.875rem] font-medium text-ink">
                {completedOrder.id}
              </dd>
            </div>
            {/* 부가가치세 행 없음(사용자 확정) — orders 스키마엔 부가세 컬럼이
                없고, 시안의 부가세 값도 총액과 동일한 더미였다. */}
            <div className="flex items-center justify-between gap-4 bg-white px-4 py-3">
              <dt className="text-[0.875rem] font-medium text-ink">
                총 결제 금액
              </dt>
              <dd className="text-[0.875rem] font-medium text-ink">
                {formatKRW(completedOrder.amount)}
              </dd>
            </div>
          </dl>

          <div className="flex w-full max-w-[25rem] flex-col items-center">
            <button
              type="button"
              onClick={() => navigate("/mypage")}
              className="flex h-[3.25rem] w-full items-center justify-center rounded-xl bg-ink-title text-[1rem] font-semibold text-white transition hover:brightness-125"
            >
              마이페이지에서 확인하기
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <>
      <main className="min-h-screen bg-white pt-16">
        <section className="px-5 pb-4 pt-16 text-center sm:px-8">
          <p className="text-[1.125rem] font-medium leading-[1.4] text-ink-sub lg:text-[1.25rem]">
            나에게 맞는 서비스를 선택해주세요
          </p>
          {/* 시안(3921:7066) 원문은 "결제할 서비스를 선택해주세요"이지만 의도적으로
              "결제 요청할"로 바꿨다(사용자 승인, 2026-08-12b) — 이 화면은 결제가
              아니라 결제 "요청"만 만든다(실제 결제는 학부모가 마이페이지에서
              한다). 시안 원문 그대로 두면 학생이 자신이 바로 결제하는 것으로
              오해할 수 있어 정정했다. 시안과 비교하다 되돌리지 말 것. */}
          <h1 className="mt-3 text-[1.75rem] font-semibold leading-[1.4] tracking-[-0.02em] text-[#1e293b] lg:text-[3.125rem]">
            결제 요청할 서비스를 선택해주세요
          </h1>
        </section>

        <div className="mx-auto w-full max-w-content px-5 pb-40 pt-10 sm:px-8">
          {loading && (
            <div className="rounded-2xl border border-line bg-white p-10 text-center text-sm font-bold text-ink-sub">
              요금 정보를 불러오는 중입니다.
            </div>
          )}

          {!loading && hasNoServices && (
            <div className="rounded-2xl border border-error/30 bg-white p-10 text-center">
              <p className="text-sm font-bold text-error">
                요금 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
              </p>
              <button
                type="button"
                onClick={refetch}
                className="mt-4 rounded-lg border border-line px-5 py-2.5 text-sm font-medium text-ink transition hover:bg-surface-card"
              >
                다시 시도
              </button>
            </div>
          )}

          {!loading &&
            !error &&
            filteredServices.map((service) => (
              <section key={service.key} className="mb-16">
                {/* 섹션 헤더(3921:7075 실측) */}
                <div className="flex flex-col items-start justify-center">
                  <div className="flex items-center gap-3 py-2 pr-8 lg:py-5 lg:pr-12">
                    <h2
                      id={`plan-group-label-${service.key}`}
                      className="text-[1.375rem] font-semibold leading-[1.25rem] tracking-[-0.02em] text-ink lg:text-[2rem] lg:tracking-[-0.04rem]"
                    >
                      {service.name}
                    </h2>
                    <img
                      src={sectionArrow}
                      alt=""
                      aria-hidden="true"
                      className="h-6 w-[1.4375rem] lg:h-[2.5rem] lg:w-[2.396rem]"
                    />
                  </div>
                  {service.desc && (
                    <p className="w-full pr-3 text-[0.875rem] font-medium leading-[1.4] text-ink-sub lg:text-[1.25rem] lg:tracking-[-0.025rem]">
                      {service.desc}
                    </p>
                  )}
                </div>

                <div
                  role="radiogroup"
                  aria-labelledby={`plan-group-label-${service.key}`}
                  className="mt-6 space-y-2 lg:mt-[1.5625rem] lg:space-y-3"
                >
                  {service.products.map((product, index) => {
                    const isSelected = selected[service.key] === product.id;
                    const hasDiscount =
                      Number(product.listPrice) > Number(product.price);
                    const hasSelectionInGroup = Boolean(selected[service.key]);
                    const isRovingTabStop = hasSelectionInGroup
                      ? isSelected
                      : index === 0;
                    // 할인율은 하드코딩하지 않고 정가/판매가로 계산한다(팀 리드 지시).
                    const discountPct = hasDiscount
                      ? Math.round(
                          (1 -
                            Number(product.price) / Number(product.listPrice)) *
                            100,
                        )
                      : 0;

                    return (
                      // biome-ignore lint/a11y/useSemanticElements: handleRadioKeyDown이 구현한 roving tabindex + 방향키 이동 라디오그룹이다. 결제 상품 선택 UI라 input 전환의 리스크(로직 재검증 + 시각 회귀)를 감수하지 않는다 — 별도 QA 필요.
                      <button
                        type="button"
                        key={product.id}
                        role="radio"
                        aria-checked={isSelected}
                        tabIndex={isRovingTabStop ? 0 : -1}
                        onClick={() => toggle(service.key, product.id)}
                        onKeyDown={(e) =>
                          handleRadioKeyDown(
                            e,
                            service.key,
                            service.products,
                            index,
                          )
                        }
                        className="flex w-full items-center justify-between gap-4 rounded-2xl border border-line bg-white px-4 py-4 text-left transition hover:border-ink-sub lg:px-8 lg:py-7"
                      >
                        <span className="flex min-w-0 flex-1 items-center gap-3 lg:items-start lg:gap-5">
                          {/* 체크박스 — TODO(design): 시안 두 후보(checkbox-24 /
                              checkbox-24-checked)가 둘 다 회색 배경 + 흰 체크라
                              선택 상태 시각 구분이 시안에 없다. 선택 시 배경만
                              primary(#013262)로 바꾼 변형(checkbox-24-selected.svg)
                              은 팀 리드 판단이며 시안 근거가 아니다. */}
                          <img
                            src={
                              isSelected ? checkboxSelected : checkboxUnselected
                            }
                            alt=""
                            aria-hidden="true"
                            className="size-6 shrink-0"
                          />
                          <span className="break-keep text-[1rem] font-medium leading-[1.3] tracking-[-0.02em] text-ink lg:text-[1.5rem] lg:tracking-[-0.03rem]">
                            {product.name}
                          </span>
                          {product.recommended && (
                            <span className="flex h-[1.375rem] shrink-0 items-center justify-center rounded-md bg-primary px-2 text-[0.75rem] font-medium text-white lg:h-[1.9375rem] lg:w-[3.25rem] lg:text-[1rem]">
                              추천
                            </span>
                          )}
                        </span>

                        <span className="flex shrink-0 flex-col items-end gap-1">
                          {hasDiscount ? (
                            <>
                              <span className="whitespace-nowrap text-[0.875rem] font-normal tracking-[-0.02em] text-line lg:text-[1.25rem] lg:tracking-[-0.025rem]">
                                {formatKRW(product.listPrice)}
                              </span>
                              <span className="flex items-center gap-2">
                                <span className="whitespace-nowrap text-[0.75rem] font-medium text-error lg:text-[1rem]">
                                  {discountPct}% 할인
                                </span>
                                <span className="whitespace-nowrap text-[1rem] font-medium tracking-[-0.02em] text-ink lg:text-[1.5rem] lg:tracking-[-0.03rem]">
                                  {formatKRW(product.price)}
                                </span>
                              </span>
                            </>
                          ) : (
                            <span className="whitespace-nowrap text-[1rem] font-medium tracking-[-0.02em] text-ink lg:text-[1.5rem] lg:tracking-[-0.03rem]">
                              {formatKRW(product.price)}
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* 안내문(시안 3921:7066 실측) — 목표관리·수행평가에만(플랜 2개
                    이상인 서비스에만) 나타난다. 콜멘토는 플랜이 1개뿐이라 이
                    조건 하나로 자연스럽게 빠진다(예외 분기 아님). */}
                {service.products.length > 1 && (
                  <p className="mt-4 text-[0.875rem] font-medium leading-[1.4] text-ink-sub">
                    {SINGLE_PLAN_NOTICE}
                  </p>
                )}
              </section>
            ))}
        </div>
      </main>

      {/* 하단 고정 요약 + CTA — 시안 노드 없음(선택 화면 하단 요약은 이 화면
          범위 밖). 기존 구현의 톤(ParentCheckout.jsx 결제 금액 섹션과 동일한
          판매가/할인/총액 dl + 버튼)을 유지한다. */}
      {selectedItems.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white shadow-[0_-0.375rem_1.5rem_rgba(13,27,42,0.08)]">
          <div className="mx-auto flex w-full max-w-content flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-8">
            <dl className="flex items-center gap-6 text-[0.875rem] font-medium leading-[1.25rem] text-ink">
              {discountTotal > 0 && (
                <div>
                  <dt className="text-ink-sub">할인 금액</dt>
                  <dd className="text-primary">-{formatKRW(discountTotal)}</dd>
                </div>
              )}
              <div>
                <dt className="text-ink-sub">총 결제 금액</dt>
                <dd className="text-[1.125rem] font-semibold">
                  {formatKRW(subtotal)}
                </dd>
              </div>
            </dl>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className={`w-full shrink-0 rounded-xl py-3.5 text-[0.875rem] font-semibold leading-[1.25rem] transition sm:w-auto sm:px-8 ${
                canSubmit
                  ? "bg-primary text-white hover:brightness-125"
                  : "cursor-not-allowed border border-line bg-surface-card text-ink"
              }`}
            >
              {submitting ? "요청하는 중…" : "결제 요청"}
            </button>
          </div>
        </div>
      )}

      {/* 화면 2 — 실패 모달(시안 3921:7480) */}
      {showFailModal && (
        <ConfirmModal
          title="결제요청에 실패했습니다."
          onClose={() => setShowFailModal(false)}
        >
          {FAIL_MODAL_BODY}
        </ConfirmModal>
      )}

      {/* 서버 제출 실패(학부모 미연결 이외) — 일반 오류/중복 요청(WC043) 공용 모달. */}
      {submitError && (
        <ConfirmModal
          title={submitError.title}
          onClose={() => setSubmitError(null)}
        >
          {submitError.body}
        </ConfirmModal>
      )}
    </>
  );
}
