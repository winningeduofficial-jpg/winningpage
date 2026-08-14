// NICE 「통합인증」 표준창 연동.
//
// ⚠️ 상품을 헷갈리지 말 것
//   NICE에는 이름이 비슷한 본인확인 상품이 여러 개 있고 API가 서로 완전히 다르다.
//   우리 계약은 **통합인증**이고 호스트는 auth.niceid.co.kr 이다.
//   구 「아이디 본인확인」(svc.niceapi.co.kr:22001)으로 보내면 자격증명이 맞아도
//   `GW_RSLT_CD 1702 "Access is not allowed - Client ID + Client IP"`가 돌아온다.
//   이 메시지는 IP 문제처럼 보이지만 실제로는 "그 게이트웨이에 없는 client_id"라는
//   뜻이다 — 아무 가짜 client_id를 넣어도 같은 응답이 나온다. 2026-08-06에
//   이것 때문에 이틀을 IP 화이트리스트로 오진했다.
//
// 흐름 (개발가이드: https://auth-guide.niceid.co.kr/)
//   1) POST /auth/token   → access_token, ticket, iterators
//   2) POST /auth/url     → auth_url, transaction_id
//   3) auth_url을 그대로 window.open — 파라미터를 따로 싣지 않는다
//   4) 인증 완료 시 return_url로 web_transaction_id 도착
//   5) POST /auth/result  → enc_data, integrity_value
//   6) PBKDF2로 키를 유도해 AES-256-GCM 복호화
//
//   6)의 키는 **1)의 ticket·iterators와 2)의 transaction_id**로 유도한다. 셋 다
//   콜백 시점까지 남아 있어야 복호화가 되므로 identity_verifications 행에 함께
//   담아둔다. access_token을 캐시해도 ticket은 트랜잭션별로 묶어 보관해야 한다.
//
// 발신 IP
//   NICE도 IP 화이트리스트를 쓴다. 배포 경로와 동일하게 두려고 outbound.js를
//   경유한다(로컬은 프록시 없이 직접 나간다).

import crypto from "node:crypto";
import { outboundFetch } from "./outbound.js";
import { getEnv } from "./supabaseAdmin.js";

// ── 엔드포인트 ───────────────────────────────────────────────────────
const API_BASE = getEnv("NICE_API_BASE") || "https://auth.niceid.co.kr";
const TOKEN_PATH = "/ido/intc/v1.0/auth/token";
const AUTH_URL_PATH = "/ido/intc/v1.0/auth/url";
const AUTH_RESULT_PATH = "/ido/intc/v1.0/auth/result";

// 가이드가 요구하는 필수 헤더. 값 자체는 통계용이라 형식만 맞으면 된다.
const DEV_LANG = "Linux/Node.js";

// 성공 코드. NICE는 HTTP는 200으로 주고 result_code로 성패를 가른다.
const OK = "0000";
// ────────────────────────────────────────────────────────────────────

/** transaction_id 유효기간(가이드 명시 10분). 표준창을 열어두고 방치하면 만료된다. */
export const REQUEST_TTL_SECONDS = 600;

/** 인증수단 코드. 우리 계약은 휴대폰(M)이다. */
export const SVC_TYPE_MOBILE = "M";

export function getConfig(): {
  clientId: string;
  clientSecret: string;
  returnUrl: string;
} {
  const clientId = getEnv("NICE_CLIENT_ID");
  const clientSecret = getEnv("NICE_CLIENT_SECRET");
  const returnUrl = getEnv("NICE_RETURN_URL");

  if (!clientId || !clientSecret || !returnUrl) {
    throw new Error(
      "NICE_CLIENT_ID / NICE_CLIENT_SECRET / NICE_RETURN_URL 환경변수가 필요합니다.",
    );
  }

  return { clientId, clientSecret, returnUrl };
}

/**
 * 요청 고유번호. 가이드 규격은 20~50자다.
 *
 * 24자로 만든다 — 하한 20자에 너무 붙여두면 접두어를 바꿀 때 규격을 넘길 위험이 있다.
 */
export function generateRequestNo(): string {
  return `WE${crypto.randomBytes(11).toString("hex").toUpperCase()}`;
}

// ── 나이 판정 ────────────────────────────────────────────────────────

