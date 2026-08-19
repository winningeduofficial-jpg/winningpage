import { Check, ChevronDown } from "lucide-react";
import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useNavigate, useSearchParams } from "react-router";
import checkboxUnselected from "@/assets/checkout/checkbox-24.svg";
import checkboxSelected from "@/assets/checkout/checkbox-24-selected.svg";
import sectionArrow from "@/assets/checkout/section-arrow-38.svg";
import ConfirmModal from "@/components/checkout/ConfirmModal";
import { CHECKOUT_AGREEMENTS } from "@/data/legalDocs";
import { formatKRW } from "@/data/pricingCatalog";
import { type ServiceProduct, useProducts } from "@/lib/products";
import { supabase } from "@/lib/supabase";
import { ANONYMOUS, getTossPayments } from "@/lib/toss";
import { useEnrollmentOrder } from "./useEnrollmentOrder";
import { usePaymentAgreementHistory } from "./usePaymentAgreementHistory";

// StudentEnrollmentRequest.tsx 와 동일 필터(목표관리/콜멘토/수행평가만 결제
// 카탈로그에 노출) — 정본 근거는 그 파일 상단 주석 참고, 여기서 반복하지 않는다.
const ALLOWED_SERVICE_KEYS = ["goal", "mentor", "suhaeng"];

interface CouponRow {
  id: string;
  title: string;
  discount: number;
  minAmount: number;
  validUntil: string | null;
  isActive: boolean;
  eligible: boolean;
  reason: string | null;
  ownerIsStudent: boolean | null;
  stackable: boolean;
}

type CodeFeedback =
  | { type: "not_found" }
  | { type: "ineligible"; reason: string | null };

interface SelectedItem {
  id: string;
  serviceKey: string;
  serviceName: string;
  name: string;
  listPrice: number;
  price: number;
}

// 학부모 — 결제 요청 수락 + 결제 화면. 두 진입 모드를 하나의 라우트에서 갈라 받는다
// (?order=<id> 유무). 학생이 fn_request_enrollment 로 만든 요청(StudentEnrollmentRequest.jsx
// 참고)을 학부모가 여기서 수락(fn_respond_enrollment)하고, 반환된 서버 확정 금액으로만
// 토스 결제창을 연다 — 표시가는 항상 미리보기일 뿐이다(핸들러 주석 참고).
//
// ※ 이 화면은 카트를 갖지 않는다 — 예전 /checkout(Checkout.jsx)의 "학부모가 직접
//   장바구니를 담아 결제"하는 경로는 여기서 만들지 않는다(제품 규칙 확정 — 학생이
//   요청하고 학부모가 수락+결제한다, StudentEnrollmentRequest.jsx:13-21 주석과 짝).
//   ?order= 없이 들어오면 그 사실 자체를 안내하는 모달만 보여주고 마이페이지로 보낸다.

const PAY_METHODS: {
  key: string;
  label: string;
  tossMethod: "CARD" | "VIRTUAL_ACCOUNT";
}[] = [
  { key: "tosspay", label: "토스페이", tossMethod: "CARD" },
  { key: "card", label: "신용/체크카드", tossMethod: "CARD" },
  { key: "virtual", label: "가상계좌", tossMethod: "VIRTUAL_ACCOUNT" },
];

// MyPage 섹션 헤딩(ParentPaymentsTab.tsx 등)과 위계를 맞추기 위해 반응형 확대를
// 의도적으로 제거했다(사용자 확정, 2026-08-19) — sm:2rem 이면 h1과 같은 크기가 된다.
const SECTION_HEADING =
  "text-[1.5rem] font-semibold leading-[1.3] tracking-[-0.02em] text-ink";

// Checkout.jsx(src/pages/Checkout.jsx) 의 쿠폰 사유 문구·코드 미발견 문구를 그대로
// 재사용한다 — 같은 fn_usable_coupons/fn_coupon_by_code 반환 형태를 쓰는 화면이라
// 사유 코드 7종·안내 문구가 동일하다(코퍼스 재사용, 신규 문구 아님).
const COUPON_REASON_TEXT: Record<string, string> = {
  below_min_amount: "최소 결제 금액에 미치지 않습니다.",
  expired: "사용 기한이 지났습니다.",
  already_used: "이미 사용한 쿠폰입니다.",
  inactive: "사용할 수 없는 쿠폰입니다.",
  login_required: "로그인 후 사용할 수 있습니다.",
  sold_out: "발급 수량이 모두 소진되었습니다.",
  not_granted: "발급받지 않은 쿠폰입니다.",
};
const CODE_NOT_FOUND_TEXT = "유효하지 않은 쿠폰 코드입니다.";
// Checkout.jsx:184 와 동일 문구(표시가/서버 청구가 불일치 안내) — fn_respond_enrollment 가
// skipped_coupon_ids 를 돌려줄 때도 같은 상황(서버가 쿠폰 일부를 조용히 스킵)이라
// 그대로 재사용한다.
const AMOUNT_MISMATCH_TEXT =
  "결제 금액이 변경되었습니다. 쿠폰 적용 내용을 다시 확인해 주세요.";

// 신규 문구(이 화면 전용, 사용자 승인 대기) — new_copy 배열 참고.
const LOAD_FAILED_TEXT = "결제 요청 정보를 불러오지 못했습니다.";
const MISSING_ORDER_ITEM_TEXT =
  "일부 신청 상품 정보를 불러오지 못했어요. 새로고침 후 다시 시도해 주세요.";
const ALREADY_PROCESSED_TEXT = "이미 처리된 결제 요청입니다.";
const NOT_PARENT_TEXT = "학부모 본인만 진행할 수 있는 결제 요청이에요.";
// 고정 계약 상수 목록의 승인된 재사용 문구 — 신규 아님.
const GENERIC_FAIL_TEXT = "결제요청에 실패했습니다.";

