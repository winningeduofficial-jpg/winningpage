// 알리고(SMS / 카카오 알림톡) 발송 어댑터.
//
// 기본 채널은 알림톡이다
//   서비스가 쓰기로 한 채널은 알림톡이고 SMS는 그 실패 시 대체 경로다
//   (알림톡 요청에 failover='Y'를 넣어 카카오 미사용자에게는 알리고가 자동으로
//    SMS로 대체 발송한다).
//
//   다만 알리고 알림톡 API는 tpl_code(템플릿 코드)를 필수로 요구하고, 그 코드는
//   카카오 템플릿 심사가 승인돼야 발급된다. 승인 전까지만 ALIGO_CHANNEL=sms로
//   명시해 SMS로 운영하고, 승인되면 그 환경변수를 지우면 알림톡으로 돌아온다.
//
//   기본값을 sms가 아니라 alimtalk으로 둔 이유: 환경변수가 누락됐을 때 조용히
//   SMS로 새면 안 된다. 문구도 과금도 다른 채널이라 사고를 늦게 발견하게 된다.
//   설정이 없으면 여기서 명확한 에러로 멈추는 편이 낫다.
//
// 발신 IP
//   알리고는 발신 IP 화이트리스트를 쓴다. 반드시 outbound.js의 고정 IP 프록시를
//   경유해야 하며(api/_lib/outbound.js), 배포 환경에서 프록시가 없으면 거기서
//   먼저 에러가 난다. 개발 서버 IP는 아직 알리고에 등록돼 있지 않으므로 로컬에서
//   직접 호출하면 차단되는 게 정상이다 — 로컬 검증은 ALIGO_DRY_RUN=true로 한다.
//
// 환경변수
//   ALIGO_API_KEY        API 키
//   ALIGO_USER_ID        알리고 아이디
//   ALIGO_SENDER         발신번호 (사전 등록된 번호여야 함)
//   ALIGO_SENDER_KEY     알림톡 발신프로필 키 (alimtalk 채널에서만)
//   ALIGO_TEMPLATE_CODE  알림톡 템플릿 코드 (심사 완료 후)
//   ALIGO_CHANNEL        'sms' | 'alimtalk'   (미설정 시 alimtalk)
//   ALIGO_TEST_MODE      'true'면 알리고 테스트모드 — 과금·실발송 없음
//   ALIGO_DRY_RUN        'true'면 알리고를 아예 호출하지 않음 (로컬 로직 검증용)

import { outboundFetch } from './outbound.js';
import { getEnv } from './supabaseAdmin.js';
import { maskPhone } from './phoneCode.js';

const SMS_ENDPOINT = 'https://apis.aligo.in/send/';
const ALIMTALK_ENDPOINT = 'https://kakaoapi.aligo.in/akv10/alimtalk/send/';

export function getChannel() {
  // 미설정이면 알림톡. SMS는 'sms'라고 명시했을 때만 쓴다.
  return getEnv('ALIGO_CHANNEL').toLowerCase() === 'sms' ? 'sms' : 'alimtalk';
}

export function isDryRun() {
  return getEnv('ALIGO_DRY_RUN').toLowerCase() === 'true';
}

function isTestMode() {
  return getEnv('ALIGO_TEST_MODE').toLowerCase() === 'true';
}

/**
 * 알림톡 본문 — 등록 템플릿 UK_0886.
 *
 * 카카오가 발송 본문을 등록된 템플릿과 대조하므로 **고정 텍스트가 글자 하나까지
 * 같아야 한다**. 줄바꿈·공백·문장부호까지 포함이다. 템플릿을 수정하면 여기도
 * 함께 고쳐야 하고, 반대도 마찬가지다.
 *
 * 템플릿 원문의 변수 자리는 `#{인증번호}`이며, 알리고에는 치환이 끝난 완성
 * 문구를 보낸다(변수를 키-값으로 따로 넘기지 않는다).
 */
export function buildAlimtalkMessage(code) {
  return [
    '안녕하세요, 위닝에듀입니다.',
    '',
    '본인 확인을 위한 인증번호를 입력해주세요.',
    `인증번호: ${code}`,
    '',
    '※ 본인이 요청하지 않은 경우, 인증번호를 입력하거나 타인에게 공유하지 마세요.'
  ].join('\n');
}

// SMS 1건은 90바이트까지다(EUC-KR 기준 한글 2바이트). 넘으면 LMS로 자동 전환되는데
// 단가가 3배 이상이라 잔액이 그만큼 빨리 소진된다.
const SMS_BYTE_LIMIT = 90;

/**
 * SMS 본문 — 알림톡 템플릿과 같을 필요가 없다.
 *
 * SMS는 카카오 심사 대상이 아니라 문구 제약이 없다. 알림톡 본문을 그대로 쓰면
 * 200바이트가 넘어 LMS가 되므로, 90바이트 안에 들어가는 짧은 문구를 따로 쓴다.
 * 알림톡 실패 시 대체 발송(failover)에도 이 문구를 쓴다.
 */
export function buildSmsMessage(code) {
  return `[위닝에듀] 인증번호 ${code}`;
}

