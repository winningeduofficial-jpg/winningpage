// POST /api/admin/approve-mentor
// Authorization: Bearer <supabase access token>   (관리자 전용)
// body: { applicationId: uuid, resend?: boolean }
//
// 멘토 지원서 승인 — Figma 4285:7300 「멘토 전용 페이지」의 진입 지점.
//   승인하면 (1) 멘토 계정을 만들고 (2) profiles.member_type='mentor' 로 표시하고
//   (3) 지원서에 그 계정을 이어붙인 뒤 (4) 멘토에게 로그인용 임시코드를 메일로
//   보낸다. 멘토는 그 코드로 들어와 멘토카드를 작성한다.
//
// 왜 서버 라우트인가
//   auth.users 생성은 service_role 로만 된다. 그리고 service_role 은 RLS 를 통째로
//   우회하므로 "누가 승인할 수 있는가"를 이 라우트가 직접 검사해야 한다
//   (api/_lib/supabaseAdmin.ts 상단 주석).
//
// 임시코드는 어떻게 나가나 — ⚠️ 여기가 이 파일에서 제일 헷갈리는 지점이다
//   이 저장소에는 임의 문구 메일을 보내는 발송기가 없다(Supabase SMTP 는 Auth
//   템플릿 경로로만 나간다 — api/admin/invite-member 의 ⚠️ 주석 참고).
//   대신 이 프로젝트는 Supabase 대시보드에서 **Magic Link 템플릿을 `{{ .Token }}`
//   (6자리 숫자)로 바꿔놨다**(src/lib/signupEmailAuth.ts 상단). 그래서
//   signInWithOtp() 를 부르면 "링크"가 아니라 **숫자 코드가 메일로 나간다** —
//   시안이 말하는 "메일로 보내드린 임시코드"가 정확히 이것이다.
//
//   그래서 admin.generateLink() 가 아니라 anon 키 클라이언트의 signInWithOtp()
//   를 쓴다. generateLink 는 링크를 만들어 돌려주기만 하고 **메일을 보내지 않는다**
//   (커스텀 발송기용 API) — 같은 착각으로 invite-member 가 한동안 아무 메일도
//   못 보내고 있었다.
//
//   ⚠️ Magic Link 템플릿이 대시보드에서 `{{ .Token }}` 이 아니면 이 경로로
//      "링크"가 나가고 멘토 로그인 화면의 코드 입력칸이 쓸모없어진다.
//
// 재발송
//   body.resend=true 면 계정·지원서는 건드리지 않고 코드만 다시 보낸다.
//   OTP 는 대시보드 설정(Email OTP Expiration)대로 만료되므로, 승인 직후 받은
//   코드를 며칠 뒤에 쓰려는 멘토에게는 재발송이 필요하다.
//
// 응답 규격
//   200 { ok: true, profileId, created, emailed }
//         created=true  이번에 auth 계정을 새로 만들었다.
//         emailed=true  임시코드 메일을 보냈다.
//   400 { detail }   applicationId 누락·형식 오류, 지원서에 이메일 없음.
//   401 { detail }   토큰 없음/무효.
//   403 { detail }   관리자 아님.
//   404 { detail }   지원서 없음.
//   405 { detail }   POST 아님.
//   409 { detail }   그 이메일이 이미 학생·학부모로 쓰이고 있다(아래 참고).
//   500 { detail }   계정 생성·메일 발송 실패, 서버 설정 누락 등.

import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { resolveWinningAdmin } from "../_lib/adminAuth.js";
import { createSupabaseAdmin, getEnv } from "../_lib/supabaseAdmin.js";

export const config = { runtime: "nodejs" };

// 🔴 멘토 온보딩 전체가 보류 상태다 (2026-08-23).
//
//   기획이 아직 확정되지 않았다 — 2026-08-24(월) 전체회의에서 이 경로대로 갈지,
//   그리고 멘토 쪽 개발을 지금 진행할지를 다시 확인한 뒤 켠다. 특히 멘토 로그인
//   진입점(회원 로그인 화면에 칸을 따로 둘지)이 미정이다.
//
//   ⚠️ 라우트를 파일째 지우지 않고 여기서 막는 이유 — 이 라우트는 계정을 만들고
//     지원자에게 메일을 보낸다. 화면에서 안 부르더라도 URL 은 살아 있으므로,
//     화면 플래그만 내려두면 관리자 토큰을 가진 누구든 직접 칠 수 있다.
//
//   켤 때 같이 켜야 하는 것:
//     - src/components/admin/MentorApplicationsAdmin.tsx 의 MENTOR_APPROVAL_ENABLED
const MENTOR_APPROVAL_ENABLED = false;

