// diagnosisReport 조립 — §7.4.3 리포트 불변식 · 조립 문자열(토큰 누출·분기 커버리지).
// 원본: scripts/verify-diagnosis-scoring.mjs S13·S13b.

import { expect, test } from "vitest";
import {
  COMMON_COPY,
  COPY_FALLBACK,
  TEMPLATE_COPY,
  URGENCY_COPY,
} from "@/data/diagnosisCopy.ts";
import {
  AREA_CODES,
  AREA_LABEL,
  BADGES,
  LEVEL_LABEL,
  LIKERT1_KEYS,
  LIKERT2_KEYS,
  PAGE1_AREAS,
  PAGE2_AREAS,
  SERVICE_LABEL,
  STATE_LABEL,
} from "@/data/diagnosisScoringTable.ts";
import { findBannedPhrases } from "@/lib/diagnosisCopyBinding.ts";
import { buildReport, SELF_DECIDED } from "@/lib/diagnosisReport.ts";
import { convertToNineScale } from "@/lib/diagnosisScoring.ts";
import {
  makeInput,
  scoreAreasOf,
  sourceOf,
  unfilledTokens,
} from "./diagnosisScoringTestFixtures.ts";

/* ================================================================== *
 * S13. §7.4.3 리포트 불변식
 * ================================================================== */

test("AREA_CODES 12영역", () => {
  expect(AREA_CODES.length).toEqual(12);
});
test("PAGE1 6영역 (레이더 축 순서)", () => {
  expect(PAGE1_AREAS.length).toEqual(6);
});
test("PAGE2 6영역", () => {
  expect(PAGE2_AREAS.length).toEqual(6);
});
test("BADGES 6종", () => {
  expect(BADGES.length).toEqual(6);
});
test("LEVEL_LABEL 5단계", () => {
  expect(Object.keys(LEVEL_LABEL).length).toEqual(5);
});
test("STATE_LABEL 은 페이지별 4상태", () => {
  expect([
    Object.keys(STATE_LABEL.page1).length,
    Object.keys(STATE_LABEL.page2).length,
  ]).toEqual([4, 4]);
});
test("12영역 라벨이 전부 유일", () => {
  expect(new Set(Object.values(AREA_LABEL)).size === 12).toBe(true);
});
test("6서비스 라벨이 전부 유일", () => {
  expect(new Set(Object.values(SERVICE_LABEL)).size === 6).toBe(true);
});

// buildReport 는 파일 상단에서 정적 import 한다. 예전의 try/catch + 동적 import 는 "T16 이 아직
// 없을 수 있다"는 전제였는데, 그 catch 가 문법 오류·잘못된 import 경로까지 삼켜 §7.4.3 불변식을
// 통째로 건너뛴 채 PASS 를 냈다. 모듈이 깨지면 스크립트가 즉시 죽는 편이 낫다.
const report = buildReport(
  makeInput({ likert1: { LK1_01: 75, LK1_03: 50 }, obstacles: ["OBS_02"] }),
);
test("learningAxes 정확히 6", () => {
  expect(report?.learningAxes?.length ?? null).toEqual(6);
});
test("readiness.areas 정확히 6", () => {
  expect(report?.readiness?.areas?.length ?? null).toEqual(6);
});
test("summaryCards 정확히 3", () => {
  expect(report?.summaryCards?.length ?? null).toEqual(3);
});
test("traits 정확히 3", () => {
  expect(report?.traits?.length ?? null).toEqual(3);
});
test("summaryCards label 이 유일(React key)", () => {
  expect(new Set(report.summaryCards.map((c) => c.label)).size === 3).toBe(
    true,
  );
});

