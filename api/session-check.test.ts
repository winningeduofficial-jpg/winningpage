// classifyAuthError 분기 검증만 한다. defineHandler로 감싼 실제 핸들러(req/res/
// ctx.supabaseAdmin.auth.getUser)는 Vercel 런타임 목이 필요해 여기서 돌리기
// 어렵다(zoom-webhook.test.ts와 같은 이유) — 실제로 틀리기 쉬운 곳은 "어떤
// 에러가 킥으로 승격되는가" 판정 자체이므로, getUser가 던지는(정확히는
// { error }로 돌려주는) 에러 객체를 직접 만들어 그 판정만 검증한다.

import { AuthApiError, AuthUnknownError } from "@supabase/supabase-js";
import { describe, expect, test } from "vitest";
import {
  classifyAuthError,
  SESSION_REVOKED_CODE,
  UNAUTHENTICATED_CODE,
} from "./session-check.js";

describe("classifyAuthError", () => {
  test("GoTrue session_not_found 은 SESSION_REVOKED로 분류한다", () => {
    const error = new AuthApiError(
      "Session from session_id claim in JWT does not exist",
      403,
      "session_not_found",
    );

    expect(classifyAuthError(error)).toBe(SESSION_REVOKED_CODE);
  });

  test("같은 AuthApiError라도 다른 code(예: 만료)는 UNAUTHENTICATED로 분류한다", () => {
    const error = new AuthApiError("JWT expired", 401, "bad_jwt");

    expect(classifyAuthError(error)).toBe(UNAUTHENTICATED_CODE);
  });

  test("AuthApiError가 아닌 예외(네트워크 오류 등)는 UNAUTHENTICATED로 분류한다", () => {
    const error = new AuthUnknownError("network down", new Error("ECONNRESET"));

    expect(classifyAuthError(error)).toBe(UNAUTHENTICATED_CODE);
  });

  test("에러가 null/undefined(토큰 없음 등)여도 UNAUTHENTICATED로 분류한다", () => {
    expect(classifyAuthError(null)).toBe(UNAUTHENTICATED_CODE);
    expect(classifyAuthError(undefined)).toBe(UNAUTHENTICATED_CODE);
  });
});
