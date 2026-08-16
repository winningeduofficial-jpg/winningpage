// 채점 엔진 회귀 테스트 (node:test).
//
// verify-diagnosis-scoring.mjs 는 리포트 조립·문구 계약을 훑지만, 아래 세 축은
// 그 스크립트가 실행경로로 커버하지 못하던 공백이라 여기서 직접 단언한다:
//   1. sortByScoreAsc 의 동점(diff===0) 분기 — 실 데이터는 6영역 점수가 전부 상이해
//      타이브레이크가 한 번도 실행되지 않았다.
//   2. admissionBand 의 부분 컷(cut50/cut70 한쪽 null) 대체마진 — "스윕 실측" 주석만 있고
//      자동 단언이 없었다.
//   3. 경계값(45/60/70/80·±0.30)과 부동소수점 정규화 — 코드 3곳에 흩어져 있어 회귀 무방비였다.
//
// 실행: cd <repo> && npm test -- src/lib/diagnosisScoring.test.ts

import { expect, test } from "vitest";
import { PAGE1_AREAS } from "@/data/diagnosisScoringTable.ts";
import {
  admissionBand,
  levelOf,
  roundHalfUp,
  sortByScoreAsc,
  stateOf,
} from "./diagnosisScoring.js";

// ── 1. sortByScoreAsc 동점 타이브레이크 ─────────────────────────────
// 규칙(§4.2.1): 점수 오름차순, 동점이면 areas 배열의 인덱스 순으로 가른다.
// 실 리포트 데이터는 6영역이 전부 상이해 이 분기가 실행된 적이 없다.

test("sortByScoreAsc: 전 영역 동점이면 입력 배열 순서를 그대로 보존한다", () => {
  const scores = {
    GOAL: 50,
    PLAN: 50,
    EXEC: 50,
    TIME: 50,
    FEEDBACK: 50,
    STABILITY: 50,
  };
  expect(sortByScoreAsc(PAGE1_AREAS, scores)).toEqual([
    "GOAL",
    "PLAN",
    "EXEC",
    "TIME",
    "FEEDBACK",
    "STABILITY",
  ]);
});

test("sortByScoreAsc: 부분 동점 — 최저는 앞으로, 동점 묶음은 인덱스 순", () => {
  // EXEC(40)만 최저 → 맨 앞. 나머지 50 동점 5개는 PAGE1_AREAS 인덱스 순.
  const scores = {
    GOAL: 50,
    PLAN: 50,
    EXEC: 40,
    TIME: 50,
    FEEDBACK: 50,
    STABILITY: 50,
  };
  expect(sortByScoreAsc(PAGE1_AREAS, scores)).toEqual([
    "EXEC",
    "GOAL",
    "PLAN",
    "TIME",
    "FEEDBACK",
    "STABILITY",
  ]);
});

test("sortByScoreAsc: 타이브레이크는 입력한 areas 배열 순서를 따른다(전역 상수 아님)", () => {
  // 같은 점수를 다른 순서 배열로 넘기면 그 배열 순서가 타이브레이크 기준이 된다.
  const scores = { GOAL: 50, PLAN: 50 };
  expect(sortByScoreAsc(["PLAN", "GOAL"], scores)).toEqual(["PLAN", "GOAL"]);
  expect(sortByScoreAsc(["GOAL", "PLAN"], scores)).toEqual(["GOAL", "PLAN"]);
});

// ── 2. admissionBand 부분 컷 대체마진 ───────────────────────────────
// normalizedCuts(§4.6): 한쪽 컷만 있으면 ±ADMISSION_MARGIN(0.30)으로 반대쪽을 세운다.
//   c50 = cut50 ?? cut70 - 0.30,  c70 = cut70 ?? cut50 + 0.30
// 내신은 낮을수록 유리 — mine<=c50 STABLE, mine<=c70 FIT, mine<=c70+0.30 REACH, 그 밖 RISK.

