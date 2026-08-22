// POST /api/admin/send-message
// Authorization: Bearer <supabase access token>
//
// 회원 상세 「알림톡·문자」 탭의 발송 기능. 운영자가 특정 회원에게 자유 문구
// 안내를 보낸다.
//
// 왜 알림톡이 아니라 문자인가
//   알림톡은 카카오 승인을 받은 템플릿 본문만 보낼 수 있다 — 자유 문구는
//   구조상 불가능하다. 그래서 이 경로는 SMS(90바이트 초과 시 LMS)다.
//   참조 HTML 의 안내 문구("90byte 초과 시 자동으로 LMS(장문)로 전환됩니다")도
//   같은 얘기다.
//
// 권한
//   회원 정보를 보고 그 사람에게 연락하는 행위라 자원 키는 'members' 다.
//   **edit 을 요구한다** — 읽기 전용(view) 관리자가 고객에게 문자를 보낼 수는
//   없어야 한다. 판정은 DB 의 fn_admin_can 을 그대로 호출해 화면·데이터·이
//   라우트가 같은 술어를 쓰게 한다(권한 로직을 JS 로 다시 구현하지 않는다).
//
// 응답 규격
//   200 { ok: true, channel, logId }
//   400 { detail }   수신자/본문 누락
//   401 { detail }   토큰 없음/무효
//   403 { detail }   members edit 권한 없음
//   405 { detail }   POST 아님
//   500 { detail }   발송 실패·설정 누락

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getBearerToken } from "../_lib/adminAuth.js";
import { sendPlainMessage } from "../_lib/aligo.js";
import { createSupabaseAdmin } from "../_lib/supabaseAdmin.js";

export const config = { runtime: "nodejs" };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ detail: "Method not allowed" });
  }

  let supabaseAdmin: ReturnType<typeof createSupabaseAdmin>;
  try {
    supabaseAdmin = createSupabaseAdmin();
  } catch (error) {
    console.error("admin/send-message 설정 오류:", error);
    return res.status(500).json({ detail: "서버 설정이 올바르지 않습니다." });
  }

  const token = getBearerToken(
    req as unknown as { headers: Record<string, string> },
  );
  if (!token) return res.status(401).json({ detail: "로그인이 필요합니다." });

  const { data: userData, error: userError } =
    await supabaseAdmin.auth.getUser(token);
  if (userError || !userData?.user?.id) {
    return res.status(401).json({ detail: "로그인이 필요합니다." });
  }
  const actorId = userData.user.id;

  // 권한 판정은 DB 함수에 맡긴다. service_role 은 RLS 를 우회하므로 여기서
  // 직접 물어봐야 하고, 술어를 JS 로 옮겨 적으면 곧 화면과 어긋난다.
  const { data: perms, error: permError } = await supabaseAdmin.rpc(
    "fn_admin_effective_permissions",
    { p_profile_id: actorId },
  );

  if (permError) {
    console.error("admin/send-message 권한 조회 실패:", permError);
    return res.status(500).json({ detail: "권한 확인에 실패했습니다." });
  }

  const canEditMembers = (perms || []).some(
    (row: { resource_key?: string; level?: string }) =>
      row.resource_key === "members" && row.level === "edit",
  );

  if (!canEditMembers) {
    return res
      .status(403)
      .json({
        detail: "회원 관리 수정 권한이 있어야 문자를 보낼 수 있습니다.",
      });
  }

  const body = (req.body || {}) as {
    profileId?: string;
    phone?: string;
    text?: string;
    subject?: string;
  };

  const profileId = String(body.profileId || "").trim() || null;
  const text = String(body.text || "").trim();
  let phone = String(body.phone || "").replace(/[^0-9]/g, "");

  if (!text) {
    return res.status(400).json({ detail: "보낼 내용을 입력해 주세요." });
  }

  // 화면이 번호를 안 넘기면(마스킹 상태라 원문을 모를 수 있다) profile 에서
  // 직접 읽는다 — 마스킹된 문자열이 그대로 넘어와 발송이 실패하는 걸 막는다.
  if (!phone && profileId) {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("phone")
      .eq("id", profileId)
      .maybeSingle();
    phone = String(profile?.phone || "").replace(/[^0-9]/g, "");
  }

  if (!phone) {
    return res.status(400).json({ detail: "수신자 연락처가 없습니다." });
  }

  let result: Awaited<ReturnType<typeof sendPlainMessage>> | null = null;
  let thrown: string | null = null;

  try {
    result = await sendPlainMessage({
      phone,
      text,
      subject: String(body.subject || "").trim() || "위닝에듀 안내",
    });
  } catch (error) {
    thrown = (error as Error).message;
  }

  const ok = Boolean(result?.ok);

  // 이력은 크론과 같은 표에 남긴다 — 회원 상세 탭이 한 곳만 읽으면 되도록.
  // dedupe_key 는 두지 않는다(같은 내용을 일부러 다시 보낼 수 있어야 한다).
  const { data: inserted } = await supabaseAdmin
    .from("alimtalk_send_logs")
    .insert({
      template_key: "manualMessage",
      channel: result?.channel || "sms",
      profile_id: profileId,
      phone,
      subject: String(body.subject || "").trim() || "위닝에듀 안내",
      message: text,
      status: ok ? "sent" : "failed",
      provider_code: result ? String(result.providerCode) : null,
      provider_message: result?.providerMessage || thrown || null,
      provider_msg_id: result?.messageId || null,
      meta: { sentBy: actorId },
    })
    .select("id")
    .maybeSingle();

  if (!ok) {
    return res.status(500).json({
      detail: `발송 실패: ${thrown || result?.providerMessage || "알 수 없는 오류"}`,
    });
  }

  return res.status(200).json({
    ok: true,
    channel: result?.channel,
    logId: (inserted?.id as number) ?? null,
  });
}