/** 'YYYYMMDD' → Date. NICE는 birthdate를 이 형식으로 준다. */
export function parseNiceBirthDate(raw: unknown): Date | null {
  const s = String(raw || "").trim();
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
export function computeKoreanAge(
  birthDate: Date | null,
  at: Date = new Date(),
): number | null {
  if (!birthDate) return null;

  const today = new Date(
    Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()),
  );
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
export function isUnder14(
  birthDate: Date | null,
  at: Date = new Date(),
): boolean | null {
  const age = computeKoreanAge(birthDate, at);
  return age === null ? null : age < 14;
}

// ── 암호 계층 ────────────────────────────────────────────────────────

/**
 * 복호화 키를 유도한다.
 *
 * PBKDF2-HMAC-SHA256으로 512bit를 뽑은 뒤 **base64url 문자열로 바꾸고**,
 * 그 문자열을 잘라서 키로 쓴다. 바이트 배열을 자르는 게 아니다 — 자른 32자
 * 문자열의 UTF-8 바이트가 그대로 AES-256 키가 된다. 규격이 그렇게 정해져 있어서
 * 직관과 어긋나지만 바꾸면 복호화가 깨진다.
 *
 * 자르는 위치도 규격이다: 대칭키 [0,32), HMAC키 [48,80).
 */
export function deriveKeys({
  ticket,
  transactionId,
  iterators,
}: {
  ticket: unknown;
  transactionId: unknown;
  iterators: unknown;
}): { key: string; hmacKey: string } {
  const iterations = Number(iterators);

  if (
    !ticket ||
    !transactionId ||
    !Number.isInteger(iterations) ||
    iterations <= 0
  ) {
    throw new Error(
      "deriveKeys에는 ticket / transactionId / iterators가 모두 필요합니다.",
    );
  }

  const derived = crypto.pbkdf2Sync(
    String(ticket),
    Buffer.from(String(transactionId), "utf8"),
    iterations,
    64, // 512bit
    "sha256",
  );

  const keyString = derived.toString("base64url");

  return {
    key: keyString.slice(0, 32),
    hmacKey: keyString.slice(48, 80),
  };
}

/**
 * enc_data 복호화. AES-256-GCM이고 **앞 16바이트가 IV**, 끝 16바이트가 인증 태그다.
 *
 * GCM의 표준 IV는 12바이트지만 NICE 규격은 16바이트를 쓴다. Node는 GCM에서
 * 임의 길이 IV를 허용하므로 그대로 넘기면 된다.
 */
// NICE 표준창 복호화 결과는 개인정보 스키마가 요청 항목(svc_types)에 따라
// 달라지는 벤더 페이로드라 any로 둔다.
export function decryptPayload(encData: string, key: string): any {
  const raw = Buffer.from(String(encData), "base64url");

  const IV_LENGTH = 16;
  const TAG_LENGTH = 16;

  if (raw.length <= IV_LENGTH + TAG_LENGTH) {
    throw new Error(`enc_data가 너무 짧습니다 (${raw.length}바이트).`);
  }

  const iv = raw.subarray(0, IV_LENGTH);
  const tag = raw.subarray(raw.length - TAG_LENGTH);
  const ciphertext = raw.subarray(IV_LENGTH, raw.length - TAG_LENGTH);

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    Buffer.from(key, "utf8"),
    iv,
    {
      authTagLength: TAG_LENGTH,
    },
  );
  decipher.setAuthTag(tag);

  const plain = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");

  return JSON.parse(plain);
}

/** 무결성 검증값. enc_data **문자열 그대로**를 HMAC-SHA256 한 뒤 base64url(패딩 없음). */
export function makeIntegrityValue(encData: string, hmacKey: string): string {
  return crypto
    .createHmac("sha256", Buffer.from(hmacKey, "utf8"))
    .update(String(encData), "utf8")
    .digest("base64url");
}

/** 위변조 확인. 길이가 달라도 예외 없이 false를 돌려준다. */
export function verifyIntegrity(
  encData: string,
  hmacKey: string,
  received: unknown,
): boolean {
  const expected = makeIntegrityValue(encData, hmacKey);
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(String(received || ""), "utf8");

  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// ── NICE API 호출 ────────────────────────────────────────────────────

// NICE 벤더 응답이 요청 경로마다 필드가 달라(token/url/result) 공용 반환
// 타입을 두지 않고 any로 둔다. 호출부가 필요한 필드를 직접 구조분해한다.
type NiceApiError = Error & { niceResultCode?: string };

async function postJson(
  path: string,
  { authorization, body }: { authorization: string; body: unknown },
): Promise<any> {
  const response = await outboundFetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: authorization,
      "Content-Type": "application/json",
      "X-Intc-DevLang": DEV_LANG,
    },
    body: JSON.stringify(body),
    timeoutMs: 10_000,
  });

  const text = await response.text();
  // 벤더 JSON 응답이라 파싱 결과 형태를 미리 알 수 없다(postJson 반환 타입과 동일 이유).
  let payload: any;

  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(
      `NICE 응답을 해석할 수 없습니다 (${path}, HTTP ${response.status}): ${text.slice(0, 200)}`,
    );
  }

  if (payload?.result_code !== OK) {
    // result_code를 error에 달아둔다. 호출부가 "NICE가 거절한 것"과 "NICE에
    // 닿지 못한 것"을 구분해야 사용자에게 맞는 안내를 할 수 있다 —
    // 전자는 재시도해도 그대로고, 후자만 "잠시 후 다시"가 맞다.
    const error: NiceApiError = new Error(
      `NICE 요청 실패 (${path}): ${payload?.result_code} ${payload?.result_message || ""}`.trim(),
    );
    error.niceResultCode = String(payload?.result_code || "");
    throw error;
  }

  return payload;
}

