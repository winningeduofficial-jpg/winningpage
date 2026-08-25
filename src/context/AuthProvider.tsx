import type { Session, User } from "@supabase/supabase-js";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { supabase } from "@/lib/supabase";

// 전역 세션 구독 단일화 — 명세서 docs/client-auth-query-plan.md B-3.
//
// 왜 필요한가: getSession()+onAuthStateChange 구독이 Header.tsx, SessionContext.tsx
// (performance 전용), goal 쪽 getSession() 직접 호출 ~28곳으로 파편화돼 있었다.
// 이 컨텍스트가 세션 구독을 앱 전체에서 한 번만 열고, 나머지 표면은 여기 값을
// 읽기만 한다(SessionContext.tsx의 entitlement 파생과 동일한 "판정은 한 곳" 원칙).
//
// 배선 위치: main.tsx, QueryClientProvider 안쪽·RouterProvider(App) 바깥. 라우터
// 밖에 두는 이유는 routeMiddleware.ts(React 트리 밖에서 실행되는 데이터 로더)가
// 세션이 아니라 apiFetch의 getAuthHeader()(단순 getSession 1회 호출)로 인증
// 헤더를 얻기 때문에 이 컨텍스트에 의존하지 않는다 — 이 컨텍스트는 오직 렌더
// 트리 안에서 세션 상태를 읽는 표면(Header, SessionContext 등)을 위한 것이다.
interface AuthContextValue {
  session: Session | null;
  user: User | null;
  userId: string | null;
  // 초기 getSession()이 완료됐는지 여부. false인 동안은 session이 null이어도
  // "비로그인 확정"이 아니라 "아직 모름" — 소비처가 두 상태를 반드시 구분해야
  // guest 오탐(로그인 사용자가 잠깐 guest로 보이는 깜빡임)을 막는다.
  isReady: boolean;
  // 초기 getSession()이 SESSION_TIMEOUT_MS 안에 응답하지 못해 fail-open(session:null,
  // isReady:true)으로 확정됐는지. 현재 소비처는 없다 — 세션 판정 자체는 isReady/session
  // 두 값만으로 이미 충분하기 때문이다. 이 값은 "그 세션 없음 판정이 진짜 비로그인인지,
  // 아니면 네트워크 hang 때문에 추정한 것인지"를 구분해야 하는 미래 소비처(예: 재시도
  // 안내 배너)를 위한 상태 노출용이다(재검증 MEDIUM).
  didTimeout: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// 구 Header.tsx가 초기 세션 조회에 쓰던 fail-open 타임아웃은 1200ms였다(B-3
// 리팩터 전 syncSession()) — 다만 그때는 Header 하나의 렌더만 이 값에 의존하는
// "장식"에 가까웠다. 이제는 AuthProvider가 세션의 전역 유일 권위라 모든 가드
// (RequireEntitlement 등)가 이 값을 그대로 신뢰한다. 1200ms는 진짜 hang이 아니어도
// (만료 토큰 refresh, 다른 탭이 잡은 supabase-js LockManager 대기 등 정상적으로도
// 1초를 넘길 수 있는 경로) 로그인된 사용자를 guest로 오판해 /login으로 튕기는
// 회귀를 낳는다(재검증 HIGH). 그래서 8000ms로 올린다 — 목적을 "정상 지연도
// 흡수하는 임계값"이 아니라 "응답 자체가 없는 진짜 hang에서 탈출하는 안전망"으로
// 좁힌다(§apiFetch 기본 타임아웃 15000ms보다는 짧게, 체감 무한 로딩보다는 길게).
const SESSION_TIMEOUT_MS = 8000;

/** promise가 ms 안에 끝나지 않으면 fallbackValue로 대신 resolve한다. 어느 쪽이
 * 먼저 끝나든 남은 타이머는 반드시 정리한다(재검증 LOW — 이전 버전은 promise가
 * 먼저 끝나도 setTimeout 핸들을 그대로 남겨뒀다). */
async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  fallbackValue: T,
): Promise<{ value: T; timedOut: boolean }> {
  let timeoutId: number | undefined;

  const timeoutPromise = new Promise<{ value: T; timedOut: boolean }>(
    (resolve) => {
      timeoutId = window.setTimeout(
        () => resolve({ value: fallbackValue, timedOut: true }),
        ms,
      );
    },
  );

  const result = await Promise.race([
    promise.then((value) => ({ value, timedOut: false })),
    timeoutPromise,
  ]);

  if (timeoutId !== undefined) window.clearTimeout(timeoutId);
  return result;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [didTimeout, setDidTimeout] = useState(false);

  useEffect(() => {
    let alive = true;

    withTimeout(
      supabase.auth.getSession(),
      SESSION_TIMEOUT_MS,
      { data: { session: null } } as Awaited<
        ReturnType<typeof supabase.auth.getSession>
      >,
    ).then(({ value, timedOut }) => {
      if (!alive) return;
      setSession(value?.data?.session || null);
      setIsReady(true);
      if (timedOut) setDidTimeout(true);
    });

    // ⚠️ 콜백 안에서 supabase 비동기 API를 부르지 않는다 — supabase-js가 내부
    //    락을 잡고 있어 교착할 수 있다(SessionContext.tsx의 동일 주석, 기존
    //    코드베이스가 지키던 패턴). 여기서는 state만 동기 갱신한다. 로그아웃
    //    시 쿼리 캐시 정리는 src/lib/queryClient.ts가 별도로 구독해 처리한다
    //    (역할 분리 — 이 컨텍스트는 세션 상태, queryClient는 캐시 정리).
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        if (!alive) return;
        setSession(nextSession || null);
        setIsReady(true);
      },
    );

    return () => {
      alive = false;
      authListener?.subscription?.unsubscribe?.();
    };
  }, []);

  const user = session?.user || null;
  const userId = user?.id || null;

  const value = useMemo<AuthContextValue>(
    () => ({ session, user, userId, isReady, didTimeout }),
    [session, user, userId, isReady, didTimeout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * 컨텍스트가 없으면 throw. 렌더 트리 안에서 세션을 읽는 일반 소비처용.
 */
export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth()는 <AuthProvider> 안에서만 쓸 수 있습니다.");
  }
  return value;
}

/**
 * 컨텍스트가 없으면 null. Provider 안팎에서 모두 마운트될 수 있는 공용
 * 컴포넌트용.
 */
export function useAuthOptional(): AuthContextValue | null {
  return useContext(AuthContext);
}
