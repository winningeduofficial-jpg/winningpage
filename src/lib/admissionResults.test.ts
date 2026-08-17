// admissionResults.ts(입결 집계 정본)의 회귀 테스트.
//
// 배경: 입결 관련 테스트가 0건인 상태에서 2개년 전환이 그룹키·전형유형
// 분류·Δ·pickGrade·요약 카드 basis를 한꺼번에 갈아엎었다. 최대 리스크는
// "표에서 교과/종합이 1행으로 뭉개짐"(같은 전형명의 2행 중 등급 있는 쪽만
// 임의 채택돼 값 절반이 조용히 사라지는 사고)과 "특수교육이 기회균형 탭으로
// 흡수됨"이다. 둘 다 화면상으로는 그럴듯해 보여서 육안 QA로는 못 잡는다.
//
// 실데이터(43,170행 xlsx)는 쓰지 않는다 — 손으로 만든 최소 픽스처로 순수
// 함수만 호출한다. DB도 브라우저도 필요 없다.

import { expect, test } from "vitest";

import {
  ACTIVE_RESULT_YEAR,
  type AdmissionResultRow,
  buildCategories,
  buildDetailModel,
  buildTableRows,
  buildTrackSummaries,
  CATEGORY_ORDER,
  CELL_STATE,
  CUT_MISMATCH_NOTE,
  categorize,
  computeDelta,
  DELTA_STATE,
  EMPTY_CELL,
  formatCompetitionRate,
  formatGradeCell,
  NEW_CELL,
  pickGrade,
  pickInitialCategoryKey,
  UNDISCLOSED_CELL,
} from "./admissionResults.ts";

// 픽스처 1행. 등급 4컷은 기본 전부 null이라 케이스마다 필요한 것만 덮어쓴다.
function row(overrides: Record<string, unknown> = {}): AdmissionResultRow {
  return {
    result_year: ACTIVE_RESULT_YEAR,
    university_name: "가상대학교",
    department_name: "가상학과",
    main_track: "교과",
    admission_track: "일반전형",
    screening_category: "일반",
    subject_reflection: "국어·수학·영어",
    quota: 10,
    competition_rate: 5,
    grade_50: null,
    grade_70: null,
    grade_85: null,
    grade_90: null,
    ...overrides,
  };
}

// 셀 모양의 최소 객체(computeDelta는 { year, value, cut }만 본다).
function cell(year: number, value: number | null, cut: number | null) {
  return { year, value, cut };
}

// ---------------------------------------------------------------------
// 1) 그룹키 — (중심전형, 전형명). 교과/종합이 1행으로 뭉개지면 안 된다.
// ---------------------------------------------------------------------

test("같은 전형명이라도 중심전형이 다르면 표 행이 분리된다 (983그룹 회귀)", () => {
  const rows = [
    row({
      main_track: "교과",
      admission_track: "학교장추천전형",
      grade_50: 2.1,
    }),
    row({
      main_track: "종합",
      admission_track: "학교장추천전형",
      grade_50: 3.4,
    }),
  ];
  const tableRows = buildTableRows(rows);
  expect(tableRows.length).toBe(2);
  expect(tableRows.map((r) => r.mainTrack)).toEqual(["교과", "종합"]);
  // 값이 조용히 사라지지 않았는지 — 두 등급이 각각 자기 행에 살아 있어야 한다.
  const active = tableRows.map(
    (r) => r.cells.find((c) => c.year === ACTIVE_RESULT_YEAR)?.value,
  );
  expect(active).toEqual([2.1, 3.4]);
  expect(tableRows.map((r) => r.rowCount)).toEqual([1, 1]);
});

test("같은 (중심전형, 전형명)의 2개년 행은 한 행으로 묶여 연도 셀 2개가 된다", () => {
  const rows = [
    row({
      result_year: 2025,
      main_track: "교과",
      admission_track: "일반전형",
      grade_50: 2.5,
    }),
    row({
      result_year: 2026,
      main_track: "교과",
      admission_track: "일반전형",
      grade_50: 2.2,
    }),
  ];
  const tableRows = buildTableRows(rows);
  expect(tableRows.length).toBe(1);
  const tableRow = tableRows[0];
  if (!tableRow) throw new Error("표 행이 있어야 한다");
  expect(tableRow.rowCount).toBe(2);
  expect(tableRow.cells.map((c) => [c.year, c.value])).toEqual([
    [2025, 2.5],
    [2026, 2.2],
  ]);
});

