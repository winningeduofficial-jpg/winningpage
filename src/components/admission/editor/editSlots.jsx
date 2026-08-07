import CellEditor from './cells/CellEditor';
import ImeSafeInput from './ImeSafeInput';
import ColumnRoleEditor from './ColumnRoleEditor';

// 표 골격(table/AdmissionTable.jsx)의 **편집 모드 리프**. viewSlots.jsx가
// 표시 쪽 <th>/<td> 안쪽을 소유하는 것과 정확히 대칭이며, 여기서도
// <div>/<table>/<thead>/<tr>은 한 개도 만들지 않는다 — 골격은 전부
// AdmissionTable.jsx가 소유한다. 예외는 rowTrailing/headTrailing 두 슬롯이
// 내보내는 여분 <td>/<th> 하나씩인데, 그건 "골격 밖 컨트롤"을 현행 어드민
// 화면과 바이트 동일하게 유지하기 위한 **동결 조치**다(설계 §4).
//
// 이 파일의 마크업은 전부 TableBlockEditor.jsx가 직접 들고 있던 자체
// <table>(구 :269-378)에서 **문자 그대로** 옮겨온 것이다. 클래스 문자열,
// aria-label 문구, disabled 조건, 버튼 순서를 "정리"하지 말 것 —
// verify-admission-table-editor.mjs의 스모크 렌더 단언(:280 inputCount === 16,
// :283 !out.includes('열 삭제'))이 이 동결의 롤백 신호이고, 그 숫자는
// 갱신 대상이 아니라 **깨지면 되돌리라는 신호**다.
//
// 위계(2026-08-06 사용자 지적 반영)도 그대로 옮겼다:
//   1차 라벨 input · 셀 편집기 = 상시 노출
//   2차 행 조작(↑/↓/삭제) = 상시 노출, 진하게
//   3차 role·정렬·열 삭제·열 추가 = "열 설정" 토글 뒤
//
// 훅 0 / state 0. 상태는 전부 TableBlockEditor가 들고, 여기는 그 값과
// 핸들러를 받아 마크업만 만든다.

/**
 * 편집 모드 파리티 **동결값**(설계 §4·§6 Step 5).
 *
 * 네 값 전부 "현행 어드민 화면을 그대로 재현한다"는 뜻이지 설계 의도가
 * 아니다. 구조만 통합하고 겉모습은 바꾸지 않기 위한 잠금이며, 플립은
 * Step 7(승인 범위 7a+7d)에서 **플래그당 1커밋**으로 따로 한다.
 *
 * - cellClassNames: false — 구 `:331`의 클래스 없는 <td> 재현. true로 켜면
 *   AdmissionSurface.jsx:83 `.admission-data-table td.left{min-width:150px}`
 *   등이 편집표에도 걸려 **어드민 표 폭이 바뀐다**(=7a).
 * - groupHeader: 'flatten' — 구 `:271-326`이 recruitExact에서도 thead를 항상
 *   1행으로 그렸다. 그룹명은 표 밖 TableGroupHeaderEditor가 다룬다.
 * - emptyFallback: false — 빈 셀에 '-' / '주요 변경' 리터럴을 넣지 않는다
 *   (편집 중인 빈 input에 표시용 폴백이 끼어들면 값처럼 보인다).
 * - scrollWrapExtra — 구 `:269`의 `max-w-full overflow-x-auto`. 폼이 가로로
 *   밀리지 않도록 편집기만 직접 강제한다(2026-08-06 폼 가로 넘침 실측 반영).
 */
export const EDIT_PARITY_FROZEN = {
  cellClassNames: false,
  groupHeader: 'flatten',
  emptyFallback: false,
  scrollWrapExtra: 'max-w-full overflow-x-auto'
};

/**
 * 편집 슬롯 4종을 만든다.
 *
 * viewSlots는 상태가 없어 모듈 상수 하나로 끝나지만 편집 슬롯은 토글 상태와
 * 변경 핸들러가 필요하다. 그래서 `AdmissionTable`의 `MODE_DEFAULTS`에 정적
 * 기본값으로 등록할 수 없고(등록하려면 table/ 레이어가 editor/ 레이어를
 * import해야 해서 공개 번들에 편집기가 딸려 들어간다), 호출부가 `slots`와
 * `parity`를 명시적으로 넘긴다 — `mode`보다 `slots`/`parity`가 우선한다는
 * 계약(AdmissionTable.jsx:60-62)이 그대로 쓰이는 자리다.
 *
 * @param {Object} deps
 * @param {boolean} deps.showColumnSettings   "열 설정" 토글 상태
 * @param {boolean} deps.columnMutationAllowed 컬럼 수 고정 variant면 false
 * @param {(colIdx:number, field:string, value:unknown)=>void} deps.onUpdateColumnField
 * @param {(colIdx:number)=>void} deps.onRemoveColumn
 * @param {()=>void} deps.onAddColumn
 * @param {(rowIdx:number, colIdx:number, next:unknown)=>void} deps.onUpdateCell
 * @param {(rowIdx:number, delta:number)=>void} deps.onMoveRow
 * @param {(rowIdx:number)=>void} deps.onRemoveRow
 * @returns {{header:Function, cell:Function, rowTrailing:Function, headTrailing:Function}}
 */
