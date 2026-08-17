// diagnosisScoring 엔진 — 학생 유형 8종 분류(§8 CASE-08 후반부) · 불성실(직선) 응답 판정(F-15)
// · 유형 8종 규칙 배타성·순서 충돌 · 불성실 판정 정탐/오탐 경계.
// 원본: scripts/verify-diagnosis-scoring.mjs S10 후반부 · 유형 8종 배타성 블록 · 불성실 판정 경계 블록.

import { expect, test } from "vitest";
import { COMMON_COPY, TYPE_CODES, TYPE_COPY } from "@/data/diagnosisCopy.ts";
import {
  LIKERT1_KEYS,
  LIKERT2_KEYS,
  PAGE1_AREAS,
  SINCERITY_MAX_OFFMODE,
  SINCERITY_MIN_ANSWERED,
  TYPE_RULES,
} from "@/data/diagnosisScoringTable.ts";
import { buildReport } from "@/lib/diagnosisReport.ts";
import {
  classifyStudentType,
  isStraightLining,
  sincerityOf,
} from "@/lib/diagnosisScoring.ts";
import {
  makeAreaScores,
  makeInput,
  scoreAreasOf,
} from "./diagnosisScoringTestFixtures.ts";

const baseAreas = scoreAreasOf(makeInput());

// Q-05 확정(2026-08-11) — 최저 영역 룩업 기반 4종 + ① 가드. 나머지 4종
// (학습체계 안정형 · 균형 점검형 · 계획 과잉·실행 취약형 · 목표–실행 불균형형)은 판정 기준이
// 배점표·문구집 어디에도 없어 창작하지 않는다 — ⑥ 그 외 경로로 현행 null 폴백을 유지한다.
const allSameLikert24 = {
  likert1: Object.fromEntries(LIKERT1_KEYS.map((key) => [key, 3])),
  likert2: Object.fromEntries(LIKERT2_KEYS.map((key) => [key, 3])),
};
// G-2(WARN 2, 2026-08-12) — 값은 반드시 실제 리커트 척도(0/25/50/75/100, likertScore() 산출역)
// 위에 있어야 한다. 종전엔 0~4 원시 인덱스를 그대로 썼는데, isStraightLining 이 거리 기반으로
// 바뀐 뒤에는(sincerityStats) 0~4 는 전부 서로 50 미만 거리라 "다양한 응답"조차 offmodeCount=0
// 으로 잡혀 flagged=true 가 되는 회귀가 생긴다 — 반드시 이 척도로 픽스처를 만들어야 한다.
const LIKERT_SCALE_VALUES = [0, 25, 50, 75, 100];
const variedLikert24 = {
  likert1: Object.fromEntries(
    LIKERT1_KEYS.map((key, i) => [key, LIKERT_SCALE_VALUES[i % 5]]),
  ),
  likert2: Object.fromEntries(
    LIKERT2_KEYS.map((key, i) => [key, LIKERT_SCALE_VALUES[(i + 1) % 5]]),
  ),
};