test("중심전형이 null인 행들은 하나의 null 그룹으로만 묶인다", () => {
  const rows = [
    row({ main_track: null, admission_track: "일반전형", grade_50: 2.0 }),
    row({
      main_track: "",
      admission_track: "일반전형",
      grade_50: 3.0,
      result_year: 2025,
    }),
  ];
  const tableRows = buildTableRows(rows);
  expect(tableRows.length).toBe(1);
  expect(tableRows[0]?.mainTrack).toBe("");
});

// ---------------------------------------------------------------------
// 2) 전형유형 분류 11종
// ---------------------------------------------------------------------

test("특수교육은 기회균형이 아니라 특수교육으로 분류된다 (706행 흡수 회귀)", () => {
  // screening_category 경로
  expect(categorize(row({ screening_category: "특수교육" })).key).toBe(
    "special",
  );
  // 정규식 fallback 경로 — 과거 opportunity 규칙이 삼키던 자리
  expect(
    categorize(
      row({
        screening_category: null,
        admission_track: "특수교육대상자전형",
      }),
    ).key,
  ).toBe("special");
});

test("정규식 fallback이 11종 각각을 올바른 탭으로 보낸다", () => {
  const cases: [string, string][] = [
    ["재외국민특별전형", "overseas"],
    ["성인학습자전형", "adult"],
    ["만학도전형", "adult"],
    ["특성화고졸업자전형", "vocational"],
    ["마이스터고전형", "vocational"],
    ["지역인재전형", "regional"],
    ["농·어촌학생전형", "nongeochon"],
    ["농어촌학생전형", "nongeochon"],
    ["기회균형선발전형", "opportunity"],
    ["국가보훈대상자전형", "opportunity"],
    ["학교장추천전형", "recommend"],
    ["일반전형", "general"],
  ];
  cases.forEach(([track, expected]) => {
    const actual = categorize(
      row({ screening_category: null, admission_track: track }),
    ).key;
    expect(actual).toBe(expected);
  });
});

test("논술·실기는 main_track 축으로도 잡힌다", () => {
  expect(
    categorize(
      row({
        screening_category: null,
        main_track: "논술",
        admission_track: "논술우수자",
      }),
    ).key,
  ).toBe("nonsul");
  expect(
    categorize(
      row({
        screening_category: null,
        main_track: "실기",
        admission_track: "실기우수자",
      }),
    ).key,
  ).toBe("practical");
});

test("screening_category 컬럼값 11종이 모두 자기 탭으로 매핑된다", () => {
  const columnValues: Record<string, string> = {
    일반: "general",
    추천형: "recommend",
    지역인재: "regional",
    농어촌: "nongeochon",
    기회균형: "opportunity",
    특성화고: "vocational",
    특수교육: "special",
    논술: "nonsul",
    실기: "practical",
    성인학습자: "adult",
    재외국민: "overseas",
    기타: "etc",
  };
  Object.entries(columnValues).forEach(([value, expected]) => {
    // admission_track은 일부러 매핑과 어긋나게 둔다 — 컬럼값을 그대로 신뢰하는지 확인.
    const actual = categorize(
      row({ screening_category: value, admission_track: "일반전형" }),
    ).key;
    expect(actual).toBe(expected);
  });
  // CATEGORY_ORDER 12키(11종 + 기타)를 전부 덮었는지 역방향 확인.
  const covered = new Set(Object.values(columnValues));
  CATEGORY_ORDER.forEach((key) => {
    expect(
      covered.has(key),
      `CATEGORY_ORDER의 "${key}"를 덮는 케이스가 없다`,
    ).toBe(true);
  });
});

test("탭은 행이 있는 카테고리만 CATEGORY_ORDER 순서로 생성된다", () => {
  const rows = [
    row({
      screening_category: "지역인재",
      admission_track: "지역인재전형",
      grade_50: 3.0,
    }),
    row({
      screening_category: "일반",
      admission_track: "일반전형",
      grade_50: 2.0,
    }),
    row({
      screening_category: "논술",
      main_track: "논술",
      admission_track: "논술전형",
      grade_50: 4.0,
    }),
  ];
  const categories = buildCategories(rows);
  expect(categories.map((c) => c.key)).toEqual([
    "general",
    "regional",
    "nonsul",
  ]);
  expect(categories.map((c) => c.isTail)).toEqual([false, false, true]);
});

