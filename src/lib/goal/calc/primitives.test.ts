// primitives.js 골든 픽스처 회귀 테스트.
//
// 생성 방법: 외부 앱 원본 `api/student.mjs` 의 :130-133(toNum), :240-334,
// :704-721 을 **글자 그대로 잘라** 스크래치의 orig.mjs 로 만들고, 아래 입력들을
// 그 원본 함수에 직접 통과시켜 출력을 받아 적었다. 기대값은 손계산이 아니라
// 원본 실행 결과다.
//
// 실행: cd <repo> && npm test -- src/lib/goal/calc/primitives.test.ts

import { expect, test } from "vitest";

import {
  applyPreHighGradePenalty,
  calcNaesinProb,
  clampProb,
  getRemainingMogo,
  getRemainingNaesin,
  getSchoolCutType,
  round1,
  round4,
  toNum,
} from "./primitives.ts";

// 부동소수 비교. NaN·±Infinity·-0 처럼 오차 비교가 무의미한 값은 엄격 비교로 넘긴다.
function assertNum(actual, expected, label) {
  if (
    !Number.isFinite(expected) ||
    !Number.isFinite(actual) ||
    Object.is(expected, -0)
  ) {
    expect(actual, label).toBe(expected);
    return;
  }
  expect(
    Math.abs(actual - expected) < 1e-9,
    `${label}: ${actual} !== ${expected}`,
  ).toBeTruthy();
}

// [입력, round1 결과]
const ROUND1_CASES = [
  [0, 0],
  [-0, 0],
  [1, 1],
  [-1, -1],
  [0.05, 0.1],
  [0.04999, 0],
  [-0.05, -0],
  [1.25, 1.3],
  [1.35, 1.4],
  [2.675, 2.7],
  [99.999, 100],
  [100.04, 100],
  [100.05, 100.1],
  [-0.0001, -0],
  [12345.67891, 12345.7],
  [1e-9, 0],
  [0.00005, 0],
  [0.000049, 0],
  [null, 0],
  [undefined, 0],
  ["", 0],
  ["abc", NaN],
  ["3.14159", 3.1],
  [NaN, 0],
  [Infinity, Infinity],
  [-Infinity, -Infinity],
  [true, 1],
  [false, 0],
  [[], 0],
  [[2.5], 2.5],
  [{}, NaN],
];

// [입력, round4 결과]
const ROUND4_CASES = [
  [0, 0],
  [-0, 0],
  [1, 1],
  [-1, -1],
  [0.05, 0.05],
  [0.04999, 0.05],
  [-0.05, -0.05],
  [1.25, 1.25],
  [1.35, 1.35],
  [2.675, 2.675],
  [99.999, 99.999],
  [100.04, 100.04],
  [100.05, 100.05],
  [-0.0001, -0.0001],
  [12345.67891, 12345.6789],
  [1e-9, 0],
  [0.00005, 0.0001],
  [0.000049, 0],
  [null, 0],
  [undefined, 0],
  ["", 0],
  ["abc", NaN],
  // biome-ignore lint/suspicious/noApproximativeNumericConstant: Math.PI 근사가 아니라 반올림 함수의 소수 4자리 반올림 골든값이다.
  ["3.14159", 3.1416],
  [NaN, 0],
  [Infinity, Infinity],
  [-Infinity, -Infinity],
  [true, 1],
  [false, 0],
  [[], 0],
  [[2.5], 2.5],
  [{}, NaN],
];

// [입력, clampProb 결과]
const CLAMP_PROB_CASES = [
  [0, 0],
  [-0, 0],
  [1, 1],
  [-1, 0],
  [0.05, 0.1],
  [0.04999, 0],
  [-0.05, 0],
  [1.25, 1.3],
  [1.35, 1.4],
  [2.675, 2.7],
  [99.999, 100],
  [100.04, 100],
  [100.05, 100],
  [-0.0001, 0],
  [12345.67891, 100],
  [1e-9, 0],
  [0.00005, 0],
  [0.000049, 0],
  [null, 0],
  [undefined, 0],
  ["", 0],
  ["abc", NaN],
  ["3.14159", 3.1],
  [NaN, 0],
  [Infinity, 100],
  [-Infinity, 0],
  [true, 1],
  [false, 0],
  [[], 0],
  [[2.5], 2.5],
  [{}, NaN],
];

