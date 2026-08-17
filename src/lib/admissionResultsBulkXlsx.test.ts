// admissionResultsBulkXlsx.ts(exportAdmissionResultRowsToXlsx/
// parseAdmissionResultRowsFromXlsx)의 순수 함수 회귀 테스트.
//
// 43,170행 실데이터·DB는 쓰지 않는다 — 손으로 만든 최소 픽스처로 순수
// 함수만 호출한다(admissionResults.test.ts와 동일 원칙). DB 접근이
// 필요한 왕복 검증(id 매칭 등)은 이 파일의 범위가 아니다 —
// existingIdSet은 여기서 합성 Set으로 직접 만든다.

import { expect, test } from "vitest";
import * as XLSX from "xlsx";

import {
  ADMISSION_RESULTS_BULK_XLSX_COLUMNS,
  exportAdmissionResultRowsToXlsx,
  MAIN_TRACK_OPTIONS,
  parseAdmissionResultRowsFromXlsx,
  RESULT_YEAR_OPTIONS,
  SCREENING_CATEGORY_OPTIONS,
  TRUNCATION_MARKER,
} from "./admissionResultsBulkXlsx.ts";

// DB에서 읽어온 행 모양의 최소 픽스처. 겹치는 값을 명시하지 않은
// 컬럼은 전부 비어 있다고 가정한다.
function dbRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    is_active: true,
    result_year: 2026,
    university_key: "winning-univ",
    university_name: "위닝대학교",
    department_key: "cs",
    department_name: "컴퓨터공학과",
    main_track: "교과",
    screening_category: "일반",
    admission_track: "일반전형",
    grade_50: 2.1,
    grade_70: 2.5,
    grade_85: null,
    grade_90: null,
    grade_avg: null,
    grade_min: null,
    grade_avg10: null,
    grade_min10: null,
    grade_first_avg: null,
    converted_score: null,
    percentile: null,
    quota: 10,
    competition_rate: 8.5,
    waitlist_rank: "3배수",
    subject_reflection: "국어·수학·영어",
    variant_seq: 0,
    source_sheet: "입결_마스터_2개년",
    source_row: 42,
    note: null,
    ...overrides,
  };
}

