import { useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import AdmissionTable from '../table/AdmissionTable';
import { describeCell } from '../table/tableModel';
import TableGroupHeaderEditor from './TableGroupHeaderEditor';
import createEditSlots, { EDIT_PARITY_FROZEN } from './editSlots';
import { validateTableBlock, getColumnMutationBlockReason } from './tableEditorValidation';
import * as ops from './tableBlockOperations';
import { exportTableBlockToXlsx, importTableBlockFromXlsx } from './xlsx/tableBlockXlsx';

// TableBlock(AdmissionDoc) 편집 코어. 표 골격(<div>/<table>/<thead>/<tr>/
// <th>/<td>)은 자체 구현하지 않고 table/AdmissionTable.jsx **한 벌**에
// 위임한다 — 표시 경로(TableBlockView)와 같은 컴포넌트다. 편집 고유
// 마크업(라벨 input·셀 편집기·행/열 조작 버튼)은 editSlots.jsx가 슬롯으로
// 넣는다.
//
// 겉모습은 editSlots.jsx의 EDIT_PARITY_FROZEN이 플래그로 관리한다. 통합
// 자체(Step 5)는 어드민 화면을 바이트 동일하게 유지했고, 2026-08-07
// 승인분만 플립됐다 — ✅ 7a(td에 뷰와 같은 role className 부여),
// ✅ 7d(행/열 컨트롤을 표 밖으로 → DOM 컬럼 수가 뷰와 일치). 남은
// 🚩 7b(빈 셀 폴백)·7c(2단 병합 헤더)는 플래그 동결 그대로다.
//
// 7d 이후의 배치 원칙: **골격(컬럼 수·행 수)을 바꾸는 컨트롤은 표 안에
// 두지 않는다.** 행 조작은 표 아래 "행 순서·삭제" 목록에, "+ 열 추가"는
// 열 설정 토글 뒤 표 위에 둔다. 열 설정(role·정렬·열 삭제)만 <th> 안에
// 남는데, 그건 컬럼 수를 바꾸지 않아 골격을 흔들지 않고 2026-08-06 사용자
// 지적을 반영한 배치이기 때문이다(설계 §9 Q2 확정).
//
// controlled 컴포넌트: block/onChange만 받는다. 저장·영속화·Admin.jsx
// 배선은 이번 범위 밖 — 호출부가 validation(반환값 3번째 인자로 노출)을
// 보고 저장 가능 여부를 스스로 판단한다.
//
// 위계(2026-08-06 사용자 지적 반영 — "위계 수정 필요 + 너무 복잡하다"):
//   1차(가장 강조): 데이터 셀 입력 — 관리자가 매번 만지는 값
//   2차: 행 추가/삭제/순서 — 일상적이지만 셀보다는 드묾
//   3차(가장 약하게, 회색 소형): xlsx 내보내기/가져오기, 열 설정 토글,
//     2단 헤더 구성 — 구조 변경이라 드묾. 한 툴바에 모은다
// role·정렬·열 추가삭제는 "열 설정" 토글 뒤로 숨긴다(role은 셀 편집기
// 종류를 바꾸는 값이라 상시 노출은 오히려 사고 위험 — 기능은 지우지
// 않고 접근 경로만 좁힌다). 컬럼 수 고정 variant는 열 추가삭제 버튼을
// disabled로 그리지 않고 아예 렌더하지 않는다 — 그 자리에 사유 한 줄만
// 남긴다.
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
  const validation = useMemo(() => validateTableBlock(section, block), [section, block]);
  const columnMutationBlockReason = useMemo(
    () => getColumnMutationBlockReason(section, block),
    [section, block]
  );
  const columnMutationAllowed = columnMutationBlockReason === null;
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  const [xlsxOversized, setXlsxOversized] = useState([]);
  const [xlsxImportErrors, setXlsxImportErrors] = useState([]);
  const [xlsxImportPreview, setXlsxImportPreview] = useState(null); // { block, changeSummary, unchanged }
  const xlsxFileInputRef = useRef(null);

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

  // 가져오기는 바로 반영하지 않는다 — 미리보기(변경 요약 또는 "변경
  // 없음")를 먼저 보여주고, 관리자가 "적용"을 눌러야 onChange가 실행된다.
  function handleImportFileChange(event) {
    const file = event.target.files?.[0];
    event.target.value = ''; // 같은 파일을 다시 선택해도 change가 발생하게 리셋
    if (!file) return;

    setXlsxImportErrors([]);
    setXlsxImportPreview(null);

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const workbook = XLSX.read(reader.result, { type: 'array' });
        const result = importTableBlockFromXlsx(workbook, block, section);
        if (!result.ok) {
          setXlsxImportErrors(result.errors);
          return;
        }
        setXlsxImportPreview(result);
      } catch (err) {
        setXlsxImportErrors([`파일을 읽는 중 오류가 발생했습니다: ${err?.message || err}`]);
      }
    };
    reader.onerror = () => {
      setXlsxImportErrors(['파일을 읽지 못했습니다.']);
    };
    reader.readAsArrayBuffer(file);
  }

  function applyXlsxImport() {
    if (!xlsxImportPreview) return;
    onChange(xlsxImportPreview.block);
    setXlsxImportPreview(null);
  }

  function cancelXlsxImport() {
    setXlsxImportPreview(null);
  }

  // 표 밖 행 조작 목록에 붙일 행 식별 힌트. "행 3"이 표의 몇 번째 줄인지
  // 세지 않아도 되도록 그 행의 첫 비어 있지 않은 셀 텍스트를 보여준다.
  // 텍스트 추출은 tableModel이 정본이라 여기서 다시 구현하지 않는다
  // (구 7곳 중복을 합쳐 놓은 자리에 8번째를 만들지 말 것 — 설계 §2-2 G6).
  function rowPreviewText(rowIdx) {
    const row = Array.isArray(block.rows?.[rowIdx]) ? block.rows[rowIdx] : [];
    for (let colIdx = 0; colIdx < row.length; colIdx += 1) {
      const text = describeCell(block, rowIdx, colIdx).view.text.trim();
      if (text) return text;
    }
    return '(빈 행)';
  }

  // 편집 리프(<th>/<td> 안쪽). 토글 상태와 핸들러에 의존하므로 매 렌더 새로
  // 만든다 — 구 인라인 JSX와 생성 빈도가 같다. 행/열 조작 컨트롤은 슬롯이
  // 아니라 이 컴포넌트가 표 밖에서 직접 렌더한다(7d).
  const editSlots = createEditSlots({
    showColumnSettings,
    columnMutationAllowed,
    onUpdateColumnField: updateColumnField,
    onRemoveColumn: removeColumn,
    onUpdateCell: updateCell
  });

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

      {/* 3차(구조 변경) 툴바 — 회색 소형, 한 줄에 모음. 자주 안 씀. */}
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[#e5e7eb] pb-2 text-[11px] font-bold text-gray-500">
        <button type="button" onClick={handleExportXlsx} className="hover:text-gray-700">
          xlsx로 내보내기
        </button>
        <button type="button" onClick={() => xlsxFileInputRef.current?.click()} className="hover:text-gray-700">
          xlsx 가져오기
        </button>
        <input
          ref={xlsxFileInputRef}
          type="file"
          accept=".xlsx"
          onChange={handleImportFileChange}
          className="hidden"
          aria-label="xlsx 파일 선택"
        />
        <button
          type="button"
          onClick={() => setShowColumnSettings((v) => !v)}
          className={showColumnSettings ? 'text-[#2348ff]' : 'hover:text-gray-700'}
        >
          {showColumnSettings ? '열 설정 닫기' : '열 설정(role·정렬·열 추가삭제)'}
        </button>
      </div>

      {!columnMutationAllowed && (
        <p className="mb-2 text-[11px] font-bold text-gray-400">{columnMutationBlockReason}</p>
      )}

      {xlsxImportErrors.length > 0 && (
        <div className="mb-2 rounded border border-red-300 bg-red-50 px-3 py-2 text-xs font-bold text-red-600">
          <p>가져오기를 거부했습니다(기존 값 보존) — 아래 문제를 고친 뒤 다시 시도하세요:</p>
          <ul className="mt-1 list-disc pl-4">
            {xlsxImportErrors.map((error, idx) => (
              <li key={idx}>{error}</li>
            ))}
          </ul>
        </div>
      )}

      {xlsxImportPreview && (
        <div className="mb-2 rounded border border-[#2348ff] bg-[#eef2ff] px-3 py-2 text-xs font-bold text-[#2348ff]">
          {xlsxImportPreview.unchanged ? (
            <p>가져온 파일이 현재 표와 내용상 동일합니다(변경 없음).</p>
          ) : (
            <>
              <p>가져오기 미리보기 — 아직 적용되지 않았습니다:</p>
              <ul className="mt-1 list-disc pl-4 font-normal">
                <li>행 추가 {xlsxImportPreview.changeSummary.rowsAdded}개 / 삭제 {xlsxImportPreview.changeSummary.rowsRemoved}개</li>
                <li>셀 변경 {xlsxImportPreview.changeSummary.cellsChanged}개</li>
                <li>컬럼 구성 변경: {xlsxImportPreview.changeSummary.columnsChanged ? '있음' : '없음'}</li>
              </ul>
            </>
          )}
          <div className="mt-2 flex items-center gap-2">
            <button type="button" onClick={applyXlsxImport} className="rounded bg-[#2348ff] px-3 py-1 text-white">
              적용
            </button>
            <button type="button" onClick={cancelXlsxImport} className="rounded border border-[#2348ff] px-3 py-1">
              취소
            </button>
          </div>
        </div>
      )}

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
        expanded={showColumnSettings}
        onUpdateGroupField={updateGroupField}
        onAddGroup={addGroup}
        onRemoveGroup={removeGroup}
        onUpdateFixedColumnCount={updateFixedColumnCount}
        onEnableGroups={enableGroups}
      />

      {/* 3차 — "+ 열 추가". 구 thead 끝 여분 <th> 안에 있던 버튼을 마크업
          그대로 표 밖으로 옮긴 것이다(7d). 조건도 구 headTrailing과 같다:
          열 설정을 펼쳤고 컬럼 수 변경이 허용된 variant일 때만 나타난다. */}
      {showColumnSettings && columnMutationAllowed && (
        <div className="mb-2">
          <button
            type="button"
            onClick={addColumn}
            className="text-[11px] font-bold text-gray-500 hover:text-gray-700"
          >
            + 열 추가
          </button>
        </div>
      )}

      {/* 표 골격은 표시 경로와 같은 컴포넌트 한 벌. 편집 고유 마크업은
          전부 editSlots가 넣고, 이 컴포넌트는 <table> 태그를 직접 만들지
          않는다. parity가 EDIT_PARITY_FROZEN이라 <td> className은 이제
          뷰와 같은 소스에서 나오고(7a), 행/열 조작 슬롯이 사라져 DOM 컬럼
          수도 뷰와 같다(7d). 스크롤 래퍼의 `max-w-full overflow-x-auto`
          (폼 가로 넘침 방지, 2026-08-06 실측 반영)는 scrollWrapExtra로
          편집기에만 남는다. */}
      <AdmissionTable block={block} mode="edit" slots={editSlots} parity={EDIT_PARITY_FROZEN} />

      {/* 2차 — 행 조작. 구 <tr> 끝 여분 <td> 안에 있던 ↑/↓/삭제를 마크업
          그대로 표 밖으로 옮긴 것이다(7d). 버튼이 표에서 떨어져 나오면서
          "몇 번째 행인가"를 잃으므로 행 번호와 그 행의 첫 텍스트를 함께
          보여준다 — aria-label(`행 N 위로` 등)은 구 마크업 그대로다. */}
      {block.rows.length > 0 && (
        <div className="mt-2">
          <p className="mb-1 text-xs font-bold text-gray-500">행 순서·삭제</p>
          <ul className="flex flex-col gap-1">
            {block.rows.map((_row, rowIdx) => (
              <li key={rowIdx} className="flex items-center gap-2">
                <span className="w-10 shrink-0 text-xs font-bold text-gray-500">행 {rowIdx + 1}</span>
                <span className="min-w-0 flex-1 truncate text-xs text-gray-600">{rowPreviewText(rowIdx)}</span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => moveRow(rowIdx, -1)}
                    disabled={rowIdx === 0}
                    aria-label={`행 ${rowIdx + 1} 위로`}
                    className="text-sm font-bold text-gray-600 disabled:text-gray-300"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => moveRow(rowIdx, 1)}
                    disabled={rowIdx === block.rows.length - 1}
                    aria-label={`행 ${rowIdx + 1} 아래로`}
                    className="text-sm font-bold text-gray-600 disabled:text-gray-300"
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
              </li>
            ))}
          </ul>
        </div>
      )}

      <button type="button" onClick={addRow} className="mt-2 text-sm font-bold text-[#2348ff]">
        + 행 추가
      </button>
    </div>
  );
}
