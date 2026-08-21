// diagnosisReport 조립 — 화면 전용 확장 슬롯 · 실패 상태 전파
// (F-01·F-02·F-04·F-05·F-06·F-09·F-10·F-12·F-14·F-15·F-18·F-19·F-22) · 성적 흐름 축약 6종 ·
// UNKNOWN 등급체계 gpa 표기 경계.
// 원본: scripts/verify-diagnosis-scoring.mjs S13c·[F-확장] · 성적 흐름/등급 표기 블록 후반부.

import { expect, test } from "vitest";
import {
  ADMISSION_BAND_LABEL,
  BANNED_PHRASES,
  COMMON_COPY,
  COPY_FALLBACK,
  TEMPLATE_COPY,
} from "@/data/diagnosisCopy.ts";
import {
  LIKERT1_KEYS,
  LIKERT2_KEYS,
  PROB_RANGE_LABELS,
  STATE_LABEL,
  URGENCY_AREA_THRESHOLD,
  URGENCY_LEVEL_LABEL,
} from "@/data/diagnosisScoringTable.ts";
import { renewalSurveyQuestions } from "@/data/renewalSurveyQuestions.ts";
import { findBannedPhrases } from "@/lib/diagnosisCopyBinding.ts";
import { buildReport, SELF_DECIDED } from "@/lib/diagnosisReport.ts";
import {
  convertToNineScale,
  probabilityRangeLabel,
} from "@/lib/diagnosisScoring.ts";
import { makeInput, unfilledTokens } from "./diagnosisScoringTestFixtures.ts";

/* ------------------------------------------------------------------ *
 * S13c. 화면 전용 확장 슬롯 · 실패 상태 전파 (F-01·F-04·F-06·F-09·F-10·F-12·F-14·F-15·F-18·F-19·F-22)
 * 리포트 조립 계층이 새로 싣는 키들. "슬롯이 없어 죽어 있던 문구"가 되살아났는지, 그리고
 * 인쇄(A4 2장) 슬롯이 여전히 밴드 4글자인지를 함께 본다 — 후자를 놓치면 점추정 %가 종이에 찍힌다.
 * ------------------------------------------------------------------ */

const CUTS_FIT = { cut50: 2.5, cut70: 2.8, finalAvg: null };
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
const admitted = buildReport(admissionInput, {
  cuts: CUTS_FIT,
  admissionMeta: { year: 2026 },
}).admission;

// F-01 — 인쇄 슬롯(probabilityValue)은 밴드 4글자를 유지하고, 구간 라벨은 별도 키로만 나간다.
test("인쇄 확률 슬롯은 밴드 4글자다(점추정 % 아님)", () => {
  expect(admitted.probabilityValue).toEqual(ADMISSION_BAND_LABEL.FIT);
});
test("probabilityValue 에 % 가 섞이지 않는다", () => {
  expect(!admitted.probabilityValue.includes("%")).toBe(true);
});
test("화면 전용 구간 라벨", () => {
  expect(admitted.probabilityRange).toEqual(
    probabilityRangeLabel(admitted.probability),
  );
});
test("구간 라벨 제목 = 06_금지어 대체 표현 원문", () => {
  expect(admitted.probabilityRangeLabel).toEqual(
    SELF_DECIDED.PROB_RANGE_HEADING,
  );
});
test("참고 결과 배지 = 06_금지어 대체 표현 원문", () => {
  expect(admitted.probabilityBadge).toEqual(SELF_DECIDED.PROB_REFERENCE_BADGE);
});
test("확률이 있으면 PROB_NOTE 가 함께 실린다(F-05 probNote 부활)", () => {
  expect(admitted.probNote).toEqual(COMMON_COPY.PROB_NOTE);
});
// 자체 결정 2종은 문구집 06 시트 '결과 단정' 행의 대체 표현 열 원문이어야 한다 — 신규 발주가
// 아니라는 근거가 이 단언이다. 문구집이 바뀌면 여기서 FAIL 로 드러난다.
{
  const alternatives =
    BANNED_PHRASES.find((group) => group.type === "결과 단정")?.alternatives ??
    [];
  test("확률 라벨·배지가 06_금지어 대체 표현 열에 실재한다", () => {
    expect(
      alternatives.includes(SELF_DECIDED.PROB_RANGE_HEADING) &&
        alternatives.includes(SELF_DECIDED.PROB_REFERENCE_BADGE),
    ).toBe(true);
  });
}
// 산식이 아니라 명시 테이블이라 '100%'·'0%' 가 구조적으로 등장할 수 없다.
test("구간 라벨 전량에 100 이 없다(06_금지어 결과 단정)", () => {
  expect(PROB_RANGE_LABELS.every((entry) => !entry.label.includes("100"))).toBe(
    true,
  );
});

