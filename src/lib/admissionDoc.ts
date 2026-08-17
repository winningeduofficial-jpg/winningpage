// =====================================================================
// 대입모집요강 구조화 문서(AdmissionDoc) 스키마 + 런타임 validator.
//
// 실제 검증은 validateAdmissionDoc()의 런타임 체크로 강제한다. React/DOM에 의존하지
// 않으며, admissionParsing.js를 import하지 않는다(순환 의존 회피 —
// admissionParsing.js가 doc 생성기에서 이 모듈을 import하는 방향만 존재).
//
// 이 파일은 Block/TableBlock 유니온 타입의 원천 파일이다 — 이미 커밋된 컴포넌트들이
// `import type { Block, TableBlock, ... } from "./admissionDoc"`로 이 타입들을 쓰고
// 있으므로, 종전 JSDoc @typedef와 동일한 셰이프를 그대로 export type으로 옮긴다
// (재정의로 인한 shape 변경 금지).
//
// 설계 문서 §2(스키마), §2.4(validator 불변식) 근거.
// =====================================================================

export type SectionKey =
  | "previous_year_changes"
  | "selection_method"
  | "minimum_requirements"
  | "exam_schedule"
  | "school_record_method"
  | "recruitment_quota";

const SECTION_KEYS: SectionKey[] = [
  "previous_year_changes",
  "selection_method",
  "minimum_requirements",
  "exam_schedule",
  "school_record_method",
  "recruitment_quota",
];

// jsonb 컬럼 매핑. recruitment_quota만 html 쪽이 recruitment_result_html로
// 어긋나 있는데(admissionParsing.js:HWP_SECTION_HTML_KEYS), json은 6개 전부
// `<rawKey>_json` 접미어로 통일한다(설계 문서 §3.1 네이밍 결정).
export const HWP_SECTION_JSON_KEYS: Record<SectionKey, string> = {
  previous_year_changes: "previous_year_changes_json",
  selection_method: "selection_method_json",
  minimum_requirements: "minimum_requirements_json",
  exam_schedule: "exam_schedule_json",
  school_record_method: "school_record_method_json",
  recruitment_quota: "recruitment_quota_json",
};

/**
 * jsonb 컬럼 1개 = doc 1개.
 * v - 렌더러는 v!==1이면 doc을 무시하고 html 폴백(조용한 성공 금지).
 * generator - 예: 'admissionParsing@<git short sha>'
 * generatedAt - ISO8601. 변경 감지 비교(stableStringifyDoc)에서 제외.
 * wrapModifier - 루트 wrap에 붙는 modifier. 특수대학 wrap 표현용.
 * blocks - 빈 배열 = 콘텐츠 없음(isEmptyDoc 판정의 유일 기준).
 * warnings - 렌더 무영향. 어드민/검증/QA가 읽는다.
 */
export type AdmissionDoc = {
  v: 1;
  section: SectionKey;
  source:
    | "parser"
    | "legacy-html"
    | "html-import"
    | "bundled-special"
    | "manual";
  generator: string;
  generatedAt: string;
  wrapModifier?: "special";
  blocks: Block[];
  warnings?: Warning[];
};

export type Block =
  | TableBlock
  | KeyValueBlock
  | PlainListBlock
  | PreTextBlock
  | EmptyBoxBlock
  | NoteBlock
  | FootnoteBlock
  | HeadingBlock
  | GroupBlock
  | RawHtmlBlock;

/**
 * role - 'type'|'name'|'seats'|'minimum'|'method'|'target'|'schedule'|'areas'|'note'|'no'|'title'|'content'|'group'|'unit'|'series'|'data' 등.
 * label - 표시 문자열.
 * align - 미지정 시 variant 기본 규칙.
 */
export type Column = {
  role: string;
  label: string;
  align?: "left" | "center";
};

/**
 * 표. 렌더러가 variant 값으로 (a) className 조합 (b) 셀 클래스 규칙
 * (c) 빈값 표기('-' 리터럴 vs muted span) (d) 스크롤 래퍼 modifier를 전부 결정한다.
 * rows - 항상 columns.length 길이(직사각형).
 * groups - recruitExact 전용 상단 그룹 헤더.
 * fixedColumnCount - groups가 있을 때 rowSpan=2를 받는 선두 컬럼 수.
 */
