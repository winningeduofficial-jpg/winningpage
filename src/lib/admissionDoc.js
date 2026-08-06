// =====================================================================
// 대입모집요강 구조화 문서(AdmissionDoc) 스키마 + 런타임 validator.
//
// 프로젝트에 TS가 없으므로 타입은 JSDoc으로만 문서화하고, 실제 검증은
// validateAdmissionDoc()의 런타임 체크로 강제한다. React/DOM에 의존하지
// 않으며, admissionParsing.js를 import하지 않는다(순환 의존 회피 —
// admissionParsing.js가 doc 생성기에서 이 모듈을 import하는 방향만 존재).
//
// 설계 문서 §2(스키마), §2.4(validator 불변식) 근거.
// =====================================================================

/** @typedef {'previous_year_changes'|'selection_method'|'minimum_requirements'|'exam_schedule'|'school_record_method'|'recruitment_quota'} SectionKey */

export const SECTION_KEYS = [
  'previous_year_changes',
  'selection_method',
  'minimum_requirements',
  'exam_schedule',
  'school_record_method',
  'recruitment_quota'
];

// jsonb 컬럼 매핑. recruitment_quota만 html 쪽이 recruitment_result_html로
// 어긋나 있는데(admissionParsing.js:HWP_SECTION_HTML_KEYS), json은 6개 전부
// `<rawKey>_json` 접미어로 통일한다(설계 문서 §3.1 네이밍 결정).
export const HWP_SECTION_JSON_KEYS = {
  previous_year_changes: 'previous_year_changes_json',
  selection_method: 'selection_method_json',
  minimum_requirements: 'minimum_requirements_json',
  exam_schedule: 'exam_schedule_json',
  school_record_method: 'school_record_method_json',
  recruitment_quota: 'recruitment_quota_json'
};

/**
 * jsonb 컬럼 1개 = doc 1개.
 * @typedef {Object} AdmissionDoc
 * @property {1} v - 렌더러는 v!==1이면 doc을 무시하고 html 폴백(조용한 성공 금지).
 * @property {SectionKey} section
 * @property {'parser'|'legacy-html'|'html-import'|'bundled-special'|'manual'} source
 * @property {string} generator - 예: 'admissionParsing@<git short sha>'
 * @property {string} generatedAt - ISO8601. 변경 감지 비교(stableStringifyDoc)에서 제외.
 * @property {'special'} [wrapModifier] - 루트 wrap에 붙는 modifier. 특수대학 wrap 표현용.
 * @property {Block[]} blocks - 빈 배열 = 콘텐츠 없음(isEmptyDoc 판정의 유일 기준).
 * @property {Warning[]} [warnings] - 렌더 무영향. 어드민/검증/QA가 읽는다.
 */

/** @typedef {TableBlock|KeyValueBlock|PlainListBlock|PreTextBlock|EmptyBoxBlock|NoteBlock|FootnoteBlock|HeadingBlock|GroupBlock|RawHtmlBlock} Block */

/**
 * @typedef {Object} Column
 * @property {string} role - 'type'|'name'|'seats'|'minimum'|'method'|'target'|'schedule'|'areas'|'note'|'no'|'title'|'content'|'group'|'unit'|'series'|'data' 등.
 * @property {string} label - 표시 문자열.
 * @property {'left'|'center'} [align] - 미지정 시 variant 기본 규칙.
 */

/**
 * 표. 렌더러가 variant 값으로 (a) className 조합 (b) 셀 클래스 규칙
 * (c) 빈값 표기('-' 리터럴 vs muted span) (d) 스크롤 래퍼 modifier를 전부 결정한다.
 * @typedef {Object} TableBlock
 * @property {'table'} kind
 * @property {'selection'|'change'|'exam'|'minimum'|'recordInfo'|'score'|'special'|'recruit'|'recruitExact'|'generic'} variant
 * @property {Column[]} columns
 * @property {Cell[][]} rows - 항상 columns.length 길이(직사각형).
 * @property {{name:string,count:number}[]} [groups] - recruitExact 전용 상단 그룹 헤더.
 * @property {number} [fixedColumnCount] - groups가 있을 때 rowSpan=2를 받는 선두 컬럼 수.
 */

