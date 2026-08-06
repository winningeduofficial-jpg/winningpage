// TableBlock 구조 변경(셀/행/열)을 순수 함수로 분리 — TableBlockEditor.jsx가
// 이 함수들을 그대로 소비하고, 검증 스크립트(scripts/verify-admission-table-editor.mjs)
// 도 React/DOM 없이 이 함수들만 직접 import해서 로직을 단언한다(컴포넌트를
// 렌더하지 않고도 "열 추가 시 전 행 길이가 함께 맞춰지는지" 같은 구조적
// 불변식을 검증할 수 있다).
import { getCellKind, defaultNewColumnRole } from '../admissionLayout';
import { emptyCellForKind } from './tableEditorValidation';

export function updateCell(block, rowIdx, colIdx, nextCellValue) {
  const nextRows = block.rows.map((row, r) =>
    r === rowIdx ? row.map((cell, c) => (c === colIdx ? nextCellValue : cell)) : row
  );
  return { ...block, rows: nextRows };
}

export function updateColumnField(block, colIdx, field, fieldValue) {
  const nextColumns = block.columns.map((col, c) => (c === colIdx ? { ...col, [field]: fieldValue } : col));
  return { ...block, columns: nextColumns };
}

// 새 컬럼의 기본 role은 admissionLayout.js의 defaultNewColumnRole(variant)
// (variant별 알려진 role 목록의 마지막 항목 — 대개 "늘어나는" 종류)를
// 쓴다. 자유 문자열(예: 이전의 `col${n}`)을 쓰지 않는 이유: 그러면 항상
// "알려지지 않은 role" 경고가 뜨고 편집기가 badge/chips를 못 고른다.
export function addColumn(block) {
  const role = defaultNewColumnRole(block.variant);
  const kind = getCellKind(block.variant, role);
  const nextColumns = [...block.columns, { role, label: '새 컬럼' }];
  const nextRows = block.rows.map((row) => [...row, emptyCellForKind(kind)]);
  return { ...block, columns: nextColumns, rows: nextRows };
}

// 컬럼 수 고정 여부는 이 함수가 판단하지 않는다 — 호출부(TableBlockEditor)가
// tableEditorValidation.getColumnMutationBlockReason으로 미리 막는다. 이
// 함수는 순수 구조 변경만 한다(마지막 컬럼 삭제 방지만 자체 가드).
export function removeColumn(block, colIdx) {
  if (block.columns.length <= 1) return block;
  const nextColumns = block.columns.filter((_, c) => c !== colIdx);
  const nextRows = block.rows.map((row) => row.filter((_, c) => c !== colIdx));
  return { ...block, columns: nextColumns, rows: nextRows };
}

export function addRow(block) {
  const nextRow = block.columns.map((col) => emptyCellForKind(getCellKind(block.variant, col.role)));
  return { ...block, rows: [...block.rows, nextRow] };
}

export function removeRow(block, rowIdx) {
  return { ...block, rows: block.rows.filter((_, r) => r !== rowIdx) };
}

export function moveRow(block, rowIdx, delta) {
  const targetIdx = rowIdx + delta;
  if (targetIdx < 0 || targetIdx >= block.rows.length) return block;
  const nextRows = block.rows.slice();
  const [moved] = nextRows.splice(rowIdx, 1);
  nextRows.splice(targetIdx, 0, moved);
  return { ...block, rows: nextRows };
}

// ── recruitExact 2단 헤더(groups/fixedColumnCount) 편집 ──────────────
// 열 자체는 컬럼 수 고정 프로브(getColumnMutationBlockReason)가 이미
// 막아준다 — 여기서는 groups[].count/fixedColumnCount를 자유롭게
// 조정하게 해주고, sum(groups.count)+fixedColumnCount===columns.length
// 불변식 위반 여부는 validateBlocks가(TableBlockEditor의 검증 배너를
// 통해) 실시간으로 알려준다. "몇 개가 비는지/남는지"는 그 에러 문자열
// (admissionDoc.js: "groups 합(...) + fixedColumnCount(...)가
// columns.length(...)와 다릅니다")이 이미 담고 있어 여기서 따로
// 계산하지 않는다.
export function updateGroupField(block, groupIdx, field, fieldValue) {
  const nextGroups = (block.groups || []).map((g, i) => (i === groupIdx ? { ...g, [field]: fieldValue } : g));
  return { ...block, groups: nextGroups };
}

export function addGroup(block) {
  // count:0으로 시작 — 추가 자체는 불변식을 절대 깨지 않는다(합계 불변).
  // 실제 컬럼을 그 그룹에 배정하는 건 이번 범위 밖(열 자체는 여전히
  // 고정) — 관리자가 count를 조정하면서 검증 배너로 맞춰야 한다.
  const nextGroups = [...(block.groups || []), { name: '새 그룹', count: 0 }];
  return { ...block, groups: nextGroups };
}

export function removeGroup(block, groupIdx) {
  const nextGroups = (block.groups || []).filter((_, i) => i !== groupIdx);
  return { ...block, groups: nextGroups };
}

export function updateFixedColumnCount(block, value) {
  return { ...block, fixedColumnCount: value };
}
