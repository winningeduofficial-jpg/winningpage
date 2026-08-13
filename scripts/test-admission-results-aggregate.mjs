// =====================================================================
// src/lib/admissionResults.js(입결 집계 정본)의 회귀 테스트.
//
// 배경: 입결 관련 테스트가 0건인 상태에서 2개년 전환이 그룹키·전형유형
// 분류·Δ·pickGrade·요약 카드 basis를 한꺼번에 갈아엎었다. 최대 리스크는
// "표에서 교과/종합이 1행으로 뭉개짐"(같은 전형명의 2행 중 등급 있는 쪽만
// 임의 채택돼 값 절반이 조용히 사라지는 사고)과 "특수교육이 기회균형 탭으로
// 흡수됨"이다. 둘 다 화면상으로는 그럴듯해 보여서 육안 QA로는 못 잡는다.
//
// 실데이터(43,170행 xlsx)는 쓰지 않는다 — 손으로 만든 최소 픽스처로 순수
// 함수만 호출한다. DB도 브라우저도 필요 없다.
//
// 사용법: node scripts/test-admission-results-aggregate.mjs
// 종료 코드: 전부 통과하면 0, 하나라도 실패하면 1.
// =====================================================================

import {
  ACTIVE_RESULT_YEAR,
  CATEGORY_ORDER,
  CELL_STATE,
  CUT_MISMATCH_NOTE,
  DELTA_STATE,
  EMPTY_CELL,
  NEW_CELL,
  UNDISCLOSED_CELL,
  buildCategories,
  buildDetailModel,
  buildTableRows,
  buildTrackSummaries,
  categorize,
  computeDelta,
  formatCompetitionRate,
  formatGradeCell,
  pickGrade,
  pickInitialCategoryKey,
} from "../src/lib/admissionResults.js";

let failCount = 0;
let passCount = 0;

function check(name, fn) {
  try {
    fn();
    passCount += 1;
    console.log(`PASS - ${name}`);
  } catch (err) {
    failCount += 1;
    console.log(`FAIL - ${name}: ${err.message}`);
  }
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(
      `${label}: 기대 ${JSON.stringify(expected)}, 실제 ${JSON.stringify(actual)}`,
    );
  }
}

