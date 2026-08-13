// =====================================================================
// src/lib/goal/calc/bonusV2.js 회귀 테스트 — 일별 기록 수식 v2.
//
// bonus.js(v1)와 달리 이 수식은 외부 원본 앱에 대응 코드가 없다(팀장 작업
// 지시 "수식 v2" 절, 2026-08-13 확정 — bonusV2.js 헤더 참고). 그래서 여기 기대값은
// 원본에서 뽑은 골든 픽스처가 아니라 확정된 수식(delta = rate × 달성률배수 ×
// 컨디션배수 × 과목태그배수)을 손으로 계산해 검증하는 명세 테스트다.
//
// 실행: node --test scripts/test-bonus-v2.mjs
//   ⚠ 디렉터리 인자(node --test scripts/)는 Node 24 에서 파일을 탐색하지 않고
//   디렉터리를 단일 모듈로 오해해 0건 통과(가짜 green)로 떨어진다(src/lib/goal/
//   calc/의 test:calc 스크립트 주석과 동일 함정) — 반드시 파일 경로를 직접 지정한다.
//   package.json 의 test:bonus-v2 스크립트가 이미 이 형태로 고정돼 있다.
// =====================================================================

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  CONDITION_MULTIPLIER,
  calculateDailyBonusV2,
} from "../src/lib/goal/calc/bonusV2.js";
import { getAchievementRateMultiplier } from "../src/lib/goal/calc/bonus.js";

// 부동소수 오차 허용 비교. round4 결과는 소수 4자리 이내라 1e-9 여유면 충분하다.
function assertClose(actual, expected, label) {
  assert.ok(
    Math.abs(actual - expected) < 1e-9,
    `${label}: 기대 ${expected}, 실제 ${actual}`,
  );
}

// 계산 편의를 위한 대표 rate 4종(이상수시, 이상정시, 최소수시, 최소정시).
const RATES = {
  idealSusiRate: 0.1,
  idealJungsiRate: 0.2,
  minSusiRate: 0.3,
  minJungsiRate: 0.4,
};

function round4(v) {
  return Math.round(v * 10000) / 10000;
}

test("컨디션 배수 상수는 확정 값 그대로다", () => {
  assert.deepEqual(CONDITION_MULTIPLIER, {
    great: 1.1,
    normal: 1.0,
    tired: 0.9,
    exhausted: 0.8,
  });
});

test("달성률 100% · normal · 태그 없음 → rate 그대로", () => {
  const r = calculateDailyBonusV2({
    ...RATES,
    condition: "normal",
    tasks: [],
    studyHours: 8,
    idealHours: 8,
    minHours: 8,
  });
  assertClose(r.idealSusiBonus, RATES.idealSusiRate, "idealSusiBonus");
  assertClose(r.idealJungsiBonus, RATES.idealJungsiRate, "idealJungsiBonus");
  assertClose(r.minSusiBonus, RATES.minSusiRate, "minSusiBonus");
  assertClose(r.minJungsiBonus, RATES.minJungsiRate, "minJungsiBonus");
});

test("달성률 170% 초과 · great · 태그 2종 모두 → 1.2 × 1.1 × 1.1 = 1.452배", () => {
  // studyHours=20, ideal/minHours=10 → 200% → getAchievementRateMultiplier 170 초과 구간(1.2).
  assert.equal(
    getAchievementRateMultiplier(200),
    1.2,
    "사전 조건: 200% 는 1.2배 구간",
  );

  const r = calculateDailyBonusV2({
    ...RATES,
    condition: "great",
    tasks: ["내신 과목", "기출/모의고사"],
    studyHours: 20,
    idealHours: 10,
    minHours: 10,
  });

  const multiplier = 1.2 * 1.1 * 1.1;
  assertClose(multiplier, 1.452, "사전 조건: 배수 자체가 1.452");

  assertClose(
    r.idealSusiBonus,
    round4(RATES.idealSusiRate * multiplier),
    "idealSusiBonus",
  );
  assertClose(
    r.idealJungsiBonus,
    round4(RATES.idealJungsiRate * multiplier),
    "idealJungsiBonus",
  );
  assertClose(
    r.minSusiBonus,
    round4(RATES.minSusiRate * multiplier),
    "minSusiBonus",
  );
  assertClose(
    r.minJungsiBonus,
    round4(RATES.minJungsiRate * multiplier),
    "minJungsiBonus",
  );
});

test("달성률 50% · exhausted → 0.5 × 0.8 배수", () => {
  const r = calculateDailyBonusV2({
    ...RATES,
    condition: "exhausted",
    tasks: [],
    studyHours: 5,
    idealHours: 10,
    minHours: 10,
  });

  const multiplier = 0.5 * 0.8;
  assertClose(
    r.idealSusiBonus,
    round4(RATES.idealSusiRate * multiplier),
    "idealSusiBonus",
  );
  assertClose(
    r.idealJungsiBonus,
    round4(RATES.idealJungsiRate * multiplier),
    "idealJungsiBonus",
  );
  assertClose(
    r.minSusiBonus,
    round4(RATES.minSusiRate * multiplier),
    "minSusiBonus",
  );
  assertClose(
    r.minJungsiBonus,
    round4(RATES.minJungsiRate * multiplier),
    "minJungsiBonus",
  );
});

