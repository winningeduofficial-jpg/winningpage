// Vercel 서버리스 함수: Zoom 웹훅 수신
//
// 왜 필요한가
//   화상 상담이 실제로 몇 분 진행됐는지는 브라우저가 알 수 없다. 상담 창을
//   닫는다고 회의가 끝나는 것도 아니고, 사용자가 탭을 그냥 두고 나가는 경우도
//   있다. 회의 종료 사실과 시각을 아는 주체는 Zoom뿐이라 웹훅이 유일한 통보
//   경로다.
//
// 엔드포인트 등록 절차(CRC)
//   Zoom 앱 설정에서 이 URL을 등록하고 [Validate]를 누르면 Zoom이 먼저
//   `endpoint.url_validation` 이벤트를 보낸다. **3초 안에** plainToken을
//   Secret Token으로 HMAC-SHA256(hex) 한 값과 함께 돌려줘야 등록이 완료된다.
//   그래서 이 라우트는 검증 분기를 다른 어떤 처리보다 먼저 끝낸다.
//
// 페이로드를 믿지 않는다
//   이 엔드포인트는 인증 없이 열려 있어야 한다(Zoom이 호출하므로). 누구나
//   POST할 수 있으므로 x-zm-signature 검증을 통과하지 못한 요청은 본문을
//   읽지도 않고 버린다. 서명 재료는 Secret Token이며 Verification Token(구
//   방식)이 아니다 — 둘 다 앱 설정 화면에 있어서 헷갈리기 쉽다.
//
// 필요 환경변수
//   ZOOM_WEBHOOK_SECRET_TOKEN  — Zoom App > Feature > Event Subscriptions의
//                                "Secret Token". 앱마다 다르고 재생성하면
//                                기존 값은 즉시 무효가 된다.
//
// 등록은 콘솔 작업이라 코드로 처리하지 않는다(toss-webhook.ts와 같은 방침).

import crypto from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getEnv } from "./_lib/supabaseAdmin.js";

// ⚠️ 본문 파서를 끈다. 서명은 **Zoom이 보낸 바이트 그대로**를 대상으로 계산해야
//   하는데, Vercel이 JSON으로 파싱한 뒤 JSON.stringify로 되돌리면 키 순서·공백·
//   유니코드 이스케이프가 원본과 달라질 수 있어 서명이 어긋난다. Zoom 공식 예제는
//   Express에서 JSON.stringify(req.body)를 쓰지만, 그건 그 예제 한정으로 맞아떨어질
//   뿐 규격이 보장하는 동작이 아니다. 원문을 직접 읽는 편이 확실하다.
export const config = { api: { bodyParser: false } };

const SIGNATURE_PREFIX = "v0";

// 재전송 방지. Zoom은 실패 시 재시도하므로 너무 좁게 잡으면 정상 재시도를
// 막는다. 5분이면 재시도는 통과하고 캡처된 요청의 재사용은 걸린다.
const MAX_TIMESTAMP_SKEW_MS = 5 * 60 * 1000;

/** 본문 원문을 문자열로 읽는다. bodyParser를 껐으므로 스트림을 직접 소비한다. */
async function readRawBody(req: VercelRequest): Promise<string> {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }

  return Buffer.concat(chunks).toString("utf8");
}

/** 헤더는 배열로 올 수 있다(중복 헤더). 첫 값만 쓴다. */
function headerValue(raw: string | string[] | undefined): string {
  if (Array.isArray(raw)) return String(raw[0] || "");
  return String(raw || "");
}

/** 길이가 달라도 예외 없이 false를 돌려준다. */
function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");

  if (left.length !== right.length || left.length === 0) return false;
  return crypto.timingSafeEqual(left, right);
}

/**
 * x-zm-signature 검증.
 *
 * 서명 대상은 `v0:{x-zm-request-timestamp}:{본문 원문}` 이고, Secret Token으로
 * HMAC-SHA256 한 뒤 hex로 만들어 `v0=` 를 붙인 것이 헤더 값이다.
 */
export function verifySignature({
  rawBody,
  timestamp,
  signature,
  secret,
}: {
  rawBody: string;
  timestamp: string;
  signature: string;
  secret: string;
}): boolean {
  const message = `${SIGNATURE_PREFIX}:${timestamp}:${rawBody}`;
  const digest = crypto
    .createHmac("sha256", secret)
    .update(message, "utf8")
    .digest("hex");

  return safeEqual(`${SIGNATURE_PREFIX}=${digest}`, signature);
}

/**
 * CRC 응답값. plainToken을 Secret Token으로 HMAC-SHA256 한 뒤 hex로 낸다.
 * 서명 검증과 알고리즘은 같지만 **대상이 다르다** — 이쪽은 plainToken 하나뿐이라
 * v0: 접두어도 타임스탬프도 끼지 않는다.
 */
export function buildEncryptedToken(
  plainToken: string,
  secret: string,
): string {
  return crypto
    .createHmac("sha256", secret)
    .update(plainToken, "utf8")
    .digest("hex");
}

