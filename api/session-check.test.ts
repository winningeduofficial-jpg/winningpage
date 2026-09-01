// classifyAuthError 분기 검증.
//
// ⚠️ 이전 버전(리뷰 CRITICAL 지적)은 `new AuthApiError(..., "session_not_found")`를
// 손으로 만들어 통과하는 허구 테스트였다 — 실제로는 auth-js의 handleError가
// GoTrue REST의 error_code:"session_not_found"를 가로채 AuthApiError가 아니라
// AuthSessionMissingError로 재포장해 던진다(session-check.ts의 classifyAuthError
// 주석 참고). 그 손으로 만든 AuthApiError는 실제 코드 경로에서 절대 나오지 않는
// 값이라, 분류 함수의 실제 버그(isAuthApiError만 검사 → 영원히 false)를 전혀
// 잡지 못했다.
//
// 그래서 이번엔 `createClient()`로 만든 진짜 GoTrueClient에 `global.fetch`를
// 대체해 GoTrue REST 응답을 흉내 내고, session-check.ts가 실제로 부르는
// `auth.getUser(jwt)`를 그대로 태워 나온 에러 객체로 classifyAuthError를
// 검증한다 — auth-js 내부 재포장까지 포함해서 검증된다.

import { createClient } from "@supabase/supabase-js";
import { describe, expect, test, vi } from "vitest";
import {
  classifyAuthError,
  SESSION_REVOKED_CODE,
  UNAUTHENTICATED_CODE,
} from "./session-check.js";

const TEST_URL = "https://test-project.supabase.co";
const TEST_KEY = "test-service-role-key";
const TEST_TOKEN = "test-jwt-token";

function createClientWithFetch(fetchStub: typeof fetch) {
  return createClient(TEST_URL, TEST_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fetchStub },
  });
}

/** session-check.ts의 `ctx.supabaseAdmin.auth.getUser(token)`과 정확히 같은
 * 호출을 태워 { error }만 뽑아 돌려준다. */
async function getUserError(fetchStub: typeof fetch) {
  const client = createClientWithFetch(fetchStub);
  const { error } = await client.auth.getUser(TEST_TOKEN);
  return error;
}

describe("classifyAuthError — 실제 auth.getUser(jwt) 경로", () => {
  test("GoTrue가 error_code:session_not_found를 응답하면 SESSION_REVOKED로 분류한다", async () => {
    const fetchStub = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            error_code: "session_not_found",
            msg: "Session from session_id claim in JWT does not exist",
          }),
          { status: 403 },
        ),
    ) as unknown as typeof fetch;

    const error = await getUserError(fetchStub);
    expect(classifyAuthError(error)).toBe(SESSION_REVOKED_CODE);
  });

  test("session_not_found 외 다른 GoTrue 401(예: 만료 JWT)은 UNAUTHENTICATED로 분류한다", async () => {
    const fetchStub = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ error_code: "bad_jwt", msg: "invalid JWT" }),
          { status: 401 },
        ),
    ) as unknown as typeof fetch;

    const error = await getUserError(fetchStub);
    expect(classifyAuthError(error)).toBe(UNAUTHENTICATED_CODE);
  });

  test("네트워크 오류(fetch 자체가 실패)는 UNAUTHENTICATED로 분류한다", async () => {
    const fetchStub = vi.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;

    const error = await getUserError(fetchStub);
    expect(classifyAuthError(error)).toBe(UNAUTHENTICATED_CODE);
  });

  test("정상 토큰(200 + user)이면 에러 없이 유저를 반환한다(분류 대상 아님)", async () => {
    const fetchStub = vi.fn(
      async () =>
        new Response(JSON.stringify({ id: "user-1", email: "a@example.com" }), {
          status: 200,
        }),
    ) as unknown as typeof fetch;

    const { data, error } =
      await createClientWithFetch(fetchStub).auth.getUser(TEST_TOKEN);

    expect(error).toBeNull();
    expect(data.user?.id).toBe("user-1");
  });

  test("에러가 null/undefined(토큰 없음 등)여도 UNAUTHENTICATED로 분류한다", () => {
    expect(classifyAuthError(null)).toBe(UNAUTHENTICATED_CODE);
    expect(classifyAuthError(undefined)).toBe(UNAUTHENTICATED_CODE);
  });
});
