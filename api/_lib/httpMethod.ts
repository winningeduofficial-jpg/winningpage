// method 체크 공통화 — 불일치 시 405 + shape에 맞는 바디를 보내고 false를 반환한다.
// 호출부는 `if (!assertMethod(...)) return;` 형태로 쓴다.
//
// 메시지·코드는 라우트마다 다르다(기존 코드가 "Method not allowed" /
// "POST만 허용됩니다." / "GET 또는 POST만 허용됩니다." 등으로 갈려 있었다) —
// 여기서 하나로 통일하지 않고 호출부가 지정하게 한다. 지정하지 않으면
// 가장 흔한 문구("Method not allowed")로 fall back한다.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { type ErrorShape, sendError } from "./httpResponse.js";

export function assertMethod(
  req: VercelRequest,
  res: VercelResponse,
  methods: readonly string[],
  shape: ErrorShape,
  message = "Method not allowed",
  code?: string,
  extra?: Record<string, unknown>,
): boolean {
  if (req.method && methods.includes(req.method)) return true;
  sendError(res, shape, 405, message, code, extra);
  return false;
}
