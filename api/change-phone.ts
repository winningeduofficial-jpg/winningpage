// POST /api/change-phone  { phone }
//
// 마이페이지 "휴대폰 번호를 변경해요" 플로우(Figma 3973:15330→16090→16297→16478)
// 마지막 단계 — 인증번호 검증까지 끝난 번호를 실제로 profiles.phone 에 반영한다.
//
// 왜 서버 API 인가
//   phone_verifications 는 RLS 전면 거부 + 권한 회수 테이블이다(sql/40_auth_signup.sql
//   [6] 주석 — "이 파일과 라우트만 service_role로 그 테이블에 접근한다"). 클라이언트가
//   supabase.from('profiles').update({ phone }) 을 직접 부르면 인증번호 확인 여부와
//   무관하게 통과된다(profiles RLS 는 본인 행 수정만 확인하지 인증 이력을 보지
//   않는다) — 그래서 "검증된 번호로만 바뀐다"를 강제하려면 이 라우트가 필요하다.
//   ChangeEmailModal 은 Supabase Auth 의 verifyOtp 가 이 검증을 대신 해주지만,
//   휴대폰은 profiles 의 커스텀 컬럼이라 대응하는 Auth 내장 플로우가 없다.
//
// 신뢰 경계
//   본인 확인은 세션 토큰(Authorization) 하나다 — 현재 비밀번호 재확인은
//   ChangePhoneModal.jsx 가 이미 signInWithPassword 로 먼저 해 둔 뒤에만 이
//   엔드포인트를 부른다(자리를 비운 사이 남이 번호를 바꾸는 것을 막는 목적,
//   ChangePasswordModal.jsx 와 동일 근거).

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { isValidMobile, normalizePhone } from "./_lib/phoneCode.js";
import { createSupabaseAdmin } from "./_lib/supabaseAdmin.ts";

export const config = { runtime: "nodejs" };

function getBearerToken(req: VercelRequest) {
  return String(req.headers.authorization || "")
    .trim()
    .replace(/^Bearer\s+/i, "");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, detail: "Method not allowed" });
  }

  const rawPhone = String(req.body?.phone || "").trim();
  const normalized = normalizePhone(rawPhone);

  if (!isValidMobile(normalized)) {
    return res.status(400).json({
      ok: false,
      reason: "invalid_phone",
      detail: "휴대폰 번호 형식이 올바르지 않습니다.",
    });
  }

  const token = getBearerToken(req);
  if (!token) {
    return res.status(401).json({
      ok: false,
      reason: "not_authenticated",
      detail: "로그인이 필요합니다.",
    });
  }

  try {
    const supabaseAdmin = createSupabaseAdmin();

    const { data: userData, error: userError } =
      await supabaseAdmin.auth.getUser(token);
    const userId = userData?.user?.id ?? null;
    if (userError || !userId) {
      return res.status(401).json({
        ok: false,
        reason: "not_authenticated",
        detail: "로그인이 만료되었습니다. 다시 로그인해 주세요.",
      });
    }

    // 이 번호로 verify-phone-code 를 통과한 가장 최근 미소비 발송 건을 찾는다.
    // send-phone-code.js 와 같은 정규화(digits-only)로 저장돼 있다.
    const { data: verification, error: verificationError } = await supabaseAdmin
      .from("phone_verifications")
      .select("id, expires_at")
      .eq("phone", normalized)
      .eq("purpose", "phone_change")
      .not("verified_at", "is", null)
      .is("consumed_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (verificationError) {
      console.error("[change-phone] 인증 이력 조회 실패:", verificationError);
      return res.status(500).json({
        ok: false,
        reason: "unknown",
        detail: "처리 중 오류가 발생했습니다.",
      });
    }

    if (
      !verification ||
      new Date(verification.expires_at).getTime() < Date.now()
    ) {
      return res.status(400).json({
        ok: false,
        reason: "not_verified",
        detail: "인증번호 확인을 먼저 완료해 주세요.",
      });
    }

    // profiles.phone 은 기존 인라인 편집(ProfileTab.jsx)과 같은 표기(사용자 입력
    // 원문)를 그대로 저장한다 — 정규화된 digits-only 로 바꾸면 기존 표시 형식
    // (010-1234-5678)과 갈린다.
    const { error: updateError } = await supabaseAdmin
      .from("profiles")
      .update({ phone: rawPhone, updated_at: new Date().toISOString() })
      .eq("id", userId);

    if (updateError) {
      console.error("[change-phone] profiles.phone 갱신 실패:", updateError);
      return res.status(500).json({
        ok: false,
        reason: "unknown",
        detail: "번호 변경에 실패했습니다.",
      });
    }

    // 소비 처리 — 재사용(같은 인증 건으로 두 번 변경) 방지.
    const { error: consumeError } = await supabaseAdmin
      .from("phone_verifications")
      .update({ consumed_at: new Date().toISOString() })
      .eq("id", verification.id);

    if (consumeError) {
      // 번호는 이미 바뀌었다 — 소비 마킹 실패로 사용자에게 실패를 알리면
      // "바뀌었는데 실패라고 뜨는" 혼란을 준다. 로그만 남기고 성공으로 응답한다.
      console.error(
        "[change-phone] phone_verifications 소비 마킹 실패:",
        consumeError,
      );
    }

    return res.status(200).json({ ok: true, phone: rawPhone });
  } catch (error) {
    console.error("[change-phone] 오류:", error);
    return res.status(500).json({
      ok: false,
      reason: "unknown",
      detail: "번호 변경 중 오류가 발생했습니다.",
    });
  }
}