// [schoolType, getSchoolCutType 결과]
const SCHOOL_CUT_TYPE_CASES = [
  ["특목,자사,영재고", "special"],
  ["특목고", "special"],
  ["일반고", "normal"],
  ["중학교", "normal"],
  ["초등학교", "normal"],
  ["특목", "normal"],
  ["", "normal"],
  [null, "normal"],
  [undefined, "normal"],
  [0, "normal"],
];

// [grade, lastExam, fallback, getRemainingNaesin 결과]
const REMAINING_NAESIN_CASES = [
  ["고1", "1학기 중간", null, 9],
  ["고1", "1학기 기말", null, 8],
  ["고1", "2학기 중간", null, 7],
  ["고1", "2학기 기말", null, 6],
  ["고1", "3학기 중간", null, 0],
  ["고1", "", null, 0],
  ["고1", null, null, 0],
  ["고1", undefined, null, 0],
  ["고2", "1학기 중간", null, 5],
  ["고2", "1학기 기말", null, 4],
  ["고2", "2학기 중간", null, 3],
  ["고2", "2학기 기말", null, 2],
  ["고2", "3학기 중간", null, 0],
  ["고2", "", null, 0],
  ["고2", null, null, 0],
  ["고2", undefined, null, 0],
  ["고3", "1학기 중간", null, 1],
  ["고3", "1학기 기말", null, 0],
  ["고3", "2학기 중간", null, 0],
  ["고3", "2학기 기말", null, 0],
  ["고3", "3학기 중간", null, 0],
  ["고3", "", null, 0],
  ["고3", null, null, 0],
  ["고3", undefined, null, 0],
  ["중3", "1학기 중간", null, 0],
  ["중3", "1학기 기말", null, 0],
  ["중3", "2학기 중간", null, 0],
  ["중3", "2학기 기말", null, 0],
  ["중3", "3학기 중간", null, 0],
  ["중3", "", null, 0],
  ["중3", null, null, 0],
  ["중3", undefined, null, 0],
  ["", "1학기 중간", null, 0],
  ["", "1학기 기말", null, 0],
  ["", "2학기 중간", null, 0],
  ["", "2학기 기말", null, 0],
  ["", "3학기 중간", null, 0],
  ["", "", null, 0],
  ["", null, null, 0],
  ["", undefined, null, 0],
  [null, "1학기 중간", null, 0],
  [null, "1학기 기말", null, 0],
  [null, "2학기 중간", null, 0],
  [null, "2학기 기말", null, 0],
  [null, "3학기 중간", null, 0],
  [null, "", null, 0],
  [null, null, null, 0],
  [null, undefined, null, 0],
  [undefined, "1학기 중간", null, 0],
  [undefined, "1학기 기말", null, 0],
  [undefined, "2학기 중간", null, 0],
  [undefined, "2학기 기말", null, 0],
  [undefined, "3학기 중간", null, 0],
  [undefined, "", null, 0],
  [undefined, null, null, 0],
  [undefined, undefined, null, 0],
  ["고1", "1학기 중간", 0, 0],
  ["고1", "1학기 중간", 5, 5],
  ["고1", "1학기 중간", "7", 7],
  ["고1", "1학기 중간", "", 9],
  ["고1", "1학기 중간", null, 9],
  ["고1", "1학기 중간", undefined, 9],
  ["고1", "1학기 중간", "abc", NaN],
  ["고1", "1학기 중간", -3, -3],
  ["고1", "1학기 중간", 99, 99],
];

