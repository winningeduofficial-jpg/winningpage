// 정시(수능) 합격 확률 및 백분위 변환 계산 모듈.
//
// 외부 앱(target)에서 이식한 순수 함수 모음이다. 이식 원본:
//   - getPercentileBands / getWeightedEffortAmount / calcJeongsiBaseProb /
//     getTimeFactorPercentile / calcJeongsiProb
//       → target/api/student.mjs:336-402
//       (내부 헬퍼 round1/clampProb 는 target/api/student.mjs:240-242, 248-250)
//   - getPercentileChips / GRADE_PERCENTILE
//       → target/components/IntakeForm.tsx:464-483
//   - getEnglishPenaltyFE / calcJeongsiCompositeFE
//       → target/components/IntakeForm.tsx:485-505
//
// 이식 원칙은 "충실도 최우선"이다. 원본이 버그로 보이는 동작을 하더라도 그대로
// 재현했고, 수상한 지점에는 NOTE(target-parity) 주석을 달아 두었다. 동작을 바꾸려면
// 반드시 원본(target)과의 파리티 검증부터 다시 해야 한다.
//
// React·DOM·Supabase·네트워크 의존이 없는 순수 함수만 들어 있다. 현재 시각에
// 의존하는 계산도 없다(정시 잔여 회차 remainExams 는 호출자가 넘긴다).
//
// 회귀 테스트: jeongsi.test.js (원본 소스를 그대로 잘라 실행해 뽑은 골든 픽스처)

// ── 내부 헬퍼 (student.mjs:240-242, 248-250) ─────────────────────────────
// 다른 계산 모듈에도 같은 헬퍼가 필요할 수 있으나, 공용 모듈이 확정되기 전까지는
// 원본과 동일한 동작을 보장하기 위해 이 모듈 안에 사본으로 둔다(export 하지 않음).

// NOTE(target-parity): Number(v || 0) 이므로 NaN·null·undefined·''·false 가 전부 0이 된다.
function round1(v) {
  return Math.round(Number(v || 0) * 10) / 10;
}

function clampProb(v) {
  return Math.min(100, Math.max(0, round1(v)));
}

// ── 백분위 9구간 밴드 (student.mjs:336-348) ──────────────────────────────
// 백분위가 높을수록 1점 올리기가 어렵다는 전제로, 구간별 가중치(weight)를 다르게 준다.
// width 는 하드코딩 리터럴이지만 실측 결과 9구간 전부 (max - min + 1) 과 일치한다.
// (docs/figma-goal/target-app-analysis.md 는 "일치하지 않는 구간이 있다"고 적었으나
//  이는 문서 오류다. 예: {min:4, max:10} → 10 - 4 + 1 = 7 = width.)
// 매 호출마다 새 배열·새 객체를 만드는 것도 원본 그대로다(호출자가 변형해도 원본 불변).
export function getPercentileBands() {
  return [
    { min: 0, max: 3, width: 4, weight: 1.0 },
    { min: 4, max: 10, width: 7, weight: 1.1 },
    { min: 11, max: 22, width: 12, weight: 1.25 },
    { min: 23, max: 39, width: 17, weight: 1.45 },
    { min: 40, max: 59, width: 20, weight: 1.7 },
    { min: 60, max: 76, width: 17, weight: 2.0 },
    { min: 77, max: 88, width: 12, weight: 2.4 },
    { min: 89, max: 95, width: 7, weight: 3.0 },
    { min: 96, max: 100, width: 5, weight: 3.8 },
  ];
}

// 현재 백분위 → 목표 백분위 사이를 지나며 누적하는 "가중 노력량".
// 각 밴드와의 겹침 폭을 밴드 width 로 나눈 뒤 weight 를 곱해 더한다.
// 소수 셋째 자리까지 반올림한다.
export function getWeightedEffortAmount(currentScore, targetScore) {
  currentScore = Number(currentScore || 0);
  targetScore = Number(targetScore || 0);

  if (currentScore === targetScore) return 0;

  const bands = getPercentileBands();
  // NOTE(target-parity): min/max 로 정규화하므로 역순 입력(현재 > 목표)도 같은 값을 낸다.
  // 즉 노력량 자체는 방향에 무관하며, 방향은 calcJeongsiBaseProb 가 판단한다.
  const low = Math.min(currentScore, targetScore);
  const high = Math.max(currentScore, targetScore);
  let effort = 0;

  for (const band of bands) {
    const overlapStart = Math.max(low, band.min);
    const overlapEnd = Math.min(high, band.max);

    // NOTE(target-parity): 밴드 경계가 [min, max] 로 닫혀 있는데 겹침은 반열린 구간처럼
    // 계산된다(overlapEnd > overlapStart 이고 폭도 end - start). 그래서 인접 밴드 경계를
    // 딱 하나 넘는 구간(예: 3 → 4, 10 → 11, 95 → 96)은 노력량이 0으로 나온다.
    // 또한 밴드 사이의 "빈 칸"(3과 4 사이 등)이 어느 밴드에도 계상되지 않아,
    // 0 → 100 전 구간 합이 9구간 weight 합(=17.7)이 아니라 15.512 가 된다.
    if (overlapEnd > overlapStart) {
      effort += ((overlapEnd - overlapStart) / band.width) * band.weight;
    }
  }

  return Math.round(effort * 1000) / 1000;
}

