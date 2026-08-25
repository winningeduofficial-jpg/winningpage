// GET /api/session-check
// Authorization: Bearer <access_token>
//
// 동시 로그인 정책(prod: 계정당 1세션, Supabase "single session per user" 토글 +
// JWT expiry 300s — 그 설정 자체는 코드 밖, 이 라우트의 범위가 아니다) 하에서,
// 킥당한 탭이 "내가 지금도 유효한 세션인지"를 물어보는 순수 조회 엔드포인트다.
// 탭 focus 시(refetchOnWindowFocus) 클라이언트가 이 라우트를 부른다 — 폴링·
// Realtime 없음(src/lib/queryClient.ts sessionCheckQueryOptions 참고).
//
// 판정 정밀 구분이 이 라우트의 전부다: 서버가 실제로 그 세션을 강제 종료한
// 경우(GoTrue의 session_not_found)만 "킥"으로 단정할 수 있다. 그 외(토큰 자체가
// 없음, 이미 만료됨, 서명 불일치 등)는 "그냥 로그아웃 상태"와 구분이 안 되므로
// 여기서 킥이라 우기면 안 된다 — 오탐 방지가 이 라우트의 유일한 존재 이유다.
//
// 응답 규격(errorShape: "coded")
//   200 { ok: true }
//   401 { error: { code: "SESSION_REVOKED", message } }   — 서버가 이 세션을
//                                                            명시적으로 폐기함.
//                                                            클라이언트는 이
//                                                            코드만 보고 킥
//                                                            확정 → signOut →
//                                                            메인 이동 →
//                                                            안내 다이얼로그.
//   401 { error: { code: "UNAUTHENTICATED", message } }   — 그 외 전부(토큰
//                                                            없음/만료/무효).
//                                                            클라이언트는 조용히
//                                                            무시한다(오탐 금지).
//
// auth:"none" + 수동 검증인 이유: defineHandler의 auth:"user"는 실패 사유를
// 구분하지 않고 항상 UNAUTHENTICATED 401 하나로 뭉갠다(_lib/handler.ts
// AUTH_REQUIRED_CODE) — 이 라우트는 그 사유(session_not_found 여부) 자체가
// 응답의 전부이므로 resolveUser를 쓸 수 없고, getUser 호출을 직접 해서 에러
// 객체를 들여다봐야 한다.

import { isAuthApiError } from "@supabase/supabase-js";
import { defineHandler } from "./_lib/handler.js";
import { sendError } from "./_lib/httpResponse.js";
import { getBearerToken } from "./_lib/serviceAccess.js";

export const config = { runtime: "nodejs" };

export const SESSION_REVOKED_CODE = "SESSION_REVOKED";
export const UNAUTHENTICATED_CODE = "UNAUTHENTICATED";

/**
 * auth.getUser()가 던진(정확히는 { error }로 돌려준) 에러를 킥 판정 코드로
 * 분류한다. supabase-js는 GoTrue REST가 응답한 error_code를 AuthApiError.code에
 * 그대로 실어온다 — "session_not_found"는 그 세션이 서버에서 이미 폐기됐다는
 * 뜻(예: "single session per user" 토글이 새 로그인으로 이전 세션을 지운 경우)
 * 이다. 그 문자열 하나만 SESSION_REVOKED로 승격하고, AuthApiError가 아니거나
 * 다른 code(만료·서명 불일치 등)·네트워크 예외는 전부 UNAUTHENTICATED로
 * 뭉뚱그린다 — 킥 오탐을 만들 바에야 조용한 로그아웃 쪽으로 기울인다(배정
 * 메시지의 "그 외는 현행대로 조용히" 원칙).
 */
export function classifyAuthError(
  error: unknown,
): typeof SESSION_REVOKED_CODE | typeof UNAUTHENTICATED_CODE {
  if (isAuthApiError(error) && error.code === "session_not_found") {
    return SESSION_REVOKED_CODE;
  }
  return UNAUTHENTICATED_CODE;
}

export default defineHandler({
  methods: ["GET"],
  auth: "none",
  errorShape: "coded",
  unhandledMessage: "세션 확인 중 오류가 발생했습니다.",
  unhandledCode: UNAUTHENTICATED_CODE,
  logLabel: "session-check",
  handler: async (req, res, ctx) => {
    const token = getBearerToken(req);
    if (!token) {
      sendError(res, "coded", 401, "로그인이 필요합니다.", UNAUTHENTICATED_CODE);
      return;
    }

    const { data, error } = await ctx.supabaseAdmin.auth.getUser(token);
    if (error || !data?.user?.id) {
      const code = classifyAuthError(error);
      const message =
        code === SESSION_REVOKED_CODE
          ? "다른 기기에서 로그인되어 이 세션은 종료되었습니다."
          : "로그인이 필요합니다.";
      sendError(res, "coded", 401, message, code);
      return;
    }

    res.status(200).json({ ok: true });
  },
});