test("초기 탭은 건수와 무관하게 일반 우선, 일반이 없으면 최다 건수", () => {
  const withGeneral = buildCategories([
    row({ screening_category: "지역인재", admission_track: "지역인재A" }),
    row({ screening_category: "지역인재", admission_track: "지역인재B" }),
    row({ screening_category: "일반", admission_track: "일반전형" }),
  ]);
  expect(pickInitialCategoryKey(withGeneral)).toBe("general");

  const withoutGeneral = buildCategories([
    row({ screening_category: "지역인재", admission_track: "지역인재A" }),
    row({ screening_category: "지역인재", admission_track: "지역인재B" }),
    row({ screening_category: "농어촌", admission_track: "농어촌전형" }),
  ]);
  expect(pickInitialCategoryKey(withoutGeneral)).toBe("regional");
  expect(pickInitialCategoryKey([])).toBe(null);
});

// ---------------------------------------------------------------------
// 3) Δ 5상태 — 등급은 낮을수록 상위. 부호 방향이 뒤집히면 안 된다.
// ---------------------------------------------------------------------

test("Δ 상승(improved) — 등급 수치가 내려가면 성적 상승", () => {
  const d = computeDelta(cell(2025, 3.5, 50), cell(2026, 3.0, 50));
  expect(d.state).toBe(DELTA_STATE.IMPROVED);
  expect(d.direction).toBe(DELTA_STATE.IMPROVED);
  expect(d.raw).toBe(-0.5);
  expect(d.delta).toBe(0.5);
  expect(d.arrow).toBe("▼");
  expect(d.tone).toBe("up");
  expect(d.display).toBe("▼0.50");
  expect(d.label).toBe("0.50 상승");
  expect(d.note).toBe(null);
});

test("Δ 하락(worsened) — 등급 수치가 올라가면 성적 하락", () => {
  const d = computeDelta(cell(2025, 3.0, 50), cell(2026, 3.21, 50));
  expect(d.state).toBe(DELTA_STATE.WORSENED);
  expect(d.raw).toBe(0.21);
  expect(d.arrow).toBe("▲");
  expect(d.tone).toBe("down");
  expect(d.display).toBe("▲0.21");
  expect(d.label).toBe("0.21 하락");
});

test("Δ 동일(same)", () => {
  const d = computeDelta(cell(2025, 3.0, 50), cell(2026, 3.0, 50));
  expect(d.state).toBe(DELTA_STATE.SAME);
  expect(d.delta).toBe(0);
  expect(d.display).toBe("—");
  expect(d.label).toBe("변동 없음");
  expect(d.tone).toBe("flat");
});

test('Δ 비교 불가(incomparable) — 전년 없음은 "신규", 올해 없음은 "-"', () => {
  const onlyCurrent = computeDelta(cell(2025, null, null), cell(2026, 2.4, 50));
  expect(onlyCurrent.state).toBe(DELTA_STATE.INCOMPARABLE);
  expect(onlyCurrent.display).toBe(NEW_CELL);
  expect(onlyCurrent.label).toBe("2026만 수록");
  expect(onlyCurrent.availableYear).toBe(2026);
  expect(onlyCurrent.delta).toBe(null);

  const onlyPrevious = computeDelta(
    cell(2025, 2.4, 50),
    cell(2026, null, null),
  );
  expect(onlyPrevious.state).toBe(DELTA_STATE.INCOMPARABLE);
  expect(onlyPrevious.display).toBe(EMPTY_CELL);
  expect(onlyPrevious.label).toBe("2025만 수록");

  const neither = computeDelta(cell(2025, null, null), cell(2026, null, null));
  expect(neither.display).toBe(EMPTY_CELL);
  expect(neither.label).toBe("수록 없음");
  expect(neither.availableYear).toBe(null);
});

test("Δ 컷 기준 상이(cut_mismatch) — 값·방향은 살고 톤만 낮아진다", () => {
  const d = computeDelta(cell(2025, 3.5, 70), cell(2026, 3.2, 50));
  expect(d.state).toBe(DELTA_STATE.CUT_MISMATCH);
  expect(d.direction).toBe(DELTA_STATE.IMPROVED);
  expect(d.cutMismatch).toBe(true);
  expect(d.delta).toBe(0.3);
  expect(d.raw).toBe(-0.3);
  expect(d.tone).toBe("muted");
  expect(d.note).toBe(CUT_MISMATCH_NOTE);
  expect(d.display).toBe("▼0.30");
});

