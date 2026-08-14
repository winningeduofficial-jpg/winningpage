// 대입모집요강 표(TableBlock) → 골격 모델. 표를 "무엇을 어떻게 그릴지"의
// 서술(descriptor)로 바꾸는 순수 함수 모음이다.
//
// 존재 이유: 표 마크업을 만드는 코드경로가 3벌(표시 React 5개 렌더러 /
// 편집 React TableBlockEditor 자체 <table> / HTML 미러 renderDocToHtml)이었고,
// 그중 표시·편집 두 벌이 셀 className·빈값 폴백·병합(rowSpan/colSpan)·셀 종류
// 판정을 각자 인라인으로 중복 보유하고 있었다. 그 두 벌이 이 모듈로 합쳐졌다
// — 표시 렌더러 5개는 삭제됐고(구 blocks/tables/*), 편집기는 자체 <table>을
// 버리고 AdmissionTable에 위임한다. 남은 3번째(HTML 미러)는 Gate A2의 바이트
// 계약이 걸려 있어 의도적으로 통합하지 않는다(설계 §8-3).
//
// 셀 종류(text/badge/chips) 판정은 admissionLayout.getCellKind 하나가 정본이고
// describeCell이 표시(cellClassNameOf/cellViewOf)와 편집(edit.kind) 양쪽에
// 같은 값을 흘려보낸다 — 조건을 양쪽에 인라인으로 적어 두고 손으로 맞추던
// 구조가 여기서 끝난다.
//
// 순수 데이터/함수만 둔다(JSX 없음) — admissionLayout.js:6-7과 같은 이유로,
// 이 프로젝트의 vite/esbuild 설정은 .jsx/.tsx만 JSX로 트랜스파일하고 .js는
// 하지 않는다. 이 파일은 React를 import하지 않으며 훅/state를 갖지 않는다.
//
// ⚠ 이 모듈의 출력은 Gate B(verify-admission-doc-equivalence.mjs, 실데이터
// 2506건)와 verify-admission-block-render.mjs(합성 25건)의 바이트 계약을 그대로
// 짊어진다. 특히 span은 현행 계산과 1비트도 달라선 안 된다 —
// verify-admission-doc-equivalence.mjs:511-522/534-536의 속성 비교가
// "className='' vs 속성 부재"는 흡수하지만 `rowSpan={1}`을 찍으면 미러(속성
// 없음)와 즉시 불일치한다. rowSpan/colSpan은 값이 1이어도 "생략"으로 바꾸는
// 최적화를 하지 말고, 반대로 현행이 안 찍는 자리에 1을 채워 넣지도 말 것.

import type { TableBlock } from "../../../lib/admissionDoc";
import {
  type CellKind,
  CHANGE_CELL_CLASS_BY_ROLE,
  CHANGE_EMPTY_FALLBACK_BY_ROLE,
  getCellKind,
  getTableVariantLayout,
  isGenericLeftColumn,
  RECRUIT_FIXED_CELL_CLASS_BY_ROLE,
  recruitExactFixedCellClassName,
  recruitFixedEmptyFallback,
  SELECTION_CELL_CLASS_BY_ROLE,
  selectionEmptyFallback,
} from "../admissionLayout";
import { resolveCellKind } from "../editor/tableEditorValidation";

// admissionDoc.js의 Cell은 필드가 필수(text:string 등)지만, 이 모델은 실데이터의
// 느슨한 형태(text?/badge?/chips? 전부 선택)까지 받아들인다 — describeCell이
// block.rows[][]를 그대로 통과시키므로 원본 JSDoc과 같은 완화형을 유지한다.
type Cell =
  | string
  | { text?: string; badge?: "minimumHas" | "minimumNone" }
  | { chips?: { label: string; value: string }[] };

/** 헤더 한 칸. 골격 컴포넌트가 <th>에 그대로 편다. */
export interface HeaderCellDesc {
  key: string; // 현행 React key를 그대로 재현한다.
  kind: "column" | "group";
  colIdx: number | null; // kind==='group'이면 null
  groupIdx?: number;
  label: string;
  className: string | undefined; // 'fixed-head' | 'recruit-group-head' | undefined
  rowSpan: number | undefined; // ⚠ 현행이 안 찍으면 반드시 undefined
  colSpan: number | undefined; // ⚠ 현행 계산 그대로. "1이면 생략" 최적화 금지
}

