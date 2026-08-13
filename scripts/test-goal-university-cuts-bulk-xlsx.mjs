// =====================================================================
// src/lib/goalUniversityCutsBulkXlsx.js 검증 스크립트.
//
// **DB를 만지지 않는다 — 손으로 만든 픽스처만 쓴다.** 이 lib 은 순수
// 함수뿐이고, 유일한 외부 입력인 existingCutTypeById(Map)도 호출부가
// 주입하므로 DB 없이 전 경로를 덮을 수 있다.
//
// 사용법: node scripts/test-goal-university-cuts-bulk-xlsx.mjs
// 종료 코드: 전부 통과하면 0, 하나라도 실패하면 1.
// =====================================================================

import process from 'node:process';
import * as XLSX from 'xlsx';

import {
  exportGoalUniversityCutRowsToXlsx,
  parseGoalUniversityCutRowsFromXlsx,
  GOAL_CUTS_XLSX_HEADERS,
  GOAL_CUT_RANGE,
  TRUNCATION_MARKER
} from '../src/lib/goalUniversityCutsBulkXlsx.js';

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

// 헤더 행 + 본문 행(배열)로 workbook 을 만든다. 헤더는 항상 lib 이
// 내보내는 순서를 그대로 쓴다(컬럼 순서 무관 검증은 별도 케이스).
function makeWorkbook(bodyRows, headers = GOAL_CUTS_XLSX_HEADERS) {
  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...bodyRows]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, '목표관리 대학 컷');
  return workbook;
}

// [id, 컷 종류, 대학명, 학과명, 컷 값, 출처, 기준 연도, 노출, 운영 메모]
function row(overrides = {}) {
  const base = {
    id: '',
    cutType: '수시 일반',
    university: '가천대',
    department: '간호학과',
    avgCut: 2.5,
    source: '입결정보 유도',
    sourceYear: 2026,
    isActive: 'Y',
    note: ''
  };
  const r = { ...base, ...overrides };
  return [r.id, r.cutType, r.university, r.department, r.avgCut, r.source, r.sourceYear, r.isActive, r.note];
}

function errorTypes(result) {
  return result.errors.map((e) => e.type);
}
function warningTypes(result) {
  return result.warnings.map((w) => w.type);
}

// ---------------------------------------------------------------------
// 1. 왕복(export → parse)
// ---------------------------------------------------------------------

check('왕복 — DB 행을 내보냈다가 그대로 읽으면 payload 가 보존된다', () => {
  const dbRows = [
    {
      id: 11,
      cut_type: 'normal',
      university_name: '가천대',
      department_name: '간호학과',
      avg_cut: 2.35,
      source: 'admission_results',
      source_year: 2026,
      is_active: true,
      note: ''
    },
    {
      id: 12,
      cut_type: 'jungsi',
      university_name: '가천대',
      department_name: '간호학과',
      avg_cut: 87.5,
      source: 'manual',
      source_year: 2026,
      is_active: false,
      note: '운영 메모'
    }
  ];
  const { workbook, truncatedCells } = exportGoalUniversityCutRowsToXlsx(dbRows);
  assert(truncatedCells.length === 0, '짧은 값인데 잘림이 보고됐다');

  const result = parseGoalUniversityCutRowsFromXlsx(
    workbook,
    new Map([
      [11, 'normal'],
      [12, 'jungsi']
    ])
  );
  assert(result.errors.length === 0, `거부가 없어야 한다: ${JSON.stringify(errorTypes(result))}`);
  assert(result.summary.willUpdate === 2 && result.summary.willInsert === 0, '둘 다 수정으로 분류돼야 한다');
  const [a, b] = result.rows;
  assert(a.id === 11 && a.cut_type === 'normal' && a.avg_cut === 2.35, 'normal 행이 보존되지 않았다');
  assert(a.source === 'admission_results' && a.source_year === 2026 && a.is_active === true, 'normal 메타가 보존되지 않았다');
  assert(b.id === 12 && b.cut_type === 'jungsi' && b.avg_cut === 87.5, 'jungsi 행이 보존되지 않았다');
  assert(b.is_active === false && b.note === '운영 메모', 'jungsi 의 노출/메모가 보존되지 않았다');
});

