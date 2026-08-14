// jeongsi.js 골든 픽스처 회귀 테스트.
//
// 생성 방법 (손계산 금지 — 원본을 실제로 실행해 뽑은 값이다):
//   1. /Users/hyunsoo/uwellnow/target/api/student.mjs 의 240-242(round1),
//      248-250(clampProb), 336-402(정시 5개 함수) 를 그대로 잘라내고,
//      /Users/hyunsoo/uwellnow/target/components/IntakeForm.tsx 의 464-505
//      (GRADE_PERCENTILE / getPercentileChips / getEnglishPenaltyFE /
//       calcJeongsiCompositeFE) 를 타입 주석만 제거해 이어 붙여 하네스를 만든다.
//   2. 아래 FIXTURES 의 입력값들을 그대로 넣어 실행하고 출력을 JSON 으로 받는다.
//   3. 그 출력을 이 파일에 인라인 배열로 박아 넣는다.
//
// 즉 아래 기대값은 전부 "원본이 실제로 뱉은 값"이며, 옳아 보이는 값이 아니다.
// 값이 이상해 보여도 고치지 마라 — 이식 파리티가 깨졌다는 뜻이 된다.
//
// 실행: cd /Users/hyunsoo/uwellnow/winningpage-goal-app && node --test src/lib/goal/calc/jeongsi.test.js

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  calcJeongsiBaseProb,
  calcJeongsiCompositeFE,
  calcJeongsiProb,
  GRADE_PERCENTILE,
  getEnglishPenaltyFE,
  getPercentileBands,
  getPercentileChips,
  getTimeFactorPercentile,
  getWeightedEffortAmount,
} from "./jeongsi.ts";

// 부동소수 비교 헬퍼. NaN 은 NaN 끼리만 같다고 본다(원본이 NaN 을 뱉는 케이스가 있다).
function assertClose(actual, expected, label) {
  if (Number.isNaN(expected)) {
    assert.ok(Number.isNaN(actual), `${label}: NaN 기대했으나 ${actual}`);
    return;
  }
  assert.ok(
    Math.abs(actual - expected) < 1e-9,
    `${label}: 기대 ${expected}, 실제 ${actual}`,
  );
}

