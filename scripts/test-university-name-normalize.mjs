// src/lib/goal/universityNameNormalize.js 검증 스크립트.
//
// 🔴 node --test 는 반드시 파일 경로로 실행할 것. 디렉터리 인자를 주면
//    Node 24 가 이를 index.js 로 해석해 테스트를 하나도 못 찾고도 0건
//    통과(가짜 green)로 종료 코드 0 을 낸다.
//    사용법: node --test scripts/test-university-name-normalize.mjs

import test from "node:test";
import assert from "node:assert/strict";

import { normalizeUniversityName } from "../src/lib/goal/universityNameNormalize.js";

test("…대 규칙: 대 → 대학교", () => {
  assert.equal(normalizeUniversityName("서울대"), "서울대학교");
  assert.equal(normalizeUniversityName("고려대"), "고려대학교");
  assert.equal(normalizeUniversityName("한양대"), "한양대학교");
});

test("…여대 규칙: 여대 → 여자대학교", () => {
  assert.equal(normalizeUniversityName("이화여대"), "이화여자대학교");
  assert.equal(normalizeUniversityName("숙명여대"), "숙명여자대학교");
});

test("캠퍼스 suffix 보존", () => {
  assert.equal(normalizeUniversityName("고려대(세종)"), "고려대학교(세종)");
  assert.equal(normalizeUniversityName("한양대(ERICA)"), "한양대학교(ERICA)");
});

test("예외 lookup", () => {
  assert.equal(normalizeUniversityName("한국외대"), "한국외국어대학교");
  assert.equal(normalizeUniversityName("한국외대(글로벌)"), "한국외국어대학교");
});

test("이미 전체형이면 멱등, 빈값은 빈값", () => {
  assert.equal(normalizeUniversityName("서울대학교"), "서울대학교");
  assert.equal(normalizeUniversityName(""), "");
});
