// diagnosisScoring 엔진 — 긴급도(§8 CASE-03, Q-12 해소 ALL_12 정본) + 4단계 라벨.
// 원본: scripts/verify-diagnosis-scoring.mjs S6 · 긴급도 4단계 라벨 블록.

import { expect, test } from "vitest";
import {
  URGENCY_AREA_THRESHOLD,
  URGENCY_BANDS,
  URGENCY_LEVEL_LABEL,
  URGENCY_SCOPE,
} from "@/data/diagnosisScoringTable.ts";
import { urgencyOf } from "@/lib/diagnosisScoring.ts";
import {
  getCase,
  makeAreaScores,
  makeInput,
} from "./diagnosisScoringTestFixtures.ts";

/* ================================================================== *
 * S6. §8 CASE-03 — 긴급도 (Q-12 해소 — ALL_12 정본)
 * ================================================================== */

const ex03 = getCase("EX-03");
// diagnosisScoring.examples.test.ts 의 case02Areas 와 동일한 EX-02 픽스처 — PAGE1 은 05_예시
// 값 그대로(40 미만 1개), PAGE2 는 원문에 없어 40 미만 2개를 합성한다.
// URGENCY_SCOPE='ALL_12' 가 정본이라 3개가 되어 예시의 50점이 재현된다(Q-12 해소, 사용자 확정).
const case02Areas = getCase("EX-02").input.areaScores;
const case03Areas = makeAreaScores(60, {
  ...case02Areas,
  RECORD: 20,
  STRATEGY: 30,
});
const urgency03 = urgencyOf(
  makeInput({ schedule: ex03.input.schedule }),
  case03Areas,
);

test("urgencyScore = 20 + 3×10 = 50", () => {
  expect(urgency03.score).toEqual(ex03.expected.urgencyScore);
});
test("urgencyLevel = L4", () => {
  expect(urgency03.level).toEqual(ex03.expected.urgencyLevel);
});
test("40 미만 영역 수 = 3", () => {
  expect(urgency03.lowAreaCount).toEqual(ex03.input.lowAreaCount);
});

// 집계 범위 자체는 가정이 아니라 상수다 — PAGE1 로 뒤집히면 여기서 먼저 드러난다.
test("URGENCY_SCOPE = 'ALL_12' (A2)", () => {
  expect(URGENCY_SCOPE).toEqual("ALL_12");
});
// 임계 40 은 다른 경계(45/60/70/80)와 어긋나지만 배점표 원문이다. A1 을 뒤집어도 따라가면 안 된다.
test("URGENCY_AREA_THRESHOLD = 40 (AREA_BAND_THRESHOLDS 와 분리)", () => {
  expect(URGENCY_AREA_THRESHOLD).toEqual(40);
});
test("경계 정확히 40 인 영역은 카운트 제외(< 비교)", () => {
  expect(urgencyOf(makeInput(), makeAreaScores(40)).lowAreaCount === 0).toBe(
    true,
  );
});
test("39 인 영역은 12개 전부 카운트", () => {
  expect(urgencyOf(makeInput(), makeAreaScores(39)).lowAreaCount === 12).toBe(
    true,
  );
});

/* ---- 긴급도 4단계 라벨(배점표 141행 원문 — 창작 아님) ---- */

test("URGENCY_LEVEL_LABEL 4단계", () => {
  expect(Object.keys(URGENCY_LEVEL_LABEL).length).toEqual(4);
});
test("URGENCY_LEVEL_LABEL 키는 URGENCY_BANDS + L1 과 정확히 대응", () => {
  expect(
    ["L2", "L3", "L4"].every(
      (key) => URGENCY_BANDS[key] != null && URGENCY_LEVEL_LABEL[key] != null,
    ) && URGENCY_LEVEL_LABEL.L1 != null,
  ).toBe(true);
});
