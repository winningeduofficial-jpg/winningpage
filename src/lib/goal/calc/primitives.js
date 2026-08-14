// 목표관리 확률 계산의 기반 유틸 — 반올림/클램프, 학교 컷 구분, 남은 시험 회차,
// 중·초 학년 페널티, 수시(내신) 합격 확률.
//
// 이식 원본: 외부 앱 `api/student.mjs`
//   - toNum                    :130-133
//   - round1 / round4 / clampProb  :240-250
//   - getSchoolCutType         :252-256
//   - getRemainingNaesin       :258-280
//   - getRemainingMogo         :282-306
//   - calcNaesinProb           :308-334
//   - applyPreHighGradePenalty :704-721
//
// 원본 동작을 그대로 재현하는 것이 최우선이다. 버그로 보이는 지점도 고치지 않고
// `NOTE(target-parity)` 주석만 달아 둔다. 전부 순수 함수이며 외부 의존이 없다.

// 숫자 변환. 유한수가 아니면 fallback.
export function toNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// NOTE(target-parity): `Number(v || 0)` 이라 0·''·false·null·undefined·NaN 은 전부 0으로,
// -0 도 0으로 접히지만, 숫자가 아닌 문자열('abc')이나 객체는 NaN 이 그대로 흘러나간다.
// toNum 처럼 방어하지 않는다 — 원본 그대로 둔다.
export function round1(v) {
  return Math.round(Number(v || 0) * 10) / 10;
}

export function round4(v) {
  return Math.round(Number(v || 0) * 10000) / 10000;
}

// 확률을 [0, 100] 으로 클램프하고 소수 1자리로 반올림.
// NOTE(target-parity): round1 이 NaN 을 반환하면(예: clampProb('abc')) Math.max/min 도
// NaN 을 통과시켜 결과가 NaN 이 된다. 즉 반환값이 항상 [0,100] 인 것은 아니다.
export function clampProb(v) {
  return Math.min(100, Math.max(0, round1(v)));
}

// 학생의 school_type → 대학 컷 테이블의 컷 종류.
// NOTE(target-parity): '자사고'·'영재고' 같은 단일 문자열은 매칭되지 않는다.
// 정확히 '특목,자사,영재고' 또는 '특목고' 두 리터럴만 special 이다.
export function getSchoolCutType(schoolType) {
  return schoolType === "특목,자사,영재고" || schoolType === "특목고"
    ? "special"
    : "normal";
}

// 남은 내신 시험 회차 (총 10회 기준).
// fallback 이 주어지면(null/undefined/'' 제외) 그 값을 최우선으로 쓴다.
export function getRemainingNaesin(grade, lastExam, fallback = null) {
  // NOTE(target-parity): fallback 은 Number() 로만 변환하고 Math.max(0, ...) 클램프를
  // 거치지 않는다. 음수·NaN 이 그대로 반환될 수 있다.
  if (fallback !== null && fallback !== undefined && fallback !== "") {
    return Number(fallback);
  }

  const order = {
    "고1_1학기 중간": 1,
    "고1_1학기 기말": 2,
    "고1_2학기 중간": 3,
    "고1_2학기 기말": 4,
    "고2_1학기 중간": 5,
    "고2_1학기 기말": 6,
    "고2_2학기 중간": 7,
    "고2_2학기 기말": 8,
    "고3_1학기 중간": 9,
    // NOTE(target-parity): 고3 1학기 기말 / 2학기 중간 / 2학기 기말이 전부 순번 10 으로
    // 같다 — 즉 셋 다 남은 회차 0. 표 자체가 12개 항목이다.
    "고3_1학기 기말": 10,
    "고3_2학기 중간": 10,
    "고3_2학기 기말": 10,
  };

  const key = `${grade}_${lastExam || ""}`;
  return key in order ? Math.max(0, 10 - order[key]) : 0;
}

