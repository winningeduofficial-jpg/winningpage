// FindPassword.tsx의 isServerFailure(서버 장애 판정) 회귀 테스트.
//
// 배경(2026-08-23 실제 사고): dev 의 SMTP 자격증명이 틀어져 /auth/v1/recover 가
// 500 을 뱉고 있었는데, 화면은 실패를 통째로 삼키고 "보냈어요"만 띄웠다. 메일은
// 한 통도 안 나갔는데 사용자는 스팸함만 뒤지게 된다.
//
// 이 함수가 지켜야 하는 계약은 두 방향이다:
//   1. 5xx·네트워크 계열은 true — 사실대로 "지금 보낼 수 없다"고 알려야 한다.
//   2. 그 외(특히 4xx)는 false — 계정 존재 여부를 추측하는 경로가 되면 안 되므로
//      계속 "보냈어요" 톤으로 숨긴다.
// 1번을 놓치면 위 사고가 재현되고, 2번을 놓치면 이메일 등록 여부가 새어 나간다.
//
// Supabase·네트워크 없이 순수 함수만 검증한다.

import { expect, test } from "vitest";
import { isServerFailure } from "./FindPassword";

test("AuthRetryableFetchError 는 서버 장애다 (2026-08-23 SMTP 사고의 실제 타입)", () => {
  const error = Object.assign(new Error("{}"), {
    name: "AuthRetryableFetchError",
  });
  expect(isServerFailure(error)).toBe(true);
});

test("status 가 500 이상이면 서버 장애다", () => {
  expect(isServerFailure({ status: 500 })).toBe(true);
  expect(isServerFailure({ status: 502 })).toBe(true);
  expect(isServerFailure({ status: 503 })).toBe(true);
});

test("4xx 는 숨긴다 — 계정 존재 여부가 새면 안 된다", () => {
  expect(isServerFailure({ status: 400 })).toBe(false);
  expect(isServerFailure({ status: 404 })).toBe(false);
  expect(isServerFailure({ status: 422 })).toBe(false);
});

test("rate limit(429)도 숨긴다 — 계정이 있는지와 무관하게 같은 톤을 유지한다", () => {
  expect(isServerFailure({ status: 429 })).toBe(false);
});

test("에러가 아닌 값에는 반응하지 않는다", () => {
  expect(isServerFailure(null)).toBe(false);
  expect(isServerFailure(undefined)).toBe(false);
  expect(isServerFailure("500")).toBe(false);
  expect(isServerFailure({})).toBe(false);
  expect(isServerFailure(new Error("그냥 오류"))).toBe(false);
});