check('왕복 — key 2컬럼은 엑셀에 없고 파서가 표시명에서 복사한다(§3-D5)', () => {
  const { workbook } = exportGoalUniversityCutRowsToXlsx([
    { id: 1, cut_type: 'normal', university_name: '연세대', department_name: '경영학과', avg_cut: 1.5, source: 'manual', source_year: 2026, is_active: true, note: '' }
  ]);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const grid = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  assert(!grid[0].includes('university_key'), 'university_key 가 엑셀 컬럼으로 나갔다');
  assert(!grid[0].includes('department_key'), 'department_key 가 엑셀 컬럼으로 나갔다');

  const result = parseGoalUniversityCutRowsFromXlsx(workbook, new Map([[1, 'normal']]));
  const [payload] = result.rows;
  assert(payload.university_key === '연세대', 'university_key 가 표시명에서 복사되지 않았다');
  assert(payload.department_key === '경영학과', 'department_key 가 표시명에서 복사되지 않았다');
});

check('왕복 — 컬럼 순서를 뒤섞어도 헤더 이름으로 매핑된다', () => {
  const headers = ['운영 메모', '컷 값', '대학명', 'id', '학과명', '컷 종류', '노출', '출처', '기준 연도'];
  const workbook = makeWorkbook([['메모', 3.1, '고려대', '', '수학과', '수시 특목', 'Y', '수기 입력', 2025]], headers);
  const result = parseGoalUniversityCutRowsFromXlsx(workbook, new Map());
  assert(result.errors.length === 0, `거부가 없어야 한다: ${JSON.stringify(result.errors)}`);
  const [payload] = result.rows;
  assert(payload.cut_type === 'special' && payload.avg_cut === 3.1, '뒤섞인 컬럼이 잘못 매핑됐다');
  assert(payload.university_name === '고려대' && payload.department_name === '수학과', '이름 매핑이 틀렸다');
  assert(payload.source_year === 2025 && payload.note === '메모', '메타 매핑이 틀렸다');
});

// ---------------------------------------------------------------------
// 2. 🔴 스케일 이원성 (이 도메인의 1순위 사고)
// ---------------------------------------------------------------------

check('cutScaleOutOfRange — 수시에 백분위(87.5)를 넣으면 거부한다', () => {
  const result = parseGoalUniversityCutRowsFromXlsx(
    makeWorkbook([row({ cutType: '수시 일반', avgCut: 87.5 })]),
    new Map()
  );
  assert(errorTypes(result).includes('cutScaleOutOfRange'), `cutScaleOutOfRange 여야 한다: ${JSON.stringify(errorTypes(result))}`);
  assert(result.rows.length === 0, '거부된 행이 payload 에 남았다');
  assert(result.summary.willSkip === 1, 'willSkip 이 1이어야 한다');
});

check('cutScaleOutOfRange — 정시에 음수/100 초과를 넣으면 거부한다', () => {
  const result = parseGoalUniversityCutRowsFromXlsx(
    makeWorkbook([row({ cutType: '정시', avgCut: 101 }), row({ cutType: '정시', university: '서울대', avgCut: -1 })]),
    new Map()
  );
  assert(result.errors.length === 2 && errorTypes(result).every((t) => t === 'cutScaleOutOfRange'), '둘 다 범위 밖 거부여야 한다');
});

check('jungsiLooksLikeGrade — 정시 컷 3.2 는 거부가 아니라 경고다(백분위 3.2 도 합법)', () => {
  const result = parseGoalUniversityCutRowsFromXlsx(
    makeWorkbook([row({ cutType: '정시', avgCut: 3.2 })]),
    new Map()
  );
  assert(result.errors.length === 0, 'CHECK(0~100)를 통과하는 값이라 거부하면 안 된다');
  assert(warningTypes(result).includes('jungsiLooksLikeGrade'), '경고가 없다');
  assert(result.rows[0].avg_cut === 3.2, '경고 행은 저장돼야 한다');
});

check('정시 백분위 0 은 합법 값이라 살아남는다(clean() 오판 회귀 가드)', () => {
  const result = parseGoalUniversityCutRowsFromXlsx(
    makeWorkbook([row({ cutType: '정시', avgCut: 0 })]),
    new Map()
  );
  assert(result.errors.length === 0, `0 이 거부됐다: ${JSON.stringify(result.errors)}`);
  assert(result.rows[0].avg_cut === 0, `0 이 null 로 접혔다: ${result.rows[0].avg_cut}`);
  assert(!warningTypes(result).includes('cutMissing'), '0 을 빈 값으로 오판했다');
});