// [grade, lastExam, fallback, getRemainingMogo 결과]
const REMAINING_MOGO_CASES = [
  ["고1", "3모", null, 13],
  ["고1", "5모", null, 0],
  ["고1", "6모", null, 12],
  ["고1", "7모", null, 0],
  ["고1", "9모", null, 11],
  ["고1", "10모", null, 10],
  ["고1", "11모", null, 0],
  ["고1", "", null, 0],
  ["고1", null, null, 0],
  ["고1", undefined, null, 0],
  ["고2", "3모", null, 9],
  ["고2", "5모", null, 0],
  ["고2", "6모", null, 8],
  ["고2", "7모", null, 0],
  ["고2", "9모", null, 7],
  ["고2", "10모", null, 6],
  ["고2", "11모", null, 0],
  ["고2", "", null, 0],
  ["고2", null, null, 0],
  ["고2", undefined, null, 0],
  ["고3", "3모", null, 5],
  ["고3", "5모", null, 4],
  ["고3", "6모", null, 3],
  ["고3", "7모", null, 2],
  ["고3", "9모", null, 1],
  ["고3", "10모", null, 0],
  ["고3", "11모", null, 0],
  ["고3", "", null, 0],
  ["고3", null, null, 0],
  ["고3", undefined, null, 0],
  ["중3", "3모", null, 0],
  ["중3", "5모", null, 0],
  ["중3", "6모", null, 0],
  ["중3", "7모", null, 0],
  ["중3", "9모", null, 0],
  ["중3", "10모", null, 0],
  ["중3", "11모", null, 0],
  ["중3", "", null, 0],
  ["중3", null, null, 0],
  ["중3", undefined, null, 0],
  ["", "3모", null, 0],
  ["", "5모", null, 0],
  ["", "6모", null, 0],
  ["", "7모", null, 0],
  ["", "9모", null, 0],
  ["", "10모", null, 0],
  ["", "11모", null, 0],
  ["", "", null, 0],
  ["", null, null, 0],
  ["", undefined, null, 0],
  [null, "3모", null, 0],
  [null, "5모", null, 0],
  [null, "6모", null, 0],
  [null, "7모", null, 0],
  [null, "9모", null, 0],
  [null, "10모", null, 0],
  [null, "11모", null, 0],
  [null, "", null, 0],
  [null, null, null, 0],
  [null, undefined, null, 0],
  [undefined, "3모", null, 0],
  [undefined, "5모", null, 0],
  [undefined, "6모", null, 0],
  [undefined, "7모", null, 0],
  [undefined, "9모", null, 0],
  [undefined, "10모", null, 0],
  [undefined, "11모", null, 0],
  [undefined, "", null, 0],
  [undefined, null, null, 0],
  [undefined, undefined, null, 0],
  ["고3", "3모", 0, 0],
  ["고3", "3모", 5, 5],
  ["고3", "3모", "7", 7],
  ["고3", "3모", "", 5],
  ["고3", "3모", null, 5],
  ["고3", "3모", undefined, 5],
  ["고3", "3모", "abc", NaN],
  ["고3", "3모", -3, -3],
  ["고3", "3모", 99, 99],
];

