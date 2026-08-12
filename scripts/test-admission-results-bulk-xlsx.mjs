// =====================================================================
// src/lib/admissionResultsBulkXlsx.js(exportAdmissionResultRowsToXlsx/
// parseAdmissionResultRowsFromXlsx)의 순수 함수 회귀 테스트.
//
// 43,170행 실데이터·DB는 쓰지 않는다 — 손으로 만든 최소 픽스처로 순수
// 함수만 호출한다(scripts/test-admission-results-aggregate.mjs와 동일
// 원칙). DB 접근이 필요한 왕복 검증(id 매칭 등)은 이 스크립트의 범위가
// 아니다 — existingIdSet은 여기서 합성 Set으로 직접 만든다.
//
// 사용법: node scripts/test-admission-results-bulk-xlsx.mjs
// 종료 코드: 전부 통과하면 0, 하나라도 실패하면 1.
// =====================================================================

import * as XLSX from 'xlsx';

import {
  BULK_XLSX_COLUMNS,
  MAIN_TRACK_OPTIONS,
  SCREENING_CATEGORY_OPTIONS,
  RESULT_YEAR_OPTIONS,
  TRUNCATION_MARKER,
  exportAdmissionResultRowsToXlsx,
  parseAdmissionResultRowsFromXlsx
} from '../src/lib/admissionResultsBulkXlsx.js';

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

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: 기대 ${JSON.stringify(expected)}, 실제 ${JSON.stringify(actual)}`);
  }
}

// DB에서 읽어온 행 모양의 최소 픽스처. 겹치는 값을 명시하지 않은
// 컬럼은 전부 비어 있다고 가정한다.
function dbRow(overrides = {}) {
  return {
    id: 1,
    is_active: true,
    result_year: 2026,
    university_key: 'winning-univ',
    university_name: '위닝대학교',
    department_key: 'cs',
    department_name: '컴퓨터공학과',
    main_track: '교과',
    screening_category: '일반',
    admission_track: '일반전형',
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
    waitlist_rank: '3배수',
    subject_reflection: '국어·수학·영어',
    variant_seq: 0,
    source_sheet: '입결_마스터_2개년',
    source_row: 42,
    note: null,
    ...overrides
  };
}

// 헤더 + rowObj 하나로 워크북을 만든다. rowObj에 없는 컬럼은 빈 문자열로
// 채운다(엑셀에서 빈 셀을 그대로 흉내낸다).
function buildWorkbook(rowObjs) {
  const header = BULK_XLSX_COLUMNS;
  const dataRows = rowObjs.map((rowObj) => header.map((col) => (col in rowObj ? rowObj[col] : '')));
  const ws = XLSX.utils.aoa_to_sheet([header, ...dataRows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '입결정보');
  return wb;
}

function roundTripWorkbook(workbook) {
  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
  return XLSX.read(buffer, { type: 'buffer' });
}

// ---------------------------------------------------------------------
// 1) 정상 왕복(export → parse) — 값이 그대로 보존되는지.
// ---------------------------------------------------------------------

check('정상 왕복: export한 행을 다시 parse하면 update로 분류되고 값이 보존된다', () => {
  const original = dbRow();
  const { workbook, truncatedCells } = exportAdmissionResultRowsToXlsx([original]);
  assert(truncatedCells.length === 0, `잘린 셀이 있음(${truncatedCells.length}건) — 선행 조건 실패`);

  const roundTripped = roundTripWorkbook(workbook);
  const existingIdSet = new Set([original.id]);
  const { rows, errors, warnings, summary } = parseAdmissionResultRowsFromXlsx(roundTripped, existingIdSet);

  assert(errors.length === 0, `에러 ${errors.length}건: ${JSON.stringify(errors)}`);
  assert(rows.length === 1, `행이 1개여야 함(실제 ${rows.length})`);
  assertEqual(summary.willInsert, 0, 'willInsert');
  assertEqual(summary.willUpdate, 1, 'willUpdate');
  assertEqual(summary.willSkip, 0, 'willSkip');
  assertEqual(warnings.length, 0, '경고 없어야 함(정상 데이터)');

  const row = rows[0];
  assertEqual(row.id, original.id, 'id');
  assertEqual(row.university_key, original.university_key, 'university_key');
  assertEqual(row.university_name, original.university_name, 'university_name');
  assertEqual(row.department_key, original.department_key, 'department_key');
  assertEqual(row.main_track, original.main_track, 'main_track');
  assertEqual(row.screening_category, original.screening_category, 'screening_category');
  assertEqual(row.grade_50, original.grade_50, 'grade_50');
  assertEqual(row.grade_70, original.grade_70, 'grade_70');
  assertEqual(row.quota, original.quota, 'quota');
  assertEqual(row.competition_rate, original.competition_rate, 'competition_rate');
  assertEqual(row.waitlist_rank, original.waitlist_rank, 'waitlist_rank');
  assertEqual(row.subject_reflection, original.subject_reflection, 'subject_reflection');
  assertEqual(row.variant_seq, original.variant_seq, 'variant_seq');
  assertEqual(row.source_sheet, original.source_sheet, 'source_sheet');
  assertEqual(row.source_row, original.source_row, 'source_row');
  assertEqual(row.is_active, original.is_active, 'is_active');
});

check('정상 왕복: 등급·경쟁률 등 수치 컬럼은 export 시점에 숫자 타입을 유지한다(문자열로 안 바뀜)', () => {
  const { workbook } = exportAdmissionResultRowsToXlsx([dbRow()]);
  const ws = workbook.Sheets[workbook.SheetNames[0]];
  const gradeCol = BULK_XLSX_COLUMNS.indexOf('grade_50');
  const gradeAddr = XLSX.utils.encode_cell({ r: 1, c: gradeCol });
  assertEqual(ws[gradeAddr].t, 'n', 'grade_50 셀 타입');
  const nameCol = BULK_XLSX_COLUMNS.indexOf('university_name');
  const nameAddr = XLSX.utils.encode_cell({ r: 1, c: nameCol });
  assertEqual(ws[nameAddr].t, 's', 'university_name 셀 타입');
});

// ---------------------------------------------------------------------
// 2) id 없는 신규행 → insert
// ---------------------------------------------------------------------

check('id가 빈 셀이면 insert로 분류되고 payload에 id 키가 없다', () => {
  const wb = buildWorkbook([{ ...dbRow(), id: '' }]);
  const { rows, errors, summary } = parseAdmissionResultRowsFromXlsx(wb, new Set([999]));

  assert(errors.length === 0, `에러 ${errors.length}건: ${JSON.stringify(errors)}`);
  assertEqual(summary.willInsert, 1, 'willInsert');
  assertEqual(summary.willUpdate, 0, 'willUpdate');
  assert(!('id' in rows[0]), 'insert 행 payload에 id 키가 있으면 안 됨(DB가 자동 채번)');
});

// ---------------------------------------------------------------------
// 3) 존재하지 않는 id → 거부
// ---------------------------------------------------------------------

check('id가 있는데 existingIdSet에 없으면 idNotFound로 거부된다', () => {
  const wb = buildWorkbook([dbRow({ id: 555 })]);
  const { rows, errors, summary } = parseAdmissionResultRowsFromXlsx(wb, new Set([1, 2, 3]));

  assertEqual(rows.length, 0, 'payload가 비어 있어야 함');
  assertEqual(errors.length, 1, '에러 1건');
  assertEqual(errors[0].type, 'idNotFound', '에러 type');
  assertEqual(summary.willSkip, 1, 'willSkip');
  assertEqual(summary.errorCounts.idNotFound, 1, 'errorCounts.idNotFound');
});

check('id 셀이 숫자로 파싱되지 않으면 invalidId로 거부된다', () => {
  const wb = buildWorkbook([dbRow({ id: 'abc-not-a-number' })]);
  const { rows, errors } = parseAdmissionResultRowsFromXlsx(wb, new Set([1]));
  assertEqual(rows.length, 0, 'payload가 비어 있어야 함');
  assertEqual(errors[0].type, 'invalidId', '에러 type');
});

// ---------------------------------------------------------------------
// 4) 파일 내 자연키 중복 → 거부
// ---------------------------------------------------------------------

check('파일 안에서 8축 자연키가 중복되면 두 번째 행이 duplicateNaturalKey로 거부된다', () => {
  const first = dbRow({ id: 1 });
  const second = dbRow({ id: 2 }); // 나머지 8축은 동일 — 진성 중복
  const wb = buildWorkbook([first, second]);
  const { rows, errors, summary } = parseAdmissionResultRowsFromXlsx(wb, new Set([1, 2]));

  assertEqual(rows.length, 1, '첫 번째 행만 남아야 함');
  assertEqual(errors.length, 1, '에러 1건(두 번째 행)');
  assertEqual(errors[0].type, 'duplicateNaturalKey', '에러 type');
  assertEqual(errors[0].row, 1, '거부된 행은 두 번째 행(0-based index 1)');
  assertEqual(summary.willInsert, 0, 'willInsert(둘 다 update 대상 id라 0)');
  assertEqual(summary.willUpdate, 1, 'willUpdate(첫 행만)');
  assertEqual(summary.willSkip, 1, 'willSkip');
});

check('variant_seq만 다르면(분할모집) 자연키가 갈려 중복이 아니다', () => {
  const first = dbRow({ id: 1, variant_seq: 0 });
  const second = dbRow({ id: 2, variant_seq: 1 });
  const wb = buildWorkbook([first, second]);
  const { rows, errors } = parseAdmissionResultRowsFromXlsx(wb, new Set([1, 2]));

  assertEqual(errors.length, 0, `에러가 없어야 함: ${JSON.stringify(errors)}`);
  assertEqual(rows.length, 2, '두 행 모두 남아야 함');
});

check('main_track이 다르면(교과 vs 종합) 나머지 7축이 같아도 중복이 아니다', () => {
  const first = dbRow({ id: 1, main_track: '교과' });
  const second = dbRow({ id: 2, main_track: '종합' });
  const wb = buildWorkbook([first, second]);
  const { rows, errors } = parseAdmissionResultRowsFromXlsx(wb, new Set([1, 2]));

  assertEqual(errors.length, 0, `에러가 없어야 함: ${JSON.stringify(errors)}`);
  assertEqual(rows.length, 2, '두 행 모두 남아야 함');
});

// ---------------------------------------------------------------------
// 5) CHECK 도메인 위반 → 거부
// ---------------------------------------------------------------------

check('result_year가 2025/2026이 아니면 invalidResultYear로 거부된다', () => {
  const wb = buildWorkbook([dbRow({ id: 1, result_year: 2099 })]);
  const { rows, errors } = parseAdmissionResultRowsFromXlsx(wb, new Set([1]));
  assertEqual(rows.length, 0, 'payload가 비어 있어야 함');
  assertEqual(errors[0].type, 'invalidResultYear', '에러 type');
  assert(RESULT_YEAR_OPTIONS.includes(2026), '선행 조건: RESULT_YEAR_OPTIONS에 2026 포함');
});

check('main_track이 CHECK 도메인 밖이면 invalidMainTrack으로 거부된다', () => {
  const wb = buildWorkbook([dbRow({ id: 1, main_track: '학생부교과' })]); // 접두어 있는 옛 표기는 거부 대상
  const { rows, errors } = parseAdmissionResultRowsFromXlsx(wb, new Set([1]));
  assertEqual(rows.length, 0, 'payload가 비어 있어야 함');
  assertEqual(errors[0].type, 'invalidMainTrack', '에러 type');
  assert(MAIN_TRACK_OPTIONS.includes('교과'), '선행 조건: MAIN_TRACK_OPTIONS에 교과 포함');
});

check('main_track이 비어 있으면 CHECK가 null을 허용하므로 통과한다', () => {
  const wb = buildWorkbook([dbRow({ id: 1, main_track: '' })]);
  const { rows, errors } = parseAdmissionResultRowsFromXlsx(wb, new Set([1]));
  assertEqual(errors.length, 0, `에러가 없어야 함: ${JSON.stringify(errors)}`);
  assertEqual(rows[0].main_track, null, 'main_track은 null로 저장');
});

check('screening_category가 CHECK 도메인 밖이면 invalidScreeningCategory로 거부된다', () => {
  const wb = buildWorkbook([dbRow({ id: 1, screening_category: '특기자' })]);
  const { rows, errors } = parseAdmissionResultRowsFromXlsx(wb, new Set([1]));
  assertEqual(rows.length, 0, 'payload가 비어 있어야 함');
  assertEqual(errors[0].type, 'invalidScreeningCategory', '에러 type');
  assert(SCREENING_CATEGORY_OPTIONS.includes('일반'), '선행 조건: SCREENING_CATEGORY_OPTIONS에 일반 포함');
});

check('필수값(university_key 등)이 비어 있으면 missingRequiredFields로 거부된다', () => {
  const wb = buildWorkbook([dbRow({ id: 1, university_key: '' })]);
  const { rows, errors } = parseAdmissionResultRowsFromXlsx(wb, new Set([1]));
  assertEqual(rows.length, 0, 'payload가 비어 있어야 함');
  assertEqual(errors[0].type, 'missingRequiredFields', '에러 type');
  assert(errors[0].reason.includes('university_key'), '에러 사유에 university_key가 명시돼야 함');
});

check('등급이 numeric(4,2) 범위(절댓값 100 미만)를 벗어나면 invalidGrade로 거부된다', () => {
  const wb = buildWorkbook([dbRow({ id: 1, grade_50: 123.4 })]);
  const { rows, errors } = parseAdmissionResultRowsFromXlsx(wb, new Set([1]));
  assertEqual(rows.length, 0, 'payload가 비어 있어야 함');
  assertEqual(errors[0].type, 'invalidGrade', '에러 type');
});

check('quota가 정수가 아니면 invalidInteger로 거부된다', () => {
  const wb = buildWorkbook([dbRow({ id: 1, quota: 10.5 })]);
  const { rows, errors } = parseAdmissionResultRowsFromXlsx(wb, new Set([1]));
  assertEqual(rows.length, 0, 'payload가 비어 있어야 함');
  assertEqual(errors[0].type, 'invalidInteger', '에러 type');
});

check('잘림 마커가 있는 셀이 있으면 truncatedColumn으로 행 전체가 거부된다', () => {
  const wb = buildWorkbook([dbRow({ id: 1, note: `메모${TRUNCATION_MARKER}` })]);
  const { rows, errors } = parseAdmissionResultRowsFromXlsx(wb, new Set([1]));
  assertEqual(rows.length, 0, 'payload가 비어 있어야 함');
  assertEqual(errors[0].type, 'truncatedColumn', '에러 type');
});

// ---------------------------------------------------------------------
// 6) 경고 3종(거부 아님, 값은 반영됨)
// ---------------------------------------------------------------------

check('경고: 등급 9종이 전부 비어 있으면 allGradesEmpty 경고가 남고 행은 정상 반영된다', () => {
  const wb = buildWorkbook([
    dbRow({
      id: 1,
      grade_50: '',
      grade_70: '',
      grade_85: '',
      grade_90: '',
      grade_avg: '',
      grade_min: '',
      grade_avg10: '',
      grade_min10: '',
      grade_first_avg: ''
    })
  ]);
  const { rows, errors, warnings } = parseAdmissionResultRowsFromXlsx(wb, new Set([1]));
  assertEqual(errors.length, 0, `에러가 없어야 함: ${JSON.stringify(errors)}`);
  assertEqual(rows.length, 1, '행은 반영돼야 함(거부 아님)');
  const warning = warnings.find((w) => w.type === 'allGradesEmpty');
  assert(Boolean(warning), 'allGradesEmpty 경고가 있어야 함');
});

check('경고: 경쟁률이 0이면 competitionRateZero 경고가 남고 값은 0 그대로 반영된다(자동 null 변환 없음)', () => {
  const wb = buildWorkbook([dbRow({ id: 1, competition_rate: 0 })]);
  const { rows, warnings } = parseAdmissionResultRowsFromXlsx(wb, new Set([1]));
  assertEqual(rows[0].competition_rate, 0, '경쟁률 0이 그대로 저장돼야 함(임의 null 변환 금지)');
  const warning = warnings.find((w) => w.type === 'competitionRateZero');
  assert(Boolean(warning), 'competitionRateZero 경고가 있어야 함');
});

check('경고: 50%컷이 70%컷보다 낮은 등급(숫자가 큼)이면 gradeCutInversion 경고가 남는다', () => {
  const wb = buildWorkbook([dbRow({ id: 1, grade_50: 3.5, grade_70: 2.1 })]);
  const { rows, warnings } = parseAdmissionResultRowsFromXlsx(wb, new Set([1]));
  assertEqual(rows.length, 1, '행은 반영돼야 함(거부 아님)');
  const warning = warnings.find((w) => w.type === 'gradeCutInversion');
  assert(Boolean(warning), 'gradeCutInversion 경고가 있어야 함');
});

check('정상 범위(50%컷 <= 70%컷)면 gradeCutInversion 경고가 없다', () => {
  const wb = buildWorkbook([dbRow({ id: 1, grade_50: 2.1, grade_70: 2.5 })]);
  const { warnings } = parseAdmissionResultRowsFromXlsx(wb, new Set([1]));
  const warning = warnings.find((w) => w.type === 'gradeCutInversion');
  assert(!warning, '정상 범위인데 역전 경고가 남으면 안 됨');
});

// ---------------------------------------------------------------------
// 7) summary 집계 정확성
// ---------------------------------------------------------------------

check('summary: insert/update/skip/경고 건수가 실제 rows/errors/warnings와 일치한다', () => {
  const rowsInput = [
    { ...dbRow({ id: '', university_key: 'brand-new-univ', department_key: 'new-dept' }) }, // insert(자연키가 달라야 함)
    dbRow({ id: 1 }), // update
    dbRow({ id: 2, university_key: 'other-univ', department_key: 'ee', competition_rate: 0 }), // update + 경고 1건
    dbRow({ id: 999 }) // idNotFound → skip
  ];
  delete rowsInput[0].id;
  const wb = buildWorkbook(rowsInput);
  const { rows, errors, warnings, summary } = parseAdmissionResultRowsFromXlsx(wb, new Set([1, 2]));

  assertEqual(summary.willInsert, 1, 'willInsert');
  assertEqual(summary.willUpdate, 2, 'willUpdate');
  assertEqual(summary.willSkip, 1, 'willSkip');
  assertEqual(rows.length, summary.willInsert + summary.willUpdate, 'rows.length === insert+update');
  assertEqual(errors.length, summary.willSkip, 'errors.length === willSkip');
  assertEqual(
    Object.values(summary.warningCounts).reduce((a, b) => a + b, 0),
    warnings.length,
    'warningCounts 총합 === warnings.length'
  );
  assertEqual(
    Object.values(summary.errorCounts).reduce((a, b) => a + b, 0),
    errors.length,
    'errorCounts 총합 === errors.length'
  );
  assertEqual(summary.errorCounts.idNotFound, 1, 'errorCounts.idNotFound');
  assertEqual(summary.warningCounts.competitionRateZero, 1, 'warningCounts.competitionRateZero');
});

check('sheetNotFound: 빈 워크북(시트 없음)을 넘기면 에러 1건만 나오고 죽지 않는다', () => {
  const emptyWorkbook = { SheetNames: [], Sheets: {} };
  const { rows, errors, summary } = parseAdmissionResultRowsFromXlsx(emptyWorkbook, new Set());
  assertEqual(rows.length, 0, 'rows는 비어 있어야 함');
  assertEqual(errors.length, 1, '에러 1건');
  assertEqual(errors[0].type, 'sheetNotFound', '에러 type');
  assertEqual(summary.willSkip, 0, '시트 자체가 없으면 willSkip은 0(행 단위 집계가 아님)');
});

console.log(`\n총 ${passCount + failCount}건 중 ${passCount}건 통과, ${failCount}건 실패.`);
process.exitCode = failCount ? 1 : 0;
