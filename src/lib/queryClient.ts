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

/** entitlement queryFn이 판정 불가(allowed===null) 상태를 캐싱하지 않도록 던지는
 * 전용 에러 — 리뷰 CRITICAL/H2 대응. 성공 데이터로 캐싱되면 서버 장애 중인
 * 결제 사용자가 최대 staleTime만큼 "판정 불가"를 그대로 재사용받을 위험이 있다. */
export class EntitlementCheckFailedError extends Error {
  constructor() {
    super("entitlement-check-failed");
    this.name = "EntitlementCheckFailedError";
  }
}

/** goalStudent queryFn이 kind:'error'(판정 불가) 상태를 캐싱하지 않도록 던지는
 * 전용 에러 — EntitlementCheckFailedError와 동일한 이유. kind:'no-session'/
 * 'not-allowed'는 정상 판정이라 여기 해당하지 않는다(그대로 캐싱). */
export class GoalStudentCheckFailedError extends Error {
  constructor() {
    super("goal-student-check-failed");
    this.name = "GoalStudentCheckFailedError";
  }
}

// 이용권 판정 — staleTime 15초. 예전엔 5분이었으나, dev의 routeMiddlewareCache TTL과
// 맞추기 위해 15초로 낮췄다(리뷰 H3) — 5분이면 학부모 대리결제·어드민 수동 부여
// 시점부터 최대 5분간 화면이 옛 판정을 들고 있을 수 있어 dev 대비 회귀였다.
// 결제 완료(usePaymentConfirmation) 시점에는 invalidateQueries(['entitlement'])로
// 이 staleTime을 우회해 즉시 재조회하게 한다(본인 탭 즉시 반영, 그 외 시나리오는
// 15초 창을 그대로 둔다 — dev와 동등 수준).
const ENTITLEMENT_STALE_MS = 15_000;

// queryKey에 userId를 반드시 포함한다(리뷰 CRITICAL C1) — 계정 A로 조회해 캐싱된
// entitlement가, 로그아웃 없이 계정 B로 전환된 세션에서도 같은 키('entitlement',
// serviceKey)로 재사용되면 B가 A의 이용권 판정을 그대로 받는 캐시 오염이 발생한다.
//
// enabled: !!userId를 팩토리 자체에 둔다(재검증 MEDIUM) — 이전엔 SessionContext
// 하나만 개별로 enabled를 얹었는데, 그 방식은 다음 소비처가 똑같이 얹는 것을
// 잊으면 게스트 상태에서도 useQuery가 관찰자를 만들어 조회를 시도하는 사고가
// 재발할 수 있다. 팩토리에 두면 모든 useQuery 소비처가 자동 상속한다.
// ⚠️ ensureQueryData(routeMiddleware.ts, RequireEntitlement의 standalone 경로)는
// enabled를 무시하고 항상 조회한다 — 두 호출부 모두 그 전에 이미 세션/userId
// 존재를 직접 확인한 뒤에만 이 함수를 부르므로 영향이 없다.
export function entitlementQueryOptions(
  serviceKey: string,
  userId: string | null,
) {
  return queryOptions({
    queryKey: ["entitlement", userId, serviceKey] as const,
    queryFn: async () => {
      const result = await fetchEntitlement(serviceKey);
      // allowed===null(판정 불가)은 성공 데이터로 캐싱하지 않는다 — throw해서
      // TanStack Query가 error 상태로 다루게 한다. 호출부는 ensureQueryData/
      // useQuery의 실패를 각자의 check-failed 분기로 매핑한다.
      if (result.allowed === null) {
        throw new EntitlementCheckFailedError();
      }
      return result;
    },
    staleTime: ENTITLEMENT_STALE_MS,
    enabled: !!userId,
    // 판정 불가는 재시도로 회복시키지 않는다(재검증 MEDIUM) — 전역 기본값(retry:1)을
    // 여기서 0으로 덮어 즉시 error(check-failed)로 떨어지게 한다. 자동 재시도가
    // 아니라 "다시 시도" 버튼(RequireEntitlement.retry/GoalAccessBoundary.retry)이
    // invalidateQueries로 다시 조회하는 것이 회복 경로다 — retry:1이던 시절엔
    // 15초 타임아웃 실패가 재시도 1회를 더 거쳐 최대 31초까지 사용자를 기다리게
    // 했는데, 이제 15초로 줄어든다.
    retry: 0,
  });
}