// [schoolType, grade, convertedGrade, applyPreHighGradePenalty 결과]
const PRE_HIGH_PENALTY_CASES = [
  ["일반고", "중1", 1, 1.5],
  ["일반고", "중1", 4.4, 4.9],
  ["일반고", "중1", 9, 9],
  ["일반고", "중2", 1, 1.3],
  ["일반고", "중2", 4.4, 4.7],
  ["일반고", "중2", 9, 9],
  ["일반고", "중3", 1, 1.1],
  ["일반고", "중3", 4.4, 4.5],
  ["일반고", "중3", 9, 9],
  ["일반고", "초1", 1, 1.4],
  ["일반고", "초1", 4.4, 4.8],
  ["일반고", "초1", 9, 9],
  ["일반고", "초2", 1, 1.35],
  ["일반고", "초2", 4.4, 4.75],
  ["일반고", "초2", 9, 9],
  ["일반고", "초3", 1, 1.3],
  ["일반고", "초3", 4.4, 4.7],
  ["일반고", "초3", 9, 9],
  ["일반고", "초4", 1, 1.25],
  ["일반고", "초4", 4.4, 4.65],
  ["일반고", "초4", 9, 9],
  ["일반고", "초5", 1, 1.2],
  ["일반고", "초5", 4.4, 4.6],
  ["일반고", "초5", 9, 9],
  ["일반고", "초6", 1, 1.1],
  ["일반고", "초6", 4.4, 4.5],
  ["일반고", "초6", 9, 9],
  ["중학교", "고1", 1, 1.3],
  ["중학교", "고1", 4.4, 4.7],
  ["중학교", "고1", 9, 9],
  ["초등학교", "고1", 1, 1.35],
  ["초등학교", "고1", 4.4, 4.75],
  ["초등학교", "고1", 9, 9],
  ["일반고", "고1", 1, 1],
  ["일반고", "고1", 4.4, 4.4],
  ["일반고", "고1", 9, 9],
  ["", "고1", 1, 1],
  ["", "고1", 4.4, 4.4],
  ["", "고1", 9, 9],
  [null, "고1", 1, 1],
  [null, "고1", 4.4, 4.4],
  [null, "고1", 9, 9],
  [undefined, "고1", 1, 1],
  [undefined, "고1", 4.4, 4.4],
  [undefined, "고1", 9, 9],
  ["중학교", "중1", 3, 3.5],
  ["초등학교", "초6", 3, 3.1],
  ["중학교", "초1", 3, 3.3],
  ["일반고", "고1", 0, 1],
  ["일반고", "고1", -5, 1],
  ["일반고", "고1", 100, 9],
  ["일반고", "고1", 0.5, 1],
  ["일반고", "고1", null, 1],
  ["일반고", "고1", undefined, 1],
  ["일반고", "고1", "abc", 1],
  ["일반고", "고1", "4.4444", 4.4444],
  ["중1", "중1", 8.6, 9],
  ["일반고", "중1", 8.5, 9],
  ["일반고", "중1", 8.6, 9],
  ["일반고", "초1", 0.55, 1],
  ["일반고", "중3", 0.85, 1],
  ["일반고", "중3", 0.95, 1.05],
  ["일반고", "고1", 1, 1],
  ["일반고", "고1", 9, 9],
  ["일반고", "고1", 2.00005, 2.0001],
  ["일반고", "중2", 1.23455, 1.5346],
];

// [currentGrade, targetCut, remainExams, totalExams|undefined, calcNaesinProb 결과]
const NAESIN_PROB_CASES = [
  [0, 3, 5, undefined, 0],
  [3, 0, 5, undefined, 0],
  [null, 3, 5, undefined, 0],
  [3, null, 5, undefined, 0],
  [undefined, undefined, undefined, undefined, 0],
  ["", 2, 4, undefined, 0],
  ["2.5", "2.0", "3", undefined, 29],
  [3, 3, 0, undefined, 70],
  [3, 3, null, undefined, 70],
  [3, 3, undefined, undefined, 70],
  [3, 3, -1, undefined, 70],
  [3, 3, 5, undefined, 51.9],
  [2, 3, 10, undefined, 48],
  [2, 3, 1, undefined, 81.1],
  [2, 3, 10, 10, 48],
  [2, 3, 5, 14, 70.1],
  [2, 3, 14, 14, 48],
  [1, 9, 10, undefined, 49.5],
  [9, 1, 10, undefined, 10],
  [4, 2, 3, undefined, 8.7],
  [4, 2, 0, undefined, 12.1],
  [1.5, 1.5, 7, undefined, 46.3],
  [3, 3.0001, 6, undefined, 49.1],
  [5, 4.9999, 6, undefined, 50.9],
  [2, 3, 20, 10, 18.9],
  [2, 3, 10, 0, 1],
  [4, 2, 10, 0, 100],
  [2, 3, 0, 0, 87.3],
  [8, 1, 12, 14, 9.5],
  [1, 8, 12, 14, 54.2],
  [3, 3, 12, 14, 42.2],
  [-1, 3, 5, undefined, 66.7],
  [3, -1, 5, undefined, 8.1],
  [-2, -3, 5, undefined, 21.8],
  [1, 3, -5, undefined, 89.6],
  [1, 100, 10, undefined, 49.5],
  [100, 1, 10, undefined, 10],
  [0.1, 0.2, 9, undefined, 43.2],
  [2, 3, 1, 1, 48],
  [4, 2, 1, 1, 12.1],
  [2, 3, "abc", 10, 0],
  [2, 3, 5, "abc", 0],
];