export default function createEditSlots({
  showColumnSettings,
  columnMutationAllowed,
  onUpdateColumnField,
  onRemoveColumn,
  onAddColumn,
  onUpdateCell,
  onMoveRow,
  onRemoveRow
}) {
  return {
    // <th> 안쪽 — 구 TableBlockEditor.jsx:275-315
    header: (headerCell, block) => {
      const colIdx = headerCell.colIdx;
      const column = block.columns[colIdx];
      return (
        <div className="flex flex-col gap-1 p-1">
          {/* 1차 — 라벨은 기본 노출. 데이터 셀과 함께 관리자가 늘 만지는 값.
              공개 표 헤더 텍스트처럼 보이도록 평상시 테두리·배경
              투명, hover/focus에서만 드러낸다(셀 입력과 동일 원칙). */}
          <ImeSafeInput
            type="text"
            value={column?.label ?? ''}
            onCommit={(next) => onUpdateColumnField(colIdx, 'label', next)}
            aria-label={`컬럼 ${colIdx + 1} 라벨`}
            className="admission-cell-editor-input w-full border border-transparent bg-transparent px-1.5 py-1 text-xs font-bold outline-none transition-colors hover:border-[#d7d7d7] hover:bg-white focus:border-[#2348ff] focus:bg-white"
          />
          {showColumnSettings && (
            <>
              <ColumnRoleEditor
                variant={block.variant}
                role={column?.role}
                onChange={(next) => onUpdateColumnField(colIdx, 'role', next)}
              />
              <select
                value={column?.align ?? ''}
                onChange={(e) => onUpdateColumnField(colIdx, 'align', e.target.value || undefined)}
                aria-label={`컬럼 ${colIdx + 1} 정렬`}
                className="border border-[#d7d7d7] px-1 py-1 text-[11px]"
              >
                <option value="">(기본 정렬)</option>
                <option value="left">left</option>
                <option value="center">center</option>
              </select>
              {columnMutationAllowed && (
                <button
                  type="button"
                  onClick={() => onRemoveColumn(colIdx)}
                  disabled={block.columns.length <= 1}
                  className="text-[11px] font-bold text-red-500 disabled:cursor-not-allowed disabled:text-gray-300"
                >
                  열 삭제
                </button>
              )}
            </>
          )}
        </div>
      );
    },

    // <td> 안쪽 — 구 TableBlockEditor.jsx:332-336.
    // roleKind로 cellDesc.edit.kind를 넘긴다. 구 코드는
    // getCellKind(variant, column.role)를 넘겼고 CellEditor가 안에서
    // resolveCellKind로 셀 실제 형태를 덧씌웠는데, tableModel.describeCell이
    // 이미 그 둘을 합성해 둔 값이 edit.kind다(tableModel.js:290). CellEditor가
    // 한 번 더 resolveCellKind를 돌려도 결과가 같다 — 값 형태 판정이 먼저라
    // 멱등이기 때문. 즉 디스패치 결과는 구 코드와 동일하고, kind 판정 정본이
    // tableModel 한 곳으로 모인다(설계 §7-3 T3).
    cell: (cellDesc) => (
      <CellEditor
        roleKind={cellDesc.edit.kind}
        value={cellDesc.raw}
        onChange={(next) => onUpdateCell(cellDesc.rowIdx, cellDesc.colIdx, next)}
      />
    ),

    // <tr> 끝 여분 <td> — 구 TableBlockEditor.jsx:339-369.
    // 🚩 Step 7d에서 이 슬롯을 제거하고 컨트롤을 표 밖으로 옮기면 DOM 컬럼
    // 수가 columns.length가 되어 뷰와 일치한다. 지금은 동결이다.
    rowTrailing: (rowIdx, rowCount) => (
      <td>
        {/* 2차 — 행 조작. 셀 편집보다는 드물지만 일상 작업이라 열 설정보다 진하게. */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onMoveRow(rowIdx, -1)}
            disabled={rowIdx === 0}
            aria-label={`행 ${rowIdx + 1} 위로`}
            className="text-sm font-bold text-gray-600 disabled:text-gray-300"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={() => onMoveRow(rowIdx, 1)}
            disabled={rowIdx === rowCount - 1}
            aria-label={`행 ${rowIdx + 1} 아래로`}
            className="text-sm font-bold text-gray-600 disabled:text-gray-300"
          >
            ↓
          </button>
          <button
            type="button"
            onClick={() => onRemoveRow(rowIdx)}
            aria-label={`행 ${rowIdx + 1} 삭제`}
            className="text-xs font-bold text-red-500"
          >
            삭제
          </button>
        </div>
      </td>
    ),

    // thead 끝 여분 <th> — 구 TableBlockEditor.jsx:318-324.
    // 구 코드가 `{showColumnSettings && columnMutationAllowed && (<th>…)}`로
    // 조건부 렌더였으므로 여기서도 조건 불충족 시 null을 돌려준다(골격은
    // null을 받으면 여분 <th>를 아예 만들지 않는다). 🚩 Step 7d 제거 대상.
    headTrailing: () =>
      showColumnSettings && columnMutationAllowed ? (
        <th>
          <button
            type="button"
            onClick={onAddColumn}
            className="text-[11px] font-bold text-gray-500 hover:text-gray-700"
          >
            + 열 추가
          </button>
        </th>
      ) : null
  };
}
