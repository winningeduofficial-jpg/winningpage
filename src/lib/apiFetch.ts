// 클라이언트 fetch 공용 계층 — docs/client-auth-query-plan.md B-1.
//
// 이 파일 이전에는 세션 조회(getSession) → Bearer 헤더 조립 → fetch가 ~20곳에
// 인라인으로 흩어져 있었고, 그중 어디에도 타임아웃이 없었다. 네트워크가 한 번
// 멈추면 fetch가 응답도 실패도 없이 무한 대기하고, 그 위의 로딩 상태(가드
// "loading", 스켈레톤 등)도 함께 멈춰버렸다("뻑"). 여기서 타임아웃을 걸어
// 반드시 유한 시간 안에 실패로 정리되도록 한다 — 그래야 호출부가 재시도 UI로
// 넘어갈 수 있다.
//
// getAuthHeader()가 반환하는 모양(Authorization 헤더 객체 | null)과 세션 없음
// 판정(session.user + session.access_token 둘 다 있어야 유효)은 이 저장소가
// 이미 곳곳에서 쓰던 관례(예: goalApi.ts의 구 getAuthHeader)를 그대로 옮긴 것이다.

import { supabase } from "./supabase";

const DEFAULT_TIMEOUT_MS = 15000;

/** apiFetch가 타임아웃으로 요청을 중단했을 때만 던지는 에러 — 호출부가 이 타입으로
 * "재시도 가능한 실패"를 판별한다(그 외 네트워크 실패는 원래 fetch가 던지는 그대로 전파). */
export class ApiFetchTimeoutError extends Error {
  code = "TIMEOUT" as const;

  constructor(message = "요청이 시간 내에 끝나지 않았어요.") {
    super(message);
    this.name = "ApiFetchTimeoutError";
  }
}

/**
 * 현재 세션을 조회해 Authorization 헤더를 만든다.
 * 세션이 없으면 null을 반환한다 — 호출부는 이를 즉시 '세션 없음'으로 처리해야 한다.
 */
export async function getAuthHeader(): Promise<{
  Authorization: string;
} | null> {
  const { data } = await supabase.auth.getSession();
  const session = data?.session;
  if (!session?.user || !session?.access_token) return null;

  return { Authorization: `Bearer ${session.access_token}` };
}

export interface ApiFetchOptions {
  /** 기본 15000ms. AI 호출처럼 서버 처리 시간이 긴 엔드포인트는 넉넉히 늘려 넘긴다. */
  timeoutMs?: number;
  /** true면 getAuthHeader()로 조회한 Authorization 헤더를 자동으로 붙인다(세션이
   * 있을 때만 — 없으면 헤더 없이 그대로 진행하고, 세션 필요 여부 판정은 호출부 몫이다). */
  auth?: boolean;
}

/**
 * 타임아웃이 있는 fetch. AbortSignal.timeout()으로 시간 초과를 걸고, 호출부가
 * 이미 signal을 넘겼으면 AbortSignal.any()로 두 신호를 결합한다(둘 중 먼저
 * 도착하는 사유가 그대로 전파된다). 타임아웃으로 중단되면 ApiFetchTimeoutError를
 * 던진다 — 호출부의 외부 signal이 스스로 중단한 경우(AbortError)는 그대로 둔다.
 */
export async function apiFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
  opts: ApiFetchOptions = {},
): Promise<Response> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, auth = false } = opts;

  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const signal = init.signal
    ? AbortSignal.any([init.signal, timeoutSignal])
    : timeoutSignal;

  let headers = init.headers;
  if (auth) {
    const authHeader = await getAuthHeader();
    if (authHeader) {
      headers = { ...authHeader, ...(init.headers as Record<string, string>) };
    }
  }

  const requestInit: RequestInit = { ...init, signal };
  if (headers !== undefined) requestInit.headers = headers;

  try {
    return await fetch(input, requestInit);
  } catch (error) {
    // AbortSignal.timeout()이 중단시키면 DOMException("TimeoutError")를 사유로 싣는다
    // (표준 동작) — 외부에서 넘긴 signal 자체의 abort(기본 사유 "AbortError")와 구분된다.
    if (error instanceof DOMException && error.name === "TimeoutError") {
      const timeoutError = new ApiFetchTimeoutError();
      timeoutError.cause = error;
      throw timeoutError;
    }
    throw error;
  }
}
