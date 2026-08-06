// 대입모집요강 구조화 문서(AdmissionDoc) React 렌더러의 클래스/레이아웃 정본.
// variant → (스크롤 래퍼 className / table className / 컬럼별 셀 클래스 / 빈값 표기)
// 매핑을 여기 한 곳에 모은다 — 설계 문서 §5.3 DOM 동형성 계약 표를 그대로
// 데이터로 옮긴 것이며, 실측 근거는 src/lib/admissionParsing.js의 각 빌더다.
//
// 순수 데이터/함수만 둔다(JSX 없음) — 이 프로젝트의 vite/esbuild 설정은
// .jsx/.tsx만 JSX로 트랜스파일하고 .js는 트랜스파일하지 않는다.

// ── 표 variant → 스크롤 래퍼/테이블 className ──────────────────────────
// 실측: htmlTable()(exam/minimum/recordInfo/score/special 공용)이
// options.compact를 받아도 options.className이 함께 오면 className이 통째로
// 이긴다(admissionParsing.js:296 `const cls = options.className || ...`).
// 실제 호출부(score/recordInfo)는 항상 둘 다 넘기므로 compact는 현재
// 코드베이스에서 어떤 variant에도 실질 적용되지 않는다 — 이 렌더러도
// admission-table-compact를 붙이지 않는다(런타임 실측 우선, 설계 문서
// §5.3의 "[ admission-table-compact]" 표기는 이론상 가능성이지 실측이
// 아니다).
export const TABLE_VARIANT_LAYOUT = {
  selection: {
    scrollWrapClassName: 'admission-scroll-table',
    tableClassName: 'admission-data-table admission-selection-table'
  },
  change: {
    scrollWrapClassName: 'admission-scroll-table admission-change-scroll-table',
    tableClassName: 'admission-data-table admission-change-table admission-change-table-v87'
  },
  recruit: {
    scrollWrapClassName: 'admission-scroll-table',
    tableClassName: 'admission-data-table admission-recruit-table'
  },
  recruitExact: {
    scrollWrapClassName: 'admission-scroll-table',
    tableClassName: 'admission-data-table admission-normalized-recruit-table'
  },
  exam: {
    scrollWrapClassName: 'admission-scroll-table',
    tableClassName: 'admission-data-table admission-exam-table'
  },
  minimum: {
    scrollWrapClassName: 'admission-scroll-table',
    tableClassName: 'admission-data-table admission-minimum-table'
  },
  recordInfo: {
    scrollWrapClassName: 'admission-scroll-table',
    tableClassName: 'admission-data-table admission-record-info-table'
  },
  score: {
    scrollWrapClassName: 'admission-scroll-table',
    tableClassName: 'admission-data-table admission-score-table'
  },
  special: {
    scrollWrapClassName: 'admission-scroll-table',
    tableClassName: 'admission-data-table admission-special-table'
  },
  // 스키마 상 존재하나 현재 파서 어느 빌더도 만들지 않는 탈출구. 실측 근거 없음.
  generic: {
    scrollWrapClassName: 'admission-scroll-table',
    tableClassName: 'admission-data-table'
  }
};

export function getTableVariantLayout(variant) {
  return TABLE_VARIANT_LAYOUT[variant] || TABLE_VARIANT_LAYOUT.generic;
}

// ── selection 셀 클래스(admissionParsing.js:1194 buildSelectionMethodTable) ──
export const SELECTION_CELL_CLASS_BY_ROLE = {
  type: 'selection-type-cell',
  name: 'left selection-name-cell',
  seats: 'selection-seat-cell',
  minimum: 'selection-minimum-cell',
  method: 'left selection-method-cell'
};

// selection 비-minimum 컬럼의 빈값은 muted span이 아니라 리터럴 '-'다.
export function selectionEmptyFallback(role) {
  return '-';
}

// ── change 셀 클래스(admissionParsing.js:941 buildChangeTableHtml) ─────
export const CHANGE_CELL_CLASS_BY_ROLE = {
  no: 'change-no-cell',
  title: 'change-title-cell',
  content: 'change-content-cell'
};

export const CHANGE_EMPTY_FALLBACK_BY_ROLE = {
  no: '-',
  title: '주요 변경'
  // content는 값이 없으면 muted span — TableBlockView/ChangeTable에서 별도 처리.
};

// ── recruit 고정 셀 클래스(admissionParsing.js:2261 buildRecruitmentHtml) ──
export const RECRUIT_FIXED_CELL_CLASS_BY_ROLE = {
  group: 'left group-cell',
  unit: 'left unit-cell'
};

// group/unit 빈값은 리터럴 '-'(escapeHtml(row.group || '-')).
export function recruitFixedEmptyFallback() {
  return '-';
}

// ── recruitExact 고정 컬럼 클래스(admissionParsing.js:553 normalizeRecruitmentExactHtml) ──
// 위치 기반이다(role이 아니라 fixedColumnCount로 판정) — legacy가
// `idx === 0 ? 'series-cell' : ''`로 오직 첫 컬럼만 구분하기 때문.
export function recruitExactFixedCellClassName(idx) {
  return idx === 0 ? 'left series-cell' : 'left';
}

// ── generic(exam/minimum/recordInfo/score/special) 셀 클래스(htmlTable:294) ──
// idx 0·1에만 'left'.
export function isGenericLeftColumn(idx) {
  return idx === 0 || idx === 1;
}

// ── 셀 편집 UI 종류(표 편집기 전용) ──────────────────────────────────
// 어떤 (variant, role) 조합이 Cell의 3형태(문자열/{text,badge}/{chips}) 중
// 무엇을 쓰는지 판정한다. blocks/tables/SelectionTable.jsx의
// `role === 'minimum'` 분기, blocks/tables/RecruitTable.jsx의
// `role === 'group' || role === 'unit'` 분기와 정확히 같은 조건을 그대로
// 옮긴 것이다 — 표시 컴포넌트를 고치지 않고(Gate B 바이트 계약 보호)
// 편집기가 같은 판정을 공유하도록 이 함수 하나로 뽑아냈다. 표시 컴포넌트
// 쪽 조건이 바뀌면 이 함수도 같이 바꿔야 한다(현재는 인라인 조건 중복 —
// 표시 컴포넌트를 이 함수를 쓰도록 리팩터하는 건 별도 작업).
export function getCellKind(variant, role) {
  if (variant === 'selection' && role === 'minimum') return 'badge';
  if (variant === 'recruit' && role !== 'group' && role !== 'unit') return 'chips';
  return 'text';
}
