// 2개년 등급 변화(Δ) — 값 2개 + 짧은 슬로프 선 + 상태 배지. 명세 §8.3 채택안.
//
// 왜 Sparkline이 아니라 이것인가:
//   2점은 정의상 추세(trend)가 아니라 변화(change)다. Sparkline의 gradeDomain 최소 스팬 1.0
//   규칙(Sparkline.jsx:83-86)은 0.05 차이도 칸 전체로 벌려 과장 왜곡을 만든다. 그래서 여기엔
//   세로 스케일이 아예 없다 — 기울기는 부호만 표현하고, 크기는 배지 숫자가 말한다.
//   연도 축이 3개 이상으로 복원되면 Sparkline으로 되돌린다(호출부가 years.length로 분기).
//
// 차트 라이브러리를 쓰지 않는다: 점 2개짜리 그림에 Recharts 268줄 + ResponsiveContainer는
// 과설계다(§8.3 근거 b). 인라인 SVG 선 하나로 충분하다.
//
// 슬로프 방향은 "등급 수치"를 따른다(값이 줄면 오른쪽 끝이 내려간다) — Sparkline의 반전
// y축(작은 값이 위)과 반대 방향이다. 의도적이다. Sparkline은 lo/hi tick으로 반전을 화면에
// 밝히지만 여기엔 축이 없어 반전을 알릴 방법이 없고, 명세가 확정한 배지 글리프(성적 상승 =
// `▼`)가 이미 수치 방향이라 슬로프를 반전시키면 한 컴포넌트 안에서 화살표와 선이 서로
// 반대를 가리킨다. 대신 "낮을수록 상위"는 한국어 라벨(상승/하락)과 aria 문장이 전담한다.
//
// 데이터 계약: 계산 책임은 전부 src/lib/admissionResults.js에 있다. 이 컴포넌트는 그리기만 한다.
//   series: buildTrackSeries() 결과 Cell[] — { year, value, cut, state, display }
//   delta?: computeDelta()/computeDeltaFromSeries() 결과. 생략하면 series에서 직접 뽑는다.
//   label?: string — aria 요약 문장 앞에 붙는 계열 이름
//
// 의도적으로 지키는 동작:
//   1. 값이 하나도 없으면 렌더하지 않는다(Sparkline 규칙 5와 동일). "등급 미제공" 문구는
//      카드 쪽 책임이라 여기서 중복해 그리지 않는다.
//   2. 비교 불가(한쪽 연도 없음)는 선을 아예 긋지 않는다 — 없는 추세를 지어내지 않는다.
//      배지 대신 회색 캡션(`2026만 수록`)으로 떨어뜨린다.
//   3. 컷 기준 상이는 Δ를 계산하되 톤을 중립(회)으로 낮추고 점선 + `컷 기준 상이` 캡션을
//      병기한다. 2025 전용인 grade_85/90이 체인에 들어와 구조적으로 늘어나는 상태다(§8.4).
//   4. 색만으로 상태를 전달하지 않는다 — 화살표 글리프 + 한국어 라벨이 항상 함께 붙는다.
//   5. 접근성 — 바깥 wrapper가 role="img" + 한국어 요약 aria-label 하나만 노출한다.

import {
  CELL_STATE,
  computeDeltaFromSeries,
  CUT_MISMATCH_NOTE,
  DELTA_STATE,
  formatGradeValue,
} from "../../lib/admissionResults";
import { CHART_COLORS, CHART_FONT_SIZE } from "./chartTheme";

// 톤별 색. `up`(성적 상승)은 차트 정본 색을 그대로 쓰고, `down`은 이 화면이 이미 쓰는
// 경고 적색(TrendingChips.jsx:8)을 따른다. chartTheme.js에 넣지 않는 이유는 아직 이 컴포넌트
// 하나만 쓰는 색이라서다 — 두 번째 사용처가 생기면 그때 공용 토큰으로 올린다.
const TONE = {
  up: { fg: "#013262", bg: "#eef2f8" },
  down: { fg: "#e5484d", bg: "#fdeded" },
  flat: { fg: "#8f8f8f", bg: "#f4f4f4" },
  muted: { fg: "#8f8f8f", bg: "#f4f4f4" },
};

// 슬로프 선 좌표계. preserveAspectRatio="none"으로 가로만 늘어나므로 폭 값 자체는
// 비율 기준일 뿐이고, 실제 폭은 부모 flex가 정한다. RISE는 부호 표현용 고정값 —
// 값 차이에 비례시키지 않는다(그게 §8.3이 없앤 왜곡의 원천이다).
// height 16은 값 텍스트(1rem · leading-none)와 같은 높이라 items-end 정렬에서 선 중심이
// 숫자 중심과 그대로 맞는다.
const SLOPE_VIEWBOX = { width: 56, height: 16 };
const SLOPE_RISE = 4;