/** @typedef {string|{text:string,badge:'minimumHas'|'minimumNone'}|{chips:{label:string,value:string}[]}} Cell */

/** @typedef {Object} KeyValueBlock
 * @property {'keyValue'} kind
 * @property {{label:string,content:string}[]} rows
 */

/** @typedef {Object} PlainListBlock
 * @property {'plainList'} kind
 * @property {{type:'bullet'|'subtitle'|'text',text:string}[]} items
 */

/** @typedef {Object} PreTextBlock
 * @property {'preText'} kind
 * @property {string} text
 */

/** @typedef {Object} EmptyBoxBlock
 * @property {'emptyBox'} kind
 * @property {string} message
 */

/** @typedef {Object} NoteBlock
 * @property {'note'} kind
 * @property {string} text
 */

/** @typedef {Object} FootnoteBlock
 * @property {'footnote'} kind
 * @property {string[]} items
 */

/** @typedef {Object} HeadingBlock
 * @property {'heading'} kind
 * @property {string} text
 */

/** 제목 + 표를 하나로 묶는 grid 컨테이너. 특수대학·환산표 필수.
 * @typedef {Object} GroupBlock
 * @property {'group'} kind
 * @property {string} [title]
 * @property {Block[]} children
 */

/** 탈출 해치 — 구조화 표현이 존재한 적 없는 입력을 무손실 보존.
 * 잔량이 곧 남은 부채의 정량 지표다.
 * @typedef {Object} RawHtmlBlock
 * @property {'rawHtml'} kind
 * @property {string} html
 * @property {'curated-html'|'input-was-html'|'import-failed'} reason
 */

/**
 * @typedef {Object} Warning
 * @property {'fallback-plain-list'|'label-inferred'|'chunk-split-heuristic'|'group-header-reinferred'|'subject-marks-flattened'|'merge-info-lost'|'masked-token'|'curated-html-preserved'} code
 * @property {string} [detail]
 */

export const WARNING_CODES = [
  'fallback-plain-list',
  'label-inferred',
  'chunk-split-heuristic',
  'group-header-reinferred',
  'subject-marks-flattened',
  'merge-info-lost',
  'masked-token',
  'curated-html-preserved'
];

// nth-child 폭 규칙(AdmissionGuidelines.jsx의 인라인 style) 붕괴 방어선.
// 이 5개 variant만 컬럼 수가 고정이다 — score/special/recruit/recruitExact/
// generic은 카테고리·대학마다 컬럼 수가 달라 고정할 수 없다.
const FIXED_COLUMN_COUNTS = { selection: 5, minimum: 5, exam: 3, change: 3, recordInfo: 2 };

/**
 * blocks:[] = 콘텐츠 없음. 이 판정이 isEmptyDoc의 유일 기준이다(어드민
 * truthiness 가드 Admin.jsx의 대체물).
 * @param {AdmissionDoc|null|undefined} doc
 * @returns {boolean}
 */
export function isEmptyDoc(doc) {
  return !doc || !Array.isArray(doc.blocks) || doc.blocks.length === 0;
}

/**
 * @param {TableBlock} block
 * @param {string|number} label
 * @param {string[]} errors
 */
function validateTableBlock(block, label, errors) {
  if (!Array.isArray(block.columns)) {
    errors.push(`blocks[${label}](table)의 columns가 배열이 아닙니다.`);
    return;
  }
  if (!Array.isArray(block.rows)) {
    errors.push(`blocks[${label}](table)의 rows가 배열이 아닙니다.`);
    return;
  }
  block.rows.forEach((row, rowIdx) => {
    if (!Array.isArray(row) || row.length !== block.columns.length) {
      const rowLength = Array.isArray(row) ? row.length : 'N/A';
      errors.push(
        `blocks[${label}](table).rows[${rowIdx}]의 길이(${rowLength})가 columns.length(${block.columns.length})와 다릅니다.`
      );
    }
  });

  const fixedCount = FIXED_COLUMN_COUNTS[block.variant];
  if (fixedCount !== undefined && block.columns.length !== fixedCount) {
    errors.push(
      `blocks[${label}](table).variant='${block.variant}'는 컬럼 수가 ${fixedCount}이어야 하는데 ${block.columns.length}입니다(nth-child 폭 규칙 붕괴 위험).`
    );
  }

  if (block.groups) {
    const groupSum = block.groups.reduce((sum, g) => sum + (Number(g?.count) || 0), 0);
    const fixedColumnCount = Number(block.fixedColumnCount) || 0;
    if (groupSum + fixedColumnCount !== block.columns.length) {
      errors.push(
        `blocks[${label}](table)의 groups 합(${groupSum}) + fixedColumnCount(${fixedColumnCount})가 columns.length(${block.columns.length})와 다릅니다.`
      );
    }
  }
}

