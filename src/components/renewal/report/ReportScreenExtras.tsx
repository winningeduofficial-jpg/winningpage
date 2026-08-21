import { useEffect } from "react";
import { SCREEN_EXTRAS } from "@/data/diagnosisScreenCopy";
import { templateCopy } from "@/lib/diagnosisCopyBinding";

/**
 * 확장 영역(F-04 · F-05) — A4 시트 2장 **아래**에 이어지는 문서형 부록.
 *
 * 왜 시트 밖인가(D1):
 *   시트 안에 큰 블록을 넣으면 report-responsive.css 의
 *   `margin-bottom: calc((var(--fd-sheet-scale) - 1) * 99.0588rem)` 보정이 어긋난다 —
 *   그 수식은 시트 실제 높이가 정확히 99.0588rem 이라는 전제 위에 있다.
 *   시트 안에는 '해당 섹션에 붙어야만 읽히는 1문단 각주'만 남기고, 덩어리는 전부 여기로 뺀다.
 *
 * QA 행 102(2026-08-20) — "PDF가 3페이지가 아니다"는 피드백의 진의는 이 부록(영역별 상세
 * 진단·맞춤 전략)을 PDF에 포함해달라는 것이었다. 그래서 이 섹션은 화면·인쇄 양쪽에서 항상
 * 렌더한다(더 이상 `fd-screen-only` 로 인쇄를 걷어내지 않는다) — `fd-print-page3` 훅으로
 * report-print.css 가 시트 2장 뒤 새 페이지에서 강제로 시작시킨다.
 * 주의 — `fd-screen-only` 는 이 섹션 전용이 아니라 AdmissionSection·RecommendServices·
 * ReportPageOne 등 다른 화면 전용 각주가 공유하는 클래스다. 그 각주들은 여전히 인쇄에서
 * 제외돼야 한다(길이가 길어 시트 여유를 넘긴다) — 그래서 이 섹션만 그 클래스를 떼고
 * `fd-print-page3` 하나로 인쇄 가시성을 진다(report-print.css 상단 주석 참고).
 * 이 서브트리 안의 `lg:` 값들은 인쇄(뷰포트 794px)에서 통째로 사라지므로 §7.5 의
 * "새 lg: 는 인쇄 훅과 함께" 규칙이 적용되지 않는다 — 개별 fd-* 훅을 덧붙이지 마라
 * (전부 각주·보조 설명 텍스트라 base 클래스만으로도 A4 폭 안에서 읽힌다).
 *
 * 시각 언어(2026-08-21 개정): 시트 1·2와 동일한 A4 용지 카드(흰 배경·동일 폭·동일 그림자).
 *   원래 D 결정은 "흰 카드 아님"이었으나 그 근거가 '인쇄는 2장뿐이라 3페이지처럼 읽히면
 *   안 된다'였다 — 행 102 재확인으로 부록이 실제 PDF 3페이지째부터 인쇄되면서 근거가
 *   소멸해 사용자 지시로 용지 시각으로 통일했다. 카드 시각은 데스크톱 전용(lg:)이라
 *   인쇄(뷰포트 794px, lg: 미적용) 페이지네이션에는 영향이 없다.
 *   아이콘 없음 · 중첩 카드 없음 · 접기는 페이지 전체에서 1개는 유지.
 *
 * 순서(학생의 질문 순서): 진단(무엇이 어떤 상태인가) → 긴급도(얼마나 급한가)
 *   → 전략(무엇부터 할까) → 고지(어디까지 믿을까).
 */

const { copy, rules } = SCREEN_EXTRAS;

type AreaDetailRow = {
  code: string;
  name: string;
  score?: number | string;
  status?: string;
  detail?: string;
};

type AreaDetailGroupProps = {
  title?: string;
  // exactOptionalPropertyTypes 대응 — 호출부가 `rows={possiblyUndefined}` 형태로 넘긴다.
  rows?: AreaDetailRow[] | undefined;
};