// 셀 한 칸 — 연도 라벨 + 등급값(+ 컷 괄호). 결측/미공개는 lib이 만든 display 문자열을 쓴다.
function YearValue({ cell, emphasis }) {
  const hasValue = cell?.state === CELL_STATE.VALUE;
  const color = hasValue && emphasis ? CHART_COLORS.line : "#8f8f8f";

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span
        className="whitespace-nowrap font-medium tracking-[-0.02em]"
        style={{
          fontSize: `${CHART_FONT_SIZE / 16}rem`,
          color: CHART_COLORS.label,
        }}
      >
        {cell?.year ?? ""}
      </span>
      <span
        className="whitespace-nowrap text-base font-semibold leading-none tracking-[-0.02em] tabular-nums"
        style={{ color }}
      >
        {hasValue ? formatGradeValue(cell.value) : cell?.display}
        {hasValue && cell.cut != null ? (
          <span className="ml-1 text-[0.6875rem] font-medium text-[#8f8f8f]">{`(${cell.cut})`}</span>
        ) : null}
      </span>
    </div>
  );
}

// 두 값을 잇는 슬로프. 비교 불가면 아무것도 긋지 않고 자리만 지킨다(위 §2).
function Slope({ state, tone, direction }) {
  const { width, height } = SLOPE_VIEWBOX;
  const mid = height / 2;

  if (state === DELTA_STATE.INCOMPARABLE) {
    return <div className="h-4 flex-1" aria-hidden="true" />;
  }

  // 등급 수치가 줄면(성적 상승) 오른쪽 끝이 내려간다 — 위 헤더 주석의 방향 규칙.
  // 크기는 부호 표현용 고정값이라 SAME일 때만 0이 된다.
  const rise =
    direction === DELTA_STATE.IMPROVED
      ? -SLOPE_RISE
      : direction === DELTA_STATE.WORSENED
        ? SLOPE_RISE
        : 0;
  const y1 = mid + rise;
  const y2 = mid - rise;

  return (
    <svg
      className="h-4 min-w-0 flex-1"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <line
        x1={2}
        y1={y1}
        x2={width - 2}
        y2={y2}
        stroke={TONE[tone]?.fg ?? CHART_COLORS.grid}
        strokeWidth={1.5}
        strokeLinecap="round"
        // 컷 기준이 다르면 "이어져 있지만 그대로 믿을 선은 아니다"를 점선으로 알린다.
        strokeDasharray={state === DELTA_STATE.CUT_MISMATCH ? "3 3" : undefined}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

// aria 요약 한 문장. 색·글리프를 못 보는 사용자에게도 방향과 의미가 그대로 전달돼야 한다.
function ariaSummary(label, previous, current, delta) {
  const cellText = (cell) =>
    cell?.state === CELL_STATE.VALUE
      ? `${cell.year}학년도 ${formatGradeValue(cell.value)}등급${cell.cut != null ? ` (${cell.cut}%컷)` : ""}`
      : `${cell?.year ?? ""}학년도 ${cell?.display ?? "자료 없음"}`;

  const head = `${label ? `${label} ` : ""}전년대비 등급 변화`;
  const values = [cellText(previous), cellText(current)].join(", ");

  if (delta.state === DELTA_STATE.INCOMPARABLE) {
    return `${head}: ${values}. 한쪽 연도에만 자료가 있어 비교할 수 없습니다.`;
  }

  const tail =
    delta.state === DELTA_STATE.CUT_MISMATCH
      ? " 다만 두 연도의 컷 기준이 서로 달라 참고용입니다."
      : "";

  return `${head}: ${values}. ${delta.label}. 등급은 수치가 낮을수록 상위입니다.${tail}`;
}

export default function GradeDelta({ series, delta, label }) {
  const cells = [...(series ?? [])].sort((a, b) => a.year - b.year);

  // 값이 한 칸도 없으면 그리지 않는다 — 연도 라벨과 `-` 두 개만 남은 껍데기가 된다.
  if (cells.length === 0 || cells.every((cell) => cell.value == null))
    return null;

  const previous = cells[0];
  const current = cells[cells.length - 1];
  const result = delta ?? computeDeltaFromSeries(cells);
  const tone = TONE[result.tone] ?? TONE.muted;

  return (
    <div
      role="img"
      aria-label={ariaSummary(label, previous, current, result)}
      className="w-full"
    >
      <div className="flex items-end gap-3">
        <YearValue cell={previous} emphasis={false} />
        <Slope
          state={result.state}
          tone={result.tone}
          direction={result.direction}
        />
        <YearValue cell={current} emphasis />
      </div>

      {/* 배지 / 캡션 — 비교 불가는 배지 없이 캡션만 둔다(§8.3 표). */}
      <div
        className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1"
        aria-hidden="true"
      >
        {result.state === DELTA_STATE.INCOMPARABLE ? (
          <span className="text-[0.8125rem] font-medium tracking-[-0.02em] text-[#8f8f8f]">
            {result.label}
          </span>
        ) : (
          <>
            <span
              className="inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-1 text-[0.8125rem] font-semibold leading-none tracking-[-0.02em]"
              style={{ color: tone.fg, backgroundColor: tone.bg }}
            >
              <span>{result.arrow}</span>
              {result.label}
            </span>
            {result.note ? (
              <span className="text-[0.75rem] font-medium tracking-[-0.02em] text-[#8f8f8f]">
                {CUT_MISMATCH_NOTE}
              </span>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
