import { useMemo, useState } from 'react';
import { getTableVariantLayout, getCellKind } from '../admissionLayout';
import CellEditor from './cells/CellEditor';
import ImeSafeInput from './ImeSafeInput';
import ColumnRoleEditor from './ColumnRoleEditor';
import TableGroupHeaderEditor from './TableGroupHeaderEditor';
import { validateTableBlock, getColumnMutationBlockReason } from './tableEditorValidation';
import * as ops from './tableBlockOperations';
import { exportTableBlockToXlsx } from './xlsx/tableBlockXlsx';

// TableBlock(AdmissionDoc) 편집 코어. blocks/tables/*.jsx(표시 전용,
// Gate B 바이트 계약 보호 대상)를 재사용하지 않고 별도로 구현한다 —
// 셀 클래스/빈값 규칙은 admissionLayout.js를 공유해 편집 중에도 표시와
// 같은 룩을 유지한다(편집기 자체는 편집 UI라 표시용 DOM과 1:1은 아니다).
//
// controlled 컴포넌트: block/onChange만 받는다. 저장·영속화·Admin.jsx
// 배선은 이번 범위 밖 — 호출부가 validation(반환값 3번째 인자로 노출)을
// 보고 저장 가능 여부를 스스로 판단한다.
//
// props:
//   section: SectionKey (validateAdmissionDoc이 doc.section 검사에 씀)
//   block: TableBlock
//   onChange(nextBlock): 구조/셀 변경마다 호출. 검증 실패 상태도 그대로
//     흘려보낸다(막지 않음) — 저장 버튼 비활성화는 validation.ok를 보고
//     호출부가 결정한다.
//   universityName/sectionLabel(선택): xlsx 파일명 구성용. Admin.jsx
//     배선 전이라 생략 가능(생략 시 buildXlsxFileName의 기본값을 쓴다).
export default function TableBlockEditor({ section, block, onChange, universityName, sectionLabel }) {
  const layout = getTableVariantLayout(block.variant);
  const validation = useMemo(() => validateTableBlock(section, block), [section, block]);
  const columnMutationBlockReason = useMemo(
    () => getColumnMutationBlockReason(section, block),
    [section, block]
  );
  const columnMutationAllowed = columnMutationBlockReason === null;
  const [xlsxOversized, setXlsxOversized] = useState([]);

  function roleKindOf(column) {
    return getCellKind(block.variant, column?.role);
  }

  function updateCell(rowIdx, colIdx, nextCellValue) {
    onChange(ops.updateCell(block, rowIdx, colIdx, nextCellValue));
  }

  function updateColumnField(colIdx, field, fieldValue) {
    onChange(ops.updateColumnField(block, colIdx, field, fieldValue));
  }

  function addColumn() {
    if (!columnMutationAllowed) return;
    onChange(ops.addColumn(block));
  }

  function removeColumn(colIdx) {
    if (!columnMutationAllowed) return;
    onChange(ops.removeColumn(block, colIdx));
  }

  function addRow() {
    onChange(ops.addRow(block));
  }

  function removeRow(rowIdx) {
    onChange(ops.removeRow(block, rowIdx));
  }

  function moveRow(rowIdx, delta) {
    onChange(ops.moveRow(block, rowIdx, delta));
  }

  function updateGroupField(groupIdx, field, fieldValue) {
    onChange(ops.updateGroupField(block, groupIdx, field, fieldValue));
  }

  function addGroup() {
    onChange(ops.addGroup(block));
  }

  function removeGroup(groupIdx) {
    onChange(ops.removeGroup(block, groupIdx));
  }

  function updateFixedColumnCount(value) {
    onChange(ops.updateFixedColumnCount(block, value));
  }

  // groups가 아직 없는 표에 2단 헤더 구성을 처음 붙일 때: fixedColumnCount를
  // 현재 컬럼 수로 초기화해 불변식(sum(groups.count)+fixedColumnCount===
  // columns.length)이 groups:[] 상태에서 곧바로 성립하게 한다(빈 groups는
  // 합계 0이므로 fixedColumnCount가 전체를 떠맡아야 함).
  function enableGroups() {
    onChange({ ...block, groups: [], fixedColumnCount: block.columns.length });
  }

  function handleExportXlsx() {
    const result = exportTableBlockToXlsx(block, { universityName, sectionLabel });
    setXlsxOversized(result.ok ? [] : result.oversized);
  }

  return (
    <div className="admission-table-editor">
      {!validation.ok && (
        <div className="mb-2 rounded border border-red-300 bg-red-50 px-3 py-2 text-xs font-bold text-red-600">
          <p>표 구조 검증 실패 — 저장하기 전에 고쳐야 합니다:</p>
          <ul className="mt-1 list-disc pl-4">
            {validation.errors.map((error, idx) => (
              <li key={idx}>{error}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mb-2 flex items-center gap-2">
        <button type="button" onClick={handleExportXlsx} className="text-xs font-bold text-[#2348ff]">
          xlsx로 내보내기
        </button>
      </div>

      {xlsxOversized.length > 0 && (
        <div className="mb-2 rounded border border-amber-400 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">
          <p>
            셀 하나가 엑셀 문자 수 한도(32,767자)를 넘어 내보내지 못했습니다 — 잘라내지 않고 중단합니다. 아래 셀을
            줄인 뒤 다시 시도하세요:
          </p>
          <ul className="mt-1 list-disc pl-4">
            {xlsxOversized.map((cell, idx) => (
              <li key={idx}>
                {cell.area === 'header' ? '헤더' : `본문 행 ${cell.row + 1}`} · {cell.columnLabel || `컬럼 ${cell.col + 1}`} ·{' '}
                {cell.length.toLocaleString()}자
              </li>
            ))}
          </ul>
        </div>
      )}

      <TableGroupHeaderEditor
        groups={block.groups}
        fixedColumnCount={block.fixedColumnCount}
        columnsLength={block.columns.length}
        onUpdateGroupField={updateGroupField}
        onAddGroup={addGroup}
        onRemoveGroup={removeGroup}
        onUpdateFixedColumnCount={updateFixedColumnCount}
        onEnableGroups={enableGroups}
      />

      <div className={layout.scrollWrapClassName}>
        <table className={layout.tableClassName}>
          <thead>
            <tr>
              {block.columns.map((column, colIdx) => (
                <th key={colIdx}>
                  <div className="flex flex-col gap-1 p-1">
                    <ImeSafeInput
                      type="text"
                      value={column.label ?? ''}
                      onCommit={(next) => updateColumnField(colIdx, 'label', next)}
                      aria-label={`컬럼 ${colIdx + 1} 라벨`}
                      className="admission-cell-editor-input w-full border border-[#d7d7d7] px-1.5 py-1 text-xs font-bold"
                    />
                    <ColumnRoleEditor
                      variant={block.variant}
                      role={column.role}
                      onChange={(next) => updateColumnField(colIdx, 'role', next)}
                    />
                    <select
                      value={column.align ?? ''}
                      onChange={(e) => updateColumnField(colIdx, 'align', e.target.value || undefined)}
                      aria-label={`컬럼 ${colIdx + 1} 정렬`}
                      className="border border-[#d7d7d7] px-1 py-1 text-[11px]"
                    >
                      <option value="">(기본 정렬)</option>
                      <option value="left">left</option>
                      <option value="center">center</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => removeColumn(colIdx)}
                      disabled={!columnMutationAllowed || block.columns.length <= 1}
                      title={columnMutationBlockReason || undefined}
                      className="text-[11px] font-bold text-red-500 disabled:cursor-not-allowed disabled:text-gray-300"
                    >
                      열 삭제
                    </button>
                  </div>
                </th>
              ))}
              <th>
                <button
                  type="button"
                  onClick={addColumn}
                  disabled={!columnMutationAllowed}
                  title={columnMutationBlockReason || undefined}
                  className="text-xs font-bold text-[#2348ff] disabled:cursor-not-allowed disabled:text-gray-300"
                >
                  + 열 추가
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, rowIdx) => (
              <tr key={rowIdx}>
                {row.map((cell, colIdx) => (
                  <td key={colIdx}>
                    <CellEditor
                      roleKind={roleKindOf(block.columns[colIdx])}
                      value={cell}
                      onChange={(next) => updateCell(rowIdx, colIdx, next)}
                    />
                  </td>
                ))}
                <td>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => moveRow(rowIdx, -1)}
                      disabled={rowIdx === 0}
                      aria-label={`행 ${rowIdx + 1} 위로`}
                      className="text-xs disabled:text-gray-300"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => moveRow(rowIdx, 1)}
                      disabled={rowIdx === block.rows.length - 1}
                      aria-label={`행 ${rowIdx + 1} 아래로`}
                      className="text-xs disabled:text-gray-300"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => removeRow(rowIdx)}
                      aria-label={`행 ${rowIdx + 1} 삭제`}
                      className="text-xs font-bold text-red-500"
                    >
                      삭제
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button type="button" onClick={addRow} className="mt-2 text-xs font-bold text-[#2348ff]">
        + 행 추가
      </button>
    </div>
  );
}
