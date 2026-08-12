import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const PAID_MESSAGE = '유료결제이후 이용해주세요!';
// 기간 만료 전용 안내(아래 checkProgramAccessTable 참고). ToS(StudentService.jsx
// /ParentService.jsx §제3항)가 이미 쓰는 "재결제(재구매)" 어휘를 그대로 따른다 —
// "결제해 주세요" 로만 쓰면 이미 낸 돈을 부정하는 말로 읽힌다.
const EXPIRED_MESSAGE = '이용 기간이 만료되었습니다. 계속 이용하시려면 재결제(재구매)해 주세요.';
const TICKET_TTL_SECONDS = Number(process.env.SSO_TICKET_TTL_SECONDS || 180);

const SERVICE_CONFIGS = {
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
    // program_keys 는 program_access 테이블에서 조회할 후보다. 예전엔
    // ['goal', 'target'] 두 값을 다 받아줬다 — products.service_key='goal'
    // 이 program_key로도 그대로 쓰이던 시절의 흔적인데, DB 에 관계가 없어
    // dev 가 실제로 'goal' 로 어긋나 있었다(sql/54_program_access_grant.sql
    // "goal → target 전환" 절). 지금은 sql/60_product_program_relation.sql
    // 이 products.program_key 로 이 관계를 못박아 grantProgramAccessForOrder
    // (api/_lib/programAccess.js)가 goal 상품 결제 시 항상 program_key=
    // 'target' 으로만 쓴다 — 'goal' 로 쓰는 코드 경로가 이제 하나도 없다.
    // 운영 DB(ucjlcvqvinspmrasvsug) 확인상 program_access.program_key=
    // 'goal' 인 행도 이미 없었다(target 2건만 실재, sql/54 동일 절) — 이
    // 관용을 좁혀도 기존 사용자의 앱 진입이 끊기지 않는다(2026-08-11).
    program_keys: ['target']
  }
};

function clean(value) {
  return String(value || '').trim();
}

function getEnv(...keys) {
  for (const key of keys) {
    const value = clean(process.env[key]);
    if (value) return value;
  }
  return '';
}

function normalizeStatus(value) {
  return clean(value).toLowerCase().replace(/\s/g, '');
}

// enrollments(오프라인 수강) 경로 전용 상태 판정.
//
// program_access 경로는 2026-08-12 부터 이 문자열 판정을 쓰지 않는다 —
// sql/64 10)절 public.fn_program_access_state 가 payment_status·access_status·
// 기간 만료를 한 곳에서 판정한다(아래 checkProgramAccessTable 참고). 여기 남은
// 판정은 enrollments.payment_status 하나뿐인데, 그 컬럼은 어드민이 한국어로
// 자유 입력하는 값이라 CHECK 어휘로 좁힐 수 없어 부분일치 판정이 계속 필요하다.
//
// 부정 상태를 먼저 끊는다 — 판정이 includes(부분일치)라서 그냥 두면
// 'unpaid'.includes('paid') 가 true 가 되어 미납이 결제완료로 통과한다.
const DENIED_PAYMENT_STATUSES = [
  'unpaid',
  'refunded',
  'refund',
  'cancelled',
  'canceled',
  '미납',
  '미결제',
  '환불',
  '취소'
];

