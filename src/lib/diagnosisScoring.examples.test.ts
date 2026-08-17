// diagnosisScoring 엔진 — 배점표 05_예시 재현(§8 CASE-01·02).
// 원본: scripts/verify-diagnosis-scoring.mjs S4·S5.

import { expect, test } from "vitest";
import {
  AREA_CODES,
  AREA_LABEL,
  BADGES,
  EXAMPLE_CASES,
  EXAMPLE_CASES_MIN_ASSERTIONS,
  TARGET_SCORE,
} from "@/data/diagnosisScoringTable.ts";
import {
  levelOf,
  overallScore,
  priorityBadges,
  roundHalfUp,
  scoreAreas,
  targetGap,
} from "@/lib/diagnosisScoring.ts";
import { getCase, makeInput } from "./diagnosisScoringTestFixtures.ts";

/* ================================================================== *
 * S4. §8 CASE-01 — 계획 설계 단일 영역 (배점표 05_예시)
 * ================================================================== */

const ex01 = getCase("EX-01");
const case01Input = makeInput({
  likert1: ex01.input.likert1,
  obstacles: ex01.input.obstacles,
});
const case01Areas = scoreAreas(case01Input) as Record<string, number>;

// 척도 평균 37.5 → × 0.7 = 26.25(중간값이라 반올림하지 않는다) + max(0, 30 − 15) = 41.25 → 41.
//
// 척도 파트는 export 되지 않으므로 감점 없는 같은 입력에서 base(30)를 빼 역산한다. 리터럴 산술식을
// 픽스처 리터럴과 비교하던 옛 단언은 엔진을 한 줄도 태우지 않아 어떤 구현에서도 통과했다.
const case01ScaleOnly = scoreAreas(
  makeInput({ likert1: ex01.input.likert1 }),
) as Record<string, number>;
test(`척도 파트 = ${ex01.expected.scalePart} → base 30 을 더해 반올림하면 56`, () => {
  expect(case01ScaleOnly.PLAN ?? null).toEqual(
    roundHalfUp(ex01.expected.scalePart + 30, 0),
  );
});
test("감점 −15 가 걸린 nonScalePart = 15", () => {
  expect((case01ScaleOnly.PLAN ?? 0) - (case01Areas.PLAN ?? 0)).toEqual(15);
});
test("계획 설계 areaScore = 41", () => {
  expect(case01Areas.PLAN ?? null).toEqual(ex01.expected.areaScore.PLAN);
});
// B-02 의 근거. 정수 base 위에서는 두 반올림 순서가 같은 값을 내므로 areaScore 경로에서는
// 차이가 드러나지 않는다 — 실제 회귀 방지선은 CASE-09 의 roundHalfUp 표다.
test("중간값 사전 반올림과 사후 반올림이 같은 값을 낸다(B-02 근거)", () => {
  expect([
    roundHalfUp(roundHalfUp(26.25, 1) + 15, 0),
    roundHalfUp(26.25 + 15, 0),
  ]).toEqual([41, 41]);
});
test("12영역 전부 유한수", () => {
  expect(AREA_CODES.every((area) => Number.isFinite(case01Areas[area]))).toBe(
    true,
  );
});
test("12영역 전부 0~100 정수", () => {
  expect(
    AREA_CODES.every(
      (area) =>
        Number.isInteger(case01Areas[area]) &&
        (case01Areas[area] ?? -1) >= 0 &&
        (case01Areas[area] ?? 101) <= 100,
    ),
  ).toBe(true);
});

/* ================================================================== *
 * S5. §8 CASE-02 — 종합·등급·시급 영역·목표 부족분·뱃지
 * ================================================================== */

const ex02 = getCase("EX-02");
const case02Areas = ex02.input.areaScores;

test("page1 종합 = 56.3 (338/6)", () => {
  expect(overallScore(case02Areas, 1)).toEqual(ex02.expected.page1Overall);
});
test("등급 = L4", () => {
  expect(levelOf(overallScore(case02Areas, 1))).toEqual(ex02.expected.level);
});

const gap02 = targetGap(case02Areas);
test("가장 시급한 영역 = 실행 지속", () => {
  expect(gap02.lowestCode).toEqual(ex02.expected.lowestArea);
});
test("시급 영역 점수 = 39", () => {
  expect(gap02.lowestScore).toEqual(ex02.expected.lowestScore);
});
test(`목표까지 = ${TARGET_SCORE} − 39 = 36`, () => {
  expect(gap02.gap).toEqual(ex02.expected.gap);
});
test("gap > 0 이므로 reached = false", () => {
  expect(gap02.reached).toEqual(false);
});

const badges02 = priorityBadges(case02Areas);
test("뱃지 개수 = BADGES 개수 = 6 (§7.4.3)", () => {
  expect(badges02.length).toEqual(BADGES.length);
});
test("뱃지 배정", () => {
  expect(
    Object.fromEntries(badges02.map((row) => [row.code, row.badge])),
  ).toEqual(ex02.expected.badges);
});
test("뱃지 정렬은 점수 오름차순", () => {
  expect(badges02.map((row) => row.score)).toEqual([39, 41, 56, 60, 65, 77]);
});
test("뱃지 영역명은 AREA_LABEL 이 정본", () => {
  expect(badges02[0]?.name).toEqual(AREA_LABEL.EXEC);
});

/* ================================================================== *
 * 메타 — 케이스를 지우면서 pending 만 남기는 침묵 약화를 막는 하한선
 * ================================================================== */

test("EXAMPLE_CASES 의 비-pending 픽스처가 하한 이상이다", () => {
  expect(
    EXAMPLE_CASES.filter((item) => !item.pending).length,
  ).toBeGreaterThanOrEqual(EXAMPLE_CASES_MIN_ASSERTIONS);
});