test("표 행의 Δ가 연도 셀(2025 vs 2026)에서 그대로 계산된다", () => {
  const rows = [
    row({ result_year: 2025, grade_50: 3.5 }),
    row({ result_year: 2026, grade_50: 3.0 }),
  ];
  const [tableRow] = buildTableRows(rows);
  if (!tableRow) throw new Error("표 행이 있어야 한다");
  expect(tableRow.delta.state).toBe(DELTA_STATE.IMPROVED);
  expect(tableRow.delta.display).toBe("▼0.50");
  // 구 "평균" 열은 제거됐다 — 남아 있으면 화면이 옛 필드를 계속 참조한다.
  expect("averageDisplay" in tableRow).toBe(false);
});

// ---------------------------------------------------------------------
// 4) pickGrade 4단 체인 — 50 → 70 → 85 → 90, 출처(cut) 표기
// ---------------------------------------------------------------------

test("pickGrade는 50%컷을 최우선으로 쓴다", () => {
  expect(
    pickGrade(
      row({ grade_50: 2.1, grade_70: 2.5, grade_85: 3.0, grade_90: 3.4 }),
    ),
  ).toEqual({ value: 2.1, cut: 50 });
});

test("pickGrade는 50이 없으면 70으로 내려간다", () => {
  expect(pickGrade(row({ grade_70: 2.5, grade_85: 3.0 }))).toEqual({
    value: 2.5,
    cut: 70,
  });
});

test("pickGrade는 50·70이 둘 다 없고 85만 있으면 85를 쓴다 (§8.4 확장 59행)", () => {
  const target = row({ grade_50: null, grade_70: null, grade_85: 3.42 });
  expect(pickGrade(target)).toEqual({ value: 3.42, cut: 85 });
  expect(formatGradeCell(target)).toBe("3.42 (85)");
});

test("pickGrade는 90%컷까지 내려가고, 전부 없으면 null", () => {
  expect(pickGrade(row({ grade_90: 5.1 }))).toEqual({ value: 5.1, cut: 90 });
  expect(formatGradeCell(row({ grade_90: 5.1 }))).toBe("5.10 (90)");
  expect(pickGrade(row())).toEqual({ value: null, cut: null });
  expect(formatGradeCell(row())).toBe(EMPTY_CELL);
});

test("pickGrade는 문자열 numeric과 빈 문자열을 방어한다", () => {
  expect(pickGrade(row({ grade_50: "2.10" }))).toEqual({ value: 2.1, cut: 50 });
  expect(pickGrade(row({ grade_50: "", grade_70: 2.5 }))).toEqual({
    value: 2.5,
    cut: 70,
  });
});

// ---------------------------------------------------------------------
// 5) 요약 카드 basis — '일반'이 있으면 '일반'만으로 평균
// ---------------------------------------------------------------------

const GENERAL_ONLY_ROWS = [
  row({
    result_year: 2026,
    screening_category: "일반",
    admission_track: "일반전형",
    quota: 10,
    grade_50: 2.0,
  }),
  row({
    result_year: 2025,
    screening_category: "일반",
    admission_track: "일반전형",
    quota: 10,
    grade_50: 2.2,
  }),
];

test("일반 행이 있으면 다른 유형이 섞여 있어도 일반만으로 평균한다", () => {
  const mixed = [
    ...GENERAL_ONLY_ROWS,
    // quota가 압도적인 지역인재 — 섞이면 평균이 3.37까지 끌려간다.
    row({
      result_year: 2026,
      screening_category: "지역인재",
      admission_track: "지역인재전형",
      quota: 40,
      grade_50: 4.0,
    }),
  ];
  const [mixedCard] = buildTrackSummaries(mixed);
  const [pureCard] = buildTrackSummaries(GENERAL_ONLY_ROWS);
  if (!mixedCard || !pureCard) throw new Error("카드가 있어야 한다");

  expect(mixedCard.basisKey).toBe("general");
  expect(mixedCard.basis).toBe("일반");
  expect(mixedCard.isGeneralBasis).toBe(true);
  expect(mixedCard.value).toBe(2.1); // (2.00×10 + 2.20×10) / 20
  expect(mixedCard.value).toBe(pureCard.value);
  expect(mixedCard.rowCount).toBe(3);
  expect(mixedCard.basisRowCount).toBe(2);
});

