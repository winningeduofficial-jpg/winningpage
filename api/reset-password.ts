// POST /api/reset-password
//
// 비밀번호 재설정 — **휴대폰 인증 경로 전용**이다.
//
// 이메일 경로는 이 라우트를 쓰지 않는다
//   이메일 OTP 는 Supabase Auth 가 처리하고 통과하면 세션이 생긴다. 세션이 있으면
//   브라우저가 supabase.auth.updateUser({ password }) 를 그대로 호출할 수 있어서
//   서버를 거칠 이유가 없다(가입 화면의 applySignupPassword 와 같은 방식).
//   반면 휴대폰 인증은 세션을 만들지 않으므로, service_role 로 비밀번호를 바꿔줄
//   지점이 필요하다 — 그게 이 파일이다.
//
// 이 라우트는 인증 없이 열려 있다. 그래서 "누구의 비밀번호를 바꿀 수 있는가"를
// 스스로 증명해야 한다:
//   1. phone_verifications 에 purpose='find_account' 로 verified 된 미소비 행
//   2. 그 번호 + 아이디(username) 로 특정되는 계정 하나
//   3. 인증 행을 소진시킨 뒤에야 비밀번호를 바꾼다
//
// 아이디를 함께 요구하는 이유
//   와이어프레임의 비밀번호 찾기 폼이 아이디를 받는다. 한 번호에 학생·학부모
//   계정이 따로 있을 수 있어서 번호만으로는 대상이 특정되지 않는다.
//
// 응답 규격
//   200 { ok: true }
//   400 { detail }   입력 누락·비밀번호 규칙 위반
//   401 { detail }   인증 증거 없음/만료
//   404 { detail }   일치하는 계정 없음
//   405 { detail }
//   500 { detail }

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createSupabaseAdmin } from "./_lib/supabaseAdmin.js";

export const config = { runtime: "nodejs" };

const VERIFICATION_TTL_MS = 10 * 60 * 1000;
/** Supabase Auth 기본 최소 길이와 맞춘다. 화면 안내 문구("영문/특수문자 조합 6자 이상")도 같다. */
const MIN_PASSWORD_LENGTH = 6;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ detail: "Method not allowed" });
  }

  let supabaseAdmin: ReturnType<typeof createSupabaseAdmin>;
  try {
    supabaseAdmin = createSupabaseAdmin();
  } catch (error) {
    console.error("reset-password 설정 오류:", error);
    return res.status(500).json({ detail: "서버 설정이 올바르지 않습니다." });
  }

  const body = (req.body || {}) as {
    phone?: string;
    username?: string;
    password?: string;
  };

  const phone = String(body.phone || "").replace(/[^0-9]/g, "");
  const username = String(body.username || "").trim();
  const password = String(body.password || "");

  if (!phone || !username) {
    return res
      .status(400)
      .json({ detail: "휴대전화번호와 아이디를 입력해 주세요." });
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return res
      .status(400)
      .json({
        detail: `비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상이어야 합니다.`,
      });
  }

  // 1) 인증 증거
  const { data: verification, error: verifyError } = await supabaseAdmin
    .from("phone_verifications")
    .select("id, verified_at")
    .eq("phone", phone)
    .eq("purpose", "find_account")
    .not("verified_at", "is", null)
    .is("consumed_at", null)
    .order("verified_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (verifyError) {
    console.error("reset-password 인증 조회 실패:", verifyError);
    return res.status(500).json({ detail: "인증 확인에 실패했습니다." });
  }

  const verifiedAt = verification?.verified_at
    ? new Date(verification.verified_at).getTime()
    : 0;

  if (!verification || Date.now() - verifiedAt > VERIFICATION_TTL_MS) {
    return res
      .status(401)
      .json({ detail: "휴대전화 인증을 먼저 완료해 주세요." });
  }

  // 2) 대상 계정
  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("phone", phone)
    .eq("username", username)
    .maybeSingle();

  if (profileError) {
    console.error("reset-password 계정 조회 실패:", profileError);
    return res.status(500).json({ detail: "조회에 실패했습니다." });
  }

  // 3) 인증 소진을 비밀번호 변경보다 **먼저** 한다. 뒤에 두면 변경이 실패했을
  //    때 인증이 살아남아 재시도가 가능해지는데, 그 재시도가 "아이디를 바꿔가며
  //    맞는 계정을 찾는" 경로가 된다.
  await supabaseAdmin
    .from("phone_verifications")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", verification.id);

  if (!profile?.id) {
    return res
      .status(404)
      .json({ detail: "입력한 정보와 일치하는 계정을 찾지 못했습니다." });
  }

  const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
    profile.id,
    { password },
  );

  if (updateError) {
    console.error("reset-password 변경 실패:", updateError);
    return res
      .status(500)
      .json({ detail: `비밀번호 변경에 실패했습니다: ${updateError.message}` });
  }

  return res.status(200).json({ ok: true });
}