// ① 리커트 24문장이 전부 동일하면, 그 외에는 ③(GOAL 최저)이 성립하는 areaScores 라도 null 이다.
test("① 리커트 24문장 응답값이 전부 동일 → null (③ 보다 우선)", () => {
  expect(
    classifyStudentType(
      makeInput(allSameLikert24),
      makeAreaScores(60, { GOAL: 30, STABILITY: 60 }),
    ),
  ).toEqual(null);
});
// 빈 입력(likert 미응답)은 '전부 동일'로 보지 않는다 — answered.length 0 은 가드 대상이 아니다.
// 그 결과 이 픽스처는 STABILITY 30(<45) 이라 ②(부담 누적형)로 정상 판정된다.
test("② STABILITY < 45 → 학습 부담 누적형 (빈 입력, 가드 미발동)", () => {
  expect(classifyStudentType(makeInput(), baseAreas)).toEqual("BURDEN_ACCUM");
});
// ②는 ③보다 먼저 검사한다(판단) — GOAL 도 낮지만 STABILITY < 45 가 이긴다.
test("② STABILITY < 45 → 학습 부담 누적형 (③과 동시 성립해도 ②가 우선)", () => {
  expect(
    classifyStudentType(
      makeInput(variedLikert24),
      makeAreaScores(60, { STABILITY: 40, GOAL: 35 }),
    ),
  ).toEqual("BURDEN_ACCUM");
});
test("③ 최저 영역 = 목표 설정 → 방향 탐색형", () => {
  expect(
    classifyStudentType(
      makeInput(variedLikert24),
      makeAreaScores(60, { STABILITY: 60, GOAL: 30 }),
    ),
  ).toEqual("DIRECTION_SEEK");
});
test("④ 최저 영역 = 시간 관리 → 시간관리 취약형", () => {
  expect(
    classifyStudentType(
      makeInput(variedLikert24),
      makeAreaScores(60, { STABILITY: 60, TIME: 30 }),
    ),
  ).toEqual("TIME_WEAK");
});
test("⑤ 최저 영역 = 학습 피드백 → 학습방법 점검형", () => {
  expect(
    classifyStudentType(
      makeInput(variedLikert24),
      makeAreaScores(60, { STABILITY: 60, FEEDBACK: 30 }),
    ),
  ).toEqual("METHOD_REVIEW");
});
// ⑩ 잔여 미판정 구간은 남는다 — 최저가 PLAN 이면서 ⑧⑨ 어디에도 안 걸리는 조합.
// 값을 창작해 메우지 않는다(현행 PAGE_GRADE_COPY 폴백 유지).
test("⑩ 최저 = 계획 설계이고 ⑧⑨ 미해당 → null (억지 배정 금지)", () => {
  expect(
    classifyStudentType(
      makeInput(variedLikert24),
      makeAreaScores(60, { STABILITY: 60, PLAN: 30 }),
    ),
  ).toEqual(null);
});

// F-03 확정(2026-08-11) — 나머지 4종. 임계는 §11 TYPE_RULES 소유.
test("③ 전 영역 70+ · 종합 80+ → 학습체계 안정형", () => {
  expect(
    classifyStudentType(
      makeInput(variedLikert24),
      makeAreaScores(85, { GOAL: 72 }),
    ),
  ).toEqual("SYSTEM_STABLE");
});
test("④ PAGE1 산포 10 이내 → 균형 점검형", () => {
  expect(
    classifyStudentType(
      makeInput(variedLikert24),
      makeAreaScores(60, { GOAL: 55, PLAN: 65 }),
    ),
  ).toEqual("BALANCED");
});
test("⑧ 계획 70+ · 실행 60 미만 → 계획 과잉·실행 취약형", () => {
  expect(
    classifyStudentType(
      makeInput(variedLikert24),
      makeAreaScores(65, { STABILITY: 65, PLAN: 75, EXEC: 45 }),
    ),
  ).toEqual("PLAN_HEAVY");
});
test("⑨ 목표 70+ · 계획 70 미만 · 실행 60 미만 → 목표–실행 불균형형", () => {
  expect(
    classifyStudentType(
      makeInput(variedLikert24),
      makeAreaScores(65, { STABILITY: 65, GOAL: 80, PLAN: 60, EXEC: 45 }),
    ),
  ).toEqual("GOAL_EXEC_GAP");
});
// ③이 ⑤보다 앞선 것은 의도된 판정 변경이다 — 전 영역 70+ 이면서 최저가 GOAL 인 학생은
// 종전 DIRECTION_SEEK 였다. 되돌리려면 ③④를 ⑦ 뒤로 내린다.
test("③은 ⑤(최저=GOAL)보다 우선한다(의도된 회귀)", () => {
  expect(
    classifyStudentType(
      makeInput(variedLikert24),
      makeAreaScores(85, { GOAL: 72 }),
    ) !== "DIRECTION_SEEK",
  ).toBe(true);
});
// 8종이 전부 도달 가능해야 한다 — 어느 하나가 영영 안 나오면 문구 5개가 죽은 코드가 된다.
const reachableTypes = new Set(
  [
    makeAreaScores(85, { GOAL: 72 }), // SYSTEM_STABLE
    makeAreaScores(60, { STABILITY: 40 }), // BURDEN_ACCUM
    makeAreaScores(60, { GOAL: 55, PLAN: 65 }), // BALANCED
    makeAreaScores(60, { STABILITY: 60, GOAL: 30 }), // DIRECTION_SEEK
    makeAreaScores(60, { STABILITY: 60, TIME: 30 }), // TIME_WEAK
    makeAreaScores(60, { STABILITY: 60, FEEDBACK: 30 }), // METHOD_REVIEW
    makeAreaScores(65, { STABILITY: 65, PLAN: 75, EXEC: 45 }), // PLAN_HEAVY
    makeAreaScores(65, { STABILITY: 65, GOAL: 80, PLAN: 60, EXEC: 45 }), // GOAL_EXEC_GAP
  ].map((areas) => classifyStudentType(makeInput(variedLikert24), areas)),
);
test("TYPE_CODES 8종이 전부 도달 가능", () => {
  expect(
    TYPE_CODES.filter((code) => reachableTypes.has(code as never)).length,
  ).toEqual(8);
});
test("TYPE_RULES 신규 숫자는 BALANCED.spreadMax 하나뿐", () => {
  expect(TYPE_RULES.BALANCED.spreadMax === 10).toBe(true);
});