test("일반 행이 없으면 모집인원 가중 최다 유형을 기준으로 삼고 basis를 알린다", () => {
  const rows = [
    row({
      screening_category: "농어촌",
      admission_track: "농어촌전형",
      quota: 5,
      grade_50: 3.0,
    }),
    row({
      screening_category: "지역인재",
      admission_track: "지역인재전형",
      quota: 40,
      grade_50: 4.0,
    }),
  ];
  const [card] = buildTrackSummaries(rows);
  if (!card) throw new Error("카드가 있어야 한다");
  expect(card.basisKey).toBe("regional");
  expect(card.basis).toBe("지역인재");
  expect(card.isGeneralBasis).toBe(false);
  expect(card.value).toBe(4.0);
  expect(card.basisRowCount).toBe(1);
});

test("등급이 하나도 없는 중심전형도 카드는 남는다 (.card.void)", () => {
  const [card] = buildTrackSummaries([row({ quota: 12, competition_rate: 7 })]);
  if (!card) throw new Error("카드가 있어야 한다");
  expect(card.hasValue).toBe(false);
  expect(card.value).toBe(null);
  expect(card.displayValue).toBe(EMPTY_CELL);
  expect(card.years).toEqual([]);
  expect(card.activeQuotaDisplay).toBe("12");
});

test('요약 카드 라벨은 표본 연도 수에 따라 "가중평균" 단어를 붙이거나 뺀다', () => {
  const [twoYears] = buildTrackSummaries(GENERAL_ONLY_ROWS);
  expect(twoYears?.label).toBe("교과 · 2개년 가중평균");
  const firstRow = GENERAL_ONLY_ROWS[0];
  if (!firstRow) throw new Error("픽스처가 있어야 한다");
  const [oneYear] = buildTrackSummaries([firstRow]);
  expect(oneYear?.label).toBe("교과 · 2026학년도");
});

test("요약 카드 limit 기본값은 4다 (Q7)", () => {
  const rows = ["교과", "종합", "논술", "실기", "기타전형"].map((track) =>
    row({ main_track: track, grade_50: 3.0 }),
  );
  expect(buildTrackSummaries(rows).length).toBe(4);
  expect(buildTrackSummaries(rows, { limit: 2 }).length).toBe(2);
});

// ---------------------------------------------------------------------
// 6) activeQuota / activeCompetitionRate — 분할모집
// ---------------------------------------------------------------------

test("분할모집(같은 키 2행)은 모집인원 합계 · 경쟁률 평균으로 집계된다", () => {
  const rows = [
    row({ result_year: 2026, quota: 10, competition_rate: 8.0, grade_50: 2.0 }),
    row({
      result_year: 2026,
      quota: 15,
      competition_rate: 10.0,
      grade_50: 3.0,
    }),
  ];
  const [tableRow] = buildTableRows(rows);
  if (!tableRow) throw new Error("표 행이 있어야 한다");
  expect(tableRow.rowCount).toBe(2);
  expect(tableRow.activeQuota).toBe(25); // 합계지 평균이 아니다
  expect(tableRow.activeQuotaDisplay).toBe("25");
  expect(tableRow.activeCompetitionRate).toBe(9); // 평균이지 합계가 아니다
  expect(tableRow.activeCompetitionRateDisplay).toBe("9.00 : 1");

  // 같은 연도 다중 행은 임의 채택이 아니라 모집인원 가중평균이어야 한다.
  const activeCell = tableRow.cells.find((c) => c.year === ACTIVE_RESULT_YEAR);
  expect(activeCell?.value).toBe(2.6); // (2.00×10 + 3.00×15) / 25
  expect(activeCell?.display).toBe("2.60 (50)");
});

test("기준 연도(2026) 밖의 행은 모집인원·경쟁률 집계에 섞이지 않는다", () => {
  const rows = [
    row({ result_year: 2025, quota: 99, competition_rate: 99, grade_50: 2.0 }),
    row({ result_year: 2026, quota: 10, competition_rate: 8.0, grade_50: 2.0 }),
  ];
  const [tableRow] = buildTableRows(rows);
  if (!tableRow) throw new Error("표 행이 있어야 한다");
  expect(tableRow.activeQuota).toBe(10);
  expect(tableRow.activeCompetitionRate).toBe(8);
});