export interface HeaderDesc {
  rows: { cells: HeaderCellDesc[] }[]; // rows.length === 1 | 2
}

/**
 * 셀 안쪽 리프. leaf가 "무엇으로 감쌀지", 나머지가 "무엇을 넣을지"다.
 * 리터럴 텍스트 자리는 항상 `text || fallback`으로 확정된다(현행 5개 렌더러가
 * 전부 `{cellText || 폴백}` 또는 `{cellText ? cellText : muted}` 꼴이다).
 */
export interface CellViewDesc {
  leaf: "badge" | "chips" | "changePlain" | "literal" | "muted";
  text: string; // 셀에서 뽑은 원문(없으면 '')
  badge: "has" | "none" | null;
  chips: { label: string; value: string }[] | null;
  fallback: string; // text가 빈 값일 때 대신 넣을 리터럴('' = 폴백 없음)
}

/**
 * 바디 셀 한 칸. 뷰가 필요한 것(view)과 편집이 필요한 것(edit)을 하위 객체로
 * 분리한다 — 한 객체에 섞으면 "이 필드는 누구 것인가"를 매번 추론해야 한다.
 */
export interface CellDesc {
  rowIdx: number;
  colIdx: number;
  role: string | undefined;
  className: string | undefined; // ⚠ ''(selection/change) vs undefined(generic/recruitExact) 구분 보존
  raw: Cell;
  view: CellViewDesc;
  edit: { kind: CellKind };
}

/** 셀 3형태(문자열 / {text,badge} / {chips}) 공통 텍스트 추출. 현행 7곳 중복의 정본. */
function cellTextOf(cell: Cell): string {
  const text =
    typeof cell === "string" ? cell : (cell as { text?: string })?.text;
  return text == null ? "" : text;
}

/** RecruitTable.jsx:36의 chips 판정을 그대로 옮긴 것. */
function cellChipsOf(cell: Cell): { label: string; value: string }[] | null {
  return cell &&
    typeof cell === "object" &&
    Array.isArray((cell as { chips?: unknown }).chips)
    ? (cell as { chips: { label: string; value: string }[] }).chips
    : null;
}

/**
 * SelectionTable.jsx:31-38의 배지 추론을 그대로 옮긴 것.
 * 명시 badge가 있으면 그것을, 없으면 "표시될 텍스트가 '-'인가"로 판정한다.
 * @param {Cell} cell
 * @param {string} resolvedText 폴백까지 적용된 최종 표시 텍스트
 */
function selectionBadgeOf(cell: Cell, resolvedText: string): "has" | "none" {
  const explicitBadge =
    cell && typeof cell === "object"
      ? (cell as { badge?: string }).badge
      : undefined;
  if (explicitBadge) return explicitBadge === "minimumHas" ? "has" : "none";
  return resolvedText === "-" ? "none" : "has";
}

/**
 * <td> className 정본. variant별 현행 룩업을 한 곳에 모은 것이며,
 * ''(빈 문자열)과 undefined의 차이를 의도적으로 보존한다 —
 * selection/change는 `맵[role] || ''`이라 미지정 role에서 ''를 내고,
 * generic/recruitExact는 조건 불충족 시 undefined(속성 자체 없음)를 낸다.
 *
 * @param {'text'|'badge'|'chips'} kind getCellKind(variant, role)
 */
function cellClassNameOf(
  block: TableBlock | null | undefined,
  variant: string | undefined,
  role: string | undefined,
  colIdx: number,
  kind: CellKind,
): string | undefined {
  switch (variant) {
    case "selection":
      // 구 SelectionTable.jsx:26. role이 undefined여도 js 인덱스 접근과
      // 같은 결과(undefined)이도록 캐스트만 하고 값 자체는 그대로 둔다.
      return SELECTION_CELL_CLASS_BY_ROLE[role as string] || "";
    case "change":
      // 구 ChangeTable.jsx:23
      return CHANGE_CELL_CLASS_BY_ROLE[role as string] || "";
    case "recruit":
      // 구 RecruitTable.jsx:27(고정열) / :38(값 셀). 고정열 판정은
      // getCellKind가 정본 — recruit에서 kind==='text'가 곧 role∈{group,unit}
      // (chips를 쓰지 않는 컬럼)이며, 구 코드의 인라인 조건과 같은 분기다.
      return kind !== "chips"
        ? RECRUIT_FIXED_CELL_CLASS_BY_ROLE[role as string]
        : "recruit-values-cell";
    case "recruitExact":
      // RecruitExactTable.jsx:40-47 — role이 아니라 위치(fixedColumnCount) 기반.
      return colIdx < (block?.fixedColumnCount || 0)
        ? recruitExactFixedCellClassName(colIdx)
        : undefined;
    default:
      // GenericTable.jsx:23 — exam/minimum/recordInfo/score/special/generic 및
      // TableBlockView.jsx:34 default가 흘려보내는 미지 variant 전부.
      return isGenericLeftColumn(colIdx) ? "left" : undefined;
  }
}

