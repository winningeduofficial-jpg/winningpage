// 핸들러 공통 실행 골격 — method 체크 → auth 해석 → handler → 최상위 try/catch.
//
// 50개 핸들러가 각자 들고 있던 다음 4가지 중복을 흡수한다:
//   1. `if (req.method !== 'X') return res.status(405)...`
//   2. Bearer 토큰 → 유저/관리자 판정 인라인 복붙
//   3. try/catch로 감싼 뒤 실패 시 500 + 라우트별 에러 바디
//   4. 위 세 가지를 매번 같은 순서로 손으로 나열
//
// auth 등급 하향 금지: 기존 인증 패턴과 여기 `auth:` 값이 반드시 1:1이어야
// 한다(api/docs/refactor-plan.md의 대조표 참고). 등급을 낮추면 무인가 접근이
// 뚫린다.
import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { resolveAdmin, resolveWinningAdmin } from "./adminAuth.js";
import { resolveUser } from "./httpAuth.js";
import { isAuthorizedCron } from "./cronAuth.js";
import { createSupabaseAdmin } from "./supabaseAdmin.js";
import { sendError, type ErrorShape } from "./httpResponse.js";
import { assertMethod } from "./httpMethod.js";

export type AuthMode = "none" | "user" | "admin" | "winningAdmin" | "cron";

export interface HandlerCtx {
  userId?: string;
  user?: User;
  token?: string;
  admin?: { userId: string };
  supabaseAdmin: SupabaseClient;
}

// 코드베이스 전역에서 이미 통일돼 있던 문구(변경 없이 그대로 채택) —
// api/performance/*.ts, api/check-service-access.ts, api/diagnosis/*.ts 등
// auth:user 401 전부가 이 문구/코드를 쓴다.
const AUTH_REQUIRED_MESSAGE = "로그인이 필요합니다.";
const AUTH_REQUIRED_CODE = "UNAUTHENTICATED";

// api/performance/cleanup-attachments.ts, embed-session-vectors.ts 기준.
const CRON_REQUIRED_MESSAGE = "인증이 필요합니다.";
const CRON_REQUIRED_CODE = "UNAUTHORIZED";

export interface DefineHandlerOptions {
  methods: readonly ("GET" | "POST" | "PUT" | "PATCH" | "DELETE")[];
  /** 명시 필수 — 기본값을 두지 않는다(등급 누락을 컴파일 타임에 강제로 드러내기 위함). */
  auth: AuthMode;
  errorShape: ErrorShape;
  /** 405 문구. 라우트마다 다르므로 기본값("Method not allowed") 외에는 지정한다. */
  methodNotAllowedMessage?: string;
  /** errorShape가 "coded"일 때만 쓰는 405 코드. */
  methodNotAllowedCode?: string;
  /** 미처리 예외(500) 응답 문구 — 라우트마다 달라 필수로 받는다. */
  unhandledMessage: string;
  /** errorShape가 "coded"일 때만 쓰는 500 코드. */
  unhandledCode?: string;
  /** console.error 라벨(응답 바디에는 영향 없음). */
  logLabel?: string;
  /**
   * method 체크 통과 직후, auth 해석보다 먼저 설정할 응답 헤더(예: Cache-Control:
   * no-store). 기존 코드 중 일부(diagnosis/consume.ts)가 이 위치에서 헤더를 걸어
   * 401/403 등 auth 실패 응답에도 헤더가 실리게 했다 — 그 순서를 그대로 재현한다.
   */
  headers?: Record<string, string>;
  handler: (
    req: VercelRequest,
    res: VercelResponse,
    ctx: HandlerCtx,
  ) => Promise<void>;
}

export function defineHandler(opts: DefineHandlerOptions) {
  return async function (
    req: VercelRequest,
    res: VercelResponse,
  ): Promise<void> {
    if (
      !assertMethod(
        req,
        res,
        opts.methods,
        opts.errorShape,
        opts.methodNotAllowedMessage,
        opts.methodNotAllowedCode,
      )
    ) {
      return;
    }

    if (opts.headers) {
      for (const [key, value] of Object.entries(opts.headers)) {
        res.setHeader(key, value);
      }
    }

    try {
      const supabaseAdmin = createSupabaseAdmin();
      const ctx: HandlerCtx = { supabaseAdmin };

      if (opts.auth === "user") {
        const authed = await resolveUser(req);
        if (!authed) {
          sendError(
            res,
            opts.errorShape,
            401,
            AUTH_REQUIRED_MESSAGE,
            AUTH_REQUIRED_CODE,
          );
          return;
        }
        ctx.userId = authed.userId;
        ctx.user = authed.user;
        ctx.token = authed.token;
      } else if (opts.auth === "admin") {
        // adminAuth.ts는 req.headers를 Record<string, string>으로 선언한다 —
        // VercelRequest.headers(IncomingHttpHeaders)와는 형태만 다를 뿐 실사용
        // (단일 문자열 헤더 읽기)은 호환된다(기존 admin-embed.ts 등과 동일 캐스트).
        const admin = await resolveAdmin(
          supabaseAdmin,
          req as unknown as { headers: Record<string, string> },
        );
        if (!admin.ok) {
          sendError(res, opts.errorShape, admin.status, admin.detail);
          return;
        }
        ctx.userId = admin.userId;
        ctx.admin = { userId: admin.userId };
      } else if (opts.auth === "winningAdmin") {
        const admin = await resolveWinningAdmin(
          supabaseAdmin,
          req as unknown as { headers: Record<string, string> },
        );
        if (!admin.ok) {
          sendError(res, opts.errorShape, admin.status, admin.detail);
          return;
        }
        ctx.userId = admin.userId;
        ctx.admin = { userId: admin.userId };
      } else if (opts.auth === "cron") {
        const authorized = isAuthorizedCron(
          req as unknown as { headers: Record<string, string | undefined> },
        );
        if (!authorized) {
          sendError(
            res,
            opts.errorShape,
            401,
            CRON_REQUIRED_MESSAGE,
            CRON_REQUIRED_CODE,
          );
          return;
        }
      }
      // auth === "none" → 통과, ctx에 유저 정보 없음

      await opts.handler(req, res, ctx);
    } catch (error) {
      console.error(`${opts.logLabel || "handler"} error:`, error);
      sendError(res, opts.errorShape, 500, opts.unhandledMessage, opts.unhandledCode);
    }
  };
}