check('naesinCutTooHigh — 수시 8.5 등급은 경고, 9 초과는 거부', () => {
  const warnResult = parseGoalUniversityCutRowsFromXlsx(
    makeWorkbook([row({ avgCut: 8.5 })]),
    new Map()
  );
  assert(warningTypes(warnResult).includes('naesinCutTooHigh'), '8.5 등급 경고가 없다');
  assert(warnResult.errors.length === 0, '8.5 는 1~9 안이라 거부하면 안 된다');

  const failResult = parseGoalUniversityCutRowsFromXlsx(
    makeWorkbook([row({ avgCut: 9.5 })]),
    new Map()
  );
  assert(errorTypes(failResult).includes('cutScaleOutOfRange'), '9.5 는 거부여야 한다');
});

check('GOAL_CUT_RANGE 가 sql/55 CHECK 와 같은 값이다', () => {
  assert(GOAL_CUT_RANGE.normal.min === 1 && GOAL_CUT_RANGE.normal.max === 9, 'normal 범위가 1~9 가 아니다');
  assert(GOAL_CUT_RANGE.special.min === 1 && GOAL_CUT_RANGE.special.max === 9, 'special 범위가 1~9 가 아니다');
  assert(GOAL_CUT_RANGE.jungsi.min === 0 && GOAL_CUT_RANGE.jungsi.max === 100, 'jungsi 범위가 0~100 이 아니다');
});

// ---------------------------------------------------------------------
// 3. 🔴 cut_type 변경 차단
// ---------------------------------------------------------------------

check('cutTypeChanged — id 가 있는 행의 컷 종류를 바꾸면 거부한다', () => {
  const result = parseGoalUniversityCutRowsFromXlsx(
    makeWorkbook([row({ id: 7, cutType: '정시', avgCut: 80 })]),
    new Map([[7, 'normal']])
  );
  assert(errorTypes(result).includes('cutTypeChanged'), `cutTypeChanged 여야 한다: ${JSON.stringify(errorTypes(result))}`);
  assert(result.rows.length === 0, '거부된 행이 payload 에 남았다');
});

check('cutTypeChanged — 같은 컷 종류면 통과한다', () => {
  const result = parseGoalUniversityCutRowsFromXlsx(
    makeWorkbook([row({ id: 7, cutType: '수시 일반', avgCut: 3.3 })]),
    new Map([[7, 'normal']])
  );
  assert(result.errors.length === 0, `거부가 없어야 한다: ${JSON.stringify(result.errors)}`);
  assert(result.summary.willUpdate === 1, '수정으로 분류돼야 한다');
});

check('신규 등록(id 빈 칸)에는 cutTypeChanged 가 적용되지 않는다', () => {
  const result = parseGoalUniversityCutRowsFromXlsx(
    makeWorkbook([row({ id: '', cutType: '정시', avgCut: 80 })]),
    new Map([[7, 'normal']])
  );
  assert(result.errors.length === 0, `거부가 없어야 한다: ${JSON.stringify(result.errors)}`);
  assert(result.summary.willInsert === 1, '신규로 분류돼야 한다');
  assert(!('id' in result.rows[0]), 'insert payload 에 id 가 들어갔다');
});

// ---------------------------------------------------------------------
// 4. id / 필수값 / 도메인
// ---------------------------------------------------------------------

check('idNotFound — DB 에 없는 id 는 거부한다(캐시 없이 매번 조회하는 근거)', () => {
  const result = parseGoalUniversityCutRowsFromXlsx(
    makeWorkbook([row({ id: 999 })]),
    new Map([[7, 'normal']])
  );
  assert(errorTypes(result).includes('idNotFound'), 'idNotFound 여야 한다');
});

check('invalidId — 정수가 아닌 id 는 거부한다', () => {
  const result = parseGoalUniversityCutRowsFromXlsx(
    makeWorkbook([row({ id: '7.5' }), row({ id: 'abc', university: '서울대' })]),
    new Map([[7, 'normal']])
  );
  assert(result.errors.length === 2 && errorTypes(result).every((t) => t === 'invalidId'), '둘 다 invalidId 여야 한다');
});

