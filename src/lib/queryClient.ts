// TanStack Query 도입 — docs/client-auth-query-plan.md B-2.
//
// 목표관리(/app/goal/*) 진입 경로에서 같은 데이터(entitlement, goal/student)를
// 미들웨어(routeMiddleware.ts)와 화면 컴포넌트(Dashboard.tsx, RequireEntitlement.tsx,
// SessionContext.tsx)가 각자 다시 조회하던 것을 캐시 하나로 묶는다. 미들웨어는
// React 트리 밖(라우터 데이터 로딩 단계)에서 실행되므로 useQuery 훅을 쓸 수 없다 —
// 그래서 QueryClient를 컴포넌트가 아니라 모듈 top-level에 싱글턴으로 둔다
// (routeMiddlewareCache.ts의 모듈 레벨 Map과 동일한 이유).
import { QueryClient, queryOptions } from "@tanstack/react-query";
import { fetchEntitlement } from "./entitlement";
import { fetchGoalStudent } from "./goalApi";
import { supabase } from "./supabase";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
});

// 이용권 판정 — 5분 staleTime(명세 B-2 §4). 체제 안(같은 세션에서 goal 진입 →
// 대시보드 이동 → 다른 goal 하위 페이지 이동)에서는 5분 안에 재호출하지 않는다.
// 결제 완료(usePaymentConfirmation) 시점에는 invalidateQueries(['entitlement'])로
// 이 staleTime을 우회해 즉시 재조회하게 한다.
const ENTITLEMENT_STALE_MS = 5 * 60 * 1000;

export function entitlementQueryOptions(serviceKey: string) {
  return queryOptions({
    queryKey: ["entitlement", serviceKey] as const,
    queryFn: () => fetchEntitlement(serviceKey),
    staleTime: ENTITLEMENT_STALE_MS,
  });
}

// GET /api/goal/student — 라우트 진입 시 미들웨어(requireGoalOnboardingDoneMiddleware,
// goalOnboarding.ts의 isOnboardingDone 경유)와 Dashboard.tsx가 같은 응답을 공유한다.
// staleTime은 routeMiddlewareCache.ts가 쓰던 TTL(15초)과 같은 값을 그대로 가져왔다 —
// "미들웨어 판정 직후 컴포넌트가 마운트되는 그 찰나"만 재조회를 막으면 되는
// 목적이 같기 때문이다(§7 효과 확인: goal 진입 시 1회로 수렴).
//
// ⚠️ fetchEntitlement/fetchGoalStudent는 예외를 던지지 않고 실패도 discriminated
// union(kind/allowed:null)으로 돌려주는 이 저장소의 관례를 따른다(goalApi.ts 헤더
// 주석). 그래서 이 query들도 "판정 불가" 상태를 에러가 아니라 성공 데이터로
// 캐싱한다 — 즉시 재시도가 필요한 지점(GoalAccessBoundary·RequireEntitlement의
// "다시 시도" 버튼)은 캐시를 신뢰하지 않고 invalidateQueries/refetch로 staleTime을
// 우회해 강제로 새로 조회한다(각 호출부 주석 참고).
const GOAL_STUDENT_STALE_MS = 15_000;

export function goalStudentQueryOptions() {
  return queryOptions({
    queryKey: ["goal", "student"] as const,
    queryFn: () => fetchGoalStudent(),
    staleTime: GOAL_STUDENT_STALE_MS,
  });
}

// 로그아웃 시 이전 유저의 이용권·목표관리 데이터가 다음 유저 세션에 잔존하면
// 안 된다(쿼리 캐시 키에 userId가 없다 — entitlement/goal 판정은 항상 "현재
// 세션"을 전제하므로 굳이 넣지 않았다). routeMiddlewareCache.ts와 동일한 이유로
// SIGNED_OUT 시점에 전체를 비운다.
//
// ⚠️ 이 콜백 안에서는 supabase 비동기 API를 부르지 않는다(SessionContext.tsx의
// 동일 주석 참고 — supabase-js가 내부 락을 잡고 있어 교착할 수 있다). queryClient.clear()는
// 동기 호출이다.
supabase.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_OUT") {
    queryClient.clear();
  }
});