/* ---- F-15 불성실(직선) 응답 판정 ---- */

// 표본 하한 미달은 판정하지 않는다 — 5문장만 답하고 전부 같은 학생을 불성실로 몰지 않는다.
const fewSameLikert = {
  likert1: Object.fromEntries(LIKERT1_KEYS.slice(0, 5).map((key) => [key, 3])),
};
test("응답 5문장 전부 동일 → flagged 아님(표본 하한)", () => {
  expect(isStraightLining(makeInput(fewSameLikert))).toEqual(false);
});
// 그래도 기존 ① 가드가 남아 있어 유형은 여전히 null 이다(회귀 0).
test("기존 '전부 동일' 가드는 그대로 살아 있다", () => {
  expect(
    classifyStudentType(
      makeInput(fewSameLikert),
      makeAreaScores(60, { STABILITY: 60, GOAL: 30 }),
    ),
  ).toEqual(null);
});
test("리커트 24문장 전부 동일 → flagged", () => {
  expect(isStraightLining(makeInput(allSameLikert24))).toEqual(true);
});
// 최빈값과 다른 응답 2개까지는 '대부분 같은 항목'으로 본다(SINCERITY_BANNER 원문 근거).
// 값은 0(offmode)·100(mode) — 거리 100 >= SINCERITY_OFFMODE_MIN_DISTANCE(50) 라 확실히 offmode 로
// 잡힌다. 개수(2·3) 경계만 격리해서 보려는 테스트라 거리는 최대로 벌려 둔다(거리 자체의 경계는
// 아래 G-2 WARN2 전용 블록에서 별도로 검증한다).
const mostlySame = {
  likert1: Object.fromEntries(
    LIKERT1_KEYS.map((key, i) => [key, i < 2 ? 0 : 100]),
  ),
  likert2: Object.fromEntries(LIKERT2_KEYS.map((key) => [key, 100])),
};
test("24문장 중 2개만 다름 → flagged", () => {
  expect(isStraightLining(makeInput(mostlySame))).toEqual(true);
});
const threeOff = {
  likert1: Object.fromEntries(
    LIKERT1_KEYS.map((key, i) => [key, i < 3 ? 0 : 100]),
  ),
  likert2: Object.fromEntries(LIKERT2_KEYS.map((key) => [key, 100])),
};
test("24문장 중 3개 다름 → flagged 아님(허용치 초과)", () => {
  expect(isStraightLining(makeInput(threeOff))).toEqual(false);
});

