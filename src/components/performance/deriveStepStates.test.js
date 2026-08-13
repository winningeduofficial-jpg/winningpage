// deriveStepStates 회귀 테스트. §3.3 진행단계 상태 머신(사이드바 5스텝)의 순수 매핑
// 함수만 검증한다 — activeStep 산출 규율(off-by-one 교정)은 호출부(PerformanceChatPage)
// 책임이라 여기서 다루지 않는다(파일 상단 주석 참고).
//
// Node 내장 러너만 쓴다. 반드시 glob으로 파일을 지정해 실행할 것
// (디렉터리 인자를 주면 Node 24가 index.js로 오인해 0건 통과하는 가짜 green이 난다):
//   node --test "src/components/performance/*.test.js"

import assert from "node:assert/strict";
import { test } from "node:test";
import { deriveStepStates } from "./deriveStepStates.js";

test("deriveStepStates - 기본값(인자 없음)은 5스텝 전부 todo", () => {
  assert.deepEqual(deriveStepStates(), [
    "todo",
    "todo",
    "todo",
    "todo",
    "todo",
  ]);
});

test("deriveStepStates - activeStep=null + completedSteps 일부는 완료분만 done, 나머지 todo", () => {
  assert.deepEqual(
    deriveStepStates({ completedSteps: [1, 2], activeStep: null }),
    ["done", "done", "todo", "todo", "todo"],
  );
});

test("deriveStepStates - current가 done보다 우선한다(재방문 재작업)", () => {
  assert.deepEqual(
    deriveStepStates({ completedSteps: [1, 2, 3], activeStep: 2 }),
    ["done", "current", "done", "todo", "todo"],
  );
});

test("deriveStepStates - 정상 진행(완료 후 다음 스텝이 current)", () => {
  assert.deepEqual(
    deriveStepStates({ completedSteps: [1, 2], activeStep: 3 }),
    ["done", "done", "current", "todo", "todo"],
  );
});

test("deriveStepStates - 범위 밖 completedSteps 값은 무시된다", () => {
  assert.deepEqual(
    deriveStepStates({ completedSteps: [0, 6, -1, 3], activeStep: null }),
    ["todo", "todo", "done", "todo", "todo"],
  );
});
