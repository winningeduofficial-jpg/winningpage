import { type ReactNode, useEffect, useState } from "react";
import { Link } from "react-router";
import {
  checkDiagnosisAccess,
  type DiagnosisAccessResult,
} from "@/lib/diagnosisAccess";
import {
  SURVEY_FIRST_STEP_PATH,
  SURVEY_REPORT_PATH,
} from "@/lib/renewalSurvey";
import {
  type BundleGrantSpecRow,
  useBundleGrantSpecMap,
} from "./bundleComposition";
import ServiceCard from "./ServiceCard";

/**
 * 마이페이지 "나의 서비스" 탭 — Figma hsokTD6OilcNEXyCR24sn4
 * (카드 상태: 노드 3762:18713 / 빈 상태: 노드 3762:20041).
 *
 * 이 서브에이전트 세션에는 Figma MCP 도구가 직접 붙지 않아, 팀리더가 대신 조회한
 * get_design_context 실측치 + 시안 스크린샷(1920px)을 근거로 구현했다. 픽셀 완벽 재현이
 * 목표가 아니라는 지침에 따라 세부는 재량으로 채웠다.
 *
 * ── 데이터 유도 규칙 (스키마에 이용권 기간/횟수 전용 컬럼이 없어 문자열 파싱에 의존) ──
 * orders.order_name 은 "[기간·횟수] 서비스명" 형태로 저장된다.
 *   예) '[12개월] 위닝 목표관리', '[3개월 6회 이용권] 위닝 AI수행평가'
 *   (src/lib/entitlement.js getMockPaidOrders 참고 — MyPage.jsx가 orders 테이블에서 읽는
 *   컬럼 형태(id, order_name, amount, paid_at)와 맞춘 목업이 실제 스키마의 유일한 근거다.)
 * 대괄호 안에서 "N개월"·"N회"를 정규식으로 뽑아
 *   - 이용기간 종료일 = paid_at + N개월
 *   - 유효기간(일)  = 종료일 − paid_at
 *   - "N회권" 표기는 부여된 총 횟수다. 실제 사용 횟수를 차감하는 컬럼이 없어 시안의
 *     "1회 사용 / 3회권" 같은 사용분수 표기는 재현하지 못하고 총 횟수만 최선으로 보여준다.
 * 개월 정보가 없으면 종료일을 알 수 없으므로 "이용 완료"로 잘못 분류하지 않기 위해 기본값을
 * "이용 중"으로 둔다(단, 무료진단처럼 원래 즉시 완료되는 서비스는 카테고리로 예외 처리한다).
 * 정식 스키마(entitlement_months / entitlement_count 컬럼 등)가 생기면 이 파싱을 걷어내고
 * 그 값을 직접 써야 한다.
 *
 * ── 한 주문에 여러 상품이 담긴 경우(order_items.length > 1) ──
 * order_name은 "대표 상품명 외 N건"으로 요약돼 있어(buildOrderNameFromItems 계열) 그대로
 * 쓰면 QA 지적대로 무슨 서비스가 묶였는지 알 수 없다. order_items가 2건 이상이면 order_name
 * 대신 항목별로 카드를 쪼갠다(expandOrder) — 단, order_items.name은 products.name 스냅샷
 * 그대로라 대괄호 기간·회차 표기가 없으므로, 쪼갠 카드는 기간 파싱 없이(months=null) 위
 * "개월 정보 없음" 폴백(기본 이용 중, 메타 '-')과 같은 경로를 그대로 탄다.
 *
 * ── 서비스명 → 표시 형식 분류 ──
 * 시안은 서비스 성격에 따라 메타 정보·하단 액션 문구가 다르다(콜멘토=세션형, 무료진단=1회성
 * 리포트형, 그 외=기간형). 서비스명 키워드로 분류하는 휴리스틱이며 실제 서비스 카탈로그
 * 컬럼이 생기면 그쪽을 정본으로 바꿔야 한다.
 */

