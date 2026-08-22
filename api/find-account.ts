// POST /api/find-account
//
// 아이디 찾기 — 인증을 통과한 사람에게 자기 아이디를 알려준다.
//
// 인증 증거는 두 갈래다
//   phone : phone_verifications 에 purpose='find_account' 로 verified 된 미소비
//           행이 있는지 본다(api/verify-phone-code 가 verified_at 을 찍는다).
//           그 행을 여기서 consumed_at 으로 소진시킨다 — 한 번의 인증으로 여러
//           번 조회하지 못하게 한다.
//   email : 이메일 OTP 는 Supabase Auth 가 처리하고, 통과하면 세션이 생긴다
//           (가입 화면이 쓰는 것과 같은 경로 — src/lib/signupEmailAuth.ts).
//           그래서 여기서는 Bearer 토큰으로 본인 확인만 한다.
//
// ⚠️ 생년월일은 조회 조건에 넣지 않는다 (사용자 확정 2026-08-22)
//   와이어프레임에는 생년월일 입력이 있지만, profiles.birth_date 는 가입 경로로
//   **채워지지 않는다** — complete_signup_profile 인자에 아예 없고(학생은 만 14세
//   판정용으로만 쓰고 버린다), 학부모 가입은 생년월일을 받지도 않는다. 조건에
//   넣으면 전 회원이 자기 아이디를 못 찾는다. 인증을 통과했다는 것 자체가 그
//   번호·메일의 주인이라는 뜻이므로 보안상으로도 충분하다.
//
// 응답 규격
//   200 { ok: true, username, joinedAt }
//   400 { detail }   입력 누락
//   401 { detail }   인증 증거 없음/만료
//   404 { detail }   일치하는 계정 없음
//   405 { detail }
//   500 { detail }

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getBearerToken } from "./_lib/adminAuth.js";
import { createSupabaseAdmin } from "./_lib/supabaseAdmin.js";

export const config = { runtime: "nodejs" };

/** 인증받은 지 오래된 건은 안 받는다. 화면 흐름상 인증 직후 바로 누른다. */
const VERIFICATION_TTL_MS = 10 * 60 * 1000;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ detail: "Method not allowed" });
  }

  let supabaseAdmin: ReturnType<typeof createSupabaseAdmin>;
  try {
    supabaseAdmin = createSupabaseAdmin();
  } catch (error) {
    console.error("find-account 설정 오류:", error);
    return res.status(500).json({ detail: "서버 설정이 올바르지 않습니다." });
  }

  const body = (req.body || {}) as {
    channel?: "phone" | "email";
    memberType?: string;
    name?: string;
    phone?: string;
  };

  const channel = body.channel === "email" ? "email" : "phone";
  const name = String(body.name || "").trim();
  const memberType = String(body.memberType || "").trim();

  if (!name) {
    return res.status(400).json({ detail: "이름을 입력해 주세요." });
  }

  // ---------------------------------------------------------------------
  // 1) 인증 증거 → 이 요청이 어떤 사람의 것인가
  // ---------------------------------------------------------------------
  let query = supabaseAdmin
    .from("profiles")
    .select("id, username, name, member_type, created_at");

  if (channel === "email") {
    const token = getBearerToken(
      req as unknown as { headers: Record<string, string> },
    );
    if (!token) {
      return res.status(401).json({ detail: "이메일 인증이 필요합니다." });
    }

    const { data: userData, error: userError } =
      await supabaseAdmin.auth.getUser(token);
    if (userError || !userData?.user?.id) {
      return res.status(401).json({ detail: "이메일 인증이 만료되었습니다." });
    }

    query = query.eq("id", userData.user.id);
  } else {
    const phone = String(body.phone || "").replace(/[^0-9]/g, "");
    if (!phone) {
      return res.status(400).json({ detail: "휴대전화번호를 입력해 주세요." });
    }

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
      console.error("find-account 인증 조회 실패:", verifyError);
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

    // 한 번의 인증으로 한 번만 조회한다. 조회 성공 여부와 무관하게 소진시켜
    // "이름을 바꿔가며 같은 인증으로 계속 찔러보는" 경로를 막는다.
    await supabaseAdmin
      .from("phone_verifications")
      .update({ consumed_at: new Date().toISOString() })
      .eq("id", verification.id);

    query = query.eq("phone", phone);
  }

  // ---------------------------------------------------------------------
  // 2) 이름·회원구분 대조
  //
  //   인증이 이미 본인 확인을 끝냈으므로 이 둘은 "맞는 계정을 고르는" 조건이다
  //   (한 번호에 학생·학부모 계정이 따로 있을 수 있다).
  // ---------------------------------------------------------------------
  if (memberType) query = query.eq("member_type", memberType);

  const { data: profiles, error } = await query;

  if (error) {
    console.error("find-account 조회 실패:", error);
    return res.status(500).json({ detail: "조회에 실패했습니다." });
  }

  const matched = (profiles || []).find(
    (row) => String(row.name || "").trim() === name,
  );

  if (!matched?.username) {
    return res
      .status(404)
      .json({ detail: "입력한 정보와 일치하는 계정을 찾지 못했습니다." });
  }

  // 인증을 통과했으므로 아이디를 전부 보여준다(사용자 확정 2026-08-22).
  return res.status(200).json({
    ok: true,
    username: matched.username,
    joinedAt: matched.created_at,
  });
}