test("round1 — 원본 출력과 일치", () => {
  for (const [input, expected] of ROUND1_CASES) {
    assertNum(round1(input), expected, `round1(${String(input)})`);
  }
});

test("round4 — 원본 출력과 일치", () => {
  for (const [input, expected] of ROUND4_CASES) {
    assertNum(round4(input), expected, `round4(${String(input)})`);
  }
});

test("clampProb — 원본 출력과 일치", () => {
  for (const [input, expected] of CLAMP_PROB_CASES) {
    assertNum(clampProb(input), expected, `clampProb(${String(input)})`);
  }
});

test("getSchoolCutType — 특목/특목,자사,영재고만 special", () => {
  for (const [input, expected] of SCHOOL_CUT_TYPE_CASES) {
    expect(getSchoolCutType(input), `getSchoolCutType(${String(input)})`).toBe(
      expected,
    );
  }
});

test("getRemainingNaesin — order 맵 12개 + fallback 분기", () => {
  for (const [grade, lastExam, fallback, expected] of REMAINING_NAESIN_CASES) {
    assertNum(
      getRemainingNaesin(grade, lastExam, fallback),
      expected,
      `getRemainingNaesin(${String(grade)}, ${String(lastExam)}, ${String(fallback)})`,
    );
  }
});

test("getRemainingMogo — order 맵 14개 + fallback 분기", () => {
  for (const [grade, lastExam, fallback, expected] of REMAINING_MOGO_CASES) {
    assertNum(
      getRemainingMogo(grade, lastExam, fallback),
      expected,
      `getRemainingMogo(${String(grade)}, ${String(lastExam)}, ${String(fallback)})`,
    );
  }
});

test("applyPreHighGradePenalty — 학년별 11단 페널티 + [1,9] 클램프", () => {
  for (const [
    schoolType,
    grade,
    convertedGrade,
    expected,
  ] of PRE_HIGH_PENALTY_CASES) {
    assertNum(
      applyPreHighGradePenalty(schoolType, grade, convertedGrade),
      expected,
      `applyPreHighGradePenalty(${String(schoolType)}, ${String(grade)}, ${String(convertedGrade)})`,
    );
  }
});

test("calcNaesinProb — 지수감쇠 두 갈래 + 시간계수", () => {
  for (const [
    currentGrade,
    targetCut,
    remainExams,
    totalExams,
    expected,
  ] of NAESIN_PROB_CASES) {
    const label = `calcNaesinProb(${String(currentGrade)}, ${String(targetCut)}, ${String(remainExams)}, ${String(totalExams)})`;
    // NAESIN_PROB_CASES 는 방어 동작 검증용으로 문자열("abc")도 섞여 있다 —
    // calcNaesinProb 시그니처(remainExams/totalExams: number)와 다르므로 캐스팅만 한다.
    const actual =
      totalExams === undefined
        ? calcNaesinProb(currentGrade, targetCut, remainExams as number)
        : calcNaesinProb(
            currentGrade,
            targetCut,
            remainExams as number,
            totalExams as number,
          );
    assertNum(actual, expected, label);
  }
});

// 기본 totalExams 가 10 인지 명시 확인 (원본 시그니처 기본값).
test("calcNaesinProb — totalExams 기본값은 10", () => {
  assertNum(
    calcNaesinProb(2, 3, 5),
    calcNaesinProb(2, 3, 5, 10),
    "totalExams 생략 === 10",
  );
});

test("toNum — 유한수가 아니면 fallback", () => {
  expect(toNum(3)).toBe(3);
  expect(toNum("3.5")).toBe(3.5);
  expect(toNum("")).toBe(0);
  expect(toNum(null)).toBe(0);
  expect(toNum(undefined)).toBe(0);
  expect(toNum("abc")).toBe(0);
  expect(toNum(NaN)).toBe(0);
  expect(toNum(Infinity)).toBe(0);
  expect(toNum(-Infinity)).toBe(0);
  expect(toNum("abc", 7)).toBe(7);
  expect(toNum(undefined, -1)).toBe(-1);
  expect(toNum(0, 5)).toBe(0);
});