check('missingRequiredFields — 학과명이 비면 거부한다(빈 학과명은 매칭 불가)', () => {
  const result = parseGoalUniversityCutRowsFromXlsx(
    makeWorkbook([row({ department: '' })]),
    new Map()
  );
  assert(errorTypes(result).includes('missingRequiredFields'), 'missingRequiredFields 여야 한다');
  assert(result.errors[0].reason.includes('학과명'), '학과명이 사유에 없다');
});

check('invalidCutType — 3종 밖 라벨은 거부한다', () => {
  const result = parseGoalUniversityCutRowsFromXlsx(
    makeWorkbook([row({ cutType: '수시' })]),
    new Map()
  );
  assert(errorTypes(result).includes('invalidCutType'), 'invalidCutType 여야 한다');
});

check('invalidNumber / invalidSourceYear', () => {
  const bad = parseGoalUniversityCutRowsFromXlsx(makeWorkbook([row({ avgCut: '삼점오' })]), new Map());
  assert(errorTypes(bad).includes('invalidNumber'), 'invalidNumber 여야 한다');

  const badYear = parseGoalUniversityCutRowsFromXlsx(makeWorkbook([row({ sourceYear: 20260 })]), new Map());
  assert(errorTypes(badYear).includes('invalidSourceYear'), 'invalidSourceYear 여야 한다');

  const okYear = parseGoalUniversityCutRowsFromXlsx(makeWorkbook([row({ sourceYear: '' })]), new Map());
  assert(okYear.errors.length === 0 && okYear.rows[0].source_year === null, '빈 기준 연도는 null 로 통과해야 한다');
});

check('duplicateNaturalKey — 파일 안에서 (컷 종류, 대학명, 학과명)이 겹치면 뒤 행을 거부한다', () => {
  const result = parseGoalUniversityCutRowsFromXlsx(
    makeWorkbook([row({ avgCut: 2.5 }), row({ avgCut: 3.5 })]),
    new Map()
  );
  assert(errorTypes(result).includes('duplicateNaturalKey'), 'duplicateNaturalKey 여야 한다');
  assert(result.rows.length === 1 && result.rows[0].avg_cut === 2.5, '첫 행만 살아남아야 한다');
});

check('컷 종류가 다르면 같은 (대학, 학과)라도 중복이 아니다', () => {
  const result = parseGoalUniversityCutRowsFromXlsx(
    makeWorkbook([row({ cutType: '수시 일반', avgCut: 2.5 }), row({ cutType: '수시 특목', avgCut: 2.1 }), row({ cutType: '정시', avgCut: 88 })]),
    new Map()
  );
  assert(result.errors.length === 0, `거부가 없어야 한다: ${JSON.stringify(result.errors)}`);
  assert(result.rows.length === 3, '3행 모두 살아야 한다');
});

check('truncatedColumn — 잘림 마커가 있으면 행 전체를 거부한다', () => {
  const result = parseGoalUniversityCutRowsFromXlsx(
    makeWorkbook([row({ note: `긴 메모${TRUNCATION_MARKER}` })]),
    new Map()
  );
  assert(errorTypes(result).includes('truncatedColumn'), 'truncatedColumn 이어야 한다');
});

check('sheetNotFound — 시트가 없으면 즉시 반환한다', () => {
  const result = parseGoalUniversityCutRowsFromXlsx({ SheetNames: [], Sheets: {} }, new Map());
  assert(errorTypes(result).includes('sheetNotFound'), 'sheetNotFound 여야 한다');
  assert(result.rows.length === 0, 'rows 가 비어야 한다');
});

// ---------------------------------------------------------------------
// 5. 경고 / 빈 값 / 요약
// ---------------------------------------------------------------------

check('unknownSource — 알 수 없는 출처는 경고를 남기고 manual 로 저장된다', () => {
  const result = parseGoalUniversityCutRowsFromXlsx(
    makeWorkbook([row({ source: '입결정보유도' })]), // 공백 하나 빠진 오타
    new Map()
  );
  assert(result.errors.length === 0, `거부가 아니라 경고여야 한다: ${JSON.stringify(result.errors)}`);
  assert(warningTypes(result).includes('unknownSource'), 'unknownSource 경고가 있어야 한다');
  assert(result.rows[0].source === 'manual', "manual 로 떨어져야 한다");
});