// F-19 — 캡션의 전형 유형만 확장형으로 바뀐다. 조회 키('종합')는 그대로다.
test("캡션 전형 유형이 확장형으로 표기된다", () => {
  expect(admitted.caption?.includes("학생부종합")).toBe(true);
});
test("조회 키는 매핑을 거치지 않는다(입력 원값 보존)", () => {
  expect(
    (admissionInput as unknown as { admissionQuery: { admissionType: string } })
      .admissionQuery.admissionType,
  ).toEqual("종합");
});
test("매핑 없는 전형 유형은 원값 통과", () => {
  const display = SELF_DECIDED.ADMISSION_TYPE_DISPLAY as Record<string, string>;
  expect(display.논술 ?? "논술").toEqual("논술");
});

// F-09 · F-10 — 최종등록자 평균 행은 영구 미렌더, 0행이면 컴포넌트가 박스를 숨긴다.
test("입결 표에 avg(최종등록자 평균) 행이 없다", () => {
  expect(
    admitted.rows.every((row) => row.label !== TEMPLATE_COPY["cut_labels.avg"]),
  ).toBe(true);
});
test("렌더 행은 최대 3행(cut50/cut70/mine)", () => {
  expect(admitted.rows.length <= 3).toBe(true);
});
test("표가 있으면 최종등록자 평균 제외 캡션이 붙는다", () => {
  expect(admitted.finalAvgNote).toEqual(
    SELF_DECIDED.ADMISSION_FINAL_AVG_OMITTED,
  );
});
{
  const emptyTable = buildReport(makeInput({})).admission;
  test("컷도 내 등급도 없으면 0행", () => {
    expect(emptyTable.rows.length).toEqual(0);
  });
  test("0행이면 hasRows=false (컴포넌트가 빈 박스를 숨긴다)", () => {
    expect(emptyTable.hasRows).toEqual(false);
  });
  test("0행이면 최종등록자 평균 캡션도 붙지 않는다", () => {
    expect(emptyTable.finalAvgNote).toEqual(null);
  });
  test("확률이 없으면 배지·고지도 붙지 않는다", () => {
    expect([emptyTable.probabilityBadge, emptyTable.probNote]).toEqual([
      null,
      null,
    ]);
  });
}

// G-1b(2026-08-12) 회귀 방지 — F-10 원증상 재현: 목표 학과가 43,170행 마스터 커버리지 밖이라
// 컷이 진짜로 없는(조회 실패가 아닌) 경우. mine 은 있는데 cuts 는 없다 — 종전엔 이 조합에서도
// hasRows=true 로 잘못 판정해 헤더 + 자기 성적 1행짜리 빈 비교표가 그려졌다.
{
  const noMasterCoverage = buildReport(admissionInput, {
    cuts: null,
  }).admission;
  test("mine 은 있고 cuts 만 없으면 mine 행 1개", () => {
    expect(noMasterCoverage.rows.length).toEqual(1);
  });
  test("비교 대상(컷)이 없으면 hasRows=false(F-10 재발 방지)", () => {
    expect(noMasterCoverage.hasRows).toEqual(false);
  });
  test("요약은 BAND_NODATA(자료 영구 부재, 조회 실패 아님)", () => {
    expect(noMasterCoverage.summary).toEqual(COMMON_COPY.BAND_NODATA);
  });
}

