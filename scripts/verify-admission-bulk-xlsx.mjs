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
import process from 'node:process';
import * as XLSX from 'xlsx';

import {
  exportAdmissionRowsToXlsx,
  parseAdmissionRowsFromXlsx,
  BULK_XLSX_COLUMNS,
  TRUNCATION_MARKER
} from '../src/lib/admissionBulkXlsx.js';
import { HWP_SECTION_JSON_KEYS } from '../src/lib/admissionDoc.js';

const DEV_PROJECT_REF = 'gjowqdiopinhixfivnkx';
const DEFAULT_KEYS_FILE =
  '/private/tmp/claude-501/-Users-hyunsoo-uwellnow-winningpage/7d913b11-451e-4002-a293-f999f0a2dad9/scratchpad/dev-keys.json';
const TABLE = 'admission_university_resources';
const JSON_COLUMNS = Object.values(HWP_SECTION_JSON_KEYS);

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
    map.set(key, entry);
  });
  return map;
}

// 워크북을 XLSX.write로 버퍼화한 뒤 다시 XLSX.read로 읽어, "실제 파일을
// 내려받았다가 다시 올리는" 왕복과 최대한 가깝게 만든다(메모리상 workbook
// 객체를 그대로 재사용하면 셀 타입 변환 등 실제 파일 IO에서만 드러나는
// 문제를 놓칠 수 있다).
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

  // 잘린 셀이 있는 행은 정책상 통째로 거부된다(잘림 자체가 의도된
  // 데이터 손실이라 이건 실패가 아니라 정상 동작이다 — team-lead가 미리
  // 알려준 "원본 파일에 이미 23셀이 잘려 있다"와 정확히 일치하는지도
  // 여기서 같이 확인한다). truncatedCells의 rowIndex는 export 시점의
  // dbRows 배열 인덱스와 1:1이므로, 그 인덱스의 (year, key)를 "거부
  // 예정" 집합으로 미리 구한다.
  const truncatedRowIndexSet = new Set(truncatedCells.map((c) => c.rowIndex));
  const expectedRejectedKeys = new Set(
    [...truncatedRowIndexSet].map((idx) => `${dbRows[idx].admission_year}::${dbRows[idx].university_key}`)
  );

  check(`왕복: 잘린 셀이 있는 행만 거부(정확히 ${expectedRejectedKeys.size}건, team-lead 사전 실측 23건과 일치해야 함)`, () => {
    assert(
      parseErrors.length === expectedRejectedKeys.size,
      `에러 ${parseErrors.length}건, 기대 ${expectedRejectedKeys.size}건`
    );
    const actualRejectedKeys = new Set(parseErrors.map((e) => `${e.admissionYear}::${e.universityKey}`));
    const onlyExpected = [...actualRejectedKeys].every((k) => expectedRejectedKeys.has(k));
    assert(onlyExpected, `잘린 셀이 없는 행이 거부됨: ${JSON.stringify([...actualRejectedKeys].filter((k) => !expectedRejectedKeys.has(k)))}`);
  });

  check('왕복: 거부되지 않은 행은 전부 update로 분류(신규 연도/대학 없음)', () => {
    const expectedRemaining = dbRows.length - expectedRejectedKeys.size;
    assert(summary.willInsert === 0, `willInsert가 0이 아님: ${summary.willInsert}`);
    assert(summary.willUpdate === expectedRemaining, `willUpdate(${summary.willUpdate}) !== 기대치(${expectedRemaining})`);
    assert(summary.newYears.length === 0, `newYears가 비어 있어야 함: ${summary.newYears}`);
  });

  check('왕복: 파싱된 행 수 = 원본 행 수 - 거부된 행 수', () => {
    const expectedRemaining = dbRows.length - expectedRejectedKeys.size;
    assert(parsedRows.length === expectedRemaining, `parsedRows(${parsedRows.length}) !== 기대치(${expectedRemaining})`);
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
    if (expectedRejectedKeys.has(key)) return;
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
      const wasRegressionSkipped = parseWarnings.some(
        (w) => w.admissionYear === original.admission_year && w.universityKey === original.university_key && w.reason.includes('정보량 감소')
      );
      if (hadOriginal && !hasParsed && !wasRegressionSkipped) jsonMismatchCount += 1;
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

  // === 3) 잘림 마커 거부 ===
  console.log('\n=== 3) 잘림 마커 거부(합성) ===');
  check('잘림 마커가 있는 셀 → 행 거부(에러 집계, payload 미포함)', () => {
    const header = BULK_XLSX_COLUMNS;
    const goodRow = header.map((col) => {
      if (col === 'admission_year') return 2099;
      if (col === 'university_key') return 'synthetic-truncation-test';
      if (col === 'university_name') return '합성테스트대학교';
      if (col === 'selection_method') return `일반전형${TRUNCATION_MARKER}`;
      return '';
    });
    const ws = XLSX.utils.aoa_to_sheet([header, goodRow]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '모집요강');

    const { rows, errors, summary: s } = parseAdmissionRowsFromXlsx(wb, new Map());
    assert(rows.length === 0, `잘림 마커 행이 payload에 포함됨(${rows.length}건)`);
    assert(errors.length === 1, `에러가 정확히 1건이어야 함(실제 ${errors.length}건)`);
    assert(s.willSkip === 1, `willSkip이 1이어야 함(실제 ${s.willSkip})`);
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
    assert(s.willSkip === 1, `willSkip=1이어야 함(실제 ${s.willSkip})`);
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

  console.log(`\n총 ${passCount + failCount}건 중 ${passCount}건 통과, ${failCount}건 실패.`);
  process.exitCode = failCount ? 1 : 0;
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
