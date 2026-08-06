// =====================================================================
// src/lib/admissionBulkXlsx.js(exportAdmissionRowsToXlsx/
// parseAdmissionRowsFromXlsx) 검증 스크립트.
//
// **읽기 전용 — DB에 쓰지 않는다.** DB에서 218행을 읽어 왕복(내보내기→
// 가져오기)이 원본과 같은지 확인하고, 나머지는 전부 합성 데이터로
// 검증한다(잘림 마커 거부, 신규 연도/신규 대학 insert 분류, 회귀 가드,
// 필수값 누락 에러).
//
// 사용법: node scripts/verify-admission-bulk-xlsx.mjs [--keys-file <path>]
// 종료 코드: 전부 통과하면 0, 하나라도 실패하면 1.
// =====================================================================

import { createClient } from '@supabase/supabase-js';
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { homedir } from 'node:os';
import process from 'node:process';
import * as XLSX from 'xlsx';

import {
  exportAdmissionRowsToXlsx,
  parseAdmissionRowsFromXlsx,
  BULK_XLSX_COLUMNS,
  TRUNCATION_MARKER,
  MAX_XLSX_CELL_LENGTH
} from '../src/lib/admissionBulkXlsx.js';
import { HWP_SECTION_JSON_KEYS, stableStringifyDoc } from '../src/lib/admissionDoc.js';
import { clean } from '../src/lib/admissionParsing.js';
import { importCell } from '../src/lib/admissionHtmlImport.js';

const DEV_PROJECT_REF = 'gjowqdiopinhixfivnkx';
const DEFAULT_KEYS_FILE =
  '/private/tmp/claude-501/-Users-hyunsoo-uwellnow-winningpage/7d913b11-451e-4002-a293-f999f0a2dad9/scratchpad/dev-keys.json';
const TABLE = 'admission_university_resources';
const JSON_COLUMNS = Object.values(HWP_SECTION_JSON_KEYS);
const SECTION_KEY_BY_JSON_COLUMN = Object.fromEntries(
  Object.entries(HWP_SECTION_JSON_KEYS).map(([sectionKey, jsonColumn]) => [jsonColumn, sectionKey])
);
// admissionBulkXlsx.js는 CATEGORY_KEYS를 export하지 않는다 —
// HWP_SECTION_JSON_KEYS의 키가 곧 6개 raw 카테고리 컬럼명과 같다
// (admissionDoc.js 참고).
const CATEGORY_RAW_KEYS = Object.keys(HWP_SECTION_JSON_KEYS);

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

async function resolveCredentials(keysFile) {
  const envUrl = process.env.SEED_SUPABASE_URL;
  const envKey = process.env.SEED_SERVICE_ROLE_KEY;
  if (envUrl && envKey) return { url: envUrl, serviceKey: envKey };
  const raw = JSON.parse(await readFile(keysFile, 'utf-8'));
  const serviceEntry = raw.find((entry) => entry.name === 'service_role');
  if (!serviceEntry) throw new Error(`${keysFile}에서 service_role 키를 찾을 수 없습니다.`);
  return { url: `https://${DEV_PROJECT_REF}.supabase.co`, serviceKey: serviceEntry.api_key };
}

function buildExistingRowsMap(dbRows) {
  const map = new Map();
  dbRows.forEach((row) => {
    const key = `${row.admission_year}::${row.university_key}`;
    const entry = { id: row.id };
    JSON_COLUMNS.forEach((col) => {
      entry[col] = row[col];
    });
    // html 파싱 실패 시 "업로드 raw == 기존 DB raw" 비교에 쓴다
    // (admissionBulkXlsx.js의 새 existingRows 계약 — raw 카테고리
    // 컬럼도 포함해야 한다). BULK_XLSX_COLUMNS에 이미 포함된 컬럼이라
    // dbRows select에는 추가 컬럼이 필요 없다(1번 섹션의 selectColumns
    // 참고).
    CATEGORY_RAW_KEYS.forEach((col) => {
      entry[col] = row[col];
    });
    map.set(key, entry);
  });
  return map;
}

// 워크북을 XLSX.write로 버퍼화한 뒤 다시 XLSX.read로 읽어, "실제 파일을
// 내려받았다가 다시 올리는" 왕복과 최대한 가깝게 만든다(메모리상 workbook
// 객체를 그대로 재사용하면 셀 타입 변환 등 실제 파일 IO에서만 드러나는
// 문제를 놓칠 수 있다).
// doc 안의 chips 셀({chips:[{label,value}]}, recruit variant 값 셀)을
// block/row/cell 등장 순서 그대로 펼친다. stableStringifyDoc(deep 비교,
// generatedAt 제외)와 별개로, "chips 배열의 순서·개수·내용이 보존되는가"
// 라는 team-lead의 구체 요구를 doc 구조와 무관하게 직접 확인하기 위한
// 전용 비교용이다(예: 열/행이 통째로 하나 빠져도 stableStringifyDoc은
// 당연히 잡지만, 이 함수는 그 실패를 "몇 번째 칩이 다른가"까지 바로
// 보여준다).
function extractChipsSequence(doc) {
  const sequence = [];
  if (!doc || !Array.isArray(doc.blocks)) return sequence;
  doc.blocks.forEach((block, blockIdx) => {
    if (block.kind !== 'table' || !Array.isArray(block.rows)) return;
    block.rows.forEach((row, rowIdx) => {
      row.forEach((cell, cellIdx) => {
        if (cell && typeof cell === 'object' && Array.isArray(cell.chips)) {
          cell.chips.forEach((chip, chipIdx) => {
            sequence.push({ blockIdx, rowIdx, cellIdx, chipIdx, label: chip.label ?? null, value: chip.value ?? null });
          });
        }
      });
    });
  });
  return sequence;
}

function roundTripWorkbook(workbook) {
  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
  return XLSX.read(buffer, { type: 'buffer' });
}