// 시간계수를 반영하지 않은 정시 기본 확률. 감쇠계수 a = 0.41 (원본 리터럴).
//   현재 < 목표 : 70 * exp(-a * effort)              → 70 이하로 감쇠
//   현재 > 목표 : 70 + 20 * (1 - exp(-a * effort))   → 70~90 으로 상승
//   현재 = 목표 : 70
export function calcJeongsiBaseProb(currentScore, targetScore) {
  currentScore = Number(currentScore || 0);
  targetScore = Number(targetScore || 0);

  // NOTE(target-parity): falsy 검사이므로 백분위 0(9등급 컷)이 "미입력"과 구분되지 않는다.
  // 현재 백분위 0 또는 목표 백분위 0 이면 언제나 0% 가 나온다.
  if (!currentScore || !targetScore) return 0;

  const effort = getWeightedEffortAmount(currentScore, targetScore);
  const a = 0.41;

  if (currentScore < targetScore) return round1(70 * Math.exp(-a * effort));
  if (currentScore > targetScore)
    return round1(70 + 20 * (1 - Math.exp(-a * effort)));
  return 70;
}

// 남은 모의고사 회차에 따른 시간계수. 총 회차 기본값은 14회.
//   현재 < 목표 : 남은 회차가 많을수록 유리 (0.50 → 1.00)
//   현재 > 목표 : 남은 회차가 적을수록 유리(이미 도달했으므로 지킬 시간이 짧을수록) (0.65 → 1.00)
//   현재 = 목표 : 남은 회차가 많을수록 유리 (0.58 → 1.00)
export function getTimeFactorPercentile(
  currentScore,
  targetCut,
  remainExams,
  totalExams = 14,
) {
  // NOTE(target-parity): remainExams == null (null·undefined) 이거나 totalExams <= 0 이면
  // 시간계수를 1 로 둔다. 즉 "정보 없음"이 "가장 유리"로 처리된다.
  if (remainExams == null || totalExams <= 0) return 1;

  const ratio = remainExams / totalExams;
  const p = Math.pow(ratio, 0.8);

  // NOTE(target-parity): ratio 에 상한이 없어 remainExams > totalExams 이면 계수가 1 을 넘는다
  // (예: 20/14 → 약 1.165). 또 ratio 가 음수면 Math.pow(음수, 0.8) 가 NaN 이라 계수도 NaN 이
  // 되는데, 최종 clampProb 가 NaN 을 0 으로 접어버려 확률이 0% 로 나온다.
  if (currentScore < targetCut) return 0.5 + 0.5 * p;
  if (currentScore > targetCut) return 0.65 + 0.35 * (1 - p);
  return 0.58 + 0.42 * p;
}

// 정시 최종 합격 확률 = 기본 확률 × 시간계수 (0~100 클램프).
export function calcJeongsiProb(
  currentScore,
  targetCut,
  remainExams,
  totalExams = 14,
) {
  const pBase = calcJeongsiBaseProb(currentScore, targetCut);
  const factor = getTimeFactorPercentile(
    currentScore,
    targetCut,
    remainExams,
    totalExams,
  );
  // NOTE(target-parity): 내신 확률(calcNaesinProb)과 달리 하한 1% 보정이 없다. 0% 가 나올 수 있다.
  return clampProb(pBase * factor);
}

// ── 등급 ↔ 백분위 구간 (IntakeForm.tsx:464-467) ──────────────────────────
// 9등급제 각 등급에 대응하는 백분위 구간. 등급 입력 시 백분위 후보 칩을 만드는 데 쓴다.
export const GRADE_PERCENTILE = {
  1: { min: 96, max: 100 },
  2: { min: 89, max: 95 },
  3: { min: 77, max: 88 },
  4: { min: 60, max: 76 },
  5: { min: 40, max: 59 },
  6: { min: 23, max: 39 },
  7: { min: 11, max: 22 },
  8: { min: 4, max: 10 },
  9: { min: 0, max: 3 },
};

