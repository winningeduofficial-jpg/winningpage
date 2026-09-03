// QA3 행305 후속 — 사이드바 "오늘의 공부 기록" 미기록 뱃지 실배선 검증.
//
// GoalSidebar.tsx 전체(react-router/Dialog/타이머 폴링)는 여기서 마운트하지 않는다
// (grades.test.ts와 같은 방침 — 분리 가능한 순수 함수만 로컬 검증). deriveDailyRecordDone은
// 순수 함수로 직접 단언하고, "저장 후 invalidate로 뱃지가 사라지는지"는 실제
// QueryClient + goalDailyRecordQueryOptions(캐시를 Dashboard.tsx/DailyRecord.tsx와
// 공유하는 바로 그 옵션)로 검증한다 — React 컴포넌트를 마운트하지 않고도 "invalidate가
// 실제로 재조회를 트리거하고, 그 결과로 뱃지 판정이 뒤바뀐다"는 배선을 그대로 증명한다.

import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchTodayGoalRecord } from "@/lib/goalApi";
import { goalDailyRecordQueryOptions } from "@/lib/queryClient";
import { deriveDailyRecordDone } from "./GoalSidebar";

vi.mock("@/lib/goalApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/goalApi")>();
  return { ...actual, fetchTodayGoalRecord: vi.fn() };
});

const mockedFetchTodayGoalRecord = vi.mocked(fetchTodayGoalRecord);

const NOT_DONE_RESULT = {
  kind: "success" as const,
  record: null,
  probs: { idealSusi: null, idealJungsi: null, minSusi: null, minJungsi: null },
  cooldown: null,
  summary: null,
  tomorrowTargets: { idealHours: 0, minHours: 0 },
};

const DONE_RESULT = {
  kind: "success" as const,
  record: {
    recordIndex: 3,
    recordDate: "2026-09-02",
    studyHours: 4,
    bodyCondition: "normal",
    tasks: [],
    reasons: [],
    memo: "",
  },
  probs: { idealSusi: 12, idealJungsi: null, minSusi: 18, minJungsi: null },
  cooldown: {
    active: true,
    submittedAt: "2026-09-02T09:00:00.000Z",
    unlocksAt: "2026-09-02T21:00:00.000Z",
  },
  summary: {
    studyHours: 4,
    targetIdealHours: 5,
    targetMinHours: 3,
    idealRate: 80,
    minRate: 100,
    deltaIdealSusi: 0.5,
    deltaMinSusi: 0.4,
    deltaIdealJungsi: null,
    deltaMinJungsi: null,
  },
  tomorrowTargets: { idealHours: 5, minHours: 3 },
};

describe("deriveDailyRecordDone", () => {
  it("record가 없고 cooldown도 없으면(한 번도 제출한 적 없음) false", () => {
    expect(deriveDailyRecordDone(NOT_DONE_RESULT)).toBe(false);
  });

  it("recordIndex가 있으면(실제 오늘 행 존재) true", () => {
    expect(deriveDailyRecordDone(DONE_RESULT)).toBe(true);
  });

  it("recordIndex는 null이어도 cooldown.active면 true(자정 통과 후 어제 밤 제출 잠금)", () => {
    expect(
      deriveDailyRecordDone({
        ...DONE_RESULT,
        record: null,
      }),
    ).toBe(true);
  });

  it("recordIndex가 null이면(타이머 시간만으로 합성된 프리필) 기록으로 치지 않는다", () => {
    expect(
      deriveDailyRecordDone({
        ...NOT_DONE_RESULT,
        record: { ...DONE_RESULT.record, recordIndex: null },
      }),
    ).toBe(false);
  });

  it("kind가 success가 아니면(로딩 중·미결제·미온보딩 등) false", () => {
    expect(deriveDailyRecordDone({ kind: "no-session" })).toBe(false);
    expect(deriveDailyRecordDone(undefined)).toBe(false);
  });
});

describe("사이드바 뱃지 캐시 무효화 — 기록 저장 후 사라짐", () => {
  const userId = "user-1";
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    mockedFetchTodayGoalRecord.mockReset();
  });

  it("저장 전엔 미기록 뱃지 대상(false), invalidateQueries 후 재조회되면 뱃지가 사라진다(true)", async () => {
    const options = goalDailyRecordQueryOptions(userId);

    mockedFetchTodayGoalRecord.mockResolvedValueOnce(NOT_DONE_RESULT);
    await queryClient.fetchQuery(options);
    expect(
      deriveDailyRecordDone(queryClient.getQueryData(options.queryKey)),
    ).toBe(false);

    // DailyRecord.tsx/TodayGoalCard.tsx가 저장 성공 시 부르는 것과 같은 호출.
    // refetchType:'all' — 이 테스트는 GoalSidebar를 마운트하지 않아 활성
    // observer가 없다(fetchQuery는 구독을 만들지 않는다). 실제 화면에서는
    // GoalSidebar가 항상 useQuery로 이 캐시를 구독 중이라 기본값(active)만으로도
    // 자동 재조회된다 — 여기서는 그 자동 재조회 결과를 결정적으로 재현하기 위한
    // 테스트 전용 옵션이다.
    mockedFetchTodayGoalRecord.mockResolvedValueOnce(DONE_RESULT);
    await queryClient.invalidateQueries({
      queryKey: options.queryKey,
      refetchType: "all",
    });

    expect(
      deriveDailyRecordDone(queryClient.getQueryData(options.queryKey)),
    ).toBe(true);
    expect(mockedFetchTodayGoalRecord).toHaveBeenCalledTimes(2);
  });
});
