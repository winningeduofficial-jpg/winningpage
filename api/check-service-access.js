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
//   200 { allowed: true|false }  — 정상 판정. 미결제는 에러가 아니라
//                                  allowed:false다(가드가 정상 분기해야 함).
//   400 { detail }               — 알 수 없는 service_key.
//   401 { detail }                — 토큰 없음/무효.
//   405 { detail }                — POST 아님.
//   500 { detail }                — 서버 설정 누락 등 예외.

import { createSupabaseAdmin } from './_lib/supabaseAdmin.js';
import { SERVICE_CONFIGS, clean, getBearerToken, hasPaidServiceAccess } from './_lib/serviceAccess.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ detail: 'Method not allowed' });
  }

  try {
    const { service_key } = req.body || {};
    const config = SERVICE_CONFIGS[clean(service_key)];

    if (!config) {
      return res.status(400).json({ detail: '알 수 없는 서비스입니다.' });
    }

    const token = getBearerToken(req);
    if (!token) {
      return res.status(401).json({ detail: '로그인이 필요합니다.' });
    }

    const supabaseAdmin = createSupabaseAdmin();
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);

    if (userError || !userData?.user?.id) {
      return res.status(401).json({ detail: '로그인이 필요합니다.' });
    }

    const userId = userData.user.id;
    // hasPaidServiceAccess는 이제 { allowed, reason } 을 돌려준다(기간만료
    // 사유를 create-service-ticket.js가 구분해 응답하기 위함) — 여기서는
    // 조회 응답 규격이 boolean 이므로 allowed만 뽑아 쓴다.
    const { allowed } = await hasPaidServiceAccess(supabaseAdmin, userId, config);

    return res.status(200).json({ allowed });
  } catch (error) {
    console.error('check-service-access error:', error);
    return res.status(500).json({ detail: '이용권 확인 중 오류가 발생했습니다.' });
  }
}
