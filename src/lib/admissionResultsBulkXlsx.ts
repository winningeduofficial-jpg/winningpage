// =====================================================================
// 입결정보(admission_results, 43,170행) 일괄 엑셀 왕복.
// src/lib/admissionBulkXlsx.js(대입모집요강 23컬럼 왕복)의 구조를 참고해
// 새로 작성했다 — 두 도메인은 스키마·유일성 인덱스·규모가 전혀 달라
// 함수를 공유하지 않는다(순수 함수만 담는 것도 동일한 원칙).
//
// 컬럼 순서(29개 = id + 어드민 fields 전체, sql/53_admission_results_2yr.sql
// 최종 스키마 기준. created_at/updated_at은 DB가 관리하므로 뺐다):
//   id / is_active / result_year / university_key / university_name /
//   department_key / department_name / main_track / screening_category /
//   admission_track / grade_50 / grade_70 / grade_85 / grade_90 /
//   grade_avg / grade_min / grade_avg10 / grade_min10 / grade_first_avg /
//   converted_score / percentile / quota / competition_rate /
//   waitlist_rank / subject_reflection / variant_seq / source_sheet /
//   source_row / note
//
// admissionBulkXlsx.js와 다른 점 — 43,170행 규모와 유일성 인덱스가
// coalesce() 표현식이라는 두 제약 때문에 설계가 갈렸다:
//
//   1) 매칭 키가 (연도, university_key) 같은 자연키가 아니라 **id**다.
//      결과적으로 이 lib은 "기존 DB 행 전체"를 필요로 하지 않는다 —
//      호출부가 넘기는 건 existingIdSet(존재하는 id의 Set) 하나뿐이다.
//      id가 있고 그 id가 existingIdSet에 있으면 update, id가 비어
//      있으면 insert, id가 있는데 existingIdSet에 없으면 거부한다.
//      (대입모집요강처럼 "raw가 바뀌었는지 비교해 문서를 재생성"하는
//      개념 자체가 이 도메인에는 없다 — 전부 단순 스칼라 컬럼이다.)
//
//   2) DB upsert에 onConflict를 쓸 수 없다(sql/53의 유일성 인덱스가
//      coalesce() 표현식 인덱스라 PostgREST가 컬럼 목록으로 못 받는다).
//      그래서 이 lib은 자연키 중복을 **파일 안에서 미리** 잡는다 —
//      (result_year, university_key, department_key, main_track,
//      screening_category, admission_track, subject_reflection,
//      variant_seq) 조합이 파일 안에서 중복되면 거부한다(DB 유일성
//      인덱스 위반으로 전체 청크가 롤백되는 것보다 미리보기에서 걸러
//      내는 게 낫다). main_track/screening_category/subject_reflection은
//      DB 인덱스와 동일하게 빈 값을 ''로 접어 비교한다(coalesce와 동치).
//      실제 insert/update 배치·청크 처리는 호출부(Admin.jsx)의 책임이다
//      — 이 lib은 DB에 손대지 않는다.
// =====================================================================

import * as XLSX from "xlsx";

import { clean } from "./admissionParsing.js";

export const BULK_XLSX_COLUMNS = [
  "id",
  "is_active",
  "result_year",
  "university_key",
  "university_name",
  "department_key",
  "department_name",
  "main_track",
  "screening_category",
  "admission_track",
  "grade_50",
  "grade_70",
  "grade_85",
  "grade_90",
  "grade_avg",
  "grade_min",
  "grade_avg10",
  "grade_min10",
  "grade_first_avg",
  "converted_score",
  "percentile",
  "quota",
  "competition_rate",
  "waitlist_rank",
  "subject_reflection",
  "variant_seq",
  "source_sheet",
  "source_row",
  "note",
];

// sql/53의 CHECK 도메인. main_track/screening_category는 CHECK 자체가
// "null이거나 이 목록 중 하나"라 빈 값은 허용하고, 값이 있는데 목록 밖이면
// 거부한다.
export const MAIN_TRACK_OPTIONS = ["교과", "종합", "논술", "실기", "기타"];
export const SCREENING_CATEGORY_OPTIONS = [
  "일반",
  "추천형",
  "지역인재",
  "농어촌",
  "기회균형",
  "특성화고",
  "특수교육",
  "논술",
  "실기",
  "성인학습자",
  "재외국민",
  "기타",
];

