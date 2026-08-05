// POST /api/send-phone-code  { phone, purpose? }
//
// 휴대폰 인증번호를 발송하고 해시만 DB에 남긴다. 평문 코드는 어디에도 저장하지
// 않으며 응답에도 포함하지 않는다.
//
// 인증이 필요 없는(로그인 전) 엔드포인트다. 학부모 가입은 계정을 만들기 전에
// 휴대폰 인증을 하기 때문이다. 대신 실제 요금이 나가는 API이므로 한도를
// 4겹으로 건다 — 번호별 쿨타임/시간당/일일, IP별, 전역 일일 상한.
// (api/_lib/phoneCode.js checkSendLimits)
//
// ⚠️ 남은 구멍: 인증 성공 사실이 아직 가입 RPC와 연결돼 있지 않다.
//   complete_signup_profile은 휴대폰 인증 여부를 보지 않으므로, 클라이언트가
//   이 단계를 건너뛰고 가입을 완료할 수 있다. 학부모 가입 폼을 실서버에 붙일 때
//   phone_verifications.verified_at을 RPC에서 확인하도록 함께 막아야 한다.

import { createSupabaseAdmin } from './_lib/supabaseAdmin.js';
import {
  CODE_TTL_SECONDS,
  COOLDOWN_SECONDS,
  checkSendLimits,
  generateCode,
  getClientIp,
  hashCode,
  isValidMobile,
  maskPhone,
  normalizePhone
} from './_lib/phoneCode.js';
import { getChannel, isDryRun, sendVerificationCode } from './_lib/aligo.js';

// Fixie 프록시(undici ProxyAgent)를 쓰므로 Edge 런타임에서는 동작하지 않는다.
export const config = { runtime: 'nodejs' };

const ALLOWED_PURPOSES = ['signup', 'parent_signup', 'phone_change'];

const LIMIT_MESSAGES = {
  cooldown: '잠시 후에 다시 시도해 주세요.',
  hourly_limit: '인증번호 요청이 많습니다. 1시간 후에 다시 시도해 주세요.',
  daily_limit: '오늘 요청 가능한 횟수를 초과했습니다. 내일 다시 시도해 주세요.',
  ip_hourly_limit: '요청이 많습니다. 잠시 후 다시 시도해 주세요.',
  ip_daily_limit: '요청이 많습니다. 내일 다시 시도해 주세요.',
  service_daily_limit: '일시적으로 인증번호 발송이 어렵습니다. 고객센터로 문의해 주세요.'
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, detail: 'Method not allowed' });
  }

  const phone = normalizePhone(req.body?.phone);
  const purpose = ALLOWED_PURPOSES.includes(req.body?.purpose) ? req.body.purpose : 'signup';

  if (!isValidMobile(phone)) {
    return res.status(400).json({
      ok: false,
      reason: 'invalid_phone',
      detail: '휴대폰 번호 형식이 올바르지 않습니다.'
    });
  }

  const ip = getClientIp(req);

  try {
    const supabase = createSupabaseAdmin();

    const limit = await checkSendLimits(supabase, { phone, ip });

    if (!limit.allowed) {
      // Retry-After는 초 단위 표준 헤더다. 프론트가 쿨타임 표시에 쓸 수 있다.
      res.setHeader('Retry-After', String(limit.retryAfter || COOLDOWN_SECONDS));

      return res.status(429).json({
        ok: false,
        reason: limit.reason,
        retry_after: limit.retryAfter || COOLDOWN_SECONDS,
        detail: LIMIT_MESSAGES[limit.reason] || '잠시 후에 다시 시도해 주세요.'
      });
    }

    const code = generateCode();
    const expiresAt = new Date(Date.now() + CODE_TTL_SECONDS * 1000).toISOString();

    // 발송을 먼저 시도한다. 저장부터 하면 발송이 실패했을 때 쿨타임만 소모된다.
    const result = await sendVerificationCode({ phone, code });

    if (!result.ok) {
      console.error(
        `[send-phone-code] 발송 실패 ${maskPhone(phone)} channel=${result.channel} ` +
          `code=${result.providerCode} message=${result.providerMessage}`
      );

      return res.status(502).json({
        ok: false,
        reason: 'send_failed',
        detail: '인증번호 발송에 실패했습니다. 잠시 후 다시 시도해 주세요.'
      });
    }

    const { error: insertError } = await supabase.from('phone_verifications').insert({
      phone,
      code_hash: hashCode(phone, code),
      purpose,
      expires_at: expiresAt,
      request_ip: ip
    });

    if (insertError) {
      // 문자는 이미 나갔는데 기록이 안 된 상태다. 사용자는 코드를 받았지만
      // 검증할 수 없으므로 재발송을 유도한다.
      console.error('[send-phone-code] 인증 기록 저장 실패:', insertError);

      return res.status(500).json({
        ok: false,
        reason: 'store_failed',
        detail: '인증번호 처리 중 문제가 발생했습니다. 다시 시도해 주세요.'
      });
    }

    return res.status(200).json({
      ok: true,
      expires_in: CODE_TTL_SECONDS,
      cooldown: COOLDOWN_SECONDS,
      // 운영에서는 항상 false여야 한다. true면 문자가 실제로 안 나간 것이다.
      dry_run: Boolean(result.dryRun),
      channel: getChannel()
    });
  } catch (error) {
    console.error('[send-phone-code] 오류:', error);

    // 설정 누락(프록시·키·시크릿)은 개발자가 봐야 할 오류라 구분해 남긴다.
    const isConfigError =
      /환경변수|FIXIE_URL|PHONE_CODE_SECRET/.test(String(error?.message || '')) && !isDryRun();

    return res.status(500).json({
      ok: false,
      reason: isConfigError ? 'server_misconfigured' : 'unknown',
      detail: '인증번호 발송 중 오류가 발생했습니다.'
    });
  }
}
