// QA 행348(2026-09-02) — q4(등급 체계) 선택 단계를 없애고 q1(학년)으로 자동 결정한다.
// getGradeSystemLabelForGradeLevel 이 그 매핑의 유일한 정본이다(SurveyStepShell.setAnswer 가 그대로 호출).

import { expect, test } from "vitest";
import {
  getGradeSystemLabelForGradeLevel,
  getOptionCode,
  renewalSurveyQuestions,
} from "./renewalSurveyQuestions.ts";

// 매핑: 중학생 → 중학생 평균 / 고1·고2 → 5등급제 / 고3·N수생 → 9등급제.
test("중학생 → 중학생 평균", () => {
  expect(getGradeSystemLabelForGradeLevel("중학생")).toEqual("중학생 평균");
});
test("고등학교 1학년 → 5등급제", () => {
  expect(getGradeSystemLabelForGradeLevel("고등학교 1학년")).toEqual("5등급제");
});
test("고등학교 2학년 → 5등급제", () => {
  expect(getGradeSystemLabelForGradeLevel("고등학교 2학년")).toEqual("5등급제");
});
test("고등학교 3학년 → 9등급제", () => {
  expect(getGradeSystemLabelForGradeLevel("고등학교 3학년")).toEqual("9등급제");
});
test("N수생 → 9등급제", () => {
  expect(getGradeSystemLabelForGradeLevel("N수생")).toEqual("9등급제");
});
test("미지 라벨(또는 미응답)은 null — 호출부가 answers.q4 를 건드리지 않는다", () => {
  expect(getGradeSystemLabelForGradeLevel("존재하지 않는 학년")).toEqual(null);
});

// 반환 라벨이 q4.options 에 실제로 존재하는지 왕복 검증 — getOptionCode("q4", ...) 로 되돌려도
// 배점표 코드(NINE/FIVE/MIDDLE_AVG)와 일치해야 codeOf("Q4_SYSTEM", answers.q4) 채점 경로가 산다.
test("반환 라벨은 q4 선택지에 실존하고 코드로 되돌아간다", () => {
  const cases: [string, string][] = [
    ["중학생", "MIDDLE_AVG"],
    ["고등학교 1학년", "FIVE"],
    ["고등학교 2학년", "FIVE"],
    ["고등학교 3학년", "NINE"],
    ["N수생", "NINE"],
  ];
  cases.forEach(([gradeLevelLabel, expectedCode]) => {
    const q4Label = getGradeSystemLabelForGradeLevel(gradeLevelLabel);
    expect(getOptionCode("q4", q4Label)).toEqual(expectedCode);
  });
});

// QA 행348 — q4 카드는 화면에서 사라졌지만 데이터(scoringId·optionCodes)는 남아 있어야
// codeOf("Q4_SYSTEM", answers.q4) 와 과거 저장 응답(UNKNOWN 포함) 호환이 유지된다.
test("q4 는 number: null(화면 비노출)이지만 scoringId·optionCodes 는 보존된다", () => {
  const q4 = renewalSurveyQuestions.find((item) => item.id === "q4");
  expect(q4?.number).toEqual(null);
  expect(q4?.scoringId).toEqual(4);
  expect(q4?.optionCodes).toEqual(["NINE", "FIVE", "MIDDLE_AVG", "UNKNOWN"]);
});

// 표시 번호 재정렬 — q4 제거로 생긴 4번 공백을 메운다(scoringId 는 그대로 5~17을 유지).
test("표시 번호(number)는 4번 공백 없이 1~16 연속이다", () => {
  const numbers = renewalSurveyQuestions
    .map((item) => item.number)
    .filter((number): number is number => number != null)
    .sort((a, b) => a - b);
  expect(numbers).toEqual(Array.from({ length: 16 }, (_, i) => i + 1));
});
test("scoringId 는 renumber 대상이 아니다(q6 = 5번, 배점표 순번 무변경)", () => {
  const q6 = renewalSurveyQuestions.find((item) => item.id === "q6");
  expect(q6?.number).toEqual(4);
  expect(q6?.scoringId).toEqual(5);
});
