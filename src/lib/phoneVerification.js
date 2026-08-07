// 휴대폰 인증(알림톡/SMS). mockApi.js의 requestPhoneVerificationCode/
// verifyPhoneVerificationCode를 대체한다.
//
// ⚠️ mock과 구조가 다르다 — 단순 치환이 아니다
//   mock은 발송 시점 코드를 클라이언트에 내려주고 프론트가 로컬 비교했다.
//   그러면 응답만 열어봐도 누구나 통과한다. 실제로는 **검증도 서버가** 한다
//   (api/verify-phone-code.js). 그래서 호출부에 mockCode를 들고 있던 상태가
//   사라지고, 검증 결과를 서버 응답으로 받는다.
//
// 시도 횟수 제한
//   6자리 숫자는 경우의 수가 100만뿐이라 서버가 5회로 끊는다. 틀릴 때마다
//   remainingAttempts가 줄고, 소진되면 재발송 외에는 방법이 없다. 호출부는
//   같은 코드를 반복해서 보내지 않도록 주의해야 한다 — 자동 검증을 걸어두면
//   지웠다 다시 입력하는 것만으로 시도가 깎인다.

// 이미 가입에 쓰인 번호일 때의 문구. 발송 API(reason:'phone_taken')와 가입 RPC
// (duplicate_phone) 양쪽에서 같은 말을 해야 해서 상수로 뽑아 export한다.
export const DUPLICATE_PHONE_MESSAGE = '중복된 전화번호입니다.';

const MESSAGES = {
  invalid_phone: '휴대폰 번호 형식이 올바르지 않습니다.',
  phone_taken: DUPLICATE_PHONE_MESSAGE,
  invalid_code_format: '인증번호 6자리를 입력해 주세요.',
  code_not_found: '인증번호를 먼저 요청해 주세요.',
  code_expired: '인증번호가 만료되었습니다. 다시 요청해 주세요.',
  code_mismatch: '인증번호가 일치하지 않습니다.',
  too_many_attempts: '시도 횟수를 초과했습니다. 인증번호를 다시 요청해 주세요.',
  send_failed: '인증번호 발송에 실패했습니다. 잠시 후 다시 시도해 주세요.',
  network: '연결 상태를 확인한 뒤 다시 시도해 주세요.',
  unknown: '잠시 후 다시 시도해 주세요.'
};

/** 하이픈·공백을 걷어낸다. 서버도 정규화하지만 화면 표시와 비교를 맞추려면 여기서도 한다. */
export function normalizePhone(raw) {
  return String(raw || '').replace(/[^0-9]/g, '');
}

export function isValidMobile(phone) {
  return /^01[0-9]{8,9}$/.test(normalizePhone(phone));
}

async function postJson(url, body) {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const payload = await response.json();
    return { response, payload };
  } catch {
    return { response: null, payload: null };
  }
}

/**
 * 인증번호를 발송한다.
 * @returns {Promise<{ok: true, expiresIn: number, cooldown: number, dryRun: boolean}
 *   | {ok: false, reason: string, message: string, retryAfter?: number}>}
 */
export async function sendPhoneCode(phone, purpose = 'parent_signup') {
  const normalized = normalizePhone(phone);

  if (!isValidMobile(normalized)) {
    return { ok: false, reason: 'invalid_phone', message: MESSAGES.invalid_phone };
  }

  const { response, payload } = await postJson('/api/send-phone-code', {
    phone: normalized,
    purpose
  });

  if (!response) return { ok: false, reason: 'network', message: MESSAGES.network };

  if (!response.ok || !payload?.ok) {
    const reason = payload?.reason || 'unknown';
    return {
      ok: false,
      reason,
      // 한도 관련 문구는 서버가 남은 시간까지 담아 보내므로 그대로 쓴다.
      message: payload?.detail || MESSAGES[reason] || MESSAGES.unknown,
      retryAfter: payload?.retry_after
    };
  }

  return {
    ok: true,
    expiresIn: payload.expires_in,
    cooldown: payload.cooldown,
    // 운영에서 true면 문자가 실제로 안 나간 것이다(ALIGO_TEST_MODE/DRY_RUN).
    dryRun: Boolean(payload.dry_run)
  };
}

/**
 * 인증번호를 검증한다. 판정은 서버가 한다.
 * @returns {Promise<{ok: true} | {ok: false, reason: string, message: string,
 *   remainingAttempts?: number}>}
 */
export async function verifyPhoneCode(phone, code) {
  const normalized = normalizePhone(phone);
  const trimmed = String(code || '').trim();

  const { response, payload } = await postJson('/api/verify-phone-code', {
    phone: normalized,
    code: trimmed
  });

  if (!response) return { ok: false, reason: 'network', message: MESSAGES.network };

  if (!response.ok || !payload?.ok) {
    const reason = payload?.reason || 'unknown';
    const remaining = payload?.remaining_attempts;

    let message = payload?.detail || MESSAGES[reason] || MESSAGES.unknown;
    // 남은 기회를 알려주지 않으면 사용자가 몇 번 더 시도할 수 있는지 모른 채
    // 갑자기 차단된다.
    if (reason === 'code_mismatch' && Number.isInteger(remaining)) {
      message = `인증번호가 일치하지 않습니다. (${remaining}회 남음)`;
    }

    return { ok: false, reason, message, remainingAttempts: remaining };
  }

  return { ok: true };
}
