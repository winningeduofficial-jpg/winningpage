// diagnosisScoring 엔진 — 합격 구간(§8 CASE-04/04b) · 합격 확률 산출 경계·단조성 스윕.
// 원본: scripts/verify-diagnosis-scoring.mjs S7 · 확률 산출(경계·단조성·자료 없음) 블록.

import { expect, test } from "vitest";
import {
  ADMISSION_BAND_BASE_PROBABILITY,
  ADMISSION_BAND_EDGE_ADJUST,
  BASE_PROBABILITY,
  CSAT_MIN_DELTA,
  INTERVIEW_DELTA,
  JONGHAP_DELTA,
  PROB_DISPLAY_MODE,
  PROB_MAX,
  PROB_MIN,
  PROB_RANGE_LABELS,
} from "@/data/diagnosisScoringTable.ts";
import { buildReport } from "@/lib/diagnosisReport.ts";
import {
  admissionBand,
  admissionRows,
  probabilityRangeLabel,
  roundHalfUp,
  successProbability,
} from "@/lib/diagnosisScoring.ts";
import { getCase, makeInput } from "./diagnosisScoringTestFixtures.ts";

/* ================================================================== *
 * S7. §8 CASE-04 / 04b — 합격 구간
 * ================================================================== */

const ex05 = getCase("EX-05");
const cuts04 = ex05.input.cuts;

test("3.24 vs 70%컷 2.56 → RISK (2.86 초과)", () => {
  expect(admissionBand(ex05.input.mine, cuts04)).toEqual(ex05.expected.band);
});
test("비교표 행 = cut70 · mine 2행", () => {
  expect(
    admissionRows(ex05.input.mine, cuts04).map(({ key, value, diff }) => ({
      key,
      value,
      diff,
    })),
  ).toEqual(ex05.expected.rows);
});
test("내 성적 행은 emphasis = true", () => {
  expect(admissionRows(ex05.input.mine, cuts04).at(-1)?.emphasis).toEqual(true);
});
// 0.6799999999999997 이 그대로 새면 화면에 '0.68등급 부족'이 아니라 소수 16자리가 찍힌다.
test("diff 는 소수 2자리로 접힌다", () => {
  expect(admissionRows(3.24, cuts04)[0]?.diff).toEqual(0.68);
});

test("cut50·cut70 둘 다 있고 mine <= cut50 → STABLE", () => {
  expect(admissionBand(2.0, { cut50: 2.5, cut70: 3.0 })).toEqual("STABLE");
});
test("cut50 < mine <= cut70 → FIT", () => {
  expect(admissionBand(2.8, { cut50: 2.5, cut70: 3.0 })).toEqual("FIT");
});
test("cut70 < mine <= cut70+0.30 → REACH", () => {
  expect(admissionBand(3.3, { cut50: 2.5, cut70: 3.0 })).toEqual("REACH");
});
test("cut70만 있고 mine <= cut70−0.30 → STABLE(대칭)", () => {
  expect(admissionBand(2.2, { cut50: null, cut70: 2.56 })).toEqual("STABLE");
});
test("둘 다 없음 → null (BAND_NODATA)", () => {
  expect(admissionBand(3.24, { cut50: null, cut70: null })).toEqual(null);
});
test("mine 미입력 → null", () => {
  expect(admissionBand(null, { cut50: 2.5, cut70: 3.0 })).toEqual(null);
});
test("행 배열은 값이 없으면 빈 배열(§7.4.3)", () => {
  expect(admissionRows(null, {})).toEqual([]);
});

// CASE-04b — Q-28 확정(2026-08-11). rev.1 은 `3.24 <= null` 이 false 로 평가돼 안정권 학생을
// 무조건 RISK 로 찍었다. 지금은 결측 대체 항등식(c50=cut70−0.30, c70=cut50+0.30)으로 정상 산출된다.
const ex04b = { mine: 2.1, cuts: { cut50: 2.5, cut70: null } };
test("cut50 단독 → STABLE (대칭 규칙, A4 폴백 대신 정상 산출)", () => {
  expect(admissionBand(ex04b.mine, ex04b.cuts)).toEqual("STABLE");
});
test("cut50 단독이 RISK 로 떨어지지 않는다(rev.1 버그 회귀)", () => {
  expect(admissionBand(ex04b.mine, ex04b.cuts) !== "RISK").toBe(true);
});

