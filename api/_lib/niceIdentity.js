// NICE 아이디 본인확인 서비스 연동 (신규 API).
//
// 흐름
//   1) access token 발급        POST {API_BASE}/digital/niceid/oauth/oauth/token
//   2) 암호화 토큰 발급          POST {API_BASE}/digital/niceid/api/v1.0/common/crypto/token
//   3) 2)의 응답으로 AES 키·IV·HMAC 키를 유도
//   4) 요청 데이터를 암호화해 표준창(POPUP_URL)에 POST
//   5) 콜백으로 돌아온 enc_data를 같은 키로 복호화 → CI/DI/이름/생년월일/성별
//
//   3)의 키 유도는 요청마다 달라진다(req_dtim·req_no·token_val 조합). 그래서
//   2)의 응답을 콜백 시점까지 보관해야 복호화할 수 있다 —
//   identity_verifications 행에 담아둔다.
//
// ⚠️ 아래 SPEC 상수들은 NICE 개발 문서와 대조해서 확인할 것.
//    연동 문서의 버전·상품에 따라 포트/경로/헤더 이름이 달라질 수 있고,
//    하나라도 어긋나면 복호화 단계까지 가서야 실패한다.
//
// 발신 IP
//   NICE도 IP 화이트리스트를 쓴다. 다만 알리고와 달리 개발 서버 IP까지
//   등록돼 있어 로컬에서도 호출이 된다. 그래도 배포 경로와 동일하게 두려고
//   outbound.js를 경유한다(로컬은 프록시 없이 직접 나간다).

import crypto from 'crypto';
import { outboundFetch } from './outbound.js';
import { getEnv } from './supabaseAdmin.js';

// ── SPEC (문서 대조 대상) ────────────────────────────────────────────
const API_BASE = getEnv('NICE_API_BASE') || 'https://svc.niceapi.co.kr:22001';
const TOKEN_PATH = '/digital/niceid/oauth/oauth/token';
const CRYPTO_TOKEN_PATH = '/digital/niceid/api/v1.0/common/crypto/token';
// 표준창(사용자에게 보이는 인증 화면)은 토큰 API와 도메인이 다르다.
const POPUP_URL =
  getEnv('NICE_POPUP_URL') || 'https://nice.checkplus.co.kr/CheckPlusSafeModel/service.cb';
// ────────────────────────────────────────────────────────────────────

// 표준창을 열어두고 방치한 요청의 기한. 인증을 끝내지 않으면 만료된다.
export const REQUEST_TTL_SECONDS = 600;

export function getConfig() {
  const clientId = getEnv('NICE_CLIENT_ID');
  const clientSecret = getEnv('NICE_CLIENT_SECRET');
  const productId = getEnv('NICE_PRODUCT_ID');
  const returnUrl = getEnv('NICE_RETURN_URL');

  if (!clientId || !clientSecret || !productId || !returnUrl) {
    throw new Error(
      'NICE_CLIENT_ID / NICE_CLIENT_SECRET / NICE_PRODUCT_ID / NICE_RETURN_URL 환경변수가 필요합니다.'
    );
  }

  return { clientId, clientSecret, productId, returnUrl };
}

/** YYYYMMDDHHmmss (KST). NICE가 요구하는 요청 시각 형식. */
export function formatReqDtim(date = new Date()) {
  const kst = new Date(date.getTime() + 9 * 3600 * 1000);
  return kst.toISOString().replace(/[-:T]/g, '').slice(0, 14);
}

/** 요청 고유번호. 문서상 최대 30자라 넉넉히 24자로 만든다. */
export function generateReqNo() {
  return crypto.randomBytes(12).toString('hex');
}

// ── 나이 판정 ────────────────────────────────────────────────────────

/** 'YYYYMMDD' → Date. NICE는 생년월일을 이 형식으로 준다. */
export function parseNiceBirthDate(raw) {
  const s = String(raw || '').trim();
  if (!/^\d{8}$/.test(s)) return null;

  const year = Number(s.slice(0, 4));
  const month = Number(s.slice(4, 6));
  const day = Number(s.slice(6, 8));
  const date = new Date(Date.UTC(year, month - 1, day));

  // 존재하지 않는 날짜(2월 30일 등)를 걸러낸다.
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

/**
 * 만 나이. 생일이 지났는지까지 따진다.
 * 기준일을 인자로 받는 이유는 테스트에서 경계값을 고정하기 위해서다.
 */
export function computeKoreanAge(birthDate, at = new Date()) {
  if (!birthDate) return null;

  const today = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
  let age = today.getUTCFullYear() - birthDate.getUTCFullYear();

  const monthDiff = today.getUTCMonth() - birthDate.getUTCMonth();
  const dayDiff = today.getUTCDate() - birthDate.getUTCDate();

  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) age -= 1;

  return age;
}