const DURATION_BRACKET_RE = /^\[(.+?)\]\s*(.+)$/;
const MONTHS_RE = /(\d+)\s*개월/;
const COUNT_RE = /(\d+)\s*회/;
const MS_PER_DAY = 86400000;

type Order = {
  id: string;
  order_name?: string | null;
  paid_at?: string | null;
  status?: string | null;
  is_fake_entitlement?: boolean;
  order_items?: { name: string; product_id?: string | null }[] | null;
};

type ServiceCategory = "session" | "diagnosis" | "duration";

type ParsedOrder = {
  id: string;
  serviceName: string;
  category: ServiceCategory;
  months: number | null;
  totalCount: number | null;
  paidAt: Date | null;
  endDate: Date | null;
  remainingDays: number | null;
  validityDays: number | null;
  isOngoing: boolean;
  progressPercent: number;
};

type ServiceCardAction = {
  kind: "link" | "outline-solid" | "solid";
  label: string;
  href: string;
  disabled?: boolean;
  disabledReason?: string;
};

type ServiceCardViewModel = {
  id: string;
  serviceName: string;
  statusLabel: string;
  isOngoing: boolean;
  progressPercent: number;
  metaLeft: string;
  metaRight: string;
  actions: ServiceCardAction[];
  /** 같은 서비스로 묶인 주문 건수. 2건 이상이면 카드에 "결제 N건" 표기. */
  paymentCount: number;
};

// 서비스명 키워드 → 소개 페이지 라우트(src/App.jsx 등록 기준).
const SERVICE_INTRO_ROUTES: {
  test: (name: string) => boolean;
  href: string;
}[] = [
  { test: (name) => name.includes("목표관리"), href: "/services/goal" },
  { test: (name) => name.includes("콜멘토"), href: "/services/callmentor" },
  {
    test: (name) => name.includes("수행평가"),
    href: "/services/performance",
  },
  {
    test: (name) => name.includes("자기평가"),
    href: "/services/self-assessment",
  },
  { test: (name) => name.includes("심화탐구"), href: "/services/research" },
  {
    test: (name) => name.includes("진단"),
    href: "/services/learning-diagnosis",
  },
];

function addMonths(date: Date, months: number) {
  const result = new Date(date.getTime());
  result.setMonth(result.getMonth() + months);
  return result;
}

// "YYYY.MM.DD" — 기간형 서비스의 이용기간 범위 표기.
function formatDate(date: Date | null) {
  if (!date) return "-";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}.${m}.${d}`;
}

// "YYYY. MM. DD" — 완료일 단독 표기(시안의 무료진단/콜멘토 완료 카드 날짜 형식).
function formatDateSpaced(date: Date | null) {
  if (!date) return "-";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}. ${m}. ${d}`;
}

// 'session'(콜멘토·멘토 상담) | 'diagnosis'(무료진단, 1회성 리포트) | 'duration'(그 외, 기간제).
function classifyService(serviceName: string): ServiceCategory {
  if (serviceName.includes("콜멘토") || serviceName.includes("멘토"))
    return "session";
  if (serviceName.includes("진단")) return "diagnosis";
  return "duration";
}

// 목표관리·수행평가는 실제 앱(/app/goal, /app/performance) 진입이 가능하고, 나머지는
// 아직 개인화된 대시보드 라우트가 없어 서비스 소개 페이지로 보낸다(수행평가 하드 전환
// 완료, performanceAppRoutes.tsx — /app/performance가 인덱스 경로). 무료진단
// "다시 검사하기"는 설문 진입 라우트로 별도 처리.
function programLink(serviceName: string) {
  if (serviceName.includes("목표관리")) return "/app/goal";
  if (serviceName.includes("수행평가")) return "/app/performance";
  const matched = SERVICE_INTRO_ROUTES.find((route) => route.test(serviceName));
  return matched ? matched.href : "/services";
}