test("목표 시간 0 이하 → 그 목표만 달성률 100% 간주(분모 0 회피)", () => {
  // 이상 목표만 0 — 이상 delta 는 100% 취급(정상 배수), 최소 delta 는 실제 30% 배수.
  const r = calculateDailyBonusV2({
    ...RATES,
    condition: "normal",
    tasks: [],
    studyHours: 3,
    idealHours: 0,
    minHours: 10,
  });

  assertClose(
    r.idealSusiBonus,
    RATES.idealSusiRate,
    "idealSusiBonus (100% 간주)",
  );
  assertClose(
    r.idealJungsiBonus,
    RATES.idealJungsiRate,
    "idealJungsiBonus (100% 간주)",
  );
  assertClose(
    r.minSusiBonus,
    round4(RATES.minSusiRate * 0.3),
    "minSusiBonus (30% 실배수)",
  );
  assertClose(
    r.minJungsiBonus,
    round4(RATES.minJungsiRate * 0.3),
    "minJungsiBonus (30% 실배수)",
  );
});

test("과목 태그는 수시/정시로 갈린다 — 내신 과목은 수시만, 기출/모의고사는 정시만", () => {
  const base = {
    ...RATES,
    condition: "normal",
    studyHours: 10,
    idealHours: 10,
    minHours: 10,
  };

  const plain = calculateDailyBonusV2({ ...base, tasks: [] });
  const naesin = calculateDailyBonusV2({ ...base, tasks: ["내신 과목"] });
  const mock = calculateDailyBonusV2({ ...base, tasks: ["기출/모의고사"] });

  assertClose(
    plain.idealSusiBonus,
    RATES.idealSusiRate,
    "plain idealSusiBonus",
  );
  assertClose(
    plain.idealJungsiBonus,
    RATES.idealJungsiRate,
    "plain idealJungsiBonus",
  );

  assertClose(
    naesin.idealSusiBonus,
    round4(RATES.idealSusiRate * 1.1),
    "내신 → 이상수시 1.1배",
  );
  assertClose(
    naesin.minSusiBonus,
    round4(RATES.minSusiRate * 1.1),
    "내신 → 최소수시 1.1배",
  );
  assertClose(
    naesin.idealJungsiBonus,
    RATES.idealJungsiRate,
    "내신은 정시 미영향",
  );
  assertClose(
    naesin.minJungsiBonus,
    RATES.minJungsiRate,
    "내신은 최소정시 미영향",
  );

  assertClose(
    mock.idealJungsiBonus,
    round4(RATES.idealJungsiRate * 1.1),
    "기출 → 이상정시 1.1배",
  );
  assertClose(
    mock.minJungsiBonus,
    round4(RATES.minJungsiRate * 1.1),
    "기출 → 최소정시 1.1배",
  );
  assertClose(mock.idealSusiBonus, RATES.idealSusiRate, "기출은 수시 미영향");
  assertClose(mock.minSusiBonus, RATES.minSusiRate, "기출은 최소수시 미영향");
});

test("컨디션 미지값·빈 문자열은 normal(1.0)로 취급된다(카드-only 제출 허용)", () => {
  const base = {
    ...RATES,
    tasks: [],
    studyHours: 10,
    idealHours: 10,
    minHours: 10,
  };

  const withEmpty = calculateDailyBonusV2({ ...base, condition: "" });
  const withUndefined = calculateDailyBonusV2({
    ...base,
    condition: undefined,
  });
  const withNormal = calculateDailyBonusV2({ ...base, condition: "normal" });

  assert.deepEqual(withEmpty, withNormal, "빈 문자열은 normal과 동일");
  assert.deepEqual(withUndefined, withNormal, "undefined는 normal과 동일");
});

test("round4: 결과는 소수 4자리로 반올림된다", () => {
  const r = calculateDailyBonusV2({
    idealSusiRate: 0.06667,
    idealJungsiRate: 0.06667,
    minSusiRate: 0.06667,
    minJungsiRate: 0.06667,
    condition: "great", // ×1.1
    tasks: [],
    studyHours: 10,
    idealHours: 10,
    minHours: 10,
  });

  // 0.06667 * 1.1 = 0.073337 → round4 → 0.0733
  assertClose(r.idealSusiBonus, 0.0733, "round4 반올림");
  assertClose(r.idealJungsiBonus, 0.0733, "round4 반올림");
  assertClose(r.minSusiBonus, 0.0733, "round4 반올림");
  assertClose(r.minJungsiBonus, 0.0733, "round4 반올림");

  // 소수 5자리 이상이 결과에 남지 않는지 직접 확인.
  const decimals = String(r.idealSusiBonus).split(".")[1] || "";
  assert.ok(decimals.length <= 4, `소수 자릿수 초과: ${r.idealSusiBonus}`);
});

test("0시간 감점 분기가 없다 — v1과 달리 studyHours=0도 정상 수식을 그대로 태운다", () => {
  // bonusV2.js 는 0시간 차단을 호출자(daily-record API) 책임으로 위임한다(헤더 주석).
  // 이 함수 자체는 studyHours=0 이어도 달성률 0%로 계산할 뿐 별도 감점 분기가 없다.
  const r = calculateDailyBonusV2({
    ...RATES,
    condition: "normal",
    tasks: [],
    studyHours: 0,
    idealHours: 10,
    minHours: 10,
  });
  assert.equal(
    getAchievementRateMultiplier(0),
    0,
    "사전 조건: 0% 달성률 배수는 0",
  );
  assertClose(r.idealSusiBonus, 0, "0% 달성률 → 배수 0 → delta 0");
  assertClose(r.minJungsiBonus, 0, "0% 달성률 → 배수 0 → delta 0");
});