test("admissionBand: 양쪽 컷 — 경계값 4구간", () => {
  const cuts = { cut50: 2.0, cut70: 2.5 }; // reach = 2.8
  expect(admissionBand(2.0, cuts)).toBe("STABLE"); // <= c50
  expect(admissionBand(2.01, cuts)).toBe("FIT");
  expect(admissionBand(2.5, cuts)).toBe("FIT"); // == c70
  expect(admissionBand(2.51, cuts)).toBe("REACH");
  expect(admissionBand(2.8, cuts)).toBe("REACH"); // == reach
  expect(admissionBand(2.81, cuts)).toBe("RISK");
});

test("admissionBand: cut70만 있으면 c50 = cut70 - 0.30 으로 STABLE 경계를 세운다", () => {
  const cuts = { cut50: null, cut70: 2.5 }; // c50 = 2.2, c70 = 2.5
  expect(admissionBand(2.2, cuts)).toBe("STABLE"); // == 대체 c50
  expect(admissionBand(2.3, cuts)).toBe("FIT");
});

test("admissionBand: cut50만 있으면 c70 = cut50 + 0.30 으로 FIT 경계를 세운다", () => {
  const cuts = { cut50: 2.0, cut70: null }; // c70 = 2.3, reach = 2.6
  expect(admissionBand(2.0, cuts)).toBe("STABLE");
  expect(admissionBand(2.3, cuts)).toBe("FIT"); // == 대체 c70
  expect(admissionBand(2.4, cuts)).toBe("REACH");
});

test("admissionBand: 컷이 둘 다 없으면 null(= BAND_NODATA 신호)", () => {
  expect(admissionBand(2.5, { cut50: null, cut70: null })).toBe(null);
  expect(admissionBand(2.5, null)).toBe(null);
});

// ── 3. 경계값·부동소수점 정규화 ─────────────────────────────────────

test("levelOf: 5밴드 경계(80/70/60/45)는 하한 포함", () => {
  expect(levelOf(80)).toBe("L1");
  expect(levelOf(79.9)).toBe("L2");
  expect(levelOf(70)).toBe("L2");
  expect(levelOf(69.9)).toBe("L3");
  expect(levelOf(60)).toBe("L3");
  expect(levelOf(59.9)).toBe("L4");
  expect(levelOf(45)).toBe("L4");
  expect(levelOf(44.9)).toBe("L5");
});

test("stateOf: 4상태 경계(70/60/45)는 하한 포함", () => {
  expect(stateOf(70)).toBe("TOP");
  expect(stateOf(69.9)).toBe("MID");
  expect(stateOf(60)).toBe("MID");
  expect(stateOf(59.9)).toBe("LOW");
  expect(stateOf(45)).toBe("LOW");
  expect(stateOf(44.9)).toBe("WEAK");
});

test("roundHalfUp: 정확히 절반은 위로(4.475→4.48, 2.5→3, 69.95→70)", () => {
  // EPSILON 방식이 4.475→4.47 로 틀리던 자리 — toPrecision(15) 로 교정된 회귀 지점.
  expect(roundHalfUp(4.475, 2)).toBe(4.48);
  expect(roundHalfUp(2.5, 0)).toBe(3);
  expect(roundHalfUp(69.95, 1)).toBe(70);
});

test("admissionBand: reach 경계의 부동소수점 정규화(2.8+0.3≠3.1 함정)", () => {
  // reach = roundHalfUp(c70 + 0.30, 2). 정규화 없이 c70=2.8 이면 2.8+0.3=3.0999999999999996
  // 이라 mine=3.1 이 reach 를 넘어 RISK 로 오분류된다. 정규화가 살아 있으면 REACH.
  const cuts = { cut50: 2.5, cut70: 2.8 }; // reach 는 3.10 으로 정규화돼야 한다
  expect(admissionBand(3.1, cuts)).toBe("REACH");
});