// sql/43의 CHECK는 2015~2035를 허용하지만, 마스터 소스 자체가 2개년
// (2025·2026학년도)뿐이라 이 화면(엑셀 일괄 관리)에서는 그보다 좁게
// 묶는다 — DB CHECK보다 엄격한 건 업무 규칙이지 스키마 제약이 아니다.
export const RESULT_YEAR_OPTIONS = [2025, 2026];

// numeric(4,2) 컬럼 9종 — 정수부 2자리까지만 허용(절댓값 100 미만).
// 소수점 자릿수 초과는 Postgres가 반올림해 저장하므로(거부 아님) 여기서
// 따로 막지 않는다 — 스키마가 실제로 거부하는 조건(자릿수 초과)만 막는다.
const GRADE_COLUMNS = [
  "grade_50",
  "grade_70",
  "grade_85",
  "grade_90",
  "grade_avg",
  "grade_min",
  "grade_avg10",
  "grade_min10",
  "grade_first_avg",
];
const GRADE_RANGE_LIMIT = 100;

// numeric(6,2) — 정수부 4자리까지 허용(절댓값 10,000 미만).
const COMPETITION_RATE_RANGE_LIMIT = 10000;

// 정수 컬럼(정수형이 아니면 DB가 즉시 거부한다: quota/source_row는
// integer, variant_seq는 smallint).
const INTEGER_COLUMNS = ["quota", "variant_seq", "source_row"];

// sql/53 유일성 인덱스(admission_results_unique_key_idx)와 동일한 8축.
// main_track/screening_category/subject_reflection은 DB가 coalesce(x,'')
// 로 접어 비교하므로 여기서도 똑같이 접어야 한다 — 안 그러면 DB는 같은
// 키로 보는데 이 lib은 다른 키로 봐서 파일 내부 중복을 놓친다.
const NATURAL_KEY_COLUMNS = [
  "result_year",
  "university_key",
  "department_key",
  "main_track",
  "screening_category",
  "admission_track",
  "subject_reflection",
  "variant_seq",
];

// 엑셀 셀 문자 수 한도. 이 테이블 컬럼은 대부분 짧은 스칼라값이라 실측상
// 걸릴 일이 거의 없지만(note/waitlist_rank 정도만 자유 텍스트), 대입모집
// 요강 lib과 같은 방어 로직을 남겨 둔다(admissionBulkXlsx.js와 동일 값).
export const MAX_XLSX_CELL_LENGTH = 32767;
export const TRUNCATION_MARKER =
  "…[셀 한도 초과로 잘림 — 이 셀을 그대로 업로드하면 데이터가 손상됩니다]";

function serializeExportCell(rawValue: unknown): string | number | boolean {
  if (rawValue === null || rawValue === undefined) return "";
  if (typeof rawValue === "boolean" || typeof rawValue === "number")
    return rawValue;
  return String(rawValue);
}

type TruncationLocation = { id: unknown; rowIndex: number; column: string };
type TruncatedCell = TruncationLocation & { originalLength: number };

function truncateIfNeeded(
  value: string | number | boolean,
  location: TruncationLocation,
  truncatedCells: TruncatedCell[],
): string | number | boolean {
  if (typeof value !== "string" || value.length <= MAX_XLSX_CELL_LENGTH)
    return value;
  const keep = MAX_XLSX_CELL_LENGTH - TRUNCATION_MARKER.length;
  truncatedCells.push({ ...location, originalLength: value.length });
  return value.slice(0, keep) + TRUNCATION_MARKER;
}

// formula injection(수식 주입) 방어. admissionBulkXlsx.js의 forceStringCellTypes
// 와 완전히 동일한 로직 — 문자열 값 셀만 t='s'로 강제해 Excel/Sheets가
// '='/'+'/'-'/'@' 선두 텍스트를 수식으로 재해석하지 못하게 한다. 숫자/불리언
// 값은 serializeExportCell이 애초에 원시 타입으로 넘기므로 이 함수가 손대지
// 않는다(등급·경쟁률 같은 수치 컬럼이 문자열로 오인되지 않는 이유이기도 하다).
function forceStringCellTypes(worksheet: XLSX.WorkSheet): XLSX.WorkSheet {
  Object.keys(worksheet).forEach((address) => {
    if (address.startsWith("!")) return;
    const cell = worksheet[address];
    if (cell && typeof cell.v === "string") {
      cell.t = "s";
      delete cell.f;
    }
  });
  return worksheet;
}