type ZoomEnvelope = {
  event?: string;
  event_ts?: number;
  payload?: {
    plainToken?: string;
    account_id?: string;
    object?: Record<string, unknown>;
  };
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, detail: "Method not allowed" });
  }

  const secret = getEnv("ZOOM_WEBHOOK_SECRET_TOKEN");

  if (!secret) {
    // 설정 누락은 우리 잘못이라 5xx로 알린다. Zoom 콘솔에는 검증 실패로 보인다.
    console.error(
      "[zoom-webhook] ZOOM_WEBHOOK_SECRET_TOKEN 환경변수가 없습니다.",
    );
    return res.status(500).json({ ok: false, detail: "Not configured" });
  }

  const timestamp = headerValue(req.headers["x-zm-request-timestamp"]);
  const signature = headerValue(req.headers["x-zm-signature"]);

  let rawBody: string;

  try {
    rawBody = await readRawBody(req);
  } catch (error) {
    console.error("[zoom-webhook] 본문을 읽지 못했습니다:", error);
    return res.status(400).json({ ok: false, detail: "Unreadable body" });
  }

  if (!timestamp || !signature) {
    console.error(
      "[zoom-webhook] 서명 헤더 없음 —",
      JSON.stringify({
        has_timestamp: Boolean(timestamp),
        has_signature: Boolean(signature),
      }),
    );
    return res.status(401).json({ ok: false, detail: "Unsigned request" });
  }

  const skew = Math.abs(Date.now() - Number(timestamp));

  if (!Number.isFinite(skew) || skew > MAX_TIMESTAMP_SKEW_MS) {
    console.error(
      "[zoom-webhook] 타임스탬프가 허용 범위를 벗어났습니다 —",
      JSON.stringify({ timestamp, skew_ms: skew }),
    );
    return res.status(401).json({ ok: false, detail: "Stale request" });
  }

  if (!verifySignature({ rawBody, timestamp, signature, secret })) {
    // 값 자체는 남기지 않는다. 등록 직후 이 로그가 보이면 원인은 대개
    // Secret Token 불일치다(Verification Token을 넣었거나, 앱을 재생성한 경우).
    console.error(
      "[zoom-webhook] 서명 불일치 —",
      JSON.stringify({ body_len: rawBody.length, timestamp }),
    );
    return res.status(401).json({ ok: false, detail: "Invalid signature" });
  }

  let body: ZoomEnvelope;

  try {
    body = JSON.parse(rawBody);
  } catch (error) {
    console.error("[zoom-webhook] JSON 파싱 실패:", error);
    return res.status(400).json({ ok: false, detail: "Invalid JSON" });
  }

  // ── 엔드포인트 검증(CRC) ────────────────────────────────────────────
  // 등록 시 한 번만 오는 게 아니라 Zoom이 주기적으로 다시 보낸다. 응답이
  // 늦거나 형식이 틀리면 이벤트 구독이 비활성화되므로 항상 처리한다.
  if (body.event === "endpoint.url_validation") {
    const plainToken = String(body.payload?.plainToken || "");

    if (!plainToken) {
      console.error("[zoom-webhook] url_validation에 plainToken이 없습니다.");
      return res.status(400).json({ ok: false, detail: "Missing plainToken" });
    }

    return res.status(200).json({
      plainToken,
      encryptedToken: buildEncryptedToken(plainToken, secret),
    });
  }

  // ── 이벤트 처리 ────────────────────────────────────────────────────
  // Zoom은 2xx가 아니면 재시도한다. 처리에 실패해도 "우리가 다시 받아서 될 일"이
  // 아니면 2xx로 닫는 편이 낫다(toss-webhook.ts와 같은 판단).
  switch (body.event) {
    case "meeting.ended": {
      const object = body.payload?.object || {};
      const startTime = String(object.start_time || "");
      const endTime = String(object.end_time || "");

      // ⚠️ object.duration은 **예정된** 회의 길이(분)다. 실제 상담 시간이 아니다.
      //   실제 경과는 start_time~end_time으로 계산한다. 예정 60분 회의를 12분만
      //   하고 끝내도 duration은 60으로 온다.
      const elapsedMs =
        startTime && endTime
          ? Date.parse(endTime) - Date.parse(startTime)
          : Number.NaN;

      console.log(
        "[zoom-webhook] meeting.ended —",
        JSON.stringify({
          meeting_uuid: object.uuid,
          meeting_id: object.id,
          host_id: object.host_id,
          start_time: startTime,
          end_time: endTime,
          scheduled_minutes: object.duration,
          elapsed_minutes: Number.isFinite(elapsedMs)
            ? Math.round(elapsedMs / 60000)
            : null,
        }),
      );

      // TODO(스키마 미정): 상담 기록 테이블에 적재한다. 어떤 상담 건과 잇는지
      //   (meeting_id로 예약을 찾을지, host별로 볼지)가 정해져야 컬럼이 나온다.
      //   적재 전까지는 로그로만 남긴다.
      return res.status(204).end();
    }

    case "meeting.participant_joined":
    case "meeting.participant_left": {
      const object = body.payload?.object || {};
      const participant =
        (object.participant as Record<string, unknown> | undefined) || {};

      // 참가자별 체류 시간이 필요하면 이 두 이벤트를 짝지어 계산해야 한다.
      // meeting.ended만으로는 "상담사가 먼저 나갔는지"를 알 수 없다.
      console.log(
        `[zoom-webhook] ${body.event} —`,
        JSON.stringify({
          meeting_uuid: object.uuid,
          participant_user_id: participant.user_id,
          participant_uuid: participant.participant_uuid,
          time: participant.join_time || participant.leave_time,
        }),
      );

      return res.status(204).end();
    }

    default: {
      // 구독만 해두고 아직 안 쓰는 이벤트. 무엇이 오는지 알아야 구독을 좁힐 수
      // 있으므로 이름만 남긴다.
      console.log(
        "[zoom-webhook] 처리하지 않는 이벤트 —",
        JSON.stringify({ event: body.event }),
      );
      return res.status(204).end();
    }
  }
}