/**
 * @param {Block[]} blocks
 * @param {string} labelPrefix
 * @param {string[]} errors
 */
function validateBlocks(blocks, labelPrefix, errors) {
  blocks.forEach((block, idx) => {
    const label = `${labelPrefix}${idx}`;
    if (!block || typeof block !== 'object' || typeof block.kind !== 'string') {
      errors.push(`blocks[${label}]가 유효한 Block이 아닙니다.`);
      return;
    }
    if (block.kind === 'table') {
      validateTableBlock(block, label, errors);
    } else if (block.kind === 'group') {
      if (!Array.isArray(block.children)) {
        errors.push(`blocks[${label}](group)의 children이 배열이 아닙니다.`);
      } else {
        validateBlocks(block.children, `${label}.children[`, errors);
      }
    }
  });
}

/**
 * 불변식(설계 문서 §2.4):
 *   1. v===1, section∈SectionKey, Array.isArray(blocks)
 *   2. 모든 TableBlock: rows.every(r => r.length === columns.length)
 *   3. 컬럼 수 고정 — {selection:5, minimum:5, exam:3, change:3, recordInfo:2}
 *   4. groups 존재 시 sum(groups[].count) + fixedColumnCount === columns.length
 *   5. undefined|NaN|[object Object]|null null 패턴은 error 아닌 warning —
 *      이 validator는 그 패턴을 애초에 검사하지 않는다(검사해서 error로
 *      올리면 이 불변식을 어기게 된다). 그 결함을 표면화하는 책임은 doc
 *      생성기가 warnings에 code:'masked-token'을 붙이는 쪽에 있다.
 *   6. isEmptyDoc은 별도 함수(위)로 제공.
 * @param {AdmissionDoc} doc
 * @returns {{ok: boolean, errors: string[]}}
 */
export function validateAdmissionDoc(doc) {
  const errors = [];

  if (!doc || typeof doc !== 'object') {
    return { ok: false, errors: ['doc가 객체가 아닙니다.'] };
  }
  if (doc.v !== 1) errors.push(`v는 반드시 1이어야 합니다(현재: ${JSON.stringify(doc.v)}).`);
  if (!SECTION_KEYS.includes(doc.section)) errors.push(`알 수 없는 section: ${JSON.stringify(doc.section)}`);
  if (!Array.isArray(doc.blocks)) {
    errors.push('blocks가 배열이 아닙니다.');
    return { ok: false, errors };
  }

  validateBlocks(doc.blocks, '', errors);

  return { ok: errors.length === 0, errors };
}

/**
 * @param {unknown} value
 * @returns {unknown}
 */
function sortKeysDeep(value) {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        acc[key] = sortKeysDeep(value[key]);
        return acc;
      }, {});
  }
  return value;
}

/**
 * 어드민 변경 감지 비교용 직렬화. generatedAt은 항상 다르므로 제외하지
 * 않으면 매번 "변경됨"으로 판정된다. 키 정렬로 객체 키 순서 차이를
 * 무시한다.
 * @param {AdmissionDoc} doc
 * @returns {string}
 */
export function stableStringifyDoc(doc) {
  if (!doc || typeof doc !== 'object') return JSON.stringify(doc ?? null);
  const { generatedAt, ...rest } = doc;
  return JSON.stringify(sortKeysDeep(rest));
}