// 번들 구성 권한(program_key) → order_name 대괄호 표기 합성 함수. 위 파서
// (DURATION_BRACKET_RE·MONTHS_RE·COUNT_RE)가 그대로 먹는 형태로 만들어 기존
// 단품 주문과 동일한 분류·표시 경로를 태운다(마이페이지 QA, 2026-09-01).
// diagnose는 부산 번들 구성이 항상 1회·30일 유효라 단품 diagnose-1 상품명
// ("[이용권] 위닝 학습진단", 20260821000004)을 그대로 재사용한다 — 진단
// 카테고리는 이 표기에서 개월/회차를 읽지 않으므로(paidAt 완료일만 표시)
// 지어낼 필요가 없다. target/suhaeng은 bundle_items 값(개월수·회차)을 그대로
// 대괄호에 담아 동적으로 조립한다.
const BUNDLE_ORDER_NAME_BY_PROGRAM_KEY: Record<
  string,
  (spec: BundleGrantSpecRow) => string
> = {
  diagnose: () => "[이용권] 위닝 학습진단",
  target: (spec) => `[${spec.duration_months}개월] 위닝 목표관리`,
  suhaeng: (spec) => {
    const parts: string[] = [];
    if (spec.duration_months) parts.push(`${spec.duration_months}개월`);
    if (spec.session_quota) parts.push(`${spec.session_quota}회`);
    return `[${parts.join(" ")}] 위닝 수행평가`;
  },
};

// order_items가 2건 이상인 주문(여러 상품을 한 번에 결제한 경우)은 order_name이
// "대표 상품명 외 N건"으로 뭉개져 있어 항목별로 쪼갠다. 1건 이하면 기존 order_name
// 파싱 경로를 그대로 쓴다 — order_items가 정확히 1건일 때는 order_name의 대괄호
// 기간 표기가 그 1건에 대한 것이라 그대로 유지해야 정보 손실이 없다.
//
// 다만 그 1건이 번들 상품(bundle_items를 가진 product_id)이면 order_name은
// "9,900원 부산캠퍼스 특별할인 학습관리 서비스" 하나뿐이라 이 규칙대로 두면
// 카드 1장 + classifyService 미매칭으로 빠진다(마이페이지 QA). bundleSpecs가
// 있으면 구성 권한 수만큼 가상 항목으로 먼저 전개한다.
function expandOrder(order: Order, bundleSpecs: BundleGrantSpecRow[]): Order[] {
  if (bundleSpecs.length > 0) {
    return bundleSpecs.map((spec) => {
      const build = BUNDLE_ORDER_NAME_BY_PROGRAM_KEY[spec.program_key];
      return {
        id: `${order.id}:${spec.program_key}`,
        // 매핑에 없는 program_key는 지어내지 않고 원본 order_name을 그대로
        // 둔다 — bundle_items 확장 시 새 program_key가 추가돼도 조용히
        // 틀린 표기를 보여주지 않는다.
        order_name: build ? build(spec) : (order.order_name ?? null),
        paid_at: order.paid_at ?? null,
        status: order.status ?? null,
        is_fake_entitlement: order.is_fake_entitlement ?? false,
      };
    });
  }

  const items = order.order_items;
  if (!items || items.length <= 1) return [order];
  return items.map((item, index) => ({
    id: `${order.id}:${index}`,
    order_name: item.name,
    paid_at: order.paid_at ?? null,
    status: order.status ?? null,
    is_fake_entitlement: order.is_fake_entitlement ?? false,
  }));
}

