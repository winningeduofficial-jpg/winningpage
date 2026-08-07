// 대입모집요강 표(TableBlock) → 골격 모델. 표를 "무엇을 어떻게 그릴지"의
// 서술(descriptor)로 바꾸는 순수 함수 모음이다.
//
// 존재 이유: 현재 표 마크업을 만드는 코드경로가 3벌(표시 React 5개 렌더러 /
// 편집 React TableBlockEditor 자체 <table> / HTML 미러 renderDocToHtml)이고,
// 그중 표시·편집 두 벌이 셀 className·빈값 폴백·병합(rowSpan/colSpan)·셀 종류
// 판정을 각자 인라인으로 중복 보유하고 있었다. admissionLayout.js:117-125가
// "표시 컴포넌트를 이 함수를 쓰도록 리팩터하는 건 별도 작업"이라고 예약해 둔
// 자리가 바로 이 모듈이다.
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

import {
  getTableVariantLayout,
  SELECTION_CELL_CLASS_BY_ROLE,
  selectionEmptyFallback,
  CHANGE_CELL_CLASS_BY_ROLE,
  CHANGE_EMPTY_FALLBACK_BY_ROLE,
  RECRUIT_FIXED_CELL_CLASS_BY_ROLE,
  recruitFixedEmptyFallback,
  recruitExactFixedCellClassName,
  isGenericLeftColumn,
  getCellKind
} from '../admissionLayout';
import { resolveCellKind } from '../editor/tableEditorValidation';

/**
 * @typedef {string
 *   | { text?: string, badge?: 'minimumHas' | 'minimumNone' }
 *   | { chips?: { label: string, value: string }[] }} Cell
 */

/**
 * 헤더 한 칸. 골격 컴포넌트가 <th>에 그대로 편다.
 * @typedef {Object} HeaderCellDesc
 * @property {string} key                 현행 React key를 그대로 재현한다.
 * @property {'column'|'group'} kind
 * @property {number|null} colIdx         kind==='group'이면 null
 * @property {number} [groupIdx]
 * @property {string} label
 * @property {string|undefined} className 'fixed-head' | 'recruit-group-head' | undefined
 * @property {number|undefined} rowSpan   ⚠ 현행이 안 찍으면 반드시 undefined
 * @property {number|undefined} colSpan   ⚠ 현행 계산 그대로. "1이면 생략" 최적화 금지
 */

/** @typedef {{ rows: { cells: HeaderCellDesc[] }[] }} HeaderDesc */ // rows.length === 1 | 2

/**
 * 바디 셀 한 칸. 뷰가 필요한 것(view)과 편집이 필요한 것(edit)을 하위 객체로
 * 분리한다 — 한 객체에 섞으면 "이 필드는 누구 것인가"를 매번 추론해야 한다.
 * @typedef {Object} CellDesc
 * @property {number} rowIdx
 * @property {number} colIdx
 * @property {string|undefined} role
 * @property {string|undefined} className ⚠ ''(selection/change) vs undefined(generic/recruitExact) 구분 보존
 * @property {Cell} raw
 * @property {CellViewDesc} view
 * @property {{ kind: 'text'|'badge'|'chips' }} edit
 */

/**
 * 셀 안쪽 리프. leaf가 "무엇으로 감쌀지", 나머지가 "무엇을 넣을지"다.
 * 리터럴 텍스트 자리는 항상 `text || fallback`으로 확정된다(현행 5개 렌더러가
 * 전부 `{cellText || 폴백}` 또는 `{cellText ? cellText : muted}` 꼴이다).
 * @typedef {Object} CellViewDesc
 * @property {'badge'|'chips'|'changePlain'|'literal'|'muted'} leaf
 * @property {string} text      셀에서 뽑은 원문(없으면 '')
 * @property {'has'|'none'|null} badge
 * @property {{label:string,value:string}[]|null} chips
 * @property {string} fallback  text가 빈 값일 때 대신 넣을 리터럴('' = 폴백 없음)
 */