// 4조합(둘 다 있음 / 50만 / 70만 / 둘 다 없음) 전부를 덮는다. cut50 단독(2.5)·cut70 단독(2.8)은
// 결측 대체 항등식으로 동일한 4단 경계(c50=2.5 / c70=2.8 / c70+0.30=3.1)를 내므로, `<=` 귀속
// 규칙(609행 주석)을 확인할 경계 위/아래 쌍(2.5/2.6, 2.8/2.9, 3.1/3.2)을 헬퍼 하나로 두 조합에
// 재사용한다. cut70=2.8 은 2.8+0.3 이 JS 부동소수점으로 3.0999999999999996 이 되는 바로 그
// 조합이다 — admissionBand 가 항등식 계산 직후 roundHalfUp(...,2) 로 정규화하므로(diagnosisScoring.js)
// 경계값 3.1 이 정확히 성립한다. 이 정규화가 실제로 동작하는지가 이 블록의 검증 대상이다.
function checkAdmissionBandBoundaries(label, cuts) {
  test(`${label} mine=2.5(=c50) → STABLE`, () => {
    expect(admissionBand(2.5, cuts)).toEqual("STABLE");
  });
  test(`${label} mine=2.6(c50<mine<=c70) → FIT`, () => {
    expect(admissionBand(2.6, cuts)).toEqual("FIT");
  });
  test(`${label} mine=2.8(=c70) → FIT`, () => {
    expect(admissionBand(2.8, cuts)).toEqual("FIT");
  });
  test(`${label} mine=2.9(c70<mine<=c70+0.30) → REACH`, () => {
    expect(admissionBand(2.9, cuts)).toEqual("REACH");
  });
  test(`${label} mine=3.1(=c70+0.30) → REACH`, () => {
    expect(admissionBand(3.1, cuts)).toEqual("REACH");
  });
  test(`${label} mine=3.2(>c70+0.30) → RISK`, () => {
    expect(admissionBand(3.2, cuts)).toEqual("RISK");
  });
}
checkAdmissionBandBoundaries("cut50 단독(cut50=2.5→c70=2.8)", {
  cut50: 2.5,
  cut70: null,
});
checkAdmissionBandBoundaries("cut70 단독(cut70=2.8→c50=2.5)", {
  cut50: null,
  cut70: 2.8,
});
test("둘 다 있음(cut50=2.5,cut70=2.8) mine=3.2 → RISK", () => {
  expect(admissionBand(3.2, { cut50: 2.5, cut70: 2.8 })).toEqual("RISK");
});

// F-01 확정(2026-08-11) — 확률은 §11 밴드 기준값 + 열린구간 EDGE + 14~16번 가감으로 산출한다.
// 전역 단일 기준값은 폐기됐다. 이 단언은 "누군가 전역 기준값을 되살리지 않았다"만 지킨다.
test("BASE_PROBABILITY 폐기(null 유지)", () => {
  expect(BASE_PROBABILITY).toEqual(null);
});

// 단조성 불변식 — 밴드 기준값은 내림차순이고, 인접 간격이 EDGE 폭 합보다 커야 보정이 순서를
// 뒤집지 못한다. 여기가 붉어지면 "내신이 나빠졌는데 확률이 올랐다"가 학생 화면에 나갈 수 있다.
const bandProbs = ["STABLE", "FIT", "REACH", "RISK"].map(
  (band) => ADMISSION_BAND_BASE_PROBABILITY[band],
);
test("밴드 기준값 4키 전부 존재", () => {
  expect(bandProbs.filter((value) => typeof value === "number").length).toEqual(
    4,
  );
});
test("밴드 기준값은 STABLE > FIT > REACH > RISK 내림차순", () => {
  expect(
    bandProbs.every((value, i) => i === 0 || bandProbs[i - 1] > value),
  ).toBe(true);
});
// G-2(WARN 3) RISK_VERY_FAR 신설 후 — RISK 방향 최대 보정폭이 5→10 으로 커졌다. STABLE·RISK
// 방향은 동시에 걸리지 않지만(경계가 다른 밴드쌍), 두 방향의 **최대치**를 더한 보수적 합으로
// 안전 여유를 검사한다(각 방향에서 가장 큰 보정 하나씩만 반영 — RISK_FAR·RISK_VERY_FAR 는
// 서로 대체이지 가산이 아니므로 둘을 더하지 않는다).
const edgeSpan =
  Math.abs(ADMISSION_BAND_EDGE_ADJUST.STABLE_DEEP) +
  Math.max(
    Math.abs(ADMISSION_BAND_EDGE_ADJUST.RISK_FAR),
    Math.abs(ADMISSION_BAND_EDGE_ADJUST.RISK_VERY_FAR),
  );