function parseOrder(order: Order): ParsedOrder {
  const rawName = String(order?.order_name || "").trim();
  const bracketMatch = rawName.match(DURATION_BRACKET_RE);
  // DURATION_BRACKET_RE의 두 캡처그룹은 옵셔널(`?`)이 아니라 매치 성공 시 항상 존재한다.
  const durationSpec = bracketMatch ? bracketMatch[1]! : "";
  const serviceName = bracketMatch
    ? bracketMatch[2]!.trim()
    : rawName || "이용권";
  const category = classifyService(serviceName);

  const monthsMatch = durationSpec.match(MONTHS_RE);
  const countMatch = durationSpec.match(COUNT_RE);
  const months = monthsMatch ? Number(monthsMatch[1]) : null;
  const totalCount = countMatch ? Number(countMatch[1]) : null;

  const paidAtRaw = order?.paid_at ? new Date(order.paid_at) : null;
  const paidAt =
    paidAtRaw && !Number.isNaN(paidAtRaw.getTime()) ? paidAtRaw : null;
  const endDate = paidAt && months ? addMonths(paidAt, months) : null;

  const now = new Date();
  const remainingDays = endDate
    ? Math.ceil((endDate.getTime() - now.getTime()) / MS_PER_DAY)
    : null;
  const validityDays =
    endDate && paidAt
      ? Math.round((endDate.getTime() - paidAt.getTime()) / MS_PER_DAY)
      : null;

  // 기간을 알 수 없는 주문은 기본적으로 "이용 중"으로 두지만, 무료진단은 원래 결제 즉시
  // 리포트가 나오는 1회성 서비스라 기간 개념 자체가 없다 — 이 경우는 항상 완료로 취급한다.
  let isOngoing = remainingDays === null ? true : remainingDays > 0;
  if (category === "diagnosis" && months === null) isOngoing = false;

  let progressPercent = 0;
  if (!isOngoing) {
    progressPercent = 100;
  } else if (paidAt && endDate) {
    const totalMs = endDate.getTime() - paidAt.getTime();
    const elapsedMs = now.getTime() - paidAt.getTime();
    progressPercent =
      totalMs > 0 ? Math.min(100, Math.max(0, (elapsedMs / totalMs) * 100)) : 0;
  }

  return {
    id: order?.id,
    serviceName,
    category,
    months,
    totalCount,
    paidAt,
    endDate,
    remainingDays,
    validityDays,
    isOngoing,
    progressPercent,
  };
}

// 학습진단 재검사 문구 — SurveyStepShell 진입 게이트 alert(QA 행 27 안내문)와 톤을 맞춘다.
const DIAGNOSIS_RETAKE_BLOCKED_REASON =
  "1회 이용권을 모두 사용했습니다. 이용권을 구매하시면 다시 이용하실 수 있습니다.";

function toViewModel(
  parsed: ParsedOrder,
  diagnosisAccess: DiagnosisAccessResult | null,
  paymentCount: number,
): ServiceCardViewModel {
  const {
    category,
    serviceName,
    totalCount,
    paidAt,
    endDate,
    remainingDays,
    validityDays,
    isOngoing,
  } = parsed;

  const statusLabel = (() => {
    if (!isOngoing) return "이용완료";
    if (totalCount) return `잔여 ${totalCount}회`;
    return "이용중";
  })();

  // 카테고리별 메타 한 줄(좌/우) — 시안이 서비스 성격마다 다른 정보를 보여주므로 분기한다.
  let metaLeft = "-";
  let metaRight = "-";
  if (category === "session") {
    metaLeft = totalCount ? `${totalCount}회권` : "-";
    metaRight = (() => {
      if (!isOngoing) return formatDateSpaced(paidAt);
      if (validityDays) return `유효기간 ${validityDays}일`;
      return "-";
    })();
    if (!isOngoing)
      metaLeft = totalCount ? `총 ${totalCount}회 이용` : "이용 완료";
  } else if (category === "diagnosis") {
    metaLeft = "진단 완료";
    metaRight = formatDateSpaced(paidAt);
  } else {
    metaLeft =
      paidAt || endDate
        ? `${formatDate(paidAt)} ~ ${formatDate(endDate)}`
        : "-";
    metaRight = (() => {
      if (!isOngoing) return "만료";
      if (remainingDays !== null) return `${remainingDays}일 남음`;
      return "-";
    })();
  }

  const href = programLink(serviceName);

  let actions: ServiceCardAction[];
  if (isOngoing) {
    const label = category === "session" ? "상담 기록 보기" : "프로그램 가기";
    actions = [{ kind: "link", label, href }];
  } else if (category === "diagnosis") {
    // fail-open 정책 유지 — 조회 전(null)이거나 서버가 판정 불가면 활성 상태로 둔다.
    // 서버가 명시적으로 allowed:false를 준 경우에만 비활성화한다.
    const retakeBlocked = diagnosisAccess !== null && !diagnosisAccess.allowed;
    actions = [
      {
        kind: "outline-solid",
        label: "결과 리포트 보기",
        href: SURVEY_REPORT_PATH,
      },
      retakeBlocked
        ? {
            kind: "solid",
            label: "다시 검사하기",
            href: SURVEY_FIRST_STEP_PATH,
            disabled: true,
            disabledReason: DIAGNOSIS_RETAKE_BLOCKED_REASON,
          }
        : {
            kind: "solid",
            label: "다시 검사하기",
            href: SURVEY_FIRST_STEP_PATH,
          },
    ];
  } else if (category === "session") {
    actions = [
      { kind: "outline-solid", label: "상담 기록 보기", href },
      { kind: "solid", label: "다시 이용하기", href: "/pricing" },
    ];
  } else {
    // 기간형 서비스의 완료 카드는 시안 예시가 없어 무료진단/콜멘토 패턴을 참고한 추정 문구다.
    actions = [
      { kind: "outline-solid", label: "이용 내역 보기", href },
      { kind: "solid", label: "다시 신청하기", href: "/pricing" },
    ];
  }

  return {
    id: parsed.id,
    serviceName,
    statusLabel,
    isOngoing,
    progressPercent: parsed.progressPercent,
    metaLeft,
    metaRight,
    actions,
    paymentCount,
  };
}