/** EUC-KR 기준 바이트 수 — 한글/전각 2바이트, 그 외 1바이트. */
export function smsByteLength(text) {
  let bytes = 0;

  for (const ch of String(text)) {
    bytes += ch.charCodeAt(0) > 0x7f ? 2 : 1;
  }

  return bytes;
}

export function isWithinSmsLimit(text) {
  return smsByteLength(text) <= SMS_BYTE_LIMIT;
}

async function postForm(url, params) {
  const body = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      body.append(key, String(value));
    }
  }

  const response = await outboundFetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded; charset=utf-8' },
    body: body.toString(),
    timeoutMs: 10_000
  });

  const text = await response.text();

  try {
    return { httpStatus: response.status, payload: JSON.parse(text) };
  } catch {
    // 알리고가 장애 시 HTML을 반환하는 경우가 있어 원문을 남긴다.
    return { httpStatus: response.status, payload: null, raw: text.slice(0, 300) };
  }
}

async function sendSms({ phone, code }) {
  const params = {
    key: getEnv('ALIGO_API_KEY'),
    user_id: getEnv('ALIGO_USER_ID'),
    sender: getEnv('ALIGO_SENDER'),
    receiver: phone,
    msg: buildSmsMessage(code),
    // 90바이트를 넘으면 알리고가 LMS로 올려 과금하므로 SMS로 명시하고 길이를 지킨다.
    msg_type: 'SMS',
    testmode_yn: isTestMode() ? 'Y' : 'N'
  };

  if (!params.key || !params.user_id || !params.sender) {
    throw new Error('ALIGO_API_KEY / ALIGO_USER_ID / ALIGO_SENDER 환경변수가 필요합니다.');
  }

  const { httpStatus, payload, raw } = await postForm(SMS_ENDPOINT, params);

  // 알리고 SMS는 result_code가 1일 때만 성공이다. 음수는 오류 코드.
  const ok = Number(payload?.result_code) === 1;

  return {
    ok,
    channel: 'sms',
    providerCode: payload?.result_code ?? httpStatus,
    providerMessage: payload?.message || raw || '',
    messageId: payload?.msg_id || null
  };
}

async function sendAlimtalk({ phone, code }) {
  const params = {
    apikey: getEnv('ALIGO_API_KEY'),
    userid: getEnv('ALIGO_USER_ID'),
    senderkey: getEnv('ALIGO_SENDER_KEY'),
    tpl_code: getEnv('ALIGO_TEMPLATE_CODE'),
    sender: getEnv('ALIGO_SENDER'),
    receiver_1: phone,
    subject_1: '인증번호',
    message_1: buildAlimtalkMessage(code),
    // 알림톡 실패(카카오 미사용자 등) 시 SMS로 자동 대체 발송한다.
    // 대체 발송은 SMS라 알림톡 본문이 아니라 짧은 SMS 문구를 쓴다(LMS 과금 회피).
    failover: 'Y',
    fsubject_1: '인증번호',
    fmessage_1: buildSmsMessage(code),
    testMode: isTestMode() ? 'Y' : 'N'
  };

  if (!params.senderkey || !params.tpl_code) {
    throw new Error(
      '알림톡 발송에 ALIGO_SENDER_KEY / ALIGO_TEMPLATE_CODE 환경변수가 필요합니다. ' +
        'ALIGO_TEMPLATE_CODE는 카카오 템플릿 심사 승인 후 발급됩니다. ' +
        '승인 전이라면 ALIGO_CHANNEL=sms를 명시해 임시로 SMS로 운영하세요.'
    );
  }

  const { httpStatus, payload, raw } = await postForm(ALIMTALK_ENDPOINT, params);

  // 알림톡은 code가 0일 때 성공이다 (SMS의 result_code와 규칙이 다르다).
  const ok = Number(payload?.code) === 0;

  return {
    ok,
    channel: 'alimtalk',
    providerCode: payload?.code ?? httpStatus,
    providerMessage: payload?.message || raw || '',
    messageId: payload?.info?.mid || null
  };
}

/**
 * 인증번호를 발송한다. 채널 선택과 dry-run 처리를 여기서 흡수한다.
 * @returns {Promise<{ok: boolean, channel: string, providerCode: any, providerMessage: string, messageId: string|null, dryRun?: boolean}>}
 */
export async function sendVerificationCode({ phone, code }) {
  if (isDryRun()) {
    // 실제 발송 없이 발송 성공으로 처리한다. 코드까지 로그로 남겨야
    // 로컬에서 검증 단계를 이어서 테스트할 수 있다.
    // 운영에서는 절대 켜지 말 것 — 인증번호가 로그에 남는다.
    console.warn(`[aligo] DRY_RUN — 실제 발송 없음. ${maskPhone(phone)} code=${code}`);

    return {
      ok: true,
      channel: `${getChannel()}(dry-run)`,
      providerCode: 'dry_run',
      providerMessage: 'dry run',
      messageId: null,
      dryRun: true
    };
  }

  return getChannel() === 'alimtalk' ? sendAlimtalk({ phone, code }) : sendSms({ phone, code });
}
