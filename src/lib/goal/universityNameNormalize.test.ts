// universityNameNormalize.ts 검증.

import { expect, test } from "vitest";

import { normalizeUniversityName } from "./universityNameNormalize.ts";

test("…대 규칙: 대 → 대학교", () => {
  expect(normalizeUniversityName("서울대")).toBe("서울대학교");
  expect(normalizeUniversityName("고려대")).toBe("고려대학교");
  expect(normalizeUniversityName("한양대")).toBe("한양대학교");
});

test("…여대 규칙: 여대 → 여자대학교", () => {
  expect(normalizeUniversityName("이화여대")).toBe("이화여자대학교");
  expect(normalizeUniversityName("숙명여대")).toBe("숙명여자대학교");
});

test("캠퍼스 suffix 보존", () => {
  expect(normalizeUniversityName("고려대(세종)")).toBe("고려대학교(세종)");
  expect(normalizeUniversityName("한양대(ERICA)")).toBe("한양대학교(ERICA)");
});

test("예외 lookup", () => {
  expect(normalizeUniversityName("한국외대")).toBe("한국외국어대학교");
  expect(normalizeUniversityName("한국외대(글로벌)")).toBe("한국외국어대학교");
});

test("이미 전체형이면 멱등, 빈값은 빈값", () => {
  expect(normalizeUniversityName("서울대학교")).toBe("서울대학교");
  expect(normalizeUniversityName("")).toBe("");
});
