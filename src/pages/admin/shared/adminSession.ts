import { supabase } from "../../../lib/supabase";

function decodeJwtPayload(token: string) {
  try {
    const parts = String(token || "").split(".");
    if (parts.length !== 3) return null;

    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      atob(base64)
        .split("")
        .map((char) => `%${`00${char.charCodeAt(0).toString(16)}`.slice(-2)}`)
        .join(""),
    );

    return JSON.parse(json);
  } catch {
    return null;
  }
}

export async function getFreshSupabaseAccessToken() {
  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession();

  if (sessionError) {
    throw new Error(`관리자 로그인 세션 확인 실패: ${sessionError.message}`);
  }

  let session = sessionData?.session || null;

  if (!session?.access_token) {
    throw new Error(
      "관리자 로그인 세션이 없습니다. 로그아웃 후 다시 로그인하세요.",
    );
  }

  const payload = decodeJwtPayload(session.access_token);
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = Number(session.expires_at || payload?.exp || 0);
  const shouldRefresh = !expiresAt || expiresAt - now < 300;

  if (shouldRefresh) {
    const { data: refreshData, error: refreshError } =
      await supabase.auth.refreshSession();

    if (refreshError || !refreshData?.session?.access_token) {
      await supabase.auth.signOut().catch(() => {});
      throw new Error(
        "관리자 로그인 토큰이 만료되었습니다. 다시 로그인한 뒤 저장하세요.",
      );
    }

    session = refreshData.session;
  }

  const freshPayload = decodeJwtPayload(session.access_token);

  if (!freshPayload?.sub || !freshPayload?.exp) {
    throw new Error(
      "관리자 로그인 토큰 형식이 올바르지 않습니다. 다시 로그인한 뒤 저장하세요.",
    );
  }

  if (Number(freshPayload.exp) <= Math.floor(Date.now() / 1000)) {
    await supabase.auth.signOut().catch(() => {});
    throw new Error(
      "관리자 로그인 토큰이 만료되었습니다. 다시 로그인한 뒤 저장하세요.",
    );
  }

  return session.access_token;
}