/** 셀 3형태(문자열 / {text,badge} / {chips}) 공통 텍스트 추출. 현행 7곳 중복의 정본. */
function cellTextOf(cell) {
  const text = typeof cell === 'string' ? cell : cell?.text;
  return text == null ? '' : text;
}

/** RecruitTable.jsx:36의 chips 판정을 그대로 옮긴 것. */
function cellChipsOf(cell) {
  return cell && typeof cell === 'object' && Array.isArray(cell.chips) ? cell.chips : null;
}

/**
 * SelectionTable.jsx:31-38의 배지 추론을 그대로 옮긴 것.
 * 명시 badge가 있으면 그것을, 없으면 "표시될 텍스트가 '-'인가"로 판정한다.
 * @param {Cell} cell
 * @param {string} resolvedText 폴백까지 적용된 최종 표시 텍스트
 */
function selectionBadgeOf(cell, resolvedText) {
  const explicitBadge = cell && typeof cell === 'object' ? cell.badge : undefined;
  if (explicitBadge) return explicitBadge === 'minimumHas' ? 'has' : 'none';
  return resolvedText === '-' ? 'none' : 'has';
}

/**
 * <td> className 정본. variant별 현행 룩업을 한 곳에 모은 것이며,
 * ''(빈 문자열)과 undefined의 차이를 의도적으로 보존한다 —
 * selection/change는 `맵[role] || ''`이라 미지정 role에서 ''를 내고,
 * generic/recruitExact는 조건 불충족 시 undefined(속성 자체 없음)를 낸다.
 */
function cellClassNameOf(block, variant, role, colIdx) {
  switch (variant) {
    case 'selection':
      // SelectionTable.jsx:26
      return SELECTION_CELL_CLASS_BY_ROLE[role] || '';
    case 'change':
      // ChangeTable.jsx:23
      return CHANGE_CELL_CLASS_BY_ROLE[role] || '';
    case 'recruit':
      // RecruitTable.jsx:27(고정열) / :38(값 셀)
      return role === 'group' || role === 'unit'
        ? RECRUIT_FIXED_CELL_CLASS_BY_ROLE[role]
        : 'recruit-values-cell';
    case 'recruitExact':
      // RecruitExactTable.jsx:40-47 — role이 아니라 위치(fixedColumnCount) 기반.
      return colIdx < (block?.fixedColumnCount || 0)
        ? recruitExactFixedCellClassName(colIdx)
        : undefined;
    default:
      // GenericTable.jsx:23 — exam/minimum/recordInfo/score/special/generic 및
      // TableBlockView.jsx:34 default가 흘려보내는 미지 variant 전부.
      return isGenericLeftColumn(colIdx) ? 'left' : undefined;
  }
}

/** 셀 안쪽 리프 정본. 현행 5개 렌더러의 셀 내부 분기를 그대로 옮긴 것. */
function cellViewOf(block, variant, role, colIdx, raw, text) {
  const base = { leaf: 'literal', text, badge: null, chips: null, fallback: '' };

  switch (variant) {
    case 'selection': {
      if (role === 'minimum') {
        // SelectionTable.jsx:29-44
        const fallback = '-';
        return { ...base, leaf: 'badge', fallback, badge: selectionBadgeOf(raw, text || fallback) };
      }
      // SelectionTable.jsx:46-50 — 빈값은 muted span이 아니라 리터럴 '-'.
      return { ...base, leaf: 'literal', fallback: selectionEmptyFallback(role) };
    }
    case 'change': {
      if (role === 'content') {
        // ChangeTable.jsx:26-36 — 값이 있으면 plain-cell div, 없으면 muted span.
        return text ? { ...base, leaf: 'changePlain' } : { ...base, leaf: 'muted' };
      }
      // ChangeTable.jsx:38-42 — no='-' / title='주요 변경' 리터럴 폴백.
      return { ...base, leaf: 'literal', fallback: CHANGE_EMPTY_FALLBACK_BY_ROLE[role] || '-' };
    }
    case 'recruit': {
      if (role === 'group' || role === 'unit') {
        // RecruitTable.jsx:26-34
        return { ...base, leaf: 'literal', fallback: recruitFixedEmptyFallback() };
      }
      // RecruitTable.jsx:36-51
      const chips = cellChipsOf(raw);
      return chips && chips.length
        ? { ...base, leaf: 'chips', chips }
        : { ...base, leaf: 'muted', chips };
    }
    default:
      // RecruitExactTable.jsx:38-39 / GenericTable.jsx:22-27 — 동일 규칙.
      return text ? { ...base, leaf: 'literal' } : { ...base, leaf: 'muted' };
  }
}

