import type { ReactNode } from "react";
import { Link } from "react-router";
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
  kind: "link" | "outline" | "solid";
  label: string;
  href: string;
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

// 목표관리만 실제 앱(/app/goal) 진입이 가능하고, 나머지는 아직 개인화된 대시보드 라우트가
// 없어 서비스 소개 페이지로 보낸다. 무료진단 "다시 검사하기"는 설문 진입 라우트로 별도 처리.
function programLink(serviceName: string) {
  if (serviceName.includes("목표관리")) return "/app/goal";
  const matched = SERVICE_INTRO_ROUTES.find((route) => route.test(serviceName));
  return matched ? matched.href : "/services";
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

function toViewModel(parsed: ParsedOrder): ServiceCardViewModel {
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

  const statusLabel = isOngoing
    ? totalCount
      ? `잔여 ${totalCount}회`
      : "이용중"
    : "이용완료";

  // 카테고리별 메타 한 줄(좌/우) — 시안이 서비스 성격마다 다른 정보를 보여주므로 분기한다.
  let metaLeft = "-";
  let metaRight = "-";
  if (category === "session") {
    metaLeft = totalCount ? `${totalCount}회권` : "-";
    metaRight = isOngoing
      ? validityDays
        ? `유효기간 ${validityDays}일`
        : "-"
      : formatDateSpaced(paidAt);
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
    metaRight = isOngoing
      ? remainingDays !== null
        ? `${remainingDays}일 남음`
        : "-"
      : "만료";
  }

  const href = programLink(serviceName);

  let actions: ServiceCardAction[];
  if (isOngoing) {
    const label = category === "session" ? "상담 기록 보기" : "프로그램 가기";
    actions = [{ kind: "link", label, href }];
  } else if (category === "diagnosis") {
    actions = [
      { kind: "outline", label: "결과 리포트 보기", href },
      {
        kind: "solid",
        label: "다시 검사하기",
        href: "/app/learning-diagnosis/survey",
      },
    ];
  } else if (category === "session") {
    actions = [
      { kind: "outline", label: "상담 기록 보기", href },
      { kind: "solid", label: "다시 이용하기", href: "/pricing" },
    ];
  } else {
    // 기간형 서비스의 완료 카드는 시안 예시가 없어 무료진단/콜멘토 패턴을 참고한 추정 문구다.
    actions = [
      { kind: "outline", label: "이용 내역 보기", href },
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
  };
}

// 빈 상태(3762:20041) — 결제한 서비스가 없을 때. 문구·버튼 라벨은 시안 스크린샷 실측.
function EmptyState() {
  return (
    <div className="flex min-h-[20rem] flex-col items-center justify-center gap-[1.5rem] rounded-[1.25rem] bg-surface-04 px-[2rem] py-[4rem] text-center">
      <p className="text-[1rem] leading-[1.5] text-ink-sub">
        아직 결제한 서비스가 없어요
      </p>
      <Link
        to="/pricing"
        className="inline-flex h-[3rem] items-center justify-center rounded-[0.75rem] bg-primary px-[2rem] text-[0.9375rem] font-semibold text-white transition hover:bg-primary/90"
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
    <section className="flex flex-col gap-[2.5rem]">
      <h2 className="text-[1.5rem] font-semibold leading-[1.3] tracking-[-0.03rem] text-ink">
        {title} <span className="text-accent">{count}</span>
      </h2>
      <div className="grid grid-cols-1 gap-[1.25rem] sm:grid-cols-2 lg:grid-cols-3">
        {children}
      </div>
    </section>
  );
}

export default function MyServicesTab({ orders = [] }: { orders?: Order[] }) {
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

  if (!usableOrders.length) {
    return <EmptyState />;
  }

  const cards = usableOrders.map((order) => toViewModel(parseOrder(order)));
  const ongoing = cards.filter((card) => card.isOngoing);
  const completed = cards.filter((card) => !card.isOngoing);

  return (
    <div className="flex flex-col gap-[6.25rem]">
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