// Q-29 확정(2026-08-11) — PAGE1 6영역 전부 목표(75점) 이상이면 card_urgent 대신 card_goal_met
// 전용 키로 3번째 요약 카드의 제목·부제가 함께 바뀐다(자기모순 문장 방지). raw input 으로
// buildReport 를 통과시켜 diagnosisReport.js 조립 분기까지 실제로 맞는지 본다.
const goalMetReport = buildReport(
  makeInput({
    goal: {
      level: "BOTH",
      reason: null,
      targetUniversity: null,
      targetMajor: null,
    },
    likert1: Object.fromEntries(LIKERT1_KEYS.map((key) => [key, 100])),
    likert2: Object.fromEntries(LIKERT2_KEYS.map((key) => [key, 100])),
  }),
);
test("전 영역 목표 달성 → 3번째 요약 카드 제목 = card_goal_met.title", () => {
  expect(goalMetReport.summaryCards[2]?.label).toEqual(
    TEMPLATE_COPY["card_goal_met.title"],
  );
});
test("전 영역 목표 달성 → 3번째 요약 카드 부제 = card_goal_met.sub", () => {
  expect(goalMetReport.summaryCards[2]?.sub).toEqual(
    TEMPLATE_COPY["card_goal_met.sub"],
  );
});
test("goalMetReport summaryCards label 도 유일(React key)", () => {
  expect(
    new Set(goalMetReport.summaryCards.map((c) => c.label)).size === 3,
  ).toBe(true);
});
test("traits title 이 유일(React key)", () => {
  expect(new Set(report.traits.map((t) => t.title)).size === 3).toBe(true);
});
test("headlineLines 중복 없음(key={line})", () => {
  expect(
    new Set(report.headlineLines).size === report.headlineLines.length,
  ).toBe(true);
});
test("strengths·improvements·recommendations 는 배열", () => {
  expect(
    Array.isArray(report.strengths) &&
      Array.isArray(report.improvements) &&
      Array.isArray(report.recommendations),
  ).toBe(true);
});
test("강점 카드 3장 · 보완 카드 4장을 넘지 않는다", () => {
  expect(report.strengths.length <= 3 && report.improvements.length <= 4).toBe(
    true,
  );
});

// F-07(2026-08-12 확정, Q-07 종결) — 개수(3·4)는 시안(2967:8227~8229·8251~8254) 확정, 대상 범위
// (12영역 vs PAGE2 6영역)는 자체 결정으로 12영역 전체를 채택했다. STRENGTH_SCOPE/IMPROVEMENT_SCOPE
// 가 PAGE2_AREAS 로 되돌아가면 여기서 잡힌다.
{
  const reportSource = sourceOf("lib/diagnosisReport.ts");
  test("F-07 — 대상 범위는 12영역 전체(AREA_CODES), PAGE2 로 축소되지 않았다", () => {
    expect(
      /const STRENGTH_SCOPE = AREA_CODES/.test(reportSource) &&
        /const IMPROVEMENT_SCOPE = AREA_CODES/.test(reportSource),
    ).toBe(true);
  });
  test("F-07 — 강점 상한 3 · 보완 상한 4(시안 확정값)", () => {
    expect(
      /const STRENGTH_MAX = 3/.test(reportSource) &&
        /const IMPROVEMENT_MAX = 4/.test(reportSource),
    ).toBe(true);
  });
}
test("admission 5키 전부 존재 + rows 는 배열(AdmissionSection 이 무조건 구조분해한다)", () => {
  expect(
    report.admission != null &&
      [
        "probabilityLabel",
        "probabilityValue",
        "summary",
        "caption",
        "rows",
      ].every((key) => key in report.admission) &&
      Array.isArray(report.admission.rows),
  ).toBe(true);
});
// 엔진이 합성한 런타임 문자열도 금지어 검사 대상이다(§5.3 ④).
test("조립 문자열 금지어 위반 0건", () => {
  expect(findBannedPhrases(report).map((hit) => hit.phrase)).toEqual([]);
});