/**
 * 임시코드 메일 발송. anon 키 클라이언트로 signInWithOtp 를 부른다 —
 * service_role 로 부르면 안 된다(관리자 키로 남의 세션을 여는 경로가 된다).
 *
 * shouldCreateUser:false 로 못박는다. 계정 생성은 이 라우트가 위에서 명시적으로
 * 하고 있으므로, 여기서 또 만들 수 있게 두면 오탈자 이메일에도 계정이 생긴다.
 */
async function sendLoginCode(email: string): Promise<string | null> {
  const url = getEnv("SUPABASE_URL", "VITE_SUPABASE_URL");
  const anonKey = getEnv("VITE_SUPABASE_ANON_KEY", "SUPABASE_ANON_KEY");

  if (!url || !anonKey) {
    return "Supabase URL/anon 키가 설정되지 않아 임시코드를 보내지 못했습니다.";
  }

  const supabaseAnon = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error } = await supabaseAnon.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false },
  });

  return error ? error.message : null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!MENTOR_APPROVAL_ENABLED) {
    return res.status(503).json({
      detail:
        "멘토 승인 기능은 아직 열려 있지 않습니다(기획 확정 대기). api/admin/approve-mentor 의 MENTOR_APPROVAL_ENABLED 를 참고하세요.",
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ detail: "POST 요청만 허용됩니다." });
  }

  let supabaseAdmin: ReturnType<typeof createSupabaseAdmin>;
  try {
    supabaseAdmin = createSupabaseAdmin();
  } catch (error) {
    console.error("admin/approve-mentor 설정 오류:", error);
    return res.status(500).json({ detail: "서버 설정이 올바르지 않습니다." });
  }

  const auth = await resolveWinningAdmin(
    supabaseAdmin,
    req as unknown as { headers: Record<string, string> },
  );
  if (!auth.ok) {
    return res.status(auth.status).json({ detail: auth.detail });
  }

  const body = (req.body || {}) as Record<string, unknown>;
  const applicationId = String(body.applicationId || "").trim();
  const resendOnly = body.resend === true;

  if (!applicationId) {
    return res.status(400).json({ detail: "지원서를 지정해 주세요." });
  }

  const { data: application, error: applicationError } = await supabaseAdmin
    .from("mentor_applications")
    .select("id, user_id, name, email, phone, status")
    .eq("id", applicationId)
    .maybeSingle();

  if (applicationError) {
    console.error("admin/approve-mentor 지원서 조회 실패:", applicationError);
    return res.status(500).json({ detail: "지원서 조회에 실패했습니다." });
  }
  if (!application) {
    return res.status(404).json({ detail: "지원서를 찾을 수 없습니다." });
  }

  const email = String(application.email || "")
    .trim()
    .toLowerCase();
  if (!email.includes("@")) {
    return res
      .status(400)
      .json({ detail: "지원서에 쓸 수 있는 이메일이 없습니다." });
  }

  // 재발송은 이미 승인된 건에만 의미가 있다 — 계정이 없으면 보낼 곳이 없다.
  if (resendOnly) {
    if (!application.user_id) {
      return res
        .status(400)
        .json({ detail: "아직 승인되지 않은 지원서입니다." });
    }
    const sendError = await sendLoginCode(email);
    if (sendError) {
      console.error("admin/approve-mentor 임시코드 재발송 실패:", sendError);
      return res
        .status(500)
        .json({ detail: `임시코드 발송에 실패했습니다: ${sendError}` });
    }
    return res.status(200).json({
      ok: true,
      profileId: application.user_id,
      created: false,
      emailed: true,
    });
  }

  // 이미 승인돼 계정이 붙어 있으면 그 계정을 그대로 쓴다(중복 승인은 코드 재발송과
  // 같은 뜻으로 다룬다 — 관리자가 상태를 오갔다고 계정이 새로 생기면 안 된다).
  let profileId = (application.user_id as string | null) ?? undefined;
  let created = false;

  if (!profileId) {
    // 같은 이메일로 이미 서비스 회원인 경우가 있다. 그 계정을 멘토로 덮어쓰면
    // 학생·학부모로서의 이용 이력이 걸린 행의 member_type 이 바뀌어 결제·마이
    // 페이지 분기가 통째로 달라진다(Checkout 은 mentor 를 결제 대상에서 뺀다).
    // 되돌리기 어려운 데다 자동으로 판단할 근거도 없으므로 여기서 멈춘다.
    const { data: existingProfile, error: lookupError } = await supabaseAdmin
      .from("profiles")
      .select("id, member_type, name")
      .ilike("email", email)
      .maybeSingle();

    if (lookupError) {
      console.error("admin/approve-mentor 계정 조회 실패:", lookupError);
      return res.status(500).json({ detail: "계정 조회에 실패했습니다." });
    }

    if (
      existingProfile?.member_type &&
      existingProfile.member_type !== "mentor"
    ) {
      return res.status(409).json({
        detail:
          `이 이메일은 이미 ${existingProfile.member_type} 회원(${existingProfile.name ?? "이름 없음"})으로 쓰이고 있습니다. ` +
          "같은 계정을 멘토로 바꾸면 그 사람의 결제·마이페이지가 달라지므로 자동으로 처리하지 않습니다. " +
          "멘토용 이메일을 따로 받아 지원서를 수정한 뒤 다시 승인해 주세요.",
      });
    }

    if (existingProfile) {
      profileId = existingProfile.id as string;
    } else {
      // 비밀번호는 멘토가 「비밀번호 재설정」으로 직접 정한다(Figma 4296:7845 의
      // 사이드바 4번째 항목). 여기서는 추측 불가능한 값으로 채워두기만 한다 —
      // 빈 비밀번호로 두면 계정이 만들어지지 않는다.
      const { data: createdUser, error: createError } =
        await supabaseAdmin.auth.admin.createUser({
          email,
          email_confirm: true,
          password: crypto.randomUUID() + crypto.randomUUID(),
        });

      if (createError || !createdUser?.user?.id) {
        console.error("admin/approve-mentor 계정 생성 실패:", createError);
        return res.status(500).json({
          detail: `멘토 계정 생성에 실패했습니다: ${createError?.message || "알 수 없는 오류"}`,
        });
      }

      profileId = createdUser.user.id;
      created = true;
    }
  }

  // prod 에는 auth → profiles 트리거가 없다(supabase/README.md). 새로 만든 계정은
  // 여기서 profiles 행을 직접 넣어야 직원·회원 목록에 이름이 뜬다.
  const { error: profileError } = await supabaseAdmin.from("profiles").upsert(
    {
      id: profileId,
      email,
      name: application.name,
      phone: application.phone,
      member_type: "mentor",
      role: "user",
    },
    { onConflict: "id" },
  );

  if (profileError) {
    console.error("admin/approve-mentor profiles upsert 실패:", profileError);
    return res
      .status(500)
      .json({ detail: `프로필 생성에 실패했습니다: ${profileError.message}` });
  }

  const { error: linkError } = await supabaseAdmin
    .from("mentor_applications")
    .update({ user_id: profileId, status: "active" })
    .eq("id", applicationId);

  if (linkError) {
    console.error("admin/approve-mentor 지원서 갱신 실패:", linkError);
    return res
      .status(500)
      .json({ detail: `지원서 갱신에 실패했습니다: ${linkError.message}` });
  }

  // 여기까지 왔으면 승인 자체는 끝났다. 메일이 실패해도 승인을 되돌리지 않는다 —
  // 되돌리면 계정만 남고 지원서는 미승인인 어긋난 상태가 된다. 대신 실패를
  // 응답에 실어 관리자가 재발송할 수 있게 한다.
  const sendError = await sendLoginCode(email);
  if (sendError) {
    console.error("admin/approve-mentor 임시코드 발송 실패:", sendError);
    return res.status(200).json({
      ok: true,
      profileId,
      created,
      emailed: false,
      detail: `승인은 완료했지만 임시코드 발송에 실패했습니다: ${sendError}`,
    });
  }

  return res.status(200).json({ ok: true, profileId, created, emailed: true });
}