// fn_usable_coupons/fn_coupon_by_code 공통 반환 형태(owner_profile_id/owner_is_student
// 포함 — dev pg_proc 실측). code 는 P1-1 하드닝 이후 반환되지 않는다(Checkout.jsx:149 주석과 동일).
function mapCouponRow(c: {
  id: string;
  title: string;
  discount_amount: number;
  min_amount?: number | null;
  valid_until: string | null;
  is_active: boolean;
  eligible: boolean;
  reason: string | null;
  owner_is_student: boolean | null;
}): CouponRow {
  return {
    id: c.id,
    title: c.title,
    discount: c.discount_amount,
    minAmount: c.min_amount || 0,
    validUntil: c.valid_until,
    isActive: c.is_active,
    eligible: c.eligible,
    reason: c.reason,
    ownerIsStudent: c.owner_is_student,
    // fn_usable_coupons / fn_coupon_by_code 는 stackable 을 돌려주지 않는다 —
    // coupons 테이블에서 따로 읽어 아래 mergeStackable 로 채운다. 값을 모르는
    // 동안은 false(비중복)로 둔다. 보수적인 쪽이 맞다 — 중복 가능하다고
    // 잘못 보이면 화면 할인액이 서버보다 커져 사용자가 틀린 금액을 본다.
    stackable: false,
  };
}

// 서버(fn_respond_enrollment, sql/71)의 쿠폰 적용 규칙
//   · stackable = false 끼리는 최고액 **1장만** 적용(v_best_nonstack_idx)
//   · stackable = true 는 전부 합산
// 화면이 이 규칙을 모르면 여러 장 체크한 합계를 보여주고, 서버는 1장만
// 적용해 결제 직전에 금액이 바뀐다(skipped_coupon_ids → amountMismatch 는
// 이미 결제 버튼을 누른 뒤의 사후 경고다). 그래서 선택 단계에서부터 같은
// 규칙을 적용한다.
//
// stackable 은 coupons 테이블에서 직접 읽는다 — `coupons public read`
// (is_active = true, sql/10)로 열려 있어 마이그레이션이 필요 없다.
function mergeStackable(
  rows: CouponRow[],
  stackableById: Record<string, boolean>,
): CouponRow[] {
  return rows.map((row) => ({
    ...row,
    stackable: stackableById[row.id] === true,
  }));
}

// 상품 변경 경로(hasChanged)의 토스 주문명 — api/request-enrollment.ts 의
// buildOrderName 과 동일 규칙(첫 상품명 + 2개 이상이면 " 외 N건"). 원 주문의
// order_name 을 그대로 쓰면 실제로 결제하는 상품과 결제창 표기가 달라진다.
function buildOrderNameFromItems(items: SelectedItem[]) {
  if (items.length === 0) return "위닝에듀 서비스";
  const first = items[0]!.name || "위닝에듀 서비스";
  return items.length === 1 ? first : `${first} 외 ${items.length - 1}건`;
}

// fn_respond_enrollment 가 raise 하는 문구 키워드로 매핑한다 — SQLSTATE(WCxxx)는
// 보조로만 쓰고 원문(err.message)을 화면에 그대로 노출하지 않는다.
function mapRespondError(err: { message?: string } | null | undefined) {
  const msg = err?.message || "";
  if (msg.includes("not_order_parent")) return NOT_PARENT_TEXT;
  if (
    msg.includes("order_not_pending") ||
    msg.includes("enrollment_not_pending")
  ) {
    return ALREADY_PROCESSED_TEXT;
  }
  if (msg.includes("order_not_found")) return LOAD_FAILED_TEXT;
  return GENERIC_FAIL_TEXT;
}

// fn_parent_create_enrollment(상품 변경 결제 경로) 가 raise 하는 문구 키워드
// 매핑 — mapRespondError 와 같은 스타일. no_items_selected/pair_not_linked/
// invalid_products/invalid_amount 는 사용자가 원인을 구분해도 대응 행동이
// 없어(다시 선택하는 것뿐) 기존 GENERIC_FAIL_TEXT 로 뭉뚱그린다.
function mapCreateEnrollmentError(
  err: { message?: string } | null | undefined,
) {
  const msg = err?.message || "";
  if (msg.includes("not_order_parent")) return NOT_PARENT_TEXT;
  if (msg.includes("order_not_pending_for_override")) {
    return ALREADY_PROCESSED_TEXT;
  }
  if (msg.includes("order_not_found")) return LOAD_FAILED_TEXT;
  return GENERIC_FAIL_TEXT;
}

