// 이용권(유료 서비스 접근) 판정 — 서버가 유일한 정본이다.
//
// 판정에 쓰는 소스는 두 곳뿐이다: program_access, admin_enrollments.
// orders는 보지 않는다 — orders는 결제 시도/완료 기록이고, "지금 서비스를
// 쓸 수 있는가"는 program_access.access_status / admin_enrollments의
// payment_status로만 정해진다. 클라이언트가 orders를 직접 조회해 이 규칙을
// 다시 구현하면(과거 한 차례 그랬다) 서버와 반드시 어긋난다 — orders만
// 있고 program_access/admin_enrollments가 없는 사용자, 혹은 그 반대인
// 사용자가 생기면 양쪽 판정이 갈린다. 그래서 판정 로직은 여기 한 곳에만
// 두고, api/create-service-ticket.js(SSO 티켓 발급)와
// api/check-service-access.js(클라이언트 조회용, 읽기 전용)가 함께 쓴다.
//
// target_url·SSO_SECRET·티켓 서명처럼 "티켓 발급" 전용 로직은 여기 없다.
// 그건 api/create-service-ticket.js에 남아 있다 — 접근 판정과는 관심사가
// 다르다(check-service-access.js는 target_url/SSO_SECRET을 아예 요구하지
// 않는다).

export const SERVICE_CONFIGS = {
  suhaeng: {
    service_key: 'suhaeng',
    service_name: 'AI 수행평가 서비스',
    target_url: process.env.SUHAENG_SERVICE_URL,
    payment_keywords: ['수행', '수행평가', 'AI 수행평가', '세특팅'],
    program_keys: ['suhaeng']
  },
  goal: {
    service_key: 'goal',
    service_name: '목표관리 서비스',
    target_url: process.env.GOAL_SERVICE_URL || process.env.TARGET_SERVICE_URL,
    payment_keywords: ['목표', '목표관리', '목표 관리', '학습관리', '학습 관리'],
    program_keys: ['goal', 'target']
  }
};

export function clean(value) {
  return String(value || '').trim();
}

function normalizeStatus(value) {
  return clean(value).toLowerCase().replace(/\s/g, '');
}

export function isPaidStatus(value) {
  const status = normalizeStatus(value);
  return [
    'paid',
    'active',
    '완납',
    '납부완료',
    '결제완료',
    '결제완료됨',
    '결제완료/이용중',
    '이용중'
  ].some((item) => status.includes(item));
}

export function isActiveStatus(value) {
  const status = normalizeStatus(value);
  if (!status) return true;
  return ['active', '활성', '사용중', '이용중', '정상'].some((item) => status.includes(item));
}

/** Authorization: Bearer <token> 헤더에서 토큰만 뽑는다. */
export function getBearerToken(req) {
  return clean(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
}

export async function checkProgramAccessTable(supabaseAdmin, userId, config) {
  const selectors = ['id', 'user_id', 'profile_id'];

  for (const column of selectors) {
    for (const programKey of config.program_keys) {
      const { data, error } = await supabaseAdmin
        .from('program_access')
        .select('id, payment_status, access_status')
        .eq(column, userId)
        .eq('program_key', programKey)
        .maybeSingle();

      if (error) continue;

      if (data && isPaidStatus(data.payment_status) && isActiveStatus(data.access_status)) {
        return true;
      }
    }
  }

  return false;
}

export async function checkEnrollmentPayment(supabaseAdmin, userId, config) {
  const { data, error } = await supabaseAdmin
    .from('admin_enrollments')
    .select('id, profile_id, category_name, program_name, class_name, payment_status, application_status')
    .eq('profile_id', userId)
    .limit(100);

  if (error) {
    throw error;
  }

  return (data || []).some((row) => {
    const nameText = [row.category_name, row.program_name, row.class_name]
      .map((value) => clean(value))
      .join(' ');

    const serviceMatched = config.payment_keywords.some((keyword) => nameText.includes(keyword));
    return serviceMatched && isPaidStatus(row.payment_status);
  });
}

export async function hasPaidServiceAccess(supabaseAdmin, userId, config) {
  const byProgramAccess = await checkProgramAccessTable(supabaseAdmin, userId, config);
  if (byProgramAccess) return true;

  return checkEnrollmentPayment(supabaseAdmin, userId, config);
}