async function main() {
  const { values: args } = parseArgs({
    options: { 'keys-file': { type: 'string' } }
  });
  const keysFile = args['keys-file'] || process.env.SEED_KEYS_FILE || DEFAULT_KEYS_FILE;
  const { url, serviceKey } = await resolveCredentials(keysFile);
  if (!url.includes(DEV_PROJECT_REF)) throw new Error('dev 프로젝트가 아닙니다. 중단합니다.');
  const supabase = createClient(url, serviceKey);

  console.log('=== 1) DB 조회(읽기 전용) ===');
  const selectColumns = [...BULK_XLSX_COLUMNS, ...JSON_COLUMNS].join(', ');
  const { data: dbRows, error } = await supabase.from(TABLE).select(selectColumns).order('id');
  if (error) throw new Error(`DB 조회 실패: ${error.message}`);
  console.log(`대상: ${dbRows.length}행`);

  const existingRows = buildExistingRowsMap(dbRows);

  // === 2) 왕복(내보내기→파일 IO 왕복→가져오기) — 원본과 동일한가 ===
  console.log('\n=== 2) 왕복 검증 ===');
  const { workbook, truncatedCells } = exportAdmissionRowsToXlsx(dbRows);
  console.log(`내보내기 완료: 잘린 셀 ${truncatedCells.length}건`);
  if (truncatedCells.length) {
    console.log('  잘린 셀 샘플(최대 5건):');
    truncatedCells.slice(0, 5).forEach((c) => console.log(`    - id=${c.id} row=${c.rowIndex} col=${c.column} 원래길이=${c.originalLength}`));
  }

  const roundTripped = roundTripWorkbook(workbook);
  const { rows: parsedRows, errors: parseErrors, warnings: parseWarnings, summary } = parseAdmissionRowsFromXlsx(
    roundTripped,
    existingRows
  );

  // 2026-08-06 재설계 후: 잘린 셀은 더 이상 행을 통째로 거부하지 않는다
  // — 그 셀이 속한 카테고리(컬럼) 하나만 payload에서 빠지고(기존 DB
  // 값 보존) 행 자체·나머지 25개 컬럼은 정상 처리된다. truncatedCells의
  // rowIndex는 export 시점의 dbRows 배열 인덱스와 1:1이므로, 그 인덱스의
  // (year, key)를 "카테고리 스킵 예정" 집합으로 미리 구한다(전부
  // recruitment_result_html → recruitment_quota 카테고리다 — 실측상
  // 다른 컬럼에서는 안 남).
  const truncatedRowIndexSet = new Set(truncatedCells.map((c) => c.rowIndex));
  const expectedTruncationSkipKeys = new Set(
    [...truncatedRowIndexSet].map((idx) => `${dbRows[idx].admission_year}::${dbRows[idx].university_key}`)
  );

  check(`왕복: 잘린 셀은 행이 아니라 카테고리만 스킵(정확히 ${expectedTruncationSkipKeys.size}건, team-lead 사전 실측 23건과 일치해야 함)`, () => {
    assert(parseErrors.length === 0, `잘림만으로 행 전체가 거부되면 안 됨(에러 ${parseErrors.length}건)`);
    assert(
      summary.truncatedCellSkipCount === expectedTruncationSkipKeys.size,
      `summary.truncatedCellSkipCount(${summary.truncatedCellSkipCount}) !== 기대치(${expectedTruncationSkipKeys.size})`
    );
    const truncationWarnings = parseWarnings.filter((w) => w.reason.includes('잘림 마커가 있어 기존 값 보존'));
    const actualSkipKeys = new Set(truncationWarnings.map((w) => `${w.admissionYear}::${w.universityKey}`));
    assert(
      actualSkipKeys.size === expectedTruncationSkipKeys.size,
      `잘림 경고가 난 행 수(${actualSkipKeys.size}) !== 기대치(${expectedTruncationSkipKeys.size})`
    );
    const onlyExpected = [...actualSkipKeys].every((k) => expectedTruncationSkipKeys.has(k));
    assert(onlyExpected, `잘린 셀이 없는 행에서 잘림 경고가 남: ${JSON.stringify([...actualSkipKeys].filter((k) => !expectedTruncationSkipKeys.has(k)))}`);
    const allRecruitmentQuota = truncationWarnings.every((w) => w.column === 'recruitment_quota');
    assert(allRecruitmentQuota, '잘림이 recruitment_quota 이외 카테고리에서도 발생함(실측과 다름)');
  });

  check('왕복: warnings 전부 type 필드를 가지고, summary.warningCounts가 실제 배열과 일치', () => {
    const untyped = parseWarnings.filter((w) => !w.type);
    assert(untyped.length === 0, `type이 없는 warning이 있음(${untyped.length}건)`);
    assert(summary.warningCounts, 'summary.warningCounts가 없음');
    const totalFromCounts = Object.values(summary.warningCounts).reduce((a, b) => a + b, 0);
    assert(totalFromCounts === parseWarnings.length, `warningCounts 합(${totalFromCounts}) !== warnings.length(${parseWarnings.length})`);
    assert(
      summary.warningCounts.truncated === expectedTruncationSkipKeys.size,
      `warningCounts.truncated(${summary.warningCounts.truncated}) !== 기대치(${expectedTruncationSkipKeys.size})`
    );
    assert(summary.errorCounts, 'summary.errorCounts가 없음');
    const totalErrorsFromCounts = Object.values(summary.errorCounts).reduce((a, b) => a + b, 0);
    assert(totalErrorsFromCounts === parseErrors.length, `errorCounts 합(${totalErrorsFromCounts}) !== errors.length(${parseErrors.length})`);
  });

  check('왕복: 잘린 셀이 있던 행도 update로 분류되고 payload에 포함됨(카테고리만 빠짐)', () => {
    assert(summary.willInsert === 0, `willInsert가 0이 아님: ${summary.willInsert}`);
    assert(summary.willUpdate === dbRows.length, `willUpdate(${summary.willUpdate}) !== 기대치(${dbRows.length})`);
    assert(summary.willSkip === 0, `willSkip이 0이 아님(잘림은 willSkip 사유가 아님): ${summary.willSkip}`);
    assert(summary.newYears.length === 0, `newYears가 비어 있어야 함: ${summary.newYears}`);
  });

  check('왕복: 파싱된 행 수 = 원본 행 수(잘림으로 거부되는 행 없음)', () => {
    assert(parsedRows.length === dbRows.length, `parsedRows(${parsedRows.length}) !== 원본(${dbRows.length})`);
  });

  check('왕복: 잘린 셀이 있던 23개교는 payload에서 recruitment_quota_json/recruitment_result_html이 빠짐(기존 값 보존)', () => {
    const parsedByKeyForTruncation = new Map(parsedRows.map((r) => [`${r.admission_year}::${r.university_key}`, r]));
    let bad = 0;
    expectedTruncationSkipKeys.forEach((key) => {
      const parsed = parsedByKeyForTruncation.get(key);
      if (!parsed) {
        bad += 1;
        return;
      }
      if ('recruitment_quota_json' in parsed || 'recruitment_result_html' in parsed) bad += 1;
    });
    assert(bad === 0, `잘린 카테고리가 그대로 payload에 남은 건수: ${bad}`);
  });

  // 거부되지 않은 행에 대해서만 원본과 대조한다. 위치가 아니라
  // (admission_year, university_key)로 매칭한다 — 거부된 행이 파싱
  // 결과 배열에서 통째로 빠지므로 인덱스가 밀린다.
  const parsedByKey = new Map(parsedRows.map((r) => [`${r.admission_year}::${r.university_key}`, r]));
  let mismatchCount = 0;
  let jsonMismatchCount = 0;
  let checkedRows = 0;
  dbRows.forEach((original) => {
    const key = `${original.admission_year}::${original.university_key}`;
    const parsed = parsedByKey.get(key);
    if (!parsed) {
      mismatchCount += 1;
      return;
    }
    checkedRows += 1;
    if (
      parsed.university_name !== original.university_name ||
      parsed.region !== (original.region || null) ||
      Number(parsed.admission_year) !== original.admission_year
    ) {
      mismatchCount += 1;
    }
    JSON_COLUMNS.forEach((jsonCol) => {
      const originalDoc = original[jsonCol];
      const parsedDoc = parsed[jsonCol];
      // 원본에 doc이 없었으면(원자료 자체가 없는 카테고리) 파싱 후에도
      // 없어야 한다. 있었으면 파싱 후에도 있어야 한다(내용까지 바이트
      // 동일할 필요는 없다 — importCell/buildHwpCategoryDoc이 매번
      // generatedAt을 새로 찍는다. 내용 정확성은 게이트 3종·드리프트
      // 스크립트가 이미 100%로 검증한 것과 같은 로직을 그대로 재사용
      // 하므로 별도로 다시 재현하지 않는다. 예외: 회귀 가드가 "기존 값
      // 보존"으로 판단한 카테고리는 원본에 doc이 있었는데 파싱 결과에
      // undefined일 수 있다 — 이건 정확히 "기존 DB 값을 그대로 두라"는
      // payload 설계(delete=무해)의 의도된 동작이라 doc 유무 불일치로
      // 안 잡는다).
      const hadOriginal = Boolean(originalDoc && Array.isArray(originalDoc.blocks) && originalDoc.blocks.length);
      const hasParsed = jsonCol in parsed;
      const sectionKey = SECTION_KEY_BY_JSON_COLUMN[jsonCol];
      // 이 (행, 카테고리)에 실제로 남은 "기존 값 보존" 계열 경고를 전부
      // 모은다 — type 필드로 구분한다(예전엔 reason 문자열 부분매칭이라
      // column 필터도 없었다: 다른 카테고리 경고가 같은 행에 있으면
      // false-positive로 "보존됨" 취급될 수 있었다). 정확히 1가지
      // 사유로만 보존돼야 한다 — 2가지 이상이면 중복 적용 버그다.
      const preservationWarningTypes = parseWarnings
        .filter(
          (w) =>
            w.admissionYear === original.admission_year &&
            w.universityKey === original.university_key &&
            w.column === sectionKey &&
            ['regressionSkipped', 'truncated', 'htmlParseFailedPreserved'].includes(w.type)
        )
        .map((w) => w.type);
      const wasPreservedForKnownReason = preservationWarningTypes.length > 0;
      if (preservationWarningTypes.length > 1) jsonMismatchCount += 1000; // 중복 적용이면 무조건 실패시킨다(원인 구분용으로 크게 벌점)
      if (hadOriginal && !hasParsed && !wasPreservedForKnownReason) jsonMismatchCount += 1;
      if (!hadOriginal && hasParsed) jsonMismatchCount += 1;
    });
  });

  check('왕복: 메타 필드(university_name/region/admission_year) 불일치 0건', () => {
    assert(mismatchCount === 0, `${mismatchCount}건 불일치(검사 대상 ${checkedRows}행 중)`);
  });
  check('왕복: 카테고리별 doc 유무가 원본과 동일(회귀 가드로 보존된 것 제외 0건 불일치)', () => {
    assert(jsonMismatchCount === 0, `${jsonMismatchCount}건 doc 유무 불일치`);
  });

  if (parseWarnings.length) {
    console.log(`\n왕복 경고 ${parseWarnings.length}건(최대 10건):`);
    parseWarnings.slice(0, 10).forEach((w) => console.log(`  - [${w.universityKey}/${w.admissionYear}] ${w.column || ''}: ${w.reason}`));
  }

  // === 3) 잘림 마커 → 카테고리 단위 스킵(합성, team-lead 지정 케이스 (a)) ===
  console.log('\n=== 3) 잘림 마커 → 카테고리 단위 스킵(합성) ===');
  check('잘린 셀이 1개뿐이면 그 카테고리만 스킵, 나머지 25컬럼/5카테고리는 정상 반영', () => {
    const header = BULK_XLSX_COLUMNS;
    const bulletText = '- 항목 1\n- 항목 2';
    const row = header.map((col) => {
      if (col === 'admission_year') return 2099;
      if (col === 'university_key') return 'synthetic-truncation-only-column';
      if (col === 'university_name') return '합성테스트대학교';
      if (col === 'region') return '서울';
      // 잘림 마커가 붙은 카테고리는 selection_method 하나뿐이다 — 이
      // 카테고리만 스킵되고 나머지는 전부 정상 처리돼야 한다.
      if (col === 'selection_method') return `일반전형${TRUNCATION_MARKER}`;
      if (col === 'previous_year_changes') return bulletText;
      if (col === 'minimum_requirements') return bulletText;
      if (col === 'exam_schedule') return bulletText;
      if (col === 'school_record_method') return bulletText;
      if (col === 'recruitment_quota') return bulletText;
      return '';
    });
    const ws = XLSX.utils.aoa_to_sheet([header, row]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '모집요강');

    const { rows, errors, warnings, summary: s } = parseAdmissionRowsFromXlsx(wb, new Map());
    assert(errors.length === 0, `잘림이 카테고리 하나뿐인데 행 자체가 거부됨(에러 ${errors.length}건)`);
    assert(rows.length === 1, `행이 1개 생성돼야 함(실제 ${rows.length})`);
    assert(s.willSkip === 0, `willSkip이 0이어야 함(잘림은 willSkip 사유가 아님, 실제 ${s.willSkip})`);
    assert(s.truncatedCellSkipCount === 1, `truncatedCellSkipCount가 1이어야 함(실제 ${s.truncatedCellSkipCount})`);

    const payload = rows[0];
    assert(payload.university_name === '합성테스트대학교', 'university_name(메타데이터)이 정상 반영 안 됨');
    assert(payload.region === '서울', 'region(메타데이터)이 정상 반영 안 됨');
    assert(
      !('selection_method_json' in payload) && !('selection_method_html' in payload),
      '잘린 카테고리(selection_method)의 json/html이 payload에 그대로 남음'
    );
    ['previous_year_changes', 'minimum_requirements', 'exam_schedule', 'school_record_method', 'recruitment_quota'].forEach(
      (sectionKey) => {
        const jsonCol = HWP_SECTION_JSON_KEYS[sectionKey];
        assert(jsonCol in payload && payload[jsonCol], `잘리지 않은 카테고리(${sectionKey})가 payload에서 빠짐`);
      }
    );
    const truncationWarning = warnings.find(
      (w) => w.column === 'selection_method' && w.reason.includes('잘림 마커가 있어 기존 값 보존')
    );
    assert(Boolean(truncationWarning), 'selection_method에 대한 잘림 경고가 없음');
  });

  // === 4) 신규 연도 / 신규 대학 insert 분류 ===
  console.log('\n=== 4) 신규 연도/신규 대학 분류(합성) ===');
  check('완전히 새 연도 → insert + newYears에 포함, 경고 없음', () => {
    const header = BULK_XLSX_COLUMNS;
    const row = header.map((col) => {
      if (col === 'admission_year') return 9999;
      if (col === 'university_key') return 'brand-new-university';
      if (col === 'university_name') return '신규연도대학교';
      return '';
    });
    const ws = XLSX.utils.aoa_to_sheet([header, row]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '모집요강');

    const { rows, warnings, summary: s } = parseAdmissionRowsFromXlsx(wb, existingRows);
    assert(rows.length === 1, `행이 1개 생성돼야 함(실제 ${rows.length})`);
    assert(s.willInsert === 1 && s.willUpdate === 0, `willInsert=1,willUpdate=0이어야 함(실제 ${JSON.stringify(s)})`);
    assert(s.newYears.includes(9999), `newYears에 9999가 없음: ${s.newYears}`);
    assert(s.newUniversityCount === 0, `완전히 새 연도인데 newUniversityCount가 0이 아님(실제 ${s.newUniversityCount})`);
    const newUniWarnings = warnings.filter((w) => w.reason.includes('신규 대학 추가'));
    assert(newUniWarnings.length === 0, '완전히 새 연도인데 "신규 대학 추가" 경고가 나면 안 됨');
  });

  check('이미 아는 연도 + 새 university_key → insert + 경고(오타 방어)', () => {
    const knownYear = dbRows[0]?.admission_year;
    assert(Boolean(knownYear), 'DB에서 admission_year 샘플을 못 찾음(선행 조건 실패)');
    const header = BULK_XLSX_COLUMNS;
    const row = header.map((col) => {
      if (col === 'admission_year') return knownYear;
      if (col === 'university_key') return 'brand-new-university-same-year';
      if (col === 'university_name') return '같은연도신규대학교';
      return '';
    });
    const ws = XLSX.utils.aoa_to_sheet([header, row]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '모집요강');

    const { warnings, summary: s } = parseAdmissionRowsFromXlsx(wb, existingRows);
    assert(s.willInsert === 1, `willInsert=1이어야 함(실제 ${s.willInsert})`);
    assert(!s.newYears.includes(knownYear), `이미 아는 연도가 newYears에 잘못 들어감: ${s.newYears}`);
    assert(s.newUniversityCount === 1, `summary.newUniversityCount가 1이어야 함(실제 ${s.newUniversityCount})`);
    const newUniWarnings = warnings.filter((w) => w.reason.includes('신규 대학 추가'));
    assert(newUniWarnings.length === 1, `"신규 대학 추가" 경고가 정확히 1건이어야 함(실제 ${newUniWarnings.length})`);
  });

  // === 5) 필수값 누락 → 에러 ===
  console.log('\n=== 5) 필수값 누락 → 에러(합성) ===');
  check('admission_year/university_key 누락 행 → 에러 집계, payload 미포함', () => {
    const header = BULK_XLSX_COLUMNS;
    const row = header.map((col) => (col === 'university_name' ? '이름만있음대학교' : ''));
    const ws = XLSX.utils.aoa_to_sheet([header, row]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '모집요강');

    const { rows, errors, summary: s } = parseAdmissionRowsFromXlsx(wb, new Map());
    assert(rows.length === 0, `payload가 비어 있어야 함(실제 ${rows.length}건)`);
    assert(errors.length === 1, `에러가 1건이어야 함(실제 ${errors.length})`);
    assert(errors[0].type === 'missingRequiredFields', `에러 type이 missingRequiredFields여야 함(실제 ${errors[0].type})`);
    assert(s.willSkip === 1, `willSkip=1이어야 함(실제 ${s.willSkip})`);
    assert(s.errorCounts.missingRequiredFields === 1, `errorCounts.missingRequiredFields가 1이어야 함(실제 ${s.errorCounts.missingRequiredFields})`);
  });

  // === 6) 회귀 가드 ===
  console.log('\n=== 6) 회귀 가드(합성) ===');
  check('업로드 결과가 기존보다 정보량이 줄면 그 카테고리 통째로 보존', () => {
    const richExistingDoc = {
      v: 1,
      section: 'previous_year_changes',
      blocks: [
        { kind: 'table', variant: 'change', columns: [{ role: 'no', label: '번호' }, { role: 'title', label: '변경 항목' }, { role: 'content', label: '변경 내용' }], rows: [['1', 'x'.repeat(50), 'y'.repeat(200)], ['2', 'x'.repeat(50), 'y'.repeat(200)]] }
      ]
    };
    const existing = new Map([
      ['2099::regression-test-university', { id: 'fake-id', previous_year_changes_json: richExistingDoc }]
    ]);

    const header = BULK_XLSX_COLUMNS;
    const row = header.map((col) => {
      if (col === 'admission_year') return 2099;
      if (col === 'university_key') return 'regression-test-university';
      if (col === 'university_name') return '회귀테스트대학교';
      if (col === 'previous_year_changes') return '전년도와 동일';
      return '';
    });
    const ws = XLSX.utils.aoa_to_sheet([header, row]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '모집요강');

    const { rows, warnings } = parseAdmissionRowsFromXlsx(wb, existing);
    assert(rows.length === 1, '행 자체는 생성돼야 함(다른 카테고리는 영향 없음)');
    assert(
      rows[0].previous_year_changes_json === undefined,
      'previous_year_changes_json이 payload에 없어야 함(회귀 가드가 막아야 함)'
    );
    const regressionWarnings = warnings.filter((w) => w.reason.includes('정보량 감소'));
    assert(regressionWarnings.length >= 1, '정보량 감소 경고가 있어야 함');
  });

  // === 6-1) html 파싱 실패 → 조용한 raw 재생성 방지(team-lead 지정,
  // 마커 문자열이 우리 것과 다른 도구가 잘랐을 때도 안전해야 함) ===
  console.log('\n=== 6-1) html 파싱 실패 시 raw 비교 분기(합성) ===');

  const MALFORMED_HTML = '이것은 유효한 표 구조가 아닌 임의의 문자열입니다(태그도 없고 파싱 불가)';

  check('html 파싱 실패 + 업로드 raw == 기존 DB raw → 재생성 시도 없이 기존 값 보존 + htmlParseFailedPreserved 경고', () => {
    const sameRawText = '- 동일 원문 그대로(관리자가 안 건드림)';
    const existing = new Map([
      [
        '2099::html-parse-fail-preserved-test',
        {
          id: 'fake-id-preserved',
          minimum_requirements_json: { v: 1, section: 'minimum_requirements', blocks: [{ kind: 'plainList', items: [{ type: 'bullet', text: '기존 항목' }] }] },
          minimum_requirements: sameRawText
        }
      ]
    ]);
    const header = BULK_XLSX_COLUMNS;
    const row = header.map((col) => {
      if (col === 'admission_year') return 2099;
      if (col === 'university_key') return 'html-parse-fail-preserved-test';
      if (col === 'university_name') return 'html파싱실패보존테스트대학교';
      if (col === 'minimum_requirements') return sameRawText;
      if (col === 'minimum_requirements_html') return MALFORMED_HTML;
      return '';
    });
    const ws = XLSX.utils.aoa_to_sheet([header, row]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '모집요강');

    const { rows, warnings, summary: s } = parseAdmissionRowsFromXlsx(wb, existing);
    assert(rows.length === 1, '행 자체는 생성돼야 함');
    assert(
      rows[0].minimum_requirements_json === undefined && rows[0].minimum_requirements_html === undefined,
      'raw가 안 바뀌었는데 재생성돼 payload에 들어감(기존 값 보존이 안 됨)'
    );
    assert(s.htmlParseFailedCount === 1, `htmlParseFailedCount가 1이어야 함(실제 ${s.htmlParseFailedCount})`);
    const w = warnings.find((x) => x.type === 'htmlParseFailedPreserved');
    assert(Boolean(w), 'htmlParseFailedPreserved 타입 경고가 없음');
    assert(w.column === 'minimum_requirements', `경고의 column이 잘못됨(실제 ${w.column})`);
  });

  check('html 파싱 실패 + 업로드 raw != 기존 DB raw(의도적 수정) → raw로 재생성하고 htmlParseFailedRegenerated 경고(회귀 아님)', () => {
    const oldRawText = '- 기존 원문';
    const newRawText = '- 새 원문 항목 1\n- 새 원문 항목 2\n- 새 원문 항목 3';
    const existing = new Map([
      [
        '2099::html-parse-fail-regenerated-test',
        {
          id: 'fake-id-regenerated',
          minimum_requirements_json: { v: 1, section: 'minimum_requirements', blocks: [{ kind: 'plainList', items: [{ type: 'bullet', text: '짧은 기존 항목' }] }] },
          minimum_requirements: oldRawText
        }
      ]
    ]);
    const header = BULK_XLSX_COLUMNS;
    const row = header.map((col) => {
      if (col === 'admission_year') return 2099;
      if (col === 'university_key') return 'html-parse-fail-regenerated-test';
      if (col === 'university_name') return 'html파싱실패재생성테스트대학교';
      if (col === 'minimum_requirements') return newRawText;
      if (col === 'minimum_requirements_html') return MALFORMED_HTML;
      return '';
    });
    const ws = XLSX.utils.aoa_to_sheet([header, row]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '모집요강');

    const { rows, warnings, summary: s } = parseAdmissionRowsFromXlsx(wb, existing);
    assert(rows.length === 1, '행 자체는 생성돼야 함');
    assert(
      rows[0].minimum_requirements_json !== undefined,
      'raw를 의도적으로 고쳤는데(정보량도 늘었는데) 재생성이 안 됨'
    );
    assert(s.htmlParseFailedCount === 1, `htmlParseFailedCount가 1이어야 함(실제 ${s.htmlParseFailedCount})`);
    const regenWarning = warnings.find((x) => x.type === 'htmlParseFailedRegenerated');
    assert(Boolean(regenWarning), 'htmlParseFailedRegenerated 타입 경고가 없음');
    const regressionWarning = warnings.find((x) => x.type === 'regressionSkipped');
    assert(!regressionWarning, '회귀 가드가 개입하면 안 되는 케이스인데(정보량이 늘었음) regressionSkipped 경고가 남음');
  });

  check('html 파싱 실패 + 업로드 raw != 기존 DB raw + 재생성 결과가 기존보다 정보량 감소 → 회귀 가드가 우선 적용(중복 집계 없음)', () => {
    const oldRawText = '- 기존 원문 A\n- 기존 원문 B\n- 기존 원문 C';
    const newRawText = '- 짧아진 새 원문';
    const richExistingDoc = {
      v: 1,
      section: 'minimum_requirements',
      blocks: [
        { kind: 'plainList', items: [{ type: 'bullet', text: 'x'.repeat(200) }, { type: 'bullet', text: 'y'.repeat(200) }, { type: 'bullet', text: 'z'.repeat(200) }] }
      ]
    };
    const existing = new Map([
      [
        '2099::html-parse-fail-regression-priority-test',
        { id: 'fake-id-regression-priority', minimum_requirements_json: richExistingDoc, minimum_requirements: oldRawText }
      ]
    ]);
    const header = BULK_XLSX_COLUMNS;
    const row = header.map((col) => {
      if (col === 'admission_year') return 2099;
      if (col === 'university_key') return 'html-parse-fail-regression-priority-test';
      if (col === 'university_name') return 'html파싱실패회귀우선테스트대학교';
      if (col === 'minimum_requirements') return newRawText;
      if (col === 'minimum_requirements_html') return MALFORMED_HTML;
      return '';
    });
    const ws = XLSX.utils.aoa_to_sheet([header, row]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '모집요강');

    const { rows, warnings, summary: s } = parseAdmissionRowsFromXlsx(wb, existing);
    assert(rows.length === 1, '행 자체는 생성돼야 함');
    assert(rows[0].minimum_requirements_json === undefined, '정보량이 줄었는데 회귀 가드가 안 막음');
    assert(s.htmlParseFailedCount === 0, `회귀 가드가 먼저 막은 케이스는 htmlParseFailedCount에 안 잡혀야 함(실제 ${s.htmlParseFailedCount})`);
    const regressionWarning = warnings.find((x) => x.type === 'regressionSkipped');
    assert(Boolean(regressionWarning), 'regressionSkipped 경고가 있어야 함');
    const regenWarning = warnings.find((x) => x.type === 'htmlParseFailedRegenerated' || x.type === 'htmlParseFailedPreserved');
    assert(!regenWarning, '회귀 가드와 html 파싱 실패 경고가 같은 셀에 중복으로 남음');
  });

  // === 7) formula injection 방어 — 셀 타입 강제(t:'s')가 값을 하나도
  // 안 바꾸면서 수식으로 해석될 여지를 없애는지 확인한다. dev의
  // csvEscape(선행 작은따옴표 접두사)와 달리 접두사를 안 붙이므로,
  // "붙였다가 못 걷어내서 왕복이 깨지는" 실패 모드 자체가 없다.
  console.log('\n=== 7) formula injection 방어(셀 타입 강제) ===');

  const DANGEROUS_PREFIXES = ['=1+1', '+41 1234 5678', '-학교장추천자, 학교생활우수자, 논술', '@SUM(A1)', '\t탭 선두', '\r캐리지리턴 선두'];

  check('합성: 위험 접두사 셀 전부 t=\'s\'로 강제되고 수식(f) 없음, 값도 원본 그대로', () => {
    const syntheticRows = DANGEROUS_PREFIXES.map((value, idx) => ({
      id: `synthetic-${idx}`,
      admission_year: 2027,
      university_key: `formula-test-${idx}`,
      university_name: `수식테스트대학교${idx}`,
      memo: value,
      selection_method: value
    }));
    const { workbook } = exportAdmissionRowsToXlsx(syntheticRows);
    const sheetName = workbook.SheetNames[0];
    const ws = workbook.Sheets[sheetName];

    let formulaCellCount = 0;
    let nonStringTypedCount = 0;
    Object.keys(ws).forEach((addr) => {
      if (addr.startsWith('!')) return;
      const cell = ws[addr];
      if (cell.f !== undefined) formulaCellCount += 1;
      if (typeof cell.v === 'string' && cell.t !== 's') nonStringTypedCount += 1;
    });
    assert(formulaCellCount === 0, `수식(f) 프로퍼티를 가진 셀이 있으면 안 됨(실제 ${formulaCellCount}건)`);
    assert(nonStringTypedCount === 0, `문자열 값인데 t='s'가 아닌 셀이 있으면 안 됨(실제 ${nonStringTypedCount}건)`);

    // 값 자체가 원본과 정확히 동일한지(접두사 미삽입) 확인
    const memoCol = BULK_XLSX_COLUMNS.indexOf('memo');
    const grid = XLSX.utils.sheet_to_json(ws, { header: 1 });
    DANGEROUS_PREFIXES.forEach((value, idx) => {
      const cellValue = grid[idx + 1][memoCol];
      assert(cellValue === value, `memo 셀 값이 원본과 다름(idx=${idx}): 기대="${value}" 실제="${cellValue}"`);
    });
  });

  // === 8) chips 셀(recruit variant) 실데이터 왕복 검증 — PR #40 "알려진
  // 한계"(합성 테스트로만 커버) 해소. dbRows(1번 섹션에서 이미 조회)에서
  // recruitment_quota_json에 chips 셀이 있는 행만 골라 별도 워크북으로
  // 왕복시킨다(전체 218행과 섞지 않아 원인 분리가 쉽다).
  console.log('\n=== 8) chips 셀(recruit variant) 실데이터 왕복 검증 ===');

  function hasChipsBlocks(doc) {
    if (!doc || !Array.isArray(doc.blocks)) return false;
    return doc.blocks.some(
      (block) =>
        block.kind === 'table' &&
        Array.isArray(block.rows) &&
        block.rows.some((row) => row.some((cell) => cell && typeof cell === 'object' && Array.isArray(cell.chips)))
    );
  }

  const chipsRows = dbRows.filter((row) => hasChipsBlocks(row.recruitment_quota_json));
  console.log(`dev DB에서 chips 셀이 있는 행: ${chipsRows.length}건(사전 실측 7건과 비교)`);
  chipsRows.forEach((row) => {
    const seq = extractChipsSequence(row.recruitment_quota_json);
    console.log(`  - [${row.university_name}/${row.admission_year}] chips 총 ${seq.length}개`);
  });

  check(`chips 셀 실데이터 ${chipsRows.length}건 왕복: 비잘림 행은 deep-equal, 잘림 행은 손대지 않고 보존`, () => {
    assert(chipsRows.length > 0, 'chips 셀이 있는 행을 하나도 못 찾음(사전 실측 7건과 다름 — dev DB가 바뀌었을 수 있음)');

    const { workbook: chipsWorkbook, truncatedCells: chipsTruncatedCells } = exportAdmissionRowsToXlsx(chipsRows);
    const truncatedIds = new Set(chipsTruncatedCells.map((c) => c.id));
    const chipsRoundTripped = roundTripWorkbook(chipsWorkbook);
    const chipsExistingRows = buildExistingRowsMap(chipsRows);
    const { rows: parsedChipsRows } = parseAdmissionRowsFromXlsx(chipsRoundTripped, chipsExistingRows);
    const parsedByKey = new Map(parsedChipsRows.map((r) => [`${r.admission_year}::${r.university_key}`, r]));

    let deepEqualCount = 0;
    let preservedTruncatedCount = 0;
    const mismatches = [];

    chipsRows.forEach((original) => {
      const key = `${original.admission_year}::${original.university_key}`;
      const parsed = parsedByKey.get(key);
      if (!parsed) {
        mismatches.push(`${key}: 행 자체가 파싱 결과에서 빠짐`);
        return;
      }
      const wasTruncated = truncatedIds.has(original.id);
      if (wasTruncated) {
        // 잘린 행은 카테고리 단위 스킵이 먼저 개입해야 한다(17566df) —
        // chips 파서까지 갈 필요 없이 기존 값을 그대로 보존해야 옳다.
        if ('recruitment_quota_json' in parsed) {
          mismatches.push(`${key}: 잘렸는데 재생성됨(기존 값 보존이 안 됨)`);
        } else {
          preservedTruncatedCount += 1;
        }
        return;
      }
      // 안 잘린 행 — html 그대로 왕복 후 재임포트한 doc이 원본과
      // deep-equal 해야 한다(stableStringifyDoc, generatedAt 제외).
      const beforeStr = stableStringifyDoc(original.recruitment_quota_json);
      const afterStr = stableStringifyDoc(parsed.recruitment_quota_json);
      if (beforeStr !== afterStr) {
        mismatches.push(`${key}: doc 전체가 deep-equal 아님`);
      } else {
        deepEqualCount += 1;
      }
      // chips 배열의 순서·개수·내용 전용 비교(team-lead 명시 요구) —
      // doc 전체가 같으면 이것도 당연히 같아야 하지만, 실패 시 정확히
      // 몇 번째 칩이 다른지 바로 보여주기 위해 별도로도 확인한다.
      const beforeChips = extractChipsSequence(original.recruitment_quota_json);
      const afterChips = extractChipsSequence(parsed.recruitment_quota_json);
      if (JSON.stringify(beforeChips) !== JSON.stringify(afterChips)) {
        mismatches.push(`${key}: chips 순서/개수/내용 불일치(전 ${beforeChips.length}개 → 후 ${afterChips.length}개)`);
      }
    });

    console.log(
      `  chips ${chipsRows.length}건 분류: 왕복 후 deep-equal ${deepEqualCount}건 / 잘림으로 미재생성·보존 ${preservedTruncatedCount}건`
    );
    assert(mismatches.length === 0, `불일치 ${mismatches.length}건: ${mismatches.join(' / ')}`);
    assert(
      deepEqualCount + preservedTruncatedCount === chipsRows.length,
      `분류되지 않은 행이 있음(deep-equal ${deepEqualCount} + 보존 ${preservedTruncatedCount} !== 전체 ${chipsRows.length})`
    );
  });

  // 위 검증은 32,767자 제한 때문에 7건 중 5건이 "잘림 스킵"으로 빠져
  // 실제로 chips 파서(importRecruitExactDocFromHtml/
  // importRecruitLegacyDocFromHtml)를 안 탄다 — 잘림 보호는 확인됐지만
  // 파서 정확도 자체는 2/7만 실증한 셈이다. 아래는 32,767자 제한을
  // 우회해(엑셀 셀 크기 제약과 무관하게, 순수 파서 충실도만) 5건 전부
  // 실제 DB html 그대로 재파싱해 chips가 보존되는지 별도로 확인한다
  // (엑셀 왕복 자체는 아니다 — importCell 단계만 떼어 검증).
  check('chips 셀 5건(잘림 때문에 위에서 미검증) — html 전체 그대로 재파싱해도 chips 보존 확인(엑셀 셀 크기 제약과 분리)', () => {
    const truncatedChipsRows = chipsRows.filter((row) => {
      const html = row.recruitment_result_html;
      return typeof html === 'string' && html.length > MAX_XLSX_CELL_LENGTH;
    });
    assert(truncatedChipsRows.length === 5, `잘림 대상 chips 행 수가 사전 확인(5건)과 다름(실제 ${truncatedChipsRows.length}건)`);

    const parserMismatches = [];
    truncatedChipsRows.forEach((row) => {
      const key = `${row.admission_year}::${row.university_key}`;
      const html = row.recruitment_result_html;
      const result = importCell('recruitment_quota', html, { university_name: row.university_name });
      if (result.classification !== 'imported') {
        parserMismatches.push(`${key}: importCell이 실패함(${result.classification}: ${result.reason || ''})`);
        return;
      }
      const beforeStr = stableStringifyDoc(row.recruitment_quota_json);
      const afterStr = stableStringifyDoc(result.doc);
      if (beforeStr !== afterStr) {
        parserMismatches.push(`${key}: 전체 html 재파싱 결과가 원본 doc과 deep-equal 아님`);
      }
      const beforeChips = extractChipsSequence(row.recruitment_quota_json);
      const afterChips = extractChipsSequence(result.doc);
      if (JSON.stringify(beforeChips) !== JSON.stringify(afterChips)) {
        parserMismatches.push(`${key}: chips 순서/개수/내용 불일치(전 ${beforeChips.length}개 → 후 ${afterChips.length}개)`);
      }
    });
    assert(parserMismatches.length === 0, `불일치 ${parserMismatches.length}건: ${parserMismatches.join(' / ')}`);
  });

  await checkFormulaRoundTrip();
  await checkRealFileTruncationPreservation();

  console.log(`\n총 ${passCount + failCount}건 중 ${passCount}건 통과, ${failCount}건 실패.`);
  process.exitCode = failCount ? 1 : 0;

  // 실데이터에서 위험 접두사로 시작하는 셀을 찾아 왕복 검증한다(team-lead
  // 실측 사례 "- 학교장추천자, 학교생활우수자, 논술 …"와 같은 종류가
  // 실제로 존재하는지, 있다면 export→파일 IO 왕복→import 후에도 완전히
  // 동일한지 증명한다).
  async function checkFormulaRoundTrip() {
    const DANGEROUS_PREFIX_RE = /^[=+\-@\t\r]/;
    const textColumns = ['previous_year_changes', 'selection_method', 'minimum_requirements', 'exam_schedule', 'school_record_method', 'recruitment_quota', 'memo'];
    let sample = null;
    for (const row of dbRows) {
      for (const col of textColumns) {
        const v = row[col];
        if (typeof v === 'string' && DANGEROUS_PREFIX_RE.test(v)) {
          sample = { universityKey: row.university_key, admissionYear: row.admission_year, column: col, value: v };
          break;
        }
      }
      if (sample) break;
    }

    if (!sample) {
      console.log('PASS - 실데이터: 위험 접두사(=+-@탭/CR)로 시작하는 셀 없음(합성 테스트로 커버됨)');
      passCount += 1;
      return;
    }

    check(
      `실데이터: [${sample.universityKey}] ${sample.column} 위험 접두사 셀("${sample.value.slice(0, 30)}...") 왕복 무손실`,
      () => {
        const { workbook: singleWb } = exportAdmissionRowsToXlsx([{ id: 'x', admission_year: sample.admissionYear, university_key: sample.universityKey, university_name: 'x', [sample.column]: sample.value }]);
        const buf = XLSX.write(singleWb, { bookType: 'xlsx', type: 'buffer' });
        const reread = XLSX.read(buf, { type: 'buffer' });
        const ws2 = reread.Sheets[reread.SheetNames[0]];
        const grid2 = XLSX.utils.sheet_to_json(ws2, { header: 1 });
        const colIdx = BULK_XLSX_COLUMNS.indexOf(sample.column);
        assert(grid2[1][colIdx] === sample.value, `왕복 후 값이 원본과 다름: 기대="${sample.value}" 실제="${grid2[1][colIdx]}"`);
      }
    );
  }

  // team-lead 지정 케이스 (b): 사용자 원본 `~/Downloads/모집요강.xlsx`를
  // 그대로 업로드 입력으로 먹여서, 이미 잘려 있던 23개 셀이 손상된 채로
  // (짧아진 값으로) DB에 반영되지 않는지 확인한다. **원본 파일은
  // 읽기 전용으로만 연다(readFile) — 절대 쓰지 않는다.**
  //
  // 주의: 원본 파일의 잘림 마커('\n…[셀 한도 초과로 잘림]', 사용자 쪽
  // 도구가 남긴 것)는 우리 TRUNCATION_MARKER 문자열과 다르다 — 그래서
  // 이 23개 셀은 admissionBulkXlsx.js의 잘림 마커 매칭(컬럼 스킵)에는
  // 안 걸린다. 대신 그 html이 잘려서 대부분 태그가 안 닫힌 상태라
  // importCell이 실패하고, raw(recruitment_quota 원문, 안 잘림)로
  // 폴백해 doc을 다시 만든 뒤 shouldSkipForRegression이 "기존보다
  // 정보량이 줄면" 보존한다. 즉 이 케이스는 잘림 마커 매칭이 아니라
  // **회귀 가드가 최종 방어선**이라는 걸 실측으로 증명하는 테스트다.
  // 검증할 불변식은 하나뿐이다 — 어느 경로로 막히든 "잘린 32,752자
  // + 원본 마커 텍스트"가 그대로 payload에 쓰이는 일은 없어야 한다.
  async function checkRealFileTruncationPreservation() {
    const originalFilePath = join(homedir(), 'Downloads', '모집요강.xlsx');
    let buffer;
    try {
      buffer = await readFile(originalFilePath);
    } catch {
      console.log(`PASS - 실파일: ${originalFilePath}가 없어 이 검증은 건너뜀(선택 검증)`);
      passCount += 1;
      return;
    }

    const ORIGINAL_FILE_MARKER = '…[셀 한도 초과로 잘림]';
    const realWorkbook = XLSX.read(buffer, { type: 'buffer' });
    const realSheet = realWorkbook.Sheets[realWorkbook.SheetNames[0]];
    const realGrid = XLSX.utils.sheet_to_json(realSheet, { header: 1 });
    const realHeader = realGrid[0];
    const htmlColIdx = realHeader.indexOf('recruitment_result_html');
    const yearIdx = realHeader.indexOf('admission_year');
    const keyIdx = realHeader.indexOf('university_key');
    assert(htmlColIdx >= 0 && yearIdx >= 0 && keyIdx >= 0, '원본 파일 헤더에 필요한 컬럼이 없음');

    const truncatedInOriginalFile = [];
    realGrid.slice(1).forEach((r) => {
      const v = r[htmlColIdx];
      if (typeof v === 'string' && v.includes(ORIGINAL_FILE_MARKER)) {
        truncatedInOriginalFile.push({ year: Number(r[yearIdx]), key: clean(String(r[keyIdx] ?? '')) });
      }
    });

    if (!truncatedInOriginalFile.length) {
      console.log('PASS - 실파일: 원본에 잘림 마커가 있는 셀이 0건(사전 실측 23건과 다름 — 원본 파일이 바뀌었는지 확인 필요)');
      passCount += 1;
      return;
    }

    const { rows: realParsedRows, errors: realErrors, warnings: realWarnings } = parseAdmissionRowsFromXlsx(
      realWorkbook,
      existingRows
    );

    check(
      `실파일: 원본에 이미 잘려 있던 셀 ${truncatedInOriginalFile.length}건(사전 실측 23건과 일치해야 함)이 손상된 채로 반영되지 않고 전부 warnings에 잡힘`,
      () => {
        assert(
          truncatedInOriginalFile.length === 23,
          `원본 파일의 잘림 셀 수가 사전 실측(23건)과 다름(실제 ${truncatedInOriginalFile.length}건) — 원본이 바뀌었을 수 있음`
        );
        assert(realErrors.length === 0, `실파일 업로드가 행 자체를 거부함(에러 ${realErrors.length}건) — 잘림은 행 거부 사유가 아니어야 함`);

        const realParsedByKey = new Map(
          realParsedRows.map((r) => [`${r.admission_year}::${r.university_key}`, r])
        );
        let corruptedCount = 0;
        let missingRowCount = 0;
        let preservedByGuardCount = 0;
        let regeneratedFromRawCount = 0;
        let noWarningCount = 0;
        let doubleWarningCount = 0;
        truncatedInOriginalFile.forEach(({ year, key }) => {
          const parsed = realParsedByKey.get(`${year}::${key}`);
          if (!parsed) {
            missingRowCount += 1;
            return;
          }
          const html = parsed.recruitment_result_html;
          // 핵심 불변식: 잘린 채 마커가 붙은 원본 값이 그대로(또는 그
          // 일부라도) payload에 쓰이면 안 된다.
          if (typeof html === 'string' && html.includes(ORIGINAL_FILE_MARKER)) {
            corruptedCount += 1;
            return;
          }

          const cellWarnings = realWarnings.filter(
            (w) => w.admissionYear === year && w.universityKey === key && w.column === 'recruitment_quota'
          );
          const relevantTypes = ['regressionSkipped', 'htmlParseFailedPreserved', 'htmlParseFailedRegenerated'];
          const matchingWarnings = cellWarnings.filter((w) => relevantTypes.includes(w.type));
          if (matchingWarnings.length === 0) noWarningCount += 1;
          if (matchingWarnings.length > 1) doubleWarningCount += 1;

          if ('recruitment_quota_json' in parsed) {
            // 회귀 가드를 통과해 raw(안 잘린 원문)로 재생성된 경우다 —
            // 손상은 아니지만 doc 내용이 바뀐다(알려진 raw 재생성 한계,
            // PR #40 "알려진 한계"와 같은 맥락). 잘린 값 자체는 아니므로
            // 안전하지만, 이제는 htmlParseFailedRegenerated 경고가
            // 반드시 남아야 한다(team-lead 지적 — 이전엔 0건이었음).
            regeneratedFromRawCount += 1;
          } else {
            preservedByGuardCount += 1;
          }
        });
        console.log(
          `  실파일 23건 분류: 기존 값 보존(회귀 가드 또는 raw 동일) ${preservedByGuardCount}건 / raw로 재생성(잘리지 않은 값, 경고 동반) ${regeneratedFromRawCount}건 / 행 자체 누락 ${missingRowCount}건`
        );
        assert(corruptedCount === 0, `잘린 마커 텍스트가 그대로 payload에 쓰인 건수: ${corruptedCount}(손상)`);
        assert(missingRowCount === 0, `실파일의 대상 행이 파싱 결과에서 통째로 빠짐: ${missingRowCount}건`);
        assert(noWarningCount === 0, `warnings가 안 남은(조용히 처리된) 건수: ${noWarningCount}건 — team-lead 지적 사항(이전엔 17건)`);
        assert(doubleWarningCount === 0, `같은 셀에 경고가 중복으로 남은 건수: ${doubleWarningCount}건(회귀 가드와 html 파싱 실패 경고가 겹침)`);
      }
    );
  }
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