// G-1c(2026-08-12) — 5등급제·중학생 평균 학생은 mine 행 라벨에 '9등급 환산' 사실을 명시한다.
// 학생정보 블록엔 원값('3.00등급(5등급제)')이, 입결표엔 환산값('4.78등급')이 뜨는데 접미어가
// 없으면 같은 이름의 값이 다른 숫자로 두 번 보여 오류로 오인될 수 있었다(WARN G-1c 실측).
{
  const fiveInput = makeInput({
    gradeSystem: "FIVE",
    scores: {
      naesinOverall: 3.0,
      recentExamAvg: null,
      mock: {},
      mockFilledCount: 0,
    },
    admissionQuery: admissionInput.admissionQuery,
  });
  const fiveAdmitted = buildReport(fiveInput, {
    cuts: CUTS_FIT,
    admissionMeta: { year: 2026 },
  }).admission;
  const fiveMineRow = fiveAdmitted.rows.find((row) => row.emphasis);
  test("5등급제 mine 행 라벨에 환산 접미어가 붙는다", () => {
    expect(
      Boolean(
        fiveMineRow?.label?.endsWith(
          SELF_DECIDED.ADMISSION_MINE_CONVERTED_SUFFIX,
        ),
      ),
    ).toBe(true);
  });
  const nineMineRow = admitted.rows.find((row) => row.emphasis);
  test("9등급제는 접미어를 붙이지 않는다(원값=환산값이라 표기 불필요)", () => {
    expect(
      Boolean(nineMineRow) &&
        !nineMineRow?.label?.includes(
          SELF_DECIDED.ADMISSION_MINE_CONVERTED_SUFFIX,
        ),
    ).toBe(true);
  });
}

// F-22 — 조회 실패는 '자료 없음'과 다른 문장을 낸다. 이 하나가 영구 부재와 일시 오류를 가른다.
{
  const failed = buildReport(makeInput({}), {
    cuts: null,
    cutsError: true,
  }).admission;
  test("조회 실패 요약 = ADMISSION_FETCH_FAIL", () => {
    expect(failed.summary).toEqual(COMMON_COPY.ADMISSION_FETCH_FAIL);
  });
  test("조회 실패 플래그가 전파된다", () => {
    expect(failed.fetchFailed).toEqual(true);
  });
  const missing = buildReport(makeInput({}), { cuts: null }).admission;
  test("자료 없음 요약은 그대로 BAND_NODATA", () => {
    expect(missing.summary).toEqual(COMMON_COPY.BAND_NODATA);
  });
  test("자료 없음은 실패가 아니다", () => {
    expect(missing.fetchFailed).toEqual(false);
  });
  test("두 문장이 서로 다르다(구분이 실제로 생겼다)", () => {
    expect(failed.summary !== missing.summary).toBe(true);
  });
}

// F-14 — 성적 흐름 축약 라벨. 6종 전량이 q8 코드와 1:1 이고, 미매핑 코드는 원문으로 폴백한다.
{
  const q8 = renewalSurveyQuestions.find((question) => question.id === "q8")!;
  const q8Codes = q8.optionCodes!;
  const q8Options = q8.options!;
  test("축약 라벨이 q8 선택지 코드와 1:1", () => {
    expect(Object.keys(SELF_DECIDED.GRADE_TREND_SHORT_LABEL).sort()).toEqual(
      [...q8Codes].sort(),
    );
  });
  test("축약 라벨이 전부 유일(두 흐름이 같은 라벨로 무너지지 않는다)", () => {
    expect(
      new Set(Object.values(SELF_DECIDED.GRADE_TREND_SHORT_LABEL)).size === 6,
    ).toBe(true);
  });
  test("축약 라벨이 전부 원문보다 짧다", () => {
    expect(
      q8Codes.every(
        (code, index) =>
          SELF_DECIDED.GRADE_TREND_SHORT_LABEL[code].length <
          (q8Options[index]?.length ?? 0),
      ),
    ).toBe(true);
  });
  test("FLAT 은 시안 인용 그대로", () => {
    expect(SELF_DECIDED.GRADE_TREND_SHORT_LABEL.FLAT).toEqual("정체");
  });
  test("리포트에 축약 라벨이 실린다", () => {
    expect(
      buildReport(makeInput({ gradeTrend: "UP_MOST" })).student.gradeTrend,
    ).toEqual("대부분 상승");
  });
  // (이 줄은 매핑된 경로다 — 진짜 미매핑 코드의 폴백은 [F-격리] 섹션에서 검사한다.)
  test("시안 인용 라벨이 리포트에도 그대로 실린다", () => {
    expect(
      buildReport(makeInput({ gradeTrend: "FLAT" })).student.gradeTrend,
    ).toEqual("정체");
  });
}

