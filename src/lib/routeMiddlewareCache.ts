import { supabase } from "./supabase";

// React Router v8 Data Mode(SPA, createBrowserRouter)에서는 middleware가
// 서브트리 진입 시 1회가 아니라 매 네비게이션마다 재실행된다(framework mode와의
// 차이). routeMiddleware.ts의 판정 3종(admin role, goal entitlement, goal
// onboarding)은 DB/서버 조회를 수반해서, 같은 세션 안에서 admin 46섹션·goal
// 11페이지 내부를 연달아 이동할 때마다 동일 조회가 반복된다. 이를 줄이려고
// 짧은 TTL 인메모리 캐시를 둔다(공식 문서 reactrouter.com/how-to/middleware
// 권장 패턴 — 자동 캐싱은 없고 "context key로 캐시 확인 → 없으면 next() 후
// 캐싱"을 직접 구현하는 방식).
//
// TTL 15초: 세션·역할·이용권·온보딩 상태는 자주 안 바뀌지만, 로그아웃/권한
// 변경이 화면에 늦게 반영되면 보안 문제로 이어진다. "같은 세션에서 섹션을
// 연타 이동할 때만 재조회를 스킵"하는 정도로 짧게 잡았다 — 관리자가 즉석에서
// 권한을 뺏거나 이용권을 취소해도 15초 안에는 이전 판정이 남을 수 있다는
// 뜻이지만, 그 창을 인증 상태 변경 감지(아래 구독)로 대부분 메꾼다.
const TTL_MS = 15_000;

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const cache = new Map<string, CacheEntry<unknown>>();

function cacheKey(userId: string, kind: string) {
  return `${userId}:${kind}`;
}

export function getCached<T>(userId: string, kind: string): T | undefined {
  const entry = cache.get(cacheKey(userId, kind));

  if (!entry) return undefined;

  if (entry.expiresAt < Date.now()) {
    cache.delete(cacheKey(userId, kind));
    return undefined;
  }

  return entry.value as T;
}

// error나 null(판정 불가) 결과는 이 함수를 호출하는 쪽에서 애초에 걸러야 한다
// — 일시적 네트워크 실패가 캐시에 눌러앉아 계속 실패로 보이면 안 된다.
export function setCached<T>(userId: string, kind: string, value: T): void {
  cache.set(cacheKey(userId, kind), { value, expiresAt: Date.now() + TTL_MS });
}

export function clearRouteMiddlewareCache(): void {
  cache.clear();
}

// 로그아웃/유저 전환 시 이전 유저의 판정이 다음 유저에게 잘못 반환되면 심각한
// 보안 버그다. 캐시 키에 이미 userId가 들어가서 "다른 유저로 로그인"만으로는
// 충돌하지 않지만, SIGNED_OUT 시점에 명시적으로 전체를 비워 메모리에 남은
// 이전 판정을 즉시 제거한다.
//
// ⚠️ 이 콜백 안에서는 supabase 비동기 API를 부르지 않는다(SessionContext.tsx의
// 동일 주석 참고 — supabase-js가 내부 락을 잡고 있어 교착할 수 있다). 여기서는
// 동기 Map.clear()만 수행한다.
supabase.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_OUT") {
    clearRouteMiddlewareCache();
  }
});
