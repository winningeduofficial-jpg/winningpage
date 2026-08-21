import { useEffect } from "react";
import { SCREEN_EXTRAS } from "@/data/diagnosisScreenCopy";
import { templateCopy } from "@/lib/diagnosisCopyBinding";
import ReportSheetA4 from "./ReportSheetA4";

/**
 * 확장 영역(F-04 · F-05) — A4 시트 3·4페이지. 영역별 상세 진단·맞춤 전략을 담는다.
 *
 * 2026-08-21 재구성(사용자 지시) — 종전에는 단일 flow 카드였다가, 인쇄에서 페이지 경계가
 * 데이터量에 따라 흘러 페이지 라벨을 못 넣었다. 지금은 시트 1·2와 똑같이 `ReportSheetA4` 를
 * 재사용한 두 장(page=3/4)이다 — 워터마크(data-watermark)·페이지 라벨·A4 카드 시각(화면
 * lg:bg-white 등)·인쇄 패딩(.fd-report-sheet 규칙)을 전부 공짜로 물려받는다. 시트끼리의
 * `.fd-report-sheet + .fd-report-sheet { break-before: page }` 형제 규칙이 시트2→3페이지·
 * 3→4페이지 경계도 그대로 커버해 `fd-print-page3` 같은 전용 훅이 더 필요 없다.
 *
 * 블록 배분(실측 기준, 2026-08-21):
 *   3페이지 — 영역별 상세 진단(블록 A, 인쇄 2단) + 맞춤 전략 도입부(긴급도·먼저 할 일) +
 *             focusGroups(3, 인쇄 3단). 실측 약 900px < 1122.5px(A4 1장) — 여유 충분.
 *   4페이지 — restGroups(9, 항상 펼침, 인쇄 3단) + 해석 한계 고지 + reportBasis(문서 끝).
 *             실측 약 600px < 1122.5px — 여유 충분.
 *   긴급도·먼저 할 일을 3페이지에 남긴 이유: '맞춤 전략' 절 도입부라 focusGroups 앞에 있어야
 *   자연스럽게 읽힌다(도입 문장이 4페이지로 밀리면 3페이지의 전략 그룹만 먼저 보이고 설명은
 *   한 장 넘어가야 나온다) — 그래도 3페이지가 예산을 넘기지 않아 그대로 뒀다.
 *
 * 이 서브트리 안의 `lg:` 값들은 인쇄(뷰포트 794px)에서 통째로 사라진다. 각주·보조 설명
 * 텍스트는 base 클래스만으로 A4 폭 안에서 읽히므로 훅이 필요 없다 — 원칙(2026-08-21 확정):
 * "인쇄 레이아웃 = 화면 lg 레이아웃 재현", report-print.css 전체가 따르는 기존 관례 그대로다.
 * 맞춤 전략(focusGroups·restGroups)은 화면 lg 자체가 다단(grid-cols-3)이라 그 값을
 * `fd-strategy-grid` 훅으로 그대로 복사한다. 영역별 상세 진단의 2단(`fd-area-groups`)은
 * PDF 페이지 압축 전용 결정이라 **인쇄에서만** 적용한다 — 화면(lg)은 세로 1단 그대로 둔다
 * (별도 커밋 "영역별 상세 진단 2단 배치를 PDF 전용으로 되돌림" 확정 유지, 이번 재구성에서도
 * 건드리지 않는다).
 *
 * 시각 언어(2026-08-21 개정): 시트 1·2와 동일한 A4 용지 카드. 원래 D 결정은 "흰 카드
 * 아님"이었으나 그 근거('인쇄는 2장뿐이라 3페이지처럼 읽히면 안 된다')가 부록이 실제 PDF
 * 3·4페이지로 인쇄되면서 소멸해 사용자 지시로 용지 시각으로 통일했다. 아이콘 없음 ·
 * 중첩 카드 없음 · 접기는 페이지 전체에서 1개는 유지.
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
            // fd-area-row — 그룹(단) 안에서 행 중간에 페이지가 끊기지 않도록
            // report-print.css 가 break-inside:avoid 를 건다.
            className="fd-area-row border-t border-[#e5e5e5] py-3 lg:grid lg:grid-cols-[7rem_7.5rem_1fr] lg:items-baseline lg:gap-x-4"
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
    // fd-strategy-item — 인쇄 3단 grid 안에서 묶음 중간에 열이 끊기지 않도록
    // report-print.css 가 break-inside:avoid 를 건다.
    <div className="fd-strategy-item">
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

/**
 * data → 부록 렌더에 필요한 조건을 한 번에 계산한다. `hasReportExtras()`(부모가 totalPages를
 * 정할 때 씀)와 이 컴포넌트의 렌더 분기가 반드시 같은 값을 봐야 하므로, 둘 다 이 함수 하나만
 * 부른다 — 판정 로직이 두 곳으로 갈라지는 사고를 원천 차단한다.
 */
function deriveExtrasFlags(data?: ReportScreenExtrasData | null) {
  const { areaDetails, strategyGroups, urgency, notices, typeTodos } =
    data ?? {};

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

  const hasAny =
    hasAreaDetails ||
    hasStrategies ||
    Boolean(strategyLead) ||
    hasNotice ||
    hasTodos;

  return {
    detailRows,
    hasAreaDetails,
    focusGroups,
    restGroups,
    strategyLead,
    hasStrategies,
    hasNotice,
    hasTodos,
    hasAny,
    notices,
    typeTodos,
    urgency,
  };
}