// ── 골든 픽스처 (원본 실행 결과) ───────────────────────────────────────
const FIXTURES = {
  effort: [
    [0, 0, 0],
    [50, 50, 0],
    [100, 100, 0],
    [0, 100, 15.512],
    [100, 0, 15.512],
    [78.4, 92, 3.206],
    [92, 78.4, 3.206],
    [4, 10, 0.943],
    [0, 3, 0.75],
    [96, 100, 3.04],
    [3, 4, 0],
    [10, 11, 0],
    [95, 96, 0],
    [40, 41, 0.085],
    [59, 60, 0],
    [11, 22, 1.146],
    [22, 11, 1.146],
    [-5, 10, 1.693],
    [50, 150, 10.459],
    [150, 50, 10.459],
    [null, 50, 5.053],
    [undefined, 50, 5.053],
    [50, null, 5.053],
    [50, undefined, 5.053],
    [null, null, 0],
    [undefined, undefined, 0],
    ["78.4", "92", 3.206],
    ["", 50, 5.053],
    [NaN, 50, 5.053],
    [0, 0.5, 0.125],
    [3.5, 4.5, 0.079],
    [89.5, 95.5, 2.357],
    [-10, -5, 0],
    [200, 300, 0],
    [0, 1, 0.25],
    [99, 100, 0.76],
    [100, 99.5, 0.38],
  ],
  baseProb: [
    [0, 0, 0],
    [50, 50, 70],
    [100, 100, 70],
    [0, 100, 0],
    [100, 0, 0],
    [78.4, 92, 18.8],
    [92, 78.4, 84.6],
    [4, 10, 47.6],
    [0, 3, 0],
    [96, 100, 20.1],
    [3, 4, 70],
    [10, 11, 70],
    [95, 96, 70],
    [40, 41, 67.6],
    [59, 60, 70],
    [11, 22, 43.8],
    [22, 11, 77.5],
    [-5, 10, 35],
    [50, 150, 1],
    [150, 50, 89.7],
    [null, 50, 0],
    [undefined, 50, 0],
    [50, null, 0],
    [50, undefined, 0],
    [null, null, 0],
    [undefined, undefined, 0],
    ["78.4", "92", 18.8],
    ["", 50, 0],
    [NaN, 50, 0],
    [0, 0.5, 0],
    [3.5, 4.5, 67.8],
    [89.5, 95.5, 26.6],
    [-10, -5, 70],
    [200, 300, 70],
    [0, 1, 0],
    [99, 100, 51.3],
    [100, 99.5, 72.9],
    [70, 70, 70],
    [1, 2, 63.2],
    [2, 1, 71.9],
  ],
  timeFactor: [
    [50, 60, 14, 14, 1],
    [50, 60, 0, 14, 0.5],
    [50, 60, 7, 14, 0.7871745887492587],
    [60, 50, 14, 14, 0.65],
    [60, 50, 0, 14, 1],
    [60, 50, 7, 14, 0.7989777878755189],
    [50, 50, 14, 14, 1],
    [50, 50, 0, 14, 0.58],
    [50, 50, 7, 14, 0.8212266545493773],
    [50, 60, null, 14, 1],
    [50, 60, undefined, 14, 1],
    [50, 60, 5, 0, 1],
    [50, 60, 5, -3, 1],
    [50, 60, -2, 14, NaN],
    [50, 60, 20, 14, 1.1651070822105982],
    [78.4, 92, 3, 14, 0.6458023686991505],
    [92, 78.4, 3, 14, 0.8979383419105946],
    [50, 60, 1, 14, 0.560543507252587],
    [50, 60, 13, 14, 0.9712184187960757],
  ],
  timeFactorDefaultTotal: [
    [50, 60, 7, 0.7871745887492587],
    [60, 50, 7, 0.7989777878755189],
    [50, 50, 7, 0.8212266545493773],
  ],
  prob: [
    [50, 60, 14, 14, 51.2],
    [50, 60, 0, 14, 25.6],
    [50, 60, 7, 14, 40.3],
    [60, 50, 14, 14, 49],
    [60, 50, 0, 14, 75.4],
    [60, 50, 7, 14, 60.2],
    [50, 50, 14, 14, 70],
    [50, 50, 0, 14, 40.6],
    [50, 50, 7, 14, 57.5],
    [50, 60, null, 14, 51.2],
    [50, 60, undefined, 14, 51.2],
    [50, 60, 5, 0, 51.2],
    [50, 60, 5, -3, 51.2],
    [50, 60, -2, 14, 0],
    [50, 60, 20, 14, 59.7],
    [78.4, 92, 3, 14, 12.1],
    [92, 78.4, 3, 14, 76],
    [50, 60, 1, 14, 28.7],
    [50, 60, 13, 14, 49.7],
    [0, 50, 7, 14, 0],
    [50, 0, 7, 14, 0],
    [null, 50, 7, 14, 0],
    [50, null, 7, 14, 0],
    [0, 100, 14, 14, 0],
    [100, 0, 14, 14, 0],
    [100, 0, 0, 14, 0],
  ],
  probDefaultTotal: [
    [78.4, 92, 3, 12.1],
    [92, 78.4, 3, 76],
  ],
  engPenalty: [
    [0, 0],
    [0.5, 0],
    [1, 0],
    [1.5, -1],
    [2, -2],
    [2.5, -3],
    [3, -4],
    [3.5, -5],
    [4, -6],
    [5, -8],
    [6, -10],
    [7, -12],
    [8, -14],
    [8.5, -15],
    [9, -16],
    [9.5, -16],
    [10, -16],
    [-3, 0],
    [100, -16],
  ],
  chips: [
    [
      "1",
      [
        { value: 96, label: "96(컷)" },
        { value: 97, label: "97" },
        { value: 98, label: "98(안정)" },
        { value: 99, label: "99" },
        { value: 100, label: "100(만점)" },
      ],
    ],
    [
      "2",
      [
        { value: 89, label: "89(컷)" },
        { value: 90, label: "90" },
        { value: 91, label: "91" },
        { value: 92, label: "92(안정)" },
        { value: 93, label: "93" },
        { value: 94, label: "94" },
        { value: 95, label: "95(최고)" },
      ],
    ],
    [
      "3",
      [
        { value: 77, label: "77(컷)" },
        { value: 80, label: "80" },
        { value: 83, label: "83(안정)" },
        { value: 85, label: "85" },
        { value: 88, label: "88(최고)" },
      ],
    ],
    [
      "4",
      [
        { value: 60, label: "60(컷)" },
        { value: 64, label: "64" },
        { value: 68, label: "68(안정)" },
        { value: 72, label: "72" },
        { value: 76, label: "76(최고)" },
      ],
    ],
    [
      "5",
      [
        { value: 40, label: "40(컷)" },
        { value: 45, label: "45" },
        { value: 50, label: "50(안정)" },
        { value: 54, label: "54" },
        { value: 59, label: "59(최고)" },
      ],
    ],
    [
      "6",
      [
        { value: 23, label: "23(컷)" },
        { value: 27, label: "27" },
        { value: 31, label: "31(안정)" },
        { value: 35, label: "35" },
        { value: 39, label: "39(최고)" },
      ],
    ],
    [
      "7",
      [
        { value: 11, label: "11(컷)" },
        { value: 14, label: "14" },
        { value: 17, label: "17(안정)" },
        { value: 19, label: "19" },
        { value: 22, label: "22(최고)" },
      ],
    ],
    [
      "8",
      [
        { value: 4, label: "4(컷)" },
        { value: 5, label: "5" },
        { value: 6, label: "6" },
        { value: 7, label: "7(안정)" },
        { value: 8, label: "8" },
        { value: 9, label: "9" },
        { value: 10, label: "10(최고)" },
      ],
    ],
    [
      "9",
      [
        { value: 0, label: "0(컷)" },
        { value: 1, label: "1" },
        { value: 2, label: "2(안정)" },
        { value: 3, label: "3(최고)" },
      ],
    ],
    ["0", []],
    ["10", []],
    ["-1", []],
    ["", []],
    ["abc", []],
    [
      "3.7",
      [
        { value: 77, label: "77(컷)" },
        { value: 80, label: "80" },
        { value: 83, label: "83(안정)" },
        { value: 85, label: "85" },
        { value: 88, label: "88(최고)" },
      ],
    ],
    [
      "  5  ",
      [
        { value: 40, label: "40(컷)" },
        { value: 45, label: "45" },
        { value: 50, label: "50(안정)" },
        { value: 54, label: "54" },
        { value: 59, label: "59(최고)" },
      ],
    ],
    [
      "1등급",
      [
        { value: 96, label: "96(컷)" },
        { value: 97, label: "97" },
        { value: 98, label: "98(안정)" },
        { value: 99, label: "99" },
        { value: 100, label: "100(만점)" },
      ],
    ],
  ],
  composite: [
    ["empty", 0],
    ["single-full", 82.5],
    ["single-noeng", 84.5],
    ["three-rounds", 76.33],
    ["nulls", 0],
    ["partial-null-exp", 59.67],
    ["only-kor", 33.33],
    ["eng-fraction", 75],
    ["eng-out-of-range", 64],
    ["eng-zero-string", 80],
    ["eng-nonnumeric", 80],
    ["eng-last-wins", 64],
    ["zeros", 0],
    ["negatives", -21.67],
    ["rounding", 61.4],
    ["undefined-percentile", -2],
  ],
  bands: [
    { min: 0, max: 3, width: 4, weight: 1 },
    { min: 4, max: 10, width: 7, weight: 1.1 },
    { min: 11, max: 22, width: 12, weight: 1.25 },
    { min: 23, max: 39, width: 17, weight: 1.45 },
    { min: 40, max: 59, width: 20, weight: 1.7 },
    { min: 60, max: 76, width: 17, weight: 2 },
    { min: 77, max: 88, width: 12, weight: 2.4 },
    { min: 89, max: 95, width: 7, weight: 3 },
    { min: 96, max: 100, width: 5, weight: 3.8 },
  ],
  gradePercentile: {
    1: { min: 96, max: 100 },
    2: { min: 89, max: 95 },
    3: { min: 77, max: 88 },
    4: { min: 60, max: 76 },
    5: { min: 40, max: 59 },
    6: { min: 23, max: 39 },
    7: { min: 11, max: 22 },
    8: { min: 4, max: 10 },
    9: { min: 0, max: 3 },
  },
};

