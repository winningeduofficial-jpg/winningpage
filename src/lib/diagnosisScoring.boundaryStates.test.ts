// diagnosisScoring 엔진 — 경계값 회귀(§8 CASE-07, Q-32 해소 45/60/70 정본).
// 원본: scripts/verify-diagnosis-scoring.mjs S9.

import { expect, test } from "vitest";

import {
  AREA_BAND_THRESHOLDS,
  SCORE_BANDS,
  STATE_TONE,
} from "@/data/diagnosisScoringTable.ts";
import { levelOf, stateOf, toneOf } from "@/lib/diagnosisScoring.ts";

/* ================================================================== *
 * S9. §8 CASE-07 — 경계값 회귀 (Q-32 해소 — 45/60/70 정본)
 * ================================================================== */

// levelOf 는 배점표 원문 80/70/60/45 그대로다(Q-11 은 포함 방향만 다퉜고 명세가
// '>= 상단 포함'으로 확정 요청했다). stateOf·toneOf 도 배점표 02_영역_구성이 "영역 상태 …
// (70·60·45 기준)"으로 직접 명시해 45/60/70 이 정본으로 확정됐다(Q-32 해소, 사용자 확정
// 2026-08-11) — 승인된 디자인 샘플이 함의하던 40/50/70 은 폐기됐다.

[
  [80.0, "L1", "TOP", "blue"],
  [79.9, "L2", "TOP", "blue"],
  [70.0, "L2", "TOP", "blue"],
  [69.9, "L3", "MID", "blue"],
  [60.0, "L3", "MID", "blue"],
  [59.9, "L4", "LOW", "amber"],
  [45.0, "L4", "LOW", "amber"],
  [44.9, "L5", "WEAK", "red"],
].forEach(([score, level, state, tone]) => {
  test(`levelOf(${score})`, () => {
    expect(levelOf(score)).toEqual(level);
  });
  test(`stateOf(${score})`, () => {
    expect(stateOf(score)).toEqual(state);
  });
  test(`toneOf(${score})`, () => {
    expect(toneOf(score)).toEqual(tone);
  });
});

test("SCORE_BANDS = 80/70/60/45", () => {
  expect(SCORE_BANDS).toEqual({
    L1: 80,
    L2: 70,
    L3: 60,
    L4: 45,
  });
});
test("AREA_BAND_THRESHOLDS = 70/60/45 (A1 정본, Q-32 해소)", () => {
  expect(AREA_BAND_THRESHOLDS).toEqual({ TOP: 70, MID: 60, LOW: 45 });
});
// tone 을 stateOf 에서 파생시키지 않고 별도 임계를 두면 Q-32 확정 시 라벨과 색이 어긋난다.
test("toneOf 는 stateOf 에서 파생된다(임계 이중화 금지)", () => {
  expect(
    [0, 44.9, 45, 59.9, 60, 69.9, 70, 100].every(
      (score) => toneOf(score) === STATE_TONE[stateOf(score)],
    ),
  ).toBe(true);
});