// 헤더 + rowObj 하나로 워크북을 만든다. rowObj에 없는 컬럼은 빈 문자열로
// 채운다(엑셀에서 빈 셀을 그대로 흉내낸다).
function buildWorkbook(rowObjs: Record<string, unknown>[]) {
  const header = ADMISSION_RESULTS_BULK_XLSX_COLUMNS;
  const dataRows = rowObjs.map((rowObj) =>
    header.map((col) => (col in rowObj ? rowObj[col] : "")),
  );
  const ws = XLSX.utils.aoa_to_sheet([header, ...dataRows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "입결정보");
  return wb;
}

function roundTripWorkbook(workbook: XLSX.WorkBook) {
  const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" });
  return XLSX.read(buffer, { type: "buffer" });
}

function warningTypes(result: { warnings: { type: string }[] }) {
  return result.warnings.map((w) => w.type);
}

// ---------------------------------------------------------------------
// 1) 정상 왕복(export → parse) — 값이 그대로 보존되는지.
// ---------------------------------------------------------------------

test("정상 왕복: export한 행을 다시 parse하면 update로 분류되고 값이 보존된다", () => {
  const original = dbRow();
  const { workbook, truncatedCells } = exportAdmissionResultRowsToXlsx([
    original,
  ]);
  expect(truncatedCells.length).toBe(0);

  const roundTripped = roundTripWorkbook(workbook);
  const existingIdSet = new Set([original.id as number]);
  const { rows, errors, warnings, summary } = parseAdmissionResultRowsFromXlsx(
    roundTripped,
    existingIdSet,
  );

  expect(errors.length).toBe(0);
  expect(rows.length).toBe(1);
  expect(summary.willInsert).toBe(0);
  expect(summary.willUpdate).toBe(1);
  expect(summary.willSkip).toBe(0);
  expect(warnings.length).toBe(0);

  const row = rows[0];
  if (!row) throw new Error("행이 있어야 한다");
  expect(row.id).toBe(original.id);
  expect(row.university_key).toBe(original.university_key);
  expect(row.university_name).toBe(original.university_name);
  expect(row.department_key).toBe(original.department_key);
  expect(row.main_track).toBe(original.main_track);
  expect(row.screening_category).toBe(original.screening_category);
  expect(row.grade_50).toBe(original.grade_50);
  expect(row.grade_70).toBe(original.grade_70);
  expect(row.quota).toBe(original.quota);
  expect(row.competition_rate).toBe(original.competition_rate);
  expect(row.waitlist_rank).toBe(original.waitlist_rank);
  expect(row.subject_reflection).toBe(original.subject_reflection);
  expect(row.variant_seq).toBe(original.variant_seq);
  expect(row.source_sheet).toBe(original.source_sheet);
  expect(row.source_row).toBe(original.source_row);
  expect(row.is_active).toBe(original.is_active);
});

test("정상 왕복: 등급·경쟁률 등 수치 컬럼은 export 시점에 숫자 타입을 유지한다(문자열로 안 바뀜)", () => {
  const { workbook } = exportAdmissionResultRowsToXlsx([dbRow()]);
  const sheetName = workbook.SheetNames[0]!;
  const ws = workbook.Sheets[sheetName]!;
  const gradeCol = ADMISSION_RESULTS_BULK_XLSX_COLUMNS.indexOf("grade_50");
  const gradeAddr = XLSX.utils.encode_cell({ r: 1, c: gradeCol });
  expect(ws[gradeAddr]?.t).toBe("n");
  const nameCol =
    ADMISSION_RESULTS_BULK_XLSX_COLUMNS.indexOf("university_name");
  const nameAddr = XLSX.utils.encode_cell({ r: 1, c: nameCol });
  expect(ws[nameAddr]?.t).toBe("s");
});

// ---------------------------------------------------------------------
// 2) id 없는 신규행 → insert
// ---------------------------------------------------------------------

test("id가 빈 셀이면 insert로 분류되고 payload에 id 키가 없다", () => {
  const wb = buildWorkbook([{ ...dbRow(), id: "" }]);
  const { rows, errors, summary } = parseAdmissionResultRowsFromXlsx(
    wb,
    new Set([999]),
  );

  expect(errors.length).toBe(0);
  expect(summary.willInsert).toBe(1);
  expect(summary.willUpdate).toBe(0);
  const row = rows[0];
  if (!row) throw new Error("행이 있어야 한다");
  expect("id" in row).toBe(false);
});

// ---------------------------------------------------------------------
// 3) 존재하지 않는 id → 거부
// ---------------------------------------------------------------------

test("id가 있는데 existingIdSet에 없으면 idNotFound로 거부된다", () => {
  const wb = buildWorkbook([dbRow({ id: 555 })]);
  const { rows, errors, summary } = parseAdmissionResultRowsFromXlsx(
    wb,
    new Set([1, 2, 3]),
  );

  expect(rows.length).toBe(0);
  expect(errors.length).toBe(1);
  expect(errors[0]!.type).toBe("idNotFound");
  expect(summary.willSkip).toBe(1);
  expect(summary.errorCounts.idNotFound).toBe(1);
});

test("id 셀이 숫자로 파싱되지 않으면 invalidId로 거부된다", () => {
  const wb = buildWorkbook([dbRow({ id: "abc-not-a-number" })]);
  const { rows, errors } = parseAdmissionResultRowsFromXlsx(wb, new Set([1]));
  expect(rows.length).toBe(0);
  expect(errors[0]!.type).toBe("invalidId");
});

// ---------------------------------------------------------------------
// 4) 파일 내 자연키 중복 → 거부
// ---------------------------------------------------------------------

test("파일 안에서 8축 자연키가 중복되면 두 번째 행이 duplicateNaturalKey로 거부된다", () => {
  const first = dbRow({ id: 1 });
  const second = dbRow({ id: 2 }); // 나머지 8축은 동일 — 진성 중복
  const wb = buildWorkbook([first, second]);
  const { rows, errors, summary } = parseAdmissionResultRowsFromXlsx(
    wb,
    new Set([1, 2]),
  );

  expect(rows.length).toBe(1);
  expect(errors.length).toBe(1);
  expect(errors[0]!.type).toBe("duplicateNaturalKey");
  expect(errors[0]!.row).toBe(1);
  expect(summary.willInsert).toBe(0);
  expect(summary.willUpdate).toBe(1);
  expect(summary.willSkip).toBe(1);
});

test("variant_seq만 다르면(분할모집) 자연키가 갈려 중복이 아니다", () => {
  const first = dbRow({ id: 1, variant_seq: 0 });
  const second = dbRow({ id: 2, variant_seq: 1 });
  const wb = buildWorkbook([first, second]);
  const { rows, errors } = parseAdmissionResultRowsFromXlsx(
    wb,
    new Set([1, 2]),
  );

  expect(errors.length).toBe(0);
  expect(rows.length).toBe(2);
});

test("main_track이 다르면(교과 vs 종합) 나머지 7축이 같아도 중복이 아니다", () => {
  const first = dbRow({ id: 1, main_track: "교과" });
  const second = dbRow({ id: 2, main_track: "종합" });
  const wb = buildWorkbook([first, second]);
  const { rows, errors } = parseAdmissionResultRowsFromXlsx(
    wb,
    new Set([1, 2]),
  );

  expect(errors.length).toBe(0);
  expect(rows.length).toBe(2);
});

// ---------------------------------------------------------------------
// 5) CHECK 도메인 위반 → 거부
// ---------------------------------------------------------------------

test("result_year가 2025/2026이 아니면 invalidResultYear로 거부된다", () => {
  const wb = buildWorkbook([dbRow({ id: 1, result_year: 2099 })]);
  const { rows, errors } = parseAdmissionResultRowsFromXlsx(wb, new Set([1]));
  expect(rows.length).toBe(0);
  expect(errors[0]!.type).toBe("invalidResultYear");
  expect(RESULT_YEAR_OPTIONS.includes(2026)).toBe(true);
});

test("main_track이 CHECK 도메인 밖이면 invalidMainTrack으로 거부된다", () => {
  const wb = buildWorkbook([dbRow({ id: 1, main_track: "학생부교과" })]); // 접두어 있는 옛 표기는 거부 대상
  const { rows, errors } = parseAdmissionResultRowsFromXlsx(wb, new Set([1]));
  expect(rows.length).toBe(0);
  expect(errors[0]!.type).toBe("invalidMainTrack");
  expect(MAIN_TRACK_OPTIONS.includes("교과")).toBe(true);
});

test("main_track이 비어 있으면 CHECK가 null을 허용하므로 통과한다", () => {
  const wb = buildWorkbook([dbRow({ id: 1, main_track: "" })]);
  const { rows, errors } = parseAdmissionResultRowsFromXlsx(wb, new Set([1]));
  expect(errors.length).toBe(0);
  expect(rows[0]!.main_track).toBe(null);
});

test("screening_category가 CHECK 도메인 밖이면 invalidScreeningCategory로 거부된다", () => {
  const wb = buildWorkbook([dbRow({ id: 1, screening_category: "특기자" })]);
  const { rows, errors } = parseAdmissionResultRowsFromXlsx(wb, new Set([1]));
  expect(rows.length).toBe(0);
  expect(errors[0]!.type).toBe("invalidScreeningCategory");
  expect(SCREENING_CATEGORY_OPTIONS.includes("일반")).toBe(true);
});

test("필수값(university_key 등)이 비어 있으면 missingRequiredFields로 거부된다", () => {
  const wb = buildWorkbook([dbRow({ id: 1, university_key: "" })]);
  const { rows, errors } = parseAdmissionResultRowsFromXlsx(wb, new Set([1]));
  expect(rows.length).toBe(0);
  expect(errors[0]!.type).toBe("missingRequiredFields");
  expect(errors[0]!.reason.includes("university_key")).toBe(true);
});

test("등급이 numeric(4,2) 범위(절댓값 100 미만)를 벗어나면 invalidGrade로 거부된다", () => {
  const wb = buildWorkbook([dbRow({ id: 1, grade_50: 123.4 })]);
  const { rows, errors } = parseAdmissionResultRowsFromXlsx(wb, new Set([1]));
  expect(rows.length).toBe(0);
  expect(errors[0]!.type).toBe("invalidGrade");
});

test("quota가 정수가 아니면 invalidInteger로 거부된다", () => {
  const wb = buildWorkbook([dbRow({ id: 1, quota: 10.5 })]);
  const { rows, errors } = parseAdmissionResultRowsFromXlsx(wb, new Set([1]));
  expect(rows.length).toBe(0);
  expect(errors[0]!.type).toBe("invalidInteger");
});

test("잘림 마커가 있는 셀이 있으면 truncatedColumn으로 행 전체가 거부된다", () => {
  const wb = buildWorkbook([
    dbRow({ id: 1, note: `메모${TRUNCATION_MARKER}` }),
  ]);
  const { rows, errors } = parseAdmissionResultRowsFromXlsx(wb, new Set([1]));
  expect(rows.length).toBe(0);
  expect(errors[0]!.type).toBe("truncatedColumn");
});

// ---------------------------------------------------------------------
// 6) 경고 3종(거부 아님, 값은 반영됨)
// ---------------------------------------------------------------------

test("경고: 등급 9종이 전부 비어 있으면 allGradesEmpty 경고가 남고 행은 정상 반영된다", () => {
  const wb = buildWorkbook([
    dbRow({
      id: 1,
      grade_50: "",
      grade_70: "",
      grade_85: "",
      grade_90: "",
      grade_avg: "",
      grade_min: "",
      grade_avg10: "",
      grade_min10: "",
      grade_first_avg: "",
    }),
  ]);
  const { rows, errors, warnings } = parseAdmissionResultRowsFromXlsx(
    wb,
    new Set([1]),
  );
  expect(errors.length).toBe(0);
  expect(rows.length).toBe(1);
  expect(warningTypes({ warnings }).includes("allGradesEmpty")).toBe(true);
});

test("경고: 경쟁률이 0이면 competitionRateZero 경고가 남고 값은 0 그대로 반영된다(자동 null 변환 없음)", () => {
  const wb = buildWorkbook([dbRow({ id: 1, competition_rate: 0 })]);
  const { rows, warnings } = parseAdmissionResultRowsFromXlsx(wb, new Set([1]));
  expect(rows[0]!.competition_rate).toBe(0);
  expect(warningTypes({ warnings }).includes("competitionRateZero")).toBe(true);
});

test("경고: 50%컷이 70%컷보다 낮은 등급(숫자가 큼)이면 gradeCutInversion 경고가 남는다", () => {
  const wb = buildWorkbook([dbRow({ id: 1, grade_50: 3.5, grade_70: 2.1 })]);
  const { rows, warnings } = parseAdmissionResultRowsFromXlsx(wb, new Set([1]));
  expect(rows.length).toBe(1);
  expect(warningTypes({ warnings }).includes("gradeCutInversion")).toBe(true);
});

test("정상 범위(50%컷 <= 70%컷)면 gradeCutInversion 경고가 없다", () => {
  const wb = buildWorkbook([dbRow({ id: 1, grade_50: 2.1, grade_70: 2.5 })]);
  const { warnings } = parseAdmissionResultRowsFromXlsx(wb, new Set([1]));
  expect(warningTypes({ warnings }).includes("gradeCutInversion")).toBe(false);
});

// ---------------------------------------------------------------------
// 7) summary 집계 정확성
// ---------------------------------------------------------------------

test("summary: insert/update/skip/경고 건수가 실제 rows/errors/warnings와 일치한다", () => {
  const insertRow: Record<string, unknown> = dbRow({
    id: "",
    university_key: "brand-new-univ",
    department_key: "new-dept",
  });
  delete insertRow.id;
  const rowsInput = [
    insertRow, // insert(자연키가 달라야 함)
    dbRow({ id: 1 }), // update
    dbRow({
      id: 2,
      university_key: "other-univ",
      department_key: "ee",
      competition_rate: 0,
    }), // update + 경고 1건
    dbRow({ id: 999 }), // idNotFound → skip
  ];
  const wb = buildWorkbook(rowsInput);
  const { rows, errors, warnings, summary } = parseAdmissionResultRowsFromXlsx(
    wb,
    new Set([1, 2]),
  );

  expect(summary.willInsert).toBe(1);
  expect(summary.willUpdate).toBe(2);
  expect(summary.willSkip).toBe(1);
  expect(rows.length).toBe(summary.willInsert + summary.willUpdate);
  expect(errors.length).toBe(summary.willSkip);
  expect(Object.values(summary.warningCounts).reduce((a, b) => a + b, 0)).toBe(
    warnings.length,
  );
  expect(Object.values(summary.errorCounts).reduce((a, b) => a + b, 0)).toBe(
    errors.length,
  );
  expect(summary.errorCounts.idNotFound).toBe(1);
  expect(summary.warningCounts.competitionRateZero).toBe(1);
});

test("sheetNotFound: 빈 워크북(시트 없음)을 넘기면 에러 1건만 나오고 죽지 않는다", () => {
  const emptyWorkbook = { SheetNames: [], Sheets: {} };
  const { rows, errors, summary } = parseAdmissionResultRowsFromXlsx(
    emptyWorkbook as XLSX.WorkBook,
    new Set(),
  );
  expect(rows.length).toBe(0);
  expect(errors.length).toBe(1);
  expect(errors[0]!.type).toBe("sheetNotFound");
  expect(summary.willSkip).toBe(0);
});
