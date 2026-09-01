// signupEmailAuth.ts의 toErrorMessage(에러 → 사용자 문구) 회귀 테스트.
//
// 배경(QA 33): 회원가입 화면에 빨간 글씨로 **`{}` 만 뜨는** 버그.
// 출처는 우리 코드가 아니라 @supabase/auth-js 다 — _getErrorMessage 가 응답 본문에서
// msg / message / error_description / error 를 못 찾으면 `JSON.stringify(err)` 로
// 폴백하고, 본문이 빈 객체면 그 값이 문자열 "{}" 가 되어 AuthError.message 에 박힌다.
//
// 이 함수의 1차 구현은 "message 가 비어 있으면 fallback" 이었는데, "{}" 는 길이 2짜리
// truthy 문자열이라 그 검사를 통과해 화면까지 그대로 나갔다. 그래서 "형식은 문자열인데
// 내용이 없는" 값도 걸러내도록 고쳤고, 그 계약을 여기서 못박는다.
//
// Supabase·네트워크 없이 순수 함수만 검증한다.

import { expect, test } from "vitest";
import { toErrorMessage } from "./signupEmailAuth";

const FALLBACK = "잠시 후 다시 시도해 주세요.";

test("읽을 수 있는 message 는 그대로 쓴다", () => {
  expect(toErrorMessage(new Error("이미 가입된 이메일입니다."), FALLBACK)).toBe(
    "이미 가입된 이메일입니다.",
  );
});

test("auth-js 가 넘기는 '{}' 는 화면에 내보내지 않는다 (QA 33)", () => {
  expect(toErrorMessage(new Error("{}"), FALLBACK)).toBe(FALLBACK);
});

test("같은 값을 문자열로 감싼 '[object Object]' 도 막는다", () => {
  expect(toErrorMessage(new Error("[object Object]"), FALLBACK)).toBe(FALLBACK);
  expect(toErrorMessage("[object Object]", FALLBACK)).toBe(FALLBACK);
});

test("공백만 있는 message 도 내용이 없는 것으로 본다", () => {
  expect(toErrorMessage(new Error("   "), FALLBACK)).toBe(FALLBACK);
});

test("빈 배열·null·undefined 직렬화 결과도 막는다", () => {
  expect(toErrorMessage(new Error("[]"), FALLBACK)).toBe(FALLBACK);
  expect(toErrorMessage(new Error("null"), FALLBACK)).toBe(FALLBACK);
  expect(toErrorMessage(new Error("undefined"), FALLBACK)).toBe(FALLBACK);
});

test("Error 가 아닌 문자열도 읽을 수 있으면 그대로 쓴다", () => {
  expect(toErrorMessage("네트워크 연결을 확인해 주세요.", FALLBACK)).toBe(
    "네트워크 연결을 확인해 주세요.",
  );
});

test("Error 도 문자열도 아니면 fallback 이다", () => {
  expect(toErrorMessage({}, FALLBACK)).toBe(FALLBACK);
  expect(toErrorMessage(undefined, FALLBACK)).toBe(FALLBACK);
  expect(toErrorMessage(null, FALLBACK)).toBe(FALLBACK);
  expect(toErrorMessage(new Error(""), FALLBACK)).toBe(FALLBACK);
});
