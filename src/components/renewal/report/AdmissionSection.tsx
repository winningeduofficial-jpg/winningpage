// 목표 대학 입결 비교 — 합격 가능성 + 요약문 + 캡션 + 입결 표.
// 결정7: 밴드 UI 없음(HTML 목업 5구간 밴드 미채택), 결정3: 표 2행 라벨 "70% 컷".
// props: { admission } — data.admission. 5키(probabilityLabel/probabilityValue/summary/caption/rows)는
// §7.4.3 불변식이라 무조건 존재하고, 그 아래 확장 키는 값이 없으면 null 이라 자리째 빠진다.
// R3(2026-08-11) — 표 라벨 열("50% 컷(합격자 중위)" 류)은 고정 10rem 에서 모바일 320px대에
// 줄바꿈되면 h-5.25 고정 행 높이가 텍스트를 잘라낸다. 라벨 열을 auto, 행 높이를
// min-h + items-start 로 바꿔 실제 줄 수만큼 늘어나게 한다(가로 스크롤 없이 세로로 흡수).
import { SCREEN_EXTRAS } from "@/data/diagnosisScreenCopy";
import ReportSection from "./ReportSection";

type AdmissionRow = {
  label: string;
  grade?: string;
  gap?: string;
  emphasis?: boolean;
};

export type AdmissionData = {
  probabilityLabel: string;
  probabilityValue: string;
  summary: string;
  caption: string;
  rows: AdmissionRow[];
  probabilityBadge?: string | null;
  probabilityRangeLabel?: string | null;
  probabilityRange?: string | null;
  probNote?: string | null;
  tableNote?: string | null;
  finalAvgNote?: string | null;
  emptyNotice?: string | null;
  hasRows?: boolean;
};

type AdmissionSectionProps = {
  admission: AdmissionData;
};