/**
 * 셀 안쪽 리프 정본. 구 5개 렌더러의 셀 내부 분기를 그대로 옮긴 것.
 *
 * selection의 badge 셀과 recruit의 chips 셀은 "이 (variant, role)이 Cell
 * 3형태 중 무엇을 쓰는가"와 같은 판정이므로 getCellKind 결과(kind)로
 * 분기한다 — 구 코드가 `role === 'minimum'` / `role === 'group' || 'unit'`을
 * 표시 컴포넌트에 인라인으로 또 적어 두고 손으로 맞추던 자리다.
 * change의 `role === 'content'`는 getCellKind가 모르는(전부 'text') 표시
 * 전용 분기라 그대로 인라인으로 남는다 — 중복이 아니다.
 *
 * @param {'text'|'badge'|'chips'} kind getCellKind(variant, role)
 */
function cellViewOf(
  _block: TableBlock | null | undefined,
  variant: string | undefined,
  role: string | undefined,
  _colIdx: number,
  raw: Cell,
  text: string,
  kind: CellKind,
): CellViewDesc {
  const base: CellViewDesc = {
    leaf: "literal",
    text,
    badge: null,
    chips: null,
    fallback: "",
  };

  switch (variant) {
    case "selection": {
      if (kind === "badge") {
        // 구 SelectionTable.jsx:29-44
        const fallback = "-";
        return {
          ...base,
          leaf: "badge",
          fallback,
          badge: selectionBadgeOf(raw, text || fallback),
        };
      }
      // 구 SelectionTable.jsx:46-50 — 빈값은 muted span이 아니라 리터럴 '-'.
      return {
        ...base,
        leaf: "literal",
        fallback: selectionEmptyFallback(role),
      };
    }
    case "change": {
      if (role === "content") {
        // 구 ChangeTable.jsx:26-36 — 값이 있으면 plain-cell div, 없으면 muted span.
        return text
          ? { ...base, leaf: "changePlain" }
          : { ...base, leaf: "muted" };
      }
      // 구 ChangeTable.jsx:38-42 — no='-' / title='주요 변경' 리터럴 폴백.
      return {
        ...base,
        leaf: "literal",
        fallback: CHANGE_EMPTY_FALLBACK_BY_ROLE[role as string] || "-",
      };
    }
    case "recruit": {
      if (kind !== "chips") {
        // 구 RecruitTable.jsx:26-34 (고정열 group/unit)
        return {
          ...base,
          leaf: "literal",
          fallback: recruitFixedEmptyFallback(),
        };
      }
      // 구 RecruitTable.jsx:36-51
      const chips = cellChipsOf(raw);
      return chips?.length
        ? { ...base, leaf: "chips", chips }
        : { ...base, leaf: "muted", chips };
    }
    default:
      // 구 RecruitExactTable.jsx:38-39 / GenericTable.jsx:22-27 — 동일 규칙.
      return text ? { ...base, leaf: "literal" } : { ...base, leaf: "muted" };
  }
}

/**
 * 표 골격 서술. 표로 그릴 수 없는 block이면 null을 돌려준다
 * (TableBlockView.jsx:10의 가드와 같은 조건).
 * @returns {{ layout: {scrollWrapClassName:string, tableClassName:string}, columnCount:number } | null}
 */
export function describeTable(block: TableBlock | null | undefined): {
  layout: ReturnType<typeof getTableVariantLayout>;
  columnCount: number;
} | null {
  if (!block || !Array.isArray(block.columns) || !Array.isArray(block.rows))
    return null;
  return {
    layout: getTableVariantLayout(block.variant),
    columnCount: block.columns.length,
  };
}

