// diagnosisScoring 엔진 — ROUND_HALF_UP(§8 CASE-09) · 등급 변환 앵커(§8 CASE-06).
// 원본: scripts/verify-diagnosis-scoring.mjs S2·S3.

import { expect, test } from "vitest";

import { convertToNineScale, roundHalfUp } from "@/lib/diagnosisScoring.ts";

/* ================================================================== *
 * S2. §8 CASE-09 — ROUND_HALF_UP (B-01 회귀)
 * ================================================================== */

// rev.1 은 `Math.round(x * 100 + Number.EPSILON) / 100` 이었다. EPSILON 은 절대값이라
// 크기 1 이상 피연산자에서 흡수돼 no-op 이 되고, 4.475 * 100 === 447.49999999999994 →
// 4.47 이 나왔다. 이 표가 그 버그의 회귀 방지선이다.
test("roundHalfUp(4.475, 2) = 4.48", () => {
  expect(roundHalfUp(4.475, 2)).toEqual(4.48);
});
test("roundHalfUp(1.005, 2) = 1.01", () => {
  expect(roundHalfUp(1.005, 2)).toEqual(1.01);
});
test("roundHalfUp(0.145, 2) = 0.15", () => {
  expect(roundHalfUp(0.145, 2)).toEqual(0.15);
});
test("roundHalfUp(8.165, 2) = 8.17", () => {
  expect(roundHalfUp(8.165, 2)).toEqual(8.17);
});
// 이 한 줄이 틀리면 HS5 룩업이 1행 밀린다 — 등급 변환 전체가 조용히 어긋난다.
test("roundHalfUp(1.135 * 100, 0) = 114", () => {
  expect(roundHalfUp(1.135 * 100, 0)).toEqual(114);
});
test("roundHalfUp(41.25, 0) = 41", () => {
  expect(roundHalfUp(41.25, 0)).toEqual(41);
});
test("roundHalfUp(56.3333, 1) = 56.3", () => {
  expect(roundHalfUp(56.3333, 1)).toEqual(56.3);
});
test("roundHalfUp(null) = null", () => {
  expect(roundHalfUp(null, 2)).toEqual(null);
});

/* ================================================================== *
 * S3. §8 CASE-06 — 등급 변환 앵커
 * ================================================================== */

[
  ["FIVE", 1.0, 1.55],
  ["FIVE", 2.0, 3.24], // 05_예시의 '내 내신 3.24'와 같은 값이어야 한다
  ["FIVE", 3.0, 4.78],
  ["FIVE", 4.0, 6.31],
  ["FIVE", 4.83, 7.51], // 변곡점 직전
  ["FIVE", 4.84, 7.57], // 변곡점
  ["FIVE", 5.0, 8.89],
  ["MIDDLE_AVG", 100.0, 2.33],
  ["MIDDLE_AVG", 96.0, 3.0],
  ["MIDDLE_AVG", 90.0, 4.0],
  ["MIDDLE_AVG", 77.2, 5.0],
  ["MIDDLE_AVG", 64.4, 6.0],
  ["MIDDLE_AVG", 51.6, 7.0],
  ["MIDDLE_AVG", 38.7, 8.0],
  ["MIDDLE_AVG", 26.0, 9.0],
  ["NINE", 3.24, 3.24], // 무변환
].forEach(([system, raw, expected]) => {
  test(`convertToNineScale('${system}', ${raw})`, () => {
    expect(convertToNineScale(system, raw)).toEqual(expected);
  });
});

test("convertToNineScale('UNKNOWN', 3.24) = null", () => {
  expect(convertToNineScale("UNKNOWN", 3.24)).toEqual(null);
});
test("convertToNineScale('FIVE', null) = null", () => {
  expect(convertToNineScale("FIVE", null)).toEqual(null);
});
// 정의역 밖은 clamp 다(Q-08 잠정). 값을 창작하지 않고 표 양 끝으로 접는다.
test("convertToNineScale('FIVE', 0.5) = 1.55(하한 clamp)", () => {
  expect(convertToNineScale("FIVE", 0.5)).toEqual(1.55);
});
test("convertToNineScale('MIDDLE_AVG', 10) = 9.00(하한 clamp)", () => {
  expect(convertToNineScale("MIDDLE_AVG", 10)).toEqual(9.0);
});

// F-16(2026-08-12 확정, Q-30 종결) — q1(학년)×q4(등급 체계) 불일치를 검증하지 않기로 했다(그대로
// 둔다 — 조기입학·검정고시 등 실제 예외가 있을 수 있어 학생을 막는 개입은 하지 않는다).
// convertToNineScale 은 gradeSystem 값만 보고 q1 을 인자로 받지 않는다 — 통상 조합과 다른
// 학년(중3+9등급제 등)이어도 값은 조용히 버려지지 않고 정상 변환된다(입력을 존중한다).
test("F-16 — 통상 조합과 다른 학년(중3)에서도 9등급제 값은 정상 변환된다(진행 차단·값 무효화 없음)", () => {
  expect(convertToNineScale("NINE", 3.24)).toEqual(3.24);
});
test("F-16 — convertToNineScale 은 gradeSystem 만 보고 q1 을 받지 않는다(검증 분기 재도입 없음)", () => {
  expect(convertToNineScale.length === 2).toBe(true);
});