// 등급 문자열 → 선택 가능한 백분위 칩 목록 [{ value, label }].
// 구간 폭이 6 이하면 전부 나열하고, 그보다 넓으면 5분위(컷/25%/중앙/75%/최고)만 낸다.
export function getPercentileChips(gradeStr) {
  const g = parseInt(gradeStr);
  if (!g || g < 1 || g > 9) return [];
  const { min, max } = GRADE_PERCENTILE[g];
  // NOTE(target-parity): 여기서 width 는 max - min 이다(밴드의 max - min + 1 과 다름).
  // 그래서 8등급(4~10)은 width 6 이라 7개 전부 나열되지만, 3등급(77~88)은 width 11 이라 5분위로 압축된다.
  const width = max - min;
  const makeLabel = (v) => {
    if (v === min) return `${v}(컷)`;
    if (v === max) return g === 1 ? `${v}(만점)` : `${v}(최고)`;
    if (v === Math.round((min + max) / 2)) return `${v}(안정)`;
    return `${v}`;
  };
  if (width <= 6) {
    return Array.from({ length: width + 1 }, (_, i) => ({
      value: min + i,
      label: makeLabel(min + i),
    }));
  }
  // NOTE(target-parity): 반올림 결과가 겹치면 Set 으로 중복만 제거하므로 칩 개수가 5개 미만이 될 수 있다.
  const pts = [
    min,
    Math.round(min + width * 0.25),
    Math.round((min + max) / 2),
    Math.round(min + width * 0.75),
    max,
  ];
  return [...new Set(pts)]
    .sort((a, b) => a - b)
    .map((v) => ({ value: v, label: makeLabel(v) }));
}

// ── 영어 감점 / 종합 백분위 (IntakeForm.tsx:485-505) ─────────────────────

// 영어는 절대평가라 백분위가 없다. 등급별 감점표(1등급 0점 ~ 9등급 -16점)를 쓰고,
// 소수 등급(평균 등급 등)은 인접 정수 등급 사이를 선형보간한다.
export function getEnglishPenaltyFE(grade) {
  // NOTE(target-parity): 등급 0 이하(=미입력 0 포함)는 1등급과 동일하게 감점 0 이다.
  if (grade <= 1) return 0;
  if (grade >= 9) return -16;
  const floor = Math.floor(grade),
    ceil = Math.ceil(grade);
  const t = {
    1: 0,
    2: -2,
    3: -4,
    4: -6,
    5: -8,
    6: -10,
    7: -12,
    8: -14,
    9: -16,
  };
  return t[floor] + (grade - floor) * (t[ceil] - t[floor]);
}

// 여러 회차의 모의고사 백분위를 묶어 "종합 백분위" 하나를 낸다.
// 과목별로 회차 평균을 먼저 내고, (국어 + 수학 + 탐구평균) / 3 에 영어 감점을 더한다.
// 탐구는 탐구1·탐구2 각각의 평균을 다시 평균한다(5과목 균등가중이 아니라 3분할).
// 소수 둘째 자리까지 반올림한다.
//
// mogoScores 형태: Record<회차키, {
//   kor: { grade, percentile }, math: { grade, percentile }, eng: string,
//   exp1: { grade, percentile }, exp2: { grade, percentile }, exp1Track, exp2Track
// }>
export function calcJeongsiCompositeFE(mogoScores) {
  const korPs = [],
    mathPs = [],
    exp1Ps = [],
    exp2Ps = [];
  let engGrade = 0;
  Object.values(mogoScores).forEach((s) => {
    if (s.kor.percentile != null) korPs.push(s.kor.percentile);
    if (s.math.percentile != null) mathPs.push(s.math.percentile);
    if (s.exp1.percentile != null) exp1Ps.push(s.exp1.percentile);
    if (s.exp2.percentile != null) exp2Ps.push(s.exp2.percentile);
    // NOTE(target-parity): 영어는 평균이 아니라 "마지막으로 값이 있는 회차"가 덮어쓴다.
    // 회차 순서는 Object.values 의 키 순서에 달려 있다.
    if (s.eng) engGrade = parseFloat(s.eng) || 0;
  });
  // NOTE(target-parity): 값이 없는 과목의 평균은 0 으로 처리된다. 그래서 탐구를 입력하지
  // 않으면 탐구평균 0 이 그대로 3분할에 들어가 종합 백분위가 크게 낮아진다.
  const avg = (arr) =>
    arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  const inquiryAvg = (avg(exp1Ps) + avg(exp2Ps)) / 2;
  return (
    Math.round(
      ((avg(korPs) + avg(mathPs) + inquiryAvg) / 3 +
        getEnglishPenaltyFE(engGrade)) *
        100,
    ) / 100
  );
}