test("인접 밴드 간격 > EDGE 폭 합 (보정이 밴드 순서를 못 뒤집는다, RISK_VERY_FAR 포함)", () => {
  expect(
    bandProbs.every(
      (value, i) => i === 0 || bandProbs[i - 1] - value > edgeSpan,
    ),
  ).toBe(true);
});

// 실제 산출값 — cuts 가 있으면 EDGE 가 붙고, 생략하면 EDGE 0 (하위호환).
const probCuts = { cut50: 2.5, cut70: 2.8 };
test("FIT · 가감 0 → 55", () => {
  expect(successProbability(makeInput(), "FIT", 2.6, probCuts)).toEqual(55);
});
test("STABLE 얕음(2.21) → 75", () => {
  expect(successProbability(makeInput(), "STABLE", 2.21, probCuts)).toEqual(75);
});
test("STABLE 깊음(2.20 <= c50−0.30) → 80", () => {
  expect(successProbability(makeInput(), "STABLE", 2.2, probCuts)).toEqual(80);
});
test("RISK 가까움(3.4 <= c70+0.60) → 15", () => {
  expect(successProbability(makeInput(), "RISK", 3.4, probCuts)).toEqual(15);
});
test("RISK 멂(3.41 > c70+0.60, <= c70+1.20) → 10", () => {
  expect(successProbability(makeInput(), "RISK", 3.41, probCuts)).toEqual(10);
});
// G-2(WARN 3) — RISK_VERY_FAR 신설 회귀 방지. 종전엔 3.41·5.00·9.00 이 전부 10 으로 포화됐다
// (실측 버그). c70+4×MARGIN=4.0 초과부터는 -10 이 걸려 5 로 한 번 더 갈라져야 한다.
test("RISK 매우 멂(4.0 = c70+1.20, 경계는 아직 RISK_FAR) → 10", () => {
  expect(successProbability(makeInput(), "RISK", 4.0, probCuts)).toEqual(10);
});
test("RISK 매우 멂(4.01 > c70+1.20) → 5 (RISK_VERY_FAR)", () => {
  expect(successProbability(makeInput(), "RISK", 4.01, probCuts)).toEqual(5);
});
test("RISK 포화 회귀 방지 — 3.41 과 9.00 이 더 이상 같은 값이 아니다", () => {
  expect(
    successProbability(makeInput(), "RISK", 3.41, probCuts) !==
      successProbability(makeInput(), "RISK", 9.0, probCuts),
  ).toBe(true);
});
test("mine/cuts 생략 시 EDGE = 0", () => {
  expect(
    successProbability(makeInput(), "STABLE", undefined, undefined),
  ).toEqual(75);
});
test("가감 반영: FIT + HIGH(+5) → 60", () => {
  expect(
    successProbability(makeInput({ csatMin: "HIGH" }), "FIT", 2.6, probCuts),
  ).toEqual(60);
});
test("가감 최소 −30 + RISK_FAR → PROB_MIN 으로 clamp", () => {
  expect(
    successProbability(
      makeInput({
        csatMin: "HARD",
        jonghapReady: "UNKNOWN",
        interviewReady: "NOT_STARTED",
      }),
      "RISK",
      3.41,
      probCuts,
    ),
  ).toEqual(PROB_MIN);
});
test("band 가 null 이면 확률도 null (추정치를 만들지 않는다)", () => {
  expect(successProbability(makeInput(), null, undefined, undefined)).toEqual(
    null,
  );
});

// 내신 단조성 실측 — 1.00~6.00 을 0.01 단위로 훑어 확률이 한 번도 올라가지 않음을 확인한다.
let monotonicViolations = 0;
let previousProb = Infinity;
for (let step = 100; step <= 600; step += 1) {
  const mine = roundHalfUp(step / 100, 2);
  const band = admissionBand(mine, probCuts);
  const prob = successProbability(
    makeInput({ csatMin: "BORDER", interviewReady: "RECORD_WEAK" }),
    band,
    mine,
    probCuts,
  );
  if (prob > previousProb) monotonicViolations += 1;
  previousProb = prob;
}
test("내신 1.00~6.00 스윕에서 확률 역전 0건", () => {
  expect(monotonicViolations).toEqual(0);
});