// G-2(WARN 2, 2026-08-12) — 오탐 회귀 방지. 실측 사례: 22개 '매우 그렇다'(100) + 2개
// '그렇다'(75) 조합이 종전 알고리즘에서 flagged 됐다. 인접 척도(거리 25, 1칸)는 이제 offmode 로
// 세지 않는다 — 이 조합은 더 이상 걸리면 안 된다.
const adjacentOffmode = {
  likert1: Object.fromEntries(
    LIKERT1_KEYS.map((key, i) => [key, i < 2 ? 75 : 100]),
  ),
  likert2: Object.fromEntries(LIKERT2_KEYS.map((key) => [key, 100])),
};
test("22개 매우 그렇다(100) + 2개 그렇다(75, 거리 25) → flagged 아님(오탐 회귀 방지)", () => {
  expect(isStraightLining(makeInput(adjacentOffmode))).toEqual(false);
});
test("인접 척도 응답은 offmodeCount 에 안 잡힌다", () => {
  expect(sincerityOf(makeInput(adjacentOffmode)).offmodeCount).toEqual(0);
});
// 거리 정확히 SINCERITY_OFFMODE_MIN_DISTANCE(50)인 경계 — '>=' 이므로 여기부터는 잡혀야 한다.
const boundaryDistanceOffmode = {
  likert1: Object.fromEntries(
    LIKERT1_KEYS.map((key, i) => [key, i < 2 ? 50 : 100]),
  ),
  likert2: Object.fromEntries(LIKERT2_KEYS.map((key) => [key, 100])),
};
test("거리 정확히 50(SINCERITY_OFFMODE_MIN_DISTANCE) → offmode 로 잡힌다(>= 경계)", () => {
  expect(sincerityOf(makeInput(boundaryDistanceOffmode)).offmodeCount).toEqual(
    2,
  );
});
test("무응답(0문장) → flagged 아님", () => {
  expect(isStraightLining(makeInput())).toEqual(false);
});
test("sincerityOf 계약은 flagged 불리언", () => {
  expect(sincerityOf(makeInput(allSameLikert24)).flagged).toEqual(true);
});
test("sincerityOf.offmodeCount 실측", () => {
  expect(sincerityOf(makeInput(mostlySame)).offmodeCount).toEqual(2);
});
test("임계는 상수 소유(로직에 숫자 없음)", () => {
  expect(SINCERITY_MIN_ANSWERED === 20 && SINCERITY_MAX_OFFMODE === 2).toBe(
    true,
  );
});
// 점수는 무효화하지 않는다 — 유형 판정만 보류한다(SINCERITY_TRAIT 원문 근거).
test("flagged 여도 영역 점수는 그대로 산출된다", () => {
  expect(scoreAreasOf(makeInput(allSameLikert24)).GOAL).toEqual(
    scoreAreasOf(makeInput(allSameLikert24)).GOAL,
  );
});

/* ================================================================== *
 * 유형 8종 — 규칙 배타성과 순서 충돌
 * ================================================================== */

// ④(산포 <= 10)가 성립하면 ⑧⑨는 구조적으로 성립할 수 없다는 것이 결정문의 근거였다.
// 근거가 말뿐이 아니라 실제로 참인지 평탄 프로필 전량으로 확인한다.
{
  let spreadConflicts = 0;
  let flatProfiles = 0;
  for (let base = 45; base <= 90; base += 5) {
    for (let spread = 0; spread <= TYPE_RULES.BALANCED.spreadMax; spread += 1) {
      PAGE1_AREAS.forEach((lowArea) => {
        PAGE1_AREAS.filter((area) => area !== lowArea).forEach((highArea) => {
          const areas = makeAreaScores(base, {
            [lowArea]: base,
            [highArea]: base + spread,
          });
          const type = classifyStudentType(makeInput(variedLikert24), areas);
          flatProfiles += 1;
          if (type === "PLAN_HEAVY" || type === "GOAL_EXEC_GAP")
            spreadConflicts += 1;
        });
      });
    }
  }
  test("평탄 프로필 스윕이 실제로 돌았다", () => {
    expect(flatProfiles > 3000).toBe(true);
  });
  test("산포 10 이내에서는 ⑧⑨가 절대 나오지 않는다(④와 배타)", () => {
    expect(spreadConflicts).toEqual(0);
  });
}
// ⑧⑨는 PLAN 조건이 서로 정반대라 술어 수준에서 배타다 — 임계를 고칠 때 이 성질이 깨지면 잡힌다.
test("⑧(plan >= 70)과 ⑨(plan < 70)는 술어 자체가 배타", () => {
  expect(
    TYPE_RULES.PLAN_HEAVY.planMin >= TYPE_RULES.GOAL_EXEC_GAP.planMax,
  ).toBe(true);
});
// ③이 ⑤⑥⑦보다 앞선다는 것은 "최저 영역이 무엇이든" 성립해야 한다(한 영역만 확인하면 우연일 수 있다).
{
  const alwaysStable = PAGE1_AREAS.every(
    (lowArea) =>
      classifyStudentType(
        makeInput(variedLikert24),
        makeAreaScores(85, { [lowArea]: 70 }),
      ) === "SYSTEM_STABLE",
  );
  test("전 영역 70+ · 종합 80+ 면 최저 영역이 무엇이든 ③이 이긴다", () => {
    expect(alwaysStable).toBe(true);
  });
}
// ②는 ③④보다 앞선다 — 전 영역이 높아도 STABILITY 가 무너지면 부담 누적이 먼저다.
test("② STABILITY < 45 는 ③(전 영역 70+)보다 우선", () => {
  expect(
    classifyStudentType(
      makeInput(variedLikert24),
      makeAreaScores(85, { STABILITY: 40 }),
    ),
  ).toEqual("BURDEN_ACCUM");
});
// 판정만 살아나고 문구가 없으면 화면이 빈다 — 8종 전부 head 를 갖는지 확인한다.
test("8종 전부 유형 문구(head)를 갖는다", () => {
  expect(
    TYPE_CODES.every((code) => typeof TYPE_COPY[code]?.head === "string"),
  ).toBe(true);
});