/**
 * 부록(3·4페이지)이 실제로 렌더될지 판정한다. FreeDiagnosisReport 가 totalPages(부록
 * 있으면 4, 없으면 2)를 정할 때 이 함수 하나만 부른다 — ReportScreenExtras 자신의 렌더
 * 분기와 반드시 같은 조건이어야 하므로 deriveExtrasFlags() 하나를 공유한다.
 */
export function hasReportExtras(data?: ReportScreenExtrasData | null) {
  return deriveExtrasFlags(data).hasAny;
}

type ReportScreenExtrasProps = {
  data?: ReportScreenExtrasData | null;
  totalPages: number;
};

export default function ReportScreenExtras({
  data,
  totalPages,
}: ReportScreenExtrasProps) {
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

  const {
    detailRows,
    hasAreaDetails,
    focusGroups,
    restGroups,
    strategyLead,
    hasStrategies,
    hasNotice,
    hasTodos,
    hasAny,
    notices,
    typeTodos,
  } = deriveExtrasFlags(data);

  // 실을 것이 하나도 없으면(판정 불가 등) 부록 자체를 만들지 않는다 — 빈 제목만 남기지 않는다.
  if (!hasAny) return null;

  const page1Title =
    templateCopy("card_exec.title") ?? copy.areaDetailTitle.page1;

  return (
    <>
      {/* 3페이지 — 영역별 상세 진단 + 맞춤 전략 도입부(긴급도·먼저 할 일) + focusGroups(3). */}
      <ReportSheetA4 page={3} totalPages={totalPages}>
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
            {/* fd-area-groups — 인쇄 전용 2단 배치(별도 커밋으로 PDF 전용 확정, 화면은
                세로 1단 유지). 두 그룹(학습 실행 역량 6행 · 학교 생활 및 입시 준비도
                6행)이 인쇄에서만 각각 한 단씩 차지한다. */}
            <div className="fd-area-groups">
              <AreaDetailGroup title={page1Title} rows={detailRows?.page1} />
              <AreaDetailGroup
                title={copy.areaDetailTitle.page2}
                rows={detailRows?.page2}
              />
            </div>
          </section>
        )}

        {/* ── 블록 B 도입부 — 긴급도 한 줄 + 먼저 할 일 + focusGroups(3) ── */}
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
                  {typeTodos?.map((item) => (
                    <li key={item} className="break-keep">
                      {item}
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* fd-strategy-grid — 인쇄 전용 3단 스플릿 훅(2026-08-21, 사용자 지시). 화면
                lg 배치(grid-cols-3)와 동등하게 인쇄에도 강제한다. */}
            {hasStrategies && (
              <div className="fd-strategy-grid mt-6 grid grid-cols-1 gap-8 lg:grid-cols-3 lg:gap-x-8 lg:gap-y-10">
                {focusGroups.map((group) => (
                  <StrategyGroup key={group.code} group={group} />
                ))}
              </div>
            )}
          </section>
        )}
      </ReportSheetA4>

      {/* 4페이지 — restGroups(9, 항상 펼침) + 해석 한계 고지 + reportBasis(문서 끝). */}
      <ReportSheetA4 page={4} totalPages={totalPages}>
        {restGroups.length > 0 && (
          // fd-strategy-more — PDF에서는 토글을 열 수 없으므로 인쇄에서 항상 펼친다:
          // ① report-print.css 가 ::details-content 의 content-visibility 를 강제 해제하고
          //    summary(보기 라벨)를 숨긴다. ② window.print() 경로는 beforeprint 에서 open
          //    속성을 켜고 afterprint 에 원복한다(구형 렌더러 폴백, 위 useEffect).
          <details className="fd-strategy-more mt-10">
            <summary className="cursor-pointer py-2 text-base font-medium text-performance-reportHeading underline underline-offset-4 focus:outline-hidden focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
              {copy.strategyMoreLabel}
            </summary>
            {/* 접혀 있어도 DOM 에는 존재한다 — Ctrl+F 검색과 스크린리더 탐색이 그대로 된다.
                fd-strategy-grid — 인쇄 3단 스플릿(3페이지 focusGroups 그리드와 동일 훅). */}
            <div className="fd-strategy-grid mt-6 grid grid-cols-1 gap-8 lg:grid-cols-3 lg:gap-x-8 lg:gap-y-10">
              {restGroups.map((group) => (
                <StrategyGroup key={group.code} group={group} />
              ))}
            </div>
          </details>
        )}

        {/* ── 블록 D — 해석 한계 고지 ── */}
        {hasNotice && (
          <section>
            {/*
              reportBasis(산출 근거)는 이 페이지 맨 아래에 별도로 실린다 — 건드리지 않는다.
              reportLimit(해석 한계)만 여기 둔다. 새 고지가 생기면 먼저 의미상 소속 섹션을
              찾아라 — 여기에 몰아넣지 않는다.
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
            문서의 끝이 여기(4페이지)로 바뀌어 구분선째 이동했다(사용자 지시, 2026-08-21).
            문서 전체에 걸리는 신뢰성 고지라 항상 마지막에 한 번만 나온다. */}
        {notices?.reportBasis && (
          <p className="fd-mt-report-basis mt-12 border-t border-[#e5e5e5] pt-3 text-sm leading-[1.4] text-ink-sub lg:mt-16">
            {notices.reportBasis}
          </p>
        )}
      </ReportSheetA4>
    </>
  );
}
