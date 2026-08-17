// diagnosisScoring 엔진 — 선택지 서수 계약(§3.5) 회귀 검증.
// 원본: scripts/verify-diagnosis-scoring.mjs S1. 선택지 서수가 UI·채점 양쪽에서 어긋나면
// 조용히 오채점된다.

import { expect, test } from "vitest";
import {
  DIFFICULTY_DEDUCTIONS,
  EXCLUSIVE_CODES,
  LIKERT1_KEYS,
  LIKERT2_KEYS,
  OBSTACLE_DEDUCTIONS,
  OPTION_CODES,
  OPTION_SOURCE_QUESTION,
} from "@/data/diagnosisScoringTable.ts";
import { renewalSurveyQuestions } from "@/data/renewalSurveyQuestions.ts";
import {
  optionsOf,
  questionById,
  statementsOf,
} from "./diagnosisScoringTestFixtures.ts";

/* ================================================================== *
 * S1. §3.5 적재 검증식 — 선택지 서수 계약
 * ================================================================== */

test("q10 선택지 13지", () => {
  expect(optionsOf("q10").length).toEqual(13);
});
test("q10 마지막 = 배타(OBS_13)", () => {
  expect(questionById.get("q10")?.exclusiveCodes ?? []).toEqual([
    EXCLUSIVE_CODES.OBSTACLE,
  ]);
});
test("q10 배타 라벨 = 마지막 선택지", () => {
  expect(questionById.get("q10")?.exclusiveValues ?? []).toEqual([
    optionsOf("q10").at(-1),
  ]);
});
test("q12 선택지 14지", () => {
  expect(optionsOf("q12").length).toEqual(14);
});
test("q12 마지막 = 배타(DIF_14)", () => {
  expect(questionById.get("q12")?.exclusiveCodes ?? []).toEqual([
    EXCLUSIVE_CODES.DIFFICULTY,
  ]);
});
test("q12 배타 라벨 = 마지막 선택지", () => {
  expect(questionById.get("q12")?.exclusiveValues ?? []).toEqual([
    optionsOf("q12").at(-1),
  ]);
});
test("q14 선택지 10지", () => {
  expect(optionsOf("q14").length).toEqual(10);
});
test("q9 문장 12개", () => {
  expect(statementsOf("q9").length).toEqual(12);
});
test("q11 문장 12개", () => {
  expect(statementsOf("q11").length).toEqual(12);
});

// 저장 키 승격(T2) 이후 statements[i].key 가 곧 안정 키다. 승격 전 문자열 배열이면 키가 '0'.. 라
// 정규화가 전부 결측이 되므로, 여기서 형태까지 못박는다.
test("q9 문장 키 = LIKERT1_KEYS", () => {
  expect(
    statementsOf("q9").map((s) => (typeof s === "string" ? null : s?.key)),
  ).toEqual(LIKERT1_KEYS);
});
test("q11 문장 키 = LIKERT2_KEYS", () => {
  expect(
    statementsOf("q11").map((s) => (typeof s === "string" ? null : s?.key)),
  ).toEqual(LIKERT2_KEYS);
});

// OPTION_CODES 는 서수 → 코드 단방향 맵이라 길이가 어긋나는 순간 조용히 오채점된다.
Object.entries(OPTION_CODES).forEach(([group, codes]) => {
  const questionId = OPTION_SOURCE_QUESTION[group];
  test(`OPTION_CODES.${group} 길이 = ${questionId}.options 길이`, () => {
    expect(codes.length).toEqual(optionsOf(questionId).length);
  });
});

// 문항이 직접 들고 있는 optionCodes 와도 대조한다 — 둘이 갈라지면 UI 와 채점이 다른 코드를 쓴다.
// **전 그룹**을 돈다. 3그룹만 보던 시절에는 나머지 10그룹이 갈라져도 조용히 오채점됐다.
Object.entries(OPTION_SOURCE_QUESTION).forEach(([group, questionId]) => {
  test(`${questionId}.optionCodes = OPTION_CODES.${group}`, () => {
    expect(questionById.get(questionId)?.optionCodes ?? []).toEqual(
      OPTION_CODES[group],
    );
  });
});

// 선택지가 전부 순수 문자열이라는 것이 라벨→서수 변환(indexOf)의 전제다. 객체형이 섞이면
// getOptionCode 가 -1 을 내고 해당 문항 전체가 미응답으로 채점된다.
test("전 문항의 options 는 문자열 배열", () => {
  expect(
    renewalSurveyQuestions.every((question) =>
      (question.options ?? []).every((option) => typeof option === "string"),
    ),
  ).toBe(true);
});

test("감점표(OBSTACLE) 13종 전량 정의", () => {
  expect(Object.keys(OBSTACLE_DEDUCTIONS)).toEqual(OPTION_CODES.OBSTACLE);
});
test("감점표(DIFFICULTY) 14종 전량 정의", () => {
  expect(Object.keys(DIFFICULTY_DEDUCTIONS)).toEqual(OPTION_CODES.DIFFICULTY);
});
test("배타 코드는 감점 0 (OBS_13)", () => {
  expect(OBSTACLE_DEDUCTIONS.OBS_13).toEqual({
    area: null,
    points: 0,
  });
});
test("배타 코드는 감점 0 (DIF_14)", () => {
  expect(DIFFICULTY_DEDUCTIONS.DIF_14).toEqual({
    area: null,
    points: 0,
  });
});
