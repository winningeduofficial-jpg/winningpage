import crypto from 'crypto';
import { createSupabaseAdmin, getEnv } from './_lib/supabaseAdmin.js';
import {
  SERVICE_CONFIGS,
  clean,
  getBearerToken,
  hasPaidServiceAccess
} from './_lib/serviceAccess.js';

const PAID_MESSAGE = '유료결제이후 이용해주세요!';
const TICKET_TTL_SECONDS = Number(process.env.SSO_TICKET_TTL_SECONDS || 180);

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