function isPaidStatus(value) {
  const status = normalizeStatus(value);
  if (DENIED_PAYMENT_STATUSES.some((item) => status.includes(item))) return false;
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

function base64urlJson(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function signTicket(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const body = `${base64urlJson(header)}.${base64urlJson(payload)}`;
  const signature = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${signature}`;
}

function getBearerToken(req) {
  return clean(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
}

function createSupabaseAdmin() {
  const url = getEnv('WINNING_SUPABASE_URL', 'SUPABASE_URL', 'VITE_SUPABASE_URL');
  const key = getEnv(
    'WINNING_SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'WINNING_SUPABASE_KEY',
    'SUPABASE_KEY'
  );

  if (!url || !key) {
    throw new Error('WINNING_SUPABASE_URL / WINNING_SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다.');
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

// 입장 판정. 정본은 DB 함수 하나다 — sql/64 10)절
// public.fn_program_access_state(profile_id, program_keys[]).
//
// 왜 SQL 함수로 옮겼는가 (감사 결과 M1)
//   예전 이 함수는 payment_status·access_status 두 컬럼만 읽었다. 즉 **기간
//   만료를 집행하는 코드가 이 저장소에 하나도 없었다** — 1개월권을 산 사람이
//   3년 뒤에도 들어갔다. 만료 판정은 "저장된 만료값 < now()" 라는 시각 비교라
//   DB 에서 하는 것이 맞고(자동 만료 cron 이 없어 판정 시점 계산이 유일한
//   집행 수단이다), 같은 계산을 배포된 소비 함수
//   (public.consume_performance_credit)도 하고 있어 식이 갈리면 게이트와 차감이
//   서로 다른 진실을 갖는다.
//
// 왜 3컬럼(id/user_id/profile_id) 순회를 없앴는가 (M15)
//   sql/64 4)절 program_access_identity_equality_check 가 세 컬럼의 등호를
//   강제하므로 id 단일 조회가 3컬럼 OR 와 **동치임이 제약으로 증명된다.**
//   그리고 PK 가 (id, program_key) 라 program_key 당 최대 1행이다 — 예전
//   구현의 .maybeSingle() 이 다행에서 PGRST116 을 내고 그 에러를
//   `if (error) continue` 가 삼켜 정상 결제자가 로그 0줄로 403 을 맞던 경로가
//   구조적으로 사라진다.
//
// 회차는 여기서 보지 않는다
//   게이트는 기간만 본다. 회차 차감·소진 판정은 소비 지점(배포된
//   consume_performance_credit)이 한다 — "회차 0 + 기간 유효" 상태의 입장
//   허용 여부는 확정 정책에 없는 미결 항목이라, 게이트를 기간 전용으로 두어
//   현행 동작을 바꾸지 않는다.
async function checkProgramAccessTable(supabaseAdmin, userId, config) {
  const { data, error } = await supabaseAdmin.rpc('fn_program_access_state', {
    p_profile_id: userId,
    p_program_keys: config.program_keys
  });

  if (error) {
    // 에러를 삼키지 않는다. 예전 `if (error) continue` 는 판정 실패를 "권한
    // 없음"과 구별하지 않아, 결제자가 로그 한 줄 없이 403 을 맞았다. 로그를
    // 남기고 fail-closed 한다 — 판정할 수 없으면 열지 않는다(돈이 걸린 판단은
    // 되돌릴 수 있는 쪽으로).
    console.error('fn_program_access_state 호출 실패:', config.service_key, userId, error);
    return { allowed: false, reason: null };
  }

  const rows = Array.isArray(data) ? data : [];
  if (rows.some((row) => row.allowed === true)) return { allowed: true, reason: null };

  // 거부 사유를 남긴다. 만료(period_expired)와 미결제(not_paid)는 사용자에게
  // 다른 상태다 — 만료면 EXPIRED_MESSAGE, 그 외(미결제 등)는 PAID_MESSAGE 로
  // 호출부(handler)가 갈라 응답한다.
  for (const row of rows) {
    console.warn(
      'program_access denied:',
      config.service_key,
      row.program_key,
      row.reason,
      row.expires_at ?? 'unlimited'
    );
  }
  const expired = rows.some((row) => row.reason === 'period_expired');
  return { allowed: false, reason: expired ? 'period_expired' : null };
}

async function checkEnrollmentPayment(supabaseAdmin, userId, config) {
  // sql/61_offline_enrollment_consolidation.sql — 예전엔 admin_enrollments 를
  // 조회했는데, 어드민이 실제로 수강생을 등록하는 테이블(src/pages/Admin.jsx
  // 'enrollments' config)과 달라 정상 등록한 오프라인 수강생이 앱에 절대
  // 못 들어가는 구조였다. 판정에 쓰는 7개 컬럼(id/profile_id/category_name/
  // program_name/class_name/payment_status/application_status)은 두 테이블에
  // 이름이 전부 동일해 컬럼명 치환 없이 테이블만 바꿨다(판정 로직은 그대로).
  const { data, error } = await supabaseAdmin
    .from('enrollments')
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

async function hasPaidServiceAccess(supabaseAdmin, userId, config) {
  const byProgramAccess = await checkProgramAccessTable(supabaseAdmin, userId, config);
  if (byProgramAccess.allowed) return { allowed: true, reason: null };

  // ⚠ 이 경로는 기간 만료를 집행하지 않는다. enrollments(오프라인 수강)에는
  //    기간 컬럼이 0개라 만료 개념 자체가 없어서, 이 OR 분기로 들어온 사용자는
  //    영구 입장이 성립한다. dev 실측 0행이라 현재 미발현이지만 구조적 구멍이다.
  //    오프라인 수강의 기간 정책은 미결 항목이며 이번 범위 밖이다
  //    (sql/64 파일 말미 "남겨 둔 것" 참고).
  const byEnrollment = await checkEnrollmentPayment(supabaseAdmin, userId, config);
  if (byEnrollment) return { allowed: true, reason: null };

  // program_access 쪽 판정이 만료였다면 enrollments 는 그 사유를 뒤집지 못한다
  // (enrollments 는 애초에 만료 개념이 없다) — program_access 의 reason 을 그대로 쓴다.
  return { allowed: false, reason: byProgramAccess.reason };
}

function getUserName(user) {
  const meta = user?.user_metadata || {};
  return clean(meta.name || meta.full_name || meta.student_name || user?.email || '');
}

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

    if (!config.target_url) {
      return res.status(500).json({ detail: `${config.service_name} target_url 환경변수가 필요합니다.` });
    }

    const secret = getEnv('SSO_SECRET');
    if (!secret || secret.length < 32) {
      return res.status(500).json({ detail: 'SSO_SECRET 환경변수가 필요합니다. 32자 이상으로 설정해주세요.' });
    }

    const token = getBearerToken(req);
    if (!token) {
      return res.status(401).json({ detail: PAID_MESSAGE });
    }

    const supabaseAdmin = createSupabaseAdmin();
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);

    if (userError || !userData?.user?.id) {
      return res.status(401).json({ detail: PAID_MESSAGE });
    }

    const user = userData.user;
    const userId = user.id;
    const access = await hasPaidServiceAccess(supabaseAdmin, userId, config);

    if (!access.allowed) {
      const detail = access.reason === 'period_expired' ? EXPIRED_MESSAGE : PAID_MESSAGE;
      return res.status(403).json({ detail });
    }

    const now = Date.now();
    const ticketId = crypto.randomUUID();
    const issuedAt = new Date(now).toISOString();
    const expiresAt = new Date(now + TICKET_TTL_SECONDS * 1000).toISOString();
    const userName = getUserName(user);

    const payload = {
      ticket_id: ticketId,
      nonce: ticketId,
      winning_user_id: userId,
      profile_id: userId,
      service_key: config.service_key,
      user_name: userName,
      student_name: userName,
      issued_at: issuedAt,
      expires_at: expiresAt
    };

    const ticket = signTicket(payload, secret);
    const ticketHash = sha256(ticket);

    const { error: insertError } = await supabaseAdmin
      .from('sso_tickets')
      .insert({
        ticket_id: ticketId,
        ticket_hash: ticketHash,
        service_key: config.service_key,
        winning_user_id: userId,
        user_name: userName,
        issued_at: issuedAt,
        expires_at: expiresAt
      });

    if (insertError) {
      console.error('sso_tickets insert error:', insertError);
      return res.status(500).json({
        detail: 'sso_tickets 테이블이 없거나 저장 권한이 없습니다. 추가 SQL 적용이 필요합니다.'
      });
    }

    const redirectUrl = new URL(config.target_url);
    redirectUrl.searchParams.set('sso_ticket', ticket);

    return res.status(200).json({
      ok: true,
      service_key: config.service_key,
      redirect_url: redirectUrl.toString(),
      expires_at: expiresAt
    });
  } catch (error) {
    console.error('create-service-ticket error:', error);
    return res.status(500).json({ detail: '서비스 입장권 생성 중 오류가 발생했습니다.' });
  }
}