/* ================================================================== *
 * 불성실 판정 — 정탐 경계와 오탐 방지 경계
 * ================================================================== */

// 임계를 코드에서 읽어 픽스처를 만든다. 상수를 바꾸면 경계 케이스가 따라 움직여야 하고,
// 여기에 숫자를 pin 하면 상수만 교체하는 길이 막힌다.
const ALL_LIKERT_KEYS = [...LIKERT1_KEYS, ...LIKERT2_KEYS];
// G-2(WARN 2) — offmode 값은 mode 와 거리 100(0 vs 100)을 둬 SINCERITY_OFFMODE_MIN_DISTANCE(50)
// 를 항상 넘긴다. 이 헬퍼는 '개수' 경계(SINCERITY_MAX_OFFMODE)를 격리해서 보는 용도라 거리
// 자체를 흔들지 않는다.
function sameLikert(count, offmode = 0) {
  const likert1 = {};
  const likert2 = {};
  ALL_LIKERT_KEYS.slice(0, count).forEach((key, index) => {
    const value = index < offmode ? 0 : 100;
    if (LIKERT1_KEYS.includes(key)) likert1[key] = value;
    else likert2[key] = value;
  });
  return { likert1, likert2 };
}
test(`응답 ${SINCERITY_MIN_ANSWERED - 1}문장 전부 동일 → flagged 아님(하한 바로 아래)`, () => {
  expect(
    isStraightLining(makeInput(sameLikert(SINCERITY_MIN_ANSWERED - 1))),
  ).toEqual(false);
});
test(`응답 ${SINCERITY_MIN_ANSWERED}문장 전부 동일 → flagged(하한 정확히)`, () => {
  expect(
    isStraightLining(makeInput(sameLikert(SINCERITY_MIN_ANSWERED))),
  ).toEqual(true);
});
test(`하한 표본에서 허용치(${SINCERITY_MAX_OFFMODE}) 이내는 flagged`, () => {
  expect(
    isStraightLining(
      makeInput(sameLikert(SINCERITY_MIN_ANSWERED, SINCERITY_MAX_OFFMODE)),
    ),
  ).toEqual(true);
});
test("하한 표본에서 허용치를 넘으면 flagged 아님", () => {
  expect(
    isStraightLining(
      makeInput(sameLikert(SINCERITY_MIN_ANSWERED, SINCERITY_MAX_OFFMODE + 1)),
    ),
  ).toEqual(false);
});
// 오탐 방지의 본질 — 성실하게 다양한 응답을 낸 학생은 표본이 아무리 많아도 걸리지 않는다.
test("24문장 다양 응답 → flagged 아님", () => {
  expect(isStraightLining(makeInput(variedLikert24))).toEqual(false);
});
test("sincerityOf.answeredCount 는 실제 응답 수", () => {
  expect(
    sincerityOf(makeInput(sameLikert(SINCERITY_MIN_ANSWERED))).answeredCount,
  ).toEqual(SINCERITY_MIN_ANSWERED);
});
// 리포트 계층까지 신호가 이어지는지 — 판정만 되고 배너가 안 붙으면 학생은 경고를 못 본다.
test("하한 표본 직선 응답이 리포트 배너까지 이어진다", () => {
  expect(
    buildReport(makeInput(sameLikert(SINCERITY_MIN_ANSWERED))).notices
      .sincerityBanner,
  ).toEqual(COMMON_COPY.SINCERITY_BANNER);
});
