// 휴대폰 인증코드의 생성·해시·정규화와 발송 한도 판정.
//
// 저장은 sql/40_auth_signup.sql [6] phone_verifications (RLS 전면 거부 + 권한 회수).
// 이 파일과 라우트만 service_role로 그 테이블에 접근한다.

import crypto from "crypto";
import { getEnv } from "./supabaseAdmin.js";

export const CODE_LENGTH = 6;
export const CODE_TTL_SECONDS = 180; // 3분
export const MAX_VERIFY_ATTEMPTS = 5;

// 발송 한도 (전화번호 기준)
export const COOLDOWN_SECONDS = 60;
export const MAX_PER_HOUR = 5;
export const MAX_PER_DAY = 10;

// 발송 한도 (IP 기준) — 번호를 바꿔가며 도배하는 경우를 잡는다.
export const MAX_PER_IP_HOUR = 10;
export const MAX_PER_IP_DAY = 30;

// 전역 일일 상한. 실제 요금이 나가는 API라 마지막 방어선으로 둔다.
// 이게 없으면 위 개별 한도를 모두 지키면서도 번호·IP만 충분히 분산하면
// 하룻밤에 잔액을 다 태울 수 있다.
export function getGlobalDailyLimit() {
  const raw = Number(getEnv("PHONE_CODE_DAILY_GLOBAL_LIMIT"));
  return Number.isFinite(raw) && raw > 0 ? raw : 300;
}

/**
 * 하이픈·공백·국가번호를 제거해 숫자만 남긴다.
 * DB의 phone_verifications_phone_format 제약(^[0-9]{9,11}$)과 맞춘다.
 */
export function normalizePhone(input) {
  let digits = String(input || "").replace(/[^0-9]/g, "");

  // +82 10 1234 5678 → 01012345678
  if (digits.startsWith("82")) {
    digits = `0${digits.slice(2)}`;
  }

  return digits;
}

/** 국내 휴대폰 번호인지. 유선번호로는 문자 인증을 받을 수 없다. */
export function isValidMobile(phone) {
  return /^01[016789][0-9]{7,8}$/.test(phone);
}

/** 로그·에러 응답에 번호를 그대로 남기지 않는다. */
export function maskPhone(phone) {
  if (!phone || phone.length < 7) return "***";
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
}

export function generateCode() {
  // Math.random()이 아니라 CSPRNG. 6자리는 경우의 수가 100만뿐이라
  // 예측 가능한 난수를 쓰면 그대로 뚫린다.
  const max = 10 ** CODE_LENGTH;
  return String(crypto.randomInt(0, max)).padStart(CODE_LENGTH, "0");
}

function getSecret() {
  const secret = getEnv("PHONE_CODE_SECRET");

  if (!secret || secret.length < 32) {
    throw new Error("PHONE_CODE_SECRET 환경변수가 필요합니다 (32자 이상).");
  }

  return secret;
}

/**
 * 코드 해시. 단순 SHA-256을 쓰면 안 된다 — 6자리 숫자는 경우의 수가 100만뿐이라
 * DB만 새어도 즉시 역산된다. 서버만 가진 키로 HMAC을 걸어야 덤프만으로는
 * 복원할 수 없다. 번호를 함께 넣어 같은 코드라도 번호별로 해시가 달라지게 한다.
 */
export function hashCode(phone, code) {
  return crypto
    .createHmac("sha256", getSecret())
    .update(`${phone}:${code}`)
    .digest("hex");
}

/** 길이가 달라도 예외를 던지지 않고, 비교 시간이 내용에 따라 달라지지 않게 한다. */
export function safeCompareHash(a, b) {
  const bufA = Buffer.from(String(a || ""), "utf8");
  const bufB = Buffer.from(String(b || ""), "utf8");

  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/** 프록시를 거치므로 소켓 주소가 아니라 X-Forwarded-For의 첫 값이 실제 클라이언트다. */
export function getClientIp(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "")
    .split(",")[0]
    .trim();

  return forwarded || req.socket?.remoteAddress || null;
}

function isoAgo(seconds) {
  return new Date(Date.now() - seconds * 1000).toISOString();
}

async function countSince(supabase, column, value, seconds) {
  const query = supabase
    .from("phone_verifications")
    .select("id", { count: "exact", head: true })
    .gte("created_at", isoAgo(seconds));

  const { count, error } =
    value === null ? await query : await query.eq(column, value);

  if (error) throw error;
  return count || 0;
}

/**
 * 발송 한도를 검사한다.
 * @returns {Promise<{allowed: boolean, reason?: string, retryAfter?: number}>}
 */
export async function checkSendLimits(supabase, { phone, ip }) {
  // 1) 쿨타임 — 가장 최근 발송이 언제였는지
  const { data: latest, error: latestError } = await supabase
    .from("phone_verifications")
    .select("created_at")
    .eq("phone", phone)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestError) throw latestError;

  if (latest) {
    const elapsed = (Date.now() - new Date(latest.created_at).getTime()) / 1000;

    if (elapsed < COOLDOWN_SECONDS) {
      return {
        allowed: false,
        reason: "cooldown",
        retryAfter: Math.ceil(COOLDOWN_SECONDS - elapsed),
      };
    }
  }

  // 2) 번호 기준 시간당/일일
  if ((await countSince(supabase, "phone", phone, 3600)) >= MAX_PER_HOUR) {
    return { allowed: false, reason: "hourly_limit", retryAfter: 3600 };
  }

  if ((await countSince(supabase, "phone", phone, 86400)) >= MAX_PER_DAY) {
    return { allowed: false, reason: "daily_limit", retryAfter: 86400 };
  }

  // 3) IP 기준 — 번호를 바꿔가며 도배하는 경우
  if (ip) {
    if (
      (await countSince(supabase, "request_ip", ip, 3600)) >= MAX_PER_IP_HOUR
    ) {
      return { allowed: false, reason: "ip_hourly_limit", retryAfter: 3600 };
    }

    if (
      (await countSince(supabase, "request_ip", ip, 86400)) >= MAX_PER_IP_DAY
    ) {
      return { allowed: false, reason: "ip_daily_limit", retryAfter: 86400 };
    }
  }

  // 4) 전역 일일 상한 (요금 방어선)
  if (
    (await countSince(supabase, null, null, 86400)) >= getGlobalDailyLimit()
  ) {
    return { allowed: false, reason: "service_daily_limit", retryAfter: 86400 };
  }

  return { allowed: true };
}