// 표기 계층 — 학생에게 점추정 %를 내지 않는다. 표에 '100'·'0%'가 구조적으로 없어야 한다.
test('PROB_MAX < 100 (06_금지어 "100%" 충돌 방지)', () => {
  expect(PROB_MAX < 100).toBe(true);
});
test("p=55 → 50~60% 구간 라벨", () => {
  expect(probabilityRangeLabel(55)).toEqual("50~60%");
});
test("p=95 도 상단 캡 (90~100% 를 만들지 않는다)", () => {
  expect(probabilityRangeLabel(95)).toEqual("80~90%");
});
test("p=5 → 하단은 0% 를 쓰지 않는다", () => {
  expect(probabilityRangeLabel(5)).toEqual("10% 미만");
});
test("확률 null 이면 라벨도 null", () => {
  expect(probabilityRangeLabel(null)).toEqual(null);
});
test("구간 라벨 어디에도 '100' 부분문자열이 없다", () => {
  expect(PROB_RANGE_LABELS.every((entry) => !entry.label.includes("100"))).toBe(
    true,
  );
});

// F-02(2026-08-12 확정, Q-35 종결) — 자사고·특목고 전용 입결 마스터 분기를 제거하고 일반
// 마스터 단일 경로로 확정했다. `admissionMasterKey()`·`ADMISSION_MASTER_KEYS`·
// `ADMISSION_SPECIAL_SCHOOL_TYPES` 는 소비처가 끝까지 0곳이었던 미완 분기라 삭제했다(값을
// 창작하지 않는다는 원칙과 같은 이유 — 존재하지 않는 데이터를 전제로 한 분기를 남기지 않는다).
// 재도입 방지 회귀 검사 — export 목록에 다시 나타나면 여기서 잡힌다.
const scoringExports = Object.keys(await import("@/lib/diagnosisScoring.ts"));
test("F-02 — admissionMasterKey 재도입 없음(export 목록에 없다)", () => {
  expect(!scoringExports.includes("admissionMasterKey")).toBe(true);
});
const scoringTableExports = Object.keys(
  await import("@/data/diagnosisScoringTable.ts"),
);
test("F-02 — ADMISSION_MASTER_KEYS/ADMISSION_SPECIAL_SCHOOL_TYPES 재도입 없음", () => {
  expect(
    !scoringTableExports.some(
      (key) =>
        key.startsWith("ADMISSION_MASTER") ||
        key.startsWith("ADMISSION_SPECIAL"),
    ),
  ).toBe(true);
});

/* ================================================================== *
 * 확률 산출 — 경계 · 단조성 · 자료 없음
 * ================================================================== */

// 14·15·16번 가감 전 조합(5×6×6=180). 한 조합만 보면 clamp 경계에서 단조성이 깨져도 안 보인다.
const DELTA_COMBOS: {
  csatMin: string;
  jonghapReady: string;
  interviewReady: string;
}[] = [];
Object.keys(CSAT_MIN_DELTA).forEach((csatMin) => {
  Object.keys(JONGHAP_DELTA).forEach((jonghapReady) => {
    Object.keys(INTERVIEW_DELTA).forEach((interviewReady) => {
      DELTA_COMBOS.push({ csatMin, jonghapReady, interviewReady });
    });
  });
});
test("가감 조합 전량(5×6×6)", () => {
  expect(DELTA_COMBOS.length).toEqual(180);
});

const producedProbabilities = new Set<number>();
let sweepViolations = 0;
DELTA_COMBOS.forEach((combo) => {
  const input = makeInput(combo);
  let previous = Infinity;
  for (let step = 100; step <= 600; step += 5) {
    const mine = roundHalfUp(step / 100, 2);
    const probability = successProbability(
      input,
      admissionBand(mine, probCuts),
      mine,
      probCuts,
    );
    producedProbabilities.add(probability);
    if (probability > previous) sweepViolations += 1;
    previous = probability;
  }
});
// 학생 화면에서 "내신이 더 나쁜데 합격 확률이 더 높다"가 나오면 이 리포트는 신뢰를 통째로 잃는다.
test("가감 180조합 × 내신 스윕 전량에서 확률 역전 0건", () => {
  expect(sweepViolations).toEqual(0);
});
test("산출 가능한 확률은 전부 5의 배수다(구간 라벨이 경계에 걸치지 않는다)", () => {
  expect([...producedProbabilities].every((value) => value % 5 === 0)).toBe(
    true,
  );
});
test("산출 가능한 확률은 전부 PROB_MIN~PROB_MAX 안이다", () => {
  expect(
    [...producedProbabilities].every(
      (value) => value >= PROB_MIN && value <= PROB_MAX,
    ),
  ).toBe(true);
});
test("산출 가능한 확률 전량에 구간 라벨이 있다(라벨 없는 값이 화면에 뜨지 않는다)", () => {
  expect(
    [...producedProbabilities].every(
      (value) => typeof probabilityRangeLabel(value) === "string",
    ),
  ).toBe(true);
});

