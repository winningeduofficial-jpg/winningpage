// "목표까지 남은 격차" 3행(내신 등급 · 모의고사 · 학습 시간) — 순수 함수, supabase
// 미의존. TMP 목표관리 서비스기획서 §3.16 근거: 좁혀야 할 거리를 숫자로 보여준다
// ("0.98등급 격차", "백분위 4.3점 격차" 류). 기준 대학은 항상 이상 목표다(§3.4
// "학습량 산출의 상한선") — 호출부(TargetUniversity.tsx)가 이상 목표 컷/현재값만
// 넘긴다.
//
// 값이 없는 축은 계산 함수가 null을 반환하고, 조립 함수(buildGapRows)가 그 행을
// 결과 배열에서 아예 뺀다 — 억지 산출 금지(스펙 원칙).

export type GapRow = {
  label: string;
  description: string;
  remaining: string;
};

/** 부족/우위/정확히 도달 3분기 문구. diff는 "목표 - 현재" 방향이 아니라 각 gap
 * 함수가 이미 "부족이면 양수"로 정규화해 넘긴 값이다. */
function formatRemaining(diff: number, unit: string): string {
  if (diff === 0) return "목표 도달";
  const magnitude = Math.abs(diff);
  return diff > 0 ? `${magnitude}${unit} 부족` : `${magnitude}${unit} 우위`;
}

/**
 * 내신 격차 = 현재 환산등급 - 이상 목표 내신 컷(등급 1~9, 작을수록 우세).
 * 양수 = 부족(등급을 더 낮춰야 함), 음수 = 이미 목표보다 우세. 소수 둘째 자리 반올림
 * (온보딩 화면의 등급 표시 정밀도와 동일 — buildStudentPayload scores.convertedGrade).
 */
export function naesinGap(
  currentConvertedGrade: number | null,
  targetNaesinCut: number | null,
): number | null {
  if (currentConvertedGrade == null || targetNaesinCut == null) return null;
  return Math.round((currentConvertedGrade - targetNaesinCut) * 100) / 100;
}

/**
 * 모의고사 격차 = 목표 정시 컷(백분위 0~100, 클수록 우세) - 현재 백분위.
 * naesinGap과 부등호 방향이 정반대다 — 내신은 작을수록, 백분위는 클수록 우세하기
 * 때문에 "현재-목표"가 아니라 "목표-현재"로 스케일을 반전시켜야 두 함수 모두
 * "양수=부족"이라는 공통 계약을 지킬 수 있다(이 반전이 이 함수를 naesinGap과
 * 분리한 이유). 소수 첫째 자리 반올림(온보딩 백분위 표시 정밀도와 동일).
 */
export function mogoGap(
  currentMogoPercentile: number | null,
  targetJungsiCut: number | null,
): number | null {
  if (currentMogoPercentile == null || targetJungsiCut == null) return null;
  return Math.round((targetJungsiCut - currentMogoPercentile) * 10) / 10;
}

/**
 * 학습 시간 격차 = 목표 일일 학습 시간(targetDailyHours, 보통 weekIdeal÷7) - 최근
 * 실측 평균(recentAvgHours, GET /api/goal/student의 recentAvgStudyHours). 양수 =
 * 부족, 음수 = 우위. 소수 첫째 자리 반올림.
 */
export function studyGap(
  recentAvgHours: number | null,
  targetDailyHours: number | null,
): number | null {
  if (recentAvgHours == null || targetDailyHours == null) return null;
  return Math.round((targetDailyHours - recentAvgHours) * 10) / 10;
}

export type GapToTargetInputs = {
  naesin: { current: number | null; target: number | null };
  mogo: { current: number | null; target: number | null };
  study: { current: number | null; target: number | null };
};

/**
 * 3행 조립. 각 gap 값이 null이면(둘 중 하나라도 값이 없으면) 그 행 자체를 뺀다 —
 * 3행 전부 null이면 빈 배열을 반환하고, 호출부(GapToTargetCard 렌더 조건)가 카드
 * 자체를 숨긴다.
 */
export function buildGapRows(inputs: GapToTargetInputs): GapRow[] {
  const rows: (GapRow | null)[] = [
    buildNaesinRow(inputs.naesin.current, inputs.naesin.target),
    buildMogoRow(inputs.mogo.current, inputs.mogo.target),
    buildStudyRow(inputs.study.current, inputs.study.target),
  ];
  return rows.filter((row): row is GapRow => row !== null);
}

function buildNaesinRow(
  current: number | null,
  target: number | null,
): GapRow | null {
  const diff = naesinGap(current, target);
  if (diff == null || current == null || target == null) return null;
  return {
    label: "내신 등급",
    description: `현재 ${current.toFixed(2)}등급 → 목표 ${target.toFixed(2)}등급 (이상 목표 기준)`,
    remaining: formatRemaining(diff, "등급"),
  };
}

function buildMogoRow(
  current: number | null,
  target: number | null,
): GapRow | null {
  const diff = mogoGap(current, target);
  if (diff == null || current == null || target == null) return null;
  return {
    label: "모의고사",
    description: `현재 ${current.toFixed(1)} 백분위 → 목표 ${target.toFixed(1)} 백분위 (이상 목표 기준)`,
    remaining: formatRemaining(diff, ""),
  };
}

function buildStudyRow(
  current: number | null,
  target: number | null,
): GapRow | null {
  const diff = studyGap(current, target);
  if (diff == null || current == null || target == null) return null;
  return {
    label: "학습 시간",
    description: `현재 ${current.toFixed(1)}시간/일 → 목표 ${target.toFixed(1)}시간/일`,
    remaining: formatRemaining(diff, "시간"),
  };
}