// 남은 모의고사 회차 (총 14회 기준).
export function getRemainingMogo(grade, lastExam, fallback = null) {
  // NOTE(target-parity): getRemainingNaesin 과 동일하게 fallback 은 클램프하지 않는다.
  if (fallback !== null && fallback !== undefined && fallback !== "") {
    return Number(fallback);
  }

  // NOTE(target-parity): 고1·고2 는 5모·7모 항목이 없고 고3 만 5·7모를 갖는다.
  // 미매칭 키는 "남은 회차 0" 으로 떨어져 중·초 학생과 구분되지 않는다.
  const order = {
    고1_3모: 1,
    고1_6모: 2,
    고1_9모: 3,
    고1_10모: 4,
    고2_3모: 5,
    고2_6모: 6,
    고2_9모: 7,
    고2_10모: 8,
    고3_3모: 9,
    고3_5모: 10,
    고3_6모: 11,
    고3_7모: 12,
    고3_9모: 13,
    고3_10모: 14,
  };

  const key = `${grade}_${lastExam || ""}`;
  return key in order ? Math.max(0, 14 - order[key]) : 0;
}

// 수시(내신) 합격 확률 %.
// 등급은 작을수록 우수하므로 currentGrade <= targetCut 이면 "우세" 갈래다.
//   우세: pBase = min(95, 70 + 20 * (1 - exp(-2.0 * diff)))
//   열세: pBase = max(10, 60 * exp(-0.8 * diff))
// 남은 시험 회차가 있으면 시간계수 factor 를 곱하고 하한 1 을 적용한다.
export function calcNaesinProb(
  currentGrade,
  targetCut,
  remainExams,
  totalExams = 10,
) {
  currentGrade = Number(currentGrade || 0);
  targetCut = Number(targetCut || 0);

  // NOTE(target-parity): 0 도 falsy 라 "등급 0" 은 표현 불가능하고 확률 0 이 된다.
  if (!currentGrade || !targetCut) return 0;

  let pBase;

  if (currentGrade <= targetCut) {
    const diff = targetCut - currentGrade;
    pBase = Math.min(95, 70 + 20 * (1 - Math.exp(-2.0 * diff)));
  } else {
    const diff = currentGrade - targetCut;
    pBase = Math.max(10, 60 * Math.exp(-0.8 * diff));
  }

  if (!remainExams || remainExams <= 0) {
    return clampProb(pBase);
  }

  // NOTE(target-parity): totalExams 가 0 이면 ratio 가 Infinity 가 되어 factor 가
  // ±Infinity 로 발산한다(우세 갈래 → 최종 1, 열세 갈래 → 최종 100). 방어 코드가 없다.
  const ratio = remainExams / totalExams;
  // NOTE(target-parity): 우세 갈래는 남은 시험이 많을수록 확률이 깎인다(1 - ratio^0.8).
  // ratio <= 1 일 때만 factor 가 [0.55, 1.0] 안에 들어가고, remainExams > totalExams 면
  // 우세 갈래는 0.55 아래, 열세 갈래는 1.0 위로 벗어난다.
  const factor =
    currentGrade <= targetCut
      ? 0.55 + 0.45 * (1 - ratio ** 0.8)
      : 0.55 + 0.45 * ratio ** 0.8;

  return clampProb(Math.max(1, pBase * factor));
}

// 고교 진학 전(중·초) 학생의 변환등급에 학년별 페널티를 가산하고 [1, 9] 로 클램프.
// else if 체인이라 학년(grade) 매칭이 학교급(schoolType) 매칭보다 항상 먼저다.
export function applyPreHighGradePenalty(schoolType, grade, convertedGrade) {
  let penalty = 0;

  if (grade === "중1") penalty = 0.5;
  else if (grade === "중2") penalty = 0.3;
  else if (grade === "중3") penalty = 0.1;
  else if (schoolType === "중학교") penalty = 0.3;
  else if (grade === "초1") penalty = 0.4;
  else if (grade === "초2") penalty = 0.35;
  else if (grade === "초3") penalty = 0.3;
  else if (grade === "초4") penalty = 0.25;
  else if (grade === "초5") penalty = 0.2;
  else if (grade === "초6") penalty = 0.1;
  else if (schoolType === "초등학교") penalty = 0.35;

  // NOTE(target-parity): 페널티가 0 인 고교생도 이 클램프를 거친다 — 변환등급 0 은 1 로,
  // 9 초과는 9 로 접힌다. 또 schoolType === '중학교' 이면 grade 가 '고1' 이어도
  // 페널티 0.30 이 붙는다(학년 매칭이 없을 때의 학교급 폴백이라 그렇다).
  return Math.min(9, Math.max(1, round4(toNum(convertedGrade) + penalty)));
}
