import type { Session, User } from "@supabase/supabase-js";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Outlet } from "react-router";
import { fetchEntitlement } from "../lib/entitlement";
import { supabase } from "../lib/supabase";

// 인앱 셸 공유 세션 컨텍스트 — 명세서 §2.3.
//
// 왜 필요한가: 수행평가 셸은 사이드바 프로필, 진입 가드, 채팅 헤더, 회차 안내
// 배너(§5.20)가 **동시에** 같은 세션·이용권 값을 필요로 한다. 각자
// `supabase.auth.getSession()`과 `/api/check-service-access`를 따로 부르면
// 같은 화면 안에서 서로 다른 잔여 회차가 보이고(호출 시점 차이), 네트워크
// 왕복도 표면 수만큼 늘어난다. 그래서 판정을 여기 한 곳에서만 하고 나머지는
// 읽기만 한다.
//
// 구독 패턴의 출처: `src/components/Header.jsx`의 세션 동기화 블록
// (초기 `getSession()` → `onAuthStateChange` 구독 → cleanup에서
// `subscription.unsubscribe()`)을 그대로 컨텍스트로 승격한 것이다.
// Header는 그 결과를 컴포넌트 로컬 state에만 두고 공유하지 않는다.
//
// ⚠️ 적용 범위는 `/app/performance/*` 하위로 **한정**한다(§2.3).
//    Header.jsx / LearningDiagnosis.jsx의 기존 중복 구독을 이 컨텍스트로
//    흡수하는 것은 명세서가 "이번 범위 밖"으로 못박았다 — 전역으로 올리면
//    마케팅 페이지 전체가 회귀 시험 대상이 된다. 기존 페이지는 손대지 않는다.
//
// 라우트 배선(수행평가 페이지가 생기는 슬라이스에서):
//
//   <Route element={<SessionProvider serviceKey="suhaeng" />}>
//     <Route element={<RequireEntitlement serviceKey="suhaeng" ... />}>
//       <Route element={<PerformanceAppLayout />}>
//         <Route path="/app/performance" element={<PerformanceChatPage />} />
//         ...
//
// SessionProvider가 가드보다 **바깥**이라야 한다. 그래야 가드가 자기 판정을
// 따로 하지 않고 이 컨텍스트 값을 읽고, 셸 안쪽 표면도 같은 값을 본다
// (가드가 안쪽이면 컨텍스트가 가드 결과를 알 수 없어 조회가 2벌이 된다).

type GuardState = "loading" | "guest" | "ok" | "forbidden" | "check-failed";

interface Entitlement {
  allowed: boolean | null;
  quotaRemaining: number | null;
  quotaTotal: number | null;
  planEndsAt: string | null;
  planLabel: string | null;
}

interface SessionContextValue {
  serviceKey: string;
  guardState: GuardState;
  session: Session | null;
  user: User | null;
  userId: string | null;
  isSessionReady: boolean;
  isEntitlementReady: boolean;
  allowed: boolean | null;
  quotaRemaining: number | null;
  quotaTotal: number | null;
  planEndsAt: string | null;
  planLabel: string | null;
  refreshEntitlement: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

const EMPTY_ENTITLEMENT: Entitlement = {
  allowed: null,
  quotaRemaining: null,
  quotaTotal: null,
  planEndsAt: null,
  planLabel: null,
};

/**
 * 컨텍스트가 없으면 throw. 셸 내부 컴포넌트(사이드바·헤더·배너)용.
 */
export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) {
    throw new Error(
      "useSession()은 <SessionProvider> 안에서만 쓸 수 있습니다.",
    );
  }
  return value;
}

/**
 * 컨텍스트가 없으면 null. 프로바이더 안팎에서 모두 쓰이는 공용 컴포넌트용
 * (RequireEntitlement가 이걸 쓴다 — 목표관리는 프로바이더 없이 마운트된다).
 */
export function useSessionOptional(): SessionContextValue | null {
  return useContext(SessionContext);
}