// calcJeongsiCompositeFE 입력 픽스처. 이름은 FIXTURES.composite 의 첫 항목과 짝을 이룬다.
function subj(kor, math, eng, e1, e2) {
  return {
    kor: { grade: "", percentile: kor },
    math: { grade: "", percentile: math },
    eng,
    exp1: { grade: "", percentile: e1 },
    exp2: { grade: "", percentile: e2 },
    exp1Track: "",
    exp2Track: "",
  };
}

const COMPOSITE_INPUTS = {
  empty: {},
  "single-full": { a: subj(96, 89, "2", 77, 60) },
  "single-noeng": { a: subj(96, 89, "", 77, 60) },
  "three-rounds": {
    a: subj(90, 80, "1", 70, 60),
    b: subj(92, 82, "2", 72, 62),
    c: subj(94, 84, "3", 74, 64),
  },
  nulls: { a: subj(null, null, "", null, null) },
  "partial-null-exp": { a: subj(96, 89, "2", null, null) },
  "only-kor": { a: subj(100, null, "", null, null) },
  "eng-fraction": { a: subj(80, 80, "3.5", 80, 80) },
  "eng-out-of-range": { a: subj(80, 80, "12", 80, 80) },
  "eng-zero-string": { a: subj(80, 80, "0", 80, 80) },
  "eng-nonnumeric": { a: subj(80, 80, "x", 80, 80) },
  "eng-last-wins": {
    a: subj(80, 80, "1", 80, 80),
    b: subj(80, 80, "9", 80, 80),
  },
  zeros: { a: subj(0, 0, "1", 0, 0) },
  negatives: { a: subj(-10, -20, "1", -30, -40) },
  rounding: { a: subj(78.4, 63.7, "2", 51.3, 44.9) },
  "undefined-percentile": {
    a: subj(undefined, undefined, "2", undefined, undefined),
  },
};

