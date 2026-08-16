import type { Block } from "@/lib/admissionDoc";

// Block 배열(문서 전체) 순서 변경·추가·삭제를 순수 함수로 분리 —
// tableBlockOperations.js와 같은 이유로 컴포넌트(DocBlocksEditor.jsx)와
// 검증 스크립트가 공유한다.

export function updateBlockAt(
  blocks: Block[],
  idx: number,
  nextBlock: Block,
): Block[] {
  return blocks.map((b, i) => (i === idx ? nextBlock : b));
}

// removeBlockAt/moveBlock/appendBlock 3종은 실제로 Block 셰이프에 의존하지
// 않는 순수 배열 조작이라(team-lead 지시 — "재사용할 수 있으면 그렇게
// 하라") 제네릭으로 열어 둔다. PlainListBlockEditor가 PlainListEditorItem[]에
// 그대로 재사용한다. updateBlockAt/createDefaultBlock은 Block 전용으로 남긴다.
export function removeBlockAt<T>(blocks: T[], idx: number): T[] {
  return blocks.filter((_, i) => i !== idx);
}

export function moveBlock<T>(blocks: T[], idx: number, delta: number): T[] {
  const targetIdx = idx + delta;
  if (targetIdx < 0 || targetIdx >= blocks.length) return blocks;
  const next = blocks.slice();
  const [moved] = next.splice(idx, 1);
  // targetIdx가 범위 안이라는 위 가드로 idx도 blocks 범위 안임이 보장된다
  // (delta는 ±1, 호출부는 항상 map 인덱스를 그대로 넘긴다) — splice(idx,1)이 항상 1건을 뽑는다.
  next.splice(targetIdx, 0, moved!);
  return next;
}

export function appendBlock<T>(blocks: T[], block: T): T[] {
  return [...blocks, block];
}

// 새 블록 종류별 기본값. 'table'은 컬럼 수 비고정인 'generic' variant
// 2컬럼으로 시작한다(고정 5종은 처음부터 잘못된 컬럼 수로 만들면 바로
// 검증 실패가 뜨므로 시작점으로 부적절 — generic은 어떤 컬럼 수도
// 허용된다). 'group'(GroupBlock, 중첩 컨테이너)과 'rawHtml'은 이
// 편집기에서 새로 만들지 않는다(중첩·레거시 승계 전용, 범위 밖).
export function createDefaultBlock(kind: string): Block | null {
  switch (kind) {
    case "note":
      return { kind: "note", text: "" };
    case "emptyBox":
      return { kind: "emptyBox", message: "" };
    case "heading":
      return { kind: "heading", text: "" };
    case "plainList":
      return { kind: "plainList", items: [] };
    case "preText":
      return { kind: "preText", text: "" };
    case "footnote":
      return { kind: "footnote", items: [] };
    case "table":
      return {
        kind: "table",
        variant: "generic",
        columns: [
          { role: "type", label: "구분" },
          { role: "content", label: "내용" },
        ],
        rows: [],
      };
    default:
      return null;
  }
}

// ── 섹션별 "블록 추가" 선택지 제한(2026-08-06) ──────────────────────────
// renderDocToHtml(admissionParsing.js, html 미러 렌더러)은 섹션별로 그
// 섹션의 doc 생성기(build*DocBlocks)가 실제로 만드는 특정 블록 조합만
// 렌더하도록 짜여 있다 — 그 조합을 벗어나면 html 미러가 내용을 잃거나
// (예: selection_method+note-only → heading만 남음) 최악의 경우 무가드
// 프로퍼티 접근으로 예외를 던진다(recruitment_quota+note-only에서 실제
// 재현 확인, bc6f689). "블록 추가"를 섹션이 실제로 쓰는 종류로 좁혀서
// 이 사고 자체를 예방한다.
//
// 아래 매핑은 admissionParsing.js의 build*DocBlocks 6종을 읽기 전용으로
// 전수 확인해 만들었다(추측 아님, 각 항목에 함수명·좌표 주석):
const PRIMARY_ADDABLE_KINDS_BY_SECTION: Record<string, string[]> = {
  // buildChangeDocBlocks(:2329) — table(change) 1개뿐. 주석: "이
  // 카테고리는 원래도 plainList 폴백이 없다"(parseChangeItems가 "없음"도
  // 항상 최소 1행으로 반환).
  previous_year_changes: ["table"],
  // buildSelectionDocBlocks(:2356) — table(selection). 파싱 실패
  // (validRows 0개, :2358-2360) 시 plainList 폴백.
  selection_method: ["table", "plainList"],
  // buildExamDocBlocks(:2392) — table(exam). "없음" 특수 케이스는
  // emptyBox(:2393-2394). 파싱 실패 시 plainList 폴백.
  exam_schedule: ["table", "emptyBox", "plainList"],
  // buildMinimumDocBlocks(:2416) — table(minimum). "없음" 특수 케이스는
  // emptyBox(:2417-2418). 파싱 실패 시 plainList 폴백.
  minimum_requirements: ["table", "emptyBox", "plainList"],
  // buildRecordDocBlocks(:2447) — table(recordInfo) + [heading+table(score)]*
  // 반복 쌍. 주석: "이 카테고리는 원래도 plainList 폴백이 없다"(infoRows/
  // scoreBlocks가 전부 비어도 빈 blocks를 그대로 반환).
  school_record_method: ["table", "heading"],
  // buildRecruitDocBlocks(:2486) — table(recruit/recruitExact) +
  // footnote(선택, cleanedFootnotes 있을 때만 :2526-2527). 파싱 실패 시
  // plainList 폴백. buildRawSectionDoc의 recruitment_quota 전용 분기
  // (:2725-2731, looksLikeHtml 아닌 raw 텍스트 경로)는 preText도 만든다.
  recruitment_quota: ["table", "footnote", "plainList", "preText"],
};

// 'note'/'group'은 어느 섹션의 기본 목록에도 없다 — build*DocBlocks 6종
// 전수 확인 결과 최상위(top-level) 'note' 블록을 만드는 생성기가 하나도
// 없다(경찰대/사관학교/과기원 전용 buildSpecialCategoryDoc이 'note'를
// 만들긴 하지만 전부 'group'의 children 안에서만이고, 그 group 자체도
// 특수대학 하드코딩 데이터 전용이라 관리자가 손으로 추가할 대상이
// 아니다 — GroupBlockEditor는 이미 있는 group의 children 표만 편집하고
// 새 group을 만들지는 않는다). 실측(team-lead
// DB 집계: table 1310/heading 185/emptyBox 108/group 42/note 11/
// plainList 9/footnote 1)의 note 11건도 전부 이 group 내부 값과 일치한다.
const ALL_BLOCK_KINDS: string[] = [
  "table",
  "note",
  "emptyBox",
  "heading",
  "plainList",
  "preText",
  "footnote",
];

/**
 * @param {string} section
 * @returns {{ primary: string[], advanced: string[] }} primary는 이
 *   섹션의 doc 생성기가 실제로 만드는 종류(기본 노출), advanced는
 *   나머지 전부("고급" 토글 뒤, 경고와 함께 노출).
 */
export function getAddableKindsForSection(section: string): {
  primary: string[];
  advanced: string[];
} {
  const primary = PRIMARY_ADDABLE_KINDS_BY_SECTION[section] || [];
  const advanced = ALL_BLOCK_KINDS.filter((kind) => !primary.includes(kind));
  return { primary, advanced };
}