// §4.4(E) 긴급도 — 엔진에는 있는데 리포트에 실리지 않아 URGENCY_COPY 4문구가 통째로 죽어 있었다.
// 렌더 슬롯은 아직 없지만(각 함수 TODO) ReportData 에는 반드시 실려야 다음 단계에서 배선만 하면 된다.
test("urgency 블록이 실린다(level·score·message)", () => {
  expect(
    report.urgency != null &&
      ["L1", "L2", "L3", "L4"].includes(report.urgency.level) &&
      Number.isFinite(report.urgency.score) &&
      typeof report.urgency.message === "string",
  ).toBe(true);
});
test("urgency.message = URGENCY_COPY[level]", () => {
  expect(report.urgency.message).toEqual(URGENCY_COPY[report.urgency.level]);
});

// §5.1 '조건 없음, 항상' 6종 고정 안내가 조립된다. 누락(=문구가 죽는다)과 보류(=조건 미충족)를
// 구분하기 위해 항상 노출 항목만 문자열을 요구하고 조건부 항목은 키 존재만 본다.
[
  "traitIntro",
  "hexCaption",
  "goalCompare",
  "reportBasis",
  "reportLimit",
  "probNote",
  "admissionNote",
].forEach((key) => {
  test(`notices.${key} 가 문구집 원문으로 채워진다`, () => {
    expect(typeof report.notices?.[key] === "string").toBe(true);
  });
});
test("notices 에 조건부 키(serviceLimit·skipNote)가 존재한다", () => {
  expect(
    report.notices != null &&
      "serviceLimit" in report.notices &&
      "skipNote" in report.notices,
  ).toBe(true);
});
test("M3 가 아니면 serviceLimit 은 null(확신 후보가 있을 때)", () => {
  // 2026-08-21 — serviceLimit 은 이제 M3/H3_LATE 외에도 '확신 후보 0개'(전 서비스
  // fit<50) 사유로 채워질 수 있다. 공용 report 픽스처(obstacles 1개뿐)는 그 조건에
  // 우연히 걸릴 수 있어, 확신 후보가 확실히 있는 입력으로 별도 검증한다.
  const confidentReport = buildReport(
    makeInput({ obstacles: ["OBS_01", "OBS_02", "OBS_03"], wishes: ["WISH_02"] }),
  );
  expect(confidentReport.notices.serviceLimit).toEqual(null);
});
test("M3 면 SVC_M3_LIMIT 안내가 붙는다", () => {
  expect(
    buildReport(
      makeInput({
        profile: { name: null, gradeLevel: "M3", schoolType: null },
      }),
    ).notices.serviceLimit,
  ).toEqual(COMMON_COPY.SVC_M3_LIMIT);
});

/* ------------------------------------------------------------------ *
 * S13b. 조립 문자열 — 토큰 누출 · 분기 커버리지
 * 개수 불변식만 보던 구간이라, 문자열을 만드는 경로(cut_labels/diff_*, formatGpa 4분기,
 * page2_summary 폴백, 서비스 카드)에 단언이 하나도 없었다.
 * ------------------------------------------------------------------ */

const CUTS_VARIANTS: [
  string,
  {
    cut50: number | null;
    cut70: number | null;
    finalAvg: number | null;
  } | null,
][] = [
  ["입결 미연결", null],
  ["cut50·cut70 둘 다", { cut50: 2.5, cut70: 3.0, finalAvg: 2.8 }],
  ["cut70 단독", { cut50: null, cut70: 2.56, finalAvg: null }],
  ["cut50 단독(Q-28)", { cut50: 2.5, cut70: null, finalAvg: null }],
];
const GRADE_SYSTEMS = ["NINE", "FIVE", "MIDDLE_AVG", "UNKNOWN"];

