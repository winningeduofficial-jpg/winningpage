// TableBlockEditor 전용 검증 유틸. src/lib/admissionDoc.js의
// validateAdmissionDoc을 그대로 재사용한다(읽기 전용 import — src/lib/은
// 수정하지 않는다).
//
// 컬럼 수 고정 variant 목록({selection:5, minimum:5, exam:3, change:3,
// recordInfo:2})은 admissionDoc.js 내부에 있지만 export되지 않는다. 이
// 맵을 여기서 복제하는 대신, "컬럼 하나를 추가해보고 validateAdmissionDoc이
// 그 이유로 거부하는지"를 실제로 확인하는 프로브 방식을 쓴다 — 맵이 나중에
// 바뀌어도 이 판정이 자동으로 따라간다(값 복제 방식의 동기화 누락 위험을
// 원천 차단).
import {
  type AdmissionDoc,
  type Block,
  type Cell,
  stableStringifyDoc,
  type TableBlock,
  validateAdmissionDoc,
} from "../../../lib/admissionDoc";

// 편집 중인 Block 배열(문서 전체 또는 그 일부)을 최소 AdmissionDoc으로
// 감싸 validateAdmissionDoc에 넘긴다. section은 validateAdmissionDoc이
// SECTION_KEYS 소속 여부를 검사하는 데만 쓰인다. DocBlocksEditor(문서
// 블록 배열 편집)와 TableBlockEditor(표 1개 편집) 양쪽이 공유한다.
//
// section은 호출부(TableBlockEditor/DocBlocksEditor) props에서 string으로
// 내려온다 — SectionKey 소속 여부의 런타임 검증은 validateAdmissionDoc
// 자체가 한다(doc.section 검사), 여기서는 그 계약을 캐스트로만 표현한다.
export function validateBlocks(
  section: string,
  blocks: Block[],
): { ok: boolean; errors: string[] } {
  const doc: AdmissionDoc = {
    v: 1,
    section: section as AdmissionDoc["section"],
    source: "manual",
    generator: "table-editor",
    generatedAt: new Date().toISOString(),
    blocks,
  };
  return validateAdmissionDoc(doc);
}

/** TableBlock 하나만 검증할 때의 축약형. */
export function validateTableBlock(
  section: string,
  block: TableBlock,
): { ok: boolean; errors: string[] } {
  return validateBlocks(section, [block]);
}

/**
 * TableBlock 두 개가 (generatedAt 등을 제외하고) 내용상 동일한지 비교한다.
 * xlsx 가져오기(⑤)가 "변경 없음" 판정에 쓴다 — stableStringifyDoc이 이미
 * 하는 키 정렬·generatedAt 제외를 블록 단위 비교에도 그대로 재사용한다.
 */
export function blocksEqual(
  section: string,
  blockA: Block,
  blockB: Block,
): boolean {
  const wrap = (block: Block) =>
    stableStringifyDoc({
      v: 1,
      section: section as AdmissionDoc["section"],
      source: "manual",
      generator: "compare",
      generatedAt: "x",
      blocks: [block],
    });
  return wrap(blockA) === wrap(blockB);
}

function buildColumnAddProbe(block: TableBlock): TableBlock {
  return {
    ...block,
    columns: [...block.columns, { role: "__probe__", label: "" }],
    rows: block.rows.map((row) => [...row, ""]),
  };
}

/**
 * 열 추가/삭제가 구조 불변식을 깨는지 미리 판정한다(프로브: 컬럼 1개를
 * 가상으로 추가해보고 실패 사유를 읽는다). null이면 안전, 문자열이면
 * 그 사유로 열 추가/삭제 UI를 막아야 한다.
 */
export function getColumnMutationBlockReason(
  section: string,
  block: TableBlock,
): string | null {
  const probe = buildColumnAddProbe(block);
  const result = validateTableBlock(section, probe);
  if (result.ok) return null;

  if (result.errors.some((e) => /컬럼 수가 \d+이어야 하는데/.test(e))) {
    return "이 표 형식(variant)은 컬럼 수가 고정돼 있습니다(레이아웃 폭 규칙과 연결). 열을 추가·삭제할 수 없습니다.";
  }
  if (result.errors.some((e) => /groups 합\(/.test(e))) {
    return "그룹 헤더(2단 헤더) 구성과 열 개수가 맞물려 있습니다. 그룹 헤더 편집 기능(다음 작업)에서 함께 조정해야 합니다.";
  }
  return "열 추가·삭제 시 표 구조 검증에 실패합니다.";
}

/**
 * 셀 값이 Cell 스키마의 3형태 중 무엇인지 판정한다. column.role 기반
 * 판정(admissionLayout.js의 getCellKind)을 우선하되, 실제 셀 값이 이미
 * 특정 형태(chips/badge)를 갖고 있으면 그쪽을 신뢰한다(방어적 — role이
 * 예상과 다르게 편집됐거나 데이터가 섞인 경우에도 편집 UI가 깨지지 않게).
 */
export type CellKind = "text" | "badge" | "chips";

export function resolveCellKind(
  roleKind: CellKind,
  cellValue: unknown,
): CellKind {
  if (cellValue && typeof cellValue === "object") {
    if (Array.isArray((cellValue as { chips?: unknown }).chips)) return "chips";
    if ("badge" in cellValue || "text" in cellValue) return "badge";
  }
  return roleKind;
}

/** 빈 셀 기본값(kind별). 열 추가 시 새 셀, badge/chips 컬럼에 처음 값을 채울 때 사용. */
export function emptyCellForKind(kind: CellKind): Cell {
  if (kind === "badge") return { text: "", badge: "minimumNone" };
  if (kind === "chips") return { chips: [] };
  return "";
}
