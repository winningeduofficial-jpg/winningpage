// Vercel Cron 호출 인증 — CRON_SECRET fail-closed 검증.
// `cleanup-attachments.js`가 정본 구현이었고 여기로 추출했다. `embed-session-vectors.js`가
// 같은 로직을 재사용한다.

import crypto from "crypto";
import { getEnv } from "./supabaseAdmin.js";

/** 길이가 달라도 예외를 던지지 않는 상수시간 비교. */
export function safeEqual(a, b) {
  const left = Buffer.from(String(a || ""), "utf8");
  const right = Buffer.from(String(b || ""), "utf8");
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

/**
 * Vercel Cron 호출인지 확인한다.
 * @returns {boolean} `CRON_SECRET` 미설정이면 무조건 false(fail-closed).
 */
export function isAuthorizedCron(req) {
  const secret = getEnv("CRON_SECRET");
  if (!secret) {
    console.error(
      "performance/cleanup-attachments: CRON_SECRET이 설정되지 않아 요청을 거부했습니다. " +
        "이 상태에서는 90일 보관 정책 cron이 전혀 실행되지 않습니다(.env.example 참고).",
    );
    return false;
  }

  const header = req.headers?.authorization || req.headers?.Authorization || "";
  return safeEqual(header, `Bearer ${secret}`);
}
