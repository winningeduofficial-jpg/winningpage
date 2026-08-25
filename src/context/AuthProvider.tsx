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
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let alive = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setSession(data?.session || null);
      setIsReady(true);
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
    () => ({ session, user, userId, isReady }),
    [session, user, userId, isReady],
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