const AdmissionSection = ({ admission }: AdmissionSectionProps) => {
  const {
    probabilityLabel,
    probabilityValue,
    summary,
    caption,
    rows,
    // 화면 전용 확장 슬롯(F-01 · F-09). 엔진이 조건을 이미 판정해 null 로 내려 준다.
    probabilityBadge = null,
    probabilityRangeLabel = null,
    probabilityRange = null,
    probNote = null,
    tableNote = null,
    finalAvgNote = null,
    emptyNotice = null,
    // F-10 — 0행이면 헤더만 남은 빈 박스가 '로딩되다 만 표'로 읽힌다. 엔진은 계약대로 계속
    // rows: [] 를 내고, **숨김 판단만** 여기서 한다. 안내 행을 넣지 않는 이유는 3열 중 2열이
    // 빈 채 남아 F-10 의 원증상이 그대로 재현되기 때문이다.
    // G-1b — 기본값도 엔진과 같은 기준(비교 대상 有無)으로 맞춘다. admission 객체는 항상 이
    // 키를 내려주므로(§7.4.3) 실전에서는 쓰이지 않고, 컴포넌트 단독 사용·테스트 대비용이다.
    hasRows = rows.some((row) => !row.emphasis),
  } = admission;

  // G-3(NIT 2) — 빈 표 롤백 레버. 화면 레이아웃 결정은 이 컴포넌트 소관이라(diagnosisReport.js
  // 는 값만 낸다) 모드를 여기서 직접 읽는다. 기본값 'HIDE' 는 F-10 확정 동작과 동일하다.
  // admissionEmptyTableMode는 diagnosisScreenCopy.ts에서 리터럴 "HIDE"로 추론되지만
  // 런타임 값은 향후 "NOTICE_ROW"로 바뀔 수 있는 설정값이라 string으로 비교(범위 밖 파일이라 위젠).
  const showEmptyNotice =
    !hasRows &&
    (SCREEN_EXTRAS.rules.admissionEmptyTableMode as string) === "NOTICE_ROW" &&
    emptyNotice;

  // R4(2026-08-11) — fd-admission-* 훅: 인쇄(794px, lg: 미적용)에서 report-print.css 가
  // 기존 lg: 리터럴과 동일한 rem 값으로 되돌린다(BLOCK 수정, ReportSheetA4 주석 참고).
  // fd-screen-only 가 붙은 요소는 인쇄에서 통째로 display:none 이라 그 안의 lg: 값에는
  // 별도 인쇄 훅을 만들지 않는다(§7.5 예외 — report-print.css 주석에 근거 있음).
  // mt-12(2026-08-21) — ReadinessOverview·DimensionBarChart(왼쪽 단)와 나란히 시작하도록
  // 왼쪽 단 첫 섹션(ReadinessOverview)과 같은 값으로 맞췄다(종전 mt-10 lg:mt-16.25는
  // InsightColumns 뒤에 세로로 이어지던 옛 배치의 값 — 2단 스플릿에서는 더 이상 맞지
  // 않는다). lg: 분기가 없어져 print CSS 강제 규칙도 함께 제거했다.
  return (
    <ReportSection title="목표 대학 입결 비교" className="mt-12">
      {/*
        F-01 — 인쇄 슬롯의 값은 **밴드 4글자**('안정'/'적정'/'소신'/'위험')를 유지한다.
        점추정 %(엔진 내부값)는 학생 화면 어디에도 그대로 나가지 않는다.
        '참고 결과' 배지는 06_금지어 '결과 단정'의 대체 표현 원문 인용이고 화면·인쇄 공통이다 —
        확률 값이 뜨는 순간 캡션이 출처 문장으로 바뀌어 인쇄본에 참고 고지가 전무해지는데,
        이 배지가 그 구멍을 같은 줄에서(=세로 예산 0으로) 막는다.
      */}
      {/* items-center 유지 — 시안 승인 정렬이다. 배지를 붙이려고 baseline 으로 바꾸면
          라벨·값 두 줄의 세로 위치가 함께 움직여 1440 데스크톱 렌더가 회귀한다. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-[1.1875rem] font-medium text-ink">
          {probabilityLabel}
        </span>
        <span className="text-[1.25rem] font-medium text-primary">
          {probabilityValue}
        </span>
        {probabilityBadge && (
          <span className="text-sm leading-[1.4] text-ink-sub">
            {probabilityBadge}
          </span>
        )}
      </div>

      {/*
        확률 구간(화면 전용). 점추정 대신 10%p 구간 라벨만 낸다 — 합격 확률은 진로 판단에
        쓰이므로 정밀한 척하지 않는다. 라벨 테이블에 '0%'·'100%' 문자열이 구조적으로 없다.
      */}
      {probabilityRange && (
        <p className="fd-screen-only mt-2 flex flex-wrap items-baseline gap-x-3 text-base leading-[1.4]">
          <span className="text-ink-sub">{probabilityRangeLabel}</span>
          <span className="font-medium tabular-nums text-primary">
            {probabilityRange}
          </span>
        </p>
      )}

      {/*
        PROB_NOTE(F-05) — 이 리포트에서 진로 판단에 가장 직접 쓰이는 값 **바로 아래**에 둔다.
        하단 고지 묶음으로 보내면 두 화면 아래라 읽히지 않는다 — 인접성이 곧 안전장치다.
        인쇄 제외 사유는 길이(약 120자)다. 2페이지 flow 여유가 가장 적다.
      */}
      {/* G-3(NIT 3) — 화면 전용 문단은 인쇄에서 통째로 display:none 이라 14px 를 유지할 이유가
          없다. 모바일 390px 는 text-base(16px), 데스크톱만 기존 text-sm(14px) 유지. */}
      {probNote && (
        <p className="fd-screen-only mt-2 w-full break-keep text-base leading-[1.45] text-ink-sub lg:w-122.5 lg:text-sm">
          {probNote}
        </p>
      )}

      <p className="fd-admission-summary mt-3.5 w-full text-base leading-[1.3] text-[#0f172a] lg:w-122.5">
        {summary}
      </p>

      <p className="mt-3.5 text-base leading-[1.3] text-[#808080]">{caption}</p>

      {/* G-3(NIT 2) — admissionEmptyTableMode='NOTICE_ROW' 일 때만 hasRows=false 여도 박스를 그린다
          (기본 'HIDE' 에서는 showEmptyNotice 가 항상 false 라 이 줄이 종전 hasRows 단독 조건과 동일하다). */}
      {/* lg:w-122.5(2026-08-21) — 종전 lg:w-127.5(31.875rem)는 전폭(62.5rem) 단일 컬럼
          기준이었다. 2단 스플릿의 오른쪽 단 폭(30.875rem)에 맞춰 fd-admission-summary와
          같은 값(122.5=30.625rem)으로 줄였다. */}
      {(hasRows || showEmptyNotice) && (
        <div className="fd-admission-box mt-3.5 w-full rounded-xl border border-[#d9d9d9] px-3.25 py-2.75 lg:w-122.5">
          {showEmptyNotice ? (
            <p className="text-base leading-[1.3] text-[#808080]">
              {emptyNotice}
            </p>
          ) : (
            <div className="fd-admission-rows flex flex-col gap-3 lg:gap-3.75">
              <div className="fd-admission-grid grid grid-cols-[auto_1fr_1fr] items-center gap-x-2 break-keep text-base font-medium leading-[1.3] text-[#808080] lg:grid-cols-[10rem_1fr_1fr]">
                <span>구분</span>
                <span className="text-right">등급</span>
                <span className="text-right">내 성적과의 차이</span>
              </div>

              {rows.map((row) => (
                <div
                  key={row.label}
                  // break-keep — 모바일 좁은 값 칸에서 "부족"이 "부"/"족"으로 음절 단위로 쪼개지는
                  // 기본 한글 줄바꿈(word-break: normal)을 막는다(실측). 데스크톱은 폭이 넓어 원래도
                  // 줄바꿈이 나지 않던 자리라 시각적 차이가 없다.
                  className={`fd-admission-grid grid grid-cols-[auto_1fr_1fr] items-start gap-x-2 break-keep text-base leading-[1.3] lg:grid-cols-[10rem_1fr_1fr] lg:items-center ${
                    row.emphasis
                      ? "font-semibold text-accent"
                      : "font-medium text-[#808080]"
                  }`}
                >
                  <span>{row.label}</span>
                  <span className="text-right">{row.grade}</span>
                  <span className="text-right">{row.gap}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/*
        F-09 — 표가 3행뿐인 것이 '로딩 실패'로 보이지 않게 왜 최종등록자 평균 행이 없는지 밝힌다.
        그 값은 '아직 안 가져온 값'이 아니라 원본에 **존재하지 않는** 값이다(모집단이 다른
        grade_avg 계열로 대체 매핑하지 마라 — diagnosisAdmissionCuts.js 헤더 주석에 근거 있음).
        표 바로 아래에 붙인다(F-10 의 빈 표 오인과 같은 계열의 위험이라 거리가 멀면 기능하지 않는다).
      */}
      {finalAvgNote && (
        <p className="fd-screen-only mt-3 w-full break-keep text-base leading-[1.45] text-ink-sub lg:w-122.5 lg:text-sm">
          {finalAvgNote}
        </p>
      )}

      {/*
        ADMISSION_NOTE(F-05) — 종전에는 q15 미완주 폴백 캡션으로만 나와서, 실제로 표에 숫자가
        뜨는 학생일수록 비교 한계 고지를 못 보는 뒤집힌 노출이었다. 표 아래에 상시 1회 붙인다.
        엔진이 `!== caption` 중복 가드를 이미 걸어 null 로 내려 준다(같은 문장 2회 방지).
      */}
      {tableNote && (
        <p className="fd-screen-only mt-3 w-full break-keep text-base leading-[1.45] text-ink-sub lg:w-122.5 lg:text-sm">
          {tableNote}
        </p>
      )}
    </ReportSection>
  );
};

export default AdmissionSection;
