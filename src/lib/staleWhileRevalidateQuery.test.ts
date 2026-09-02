// resolveStaleWhileRevalidate의 3분기(캐시 있음/없음/재검증 실패)를 덮는다 —
// goal-mapping.md 행296·297(목표관리 메뉴 이동 지연) 대응.

import { expect, test, vi } from "vitest";
import {
  resolveStaleWhileRevalidate,
  type StaleWhileRevalidateClient,
} from "./staleWhileRevalidateQuery";

const QUERY_KEY = ["entitlement", "user-1", "goal"] as const;

function fakeClient(overrides: Partial<StaleWhileRevalidateClient> = {}) {
  return {
    getQueryData: vi.fn(),
    fetchQuery: vi.fn(),
    ensureQueryData: vi.fn(),
    ...overrides,
  } satisfies StaleWhileRevalidateClient;
}

test("캐시 있음 — 값을 즉시 반환하고 ensureQueryData는 부르지 않는다", async () => {
  const client = fakeClient({
    getQueryData: vi.fn().mockReturnValue({ allowed: true }),
    fetchQuery: vi.fn().mockResolvedValue({ allowed: true }),
  });

  const result = await resolveStaleWhileRevalidate(client, {
    queryKey: QUERY_KEY,
  });

  expect(result).toEqual({ allowed: true });
  expect(client.ensureQueryData).not.toHaveBeenCalled();
});

test("캐시 있음 — 반환은 즉시 이뤄지되 백그라운드 재검증(fetchQuery)은 여전히 호출된다", async () => {
  const client = fakeClient({
    getQueryData: vi.fn().mockReturnValue({ allowed: true }),
    fetchQuery: vi.fn().mockResolvedValue({ allowed: true }),
  });

  await resolveStaleWhileRevalidate(client, { queryKey: QUERY_KEY });

  expect(client.fetchQuery).toHaveBeenCalledWith({ queryKey: QUERY_KEY });
});

test("캐시 없음(첫 조회) — ensureQueryData로 블로킹 조회하고 fetchQuery는 부르지 않는다", async () => {
  const client = fakeClient({
    getQueryData: vi.fn().mockReturnValue(undefined),
    ensureQueryData: vi.fn().mockResolvedValue({ allowed: true }),
  });

  const result = await resolveStaleWhileRevalidate(client, {
    queryKey: QUERY_KEY,
  });

  expect(result).toEqual({ allowed: true });
  expect(client.ensureQueryData).toHaveBeenCalledWith({ queryKey: QUERY_KEY });
  expect(client.fetchQuery).not.toHaveBeenCalled();
});

test("캐시 있음 — 백그라운드 재검증이 실패해도 호출부로 전파되지 않는다(unhandled rejection 없음)", async () => {
  const client = fakeClient({
    getQueryData: vi.fn().mockReturnValue({ allowed: true }),
    fetchQuery: vi.fn().mockRejectedValue(new Error("판정 불가")),
  });

  await expect(
    resolveStaleWhileRevalidate(client, { queryKey: QUERY_KEY }),
  ).resolves.toEqual({ allowed: true });
});

test("캐시 있음 + 무효화됨(invalidateQueries 직후) — stale 값으로 통과시키지 않고 fetchQuery로 블로킹 재조회한다", async () => {
  const client = fakeClient({
    getQueryData: vi.fn().mockReturnValue({ kind: "not-onboarded" }),
    getQueryState: vi.fn().mockReturnValue({ isInvalidated: true }),
    fetchQuery: vi.fn().mockResolvedValue({ kind: "onboarded" }),
  });

  const result = await resolveStaleWhileRevalidate(client, {
    queryKey: QUERY_KEY,
  });

  expect(result).toEqual({ kind: "onboarded" });
  expect(client.fetchQuery).toHaveBeenCalledWith({ queryKey: QUERY_KEY });
  expect(client.ensureQueryData).not.toHaveBeenCalled();
});