/**
 * 표 골격 서술. 표로 그릴 수 없는 block이면 null을 돌려준다
 * (TableBlockView.jsx:10의 가드와 같은 조건).
 * @returns {{ layout: {scrollWrapClassName:string, tableClassName:string}, columnCount:number } | null}
 */
export function describeTable(block) {
  if (!block || !Array.isArray(block.columns) || !Array.isArray(block.rows)) return null;
  return {
    layout: getTableVariantLayout(block.variant),
    columnCount: block.columns.length
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
export function describeHeader(block, options) {
  const columns = Array.isArray(block?.columns) ? block.columns : [];
  const flatten = options?.groupHeader === 'flatten';

  if (!flatten && block?.variant === 'recruitExact') {
    const fixedCount = block.fixedColumnCount || 0;
    const topCells = [];

    columns.slice(0, fixedCount).forEach((col, idx) => {
      topCells.push({
        key: `fixed-${idx}`,
        kind: 'column',
        colIdx: idx,
        label: col.label,
        className: 'fixed-head',
        rowSpan: 2,
        colSpan: undefined
      });
    });

    (block.groups || []).forEach((group, idx) => {
      topCells.push({
        key: `group-${idx}`,
        kind: 'group',
        colIdx: null,
        groupIdx: idx,
        label: group.name,
        className: 'recruit-group-head',
        rowSpan: undefined,
        colSpan: group.count
      });
    });

    const bottomCells = columns.slice(fixedCount).map((col, idx) => ({
      key: String(idx),
      kind: 'column',
      colIdx: fixedCount + idx,
      label: col.label,
      className: undefined,
      rowSpan: undefined,
      colSpan: undefined
    }));

    return { rows: [{ cells: topCells }, { cells: bottomCells }] };
  }

  return {
    rows: [
      {
        cells: columns.map((col, idx) => ({
          key: String(idx),
          kind: 'column',
          colIdx: idx,
          label: col.label,
          className: undefined,
          rowSpan: undefined,
          colSpan: undefined
        }))
      }
    ]
  };
}

/**
 * 바디 셀 한 칸 서술.
 * @returns {CellDesc}
 */
export function describeCell(block, rowIdx, colIdx) {
  const variant = block?.variant;
  const columns = Array.isArray(block?.columns) ? block.columns : [];
  const rows = Array.isArray(block?.rows) ? block.rows : [];
  const row = Array.isArray(rows[rowIdx]) ? rows[rowIdx] : [];
  const raw = row[colIdx];
  const role = columns[colIdx]?.role;
  const text = cellTextOf(raw);

  return {
    rowIdx,
    colIdx,
    role,
    className: cellClassNameOf(block, variant, role, colIdx),
    raw,
    view: cellViewOf(block, variant, role, colIdx, raw, text),
    // 편집 UI 종류: role 기반 판정(admissionLayout.js:126-130)을 셀 실제 형태로
    // 보정한다(tableEditorValidation.js:91-97). 두 함수를 여기서 합성해 두는
    // 것이 "kind 판정 단일 정본"의 실체다.
    edit: { kind: resolveCellKind(getCellKind(variant, role), raw) }
  };
}
