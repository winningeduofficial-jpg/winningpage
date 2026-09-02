import { describe, expect, test } from "vitest";
import {
  computeAchievementRate,
  sortShelvedBooksNewestFirst,
} from "./workbookProgress";

describe("computeAchievementRate", () => {
  test("현재/전체 페이지로 정수 백분율을 계산한다", () => {
    expect(computeAchievementRate(60, 240)).toBe(25);
    expect(computeAchievementRate(120, 240)).toBe(50);
  });

  test("전체 페이지를 넘는 현재 페이지는 100%로 클램프한다", () => {
    expect(computeAchievementRate(300, 240)).toBe(100);
  });

  test("전체 페이지가 0/null/undefined면 0%로 접는다(0으로 나누기 방지)", () => {
    expect(computeAchievementRate(10, 0)).toBe(0);
    expect(computeAchievementRate(10, null)).toBe(0);
    expect(computeAchievementRate(10, undefined)).toBe(0);
  });

  test("현재 페이지가 null/undefined면 0페이지로 취급한다", () => {
    expect(computeAchievementRate(null, 240)).toBe(0);
    expect(computeAchievementRate(undefined, 240)).toBe(0);
  });

  test("현재=전체면 정확히 100%다", () => {
    expect(computeAchievementRate(240, 240)).toBe(100);
  });

  test("한 쪽이라도 남으면 100%가 아니다 — 239/240은 반올림 없이 99%", () => {
    expect(computeAchievementRate(239, 240)).toBe(99);
    expect(computeAchievementRate(199, 200)).toBe(99);
    expect(computeAchievementRate(1, 1000)).toBe(0);
  });
});

describe("sortShelvedBooksNewestFirst", () => {
  test("shelvedAt 기준 최신이 배열 앞으로 온다", () => {
    const books = [
      { id: 1, title: "오래된 책", shelvedAt: "2026-08-01T00:00:00.000Z" },
      { id: 2, title: "최근 책", shelvedAt: "2026-09-01T00:00:00.000Z" },
      { id: 3, title: "중간 책", shelvedAt: "2026-08-20T00:00:00.000Z" },
    ];
    const sorted = sortShelvedBooksNewestFirst(books);
    expect(sorted.map((b) => b.id)).toEqual([2, 3, 1]);
  });

  test("원본 배열을 변형하지 않는다", () => {
    const books = [
      { id: 1, title: "A", shelvedAt: "2026-08-01T00:00:00.000Z" },
      { id: 2, title: "B", shelvedAt: "2026-09-01T00:00:00.000Z" },
    ];
    const original = [...books];
    sortShelvedBooksNewestFirst(books);
    expect(books).toEqual(original);
  });

  test("shelvedAt이 null인 항목은 가장 오래된 것으로 취급해 뒤로 보낸다", () => {
    const books = [
      { id: 1, title: "shelvedAt 없음", shelvedAt: null },
      { id: 2, title: "최근 책", shelvedAt: "2026-09-01T00:00:00.000Z" },
    ];
    const sorted = sortShelvedBooksNewestFirst(books);
    expect(sorted.map((b) => b.id)).toEqual([2, 1]);
  });
});
