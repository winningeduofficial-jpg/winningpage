// POST /api/admin/invite-member
// Authorization: Bearer <supabase access token>   (최고 관리자 전용)
//
// 관리자 초대 — 기획 문서 「관리자 권한 체계 안내」의 "새 관리자 등록 절차".
//   최고 관리자가 이메일로 초대하고, 그 자리에서 받을 권한 묶음도 함께 정한다.
//   받은 사람이 링크를 눌러 비밀번호를 설정하면 계정이 활성화된다.
//
// 왜 서버 라우트인가
//   Supabase Auth 의 초대(auth.admin.inviteUserByEmail)는 service_role 로만
//   호출된다 — 브라우저에서 못 한다. 그리고 service_role 은 RLS 를 통째로
//   우회하므로, "누가 초대할 수 있는가"는 이 라우트가 직접 검사해야 한다
//   (api/_lib/supabaseAdmin.ts 상단 주석).
//
// 왜 resolveAdmin() 이 아니라 최고 관리자 판정인가
//   resolveAdmin 은 profiles.role='admin' 을 미러한다. 관리자 등록·권한 조정은
//   기획 문서상 최고 관리자 전용이라 판정 축이 다르다 — admin_members 에
//   is_super 묶음을 활성 상태로 갖고 있는지로 본다(fn_is_super_admin 과 같은 술어).
//
// ⚠️ profiles 행을 이 라우트가 직접 넣는다
//   dev·로컬에는 auth.users → profiles 자동 생성 트리거가 있지만 **prod 에는
//   의도적으로 없다**(supabase/README.md). 트리거에 기대면 prod 에서만 profiles
//   가 비어 직원 목록에 이름이 안 뜬다. 그래서 여기서 명시적으로 upsert 한다.
//
// 응답 규격
//   200 { ok: true, profileId, resent }   초대(또는 재발송) 완료.
//   400 { detail }                        email/roleId 누락·형식 오류.
//   401 { detail }                        토큰 없음/무효.
//   403 { detail }                        최고 관리자 아님.
//   409 { detail }                        이미 활성 관리자다.
//   405 { detail }                        POST 아님.
//   500 { detail }                        Auth 초대 실패, 서버 설정 누락 등.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getBearerToken } from "../_lib/adminAuth.js";
import { createSupabaseAdmin, getEnv } from "../_lib/supabaseAdmin.js";

export const config = { runtime: "nodejs" };

type SuperAdminResult =
  | { ok: true; userId: string }
  | { ok: false; status: number; detail: string };

/**
 * Bearer 토큰 → 최고 관리자 판정. SQL fn_is_super_admin() 과 같은 술어다
 * (admin_members 활성 행 + 그 role 이 is_super).
 */
