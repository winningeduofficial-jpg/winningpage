// 공통 에러 응답 — 프론트가 실제로 파싱하는 에러 바디 4종을 프리셋으로 묶는다.
//
// 이 4종은 기존 코드에 이미 흩어져 있던 로컬 `fail()` 22곳(시그니처 5종)이
// 실제로 내던 형태를 그대로 옮긴 것이다. 새 형태를 발명하지 않는다 —
// 여기서 바이트가 하나라도 달라지면 프론트 파싱이 깨진다.
//
//   detail   → { detail }                              (대부분의 라우트)
//   okDetail → { ok: false, detail }                    (change-phone 등 계정 라우트)
//   error    → { error }                                 (create-consult-request 등)
//   coded    → { error: { code, message }, ...extra }    ("performance식", extra는
//                                                          error 안이 아니라 최상위
//                                                          형제 키로 스프레드된다 —
//                                                          api/performance/*.ts의
//                                                          로컬 fail() 실제 구현 기준)

import type { VercelResponse } from "@vercel/node";

export type ErrorShape = "detail" | "okDetail" | "error" | "coded";

export function sendError(
  res: VercelResponse,
  shape: ErrorShape,
  status: number,
  message: string,
  code?: string,
  extra?: Record<string, unknown>,
): void {
  switch (shape) {
    case "detail":
      res.status(status).json({ detail: message, ...(extra || {}) });
      return;
    case "okDetail":
      res.status(status).json({ ok: false, detail: message, ...(extra || {}) });
      return;
    case "error":
      res.status(status).json({ error: message, ...(extra || {}) });
      return;
    case "coded":
      res.status(status).json({ error: { code, message }, ...(extra || {}) });
      return;
  }
}