// F-04 — 죽어 있던 108문구(levels 60 · strategies 48)가 실제로 실린다.
{
  const extras = buildReport(makeInput({ likert1: { LK1_01: 75 } }));
  test("areaDetails 는 6+6 행", () => {
    expect([
      extras.areaDetails.page1.length,
      extras.areaDetails.page2.length,
    ]).toEqual([6, 6]);
  });
  test("areaDetails 12행 전부 문구가 채워진다", () => {
    expect(
      [...extras.areaDetails.page1, ...extras.areaDetails.page2].every(
        (row) => typeof row.detail === "string" && row.detail !== "",
      ),
    ).toBe(true);
  });
  test("areaDetails 는 점수 오름차순(학생이 본 순서와 같다)", () => {
    expect(
      extras.areaDetails.page1.every(
        (row, index, rows) =>
          index === 0 || (rows[index - 1]?.score ?? -Infinity) <= row.score,
      ),
    ).toBe(true);
  });
  test("page1·page2 상태 어휘가 각자 축을 쓴다", () => {
    expect(
      extras.areaDetails.page1.every((row) =>
        Object.values(STATE_LABEL.page1).includes(row.status),
      ) &&
        extras.areaDetails.page2.every((row) =>
          Object.values(STATE_LABEL.page2).includes(row.status),
        ),
    ).toBe(true);
  });
  test("strategyGroups 12묶음", () => {
    expect(extras.strategyGroups.length).toEqual(12);
  });
  test("각 묶음 4항목", () => {
    expect(
      extras.strategyGroups.every((group) => group.items.length === 4),
    ).toBe(true);
  });
  test("strategyGroups 도 점수 오름차순", () => {
    expect(
      extras.strategyGroups.every(
        (group, index, groups) =>
          index === 0 || (groups[index - 1]?.score ?? -Infinity) <= group.score,
      ),
    ).toBe(true);
  });
  // '필요한 것'(need)과 '맞춤 전략'(strategies)은 문구집 02 시트의 다른 구분이다 — 같은 문자열이
  // 두 슬롯에 나오면 학생 눈에는 중복 노출이 된다.
  const needTexts = new Set(extras.learningAxes.map((axis) => axis.need));
  test('맞춤 전략이 우선순위 표의 "필요한 것"과 겹치지 않는다', () => {
    expect(
      extras.strategyGroups.every((group) =>
        group.items.every((item) => !needTexts.has(item)),
      ),
    ).toBe(true);
  });
}

// F-05 — 긴급도 상세. 라벨은 배점표 141행 원문이고 score 는 화면에 쓰지 않는다.
{
  const urgency = buildReport(makeInput({})).urgency;
  test("urgency.levelLabel = 배점표 원문 라벨", () => {
    expect(urgency.levelLabel).toEqual(URGENCY_LEVEL_LABEL[urgency.level]);
  });
  test("urgency.areaThreshold 가 함께 실린다(UI 가 리터럴 40 을 갖지 않게)", () => {
    expect(urgency.areaThreshold).toEqual(URGENCY_AREA_THRESHOLD);
  });
  test("urgency.score 는 계속 실린다(어드민 전용 — 화면 미표시가 결정)", () => {
    expect(Number.isFinite(urgency.score)).toBe(true);
  });
}

