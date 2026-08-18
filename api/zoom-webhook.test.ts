// Zoom 웹훅의 암호 계층만 검증한다.
//
// 핸들러 전체(스트림 읽기·응답)는 Vercel 런타임에 묶여 있어 여기서 돌리기 어렵고,
// 실제로 틀리기 쉬운 곳은 HMAC 재료 조합이다. NICE 본인확인에서 표기·재료를
// 잘못 잡아 며칠을 태운 전례가 있어서, 배포 전에 로컬에서 확인할 수 있게 해 둔다.
//
// 기대값은 Zoom 개발자 문서의 규격을 그대로 옮긴 것이다:
//   서명 대상 = `v0:{x-zm-request-timestamp}:{본문 원문}`, Secret Token으로
//   HMAC-SHA256 → hex, 헤더 값은 `v0=` 접두어가 붙는다.
//   CRC 응답 = HMAC-SHA256(plainToken, Secret Token) → hex.

import crypto from "node:crypto";
import { describe, expect, test } from "vitest";
import { buildEncryptedToken, verifySignature } from "./zoom-webhook.js";

const SECRET = "test-secret-token";
const TIMESTAMP = "1697040000000";
const RAW_BODY = '{"event":"meeting.ended","payload":{"object":{"id":"123"}}}';

function sign(rawBody: string, timestamp: string, secret: string) {
  const digest = crypto
    .createHmac("sha256", secret)
    .update(`v0:${timestamp}:${rawBody}`, "utf8")
    .digest("hex");
  return `v0=${digest}`;
}

describe("verifySignature", () => {
  test("규격대로 만든 서명을 통과시킨다", () => {
    expect(
      verifySignature({
        rawBody: RAW_BODY,
        timestamp: TIMESTAMP,
        signature: sign(RAW_BODY, TIMESTAMP, SECRET),
        secret: SECRET,
      }),
    ).toBe(true);
  });

  test("시크릿이 다르면 거부한다", () => {
    expect(
      verifySignature({
        rawBody: RAW_BODY,
        timestamp: TIMESTAMP,
        signature: sign(RAW_BODY, TIMESTAMP, "other-secret"),
        secret: SECRET,
      }),
    ).toBe(false);
  });

  test("본문이 한 글자라도 바뀌면 거부한다", () => {
    const signature = sign(RAW_BODY, TIMESTAMP, SECRET);

    expect(
      verifySignature({
        rawBody: RAW_BODY.replace('"123"', '"124"'),
        timestamp: TIMESTAMP,
        signature,
        secret: SECRET,
      }),
    ).toBe(false);
  });

  test("타임스탬프가 서명 대상에 실제로 들어간다", () => {
    // 타임스탬프를 빼먹고 조합해도 통과해 버리면 재전송 방어가 무의미해진다.
    expect(
      verifySignature({
        rawBody: RAW_BODY,
        timestamp: "1697040000001",
        signature: sign(RAW_BODY, TIMESTAMP, SECRET),
        secret: SECRET,
      }),
    ).toBe(false);
  });

  test("v0= 접두어가 없으면 거부한다", () => {
    const digest = sign(RAW_BODY, TIMESTAMP, SECRET).slice("v0=".length);

    expect(
      verifySignature({
        rawBody: RAW_BODY,
        timestamp: TIMESTAMP,
        signature: digest,
        secret: SECRET,
      }),
    ).toBe(false);
  });

  test("빈 서명은 길이 비교 전에 걸러진다(예외 없이 false)", () => {
    expect(
      verifySignature({
        rawBody: RAW_BODY,
        timestamp: TIMESTAMP,
        signature: "",
        secret: SECRET,
      }),
    ).toBe(false);
  });
});

describe("buildEncryptedToken", () => {
  test("plainToken만 해싱한다 — v0:나 타임스탬프가 끼지 않는다", () => {
    const plainToken = "qgg8vlvZRS6UYooatFL8Aw";
    const expected = crypto
      .createHmac("sha256", SECRET)
      .update(plainToken, "utf8")
      .digest("hex");

    expect(buildEncryptedToken(plainToken, SECRET)).toBe(expected);
    // 서명 쪽 조합과 섞이지 않았는지 명시적으로 못 박는다.
    expect(buildEncryptedToken(plainToken, SECRET)).not.toBe(
      sign(plainToken, TIMESTAMP, SECRET),
    );
  });

  test("hex 64자를 낸다", () => {
    expect(buildEncryptedToken("token", SECRET)).toMatch(/^[0-9a-f]{64}$/);
  });
});