/**
 * 만 14세 미만 여부.
 *
 * 클라이언트가 입력한 생년월일이 아니라 본인확인 결과로 판정한다. 만 14세
 * 미만이면 법정대리인 동의가 필요한데, 그 분기를 사용자가 스스로 고르게 두면
 * 아무 의미가 없기 때문이다.
 */
export function isUnder14(birthDate, at = new Date()) {
  const age = computeKoreanAge(birthDate, at);
  return age === null ? null : age < 14;
}

// ── 암호화 ───────────────────────────────────────────────────────────

/**
 * 요청별 AES 키/IV/HMAC 키를 유도한다.
 *
 * value = req_dtim + req_no + token_val 을 SHA-256 해시한 뒤 base64로 만들고,
 * 그 문자열의 앞/뒤를 잘라 쓴다. 자르는 위치가 규격이라 임의로 바꾸면 안 된다.
 */
export function deriveKeys({ reqDtim, reqNo, tokenVal }) {
  const value = `${reqDtim.trim()}${reqNo.trim()}${tokenVal.trim()}`;
  const hashed = crypto.createHash('sha256').update(value).digest('base64');

  return {
    key: hashed.slice(0, 16),
    iv: hashed.slice(-16),
    hmacKey: hashed.slice(0, 32)
  };
}

export function encryptPayload(plainObject, { key, iv }) {
  const cipher = crypto.createCipheriv('aes-128-cbc', key, iv);
  cipher.setAutoPadding(true);

  return Buffer.concat([
    cipher.update(JSON.stringify(plainObject), 'utf8'),
    cipher.final()
  ]).toString('base64');
}

export function decryptPayload(encData, { key, iv }) {
  const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
  decipher.setAutoPadding(true);

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encData, 'base64')),
    decipher.final()
  ]).toString('utf8');

  return JSON.parse(decrypted);
}

export function makeIntegrityValue(encData, hmacKey) {
  return crypto.createHmac('sha256', hmacKey).update(encData).digest('base64');
}

/** 위변조 확인. 길이가 달라도 예외 없이 false를 돌려준다. */
export function verifyIntegrity(encData, hmacKey, received) {
  const expected = makeIntegrityValue(encData, hmacKey);
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(String(received || ''), 'utf8');

  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// ── NICE API 호출 ────────────────────────────────────────────────────

// access token은 유효기간이 길다. 서버리스 인스턴스가 살아 있는 동안 재사용한다.
let cachedToken = null;

async function fetchAccessToken() {
  const { clientId, clientSecret } = getConfig();

  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const response = await outboundFetch(`${API_BASE}${TOKEN_PATH}`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials&scope=default',
    timeoutMs: 10_000
  });

  const text = await response.text();
  let payload;

  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`NICE 토큰 응답을 해석할 수 없습니다 (HTTP ${response.status}): ${text.slice(0, 200)}`);
  }

  const accessToken = payload?.dataBody?.access_token;
  const expiresIn = Number(payload?.dataBody?.expires_in) || 0;

  if (!accessToken) {
    throw new Error(`NICE access token 발급 실패: ${JSON.stringify(payload?.dataHeader || payload).slice(0, 200)}`);
  }

  cachedToken = {
    value: accessToken,
    expiresAt: Date.now() + Math.max(expiresIn, 60) * 1000
  };

  return accessToken;
}

/**
 * 암호화 토큰을 발급받는다. 응답의 token_val은 콜백 복호화에 다시 필요하므로
 * 호출부가 반드시 저장해야 한다.
 */
export async function issueCryptoToken({ reqDtim, reqNo }) {
  const { clientId, productId } = getConfig();
  const accessToken = await fetchAccessToken();

  // 문서 규격: bearer base64(access_token:현재시각(초):client_id)
  const timestamp = Math.floor(Date.now() / 1000);
  const bearer = Buffer.from(`${accessToken}:${timestamp}:${clientId}`).toString('base64');

  const response = await outboundFetch(`${API_BASE}${CRYPTO_TOKEN_PATH}`, {
    method: 'POST',
    headers: {
      Authorization: `bearer ${bearer}`,
      client_id: clientId,
      ProductID: productId,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      dataHeader: { CNTY_CD: 'ko' },
      dataBody: { req_dtim: reqDtim, req_no: reqNo, enc_mode: '1' }
    }),
    timeoutMs: 10_000
  });

  const text = await response.text();
  let payload;

  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`NICE 암호화 토큰 응답을 해석할 수 없습니다 (HTTP ${response.status}): ${text.slice(0, 200)}`);
  }

  const body = payload?.dataBody;

  if (!body?.token_val || !body?.token_version_id || !body?.site_code) {
    throw new Error(
      `NICE 암호화 토큰 발급 실패: ${JSON.stringify(payload?.dataHeader || payload).slice(0, 300)}`
    );
  }

  return {
    tokenVal: body.token_val,
    tokenVersionId: body.token_version_id,
    siteCode: body.site_code,
    period: body.period
  };
}

export function getPopupUrl() {
  return POPUP_URL;
}