// F-15 — 성실도. flagged=false 경로에 부작용이 없어야 한다(기존 화면 회귀 0).
{
  const flat = Object.fromEntries(LIKERT1_KEYS.map((key) => [key, 50]));
  const flagged = buildReport(
    makeInput({
      likert1: flat,
      likert2: Object.fromEntries(LIKERT2_KEYS.map((key) => [key, 50])),
    }),
  );
  test("직선 응답이면 헤드라인이 SINCERITY_HEAD 로 치환된다", () => {
    // SINCERITY_HEAD 는 확정 분리 지점(\n)을 가진다(diagnosisCopy 주석, 2026-08-21) —
    // buildHeadlineLines 가 그 기준으로 라인 배열을 만들므로 split 결과와 비교한다.
    expect(flagged.headlineLines).toEqual(
      COMMON_COPY.SINCERITY_HEAD.split("\n"),
    );
  });
  test("헤드라인은 추가가 아니라 치환이다(유형·등급 문구 미포함)", () => {
    // 종전 단언은 '줄 수 1'이었으나 \n 분할 도입으로 줄 수는 문구 소유가 됐다 —
    // 치환 불변식의 본질(유형/등급 헤드라인이 함께 나오지 않는다)만 남긴다.
    expect(flagged.headlineLines.join("")).toEqual(
      COMMON_COPY.SINCERITY_HEAD.replace(/\n/g, ""),
    );
  });
  test("특성 도입부도 치환된다", () => {
    expect(flagged.notices.traitIntro).toEqual(COMMON_COPY.SINCERITY_TRAIT);
  });
  test("화면 전용 배너가 붙는다", () => {
    expect(flagged.notices.sincerityBanner).toEqual(
      COMMON_COPY.SINCERITY_BANNER,
    );
  });
  test("과제 도입부가 붙는다", () => {
    expect(flagged.notices.sincerityAct).toEqual(COMMON_COPY.SINCERITY_ACT);
  });
  test("유형 판정은 보류된다", () => {
    expect(flagged.studentType).toEqual(null);
  });
  test("점수는 무효화하지 않는다(영역 12개 그대로 산출)", () => {
    expect(
      flagged.areaDetails.page1.length === 6 &&
        flagged.areaDetails.page2.length === 6,
    ).toBe(true);
  });

  const normal = buildReport(
    makeInput({ likert1: { LK1_01: 75, LK1_03: 50 } }),
  );
  test("평상시엔 TRAIT_INTRO 그대로", () => {
    expect(normal.notices.traitIntro).toEqual(COMMON_COPY.TRAIT_INTRO);
  });
  test("평상시엔 배너 없음", () => {
    expect([
      normal.notices.sincerityBanner,
      normal.notices.sincerityAct,
    ]).toEqual([null, null]);
  });
  test("평상시엔 flagged=false", () => {
    expect(normal.sincerity.flagged).toEqual(false);
  });
}

// F-06 — 서비스 제한 안내는 학년 리터럴이 아니라 엔진 filterReason 을 따른다.
{
  const h3Late = buildReport(
    makeInput({
      profile: { name: null, gradeLevel: "H3", schoolType: null },
      meta: { schemaVersion: "test", diagnosedAt: "2026-07-01T00:00:00.000Z" },
    }),
  );
  test("고3 6월 이후 진단이면 filterReason=H3_LATE", () => {
    expect(h3Late.serviceFilterReason).toEqual("H3_LATE");
  });
  test("그때만 붙는 자체 결정 안내", () => {
    expect(h3Late.notices.serviceLimit).toEqual(
      SELF_DECIDED.SERVICE_H3_LATE_NOTICE,
    );
  });
  // obstacles·wishes(2026-08-21 추가) — serviceLimit 은 이제 H3_LATE 외에도 '확신 후보
  // 0개' 사유로 채워질 수 있다. 이 테스트의 의도(H3_LATE 가 아니면 제한하지 않는다)를
  // 지키려면 확신 후보가 확실히 있는 입력이어야 한다(GOAL_CARE fit=95.5, 다른 F-06
  // 테스트가 이미 검증한 조합 재사용).
  const h3Early = buildReport(
    makeInput({
      profile: { name: null, gradeLevel: "H3", schoolType: null },
      meta: { schemaVersion: "test", diagnosedAt: "2026-03-01T00:00:00.000Z" },
      obstacles: ["OBS_01", "OBS_02", "OBS_03"],
      wishes: ["WISH_02"],
    }),
  );
  test("고3 1~5월은 제한하지 않는다", () => {
    expect([h3Early.serviceFilterReason, h3Early.notices.serviceLimit]).toEqual(
      [null, null],
    );
  });
  const h3Unknown = buildReport(
    makeInput({ profile: { name: null, gradeLevel: "H3", schoolType: null } }),
  );
  test("시각 불명이면 fail-open(선택지를 줄이지 않는다)", () => {
    expect(h3Unknown.serviceFilterReason).toEqual(null);
  });
  test("M3 안내는 문구집 원문 그대로 유지", () => {
    expect(
      buildReport(
        makeInput({
          profile: { name: null, gradeLevel: "M3", schoolType: null },
        }),
      ).notices.serviceLimit,
    ).toEqual(COMMON_COPY.SVC_M3_LIMIT);
  });
}