export type TableBlock = {
  kind: "table";
  variant:
    | "selection"
    | "change"
    | "exam"
    | "minimum"
    | "recordInfo"
    | "score"
    | "special"
    | "recruit"
    | "recruitExact"
    | "generic";
  columns: Column[];
  rows: Cell[][];
  groups?: { name: string; count: number }[];
  fixedColumnCount?: number;
};

export type Cell =
  | string
  | { text: string; badge: "minimumHas" | "minimumNone" }
  | { chips: { label: string; value: string }[] };

type KeyValueBlock = {
  kind: "keyValue";
  rows: { label: string; content: string }[];
};

type PlainListBlock = {
  kind: "plainList";
  items: { type: "bullet" | "subtitle" | "text"; text: string }[];
};

type PreTextBlock = {
  kind: "preText";
  text: string;
};

type EmptyBoxBlock = {
  kind: "emptyBox";
  message: string;
};

type NoteBlock = {
  kind: "note";
  text: string;
};

type FootnoteBlock = {
  kind: "footnote";
  items: string[];
};

type HeadingBlock = {
  kind: "heading";
  text: string;
};

/** 제목 + 표를 하나로 묶는 grid 컨테이너. 특수대학·환산표 필수. */
type GroupBlock = {
  kind: "group";
  title?: string;
  children: Block[];
};

/** 탈출 해치 — 구조화 표현이 존재한 적 없는 입력을 무손실 보존. 잔량이 곧 남은 부채의 정량 지표다. */
type RawHtmlBlock = {
  kind: "rawHtml";
  html: string;
  reason: "curated-html" | "input-was-html" | "import-failed";
};

export type Warning = {
  code:
    | "fallback-plain-list"
    | "label-inferred"
    | "chunk-split-heuristic"
    | "group-header-reinferred"
    | "subject-marks-flattened"
    | "merge-info-lost"
    | "masked-token"
    | "curated-html-preserved";
  detail?: string;
};

// nth-child 폭 규칙(AdmissionGuidelines.jsx의 인라인 style) 붕괴 방어선.
// 이 5개 variant만 컬럼 수가 고정이다 — score/special/recruit/recruitExact/
// generic은 카테고리·대학마다 컬럼 수가 달라 고정할 수 없다.
const FIXED_COLUMN_COUNTS: Partial<Record<TableBlock["variant"], number>> = {
  selection: 5,
  minimum: 5,
  exam: 3,
  change: 3,
  recordInfo: 2,
};

/**
 * blocks:[] = 콘텐츠 없음. 이 판정이 isEmptyDoc의 유일 기준이다(어드민
 * truthiness 가드 Admin.jsx의 대체물).
 */
export function isEmptyDoc(doc: AdmissionDoc | null | undefined): boolean {
  return !doc || !Array.isArray(doc.blocks) || doc.blocks.length === 0;
}

function validateTableBlock(
  block: TableBlock,
  label: string | number,
  errors: string[],
) {
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
      const rowLength = Array.isArray(row) ? row.length : "N/A";
      errors.push(
        `blocks[${label}](table).rows[${rowIdx}]의 길이(${rowLength})가 columns.length(${block.columns.length})와 다릅니다.`,
      );
    }
  });

  const fixedCount = FIXED_COLUMN_COUNTS[block.variant];
  if (fixedCount !== undefined && block.columns.length !== fixedCount) {
    errors.push(
      `blocks[${label}](table).variant='${block.variant}'는 컬럼 수가 ${fixedCount}이어야 하는데 ${block.columns.length}입니다(nth-child 폭 규칙 붕괴 위험).`,
    );
  }

  if (block.groups) {
    const groupSum = block.groups.reduce(
      (sum, g) => sum + (Number(g?.count) || 0),
      0,
    );
    const fixedColumnCount = Number(block.fixedColumnCount) || 0;
    if (groupSum + fixedColumnCount !== block.columns.length) {
      errors.push(
        `blocks[${label}](table)의 groups 합(${groupSum}) + fixedColumnCount(${fixedColumnCount})가 columns.length(${block.columns.length})와 다릅니다.`,
      );
    }
  }
}