// 같은 서비스를 여러 주문으로 보유한 경우 카드를 1장으로 합친다(QA 행247). 그룹 키는
// parseOrder가 이미 대괄호 기간 표기를 걷어내고 뽑아둔 serviceName — expandOrder로
// 쪼갠 order_items 항목도 order_name 그대로 파싱되므로 동일 서비스면 같은 키로 모인다.
function pickRepresentativeOrder(group: ParsedOrder[]): ParsedOrder {
  const activeOrders = group.filter((order) => order.isOngoing);
  const candidates = activeOrders.length > 0 ? activeOrders : group;
  return candidates.reduce((latest, order) => {
    const latestPaidAt = latest.paidAt?.getTime() ?? 0;
    const orderPaidAt = order.paidAt?.getTime() ?? 0;
    return orderPaidAt > latestPaidAt ? order : latest;
  });
}

function groupOrdersByService(
  parsedOrders: ParsedOrder[],
): { representative: ParsedOrder; paymentCount: number }[] {
  const groups = new Map<string, ParsedOrder[]>();
  for (const order of parsedOrders) {
    const group = groups.get(order.serviceName);
    if (group) {
      group.push(order);
    } else {
      groups.set(order.serviceName, [order]);
    }
  }
  return Array.from(groups.values()).map((group) => ({
    representative: pickRepresentativeOrder(group),
    paymentCount: group.length,
  }));
}

// 빈 상태(3762:20041) — 결제한 서비스가 없을 때. 문구·버튼 라벨은 시안 스크린샷 실측.
function EmptyState() {
  return (
    <div className="flex min-h-80 flex-col items-center justify-center gap-6 rounded-perf-modal bg-surface-04 px-8 py-16 text-center">
      <p className="text-[1rem] leading-normal text-ink-sub">
        아직 결제한 서비스가 없어요
      </p>
      <Link
        to="/pricing"
        className="inline-flex h-12 items-center justify-center rounded-xl bg-primary px-8 text-[0.9375rem] font-semibold text-white transition hover:bg-primary/90"
      >
        서비스 이용하러 가기
      </Link>
    </div>
  );
}

// 섹션 제목~카드 그리드 간격 40px, 섹션 간 간격 100px — get_design_context 실측.
function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-10">
      <h2 className="text-[1.5rem] font-semibold leading-[1.3] tracking-[-0.03rem] text-ink">
        {title} <span className="text-accent">{count}</span>
      </h2>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {children}
      </div>
    </section>
  );
}