function assertDeepEqual(actual, expected, label) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${label}: 기대 ${b}, 실제 ${a}`);
}

// 픽스처 1행. 등급 4컷은 기본 전부 null이라 케이스마다 필요한 것만 덮어쓴다.
function row(overrides = {}) {
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
function cell(year, value, cut) {
  return { year, value, cut };
}

// ---------------------------------------------------------------------
// 1) 그룹키 — (중심전형, 전형명). 교과/종합이 1행으로 뭉개지면 안 된다.
// ---------------------------------------------------------------------

check(
  "같은 전형명이라도 중심전형이 다르면 표 행이 분리된다 (983그룹 회귀)",
  () => {
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
    assertEqual(tableRows.length, 2, "표 행 수");
    assertDeepEqual(
      tableRows.map((r) => r.mainTrack),
      ["교과", "종합"],
      "중심전형 목록",
    );
    // 값이 조용히 사라지지 않았는지 — 두 등급이 각각 자기 행에 살아 있어야 한다.
    const active = tableRows.map(
      (r) => r.cells.find((c) => c.year === ACTIVE_RESULT_YEAR).value,
    );
    assertDeepEqual(active, [2.1, 3.4], "2026 셀 값");
    assertDeepEqual(
      tableRows.map((r) => r.rowCount),
      [1, 1],
      "행별 원본 행 수",
    );
  },
);

check(
  "같은 (중심전형, 전형명)의 2개년 행은 한 행으로 묶여 연도 셀 2개가 된다",
  () => {
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
    assertEqual(tableRows.length, 1, "표 행 수");
    assertEqual(tableRows[0].rowCount, 2, "원본 행 수");
    assertDeepEqual(
      tableRows[0].cells.map((c) => [c.year, c.value]),
      [
        [2025, 2.5],
        [2026, 2.2],
      ],
      "연도 셀",
    );
  },
);

check("중심전형이 null인 행들은 하나의 null 그룹으로만 묶인다", () => {
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
  assertEqual(tableRows.length, 1, "표 행 수");
  assertEqual(tableRows[0].mainTrack, "", "중심전형 표기");
});

// ---------------------------------------------------------------------
// 2) 전형유형 분류 11종
// ---------------------------------------------------------------------

check(
  "특수교육은 기회균형이 아니라 특수교육으로 분류된다 (706행 흡수 회귀)",
  () => {
    // screening_category 경로
    assertEqual(
      categorize(row({ screening_category: "특수교육" })).key,
      "special",
      "컬럼값 경로",
    );
    // 정규식 fallback 경로 — 과거 opportunity 규칙이 삼키던 자리
    assertEqual(
      categorize(
        row({
          screening_category: null,
          admission_track: "특수교육대상자전형",
        }),
      ).key,
      "special",
      "정규식 fallback 경로",
    );
  },
);

check("정규식 fallback이 11종 각각을 올바른 탭으로 보낸다", () => {
  const cases = [
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
    assertEqual(actual, expected, `"${track}" 분류`);
  });
});

check("논술·실기는 main_track 축으로도 잡힌다", () => {
  assertEqual(
    categorize(
      row({
        screening_category: null,
        main_track: "논술",
        admission_track: "논술우수자",
      }),
    ).key,
    "nonsul",
    "논술",
  );
  assertEqual(
    categorize(
      row({
        screening_category: null,
        main_track: "실기",
        admission_track: "실기우수자",
      }),
    ).key,
    "practical",
    "실기",
  );
});

check("screening_category 컬럼값 11종이 모두 자기 탭으로 매핑된다", () => {
  const columnValues = {
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
    assertEqual(actual, expected, `screening_category="${value}"`);
  });
  // CATEGORY_ORDER 12키(11종 + 기타)를 전부 덮었는지 역방향 확인.
  const covered = new Set(Object.values(columnValues));
  CATEGORY_ORDER.forEach((key) => {
    if (!covered.has(key))
      throw new Error(`CATEGORY_ORDER의 "${key}"를 덮는 케이스가 없다`);
  });
});

check("탭은 행이 있는 카테고리만 CATEGORY_ORDER 순서로 생성된다", () => {
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
  assertDeepEqual(
    categories.map((c) => c.key),
    ["general", "regional", "nonsul"],
    "탭 순서",
  );
  assertDeepEqual(
    categories.map((c) => c.isTail),
    [false, false, true],
    "꼬리 유형 표시",
  );
});

check("초기 탭은 건수와 무관하게 일반 우선, 일반이 없으면 최다 건수", () => {
  const withGeneral = buildCategories([
    row({ screening_category: "지역인재", admission_track: "지역인재A" }),
    row({ screening_category: "지역인재", admission_track: "지역인재B" }),
    row({ screening_category: "일반", admission_track: "일반전형" }),
  ]);
  assertEqual(pickInitialCategoryKey(withGeneral), "general", "일반 우선");

  const withoutGeneral = buildCategories([
    row({ screening_category: "지역인재", admission_track: "지역인재A" }),
    row({ screening_category: "지역인재", admission_track: "지역인재B" }),
    row({ screening_category: "농어촌", admission_track: "농어촌전형" }),
  ]);
  assertEqual(pickInitialCategoryKey(withoutGeneral), "regional", "최다 건수");
  assertEqual(pickInitialCategoryKey([]), null, "빈 목록");
});

// ---------------------------------------------------------------------
// 3) Δ 5상태 — 등급은 낮을수록 상위. 부호 방향이 뒤집히면 안 된다.
// ---------------------------------------------------------------------

check("Δ 상승(improved) — 등급 수치가 내려가면 성적 상승", () => {
  const d = computeDelta(cell(2025, 3.5, 50), cell(2026, 3.0, 50));
  assertEqual(d.state, DELTA_STATE.IMPROVED, "state");
  assertEqual(d.direction, DELTA_STATE.IMPROVED, "direction");
  assertEqual(d.raw, -0.5, "raw(부호 있는 원값)");
  assertEqual(d.delta, 0.5, "delta(절대값)");
  assertEqual(d.arrow, "▼", "arrow");
  assertEqual(d.tone, "up", "tone");
  assertEqual(d.display, "▼0.50", "display");
  assertEqual(d.label, "0.50 상승", "label");
  assertEqual(d.note, null, "note");
});

check("Δ 하락(worsened) — 등급 수치가 올라가면 성적 하락", () => {
  const d = computeDelta(cell(2025, 3.0, 50), cell(2026, 3.21, 50));
  assertEqual(d.state, DELTA_STATE.WORSENED, "state");
  assertEqual(d.raw, 0.21, "raw");
  assertEqual(d.arrow, "▲", "arrow");
  assertEqual(d.tone, "down", "tone");
  assertEqual(d.display, "▲0.21", "display");
  assertEqual(d.label, "0.21 하락", "label");
});

check("Δ 동일(same)", () => {
  const d = computeDelta(cell(2025, 3.0, 50), cell(2026, 3.0, 50));
  assertEqual(d.state, DELTA_STATE.SAME, "state");
  assertEqual(d.delta, 0, "delta");
  assertEqual(d.display, "—", "display");
  assertEqual(d.label, "변동 없음", "label");
  assertEqual(d.tone, "flat", "tone");
});

check('Δ 비교 불가(incomparable) — 전년 없음은 "신규", 올해 없음은 "-"', () => {
  const onlyCurrent = computeDelta(cell(2025, null, null), cell(2026, 2.4, 50));
  assertEqual(onlyCurrent.state, DELTA_STATE.INCOMPARABLE, "신규 state");
  assertEqual(onlyCurrent.display, NEW_CELL, "신규 display");
  assertEqual(onlyCurrent.label, "2026만 수록", "신규 label");
  assertEqual(onlyCurrent.availableYear, 2026, "신규 availableYear");
  assertEqual(onlyCurrent.delta, null, "신규 delta");

  const onlyPrevious = computeDelta(
    cell(2025, 2.4, 50),
    cell(2026, null, null),
  );
  assertEqual(onlyPrevious.state, DELTA_STATE.INCOMPARABLE, "폐지 state");
  assertEqual(onlyPrevious.display, EMPTY_CELL, "폐지 display");
  assertEqual(onlyPrevious.label, "2025만 수록", "폐지 label");

  const neither = computeDelta(cell(2025, null, null), cell(2026, null, null));
  assertEqual(neither.display, EMPTY_CELL, "양쪽 없음 display");
  assertEqual(neither.label, "수록 없음", "양쪽 없음 label");
  assertEqual(neither.availableYear, null, "양쪽 없음 availableYear");
});

check("Δ 컷 기준 상이(cut_mismatch) — 값·방향은 살고 톤만 낮아진다", () => {
  const d = computeDelta(cell(2025, 3.5, 70), cell(2026, 3.2, 50));
  assertEqual(d.state, DELTA_STATE.CUT_MISMATCH, "state");
  assertEqual(
    d.direction,
    DELTA_STATE.IMPROVED,
    "direction은 살아 있어야 한다",
  );
  assertEqual(d.cutMismatch, true, "cutMismatch");
  assertEqual(d.delta, 0.3, "delta");
  assertEqual(d.raw, -0.3, "raw");
  assertEqual(d.tone, "muted", "tone");
  assertEqual(d.note, CUT_MISMATCH_NOTE, "note");
  assertEqual(d.display, "▼0.30", "display");
});

check("표 행의 Δ가 연도 셀(2025 vs 2026)에서 그대로 계산된다", () => {
  const rows = [
    row({ result_year: 2025, grade_50: 3.5 }),
    row({ result_year: 2026, grade_50: 3.0 }),
  ];
  const [tableRow] = buildTableRows(rows);
  assertEqual(tableRow.delta.state, DELTA_STATE.IMPROVED, "state");
  assertEqual(tableRow.delta.display, "▼0.50", "display");
  // 구 "평균" 열은 제거됐다 — 남아 있으면 화면이 옛 필드를 계속 참조한다.
  assertEqual("averageDisplay" in tableRow, false, "averageDisplay 제거 여부");
});

// ---------------------------------------------------------------------
// 4) pickGrade 4단 체인 — 50 → 70 → 85 → 90, 출처(cut) 표기
// ---------------------------------------------------------------------

check("pickGrade는 50%컷을 최우선으로 쓴다", () => {
  assertDeepEqual(
    pickGrade(
      row({ grade_50: 2.1, grade_70: 2.5, grade_85: 3.0, grade_90: 3.4 }),
    ),
    { value: 2.1, cut: 50 },
    "50컷 우선",
  );
});

check("pickGrade는 50이 없으면 70으로 내려간다", () => {
  assertDeepEqual(
    pickGrade(row({ grade_70: 2.5, grade_85: 3.0 })),
    { value: 2.5, cut: 70 },
    "70컷",
  );
});

check(
  "pickGrade는 50·70이 둘 다 없고 85만 있으면 85를 쓴다 (§8.4 확장 59행)",
  () => {
    const target = row({ grade_50: null, grade_70: null, grade_85: 3.42 });
    assertDeepEqual(pickGrade(target), { value: 3.42, cut: 85 }, "85컷");
    assertEqual(formatGradeCell(target), "3.42 (85)", "출처 표기");
  },
);

check("pickGrade는 90%컷까지 내려가고, 전부 없으면 null", () => {
  assertDeepEqual(
    pickGrade(row({ grade_90: 5.1 })),
    { value: 5.1, cut: 90 },
    "90컷",
  );
  assertEqual(
    formatGradeCell(row({ grade_90: 5.1 })),
    "5.10 (90)",
    "90컷 표기",
  );
  assertDeepEqual(pickGrade(row()), { value: null, cut: null }, "전부 null");
  assertEqual(formatGradeCell(row()), EMPTY_CELL, "전부 null 표기");
});

check("pickGrade는 문자열 numeric과 빈 문자열을 방어한다", () => {
  assertDeepEqual(
    pickGrade(row({ grade_50: "2.10" })),
    { value: 2.1, cut: 50 },
    "문자열 numeric",
  );
  assertDeepEqual(
    pickGrade(row({ grade_50: "", grade_70: 2.5 })),
    { value: 2.5, cut: 70 },
    "빈 문자열은 결측",
  );
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

check("일반 행이 있으면 다른 유형이 섞여 있어도 일반만으로 평균한다", () => {
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

  assertEqual(mixedCard.basisKey, "general", "basisKey");
  assertEqual(mixedCard.basis, "일반", "basis 라벨");
  assertEqual(mixedCard.isGeneralBasis, true, "isGeneralBasis");
  assertEqual(mixedCard.value, 2.1, "가중평균 값"); // (2.00×10 + 2.20×10) / 20
  assertEqual(
    mixedCard.value,
    pureCard.value,
    "혼합 입력이 일반-only와 같아야 한다",
  );
  assertEqual(mixedCard.rowCount, 3, "rowCount는 중심전형 전체 행 수");
  assertEqual(mixedCard.basisRowCount, 2, "basisRowCount는 기준 행 수");
});

check(
  "일반 행이 없으면 모집인원 가중 최다 유형을 기준으로 삼고 basis를 알린다",
  () => {
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
    assertEqual(card.basisKey, "regional", "basisKey");
    assertEqual(card.basis, "지역인재", "basis 라벨");
    assertEqual(card.isGeneralBasis, false, "isGeneralBasis");
    assertEqual(card.value, 4.0, "기준 유형만의 평균");
    assertEqual(card.basisRowCount, 1, "basisRowCount");
  },
);

check("등급이 하나도 없는 중심전형도 카드는 남는다 (.card.void)", () => {
  const [card] = buildTrackSummaries([row({ quota: 12, competition_rate: 7 })]);
  assertEqual(card.hasValue, false, "hasValue");
  assertEqual(card.value, null, "value");
  assertEqual(card.displayValue, EMPTY_CELL, "displayValue");
  assertDeepEqual(card.years, [], "years는 값이 실제 존재하는 연도");
  assertEqual(card.activeQuotaDisplay, "12", "모집인원은 그대로 보인다");
});

check(
  '요약 카드 라벨은 표본 연도 수에 따라 "가중평균" 단어를 붙이거나 뺀다',
  () => {
    const [twoYears] = buildTrackSummaries(GENERAL_ONLY_ROWS);
    assertEqual(twoYears.label, "교과 · 2개년 가중평균", "2개년");
    const [oneYear] = buildTrackSummaries([GENERAL_ONLY_ROWS[0]]);
    assertEqual(oneYear.label, "교과 · 2026학년도", "1개년");
  },
);

check("요약 카드 limit 기본값은 4다 (Q7)", () => {
  const rows = ["교과", "종합", "논술", "실기", "기타전형"].map((track) =>
    row({ main_track: track, grade_50: 3.0 }),
  );
  assertEqual(buildTrackSummaries(rows).length, 4, "기본 limit");
  assertEqual(buildTrackSummaries(rows, { limit: 2 }).length, 2, "명시 limit");
});

// ---------------------------------------------------------------------
// 6) activeQuota / activeCompetitionRate — 분할모집
// ---------------------------------------------------------------------

check(
  "분할모집(같은 키 2행)은 모집인원 합계 · 경쟁률 평균으로 집계된다",
  () => {
    const rows = [
      row({
        result_year: 2026,
        quota: 10,
        competition_rate: 8.0,
        grade_50: 2.0,
      }),
      row({
        result_year: 2026,
        quota: 15,
        competition_rate: 10.0,
        grade_50: 3.0,
      }),
    ];
    const [tableRow] = buildTableRows(rows);
    assertEqual(tableRow.rowCount, 2, "묶인 행 수");
    assertEqual(tableRow.activeQuota, 25, "모집인원 합계"); // 합계지 평균이 아니다
    assertEqual(tableRow.activeQuotaDisplay, "25", "모집인원 표기");
    assertEqual(tableRow.activeCompetitionRate, 9, "경쟁률 평균"); // 평균이지 합계가 아니다
    assertEqual(
      tableRow.activeCompetitionRateDisplay,
      "9.00 : 1",
      "경쟁률 표기",
    );

    // 같은 연도 다중 행은 임의 채택이 아니라 모집인원 가중평균이어야 한다.
    const activeCell = tableRow.cells.find(
      (c) => c.year === ACTIVE_RESULT_YEAR,
    );
    assertEqual(activeCell.value, 2.6, "연도 셀 가중평균"); // (2.00×10 + 3.00×15) / 25
    assertEqual(activeCell.display, "2.60 (50)", "연도 셀 표기");
  },
);

check("기준 연도(2026) 밖의 행은 모집인원·경쟁률 집계에 섞이지 않는다", () => {
  const rows = [
    row({ result_year: 2025, quota: 99, competition_rate: 99, grade_50: 2.0 }),
    row({ result_year: 2026, quota: 10, competition_rate: 8.0, grade_50: 2.0 }),
  ];
  const [tableRow] = buildTableRows(rows);
  assertEqual(tableRow.activeQuota, 10, "모집인원");
  assertEqual(tableRow.activeCompetitionRate, 8, "경쟁률");
});

check("연도 셀 3상태 — 값 / 미공개 / 행 부재", () => {
  const rows = [
    row({ result_year: 2026, grade_50: 2.4 }),
    { ...row({ result_year: 2025 }), grade_50: null }, // 행은 있으나 등급 미공개
  ];
  const [tableRow] = buildTableRows(rows);
  const [y2025, y2026] = tableRow.cells;
  assertEqual(y2025.state, CELL_STATE.UNDISCLOSED, "2025 state");
  assertEqual(y2025.display, UNDISCLOSED_CELL, "2025 display");
  assertEqual(y2026.state, CELL_STATE.VALUE, "2026 state");

  const [onlyActive] = buildTableRows([
    row({ result_year: 2026, grade_50: 2.4 }),
  ]);
  assertEqual(onlyActive.cells[0].state, CELL_STATE.ABSENT, "행 부재 state");
  assertEqual(onlyActive.cells[0].display, EMPTY_CELL, "행 부재 display");
  assertEqual(onlyActive.delta.display, NEW_CELL, "행 부재 → Δ는 신규");
});

// ---------------------------------------------------------------------
// 7) 경쟁률 0 결측 승격 (Q2) — '0.00 : 1'이 화면으로 새면 안 된다
// ---------------------------------------------------------------------

check('formatCompetitionRate는 0·음수·null을 전부 "-"로 막는다', () => {
  assertEqual(formatCompetitionRate(0), EMPTY_CELL, "0");
  assertEqual(formatCompetitionRate("0"), EMPTY_CELL, "문자열 0");
  assertEqual(formatCompetitionRate(-1), EMPTY_CELL, "음수");
  assertEqual(formatCompetitionRate(null), EMPTY_CELL, "null");
  assertEqual(formatCompetitionRate(8.71), "8.71 : 1", "정상값");
});

check("경쟁률 0 행은 평균 계산의 분모에서도 빠진다", () => {
  const allZero = buildTableRows([row({ competition_rate: 0, grade_50: 2.0 })]);
  assertEqual(allZero[0].activeCompetitionRate, null, "전부 0이면 null");
  assertEqual(
    allZero[0].activeCompetitionRateDisplay,
    EMPTY_CELL,
    '전부 0이면 "-"',
  );

  // 0이 섞이면 평균이 반토막 나는 사고(8.00 → 4.00)를 막는다.
  const mixed = buildTableRows([
    row({ result_year: 2026, competition_rate: 0, grade_50: 2.0 }),
    row({ result_year: 2026, competition_rate: 8.0, grade_50: 2.0 }),
  ]);
  assertEqual(mixed[0].activeCompetitionRate, 8, "0 제외 평균");
});

check('집계 모델 전체에 "0.00 : 1" 문자열이 한 곳도 없다', () => {
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
  const leaks = [];
  const walk = (node) => {
    if (typeof node === "string") {
      if (/0\.00\s*:\s*1/.test(node)) leaks.push(node);
      return;
    }
    if (Array.isArray(node)) return node.forEach(walk);
    if (node && typeof node === "object")
      return Object.values(node).forEach(walk);
  };
  walk(model);
  if (leaks.length > 0)
    throw new Error(`경쟁률 0이 렌더 경로로 샜다: ${leaks.join(", ")}`);
});

// ---------------------------------------------------------------------
// 8) buildDetailModel 골격 — 후속 화면이 의존하는 필드
// ---------------------------------------------------------------------

check("observedYears는 축 상수가 아니라 실제 행이 있는 연도다", () => {
  const model = buildDetailModel([row({ result_year: 2026, grade_50: 2.0 })]);
  assertDeepEqual(model.years, [2025, 2026], "years(축 상수)");
  assertDeepEqual(model.observedYears, [2026], "observedYears");
  assertEqual(model.universityName, "가상대학교", "대학명");
  assertEqual(model.departmentName, "가상학과", "모집단위명");
  assertEqual(model.isEmpty, false, "isEmpty");
});

check("축(2025·2026) 밖 연도 행은 모델 진입부에서 전량 걸러진다", () => {
  const model = buildDetailModel([
    row({ result_year: 2024, grade_50: 9.9 }),
    row({ result_year: 2026, grade_50: 2.0 }),
  ]);
  assertEqual(model.rowCount, 1, "rowCount");
  assertEqual(
    model.trackSummaries[0].value,
    2.0,
    "축 밖 행이 평균에 섞이지 않는다",
  );
});

check("행이 하나도 없으면 빈 모델을 돌려준다", () => {
  const model = buildDetailModel([]);
  assertEqual(model.isEmpty, true, "isEmpty");
  assertEqual(model.initialCategoryKey, null, "initialCategoryKey");
  assertDeepEqual(model.categories, [], "categories");
  assertDeepEqual(model.trackSummaries, [], "trackSummaries");
});

console.log(
  `\n총 ${passCount + failCount}건 중 ${passCount}건 통과, ${failCount}건 실패.`,
);
process.exitCode = failCount ? 1 : 0;
