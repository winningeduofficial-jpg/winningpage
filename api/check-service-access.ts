// POST /api/check-service-access  { service_key }
// Authorization: Bearer <access_token>
//
// 클라이언트가 "이 사용자가 이 서비스의 유료 이용권을 가졌는가"를 물어보는
// 읽기 전용 엔드포인트다. 판정 로직 자체는 api/_lib/serviceAccess.js
// (program_access / enrollments 판정)에 있고, 여기서는 그걸 그대로
// 불러 쓴다 — api/create-service-ticket.js와 정확히 같은 규칙을 쓴다는
// 뜻이다. orders 테이블은 보지 않는다(그 이유는 serviceAccess.js 상단 주석
// 참고).
//
// create-service-ticket.js와 다른 점: 이 엔드포인트는 SSO 티켓을 발급하지
// 않는다. target_url도, SSO_SECRET도 요구하지 않고 sso_tickets에 아무것도
// 쓰지 않는다 — 순수 조회다. RequireGoalAccess 같은 가드가 "결제 페이지로
// 보낼지 말지"를 정하는 데만 쓴다.
//
// 응답 규격
//   200 {
//     allowed: true|false,        — 정상 판정. 미결제는 에러가 아니라
//                                   allowed:false다(가드가 정상 분기해야 함).
//     quotaRemaining: int|null,   — 남은 회차. **null이면 무제한**(0이 아니다).
//     quotaTotal: int|null,       — 총 회차. null이면 무제한.
//     planEndsAt: string|null,    — 이용권 만료 시각(ISO).
//     planLabel: string|null      — 상품 표시명.
//   }
//   400 { detail }               — 알 수 없는 service_key.
//   401 { detail }                — 토큰 없음/무효.
//   405 { detail }                — POST 아님.
//   500 { detail }                — 서버 설정 누락 등 예외.
//
// ⚠️ 회차 4필드는 **안내용이다. 이 응답은 차단 권위가 아니다.**
//    실제 차단은 sql/54_performance_app.sql의 consume_performance_credit RPC
//    결과로만 이뤄진다 — 그 RPC가 program_access 행을 `for update`로 잠그고
//    원장(performance_credit_ledger) INSERT에 성공했을 때만 회차가 준다.
//    여기서는 잠금 없이 읽기만 하므로, 응답을 만드는 사이에 다른 탭·기기가
//    차감하면 값이 즉시 낡는다. 클라이언트는 이 값으로 "남은 횟수 N회"를
//    표시하고 소진 배너를 띄우는 데까지만 쓰고, 진행 가능 여부는 반드시
//    api/performance/* 응답(409 QUOTA_EXHAUSTED)으로 판단해야 한다
//    (명세서 §2.2 「클라이언트 판정은 항상 안내용」, §9.3).
//
// 하위호환: 기존 호출부(src/lib/entitlement.js → RequireGoalAccess)는
// `allowed` 하나만 읽는다. 위 4필드는 **추가**일 뿐이며 allowed의 의미·타입은
// 바뀌지 않았다. 회차 개념이 없는 서비스(goal)는 4필드가 전부 null로 나간다.

import {
  clean,
  findProgramAccessRow,
  hasPaidServiceAccess,
  readQuotaSnapshot,
  SERVICE_CONFIGS,
} from "./_lib/serviceAccess.js";
import { defineHandler } from "./_lib/handler.js";
import { sendError } from "./_lib/httpResponse.js";

export default defineHandler({
  methods: ["POST"],
  auth: "user",
  errorShape: "detail",
  unhandledMessage: "이용권 확인 중 오류가 발생했습니다.",
  logLabel: "check-service-access",
  handler: async (req, res, ctx) => {
    const { service_key } = req.body || {};
    const config = SERVICE_CONFIGS[clean(service_key)];

    if (!config) {
      sendError(res, "detail", 400, "알 수 없는 서비스입니다.");
      return;
    }

    const userId = ctx.userId!;
    // hasPaidServiceAccess는 이제 { allowed, reason } 을 돌려준다(기간만료
    // 사유를 create-service-ticket.js가 구분해 응답하기 위함) — 여기서는
    // 조회 응답 규격이 boolean 이므로 allowed만 뽑아 쓴다.
    const { allowed } = await hasPaidServiceAccess(
      ctx.supabaseAdmin,
      userId,
      config,
    );

    // 회차 조회는 판정과 독립이다. 실패해도 allowed를 흔들지 않는다 —
    // 부가 정보를 못 읽었다고 결제 완료 사용자를 미보유로 떨어뜨리면 안 된다.
    // (allowed:true인데 회차가 null이면 클라이언트는 "무제한"으로 읽으므로,
    //  안내가 과하게 관대해질 뿐 차단은 서버 RPC가 그대로 한다.)
    let quota = await readQuotaSnapshot(ctx.supabaseAdmin, userId, null);
    try {
      const accessRow = await findProgramAccessRow(
        ctx.supabaseAdmin,
        userId,
        config,
      );
      quota = await readQuotaSnapshot(ctx.supabaseAdmin, userId, accessRow);
    } catch (quotaError) {
      console.error(
        "check-service-access quota lookup 실패(무시):",
        quotaError,
      );
    }

    res.status(200).json({
      allowed,
      quotaRemaining: quota.quotaRemaining,
      quotaTotal: quota.quotaTotal,
      planEndsAt: quota.planEndsAt,
      planLabel: quota.planLabel,
    });
  },
});