/**
 * thead 서술. recruitExact만 2행(고정열 rowSpan=2 + 그룹 colSpan=count),
 * 나머지 variant는 1행이다.
 *
 * ⚠ recruitExact에서 groups가 비어 있으면 첫 행에 고정열 <th>만 남고,
 * fixedColumnCount가 columns.length 이상이면 둘째 <tr>이 빈 채로 나간다 —
 * 현행(RecruitExactTable.jsx:16-33)이 그러므로 "개선"하지 않고 그대로 둔다.
 *
 * @param {Object} block
 * @param {{groupHeader?: 'render'|'flatten'}} [options]
 *   groupHeader: 'flatten'이면 recruitExact도 컬럼 1행으로 편다. 편집 화면이
 *   thead를 항상 1행으로 그리고 그룹명은 표 밖 폼에서 다루기 때문이며
 *   (TableBlockEditor.jsx:271-326), 그 파리티를 골격이 아니라 이 모델에서
 *   내는 이유는 "헤더 한 행이 무엇으로 채워지는가"의 정본을 한 곳에 두기
 *   위해서다. 기본값은 'render' — 뷰 동작은 조금도 바뀌지 않는다.
 * @returns {HeaderDesc}
 */
export function describeHeader(
  block: TableBlock | null | undefined,
  options?: { groupHeader?: "render" | "flatten" },
): HeaderDesc {
  const columns = Array.isArray(block?.columns) ? block.columns : [];
  const flatten = options?.groupHeader === "flatten";

  if (!flatten && block?.variant === "recruitExact") {
    const fixedCount = block.fixedColumnCount || 0;
    const topCells: HeaderCellDesc[] = [];

    columns.slice(0, fixedCount).forEach((col, idx) => {
      topCells.push({
        key: `fixed-${idx}`,
        kind: "column",
        colIdx: idx,
        label: col.label,
        className: "fixed-head",
        rowSpan: 2,
        colSpan: undefined,
      });
    });

    (block.groups || []).forEach((group, idx) => {
      topCells.push({
        key: `group-${idx}`,
        kind: "group",
        colIdx: null,
        groupIdx: idx,
        label: group.name,
        className: "recruit-group-head",
        rowSpan: undefined,
        colSpan: group.count,
      });
    });

    const bottomCells: HeaderCellDesc[] = columns
      .slice(fixedCount)
      .map((col, idx) => ({
        key: String(idx),
        kind: "column",
        colIdx: fixedCount + idx,
        label: col.label,
        className: undefined,
        rowSpan: undefined,
        colSpan: undefined,
      }));

    return { rows: [{ cells: topCells }, { cells: bottomCells }] };
  }

  return {
    rows: [
      {
        cells: columns.map((col, idx) => ({
          key: String(idx),
          kind: "column",
          colIdx: idx,
          label: col.label,
          className: undefined,
          rowSpan: undefined,
          colSpan: undefined,
        })),
      },
    ],
  };
}

/**
 * 바디 셀 한 칸 서술.
 * @returns {CellDesc}
 */
export function describeCell(
  block: TableBlock | null | undefined,
  rowIdx: number,
  colIdx: number,
): CellDesc {
  const variant = block?.variant;
  const columns = Array.isArray(block?.columns) ? block.columns : [];
  const rows = Array.isArray(block?.rows) ? block.rows : [];
  const row = Array.isArray(rows[rowIdx]) ? rows[rowIdx] : [];
  // row가 colIdx보다 짧아도(ragged) 아래 헬퍼들은 falsy cell을 이미
  // 빈 텍스트/no-chips로 취급해 왔다(cellTextOf/cellChipsOf 참고) — ""도 falsy라 동일하게 처리된다.
  const raw = row[colIdx] ?? "";
  const role = columns[colIdx]?.role;
  const text = cellTextOf(raw);
  // 셀 종류 판정 단일 정본. 표시(className/leaf)와 편집(kind) 양쪽이 이 한
  // 값에서 갈라진다 — getCellKind를 여기서 한 번만 부르고 아래로 흘린다.
  const kind = getCellKind(variant, role);

  return {
    rowIdx,
    colIdx,
    role,
    className: cellClassNameOf(block, variant, role, colIdx, kind),
    raw,
    view: cellViewOf(block, variant, role, colIdx, raw, text, kind),
    // 편집 UI 종류: role 기반 판정(kind)을 셀 실제 형태로 보정한다
    // (tableEditorValidation.js resolveCellKind). 표시 쪽은 role 판정만 쓰고
    // 편집 쪽만 값 형태 보정을 덧씌우는 것이 현행 동작이다.
    edit: { kind: resolveCellKind(kind, raw) },
  };
}
