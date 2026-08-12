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

// 부정 신호 — 이 중 하나라도 부분 일치하면 즉시 미결제/비활성으로 본다.
// 순수 부분 일치만 쓰면 '완납예정'.includes('완납'), '결제완료취소'.includes('결제완료'),
// '이용중지'.includes('이용중') 처럼 부정 상태가 긍정으로 잘못 읽힌다. 부정 신호를
// 먼저 걸러야 이 함정을 막는다. '납부대기'가 '대기'를 포함해 거부되는 것도
// 의도한 동작이다(기본값이 결제완료로 읽히면 안 된다).
const NEGATIVE_STATUS_SIGNALS = [
  '미납',
  '미결제',
  '취소',
  '환불',
  '만료',
  '중지',
  '정지',
  '대기',
  '보류',
  '해지',
  '실패',
  '거절',
  '반려',
  '예정',
  '비활성',
  '비정상'
];

export function isPaidStatus(value) {
  const status = normalizeStatus(value);
  if (!status) return false;
  if (NEGATIVE_STATUS_SIGNALS.some((item) => status.includes(item))) return false;

  // program_access.payment_status는 CHECK 제약으로 영문 enum이 강제된다
  // (unpaid/pending/paid/refunded/cancelled). 부분 일치를 쓰면
  // 'unpaid'.includes('paid') === true 가 되어 미결제가 결제완료로 판정된다 —
  // 그래서 영문은 정확 일치만 인정한다.
  if (status === 'paid') return true;

  // admin_enrollments.payment_status는 CHECK가 없는 어드민 자유 입력이라
  // 한글 표기가 다양하게 들어온다. 위에서 부정 신호를 먼저 걸렀으므로
  // 여기서는 부분 일치로 허용해도 안전하다.
  return [
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
  // 상태 미기입은 활성으로 본다. admin_enrollments에는 access_status
  // 개념이 없어 이 값이 아예 비어서 넘어오는 경로가 있다 — 여기서 거부로
  // 바꾸면 그 경로를 쓰는 기존 이용자가 막힌다. 그대로 유지한다.
  if (!status) return true;
  if (NEGATIVE_STATUS_SIGNALS.some((item) => status.includes(item))) return false;

  // program_access.access_status도 CHECK 제약으로 영문 enum이 강제된다
  // (inactive/active/expired/suspended). 부분 일치를 쓰면
  // 'inactive'.includes('active') === true 가 되어 비활성이 활성으로
  // 판정된다 — 그래서 영문은 정확 일치만 인정한다.
  if (status === 'active') return true;

  return ['활성', '사용중', '이용중', '정상'].some((item) => status.includes(item));
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
