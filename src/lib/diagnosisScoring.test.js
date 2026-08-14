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
// 실행: cd <repo> && node --test src/lib/diagnosisScoring.test.js
//   (또는 npm run test:diagnosis)

import assert from "node:assert/strict";
import { test } from "node:test";
import { PAGE1_AREAS } from "../data/diagnosisScoringTable.js";
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
  assert.deepEqual(sortByScoreAsc(PAGE1_AREAS, scores), [
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
  assert.deepEqual(sortByScoreAsc(PAGE1_AREAS, scores), [
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
  assert.deepEqual(sortByScoreAsc(["PLAN", "GOAL"], scores), ["PLAN", "GOAL"]);
  assert.deepEqual(sortByScoreAsc(["GOAL", "PLAN"], scores), ["GOAL", "PLAN"]);
});

// ── 2. admissionBand 부분 컷 대체마진 ───────────────────────────────
// normalizedCuts(§4.6): 한쪽 컷만 있으면 ±ADMISSION_MARGIN(0.30)으로 반대쪽을 세운다.
//   c50 = cut50 ?? cut70 - 0.30,  c70 = cut70 ?? cut50 + 0.30
// 내신은 낮을수록 유리 — mine<=c50 STABLE, mine<=c70 FIT, mine<=c70+0.30 REACH, 그 밖 RISK.

test("admissionBand: 양쪽 컷 — 경계값 4구간", () => {
  const cuts = { cut50: 2.0, cut70: 2.5 }; // reach = 2.8
  assert.equal(admissionBand(2.0, cuts), "STABLE"); // <= c50
  assert.equal(admissionBand(2.01, cuts), "FIT");
  assert.equal(admissionBand(2.5, cuts), "FIT"); // == c70
  assert.equal(admissionBand(2.51, cuts), "REACH");
  assert.equal(admissionBand(2.8, cuts), "REACH"); // == reach
  assert.equal(admissionBand(2.81, cuts), "RISK");
});

test("admissionBand: cut70만 있으면 c50 = cut70 - 0.30 으로 STABLE 경계를 세운다", () => {
  const cuts = { cut50: null, cut70: 2.5 }; // c50 = 2.2, c70 = 2.5
  assert.equal(admissionBand(2.2, cuts), "STABLE"); // == 대체 c50
  assert.equal(admissionBand(2.3, cuts), "FIT");
});

test("admissionBand: cut50만 있으면 c70 = cut50 + 0.30 으로 FIT 경계를 세운다", () => {
  const cuts = { cut50: 2.0, cut70: null }; // c70 = 2.3, reach = 2.6
  assert.equal(admissionBand(2.0, cuts), "STABLE");
  assert.equal(admissionBand(2.3, cuts), "FIT"); // == 대체 c70
  assert.equal(admissionBand(2.4, cuts), "REACH");
});

test("admissionBand: 컷이 둘 다 없으면 null(= BAND_NODATA 신호)", () => {
  assert.equal(admissionBand(2.5, { cut50: null, cut70: null }), null);
  assert.equal(admissionBand(2.5, null), null);
});

// ── 3. 경계값·부동소수점 정규화 ─────────────────────────────────────

test("levelOf: 5밴드 경계(80/70/60/45)는 하한 포함", () => {
  assert.equal(levelOf(80), "L1");
  assert.equal(levelOf(79.9), "L2");
  assert.equal(levelOf(70), "L2");
  assert.equal(levelOf(69.9), "L3");
  assert.equal(levelOf(60), "L3");
  assert.equal(levelOf(59.9), "L4");
  assert.equal(levelOf(45), "L4");
  assert.equal(levelOf(44.9), "L5");
});

test("stateOf: 4상태 경계(70/60/45)는 하한 포함", () => {
  assert.equal(stateOf(70), "TOP");
  assert.equal(stateOf(69.9), "MID");
  assert.equal(stateOf(60), "MID");
  assert.equal(stateOf(59.9), "LOW");
  assert.equal(stateOf(45), "LOW");
  assert.equal(stateOf(44.9), "WEAK");
});

test("roundHalfUp: 정확히 절반은 위로(4.475→4.48, 2.5→3, 69.95→70)", () => {
  // EPSILON 방식이 4.475→4.47 로 틀리던 자리 — toPrecision(15) 로 교정된 회귀 지점.
  assert.equal(roundHalfUp(4.475, 2), 4.48);
  assert.equal(roundHalfUp(2.5, 0), 3);
  assert.equal(roundHalfUp(69.95, 1), 70);
});

test("admissionBand: reach 경계의 부동소수점 정규화(2.8+0.3≠3.1 함정)", () => {
  // reach = roundHalfUp(c70 + 0.30, 2). 정규화 없이 c70=2.8 이면 2.8+0.3=3.0999999999999996
  // 이라 mine=3.1 이 reach 를 넘어 RISK 로 오분류된다. 정규화가 살아 있으면 REACH.
  const cuts = { cut50: 2.5, cut70: 2.8 }; // reach 는 3.10 으로 정규화돼야 한다
  assert.equal(admissionBand(3.1, cuts), "REACH");
});