function validateBlocks(
  blocks: Block[],
  labelPrefix: string,
  errors: string[],
) {
  blocks.forEach((block, idx) => {
    const label = `${labelPrefix}${idx}`;
    if (!block || typeof block !== "object" || typeof block.kind !== "string") {
      errors.push(`blocks[${label}]가 유효한 Block이 아닙니다.`);
      return;
    }
    if (block.kind === "table") {
      validateTableBlock(block, label, errors);
    } else if (block.kind === "group") {
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
 */
export function validateAdmissionDoc(doc: unknown): {
  ok: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!doc || typeof doc !== "object") {
    return { ok: false, errors: ["doc가 객체가 아닙니다."] };
  }
  const candidate = doc as Partial<AdmissionDoc>;
  if (candidate.v !== 1)
    errors.push(
      `v는 반드시 1이어야 합니다(현재: ${JSON.stringify(candidate.v)}).`,
    );
  if (!SECTION_KEYS.includes(candidate.section as SectionKey))
    errors.push(`알 수 없는 section: ${JSON.stringify(candidate.section)}`);
  if (!Array.isArray(candidate.blocks)) {
    errors.push("blocks가 배열이 아닙니다.");
    return { ok: false, errors };
  }

  validateBlocks(candidate.blocks, "", errors);

  return { ok: errors.length === 0, errors };
}

// doc 하나의 "정보량"을 근사한다 — validateAdmissionDoc은 스키마 형태만
// 보고 풍부함은 안 보므로, 정보량 감소 가드는 별도로 이 근사치를 쓴다.
// blockCount(구조 개수)와 textLength(모든 문자열 값의 총 길이 — 셀 텍스트뿐
// 아니라 role/label 등도 섞여 들어가지만, "더 자세한 doc일수록 대체로 더
// 크다"는 근사로는 충분하다)를 함께 본다.
//
// 2026-08-06: scripts/load-admission-content.mjs에서 이 파일로 이동했다
// (위치만 이동, 동작 동일) — 어드민 일괄 엑셀 업로드(admissionBulkXlsx.js)
// 가 브라우저에서 같은 회귀 가드를 재사용해야 하는데, 원래 위치는
// node:fs/promises·supabase client 생성이 있어 브라우저 번들에 못
// 들어갔다. 순수 함수라 admissionDoc.js(스키마/검증 모듈)에 자연스럽게
// 속한다.
function sumStringLength(value: unknown): number {
  if (typeof value === "string") return value.length;
  if (Array.isArray(value))
    return value.reduce((acc: number, v) => acc + sumStringLength(v), 0);
  if (value && typeof value === "object") {
    return Object.values(value).reduce(
      (acc: number, v) => acc + sumStringLength(v),
      0,
    );
  }
  return 0;
}

function docRichness(doc: AdmissionDoc | null | undefined): {
  blockCount: number;
  textLength: number;
} {
  if (!doc || !Array.isArray(doc.blocks))
    return { blockCount: 0, textLength: 0 };
  return {
    blockCount: doc.blocks.length,
    textLength: sumStringLength(doc.blocks),
  };
}

// existingDoc이 없으면 비교할 대상이 없으니 항상 통과(skip:false)한다.
// candidateDoc이 blockCount 또는 textLength 어느 하나라도 existingDoc보다
// 작으면 회귀로 본다(둘 다 같거나 늘면 통과 — 동일한 경우도 통과해야
// 한다, "줄어들면"이지 "같지 않으면"이 아니다).
export function shouldSkipForRegression(
  existingDoc: AdmissionDoc | null | undefined,
  candidateDoc: AdmissionDoc | null | undefined,
): { skip: boolean; detail?: string } {
  if (!existingDoc) return { skip: false };
  const before = docRichness(existingDoc);
  const after = docRichness(candidateDoc);
  if (
    after.blockCount < before.blockCount ||
    after.textLength < before.textLength
  ) {
    return {
      skip: true,
      detail: `blockCount ${before.blockCount}→${after.blockCount}, textLength ${before.textLength}→${after.textLength}`,
    };
  }
  return { skip: false };
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((acc: Record<string, unknown>, key) => {
        acc[key] = sortKeysDeep((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }
  return value;
}

/**
 * 어드민 변경 감지 비교용 직렬화. generatedAt은 항상 다르므로 제외하지
 * 않으면 매번 "변경됨"으로 판정된다. 키 정렬로 객체 키 순서 차이를
 * 무시한다.
 */
export function stableStringifyDoc(
  doc: AdmissionDoc | null | undefined,
): string {
  if (!doc || typeof doc !== "object") return JSON.stringify(doc ?? null);
  const { generatedAt: _generatedAt, ...rest } = doc;
  return JSON.stringify(sortKeysDeep(rest));
}

// 구 buildAdmissionVisualAudit(AdmissionGuidelines.jsx)은 생성 HTML에
// 정규식을 걸어 QA 신호를 뽑았다 — doc 파이프라인에서는 성립하지 않는다
// (그 패널이 실제로는 index 뷰 행을 받아 raw 본문이 없어 사실상 항상
// 0건인 죽은 검수였다는 것도 실측으로 확인됨, 설계 §7-F). 이 함수는 doc
// 구조 자체를 훑어 대체 신호를 뽑는다. 페이지 쪽 배선은 이 커밋 범위
// 밖이다(safehtml 담당) — 여기서는 export만 해둔다.

// 값이 있어야 정상인 "라벨/이름류" role. 이 role의 컬럼이 숫자로만
// 채워져 있으면 파싱 단계에서 컬럼이 밀렸을 가능성을 의심할 신호다
// (예: 전형명 칸에 인원 숫자가 들어감). score/exam처럼 헤더 자체가
// 숫자인 role('data')은 대상이 아니다 — 오탐이 된다.
const LABEL_LIKE_ROLES = new Set([
  "type",
  "name",
  "title",
  "group",
  "series",
  "unit",
]);

function cellText(cell: Cell | null | undefined): string {
  if (cell == null) return "";
  if (typeof cell === "string") return cell;
  if (typeof cell === "object") {
    if (typeof (cell as any).text === "string") return (cell as any).text;
    if (Array.isArray((cell as any).chips))
      return (cell as any).chips.map((c: any) => c.value).join(" ");
  }
  return "";
}

function isCellEmpty(cell: Cell): boolean {
  const text = cellText(cell).trim();
  if (text) return false;
  if (cell && typeof cell === "object" && Array.isArray((cell as any).chips))
    return (cell as any).chips.length === 0;
  return true;
}

type LintFindings = {
  totalCells: number;
  emptyCells: number;
  numericOnlyLabelColumns: {
    variant?: string;
    role: string;
    label: string;
    columnIndex: number;
  }[];
  rawHtmlBlockCount: number;
};

function lintTableBlock(block: TableBlock, findings: LintFindings) {
  const rowCount = block.rows.length;
  const colCount = block.columns.length;
  findings.totalCells += rowCount * colCount;

  block.rows.forEach((row) => {
    row.forEach((cell) => {
      if (isCellEmpty(cell)) findings.emptyCells += 1;
    });
  });

  block.columns.forEach((column, colIdx) => {
    if (!LABEL_LIKE_ROLES.has(column.role)) return;
    const values = block.rows
      .map((row) => cellText(row[colIdx]).trim())
      .filter(Boolean);
    if (values.length && values.every((v) => /^\d+(\.\d+)?$/.test(v))) {
      findings.numericOnlyLabelColumns.push({
        variant: block.variant,
        role: column.role,
        label: column.label,
        columnIndex: colIdx,
      });
    }
  });
}

function lintBlocks(
  blocks: Block[] | null | undefined,
  findings: LintFindings,
) {
  (blocks || []).forEach((block) => {
    if (!block || typeof block !== "object") return;
    if (block.kind === "table") lintTableBlock(block, findings);
    else if (block.kind === "rawHtml") findings.rawHtmlBlockCount += 1;
    else if (block.kind === "group") lintBlocks(block.children, findings);
  });
}

/**
 * doc 구조를 훑어 QA 신호를 뽑는다(렌더 무영향, 읽기 전용). 빈 셀 비율,
 * 숫자만 든 라벨류 컬럼(파싱 컬럼 밀림 의심), warnings·rawHtml 잔량을
 * 집계한다.
 */
export function lintAdmissionDoc(doc: AdmissionDoc | null | undefined): {
  totalCells: number;
  emptyCells: number;
  emptyCellRatio: number;
  numericOnlyLabelColumns: {
    variant?: string;
    role: string;
    label: string;
    columnIndex: number;
  }[];
  rawHtmlBlockCount: number;
  warnings: Warning[];
} {
  const findings: LintFindings = {
    totalCells: 0,
    emptyCells: 0,
    numericOnlyLabelColumns: [],
    rawHtmlBlockCount: 0,
  };

  if (!isEmptyDoc(doc)) lintBlocks(doc!.blocks, findings);

  return {
    ...findings,
    emptyCellRatio: findings.totalCells
      ? findings.emptyCells / findings.totalCells
      : 0,
    warnings: Array.isArray(doc?.warnings) ? doc!.warnings! : [],
  };
}