CUTS_VARIANTS.forEach(([cutsLabel, cuts]) => {
  GRADE_SYSTEMS.forEach((system) => {
    const variant = buildReport(
      makeInput({
        gradeSystem: system,
        scores: {
          naesinOverall: system === "MIDDLE_AVG" ? 88.5 : 3.24,
          recentExamAvg: null,
          mock: {},
          mockFilledCount: 0,
        },
        obstacles: ["OBS_01", "OBS_02", "OBS_03"],
        difficulties: ["DIF_10"],
        wishes: ["WISH_07"],
        admissionQuery: {
          university: "위닝대",
          department: "학과",
          admissionType: "교과",
          detailType: "일반",
        },
      }),
      { cuts, admissionMeta: { year: 2026 } },
    );
    const label = `${cutsLabel} × ${system}`;
    test(`[${label}] 미치환 토큰 0건`, () => {
      expect(unfilledTokens(variant).length === 0).toBe(true);
    });
    test(`[${label}] 금지어 0건`, () => {
      expect(findBannedPhrases(variant).length === 0).toBe(true);
    });
    test(`[${label}] admission.rows 는 4행 이하`, () => {
      expect(variant.admission.rows.length <= 4).toBe(true);
    });
    test(`[${label}] 노출 슬롯이 비지 않는다`, () => {
      expect(
        typeof variant.admission.probabilityLabel === "string" &&
          variant.admission.probabilityLabel !== "" &&
          typeof variant.admission.probabilityValue === "string" &&
          variant.admission.probabilityValue !== "" &&
          typeof variant.readiness.scoreLabel === "string",
      ).toBe(true);
    });
  });
});

// formatGpa 4분기 — 원값 표기이며 9등급 환산값이 아니다(§7.2). 중학생 88.5점이 '2.75등급'이 되면 안 된다.
const gpaOf = (system, raw) =>
  buildReport(
    makeInput({
      gradeSystem: system,
      scores: {
        naesinOverall: raw,
        recentExamAvg: null,
        mock: {},
        mockFilledCount: 0,
      },
    }),
  ).student.gpa;
test("gpa NINE", () => {
  expect(gpaOf("NINE", 3.2)).toEqual("3.20등급(9등급제)");
});
test("gpa FIVE", () => {
  expect(gpaOf("FIVE", 2.5)).toEqual("2.50등급(5등급제)");
});
test("gpa MIDDLE_AVG 는 점수 원값", () => {
  expect(gpaOf("MIDDLE_AVG", 88.5)).toEqual("88.5점");
});
// F-12 확정(2026-08-11) — UNKNOWN 은 입력 마스크가 NINE 과 동일 규격(1~9·소수 2자리)이라 값 자체는
// 이미 등급 형태다. '미입력'으로 지우면 학생은 자기 입력이 무시됐다고 읽는다. 표시만 살리고
// 계산(convertToNineScale)에는 넣지 않는다 — 아래 두 단언이 그 분리를 코드로 못박는다.
test("gpa UNKNOWN 은 값을 보이되 체계 미확인을 함께 밝힌다", () => {
  expect(gpaOf("UNKNOWN", 3.24)).toEqual(
    `3.24${SELF_DECIDED.GPA_UNKNOWN_SUFFIX}`,
  );
});
// 결정문은 "NINE 과 동일하게 12자"라고 적었으나 공백을 세지 않은 오산이다(실제 14자). 값 칸
// 제약은 글자 수가 아니라 렌더 폭이므로 실측으로 대신했다 — Pretendard Variable 500 16px 기준
// '3.24등급(체계 미확인)' = 145.4px, 칸 폭 12.5rem(200px) 안에서 1줄(높이 20px). NINE 은 123.8px.
// 여유 54.6px 안에서만 접미사를 바꿀 수 있다(2줄로 접히면 정보 행이 밀린다).
test("gpa UNKNOWN 표기가 값 칸 1줄 폭 안에 든다(실측 145.4px ≤ 200px 대리 상한)", () => {
  expect(gpaOf("UNKNOWN", 3.24).length <= 14).toEqual(true);
});
test("UNKNOWN 은 여전히 9등급 환산 대상이 아니다(입결 비교 오염 방지)", () => {
  expect(convertToNineScale("UNKNOWN", 3.24)).toEqual(null);
});
test("gpa 결측", () => {
  expect(gpaOf("NINE", null)).toEqual(COPY_FALLBACK.VALUE_MISSING);
});