/**
 * DB 행 배열(29컬럼) → xlsx workbook. id 컬럼을 포함한다(업로드 시 update/
 * insert 분기의 유일한 근거). 대학명·전형명 등 텍스트 컬럼은 forceStringCellTypes
 * 로 문자열 타입을 강제해 숫자/날짜로 오인되지 않게 하고, 등급·경쟁률 등
 * 수치 컬럼은 serializeExportCell이 원시 number를 그대로 넘겨 숫자 타입을
 * 유지한다.
 */
export function exportAdmissionResultRowsToXlsx(
  rows: Record<string, unknown>[],
): { workbook: XLSX.WorkBook; truncatedCells: TruncatedCell[] } {
  const truncatedCells: TruncatedCell[] = [];
  const dataRows = (rows || []).map((row, rowIndex) =>
    BULK_XLSX_COLUMNS.map((column) => {
      const serialized = serializeExportCell(row?.[column]);
      return truncateIfNeeded(
        serialized,
        { id: row?.id, rowIndex, column },
        truncatedCells,
      );
    }),
  );

  const worksheet = forceStringCellTypes(
    XLSX.utils.aoa_to_sheet([BULK_XLSX_COLUMNS, ...dataRows]),
  );
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "입결정보");

  return { workbook, truncatedCells };
}