test("연도 셀 3상태 — 값 / 미공개 / 행 부재", () => {
  const rows = [
    row({ result_year: 2026, grade_50: 2.4 }),
    { ...row({ result_year: 2025 }), grade_50: null }, // 행은 있으나 등급 미공개
  ];
  const [tableRow] = buildTableRows(rows);
  if (!tableRow) throw new Error("표 행이 있어야 한다");
  const [y2025, y2026] = tableRow.cells;
  expect(y2025?.state).toBe(CELL_STATE.UNDISCLOSED);
  expect(y2025?.display).toBe(UNDISCLOSED_CELL);
  expect(y2026?.state).toBe(CELL_STATE.VALUE);

  const [onlyActive] = buildTableRows([
    row({ result_year: 2026, grade_50: 2.4 }),
  ]);
  if (!onlyActive) throw new Error("표 행이 있어야 한다");
  expect(onlyActive.cells[0]?.state).toBe(CELL_STATE.ABSENT);
  expect(onlyActive.cells[0]?.display).toBe(EMPTY_CELL);
  expect(onlyActive.delta.display).toBe(NEW_CELL);
});

// ---------------------------------------------------------------------
// 7) 경쟁률 0 결측 승격 (Q2) — '0.00 : 1'이 화면으로 새면 안 된다
// ---------------------------------------------------------------------

test('formatCompetitionRate는 0·음수·null을 전부 "-"로 막는다', () => {
  expect(formatCompetitionRate(0)).toBe(EMPTY_CELL);
  expect(formatCompetitionRate("0")).toBe(EMPTY_CELL);
  expect(formatCompetitionRate(-1)).toBe(EMPTY_CELL);
  expect(formatCompetitionRate(null)).toBe(EMPTY_CELL);
  expect(formatCompetitionRate(8.71)).toBe("8.71 : 1");
});

test("경쟁률 0 행은 평균 계산의 분모에서도 빠진다", () => {
  const allZero = buildTableRows([row({ competition_rate: 0, grade_50: 2.0 })]);
  expect(allZero[0]?.activeCompetitionRate).toBe(null);
  expect(allZero[0]?.activeCompetitionRateDisplay).toBe(EMPTY_CELL);

  // 0이 섞이면 평균이 반토막 나는 사고(8.00 → 4.00)를 막는다.
  const mixed = buildTableRows([
    row({ result_year: 2026, competition_rate: 0, grade_50: 2.0 }),
    row({ result_year: 2026, competition_rate: 8.0, grade_50: 2.0 }),
  ]);
  expect(mixed[0]?.activeCompetitionRate).toBe(8);
});

test('집계 모델 전체에 "0.00 : 1" 문자열이 한 곳도 없다', () => {
  const rows = [
    row({ result_year: 2025, competition_rate: 0, quota: 0, grade_50: 2.5 }),
    row({ result_year: 2026, competition_rate: 0, quota: 0, grade_70: 2.3 }),
    row({
      result_year: 2026,
      screening_category: "지역인재",
      admission_track: "지역인재전형",
      competition_rate: 0,
      grade_50: 3.1,
    }),
  ];
  const model = buildDetailModel(rows);
  const leaks: string[] = [];
  const walk = (node: unknown) => {
    if (typeof node === "string") {
      if (/0\.00\s*:\s*1/.test(node)) leaks.push(node);
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (node && typeof node === "object") {
      Object.values(node).forEach(walk);
    }
  };
  walk(model);
  expect(leaks, `경쟁률 0이 렌더 경로로 샜다: ${leaks.join(", ")}`).toEqual([]);
});

// ---------------------------------------------------------------------
// 8) buildDetailModel 골격 — 후속 화면이 의존하는 필드
// ---------------------------------------------------------------------

test("observedYears는 축 상수가 아니라 실제 행이 있는 연도다", () => {
  const model = buildDetailModel([row({ result_year: 2026, grade_50: 2.0 })]);
  expect(model.years).toEqual([2025, 2026]);
  expect(model.observedYears).toEqual([2026]);
  expect(model.universityName).toBe("가상대학교");
  expect(model.departmentName).toBe("가상학과");
  expect(model.isEmpty).toBe(false);
});

test("축(2025·2026) 밖 연도 행은 모델 진입부에서 전량 걸러진다", () => {
  const model = buildDetailModel([
    row({ result_year: 2024, grade_50: 9.9 }),
    row({ result_year: 2026, grade_50: 2.0 }),
  ]);
  expect(model.rowCount).toBe(1);
  expect(model.trackSummaries[0]?.value).toBe(2.0);
});

test("행이 하나도 없으면 빈 모델을 돌려준다", () => {
  const model = buildDetailModel([]);
  expect(model.isEmpty).toBe(true);
  expect(model.initialCategoryKey).toBe(null);
  expect(model.categories).toEqual([]);
  expect(model.trackSummaries).toEqual([]);
});