// page2_summary 동점 가드 — 코드 동일성(highCode === lowCode)으로 구현하면 원소가 6개라 절대
// 성립하지 않아, 전 영역 동점 응답에서 두 영역을 우열로 서술하는 문장이 렌더된다.
// SUBJECT 만 base 20 이라 모의고사 6칸(aux 10)을 채워야 나머지 base 30 과 같은 점수가 된다.
const tiedInput = makeInput({
  likert2: Object.fromEntries(LIKERT2_KEYS.map((key) => [key, 100])),
  scores: {
    naesinOverall: null,
    recentExamAvg: null,
    mock: {},
    mockFilledCount: 6,
  },
});
const tiedAreas = scoreAreasOf(tiedInput);
test("픽스처 전제: PAGE2 6영역이 실제로 동점", () => {
  expect(new Set(PAGE2_AREAS.map((a) => tiedAreas[a])).size === 1).toBe(true);
});
const tiedHigh = buildReport(tiedInput);
test("PAGE2 전 영역 동점이면 우열 서술을 쓰지 않는다", () => {
  expect(
    tiedHigh.readiness.summaryLines.every(
      (line) => !line.includes("안정적으로 관리되고 있으나"),
    ),
  ).toBe(true);
});
test("동점이면 종합 등급 문구 1줄", () => {
  expect(tiedHigh.readiness.summaryLines.length).toEqual(1);
});
// 동점이 아니고 최고점이 TOP/MID 면 원래의 대비 문장을 그대로 쓴다(가드가 과잉 차단하지 않는다).
const contrastLines = buildReport(
  makeInput({
    likert2: Object.fromEntries(
      LIKERT2_KEYS.map((key) => [
        key,
        key === "LK2_11" || key === "LK2_12" ? 0 : 100,
      ]),
    ),
  }),
).readiness.summaryLines;
test("격차가 있으면 page2_summary 대비 문장을 쓴다", () => {
  expect(
    contrastLines.some((line) => line.includes("안정적으로 관리되고 있으나")),
  ).toBe(true);
});

// 추천 카드 — SERVICE_COPY 조회 실패 시 폴백이 SVC_RANK2_PREFIX 원문을 쓰면 '{영역}' 이 샌다.
const recommended = buildReport(
  makeInput({
    obstacles: ["OBS_01", "OBS_02", "OBS_03"],
    difficulties: ["DIF_10"],
    wishes: ["WISH_02", "WISH_07"],
  }),
);
test("추천 카드가 1장 이상", () => {
  expect(recommended.recommendations.length >= 1).toBe(true);
});
test("추천 카드 desc 에 미치환 토큰이 없다", () => {
  expect(
    recommended.recommendations.every(
      (card) => !/\{(\w+|영역)\}/.test(card.desc),
    ),
  ).toBe(true);
});
test("추천 카드 chips 는 4개(문구집 태그 세트)", () => {
  expect(
    recommended.recommendations.every(
      (card) => card.chips.length === 4 || card.chips.length === 0,
    ),
  ).toBe(true);
});
// 전 서비스 fit < 50(확신 후보 0개)이어도 카드는 항상 2장이다(2026-08-21 사용자 확정,
// 안B) — SVC_NONE 안내 카드 1장짜리 폴백은 폐기했다. 대신 리드 문구(notices.serviceLimit)
// 에 같은 SVC_NONE 원문을 얹어 "억지 추천처럼 보이는" 리스크를 완충한다.
const noService = buildReport(
  makeInput({
    likert1: Object.fromEntries(LIKERT1_KEYS.map((k) => [k, 100])),
    likert2: Object.fromEntries(LIKERT2_KEYS.map((k) => [k, 100])),
  }),
);
test("추천 대상이 없어도 카드는 항상 2장", () => {
  expect(noService.recommendations.length).toEqual(2);
});
test("확신 후보가 없으면 리드 문구가 SVC_NONE", () => {
  expect(noService.notices.serviceLimit).toEqual(COMMON_COPY.SVC_NONE);
});
test("확신 후보가 없어도 카드 2장은 실제 서비스명을 갖는다(빈 카드 아님)", () => {
  expect(
    noService.recommendations.every((card) => card.rank && card.name),
  ).toBe(true);
});
