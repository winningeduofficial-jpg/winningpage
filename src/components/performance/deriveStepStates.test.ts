// deriveStepStates 회귀 테스트. §3.3 진행단계 상태 머신(사이드바 5스텝)의 순수 매핑
// 함수만 검증한다 — activeStep 산출 규율(off-by-one 교정)은 호출부(PerformanceChatPage)
// 책임이라 여기서 다루지 않는다(파일 상단 주석 참고).
//
// Vitest로 실행한다:
//   npm test -- src/components/performance/deriveStepStates.test.ts

import { expect, test } from "vitest";
import { deriveStepStates } from "./deriveStepStates.ts";

test("deriveStepStates - 기본값(인자 없음)은 5스텝 전부 todo", () => {
  expect(deriveStepStates()).toEqual(["todo", "todo", "todo", "todo", "todo"]);
});

test("deriveStepStates - activeStep=null + completedSteps 일부는 완료분만 done, 나머지 todo", () => {
  expect(
    deriveStepStates({ completedSteps: [1, 2], activeStep: null }),
  ).toEqual(["done", "done", "todo", "todo", "todo"]);
});

test("deriveStepStates - current가 done보다 우선한다(재방문 재작업)", () => {
  expect(
    deriveStepStates({ completedSteps: [1, 2, 3], activeStep: 2 }),
  ).toEqual(["done", "current", "done", "todo", "todo"]);
});

test("deriveStepStates - 정상 진행(완료 후 다음 스텝이 current)", () => {
  expect(deriveStepStates({ completedSteps: [1, 2], activeStep: 3 })).toEqual([
    "done",
    "done",
    "current",
    "todo",
    "todo",
  ]);
});

test("deriveStepStates - 범위 밖 completedSteps 값은 무시된다", () => {
  expect(
    deriveStepStates({ completedSteps: [0, 6, -1, 3], activeStep: null }),
  ).toEqual(["todo", "todo", "done", "todo", "todo"]);
});