check('알려진 출처 라벨과 빈 출처는 unknownSource 경고를 내지 않는다', () => {
  const known = parseGoalUniversityCutRowsFromXlsx(
    makeWorkbook([row({ source: '입결정보 유도' }), row({ university: '서울대', source: '수기 입력' })]),
    new Map()
  );
  assert(!warningTypes(known).includes('unknownSource'), '알려진 라벨은 경고 대상이 아니다');
  assert(known.rows[0].source === 'admission_results' && known.rows[1].source === 'manual', '출처 매핑이 틀렸다');

  const blank = parseGoalUniversityCutRowsFromXlsx(makeWorkbook([row({ source: '' })]), new Map());
  assert(!warningTypes(blank).includes('unknownSource'), '빈 출처는 경고 대상이 아니다');
  assert(blank.rows[0].source === 'manual', '빈 출처는 manual 기본값이다');
});

check('cutMissing / inactiveRow 경고', () => {
  const result = parseGoalUniversityCutRowsFromXlsx(
    makeWorkbook([row({ avgCut: '', isActive: 'N' })]),
    new Map()
  );
  assert(result.errors.length === 0, '컷 미확보는 거부가 아니다');
  assert(warningTypes(result).includes('cutMissing'), 'cutMissing 경고가 없다');
  assert(warningTypes(result).includes('inactiveRow'), 'inactiveRow 경고가 없다');
  assert(result.rows[0].avg_cut === null, '빈 컷 값은 null 이어야 한다');
  assert(result.rows[0].is_active === false, 'N 이 false 로 파싱되지 않았다');
});

check('완전히 빈 행은 조용히 건너뛴다', () => {
  const result = parseGoalUniversityCutRowsFromXlsx(
    makeWorkbook([row(), ['', '', '', '', '', '', '', '', ''], []]),
    new Map()
  );
  assert(result.errors.length === 0, `거부가 없어야 한다: ${JSON.stringify(result.errors)}`);
  assert(result.rows.length === 1, '빈 행이 payload 로 들어갔다');
});

check('summary 집계가 rows/errors/warnings 와 일치한다', () => {
  const result = parseGoalUniversityCutRowsFromXlsx(
    makeWorkbook([
      row({ id: 7, avgCut: 3.3 }), // update
      row({ university: '서울대', avgCut: 1.2 }), // insert
      row({ university: '고려대', avgCut: 99 }), // 거부(범위 밖)
      row({ university: '한양대', cutType: '정시', avgCut: 5 }) // insert + 경고
    ]),
    new Map([[7, 'normal']])
  );
  assert(result.summary.willUpdate === 1, `willUpdate=1 이어야 한다: ${result.summary.willUpdate}`);
  assert(result.summary.willInsert === 2, `willInsert=2 여야 한다: ${result.summary.willInsert}`);
  assert(result.summary.willSkip === 1, `willSkip=1 이어야 한다: ${result.summary.willSkip}`);
  assert(result.rows.length === 3, 'payload 행수가 willInsert+willUpdate 와 다르다');
  assert(result.summary.errorCounts.cutScaleOutOfRange === 1, 'errorCounts 가 type 별로 안 세어졌다');
  assert(result.summary.warningCounts.jungsiLooksLikeGrade === 1, 'warningCounts 가 type 별로 안 세어졌다');
});

check('insert 배치와 update 배치의 키 집합이 각각 균일하다(PostgREST 키집합 해석 방어)', () => {
  const result = parseGoalUniversityCutRowsFromXlsx(
    makeWorkbook([
      row({ id: 7, avgCut: 3.3 }),
      row({ id: 8, university: '서울대', avgCut: 1.2 }),
      row({ university: '고려대', avgCut: 2.2 }),
      row({ university: '한양대', avgCut: 2.4 })
    ]),
    new Map([
      [7, 'normal'],
      [8, 'normal']
    ])
  );
  const inserts = result.rows.filter((r) => !('id' in r));
  const updates = result.rows.filter((r) => 'id' in r);
  assert(inserts.length === 2 && updates.length === 2, '분기 개수가 틀렸다');
  const keysOf = (r) => Object.keys(r).sort().join(',');
  assert(new Set(inserts.map(keysOf)).size === 1, 'insert 배치의 키 집합이 균일하지 않다');
  assert(new Set(updates.map(keysOf)).size === 1, 'update 배치의 키 집합이 균일하지 않다');
});

console.log(`\n총 ${passCount + failCount}건 — PASS ${passCount} / FAIL ${failCount}`);
process.exit(failCount > 0 ? 1 : 0);