function buildTypeCounts(items: { type?: string }[]): Record<string, number> {
  return items.reduce(
    (acc: Record<string, number>, item) => {
      const key = item.type || "unknown";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
}

function parseBooleanCell(value: unknown, fallback = true): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const s = clean(value).toUpperCase();
  if (s === "TRUE" || s === "1") return true;
  if (s === "FALSE" || s === "0") return false;
  return fallback;
}

// clean()은 텍스트용이라 `String(value || '').trim()`로 falsy를 전부
// 빈 문자열 취급한다 — 숫자 0은 falsy라 clean(0)이 ''이 돼 "빈 셀"로
// 오판된다(경쟁률 0, 모집인원 0 등 실제로 존재하는 값을 지운다). 숫자
// 컬럼(등급/환산점수/백분위/경쟁률/정수 3종/id)은 이 헬퍼로 null/undefined
// 만 빈 값으로 보고, 0은 값으로 살려 둔다.
function numericCellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function naturalKeyOf(fields: Record<string, unknown>): string {
  return NATURAL_KEY_COLUMNS.map((col) => {
    const value = fields[col];
    return value === null || value === undefined ? "" : String(value);
  }).join("::");
}

type ErrorType =
  | "sheetNotFound"
  | "truncatedColumn"
  | "missingRequiredFields"
  | "invalidResultYear"
  | "invalidMainTrack"
  | "invalidScreeningCategory"
  | "invalidGrade"
  | "invalidCompetitionRate"
  | "invalidNumber"
  | "invalidInteger"
  | "invalidId"
  | "idNotFound"
  | "duplicateNaturalKey";

type WarningType =
  | "allGradesEmpty"
  | "competitionRateZero"
  | "gradeCutInversion";

type RowContext = {
  rowIndex: number;
  resultYear: unknown;
  universityKey: unknown;
  departmentKey: unknown;
  admissionTrack: unknown;
  column?: string;
};

type ErrorEntry = {
  row: number;
  resultYear: unknown;
  universityKey: unknown;
  departmentKey: unknown;
  admissionTrack: unknown;
  column?: string;
  type: ErrorType;
  reason: string;
};

type WarningEntry = {
  row: number;
  resultYear: unknown;
  universityKey: unknown;
  departmentKey: unknown;
  admissionTrack: unknown;
  column?: string;
  type: WarningType;
  reason: string;
};

type ResultPayload = {
  result_year: number;
  university_key: string;
  university_name: string;
  department_key: string;
  department_name: string;
  main_track: string | null;
  screening_category: string | null;
  admission_track: string;
  grade_50: number | null;
  grade_70: number | null;
  grade_85: number | null;
  grade_90: number | null;
  grade_avg: number | null;
  grade_min: number | null;
  grade_avg10: number | null;
  grade_min10: number | null;
  grade_first_avg: number | null;
  converted_score: number | null;
  percentile: number | null;
  quota: number | null;
  competition_rate: number | null;
  waitlist_rank: string | null;
  subject_reflection: string | null;
  variant_seq: number;
  source_sheet: string | null;
  source_row: number | null;
  note: string | null;
  is_active: boolean;
  id?: number;
};

/**
 * xlsx workbook → payload 행 배열 + errors/warnings + 미리보기용 summary.
 *
 * @param existingIdSet DB에 실제로 존재하는 id 전체 집합.
 *   id가 비어 있으면 신규(insert), id가 있고 이 집합에 있으면 수정
 *   (update), id가 있는데 이 집합에 없으면 거부한다. 호출부가 DB에서
 *   id 컬럼만 미리 전량 조회해 넘긴다(이 lib은 DB를 안 만진다).
 *
 * errors/warnings는 둘 다 `type`으로 종류를 구분한다 — UI는 `reason`
 * 문자열을 파싱하지 말고 `type`으로 분기·집계해야 한다.
 */
export function parseAdmissionResultRowsFromXlsx(
  workbook: XLSX.WorkBook,
  existingIdSet: Set<number>,
): {
  rows: ResultPayload[];
  errors: ErrorEntry[];
  warnings: WarningEntry[];
  summary: {
    willInsert: number;
    willUpdate: number;
    willSkip: number;
    warningCounts: Record<string, number>;
    errorCounts: Record<string, number>;
  };
} {
  const sheetName = workbook.SheetNames[0];
  const worksheet = sheetName ? workbook.Sheets[sheetName] : null;
  const errors: ErrorEntry[] = [];
  const warnings: WarningEntry[] = [];
  const rows: ResultPayload[] = [];
  let willInsert = 0;
  let willUpdate = 0;
  let willSkip = 0;
  const seenNaturalKeys = new Map<string, number>(); // naturalKey -> 최초로 그 키를 쓴 행 번호(0-based)

  function fail(type: ErrorType, reason: string, ctx: RowContext) {
    errors.push({
      row: ctx.rowIndex,
      resultYear: ctx.resultYear,
      universityKey: ctx.universityKey,
      departmentKey: ctx.departmentKey,
      admissionTrack: ctx.admissionTrack,
      column: ctx.column,
      type,
      reason,
    });
    willSkip += 1;
  }

  if (!worksheet) {
    errors.push({
      row: -1,
      resultYear: null,
      universityKey: null,
      departmentKey: null,
      admissionTrack: null,
      type: "sheetNotFound",
      reason: "시트를 찾을 수 없습니다.",
    });
    return {
      rows,
      errors,
      warnings,
      summary: {
        willInsert,
        willUpdate,
        willSkip,
        warningCounts: buildTypeCounts(warnings),
        errorCounts: buildTypeCounts(errors),
      },
    };
  }

  const grid = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1 });
  // 컬럼은 위치가 아니라 헤더 이름으로 찾는다 — 컬럼 순서가 바뀌거나
  // 일부 컬럼이 빠진 파일이 와도 안전하다(admissionBulkXlsx.js와 동일 관례).
  const headerRow = Array.isArray(grid[0]) ? grid[0] : [];
  const columnIndexByName = new Map<unknown, number>();
  headerRow.forEach((name, idx) => {
    const key = typeof name === "string" ? name.trim() : name;
    if (
      key !== undefined &&
      key !== null &&
      key !== "" &&
      !columnIndexByName.has(key)
    ) {
      columnIndexByName.set(key, idx);
    }
  });
  const bodyRows = grid.slice(1);

  bodyRows.forEach((rawRow, rowIndex) => {
    // 완전히 빈 행(엑셀 트레일링 공백 등)은 조용히 건너뛴다.
    if (
      !rawRow.some(
        (cell) =>
          cell !== undefined && cell !== null && String(cell).trim() !== "",
      )
    )
      return;

    const rowObj: Record<string, unknown> = {};
    BULK_XLSX_COLUMNS.forEach((col) => {
      const idx = columnIndexByName.get(col);
      rowObj[col] = idx === undefined ? undefined : rawRow[idx];
    });

    // ctx는 검증 도중 계속 갱신되는 게 아니라, 식별자 후보가 아직 확정되지
    // 않은 시점에도 에러 메시지에 "무엇을 보고 있었는지"를 남기기 위한
    // 스냅샷이다 — 값이 비어 있으면 그냥 undefined/원본 셀 값을 담는다.
    const ctx: RowContext = {
      rowIndex,
      resultYear: rowObj.result_year,
      universityKey: clean(rowObj.university_key),
      departmentKey: clean(rowObj.department_key),
      admissionTrack: clean(rowObj.admission_track),
    };

    // (1) 잘림 마커 — 이 테이블은 카테고리 구분 없이 전 컬럼이 "메타데이터"
    // 성격이라(모집요강처럼 재생성 가능한 raw/doc 쌍이 없다), 어느 컬럼에서
    // 발견되든 행 전체를 거부한다(잘린 채 반영하면 데이터가 손상된다).
    const truncatedColumns = BULK_XLSX_COLUMNS.filter(
      (col) =>
        typeof rowObj[col] === "string" &&
        (rowObj[col] as string).includes(TRUNCATION_MARKER),
    );
    if (truncatedColumns.length) {
      fail(
        "truncatedColumn",
        `잘림 마커가 있는 컬럼(${truncatedColumns.join(", ")})이 있어 행을 거부합니다.`,
        ctx,
      );
      return;
    }

    // (2) 필수값. is_active는 parseBooleanCell이 항상 true/false를 돌려주므로
    // (fallback true) 필수값 검사 대상이 아니다 — 빈 셀이면 그냥 노출로 간주한다.
    const universityName = clean(rowObj.university_name);
    const departmentName = clean(rowObj.department_name);
    const missing = [];
    if (!ctx.resultYear && ctx.resultYear !== 0) missing.push("result_year");
    if (!ctx.universityKey) missing.push("university_key");
    if (!universityName) missing.push("university_name");
    if (!ctx.departmentKey) missing.push("department_key");
    if (!departmentName) missing.push("department_name");
    if (!ctx.admissionTrack) missing.push("admission_track");
    if (missing.length) {
      fail(
        "missingRequiredFields",
        `${missing.join(", ")}가 비어 있습니다.`,
        ctx,
      );
      return;
    }

    // (3) result_year 도메인 — 마스터 소스가 2025/2026학년도뿐이다.
    const resultYear = Number(rowObj.result_year);
    if (
      !Number.isInteger(resultYear) ||
      !RESULT_YEAR_OPTIONS.includes(resultYear)
    ) {
      fail(
        "invalidResultYear",
        `result_year는 ${RESULT_YEAR_OPTIONS.join("/")} 중 하나여야 합니다(입력값: ${rowObj.result_year}).`,
        ctx,
      );
      return;
    }
    ctx.resultYear = resultYear;

    // (4) main_track 도메인 — 비어 있으면 통과(CHECK가 null 허용).
    const mainTrack = clean(rowObj.main_track);
    if (mainTrack && !MAIN_TRACK_OPTIONS.includes(mainTrack)) {
      fail(
        "invalidMainTrack",
        `main_track "${mainTrack}"은(는) 허용 값(${MAIN_TRACK_OPTIONS.join("|")})이 아닙니다.`,
        ctx,
      );
      return;
    }

    // (5) screening_category 도메인 — 비어 있으면 통과.
    const screeningCategory = clean(rowObj.screening_category);
    if (
      screeningCategory &&
      !SCREENING_CATEGORY_OPTIONS.includes(screeningCategory)
    ) {
      fail(
        "invalidScreeningCategory",
        `screening_category "${screeningCategory}"은(는) 허용 값(${SCREENING_CATEGORY_OPTIONS.join("|")})이 아닙니다.`,
        ctx,
      );
      return;
    }

    // (6) 등급 9종 — numeric(4,2), 절댓값 100 미만만 허용.
    let gradeValidationFailed = false;
    const gradeValues: Record<string, number | null> = {};
    for (const col of GRADE_COLUMNS) {
      const text = numericCellText(rowObj[col]);
      if (!text) {
        gradeValues[col] = null;
        continue;
      }
      const num = Number(text);
      if (!Number.isFinite(num)) {
        fail(
          "invalidGrade",
          `${col} 값 "${rowObj[col]}"이(가) 숫자가 아닙니다.`,
          { ...ctx, column: col },
        );
        gradeValidationFailed = true;
        break;
      }
      if (Math.abs(num) >= GRADE_RANGE_LIMIT) {
        fail(
          "invalidGrade",
          `${col} 값(${num})이 numeric(4,2) 범위(절댓값 100 미만)를 벗어났습니다.`,
          { ...ctx, column: col },
        );
        gradeValidationFailed = true;
        break;
      }
      gradeValues[col] = num;
    }
    if (gradeValidationFailed) return;

    // (7) converted_score/percentile — DB에 정밀도 제약이 없어 "숫자인가"만 본다.
    let scoreValidationFailed = false;
    const scoreValues: Record<string, number | null> = {};
    for (const col of ["converted_score", "percentile"]) {
      const text = numericCellText(rowObj[col]);
      if (!text) {
        scoreValues[col] = null;
        continue;
      }
      const num = Number(text);
      if (!Number.isFinite(num)) {
        fail(
          "invalidNumber",
          `${col} 값 "${rowObj[col]}"이(가) 숫자가 아닙니다.`,
          { ...ctx, column: col },
        );
        scoreValidationFailed = true;
        break;
      }
      scoreValues[col] = num;
    }
    if (scoreValidationFailed) return;

    // (8) competition_rate — numeric(6,2), 절댓값 10,000 미만.
    const competitionRateText = numericCellText(rowObj.competition_rate);
    let competitionRate: number | null = null;
    if (competitionRateText) {
      const num = Number(competitionRateText);
      if (!Number.isFinite(num)) {
        fail(
          "invalidCompetitionRate",
          `competition_rate 값 "${rowObj.competition_rate}"이(가) 숫자가 아닙니다.`,
          ctx,
        );
        return;
      }
      if (Math.abs(num) >= COMPETITION_RATE_RANGE_LIMIT) {
        fail(
          "invalidCompetitionRate",
          `competition_rate 값(${num})이 numeric(6,2) 범위(절댓값 10,000 미만)를 벗어났습니다.`,
          ctx,
        );
        return;
      }
      competitionRate = num;
    }

    // (9) 정수 컬럼 3종 — quota/source_row(integer), variant_seq(smallint).
    // variant_seq는 빈 셀이면 기본값 0(sql/53 default와 동일)으로 채운다.
    let integerValidationFailed = false;
    const integerValues: Record<string, number | null> = {};
    for (const col of INTEGER_COLUMNS) {
      const text = numericCellText(rowObj[col]);
      if (!text) {
        integerValues[col] = col === "variant_seq" ? 0 : null;
        continue;
      }
      const num = Number(text);
      if (!Number.isInteger(num)) {
        fail(
          "invalidInteger",
          `${col} 값 "${rowObj[col]}"이(가) 정수가 아닙니다.`,
          { ...ctx, column: col },
        );
        integerValidationFailed = true;
        break;
      }
      integerValues[col] = num;
    }
    if (integerValidationFailed) return;

    // (10) id 기반 insert/update 분기 — 이 테이블의 유일한 매칭 키.
    const idText = numericCellText(rowObj.id);
    let existingId: number | null = null;
    const isInsert = idText === "";
    if (!isInsert) {
      const idNum = Number(idText);
      if (!Number.isFinite(idNum)) {
        fail("invalidId", `id 값 "${rowObj.id}"이(가) 숫자가 아닙니다.`, ctx);
        return;
      }
      if (!existingIdSet.has(idNum)) {
        fail(
          "idNotFound",
          `id ${idNum}이(가) DB에 존재하지 않습니다(삭제됐거나 오타일 수 있습니다).`,
          ctx,
        );
        return;
      }
      existingId = idNum;
    }

    // (11) 파일 내부 자연키 중복 — DB 유일성 인덱스(coalesce 표현식)와
    // 동일 축으로 접어 비교한다. DB 제약 위반으로 청크 전체가 롤백되는
    // 것보다 미리보기에서 거부하는 게 낫다(브리핑 (B) 요구사항).
    const naturalKey = naturalKeyOf({
      result_year: resultYear,
      university_key: ctx.universityKey,
      department_key: ctx.departmentKey,
      main_track: mainTrack,
      screening_category: screeningCategory,
      admission_track: ctx.admissionTrack,
      subject_reflection: clean(rowObj.subject_reflection),
      variant_seq: integerValues.variant_seq,
    });
    if (seenNaturalKeys.has(naturalKey)) {
      const firstRow = seenNaturalKeys.get(naturalKey) as number;
      fail(
        "duplicateNaturalKey",
        `행 ${firstRow + 1}과 자연키(학년도·대학·모집단위·중심전형·전형유형·전형명·반영교과·분할모집순번)가 동일합니다.`,
        ctx,
      );
      return;
    }
    seenNaturalKeys.set(naturalKey, rowIndex);

    // (12) 경고 3종 — 거부는 아니지만 관리자가 확인해야 하는 값.
    const allGradesEmpty = GRADE_COLUMNS.every(
      (col) => gradeValues[col] === null,
    );
    if (allGradesEmpty) {
      warnings.push({
        row: rowIndex,
        resultYear,
        universityKey: ctx.universityKey,
        departmentKey: ctx.departmentKey,
        admissionTrack: ctx.admissionTrack,
        type: "allGradesEmpty",
        reason: "등급 9종이 전부 비어 있습니다.",
      });
    }
    // 경쟁률 0은 "결측"이 아니라 명시적 0으로 저장되면 공개 화면에 "0.00 : 1"
    // 이 그대로 노출된다(§Q2 정책상 결측은 null이어야 한다) — 저장은 그대로
    // 두되(관리자가 의도했을 수도 있어 거부하지는 않는다) 경고만 남긴다.
    if (competitionRate === 0) {
      warnings.push({
        row: rowIndex,
        resultYear,
        universityKey: ctx.universityKey,
        departmentKey: ctx.departmentKey,
        admissionTrack: ctx.admissionTrack,
        column: "competition_rate",
        type: "competitionRateZero",
        reason:
          "경쟁률이 0입니다 — §Q2 정책상 미공개는 0이 아니라 빈 값이어야 합니다.",
      });
    }
    if (
      gradeValues.grade_50 !== null &&
      gradeValues.grade_70 !== null &&
      gradeValues.grade_50 > gradeValues.grade_70
    ) {
      warnings.push({
        row: rowIndex,
        resultYear,
        universityKey: ctx.universityKey,
        departmentKey: ctx.departmentKey,
        admissionTrack: ctx.admissionTrack,
        column: "grade_50",
        type: "gradeCutInversion",
        reason: `50%컷(${gradeValues.grade_50})이 70%컷(${gradeValues.grade_70})보다 낮은 등급(숫자가 큼) 역전입니다 — 원문을 확인하세요.`,
      });
    }

    if (isInsert) willInsert += 1;
    else willUpdate += 1;

    const payload: ResultPayload = {
      result_year: resultYear,
      university_key: ctx.universityKey as string,
      university_name: universityName,
      department_key: ctx.departmentKey as string,
      department_name: departmentName,
      main_track: mainTrack || null,
      screening_category: screeningCategory || null,
      admission_track: ctx.admissionTrack as string,
      grade_50: gradeValues.grade_50,
      grade_70: gradeValues.grade_70,
      grade_85: gradeValues.grade_85,
      grade_90: gradeValues.grade_90,
      grade_avg: gradeValues.grade_avg,
      grade_min: gradeValues.grade_min,
      grade_avg10: gradeValues.grade_avg10,
      grade_min10: gradeValues.grade_min10,
      grade_first_avg: gradeValues.grade_first_avg,
      converted_score: scoreValues.converted_score,
      percentile: scoreValues.percentile,
      quota: integerValues.quota,
      competition_rate: competitionRate,
      waitlist_rank: clean(rowObj.waitlist_rank) || null,
      subject_reflection: clean(rowObj.subject_reflection) || null,
      // 위 (9)에서 빈 셀이면 0으로 채워 항상 number다(null 없음).
      variant_seq: integerValues.variant_seq as number,
      source_sheet: clean(rowObj.source_sheet) || null,
      source_row: integerValues.source_row,
      note: clean(rowObj.note) || null,
      is_active: parseBooleanCell(rowObj.is_active, true),
      // id: insert면 생략(bigint identity 자동 채번), update면 아래서 채운다.
      // created_at/updated_at: 읽지도 쓰지도 않는다(DB가 관리).
    };
    // isInsert가 false인 분기에서만 도달하며, 그 경로에서 existingId는
    // 위 (10)의 idNotFound 검증을 통과해야만 여기까지 오므로 항상 number다.
    if (!isInsert) payload.id = existingId as number;

    rows.push(payload);
  });

  return {
    rows,
    errors,
    warnings,
    summary: {
      willInsert,
      willUpdate,
      willSkip,
      warningCounts: buildTypeCounts(warnings),
      errorCounts: buildTypeCounts(errors),
    },
  };
}