// GET /api/goal/student — 라우트 진입 시 미들웨어(requireGoalOnboardingDoneMiddleware,
// goalOnboarding.ts의 isOnboardingDone 경유)와 Dashboard.tsx가 같은 응답을 공유한다.
// staleTime은 routeMiddlewareCache.ts가 쓰던 TTL(15초)과 같은 값을 그대로 가져왔다 —
// "미들웨어 판정 직후 컴포넌트가 마운트되는 그 찰나"만 재조회를 막으면 되는
// 목적이 같기 때문이다(§7 효과 확인: goal 진입 시 1회로 수렴).
//
// ⚠️ fetchGoalStudent는 예외를 던지지 않고 실패도 discriminated union(kind)으로
// 돌려주는 이 저장소의 관례를 따른다(goalApi.ts 헤더 주석) — 다만 kind:'error'만은
// entitlement의 allowed===null과 동일한 "판정 불가"라 예외로 승격해 던진다(리뷰 H2).
// kind:'no-session'/'not-allowed'는 서버가 내린 정상 판정이므로 그대로 성공 데이터로
// 캐싱한다. "다시 시도" 버튼(GoalAccessBoundary)은 invalidateQueries로 staleTime을
// 우회해 강제로 새로 조회한다(각 호출부 주석 참고).
const GOAL_STUDENT_STALE_MS = 15_000;

// entitlement와 동일한 이유로 queryKey에 userId를 포함한다(리뷰 CRITICAL C1).
// enabled: !!userId·retry: 0도 entitlementQueryOptions와 동일한 이유(재검증
// MEDIUM 둘 다) — 위 주석 참고. ensureQueryData(routeMiddleware.ts의
// requireGoalOnboardingDoneMiddleware 경유, goalOnboarding.isOnboardingDone)도
// enabled를 무시하지만 호출부가 이미 userId 존재를 확인한 뒤에만 부른다.
export function goalStudentQueryOptions(userId: string | null) {
  return queryOptions({
    queryKey: ["goal", "student", userId] as const,
    queryFn: async () => {
      const result = await fetchGoalStudent();
      if (result.kind === "error") {
        throw new GoalStudentCheckFailedError();
      }
      return result;
    },
    staleTime: GOAL_STUDENT_STALE_MS,
    enabled: !!userId,
    retry: 0,
  });
}

// 로그아웃 시 이전 유저의 이용권·목표관리 데이터가 다음 유저 세션에 잔존하면
// 안 된다. 위에서 queryKey에 userId를 넣어 계정별로 캐시가 이미 분리되지만,
// 그것만으로는 끝나지 않는다 — SIGNED_OUT 시점에 전체를 비우는 것은 여전히
// 유효한 안전장치이고(같은 이유로 routeMiddlewareCache.ts도 그렇게 한다), 추가로
// SIGNED_IN에서도 "직전 로그인 유저와 다른 유저로 전환됐는지"를 확인해 다르면
// 한 번 더 비운다(리뷰 CRITICAL C1 추가 안전장치) — 키가 항상 정확히 갱신된
// 상태로만 소비된다는 가정이 어딘가 깨지더라도(예: 컴포넌트가 stale한 userId
// 클로저를 들고 있는 경쟁 상태) 계정 전환 시점에 한 번 더 청소해 오염을 막는다.
//
// ⚠️ 이 콜백 안에서는 supabase 비동기 API를 부르지 않는다(SessionContext.tsx의
// 동일 주석 참고 — supabase-js가 내부 락을 잡고 있어 교착할 수 있다). session
// 인자는 이벤트와 함께 동기로 전달되는 값이라 추가 조회가 필요 없다.
// queryClient.clear()는 동기 호출이다.
let lastSignedInUserId: string | null = null;

supabase.auth.onAuthStateChange((event, session) => {
  if (event === "SIGNED_OUT") {
    lastSignedInUserId = null;
    queryClient.clear();
    return;
  }

  if (event === "SIGNED_IN") {
    const nextUserId = session?.user?.id ?? null;
    if (
      nextUserId &&
      lastSignedInUserId &&
      nextUserId !== lastSignedInUserId
    ) {
      queryClient.clear();
    }
    lastSignedInUserId = nextUserId;
  }
});
