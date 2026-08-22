// POST /api/delete-account
//
// 마이페이지 "회원탈퇴"(WithdrawModal 2단계 재확인 이후) 최종 처리(QA #2).
//
// 왜 서버 API인가
//   실제 데이터 삭제와 auth 계정 삭제는 profiles RLS(본인 행 CRUD)로는 낼 수
//   없는 권한(다른 테이블 전삭제, auth.admin.deleteUser/updateUserById)이
//   필요하다 — change-phone.ts와 같은 이유로 service_role 라우트가 필요하다.
//
// 신뢰 경계
//   본인 확인은 세션 토큰(Authorization) 하나다. 토큰에서 얻은 user.id 만
//   삭제 대상으로 쓴다 — 요청 바디로 대상 id를 받지 않는다(다른 계정을
//   지정해 지우는 경로를 원천 차단).
//
// 순서(트랜잭션 불가한 다단계라 재시도 가능하게 auth 삭제를 마지막에 둔다)
//   1) fn_delete_account(RPC, service_role 전용) — 사용자 소유 데이터 정리 +
//      orders/refund_requests/coupon_redemptions 참조 여부에 따라 profiles
//      전삭제('deleted') 또는 개인식별 필드 익명화('anonymized')만 수행.
//      (판단 근거는 supabase/migrations/20260822000005_fn_delete_account.sql
//      상단 주석 — 전자상거래법 5년 보존 대상은 FK가 NOT NULL+RESTRICT라
//      물리 삭제도 NULL 대입도 불가능해 익명화가 유일한 선택지다.)
//   2) mode==='deleted' 면 auth.admin.deleteUser 로 auth.users 까지 지운다
//      (profiles_id_fkey ON DELETE CASCADE라 이미 지워진 뒤라도 안전하다).
//      mode==='anonymized' 면 auth 계정은 남기고 updateUserById(ban_duration)
//      로 로그인만 영구 차단한다 — 이 경우는 auth.admin.deleteUser 를 부르면
//      orders/refund_requests RESTRICT 위반으로 반드시 실패한다.
//
// 1)이 성공한 뒤 2)가 실패해도(네트워크 등) 데이터는 이미 정리돼 있고,
// 이 라우트를 재호출하면 fn_delete_account 는 멱등(이미 지워진/익명화된
// 행에 대해 다시 실행해도 안전)하게 같은 결과를 반환한다.
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createSupabaseAdmin } from "./_lib/supabaseAdmin.js";

export const config = { runtime: "nodejs" };

// auth 계정을 남기고 로그인만 막을 때 쓰는 사실상 영구 차단 기간(약 100년).
// supabase-js 의 ban_duration 은 "none"(해제) 또는 "<n>h" 형태의 문자열만
// 받고 진짜 영구값은 없다 — 100년을 영구로 취급한다(업계 관행).
const PERMANENT_BAN_DURATION = "876000h";

function getBearerToken(req: VercelRequest) {
  return String(req.headers.authorization || "")
    .trim()
    .replace(/^Bearer\s+/i, "");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, detail: "Method not allowed" });
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

    const { data: mode, error: rpcError } = await supabaseAdmin.rpc(
      "fn_delete_account",
      { p_user_id: userId },
    );

    if (rpcError) {
      console.error("[delete-account] fn_delete_account 실패:", rpcError);
      return res.status(500).json({
        ok: false,
        reason: "unknown",
        detail: "탈퇴 처리 중 오류가 발생했습니다.",
      });
    }

    if (mode === "deleted") {
      const { error: authDeleteError } =
        await supabaseAdmin.auth.admin.deleteUser(userId);
      if (authDeleteError) {
        console.error(
          "[delete-account] auth.admin.deleteUser 실패(데이터는 이미 삭제됨, 재시도 가능):",
          authDeleteError,
        );
        return res.status(500).json({
          ok: false,
          reason: "unknown",
          detail: "탈퇴 처리 중 오류가 발생했습니다. 다시 시도해 주세요.",
        });
      }
    } else {
      // anonymized — orders/refund_requests 등 보존 대상이 있어 계정을 물리
      // 삭제할 수 없다. 로그인만 영구 차단한다.
      const { error: banError } = await supabaseAdmin.auth.admin.updateUserById(
        userId,
        { ban_duration: PERMANENT_BAN_DURATION },
      );
      if (banError) {
        console.error(
          "[delete-account] auth.admin.updateUserById(ban) 실패(데이터는 이미 익명화됨, 재시도 가능):",
          banError,
        );
        return res.status(500).json({
          ok: false,
          reason: "unknown",
          detail: "탈퇴 처리 중 오류가 발생했습니다. 다시 시도해 주세요.",
        });
      }
    }

    return res.status(200).json({ ok: true, mode });
  } catch (error) {
    console.error("[delete-account] 오류:", error);
    return res.status(500).json({
      ok: false,
      reason: "unknown",
      detail: "탈퇴 처리 중 오류가 발생했습니다.",
    });
  }
}