// 구간 테이블 구조 — 최초 매치 방식이라 내림차순이 아니면 조용히 잘못된 라벨이 나간다.
test("PROB_RANGE_LABELS 는 min 내림차순", () => {
  expect(
    PROB_RANGE_LABELS.every(
      (entry, index) =>
        index === 0 ||
        (PROB_RANGE_LABELS[index - 1]?.min ?? Infinity) > entry.min,
    ),
  ).toBe(true);
});
test("마지막 구간의 하한은 0(0~PROB_MAX 전 구간을 덮는다)", () => {
  expect(PROB_RANGE_LABELS[PROB_RANGE_LABELS.length - 1]?.min).toEqual(0);
});
test("구간 라벨은 전부 유일", () => {
  expect(
    new Set(PROB_RANGE_LABELS.map((entry) => entry.label)).size ===
      PROB_RANGE_LABELS.length,
  ).toBe(true);
});
{
  let uncovered = 0;
  for (let value = 0; value <= PROB_MAX; value += 1) {
    if (typeof probabilityRangeLabel(value) !== "string") uncovered += 1;
  }
  test("0~PROB_MAX 전 정수에 라벨이 있다(테이블에 구멍 없음)", () => {
    expect(uncovered).toEqual(0);
  });
}
// 06_금지어 '결과 단정' — 산식이 아니라 명시 테이블이라 리팩터링으로도 되살아날 수 없어야 한다.
// '10~20%' 처럼 끝이 0 인 라벨은 정상이다 — 막아야 하는 것은 **0 에서 시작하는 구간**('0~10%')이다.
test("0 에서 시작하는 구간이 없다(불합격 단정 회피)", () => {
  expect(
    PROB_RANGE_LABELS.every((entry) => !/(?<!\d)0\s*~/.test(entry.label)),
  ).toBe(true);
});
// 인쇄 노출 여부를 한 줄로 되돌릴 수 있게 남긴 스위치. 값이 바뀌면 A4 2장에 %가 나가므로 pin 한다.
test("확률 노출 위치는 화면 전용(인쇄 A4 2장은 밴드 4글자 유지)", () => {
  expect(PROB_DISPLAY_MODE).toEqual("SCREEN_EXTRA");
});

// cuts 가 없으면 확률을 만들지 않는다 — 추정치를 지어내면 그 숫자로 진로를 정한다.
// diagnosisReport.extras.test.ts 의 admissionInput 과 동일한 픽스처(§7.4.3 F-확장 블록에서
// 정의된 것과 같은 값).
{
  const admissionInput = makeInput({
    gradeSystem: "NINE",
    scores: {
      naesinOverall: 2.6,
      recentExamAvg: null,
      mock: {},
      mockFilledCount: 0,
    },
    admissionQuery: {
      university: "건국대",
      department: "경영학과",
      admissionType: "종합",
      detailType: "일반전형",
    },
  });
  const noCuts = buildReport(admissionInput, {
    admissionMeta: { year: 2026 },
  }).admission;
  test("cuts 없음 → 확률·구간 라벨 둘 다 null", () => {
    expect([noCuts.probability, noCuts.probabilityRange]).toEqual([null, null]);
  });
  test("cuts 없음 → 인쇄 슬롯에도 % 가 없다", () => {
    expect(!String(noCuts.probabilityValue).includes("%")).toBe(true);
  });
  const half = buildReport(admissionInput, {
    cuts: { cut50: 2.5, cut70: null, finalAvg: null },
    admissionMeta: { year: 2026 },
  }).admission;
  test("컷 한쪽만 있어도 항등식으로 확률이 나온다", () => {
    expect(typeof half.probability === "number").toBe(true);
  });
}
