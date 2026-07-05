import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const PAID_MESSAGE = '유료결제이후 이용해주세요!';
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
    program_keys: ['goal', 'target']
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

function isPaidStatus(value) {
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

function isActiveStatus(value) {
  const status = normalizeStatus(value);
  if (!status) return true;
  return ['active', '활성', '사용중', '이용중', '정상'].some((item) => status.includes(item));
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

async function checkProgramAccessTable(supabaseAdmin, userId, config) {
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

async function checkEnrollmentPayment(supabaseAdmin, userId, config) {
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

async function hasPaidServiceAccess(supabaseAdmin, userId, config) {
  const byProgramAccess = await checkProgramAccessTable(supabaseAdmin, userId, config);
  if (byProgramAccess) return true;

  return checkEnrollmentPayment(supabaseAdmin, userId, config);
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
    const allowed = await hasPaidServiceAccess(supabaseAdmin, userId, config);

    if (!allowed) {
      return res.status(403).json({ detail: PAID_MESSAGE });
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