/**
 * expires_in 해석.
 *
 * 이 API의 expires_in은 "남은 초"가 아니라 **만료 시각(epoch ms)**로 온다
 * (예: 1786087089000). 다만 규격 변경에 대비해 작은 값이면 초 단위 유효기간으로
 * 간주한다 — 잘못 읽어 캐시를 영원히 유효하다고 판단하는 쪽이 더 위험하다.
 */
function resolveExpiry(expiresIn: unknown): number {
  const value = Number(expiresIn);
  if (!Number.isFinite(value) || value <= 0) return Date.now() + 60_000;
  return value > 1e12 ? value : Date.now() + value * 1000;
}

type NiceTokenCache = {
  accessToken: string;
  ticket: string;
  iterators: number;
  expiresAt: number;
};

// access_token은 유효기간이 길다. 서버리스 인스턴스가 살아 있는 동안 재사용한다.
// ticket·iterators도 함께 들고 있어야 한다 — 복호화 키가 여기서 나온다.
let cachedToken: NiceTokenCache | null = null;

export async function fetchAccessToken(): Promise<NiceTokenCache> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken;
  }

  const { clientId, clientSecret } = getConfig();

  // ⚠️ 표준 base64가 아니라 **base64url(패딩 없음)**이다. 규격이 그렇다.
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString(
    "base64url",
  );

  const payload = await postJson(TOKEN_PATH, {
    authorization: `Basic ${basic}`,
    body: { grant_type: "client_credentials", request_no: generateRequestNo() },
  });

  cachedToken = {
    accessToken: payload.access_token,
    ticket: payload.ticket,
    iterators: Number(payload.iterators),
    expiresAt: resolveExpiry(payload.expires_in),
  };

  return cachedToken;
}

/**
 * 표준창 URL을 발급받는다.
 *
 * 반환값의 **transactionId·ticket·iterators는 호출부가 반드시 저장해야 한다** —
 * 콜백 시점에 이 셋이 있어야 결과를 복호화할 수 있다. requestNo도 결과 조회에
 * 다시 필요하다.
 */
export type IssueAuthUrlOptions = {
  requestNo?: string;
  returnUrl?: string;
  closeUrl?: string;
  svcTypes?: string[];
  methodType?: string;
};

export type AuthUrlResult = {
  authUrl: string;
  transactionId: string;
  requestNo: string;
  ticket: string;
  iterators: number;
};

export async function issueAuthUrl({
  requestNo = generateRequestNo(),
  returnUrl,
  closeUrl,
  svcTypes = [SVC_TYPE_MOBILE],
  methodType = "GET",
}: IssueAuthUrlOptions = {}): Promise<AuthUrlResult> {
  const config = getConfig();
  const token = await fetchAccessToken();

  const payload = await postJson(AUTH_URL_PATH, {
    authorization: `Bearer ${token.accessToken}`,
    body: {
      request_no: requestNo,
      return_url: returnUrl || config.returnUrl,
      ...(closeUrl ? { close_url: closeUrl } : {}),
      svc_types: svcTypes,
      method_type: methodType,
    },
  });

  return {
    authUrl: payload.auth_url,
    transactionId: payload.transaction_id,
    requestNo: payload.request_no || requestNo,
    // 복호화용. 트랜잭션과 함께 보관할 것.
    ticket: token.ticket,
    iterators: token.iterators,
  };
}

/**
 * 인증 결과를 받아 복호화까지 마친다.
 *
 * ticket·iterators는 **표준창을 열 때 쓴 토큰의 것**을 넘겨야 한다. 그 사이
 * 토큰이 갱신됐으면 캐시의 현재 ticket으로는 복호화가 되지 않는다.
 */
export type FetchAuthResultOptions = {
  webTransactionId: string;
  transactionId: string;
  requestNo: string;
  ticket: string;
  iterators: number;
};

// 반환값은 decryptPayload()와 동일하게 벤더 복호화 페이로드라 any.
export async function fetchAuthResult({
  webTransactionId,
  transactionId,
  requestNo,
  ticket,
  iterators,
}: FetchAuthResultOptions): Promise<any> {
  const token = await fetchAccessToken();

  const payload = await postJson(AUTH_RESULT_PATH, {
    authorization: `Bearer ${token.accessToken}`,
    body: {
      web_transaction_id: webTransactionId,
      transaction_id: transactionId,
      request_no: requestNo,
    },
  });

  const { enc_data: encData, integrity_value: integrityValue } = payload;
  const { key, hmacKey } = deriveKeys({ ticket, transactionId, iterators });

  // 복호화보다 무결성 검증을 먼저 한다. 변조된 데이터를 복호화 로직에 넣지 않는다.
  if (!verifyIntegrity(encData, hmacKey, integrityValue)) {
    const error: Error & { integrityFailed?: boolean } = new Error(
      "NICE 인증 결과의 무결성 검증에 실패했습니다.",
    );
    error.integrityFailed = true;
    throw error;
  }

  return decryptPayload(encData, key);
}