// ── 테스트 ─────────────────────────────────────────────────────────────

test("getPercentileBands: 9구간 리터럴이 원본과 완전히 일치한다", () => {
  assert.deepEqual(getPercentileBands(), FIXTURES.bands);
});

test("getPercentileBands: 9구간 전부 width === max - min + 1 이다", () => {
  // 분석 문서(target-app-analysis.md §9.5·부록)는 "일치하지 않는 구간이 있다"고 적었으나
  // 원본을 실행해 확인한 결과 9구간 모두 일치한다. 문서 쪽이 틀렸다.
  for (const band of getPercentileBands()) {
    assert.equal(
      band.width,
      band.max - band.min + 1,
      `밴드 ${band.min}~${band.max} 의 width 불일치`,
    );
  }
});

test("getPercentileBands: 매 호출마다 새 배열을 돌려준다(호출자 변형에 안전)", () => {
  const first = getPercentileBands();
  first[0]!.weight = 999;
  assert.equal(getPercentileBands()[0]!.weight, 1.0);
});

test("getWeightedEffortAmount: 골든 픽스처", () => {
  for (const [current, target, expected] of FIXTURES.effort) {
    assertClose(
      getWeightedEffortAmount(current, target),
      expected,
      `effort(${String(current)}, ${String(target)})`,
    );
  }
});

test("getWeightedEffortAmount: 역순 입력은 정순과 같은 값이다", () => {
  const pairs = [
    [0, 100],
    [78.4, 92],
    [11, 22],
    [50, 150],
  ];
  for (const [a, b] of pairs) {
    assertClose(
      getWeightedEffortAmount(a, b),
      getWeightedEffortAmount(b, a),
      `effort 대칭 ${a}<->${b}`,
    );
  }
});