export default function MyServicesTab({ orders = [] }: { orders?: Order[] }) {
  // "다시 검사하기" 활성 여부 판정 — 서버가 정본(diagnosisAccess.ts 참고). 조회 전엔
  // null(활성 취급)로 두고, 응답이 오면 완료 카드의 재검사 버튼에 반영한다.
  const [diagnosisAccess, setDiagnosisAccess] =
    useState<DiagnosisAccessResult | null>(null);

  useEffect(() => {
    let alive = true;
    checkDiagnosisAccess().then((result) => {
      if (alive) setDiagnosisAccess(result);
    });
    return () => {
      alive = false;
    };
  }, []);

  // 상위(MyPage)는 표시·환불 판정을 위해 waiting_deposit(가상계좌 미입금) 주문도 함께
  // 내려준다. 하지만 이용 권한은 결제 확정(paid) 시점에만 부여된다(api/confirm-payment.js
  // — 가상계좌는 계좌만 발급됐고 돈은 아직 안 들어왔으므로 권한을 주지 않는다). 여기서
  // 걸러내지 않으면 입금 전 주문이 "이용 중인 서비스"로 잘못 표시된다. 로컬 QA 전용
  // 가짜 이용권 주문(status 필드 없음)은 이 필터에 걸리지 않고 그대로 노출된다.
  // 상위(MyPage)는 신청 내역 표를 위해 pending/canceled/refunded 까지 내려준다
  // (2026-08-13). 이용 권한은 결제 확정(paid)에만 붙으므로 여기서 좁힌다 —
  // 예전에는 waiting_deposit 만 빼면 됐지만 이제 그 필터로는 부족하다.
  // 로컬 QA 가짜 주문(status 없음)은 그대로 통과시킨다.
  const usableOrders = orders.filter(
    (order) => order.status === "paid" || order.is_fake_entitlement,
  );

  // order_items가 정확히 1건인 주문만 번들 후보다(2건 이상이면 기존
  // 항목별 분리 경로를 쓴다 — 위 expandOrder 주석 참고).
  const soleProductId = (order: Order) =>
    order.order_items?.length === 1
      ? (order.order_items[0]?.product_id ?? null)
      : null;

  // 번들 상품의 구성 권한 원값 — expandOrder가 카드를 서비스별로 쪼개는 데
  // 쓴다. usableOrders 필터 전에 훅을 불러야 아래 조기 반환(EmptyState)과
  // 상관없이 항상 같은 순서로 호출된다(React hooks 규칙).
  const bundleProductIds = usableOrders.map(soleProductId).filter(Boolean);
  const bundleSpecMap = useBundleGrantSpecMap(bundleProductIds);

  if (!usableOrders.length) {
    return <EmptyState />;
  }

  const displayOrders = usableOrders.flatMap((order) =>
    expandOrder(order, bundleSpecMap.get(soleProductId(order) ?? "") ?? []),
  );
  const parsedOrders = displayOrders.map(parseOrder);
  const groupedOrders = groupOrdersByService(parsedOrders);
  const cards = groupedOrders.map(({ representative, paymentCount }) =>
    toViewModel(representative, diagnosisAccess, paymentCount),
  );
  const ongoing = cards.filter((card) => card.isOngoing);
  const completed = cards.filter((card) => !card.isOngoing);

  return (
    <div className="flex flex-col gap-25">
      {ongoing.length > 0 && (
        <Section title="이용 중인 서비스" count={ongoing.length}>
          {ongoing.map((card) => (
            <ServiceCard key={card.id} card={card} />
          ))}
        </Section>
      )}
      {completed.length > 0 && (
        <Section title="이용 완료된 서비스" count={completed.length}>
          {completed.map((card) => (
            <ServiceCard key={card.id} card={card} />
          ))}
        </Section>
      )}
    </div>
  );
}
