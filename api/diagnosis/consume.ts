// POST /api/diagnosis/consume  { attemptId }
// Authorization: Bearer <access_token>
//
// 학습진단 제출 소진 — consume_diagnosis_attempt RPC(supabase/migrations/
// 20260821000005_diagnosis_gating.sql)를 감싸는 유일한 라우트다. 무료 1회
// 미사용이면 무료로 기록하고, 사용했으면 diagnose 이용권 회차에서 1개 차감한다.
// attemptId는 클라이언트가 제출 직전에 만드는 uuid로, 더블클릭·재시도 멱등 키다
// (RPC pk 충돌이 아니라 같은 attempt id 재조회로 처리된다 — 아래 already_recorded).
//
// 응답 규격은 api/performance/recommend-topics.ts와 같은 관례(fail() 헬퍼,
// 코드별 HTTP status)를 따른다 — 이 저장소의 회차 소진 라우트가 이미 그 모양으로
// 통일돼 있어(§9.3 참고 스타일), 학습진단만 200+ok:false로 다르게 갈 이유가 없다.
//
//   → 200 { ok:true, status:'free_used'|'charged'|'already_recorded', charged,
//           quotaRemaining, quotaTotal, planEndsAt }
//   → 400 INVALID_ATTEMPT_ID
//   → 401 UNAUTHENTICATED
//   → 403 NO_ENTITLEMENT / ENTITLEMENT_EXPIRED
//   → 405 METHOD_NOT_ALLOWED
//   → 409 QUOTA_EXHAUSTED / ATTEMPT_CONFLICT
//   → 500 INTERNAL
//
// ⚠️ RPC는 service_role 전용(SECURITY DEFINER, grant는 service_role에만)이라
//    이 라우트가 유일한 소비 진입점이다 — 프런트가 diagnosis_attempts에 직접 쓸 방법이 없다.
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getBearerToken } from "../_lib/serviceAccess.js";
import { createSupabaseAdmin } from "../_lib/supabaseAdmin.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fail(
  res: VercelResponse,
  status: number,
  code: string,
  message: string,
  extra?: Record<string, unknown>,
) {
  return res.status(status).json({ ok: false, error: { code, message }, ...extra });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return fail(res, 405, "METHOD_NOT_ALLOWED", "POST만 허용됩니다.");
  }

  res.setHeader("Cache-Control", "no-store");

  try {
    const token = getBearerToken(req as { headers: Record<string, string> });
    if (!token) {
      return fail(res, 401, "UNAUTHENTICATED", "로그인이 필요합니다.");
    }

    const supabaseAdmin = createSupabaseAdmin();
    const { data: userData, error: userError } =
      await supabaseAdmin.auth.getUser(token);
    if (userError || !userData?.user?.id) {
      return fail(res, 401, "UNAUTHENTICATED", "로그인이 필요합니다.");
    }
    const userId = userData.user.id;

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const attemptId =
      typeof body.attemptId === "string" ? body.attemptId.trim() : "";
    if (!UUID_RE.test(attemptId)) {
      return fail(
        res,
        400,
        "INVALID_ATTEMPT_ID",
        "attemptId가 올바르지 않습니다.",
      );
    }

    const { data: resultRaw, error: rpcError } = await supabaseAdmin.rpc(
      "consume_diagnosis_attempt",
      {
        p_attempt_id: attemptId,
        p_profile_id: userId,
        p_reason: "diagnosis:survey-submit",
      },
    );

    if (rpcError) {
      console.error("diagnosis/consume RPC 실패:", rpcError);
      return fail(res, 500, "INTERNAL", "학습진단 제출 처리에 실패했습니다.");
    }

    const result = resultRaw && typeof resultRaw === "object" ? resultRaw : {};
    const status = String(result.status || "");

    const quotaFields = {
      quotaRemaining: result.quota_remaining ?? null,
      quotaTotal: result.quota_total ?? null,
      planEndsAt: result.plan_ends_at ?? null,
    };

    if (status === "free_used" || status === "charged") {
      return res.status(200).json({
        ok: true,
        status,
        charged: result.charged === true,
        ...quotaFields,
      });
    }

    if (status === "already_recorded") {
      // 멱등 재생 — 같은 attemptId로 재호출(더블클릭·네트워크 재시도). 이번 호출로는
      // 아무것도 다시 차감하지 않는다.
      return res.status(200).json({
        ok: true,
        status,
        charged: false,
        ...quotaFields,
      });
    }

    if (status === "no_entitlement") {
      return fail(
        res,
        403,
        "NO_ENTITLEMENT",
        "유료 이용권을 결제하신 뒤 이용할 수 있습니다.",
      );
    }

    if (status === "entitlement_expired") {
      return fail(
        res,
        403,
        "ENTITLEMENT_EXPIRED",
        "이용권 사용 기간이 끝났어요.",
        { planEndsAt: quotaFields.planEndsAt },
      );
    }

    if (status === "quota_exhausted") {
      return fail(
        res,
        409,
        "QUOTA_EXHAUSTED",
        "이용 가능한 횟수를 모두 사용했어요.",
        quotaFields,
      );
    }

    if (status === "attempt_conflict") {
      // 남의 attemptId 재사용 — 정상 흐름에서는 나오지 않는다(클라이언트가 매 제출
      // 플로우마다 crypto.randomUUID()로 새로 만든다).
      return fail(
        res,
        409,
        "ATTEMPT_CONFLICT",
        "이미 사용된 요청입니다. 다시 시도해 주세요.",
      );
    }

    console.error("diagnosis/consume 알 수 없는 RPC 상태:", status);
    return fail(res, 500, "INTERNAL", "학습진단 제출 처리에 실패했습니다.");
  } catch (error) {
    console.error("diagnosis/consume error:", error);
    return fail(res, 500, "INTERNAL", "학습진단 제출 처리에 실패했습니다.");
  }
}

export const config = { runtime: "nodejs" };