// 결제 약관 동의 체크박스 1행 — Figma 1882:10111 실측("[구매 전 안내사항]" /
// "결제 서비스 이용 약관, 개인정보 처리 동의", 둘 다 필수 + 펼침 화살표 +
// "위 내용을 모두 확인하였습니다."). 본문은 펼쳐야 보이는 아코디언 — 페이지
// 이동(AgreementRow, 가입 화면용)이 아니라 CHECKOUT_AGREEMENTS 상수를 그
// 자리에서 보여주는 방식으로 시안 화살표를 그대로 재현한다.
function AgreementCheckRow({
  label,
  body,
  checked,
  expanded,
  onToggleCheck,
  onToggleExpand,
}: {
  label: ReactNode;
  body: ReactNode;
  checked: boolean;
  expanded: boolean;
  onToggleCheck: () => void;
  onToggleExpand: () => void;
}) {
  return (
    <div className="rounded-xl border border-line">
      <div className="flex items-center gap-3 px-4 py-3.5">
        <label className="flex flex-1 cursor-pointer items-center gap-3 text-left">
          <input
            type="checkbox"
            checked={checked}
            onChange={onToggleCheck}
            className="sr-only"
          />
          <span
            aria-hidden="true"
            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition ${
              checked
                ? "border-primary bg-primary text-white"
                : "border-line bg-white text-transparent"
            }`}
          >
            <Check size={14} strokeWidth={3} />
          </span>
          <span className="text-[0.8125rem] text-ink">
            <span className="mr-1.5 font-semibold text-primary">필수</span>
            {label}
          </span>
        </label>
        <button
          type="button"
          aria-label={`${label} 본문 ${expanded ? "접기" : "펼치기"}`}
          onClick={onToggleExpand}
          className="shrink-0 rounded-sm p-1 text-ink-sub transition hover:bg-surface-04"
        >
          <ChevronDown
            size={18}
            className={`transition-transform ${expanded ? "rotate-180" : ""}`}
          />
        </button>
      </div>
      {expanded && (
        <div className="max-h-60 overflow-y-auto whitespace-pre-line break-keep border-t border-line px-4 py-3 text-[0.75rem] leading-relaxed text-ink-sub">
          {body}
        </div>
      )}
    </div>
  );
}

// ?order= 없는 진입 — 카트 결제 경로 자체가 없으므로 안내 후 마이페이지로 보낸다.
// 문구는 고정 계약이 지정한 기존 승인 문구를 그대로 쓴다(신규 아님).
function ApprovalOnlyGate() {
  const navigate = useNavigate();
  const goToMyPage = () => navigate("/mypage", { replace: true });

  return (
    <main className="min-h-screen bg-white pt-16">
      <ConfirmModal
        title="학생이 요청한 결제만 진행할 수 있어요"
        onConfirm={goToMyPage}
        onClose={goToMyPage}
      >
        학생이 결제를 요청하면 마이페이지에서 진행할 수 있어요.
      </ConfirmModal>
    </main>
  );
}

// 요청을 불러오지 못했거나(RLS/네트워크/삭제) 더 이상 진행할 수 없는 상태(이미
// 승인·반려됐거나 주문이 pending 이 아님)일 때 공통으로 쓰는 안내 화면.
function OrderNotActionable({ text }: { text: ReactNode }) {
  const navigate = useNavigate();
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-white pt-16 text-center">
      <p className="text-[1rem] font-semibold leading-[1.4] text-ink sm:text-[1.25rem]">
        {text}
      </p>
      <button
        type="button"
        onClick={() => navigate("/mypage")}
        className="mt-8 rounded-xl bg-primary px-8 py-3.5 text-[0.875rem] font-semibold leading-5 text-white transition hover:brightness-125"
      >
        마이페이지로 이동
      </button>
    </main>
  );
}

// ?order=<id> 진입 — 수락 + 결제 본문.
function EnrollmentCheckout({ orderId }: { orderId: string }) {
  const {
    order,
    orderItems,
    orderError,
    orderLoading,
    isResume,
    approvedOrder,
    setApprovedOrder,
  } = useEnrollmentOrder(orderId);

  const [coupons, setCoupons] = useState<CouponRow[]>([]);
  const [couponError, setCouponError] = useState(false);
  const [couponsLoaded, setCouponsLoaded] = useState(false);
  const [selectedCouponIds, setSelectedCouponIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [couponCode, setCouponCode] = useState("");
  const [stackableById, setStackableById] = useState<Record<string, boolean>>(
    {},
  );
  const [codeFeedback, setCodeFeedback] = useState<CodeFeedback | null>(null);
  const [amountMismatch, setAmountMismatch] = useState(false);

  const [paymentAgreed, setPaymentAgreed] = usePaymentAgreementHistory();
  const [checkedRefund, setCheckedRefund] = useState(false);
  const [checkedPayment, setCheckedPayment] = useState(false);
  const [expandedRefund, setExpandedRefund] = useState(false);
  const [expandedPayment, setExpandedPayment] = useState(false);

  const [payMethod, setPayMethod] = useState("card");
  const [loading, setLoading] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  // 카탈로그 — 학생이 이미 고른 상품을 학부모가 바꿀 수 있게(StudentEnrollmentRequest.tsx
  // 와 동일 패턴). productsLoading/productsError 로 이름을 바꿔 위 결제 loading
  // state 와 충돌하지 않게 한다.
  const {
    services,
    loading: productsLoading,
    error: productsError,
  } = useProducts();
  const filteredServices = useMemo(
    () => services.filter((s) => ALLOWED_SERVICE_KEYS.includes(s.key)),
    [services],
  );
  const hasNoServices = Boolean(productsError) || filteredServices.length === 0;

  // 서비스별 단일 선택: { [serviceKey]: productId }. 초기값은 orderItems(학생이
  // 이미 요청한 항목)에서 딱 한 번만 채운다 — orderItems 재조회로 이후 사용자
  // 선택을 덮어쓰면 안 된다.
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [initialized, setInitialized] = useState(false);
  useEffect(() => {
    if (initialized || orderItems.length === 0) return;
    const init: Record<string, string> = {};
    orderItems.forEach((item) => {
      if (item.service_key && item.product_id)
        init[item.service_key] = item.product_id;
    });
    setSelected(init);
    setInitialized(true);
  }, [initialized, orderItems]);

  function toggle(serviceKey: string, productId: string) {
    // 결제 승인(approvedOrder) 이후에는 실제 청구가 이미 고정됐으므로 화면
    // 표시도 더 이상 바뀌면 안 된다(BLOCK 1) — 표시와 청구 불일치 방지.
    if (approvedOrder) return;
    setSelected((prev) => {
      const next = { ...prev };
      if (next[serviceKey] === productId) delete next[serviceKey];
      else next[serviceKey] = productId;
      return next;
    });
  }

  // Escape = 그룹 선택 해제, 화살표 = 이동+선택 — StudentEnrollmentRequest.tsx
  // handleRadioKeyDown 과 동일 규약(그쪽 주석 참고, 반복 설명하지 않는다).
  function handleRadioKeyDown(
    e: KeyboardEvent<HTMLButtonElement>,
    serviceKey: string,
    products: ServiceProduct[],
    currentIndex: number,
  ) {
    // toggle 과 동일하게 승인 후에는 카탈로그를 잠근다(BLOCK 1).
    if (approvedOrder) return;
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
        listPrice: product.listPrice ?? 0,
        price: product.price ?? 0,
      });
    });
    return items;
  }, [filteredServices, selected]);

  // 상품 변경 여부 — 원래 orderItems 의 product_id 집합과 현재 선택이 다르면
  // fn_parent_create_enrollment(신규 주문 생성) 경로로 보낸다(handlePay 참고).
  const originalProductIds = useMemo(
    () => new Set(orderItems.map((i) => i.product_id).filter(Boolean)),
    [orderItems],
  );
  const currentProductIds = useMemo(
    () => new Set(selectedItems.map((i) => i.id)),
    [selectedItems],
  );
  const hasChanged = useMemo(() => {
    // selected 초기화가 끝나기 전엔 orderItems 와 카탈로그 로딩 타이밍이 어긋나
    // currentProductIds 가 일시적으로 비어 오탐(true)이 난다(WARN 6) — 초기화
    // 전에는 무조건 false.
    if (!initialized) return false;
    if (originalProductIds.size !== currentProductIds.size) return true;
    for (const id of currentProductIds)
      if (!originalProductIds.has(id)) return true;
    return false;
  }, [initialized, originalProductIds, currentProductIds]);

  // 상품이 바뀌면 새 주문은 쿠폰을 쓰지 않으므로(handlePay 분기) 이전에 골라둔
  // 쿠폰이 화면 금액 계산에 남아있으면 안 된다.
  useEffect(() => {
    if (hasChanged) setSelectedCouponIds(new Set());
  }, [hasChanged]);

  // 원 주문 상품이 그 사이 비활성화되거나 사라졌는지 확인한다(BLOCK 3) —
  // selected 초기화는 orderItems 의 product_id 를 그대로 넣지만, 라이브
  // 카탈로그(filteredServices, is_active=true 만)에서 찾지 못하면 selectedItems
  // 에서 조용히 빠져 학부모가 모르는 사이 일부 상품만 결제될 수 있다.
  const missingOrderItem = useMemo(() => {
    if (
      isResume ||
      productsLoading ||
      orderItems.length === 0 ||
      filteredServices.length === 0
    )
      return false;
    return orderItems.some(
      (item) =>
        !filteredServices.some((s) =>
          s.products.some((p) => p.id === item.product_id),
        ),
    );
  }, [isResume, productsLoading, orderItems, filteredServices]);

  const selectedListTotal = useMemo(
    () =>
      selectedItems.reduce(
        (s, i) => s + Number(i.listPrice || i.price || 0),
        0,
      ),
    [selectedItems],
  );
  const selectedSubtotal = useMemo(
    () => selectedItems.reduce((s, i) => s + Number(i.price || 0), 0),
    [selectedItems],
  );
  const selectedDiscount = Math.max(0, selectedListTotal - selectedSubtotal);

  // 쿠폰 목록 — subtotal 은 요청 시점 amount(쿠폰 미적용, Baseline fn_respond_enrollment
  // 주석 "v_subtotal := v_order.amount"). p_student_profile_id 를 반드시 넘겨야
  // granted 쿠폰(학생/학부모 발급분)이 잡힌다(Baseline pg_proc 실측 인자).
  const fetchCoupons = useCallback(
    async ({ signalAlive }: { signalAlive?: () => boolean } = {}) => {
      if (!order) return;
      const { data, error } = await supabase.rpc("fn_usable_coupons", {
        p_subtotal: order.amount,
        p_student_profile_id: order.student_profile_id,
      });
      if (signalAlive && !signalAlive()) return;
      setCouponsLoaded(true);
      if (error) {
        console.warn("쿠폰 조회 실패:", error.message);
        setCouponError(true);
        return;
      }

      // stackable 은 RPC 반환에 없어 카탈로그에서 함께 읽는다(위 mergeStackable).
      const { data: flags, error: flagError } = await supabase
        .from("coupons")
        .select("id, stackable")
        .eq("is_active", true);
      if (signalAlive && !signalAlive()) return;
      if (flagError)
        console.warn("쿠폰 중복 사용 여부 조회 실패:", flagError.message);

      const map: Record<string, boolean> = {};
      for (const row of flags || []) map[row.id] = row.stackable;
      setStackableById(map);

      setCouponError(false);
      setCoupons(mergeStackable((data || []).map(mapCouponRow), map));
    },
    [order],
  );

  useEffect(() => {
    if (!order || isResume) return undefined;
    let alive = true;
    fetchCoupons({ signalAlive: () => alive });
    return () => {
      alive = false;
    };
  }, [order, isResume, fetchCoupons]);

  const visibleCoupons = useMemo(
    () => coupons.filter((c) => c.isActive),
    [coupons],
  );
  const hasNoVisibleCoupons =
    couponsLoaded && !couponError && visibleCoupons.length === 0;
  const codeFeedbackReasonText =
    codeFeedback?.type === "ineligible" && codeFeedback.reason
      ? COUPON_REASON_TEXT[codeFeedback.reason]
      : undefined;

  const couponDiscount = useMemo(() => {
    if (!order) return 0;
    let sum = 0;
    coupons.forEach((c) => {
      if (selectedCouponIds.has(c.id) && c.eligible)
        sum += Number(c.discount || 0);
    });
    return Math.min(sum, order.amount);
  }, [coupons, selectedCouponIds, order]);

  // 표시가는 항상 미리보기다 — 실제 청구액은 fn_respond_enrollment/
  // fn_parent_create_enrollment 반환값(승인 이후엔 approvedOrder.amount)을 쓴다.
  // 상품을 바꾼 경로(hasChanged)는 새 주문이 쿠폰을 쓰지 않으므로 쿠폰 할인을
  // 반영하지 않는다(위 selectedCouponIds 리셋 effect 와 짝).
  const previewAmount = hasChanged
    ? selectedSubtotal
    : Math.max(0, (order?.amount ?? 0) - couponDiscount);
  const displayAmount = approvedOrder ? approvedOrder.amount : previewAmount;
  const displayListAmount = hasChanged
    ? selectedListTotal
    : (order?.list_amount ?? 0);
  const displayDiscountAmount = hasChanged
    ? selectedDiscount
    : (order?.discount_amount ?? 0);

  function toggleCoupon(id: string) {
    setAmountMismatch(false);
    setSelectedCouponIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        return next;
      }

      // 비중복 쿠폰을 새로 고르면 기존에 골라둔 비중복 쿠폰을 해제한다 —
      // 서버가 어차피 최고액 1장만 적용하므로(위 mergeStackable 주석) 화면도
      // 1장만 잡혀 있어야 금액이 일치한다. 중복 가능(stackable) 쿠폰은 건드리지
      // 않는다.
      if (stackableById[id] !== true) {
        for (const selectedId of prev) {
          if (stackableById[selectedId] !== true) next.delete(selectedId);
        }
      }

      next.add(id);
      return next;
    });
  }

  async function applyCouponCode() {
    if (!order) return;
    const code = couponCode.trim();
    if (!code) return;

    const { data, error } = await supabase.rpc("fn_coupon_by_code", {
      p_code: code,
      p_subtotal: order.amount,
      p_student_profile_id: order.student_profile_id,
    });
    if (error) {
      console.warn("쿠폰 코드 조회 실패:", error.message);
      setCouponError(true);
      return;
    }

    const found = data?.[0];
    if (!found) {
      setCodeFeedback({ type: "not_found" });
      return;
    }

    // 코드로 받은 쿠폰도 카탈로그의 stackable 을 그대로 적용한다. 카탈로그에
    // 없는 코드 전용 쿠폰이면 map 에 없어 false(비중복)로 떨어진다 — 보수적인
    // 쪽이 맞다(mapCouponRow 주석).
    setCoupons((prev) => [
      ...prev.filter((c) => c.id !== found.id),
      ...mergeStackable([mapCouponRow(found)], stackableById),
    ]);
    setSelectedCouponIds((prev) => {
      const next = new Set(prev);
      if (stackableById[found.id] !== true) {
        for (const selectedId of prev) {
          if (stackableById[selectedId] !== true) next.delete(selectedId);
        }
      }
      next.add(found.id);
      return next;
    });
    setAmountMismatch(false);
    setCodeFeedback(
      found.eligible ? null : { type: "ineligible", reason: found.reason },
    );
    setCouponCode("");
  }

  // 이미 동의 이력이 있으면(paymentAgreed===true) 체크박스 상태와 무관하게
  // 통과시킨다 — 재구매 화면에서는 체크박스 자체를 렌더하지 않는다(아래 JSX).
  const paymentTermsReady =
    paymentAgreed === true || (checkedRefund && checkedPayment);
  // 재개 모드(isResume)는 카탈로그 UI 자체를 렌더하지 않고 이미 승인이 끝난
  // 주문의 결제만 남았으므로, 라이브 카탈로그 파생값인 selectedItems 대신
  // orderItems 존재 여부로 판단한다(BLOCK 2) — 그래야 원 주문 상품이 그 사이
  // 비활성화되거나 카탈로그 조회가 실패해도 결제가 막히지 않는다.
  const hasSelection = isResume
    ? orderItems.length > 0
    : selectedItems.length > 0;
  const canPay =
    Boolean(order) &&
    !orderError &&
    hasSelection &&
    !loading &&
    paymentTermsReady &&
    !missingOrderItem;

  async function handlePay() {
    if (!canPay) return;
    // canPay가 Boolean(order)를 이미 검사하므로 도달 시 항상 non-null이다.
    if (!order) return;
    setLoading(true);
    setPayError(null);
    try {
      // 결제 약관 동의 기록(sql/78) — 실제 청구(fn_respond_enrollment·토스 호출)
      // 전에 먼저 확정한다. 여기서 실패하면 결제 자체를 진행하지 않는다.
      if (paymentAgreed !== true) {
        const { error: agreeError } = await supabase.rpc(
          "fn_agree_payment_terms",
        );
        if (agreeError) {
          console.error("결제 약관 동의 기록 실패:", agreeError.message);
          setPayError(GENERIC_FAIL_TEXT);
          setLoading(false);
          return;
        }
        setPaymentAgreed(true);
      }

      let result = approvedOrder;

      if (!result) {
        if (hasChanged) {
          // 상품을 바꾼 경로 — 원 주문을 그대로 승인하지 않고 새 주문을 만든다
          // (서버가 즉시 approved 로 확정, 원 주문은 자동 대체된다). 새 주문은
          // 쿠폰을 쓰지 않으므로 skipped_coupon_ids/amountMismatch 처리가 없다.
          const { data, error } = await supabase.rpc(
            "fn_parent_create_enrollment",
            {
              p_original_order_id: orderId,
              p_items: selectedItems.map((i) => ({ product_id: i.id })),
            },
          );
          if (error) {
            console.error("상품 변경 결제 요청 실패:", error.message);
            setPayError(mapCreateEnrollmentError(error));
            setLoading(false);
            return;
          }

          result = Array.isArray(data) ? data[0] : data;
          if (!result?.amount) {
            setPayError(GENERIC_FAIL_TEXT);
            setLoading(false);
            return;
          }
          setApprovedOrder(result);
        } else {
          // 클라이언트 rpc(학부모 JWT) — service_role 경유 금지(Baseline fn_respond_enrollment
          // 는 auth.uid() = parent_profile_id 를 직접 검사한다).
          const { data, error } = await supabase.rpc("fn_respond_enrollment", {
            p_order_id: orderId,
            p_approve: true,
            p_reject_reason: null,
            p_coupon_ids: Array.from(selectedCouponIds),
          });
          if (error) {
            console.error("결제 요청 수락 실패:", error.message);
            setPayError(mapRespondError(error));
            setLoading(false);
            return;
          }

          result = Array.isArray(data) ? data[0] : data;
          if (!result?.amount) {
            setPayError(GENERIC_FAIL_TEXT);
            setLoading(false);
            return;
          }
          setApprovedOrder(result);

          if ((result.skipped_coupon_ids || []).length > 0) {
            setAmountMismatch(true);
          }
        }
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData?.session ?? null;
      const user = session?.user ?? null;

      const method =
        PAY_METHODS.find((m) => m.key === payMethod)?.tossMethod || "CARD";
      const tossPayments = await getTossPayments();
      const payment = tossPayments.payment({
        customerKey: user?.id ?? ANONYMOUS,
      });

      const commonPaymentParams = {
        amount: { currency: "KRW" as const, value: Number(result.amount) },
        orderId: result.order_id || orderId,
        orderName: hasChanged
          ? buildOrderNameFromItems(selectedItems)
          : order.order_name || "위닝에듀 서비스",
        successUrl: `${window.location.origin}/payment/success`,
        failUrl: `${window.location.origin}/payment/fail`,
        customerEmail: user?.email ?? null,
      };

      if (method === "VIRTUAL_ACCOUNT") {
        await payment.requestPayment({
          method,
          ...commonPaymentParams,
          virtualAccount: {
            cashReceipt: { type: "소득공제" },
            validHours: 24,
          },
        });
      } else {
        await payment.requestPayment({
          method,
          ...commonPaymentParams,
          card: {
            useEscrow: false,
            flowMode: "DEFAULT",
            useCardPoint: false,
            useAppCardOnly: false,
          },
        });
      }
    } catch (err) {
      if (err?.code !== "USER_CANCEL") {
        console.error("결제 요청 실패:", err);
        setPayError(GENERIC_FAIL_TEXT);
      }
      setLoading(false);
    }
  }

  if (orderLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white pt-16">
        <p className="text-[0.875rem] font-medium text-ink-sub">
          결제 요청 정보를 불러오는 중입니다.
        </p>
      </main>
    );
  }

  if (orderError === "not_found") {
    return <OrderNotActionable text={LOAD_FAILED_TEXT} />;
  }
  if (orderError === "not_actionable") {
    return <OrderNotActionable text={ALREADY_PROCESSED_TEXT} />;
  }
  // orderLoading=false && orderError=null 인 경로는 위 useEffect에서 항상
  // setOrder(data)를 거친다 — 여기 도달하면 order는 non-null이다.
  if (!order) return null;

  return (
    <main className="min-h-screen bg-white pt-16">
      {/* 콘텐츠 폭 규약 — Checkout.jsx:517-529 주석과 동일한 전역 관용구
          (mx-auto w-full max-w-content px-5 sm:px-8). */}
      <div className="mx-auto w-full max-w-content px-5 py-14 sm:px-8">
        {/* MyPage h1(text-[2rem], 반응형 확대 없음)과 위계를 맞췄다(사용자 확정,
            2026-08-19) — 기존 sm:3.125rem 은 MyPage 대비 지나치게 컸다. */}
        <h1 className="mb-12 text-[2rem] font-semibold leading-[1.3] tracking-[-0.02em] text-ink">
          결제하기
        </h1>

        <div className="grid grid-cols-1 gap-12 desktop:grid-cols-[minmax(0,1fr)_25rem]">
          {/* 좌측: 주문 상품 — 재개 모드(isResume)는 이미 승인이 끝난 주문이라
              읽기 전용 카드만 보여준다(fn_parent_create_enrollment 는 애초에
              approval_status='requested' 인 주문만 받는다). 그 외에는 학생 화면
              (StudentEnrollmentRequest.tsx)과 동일한 카탈로그 선택 UI를 보여주고
              초기 선택을 학생이 요청한 상품으로 프리체크한다(위 selected 초기화
              effect). */}
          <section>
            {isResume ? (
              <>
                <h2 className={`mb-5 ${SECTION_HEADING}`}>
                  주문 상품 {orderItems.length}
                </h2>
                <div className="space-y-3">
                  {orderItems.map((item) => {
                    const hasDiscount =
                      Number(item.list_price) > Number(item.price);
                    return (
                      <div
                        key={item.id}
                        className="rounded-2xl border border-line p-5"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <p className="text-[0.875rem] font-medium leading-[1.3] tracking-[-0.02em] text-ink">
                            {item.name}
                          </p>
                          <div className="flex shrink-0 flex-col items-end">
                            {hasDiscount && (
                              <span className="text-[0.75rem] font-medium leading-5 tracking-[-0.02em] text-line line-through">
                                {formatKRW(item.list_price)}
                              </span>
                            )}
                            <span className="text-[0.8125rem] font-medium leading-5 tracking-[-0.02em] text-ink">
                              {formatKRW(item.price)}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <>
                <h2 className={`mb-5 ${SECTION_HEADING}`}>주문 상품</h2>

                {productsLoading && (
                  <div className="rounded-2xl border border-line bg-white p-10 text-center text-sm font-bold text-ink-sub">
                    요금 정보를 불러오는 중입니다.
                  </div>
                )}

                {!productsLoading && hasNoServices && (
                  <div className="rounded-2xl border border-error/30 bg-white p-10 text-center">
                    <p className="text-sm font-bold text-error">
                      요금 정보를 불러오지 못했습니다. 잠시 후 다시 시도해
                      주세요.
                    </p>
                  </div>
                )}

                {!productsLoading &&
                  !productsError &&
                  filteredServices.map((service) => (
                    <div key={service.key} className="mb-10 last:mb-0">
                      <div className="flex items-center gap-3">
                        <h3
                          id={`plan-group-label-${service.key}`}
                          className="text-[1.375rem] font-semibold leading-5 tracking-[-0.02em] text-ink"
                        >
                          {service.name}
                        </h3>
                        <img
                          src={sectionArrow}
                          alt=""
                          aria-hidden="true"
                          className="h-6 w-5.75"
                        />
                      </div>
                      {service.desc && (
                        <p className="mt-1 w-full text-[0.875rem] font-medium leading-[1.4] text-ink-sub">
                          {service.desc}
                        </p>
                      )}

                      <div
                        role="radiogroup"
                        aria-labelledby={`plan-group-label-${service.key}`}
                        className="mt-6 space-y-2"
                      >
                        {service.products.map((product, index) => {
                          const isSelected =
                            selected[service.key] === product.id;
                          const hasDiscount =
                            Number(product.listPrice) > Number(product.price);
                          const hasSelectionInGroup = Boolean(
                            selected[service.key],
                          );
                          const isRovingTabStop = hasSelectionInGroup
                            ? isSelected
                            : index === 0;
                          const discountPct = hasDiscount
                            ? Math.round(
                                (1 -
                                  Number(product.price) /
                                    Number(product.listPrice)) *
                                  100,
                              )
                            : 0;

                          return (
                            // biome-ignore lint/a11y/useSemanticElements: handleRadioKeyDown이 구현한 roving tabindex + 방향키 이동 라디오그룹이다(StudentEnrollmentRequest.tsx와 동일 규약).
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
                              className="flex w-full items-center justify-between gap-4 rounded-2xl border border-line bg-white px-4 py-4 text-left transition hover:border-ink-sub"
                            >
                              <span className="flex min-w-0 flex-1 items-center gap-3">
                                <img
                                  src={
                                    isSelected
                                      ? checkboxSelected
                                      : checkboxUnselected
                                  }
                                  alt=""
                                  aria-hidden="true"
                                  className="size-6 shrink-0"
                                />
                                <span className="break-keep text-[1rem] font-medium leading-[1.3] tracking-[-0.02em] text-ink">
                                  {product.name}
                                </span>
                                {product.recommended && (
                                  <span className="flex h-5.5 shrink-0 items-center justify-center rounded-md bg-primary px-2 text-[0.75rem] font-medium text-white">
                                    추천
                                  </span>
                                )}
                              </span>

                              <span className="flex shrink-0 flex-col items-end gap-1">
                                {hasDiscount ? (
                                  <>
                                    <span className="whitespace-nowrap text-[0.875rem] font-normal tracking-[-0.02em] text-line">
                                      {formatKRW(product.listPrice)}
                                    </span>
                                    <span className="flex items-center gap-2">
                                      <span className="whitespace-nowrap text-[0.75rem] font-medium text-error">
                                        {discountPct}% 할인
                                      </span>
                                      <span className="whitespace-nowrap text-[1rem] font-medium tracking-[-0.02em] text-ink">
                                        {formatKRW(product.price)}
                                      </span>
                                    </span>
                                  </>
                                ) : (
                                  <span className="whitespace-nowrap text-[1rem] font-medium tracking-[-0.02em] text-ink">
                                    {formatKRW(product.price)}
                                  </span>
                                )}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
              </>
            )}
          </section>

          {/* 우측: 결제수단/쿠폰/금액 — Checkout.jsx 아래쪽 aside 와 같은 골격. */}
          <aside className="mx-auto w-full max-w-142.5 space-y-10">
            {/* 구매 전 확인사항(환불 규정) — sql/78 refund_notice. 이미 동의
                이력이 있으면(재구매 등) 섹션 자체를 감춘다. */}
            {paymentAgreed === false && (
              <div>
                <h3 className={`mb-4 ${SECTION_HEADING}`}>구매 전 확인사항</h3>
                <AgreementCheckRow
                  label="위 내용을 모두 확인하였습니다."
                  body={CHECKOUT_AGREEMENTS.purchaseNotice}
                  checked={checkedRefund}
                  expanded={expandedRefund}
                  onToggleCheck={() => setCheckedRefund((prev) => !prev)}
                  onToggleExpand={() => setExpandedRefund((prev) => !prev)}
                />
              </div>
            )}

            <div>
              <h3 className={`mb-4 ${SECTION_HEADING}`}>결제 수단 선택</h3>
              <div className="mx-auto grid max-w-40 grid-cols-1 gap-2 sm:max-w-none sm:grid-cols-3">
                {PAY_METHODS.map((m) => (
                  <button
                    type="button"
                    key={m.key}
                    onClick={() => setPayMethod(m.key)}
                    className={`h-11 rounded-lg border text-[0.875rem] font-medium leading-5 transition ${
                      payMethod === m.key
                        ? "border-primary bg-surface-info text-primary"
                        : "border-line text-ink-sub hover:bg-surface-card"
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              {/* 결제 서비스 이용약관 + 결제 관련 개인정보 수집·이용 동의 —
                  sql/78 payment_terms·payment_consent, 한 체크박스로 묶어
                  동의 처리한다(CHECKOUT_AGREEMENTS.paymentAgreement 가 이미
                  두 문서를 이 순서로 이어붙인 텍스트다). */}
              {paymentAgreed === false && (
                <div className="mt-4">
                  <AgreementCheckRow
                    label="결제 서비스 이용 약관, 개인정보 처리 동의"
                    body={CHECKOUT_AGREEMENTS.paymentAgreement}
                    checked={checkedPayment}
                    expanded={expandedPayment}
                    onToggleCheck={() => setCheckedPayment((prev) => !prev)}
                    onToggleExpand={() => setExpandedPayment((prev) => !prev)}
                  />
                </div>
              )}
            </div>

            {/* 쿠폰 선택 — 재개 모드에서는 감춘다(위 isResume 주석). 상품을 바꾼
                경로(hasChanged)는 새 주문이 쿠폰을 쓰지 않으므로(handlePay
                fn_parent_create_enrollment 분기) 섹션 자체를 감춘다. */}
            {!isResume && !hasChanged && (
              <div>
                <h3 className={`mb-4 ${SECTION_HEADING}`}>쿠폰 선택</h3>
                <div className="flex gap-2">
                  <input
                    value={couponCode}
                    onChange={(e) => {
                      setCouponCode(e.target.value);
                      setCodeFeedback(null);
                    }}
                    onKeyDown={(e) => e.key === "Enter" && applyCouponCode()}
                    placeholder="쿠폰 코드 입력"
                    className="h-11 flex-1 rounded-lg border border-line px-3.5 text-[0.875rem] font-medium leading-5 text-ink placeholder:font-medium placeholder:text-line focus:border-primary"
                  />
                  <button
                    type="button"
                    onClick={applyCouponCode}
                    className="h-11 shrink-0 rounded-lg border border-line px-5 text-[0.875rem] font-medium leading-5 text-ink transition hover:bg-surface-card"
                  >
                    적용
                  </button>
                </div>

                {couponError && (
                  <p className="mt-3 text-[0.75rem] font-medium leading-[1.4] text-error">
                    쿠폰을 불러오지 못했습니다.
                  </p>
                )}

                {codeFeedback?.type === "not_found" && (
                  <p className="mt-3 text-[0.75rem] font-medium leading-[1.4] text-error">
                    {CODE_NOT_FOUND_TEXT}
                  </p>
                )}
                {codeFeedbackReasonText && (
                  <p className="mt-3 text-[0.75rem] font-medium leading-[1.4] text-error">
                    {codeFeedbackReasonText}
                  </p>
                )}

                {hasNoVisibleCoupons && (
                  <p className="mt-5 text-[0.875rem] font-normal leading-5 text-ink-sub">
                    보유한 쿠폰이 없습니다.
                  </p>
                )}

                {visibleCoupons.length > 0 && (
                  <>
                    <p className="mb-2 mt-5 text-[0.875rem] font-normal leading-5 text-ink">
                      보유 쿠폰 {visibleCoupons.length}장
                    </p>
                    <div className="space-y-2">
                      {visibleCoupons.map((c) => {
                        const eligible = c.eligible;
                        const isSelected = selectedCouponIds.has(c.id);
                        // 소유자 구분(신규) — fn_usable_coupons/fn_coupon_by_code 가 돌려주는
                        // owner_is_student 를 그대로 라벨링한다. auto 발급(둘 다 아님)은 null.
                        const ownerLabel =
                          c.ownerIsStudent === true
                            ? "학생 쿠폰"
                            : c.ownerIsStudent === false
                              ? "학부모 쿠폰"
                              : null;
                        const reasonText =
                          !eligible && c.reason
                            ? COUPON_REASON_TEXT[c.reason]
                            : undefined;
                        return (
                          <button
                            type="button"
                            key={c.id}
                            disabled={!eligible}
                            onClick={() => toggleCoupon(c.id)}
                            className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition ${
                              isSelected
                                ? "border-primary bg-surface-info"
                                : "border-line"
                            } ${eligible ? "" : "opacity-45"}`}
                          >
                            <span
                              className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border transition ${
                                isSelected
                                  ? "border-primary bg-primary"
                                  : "border-line bg-white"
                              }`}
                            >
                              {isSelected && (
                                <Check
                                  size={12}
                                  strokeWidth={3.5}
                                  className="text-white"
                                />
                              )}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center gap-1.5">
                                <span className="block truncate text-[0.75rem] font-medium leading-5 text-ink sm:text-[0.875rem]">
                                  {c.title}
                                </span>
                                {ownerLabel && (
                                  <span className="shrink-0 rounded-full bg-surface-card px-1.5 py-0.5 text-[0.625rem] font-medium leading-none text-ink-sub">
                                    {ownerLabel}
                                  </span>
                                )}
                              </span>
                              {c.validUntil && (
                                <span className="block text-[0.75rem] font-normal leading-[1.4] text-ink-sub">
                                  {String(c.validUntil).replace(/-/g, ".")}까지
                                </span>
                              )}
                              {reasonText && (
                                <span className="block text-[0.75rem] font-normal leading-[1.4] text-ink-sub">
                                  {reasonText}
                                </span>
                              )}
                            </span>
                            <span className="shrink-0 text-[0.75rem] font-medium leading-5 text-primary sm:text-[0.875rem]">
                              -{formatKRW(c.discount)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <div className="mt-2 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          setAmountMismatch(false);
                          setSelectedCouponIds(new Set());
                        }}
                        className="text-[0.875rem] font-normal leading-5 text-ink underline underline-offset-4 transition hover:brightness-90"
                      >
                        쿠폰 사용 안함
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {isResume && (
              // ⚠ 신규 카피 — 승인 필요. 쿠폰 섹션이 사라진 이유를 설명하지 않으면
              // 학부모는 "쿠폰을 못 쓰게 됐다"로 읽는다.
              <p className="rounded-xl bg-surface-04 px-4 py-3 text-[0.875rem] leading-relaxed text-ink-sub">
                이미 수락한 요청이에요. 적용한 쿠폰과 결제 금액은 그대로이고,
                결제만 진행하면 됩니다.
              </p>
            )}

            <div>
              <h3 className={`mb-4 ${SECTION_HEADING}`}>결제 금액</h3>
              <dl className="space-y-3 text-[0.875rem] font-medium leading-5 text-ink">
                <div className="flex justify-between">
                  <dt>판매가</dt>
                  <dd>{formatKRW(displayListAmount)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>할인 금액</dt>
                  <dd className="text-primary">
                    {displayDiscountAmount > 0
                      ? `-${formatKRW(displayDiscountAmount)}`
                      : formatKRW(0)}
                  </dd>
                </div>
                {couponDiscount > 0 && (
                  <div className="flex justify-between">
                    <dt>쿠폰 할인 금액</dt>
                    <dd className="text-primary">
                      -{formatKRW(couponDiscount)}
                    </dd>
                  </div>
                )}
                <div className="flex justify-between border-t border-line pt-3 text-[1rem] font-semibold leading-[1.4]">
                  <dt>총 결제 금액</dt>
                  <dd>{formatKRW(displayAmount)}</dd>
                </div>
              </dl>

              {missingOrderItem && (
                <p
                  aria-live="polite"
                  className="mt-4 text-[0.75rem] font-medium leading-[1.4] text-error"
                >
                  {MISSING_ORDER_ITEM_TEXT}
                </p>
              )}

              {amountMismatch && (
                <p
                  aria-live="polite"
                  className="mt-4 text-[0.75rem] font-medium leading-[1.4] text-error"
                >
                  {AMOUNT_MISMATCH_TEXT}
                </p>
              )}

              {payError && (
                <p
                  aria-live="polite"
                  className="mt-4 text-[0.75rem] font-medium leading-[1.4] text-error"
                >
                  {payError}
                </p>
              )}

              <button
                type="button"
                onClick={handlePay}
                disabled={!canPay}
                className={`mt-6 w-full rounded-xl py-4 text-[0.875rem] font-semibold leading-5 transition ${
                  canPay
                    ? "bg-primary text-white hover:brightness-125"
                    : "cursor-not-allowed border border-line bg-surface-card text-ink"
                }`}
              >
                {loading
                  ? "결제창 여는 중…"
                  : `${formatKRW(displayAmount)} 결제하기`}
              </button>
              <p className="mt-3 text-center text-[0.75rem] font-normal leading-[1.4] text-ink-sub">
                결제는 토스페이먼츠를 통해 안전하게 처리됩니다.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}

export default function ParentCheckout() {
  const [searchParams] = useSearchParams();
  const orderId = searchParams.get("order");

  if (!orderId) return <ApprovalOnlyGate />;
  return <EnrollmentCheckout orderId={orderId} />;
}
