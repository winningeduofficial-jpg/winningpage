// TableBlock 구조 변경(셀/행/열)을 순수 함수로 분리 — TableBlockEditor.jsx가
// 이 함수들을 그대로 소비하고, 검증 스크립트(scripts/verify-admission-table-editor.mjs)
// 도 React/DOM 없이 이 함수들만 직접 import해서 로직을 단언한다(컴포넌트를
// 렌더하지 않고도 "열 추가 시 전 행 길이가 함께 맞춰지는지" 같은 구조적
// 불변식을 검증할 수 있다).
import { getCellKind } from '../admissionLayout';
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

// 새 컬럼은 항상 'text' 종류로 시작한다(badge/chips는 role을 통해서만
// 선택되므로, 새 컬럼의 기본 role은 어떤 variant 규칙에도 안 걸리는
// 중립값이다).
export function addColumn(block) {
  const nextColumns = [...block.columns, { role: `col${block.columns.length + 1}`, label: '새 컬럼' }];
  const nextRows = block.rows.map((row) => [...row, emptyCellForKind('text')]);
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