async function resolveSuperAdmin(
  supabaseAdmin: SupabaseClient,
  req: VercelRequest,
): Promise<SuperAdminResult> {
  const token = getBearerToken(
    req as unknown as { headers: Record<string, string> },
  );
  if (!token) {
    return { ok: false, status: 401, detail: "로그인이 필요합니다." };
  }

  const { data: userData, error: userError } =
    await supabaseAdmin.auth.getUser(token);
  if (userError || !userData?.user?.id) {
    return { ok: false, status: 401, detail: "로그인이 필요합니다." };
  }

  const userId = userData.user.id;

  const { data, error } = await supabaseAdmin
    .from("admin_members")
    .select("profile_id, status, admin_roles!inner(is_super)")
    .eq("profile_id", userId)
    .eq("status", "active")
    .maybeSingle();

  // 조회 실패를 "권한 없음"으로 뭉개면 원인이 안 보인다(adminAuth.ts 와 같은 원칙).
  if (error) {
    console.error("admin/invite-member 권한 조회 실패:", error);
    return { ok: false, status: 500, detail: "권한 확인에 실패했습니다." };
  }

  const roles = data?.admin_roles as unknown;
  const isSuper = Array.isArray(roles)
    ? roles.some((row) => (row as { is_super?: boolean })?.is_super)
    : Boolean((roles as { is_super?: boolean } | null)?.is_super);

  if (!data || !isSuper) {
    return {
      ok: false,
      status: 403,
      detail: "최고 관리자만 초대할 수 있습니다.",
    };
  }

  return { ok: true, userId };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ detail: "Method not allowed" });
  }

  let supabaseAdmin: ReturnType<typeof createSupabaseAdmin>;
  try {
    supabaseAdmin = createSupabaseAdmin();
  } catch (error) {
    console.error("admin/invite-member 설정 오류:", error);
    return res.status(500).json({ detail: "서버 설정이 올바르지 않습니다." });
  }

  const auth = await resolveSuperAdmin(supabaseAdmin, req);
  if (!auth.ok) {
    return res.status(auth.status).json({ detail: auth.detail });
  }

  const body = (req.body || {}) as {
    email?: string;
    roleId?: string;
    department?: string;
    // 기존 서비스 회원을 관리자로 올릴 때 화면이 되묻고 다시 보내는 확인 플래그.
    confirmExisting?: boolean;
  };
  const email = String(body.email || "")
    .trim()
    .toLowerCase();
  const roleId = String(body.roleId || "").trim();
  const department = String(body.department || "").trim() || null;

  if (!email?.includes("@")) {
    return res.status(400).json({ detail: "이메일을 확인해 주세요." });
  }
  if (!roleId) {
    return res.status(400).json({ detail: "권한 묶음을 선택해 주세요." });
  }

  // 초대 링크가 돌아올 주소. 로컬은 5173(vite), 운영은 PUBLIC_SITE_URL.
  const siteUrl = getEnv("PUBLIC_SITE_URL") || "http://localhost:5173";
  const redirectTo = `${siteUrl.replace(/\/+$/, "")}/admin`;

  // 이미 가입돼 있으면 초대가 422 로 떨어진다 — 그건 오류가 아니라 "재발송"
  // 또는 "기존 회원을 관리자로 올리기" 경로다. 먼저 기존 사용자를 찾아본다.
  const { data: existingProfile } = await supabaseAdmin
    .from("profiles")
    .select("id, member_type, name")
    .eq("email", email)
    .maybeSingle();

  let profileId = existingProfile?.id as string | undefined;
  let resent = false;

  if (profileId) {
    const { data: member } = await supabaseAdmin
      .from("admin_members")
      .select("status")
      .eq("profile_id", profileId)
      .maybeSingle();

    if (member?.status === "active") {
      return res.status(409).json({ detail: "이미 활성 상태인 관리자입니다." });
    }

    // ⚠️ 서비스 이용자(학생·학부모·멘토)를 관리자로 올리는 건 되돌리기 어려운
    //   결정이라 한 번 되묻는다. 그냥 통과시키면 오타 하나로 고객 계정이
    //   관리자가 되고, 그 계정은 전 회원 정보를 볼 수 있게 된다.
    //   member_type 이 비어 있는 계정(초대만 받고 서비스는 안 쓰는 계정)은
    //   이 확인 없이 진행한다.
    if (existingProfile?.member_type && body.confirmExisting !== true) {
      return res.status(409).json({
        detail: `이 이메일은 이미 서비스 회원(${existingProfile.member_type})으로 가입돼 있습니다. 그 계정을 관리자로 올리시겠습니까?`,
        needsConfirm: true,
        existingMemberType: existingProfile.member_type,
        existingName: existingProfile.name ?? null,
      });
    }

    resent = Boolean(member);
  } else {
    const { data: invited, error: inviteError } =
      await supabaseAdmin.auth.admin.inviteUserByEmail(email, { redirectTo });

    if (inviteError || !invited?.user?.id) {
      console.error("admin/invite-member 초대 실패:", inviteError);
      return res.status(500).json({
        detail: `초대 메일 발송에 실패했습니다: ${inviteError?.message || "알 수 없는 오류"}`,
      });
    }

    profileId = invited.user.id;
  }

  // prod 에는 auth → profiles 트리거가 없다(파일 상단 ⚠️ 참고). 그래서 **새로
  // 만든 계정에 한해** profiles 행을 직접 만든다. 기존 회원은 건드리지 않는다 —
  // 여기서 upsert 하면 그 사람의 이름·회원유형이 걸린 행에 role 을 덮어쓰게 된다.
  const { error: profileError } = existingProfile
    ? { error: null }
    : await supabaseAdmin
        .from("profiles")
        .insert({ id: profileId, email, role: "user" });

  if (profileError) {
    console.error("admin/invite-member profiles upsert 실패:", profileError);
    return res
      .status(500)
      .json({ detail: `프로필 생성에 실패했습니다: ${profileError.message}` });
  }

  // 이미 있는 행이면 권한 묶음·부서만 갱신하고 status 는 invited 로 되돌린다
  // (재발송 = 아직 활성화하지 않았다는 뜻이므로).
  const { error: memberError } = await supabaseAdmin
    .from("admin_members")
    .upsert(
      {
        profile_id: profileId,
        role_id: roleId,
        department,
        status: "invited",
        invited_by: auth.userId,
        invited_at: new Date().toISOString(),
      },
      { onConflict: "profile_id" },
    );

  if (memberError) {
    console.error(
      "admin/invite-member admin_members upsert 실패:",
      memberError,
    );
    return res
      .status(500)
      .json({ detail: `관리자 등록에 실패했습니다: ${memberError.message}` });
  }

  // 기존 회원을 관리자로 올리는 경로에서도 메일을 보낸다 — 초대받은 사람이
  // "관리자로 등록됐다"는 사실을 알 방법이 그것뿐이다. 이미 비밀번호가 있는
  // 계정이라 invite 가 아니라 magiclink 로 보낸다.
  if (resent || existingProfile) {
    const { error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo },
    });
    if (linkError) {
      console.error("admin/invite-member 재발송 실패:", linkError);
    }
  }

  return res.status(200).json({ ok: true, profileId, resent });
}