// serviceKey: 이용권 조회 키. 수행평가는 'suhaeng'이다 — 신규 자산 네이밍은 performance지만
// 이 값은 운영 DB의 program_access.program_key / SERVICE_CONFIGS에 이미 박혀 있어 개명
// 대상이 아니다(명세서 §1.4, §9.4).
// children: 없으면 <Outlet />을 렌더한다(라우트 element로 바로 쓸 수 있게).
export function SessionProvider({
  serviceKey,
  children,
}: {
  serviceKey: string;
  children?: ReactNode;
}) {
  const [session, setSession] = useState<Session | null>(null);
  const [isSessionReady, setIsSessionReady] = useState(false);
  const [entitlement, setEntitlement] =
    useState<Entitlement>(EMPTY_ENTITLEMENT);
  const [isEntitlementReady, setIsEntitlementReady] = useState(false);
  // 재조회 트리거. 차감 후 잔여 회차 갱신·"다시 시도" 버튼이 이 값을 올린다.
  const [refreshToken, setRefreshToken] = useState(0);

  const user = session?.user || null;
  const userId = user?.id || null;

  // ── 세션 구독 (Header.jsx 패턴 승격)
  useEffect(() => {
    let alive = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setSession(data?.session || null);
      setIsSessionReady(true);
    });

    // ⚠️ 콜백 안에서 supabase 비동기 API를 부르지 않는다(supabase-js가 내부
    //    락을 잡고 있어 교착할 수 있다). 여기서는 state만 갱신하고, 이용권
    //    조회는 아래 별도 effect가 userId 변화에 반응해 수행한다.
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        if (!alive) return;
        setSession(nextSession || null);
        setIsSessionReady(true);
      },
    );

    return () => {
      alive = false;
      authListener?.subscription?.unsubscribe?.();
    };
  }, []);

  // ── 이용권·회차 조회. userId가 바뀌거나 refresh가 걸릴 때만 돈다.
  // biome-ignore lint/correctness/useExhaustiveDependencies: TODO(useEffectEvent) refreshToken은 effect 안에서 읽지 않는 재조회 트리거 전용 카운터다.
  useEffect(() => {
    let alive = true;

    if (!isSessionReady) return undefined;

    if (!userId) {
      // 비로그인은 "이용권 없음"이 아니라 "물어볼 대상이 없음"이다.
      // allowed:false로 내리면 가드가 guest 대신 forbidden으로 분기한다.
      setEntitlement(EMPTY_ENTITLEMENT);
      setIsEntitlementReady(true);
      return undefined;
    }

    setIsEntitlementReady(false);

    fetchEntitlement(serviceKey).then((result) => {
      if (!alive) return;
      setEntitlement(result);
      setIsEntitlementReady(true);
    });

    return () => {
      alive = false;
    };
  }, [serviceKey, userId, isSessionReady, refreshToken]);

  const refreshEntitlement = useCallback(() => {
    setRefreshToken((v) => v + 1);
  }, []);

  const value = useMemo(() => {
    // 가드 4상태(명세서 §2.2) + 판정 불가 1상태를 여기서 한 번만 계산한다.
    // 여러 표면이 각자 조합하면 규칙이 갈라진다.
    //
    // ⚠️ `quota_exhausted` 5번째 상태는 **만들지 않는다**(§2.2 / §11.1 Q47).
    //    회차를 다 쓴 사용자도 셸에 들어와야 한다 — 저장 리포트 열람과 이미
    //    차감된 세션 이어가기는 이미 대가를 지불한 산출물이기 때문이다.
    //    잔여 회차는 차단 사유가 아니라 아래 quota* 필드로 셸에 전달되는
    //    컨텍스트이고, 막는 것은 "새 세션 시작" 하나뿐이다.
    let guardState: GuardState;
    if (!isSessionReady || !isEntitlementReady) guardState = "loading";
    else if (!userId) guardState = "guest";
    else if (entitlement.allowed === true) guardState = "ok";
    else if (entitlement.allowed === false) guardState = "forbidden";
    // allowed === null: 서버에 물어보지 못했다. forbidden과 반드시 구분한다 —
    // 서버 장애 중인 결제 사용자를 결제 페이지로 튕기는 오탐을 막기 위해서다.
    else guardState = "check-failed";

    return {
      serviceKey,
      guardState,
      session,
      user,
      userId,
      isSessionReady,
      isEntitlementReady,
      allowed: entitlement.allowed,
      // null = 무제한(0 아님). 판정 불가·회차 미설정도 null이다.
      quotaRemaining: entitlement.quotaRemaining,
      quotaTotal: entitlement.quotaTotal,
      planEndsAt: entitlement.planEndsAt,
      planLabel: entitlement.planLabel,
      // 차감이 일어난 뒤(api/performance/* 가 quotaRemaining을 돌려준 직후)
      // 화면 값을 맞추는 수단이다. 클라이언트가 임의로 -1 하지 않는다 —
      // 서버가 권위이므로 서버에 다시 물어 덮는다.
      refreshEntitlement,
    };
  }, [
    serviceKey,
    session,
    user,
    userId,
    isSessionReady,
    isEntitlementReady,
    entitlement,
    refreshEntitlement,
  ]);

  return (
    <SessionContext.Provider value={value}>
      {children ?? <Outlet />}
    </SessionContext.Provider>
  );
}