// F-18 — 픽스처 폴백 구분 플래그. buildReport 를 통과한 데이터는 정의상 실제 응답이다.
test("buildReport 결과는 항상 isSample=false", () => {
  expect(buildReport(makeInput({})).isSample).toEqual(false);
});

// 확장 키가 늘어난 만큼 금지어·토큰 누출 검사도 다시 한 번 전량에 건다.
test("확장 키 포함 금지어 0건", () => {
  expect(
    findBannedPhrases(
      buildReport(admissionInput, {
        cuts: CUTS_FIT,
        admissionMeta: { year: 2026 },
      }),
    ).map((hit) => hit.phrase),
  ).toEqual([]);
});
test("확장 키 포함 미치환 토큰 0건", () => {
  expect(
    unfilledTokens(
      buildReport(admissionInput, {
        cuts: CUTS_FIT,
        admissionMeta: { year: 2026 },
      }),
    ).length === 0,
  ).toBe(true);
});

// 성적 흐름 축약 6종 전량이 실제로 리포트까지 도달하는지. 값은 상수에서 읽는다(확정 시 상수만 교체).
{
  const q8Codes = renewalSurveyQuestions.find(
    (question) => question.id === "q8",
  )!.optionCodes!;
  const rendered = q8Codes.map(
    (code) => buildReport(makeInput({ gradeTrend: code })).student.gradeTrend,
  );
  test("성적 흐름 6종 전량이 축약 라벨로 렌더된다", () => {
    expect(rendered).toEqual(
      q8Codes.map((code) => SELF_DECIDED.GRADE_TREND_SHORT_LABEL[code]),
    );
  });
  test("6종 전부 미입력 폴백으로 새지 않는다", () => {
    expect(
      rendered.every((label) => label !== COPY_FALLBACK.VALUE_MISSING),
    ).toBe(true);
  });
  // 진짜 미매핑 코드(선택지가 늘어난 상황) — 빈 칸이 아니라 안전 폴백으로 떨어져야 한다.
  test("매핑에 없는 코드는 빈 칸이 아니라 폴백", () => {
    expect(
      buildReport(makeInput({ gradeTrend: "UNKNOWN_TREND" })).student
        .gradeTrend,
    ).toEqual(COPY_FALLBACK.VALUE_MISSING);
  });
}

// F-12 — 표시만 살리고 계산에는 넣지 않는다. 아래 두 단언이 한 쌍으로 그 경계를 지킨다.
{
  const unknownGpa = buildReport(
    makeInput({
      gradeSystem: "UNKNOWN",
      scores: {
        naesinOverall: 2.6,
        recentExamAvg: null,
        mock: {},
        mockFilledCount: 0,
      },
    }),
  ).student.gpa;
  test("UNKNOWN 내신은 더 이상 미입력으로 뜨지 않는다", () => {
    expect(unknownGpa !== COPY_FALLBACK.VALUE_MISSING).toBe(true);
  });
  test("UNKNOWN 표기에 입력값이 그대로 보인다", () => {
    expect(unknownGpa.startsWith("2.60")).toBe(true);
  });
  test("UNKNOWN 표기가 체계 미확인임을 밝힌다", () => {
    expect(unknownGpa.endsWith(SELF_DECIDED.GPA_UNKNOWN_SUFFIX)).toBe(true);
  });
  // 여기를 함께 열면 체계 미상 값이 9등급 컷과 직접 비교되어 밴드·확률이 통째로 오염된다.
  test("그래도 9등급 환산은 여전히 null(입결 비교 오염 금지)", () => {
    expect(convertToNineScale("UNKNOWN", 2.6)).toEqual(null);
  });
  test("UNKNOWN 은 밴드를 만들지 않는다", () => {
    expect(
      buildReport(
        makeInput({
          gradeSystem: "UNKNOWN",
          scores: {
            naesinOverall: 2.6,
            recentExamAvg: null,
            mock: {},
            mockFilledCount: 0,
          },
        }),
        { cuts: CUTS_FIT },
      ).admission.probability,
    ).toEqual(null);
  });
}