test("calcJeongsiBaseProb: 골든 픽스처", () => {
  for (const [current, target, expected] of FIXTURES.baseProb) {
    assertClose(
      calcJeongsiBaseProb(current, target),
      expected,
      `baseProb(${String(current)}, ${String(target)})`,
    );
  }
});

test("getTimeFactorPercentile: 골든 픽스처", () => {
  for (const [current, cut, remain, total, expected] of FIXTURES.timeFactor) {
    assertClose(
      getTimeFactorPercentile(
        current as number,
        cut as number,
        remain as number | null | undefined,
        total as number,
      ),
      expected,
      `timeFactor(${String(current)}, ${String(cut)}, ${String(remain)}, ${String(total)})`,
    );
  }
});

test("getTimeFactorPercentile: totalExams 기본값 14", () => {
  for (const [
    current,
    cut,
    remain,
    expected,
  ] of FIXTURES.timeFactorDefaultTotal) {
    assertClose(
      getTimeFactorPercentile(current as number, cut as number, remain),
      expected,
      `timeFactor 기본총회차(${current}, ${cut}, ${remain})`,
    );
    assertClose(
      getTimeFactorPercentile(current as number, cut as number, remain, 14),
      expected,
      `timeFactor 명시총회차(${current}, ${cut}, ${remain})`,
    );
  }
});

test("calcJeongsiProb: 골든 픽스처", () => {
  for (const [current, cut, remain, total, expected] of FIXTURES.prob) {
    assertClose(
      calcJeongsiProb(
        current as number,
        cut as number,
        remain as number | null | undefined,
        total as number,
      ),
      expected,
      `prob(${String(current)}, ${String(cut)}, ${String(remain)}, ${String(total)})`,
    );
  }
});

test("calcJeongsiProb: totalExams 기본값 14", () => {
  for (const [current, cut, remain, expected] of FIXTURES.probDefaultTotal) {
    assertClose(
      calcJeongsiProb(current as number, cut as number, remain as number),
      expected,
      `prob 기본총회차(${current}, ${cut}, ${remain})`,
    );
  }
});

test("calcJeongsiProb: 항상 0~100 범위 안이다", () => {
  for (const [, , , , expected] of FIXTURES.prob) {
    assert.ok(
      (expected as number) >= 0 && (expected as number) <= 100,
      `범위 밖 픽스처: ${expected}`,
    );
  }
});

test("GRADE_PERCENTILE: 9등급 구간 리터럴이 원본과 일치한다", () => {
  assert.deepEqual(GRADE_PERCENTILE, FIXTURES.gradePercentile);
});

test("getPercentileChips: 골든 픽스처", () => {
  for (const [gradeStr, expected] of FIXTURES.chips) {
    assert.deepEqual(
      // FIXTURES.chips 는 [string, chip[]][] 튜플인데 리터럴 배열이라 TS 가
      // gradeStr 을 `string | chip[]` 로 합쳐 추론한다 — 런타임엔 항상 string.
      getPercentileChips(gradeStr as string),
      expected,
      `chips(${JSON.stringify(gradeStr)})`,
    );
  }
});

test("getEnglishPenaltyFE: 골든 픽스처", () => {
  for (const [grade, expected] of FIXTURES.engPenalty) {
    assertClose(
      getEnglishPenaltyFE(grade as number),
      expected,
      `engPenalty(${grade})`,
    );
  }
});

test("getEnglishPenaltyFE: NaN 등급은 NaN 을 낸다(원본 동작)", () => {
  assert.ok(Number.isNaN(getEnglishPenaltyFE(NaN)));
});

test("calcJeongsiCompositeFE: 골든 픽스처", () => {
  for (const [name, expected] of FIXTURES.composite) {
    const input = COMPOSITE_INPUTS[name as string];
    assert.notEqual(input, undefined, `입력 픽스처 누락: ${name}`);
    assertClose(calcJeongsiCompositeFE(input), expected, `composite(${name})`);
  }
});
