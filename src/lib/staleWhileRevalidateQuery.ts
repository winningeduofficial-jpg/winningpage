// Stale-while-revalidate 조회 헬퍼 — routeMiddleware.ts(requireGoalAccessMiddleware)와
// goalOnboarding.ts(isOnboardingDone)가 공유한다.
//
// 문제: React Router v8 Data Mode는 middleware를 **매 소프트 내비게이션마다**
// 재실행한다(routeMiddlewareCache.ts 상단 주석). staleTime(15초, queryClient.ts)이
// 지난 뒤 이동하면 middleware가 queryClient.ensureQueryData()를 그대로 await해
// 서버리스 응답(콜드 스타트 포함)이 끝날 때까지 라우트 커밋이 막혀 목표관리 내
// 메뉴 이동이 수 초씩 멈춘 것처럼 보였다(goal-mapping.md 행296·297).
//
// 해법: 캐시에 "이전에 성공했던 값"이 하나라도 있으면(fresh/stale 무관) 그 값을
// 즉시 반환해 라우트를 통과시키고, 재검증은 fetchQuery로 백그라운드에서 진행한다.
// fetchQuery는 TanStack Query가 이미 fresh하면 네트워크를 타지 않고, stale이면
// 그제서야 재조회한다 — 즉 "같은 세션에서 연달아 이동"할 때만 체감 지연이
// 사라지고, 데이터 자체의 정확성(만료·차단 반영)은 여전히 짧은 창 안에서 유지된다.
//
// 캐시가 아예 없을 때(그 세션의 첫 조회, 혹은 TanStack Query gcTime 만료로 완전히
// 비워진 뒤)는 기존과 동일하게 ensureQueryData로 블로킹 조회한다 — 하드 로드
// 진입 시 첫 판정 동작은 이 변경으로 바뀌지 않는다.
//
// ⚠️ 재검증 실패(예: entitlementQueryOptions/goalStudentQueryOptions가 판정
// 불가를 throw)는 여기서 삼킨다. TanStack Query는 마지막 성공 data와 최신 error
// 상태를 별도로 추적하므로, 재검증이 실패해도 캐시에 남은 마지막 성공 값은
// 지워지지 않는다 — 다음 네비게이션의 getQueryData가 여전히 그 값을 본다.
// 재검증이 "허용→거부"로 뒤집히면 그 결과는 성공 데이터로 캐시에 반영되고,
// **다음** 이동부터 그 최신 판정으로 막힌다 — 지금 보고 있는 화면을 background
// revalidation 도중에 끊지 않는다(자의적 판단: 즉시 리다이렉트보다 UX 방해가
// 적고, 이미 15초 TTL 자체가 "즉시성"을 보장하는 값이 아니었으므로 기존 보안
// 성격을 크게 낮추지 않는다고 판단했다).

/** 실제 QueryClient의 getQueryData/fetchQuery/ensureQueryData와 시그니처가
 * 같은 최소 인터페이스 — 테스트에서 가짜 구현으로 대체하기 위해 분리했다. */
export type StaleWhileRevalidateClient = {
  getQueryData: <T>(queryKey: readonly unknown[]) => T | undefined;
  fetchQuery: <T>(options: { queryKey: readonly unknown[] }) => Promise<T>;
  ensureQueryData: <T>(options: { queryKey: readonly unknown[] }) => Promise<T>;
};

/** entitlementQueryOptions/goalStudentQueryOptions(queryOptions() 반환값)를
 * 그대로 받을 수 있도록 queryFn의 반환 타입에서 T를 추론한다 — options만 넘기면
 * 호출부가 제네릭을 손으로 지정하지 않아도 된다. */
export type ResolvableQueryOptions<T> = {
  queryKey: readonly unknown[];
  queryFn?: (...args: never[]) => T | Promise<T>;
};

export async function resolveStaleWhileRevalidate<T>(
  client: StaleWhileRevalidateClient,
  options: ResolvableQueryOptions<T>,
): Promise<T> {
  const cached = client.getQueryData<T>(options.queryKey);

  if (cached !== undefined) {
    // 백그라운드 재검증 — 결과를 기다리지 않고, 실패해도 호출부에 전파하지
    // 않는다(위 헤더 주석). unhandled rejection 방지를 위해 반드시 catch한다.
    void client.fetchQuery<T>(options).catch(() => {});
    return cached;
  }

  return client.ensureQueryData<T>(options);
}