/** 영역별 상세 진단 소섹션(6행). detail 이 없는 행은 렌더하지 않는다 — 문구를 창작하지 않는다. */
function AreaDetailGroup({ title, rows }: AreaDetailGroupProps) {
  const visible = (rows ?? []).filter((row) => row.detail);
  if (visible.length === 0) return null;

  return (
    <section className="mt-8">
      <h4 className="text-base font-semibold leading-normal text-ink">
        {title}
      </h4>

      <div className="mt-3">
        {visible.map((row) => (
          // 모바일: 세로 스택(영역명 … 62점 · 보통 / 문장). 데스크톱: 3열 그리드.
          // lg:contents 로 내부 래퍼를 걷어내 같은 DOM 하나로 두 레이아웃을 만든다.
          <div
            key={row.code}
            /*
             * 데스크톱 3열 폭은 실측으로 잡았다(Pretendard Variable, 16px). 결정문의
             * `8rem_5.5rem` 은 상태 칸이 모자라 '50점 · 보완 필요'가 문장 칸을 침범했다:
             *   영역명 최장 '학습 피드백' = 73.0px  → 7rem(112px), 여유 39.0px
             *   상태  최장 '100점 · 보완 필요' = 114.7px → 7.5rem(120px), 여유 5.3px
             * 상태 문자열은 4종(page1)·4종(page2) 고정이라 위 최장값이 곧 상한이다.
             * 두 소섹션이 각각 별개 grid 라 auto 를 쓰면 행마다 열 폭이 달라진다 — 고정폭이어야
             * 12행이 한 줄로 정렬된다.
             */
            className="border-t border-[#e5e5e5] py-3 lg:grid lg:grid-cols-[7rem_7.5rem_1fr] lg:items-baseline lg:gap-x-4"
          >
            <div className="flex items-baseline gap-2 lg:contents">
              <span className="break-keep text-base font-medium leading-normal text-ink">
                {row.name}
              </span>
              {/*
                F-21 가드 — 점수·상태 라벨이 문장보다 **먼저** 읽히도록 왼쪽에 고정한다.
                낙관적인 문구가 나와도 '38점 · 취약'이 먼저 눈에 들어와 학생이 상충을 인지한다.
              */}
              <span className="ml-auto shrink-0 whitespace-nowrap text-base leading-normal text-ink-sub tabular-nums lg:ml-0">
                {row.score}점 · {row.status}
              </span>
            </div>
            <p className="mt-1 break-keep text-base leading-normal text-ink lg:mt-0">
              {row.detail}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

type StrategyGroupItem = {
  code: string;
  name: string;
  items: string[];
};

/** 맞춤 전략 한 묶음(영역 1개 × 4항목). ol 인 이유는 문구집 키가 '맞춤 전략 1~4'로 순번을 갖기 때문이다. */
function StrategyGroup({ group }: { group: StrategyGroupItem }) {
  return (
    <div>
      <h4 className="break-keep text-base font-semibold leading-normal text-ink">
        {group.name}
      </h4>
      <ol className="mt-3 flex list-decimal flex-col gap-2 ps-5 text-base leading-normal text-ink">
        {group.items.map((item) => (
          <li key={item} className="break-keep">
            {item}
          </li>
        ))}
      </ol>
    </div>
  );
}

type ReportScreenExtrasData = {
  areaDetails?: { page1?: AreaDetailRow[]; page2?: AreaDetailRow[] } | null;
  strategyGroups?: StrategyGroupItem[];
  urgency?: {
    level?: string;
    levelLabel?: string | null;
    score?: number;
    lowAreaCount?: number;
    areaThreshold?: number | string;
    message?: string | null;
  };
  notices?: {
    traitIntro?: string | null;
    hexCaption?: string | null;
    goalCompare?: string | null;
    reportBasis?: string | null;
    reportLimit?: string | null;
    probNote?: string | null;
    admissionNote?: string | null;
    serviceLimit?: string | null;
    skipNote?: string | null;
    sincerityBanner?: string | null;
    sincerityAct?: string | null;
  };
  typeTodos?: string[];
};

type ReportScreenExtrasProps = {
  data?: ReportScreenExtrasData | null;
};

export default function ReportScreenExtras({ data }: ReportScreenExtrasProps) {
  const { areaDetails, strategyGroups, urgency, notices, typeTodos } =
    data ?? {};

  // PDF에는 접힌 토글을 열 손이 없다 — window.print() 직전(beforeprint)에 접힌
  // fd-strategy-more 를 강제로 펼치고, 다이얼로그가 닫히면 원복한다. CDP printToPDF 처럼
  // beforeprint 가 안 오는 경로는 report-print.css 의 ::details-content 해제가 커버한다.
  useEffect(() => {
    const opened = new Set<HTMLDetailsElement>();
    const before = () => {
      document
        .querySelectorAll<HTMLDetailsElement>("details.fd-strategy-more:not([open])")
        .forEach((d) => {
          d.setAttribute("open", "");
          opened.add(d);
        });
    };
    const after = () => {
      opened.forEach((d) => d.removeAttribute("open"));
      opened.clear();
    };
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, []);

  const detailRows = rules.showAreaDetails ? areaDetails : null;
  const hasAreaDetails =
    (detailRows?.page1?.some((row) => row.detail) ?? false) ||
    (detailRows?.page2?.some((row) => row.detail) ?? false);

  const groups = strategyGroups ?? [];
  const focusGroups = groups.slice(0, rules.strategyFocusCount);
  const restGroups = groups.slice(rules.strategyFocusCount);

  // 긴급도 한 줄. 라벨이 없으면(판정 실패) 줄 자체를 만들지 않는다 — 숫자만 남은 문장을 내지 않는다.
  // lowAreaCount 가 0 이면 ' · ' 뒤 절을 뗀다(템플릿은 하나로 유지하고 자르기만 한다).
  // urgencyLine 템플릿은 항상 " · " 구분자 1개를 포함한다는 계약(위 주석) — 튜플로 단언.
  const [urgencyHead, urgencyTail] = copy.urgencyLine.split(" · ") as [
    string,
    string,
  ];
  const urgencyLine = urgency?.levelLabel
    ? urgencyHead.replace("{level}", urgency.levelLabel) +
      // undefined > 0 은 기존에도 false로 평가되던 값이라 ?? 0 은 동일 동작을 명시한 것.
      ((urgency.lowAreaCount ?? 0) > 0
        ? ` · ${urgencyTail
            .replace("{threshold}", String(urgency.areaThreshold))
            .replace("{count}", String(urgency.lowAreaCount))}`
        : "")
    : null;

  // F-15 — 불성실 판정이면 '급하다'(긴급도)와 '판단이 어렵다'(성실도)가 한 화면에서 모순되므로
  // 배타로 둔다. 성실도 문구가 이긴다(점수 해석 자체에 유보를 걸어야 한다).
  const strategyLead = notices?.sincerityAct ?? urgencyLine;

  const hasStrategies = focusGroups.length > 0;
  const hasNotice = Boolean(notices?.reportLimit);
  // F-03 — 유형별 '먼저 할 일' 3항목. 판정 불가·직선응답이면 빈 배열이라 자리가 접힌다.
  const hasTodos = Array.isArray(typeTodos) && typeTodos.length > 0;

  // 실을 것이 하나도 없으면(판정 불가 등) 섹션을 통째로 만들지 않는다 — 빈 제목만 남기지 않는다.
  if (
    !hasAreaDetails &&
    !hasStrategies &&
    !strategyLead &&
    !hasNotice &&
    !hasTodos
  )
    return null;

  const page1Title =
    templateCopy("card_exec.title") ?? copy.areaDetailTitle.page1;

  return (
    <section
      // fd-print-page3 — QA 행 102: 이 부록을 인쇄에도 항상 포함한다(더 이상 fd-screen-only
      // 로 걷어내지 않는다). 시트 2장(fd-report-sheet)과 이어 붙지 않고 항상 새 페이지에서
      // 시작하도록 report-print.css 가 이 훅으로 break-before 를 강제한다.
      className="fd-print-page3 w-full max-w-280 px-4 lg:w-280 lg:bg-white lg:p-perf-inset lg:shadow-[0_0_1.25rem_rgba(0,0,0,0.06)]"
      aria-label={copy.sectionTitle}
    >
      <h2 className="text-[1.5rem] font-semibold leading-[1.4] text-primary">
        {copy.sectionTitle}
      </h2>

      {/* ── 블록 A — 영역별 상세 진단 12행(AREA_COPY.levels) ── */}
      {hasAreaDetails && (
        <section>
          <h3 className="mt-12 text-[1.25rem] font-semibold leading-[1.4] text-accent lg:mt-16">
            {copy.areaDetailTitle.section}
          </h3>
          {/*
            skipNote 는 조건부다(리커트를 건너뛴 학생만). 영역 점수를 12개 나열하는 바로 이
            블록이 그 문장이 실제로 작용하는 자리라 여기 둔다 — 차트 옆에 붙이면 두 번 반복해야 한다.
            기본 픽스처에서는 보이지 않으니 '배선 누락'으로 오판하지 마라.
          */}
          {notices?.skipNote && (
            <p className="mt-4 text-base leading-normal text-ink-sub">
              {notices.skipNote}
            </p>
          )}
          <AreaDetailGroup title={page1Title} rows={detailRows?.page1} />
          <AreaDetailGroup
            title={copy.areaDetailTitle.page2}
            rows={detailRows?.page2}
          />
        </section>
      )}

      {/* ── 블록 B — 긴급도 한 줄 + 맞춤 전략(AREA_COPY.strategies) ── */}
      {(strategyLead || hasStrategies || hasTodos) && (
        <section>
          <h3 className="mt-12 text-[1.25rem] font-semibold leading-[1.4] text-accent lg:mt-16">
            {copy.strategyTitle}
          </h3>
          {strategyLead && (
            <p className="mt-4 text-base leading-normal text-ink-sub">
              {strategyLead}
            </p>
          )}

          {/*
            F-03 배선(2026-08-13) — TYPE_COPY.todos 3항목('먼저 할 일')을 리드 문장 다음이자 아래
            전략 그리드 **앞**에 싣는다. 유형 기반 과제(3)가 영역 기반 전략(12)보다 상위 서사라
            순서가 그렇다(블록 제목을 '먼저 할 일'이 아니라 '맞춤 전략'으로 잡은 이유이기도 하다).
          */}
          {hasTodos && (
            <div className="mt-6">
              <h4 className="break-keep text-base font-semibold leading-normal text-ink">
                {copy.strategyTodosTitle}
              </h4>
              <ol className="mt-3 flex list-decimal flex-col gap-2 ps-5 text-base leading-normal text-ink">
                {typeTodos.map((item) => (
                  <li key={item} className="break-keep">
                    {item}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {hasStrategies && (
            <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-3 lg:gap-x-8 lg:gap-y-10">
              {focusGroups.map((group) => (
                <StrategyGroup key={group.code} group={group} />
              ))}
            </div>
          )}

          {restGroups.length > 0 && (
            // fd-strategy-more — PDF에서는 토글을 열 수 없으므로 인쇄에서 항상 펼친다:
            // ① report-print.css 가 ::details-content 의 content-visibility 를 강제 해제하고
            //    summary(보기 라벨)를 숨긴다. ② window.print() 경로는 beforeprint 에서 open
            //    속성을 켜고 afterprint 에 원복한다(구형 렌더러 폴백, 아래 useEffect).
            <details className="fd-strategy-more mt-10">
              <summary className="cursor-pointer py-2 text-base font-medium text-performance-reportHeading underline underline-offset-4 focus:outline-hidden focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
                {copy.strategyMoreLabel}
              </summary>
              {/* 접혀 있어도 DOM 에는 존재한다 — Ctrl+F 검색과 스크린리더 탐색이 그대로 된다. */}
              <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-3 lg:gap-x-8 lg:gap-y-10">
                {restGroups.map((group) => (
                  <StrategyGroup key={group.code} group={group} />
                ))}
              </div>
            </details>
          )}
        </section>
      )}

      {/* ── 블록 D — 해석 한계 고지 ── */}
      {hasNotice && (
        <section>
          {/*
            reportBasis(산출 근거)는 2페이지 하단에 이미 인쇄되고 있다 — 건드리지 않는다.
            reportLimit(해석 한계)만 여기 둔다. 화면 스크롤상 시트2 각주 → 이 블록 순으로
            연달아 읽혀 쌍이 유지되면서, 인쇄 여유(2p 52.6px)를 1px 도 쓰지 않는다.
            새 고지가 생기면 먼저 의미상 소속 섹션을 찾아라 — 여기에 몰아넣지 않는다.
          */}
          <h3 className="mt-12 text-[1.25rem] font-semibold leading-[1.4] text-accent lg:mt-16">
            {copy.noticeTitle}
          </h3>
          <p className="mt-4 max-w-180 break-keep text-base leading-[1.6] text-ink">
            {/* hasNotice가 true인 분기이므로 notices?.reportLimit은 항상 truthy(동작 동일). */}
            {notices?.reportLimit}
          </p>
        </section>
      )}

      {/* reportBasis(산출 근거 고지) — 원래 2페이지 하단 각주였으나 부록이 인쇄에 포함되면서
          문서의 끝이 여기로 바뀌어 구분선째 이동했다(사용자 지시, 2026-08-21). 문서 전체에
          걸리는 신뢰성 고지라 항상 마지막에 한 번만 나온다. */}
      {notices?.reportBasis && (
        <p className="fd-mt-report-basis mt-12 border-t border-[#e5e5e5] pt-3 text-sm leading-[1.4] text-ink-sub lg:mt-16">
          {notices.reportBasis}
        </p>
      )}
    </section>
  );
}
