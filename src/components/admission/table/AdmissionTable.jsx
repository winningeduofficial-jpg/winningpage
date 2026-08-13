import { describeTable, describeHeader, describeCell } from "./tableModel";
import viewSlots from "./viewSlots";

// 대입모집요강 표의 **유일한 골격**. <div>/<table>/<thead>/<tbody>/<tr>/<th>/<td>를
// 만드는 코드는 이 파일 하나뿐이고, 셀·헤더 안쪽(리프)은 전부 슬롯이 만든다.
//
// 존재 이유(설계 §1): 표 마크업 코드경로가 3벌이었고 그중 표시 5벌 + 편집 1벌을
// 여기 한 벌로 합친다. 지금 커밋은 표시 쪽만 이 골격으로 옮기고(편집 위임은
// 다음 단계), 그래서 이 파일의 출력은 현행 공개 화면과 **바이트 동일**해야 한다.
//
// 훅 0 / state 0 / Context 0 / mode 조건문 0. 골격 JSX 안에 `mode === ...`가
// 하나도 없다는 것이 "표 한 벌"의 실체다 — mode는 아래 MODE_DEFAULTS에서 기본
// 슬롯/파리티를 고르는 데만 쓰이고, 그 뒤로는 slots/parity 두 값만 흐른다.
//
// **감싸는 DOM에 아무 가정도 하지 않는다**(설계 §5). 지금은 아코디언 안이지만
// 나중에 모달 안에 그대로 들어갈 수 있어야 하므로, 바깥 여백·포커스·스크롤
// 잠금 같은 크롬은 이 컴포넌트가 절대 만들지 않는다. 만드는 것은 스크롤 래퍼
// <div> 하나까지이며 그 클래스도 admissionLayout.js에서 받아온다.
//
// ⚠ Gate B 폭발 반경이 이 파일에 국한되도록 설계됐다(설계 §2-2 G8). 즉
// blocks/**를 건드리지 않고도 공개 표 DOM을 깨뜨릴 수 있는 유일한 파일이
// 여기다. 속성 순서까지 현행과 맞춰 뒀다 — <th>의 prop 순서(rowSpan → colSpan
// → className)는 RecruitExactTable.jsx:25,30의 출력 바이트열을 그대로 내기
// 위한 것이지 취향이 아니다.

/** 뷰(=현행 공개 DOM) 파리티. 편집 모드가 되돌려야 할 기준점이기도 하다. */
const VIEW_PARITY = {
  // <td>에 role/위치 기반 className을 부여하는가.
  cellClassNames: true,
  // 'render' = recruitExact 2단 병합 헤더 그대로, 'flatten' = 항상 1행.
  groupHeader: "render",
  // 빈 셀 리터럴 폴백을 내보내는가. 골격이 아니라 **슬롯**이 소비하는 값이라
  // 여기서는 기본값만 들고 있는다(편집 슬롯 신설 단계에서 결선한다).
  emptyFallback: true,
  // 스크롤 래퍼에 덧붙일 클래스. 편집은 'max-w-full overflow-x-auto'를 쓴다.
  scrollWrapExtra: "",
};

// mode → 기본 슬롯/파리티. 편집 슬롯(editSlots)은 다음 단계에서 'edit' 항목으로
// 등록된다. 그때까지 알 수 없는 mode는 뷰 기본값으로 떨어진다.
const MODE_DEFAULTS = {
  view: { slots: viewSlots, parity: VIEW_PARITY },
};

/**
 * @param {Object} props
 * @param {Object} props.block                     TableBlock(AdmissionDoc)
 * @param {'view'|'edit'} [props.mode]             기본 슬롯/파리티 선택용
 * @param {Object} [props.slots]                   {header, cell, rowTrailing?, headTrailing?}
 * @param {Object} [props.parity]                  VIEW_PARITY 위에 덮어쓸 값만
 */
export default function AdmissionTable({
  block,
  mode = "view",
  slots,
  parity,
}) {
  const desc = describeTable(block);
  // 표로 그릴 수 없는 block(columns/rows가 배열이 아님). 이전에는
  // TableBlockView.jsx:10이 들고 있던 가드이며, 골격이 흡수해 호출자 전부가
  // 같은 보호를 받는다.
  if (!desc) return null;

  const defaults = MODE_DEFAULTS[mode] || MODE_DEFAULTS.view;
  const activeSlots = slots || defaults.slots;
  const activeParity = parity
    ? { ...defaults.parity, ...parity }
    : defaults.parity;

  const header = describeHeader(block, {
    groupHeader: activeParity.groupHeader,
  });
  const scrollWrapClassName = activeParity.scrollWrapExtra
    ? `${desc.layout.scrollWrapClassName} ${activeParity.scrollWrapExtra}`
    : desc.layout.scrollWrapClassName;
  const lastHeaderRowIdx = header.rows.length - 1;

  return (
    <div className={scrollWrapClassName}>
      <table className={desc.layout.tableClassName}>
        <thead>
          {header.rows.map((headerRow, headerRowIdx) => (
            <tr key={headerRowIdx}>
              {headerRow.cells.map((headerCell) => (
                <th
                  key={headerCell.key}
                  rowSpan={headerCell.rowSpan}
                  colSpan={headerCell.colSpan}
                  className={headerCell.className}
                >
                  {activeSlots.header(headerCell, block)}
                </th>
              ))}
              {/* 열 추가 등 골격 밖 컨트롤. 뷰에는 없으므로 여분 <th>가 생기지
                  않는다(= DOM 컬럼 수 = columns.length). */}
              {activeSlots.headTrailing && headerRowIdx === lastHeaderRowIdx
                ? activeSlots.headTrailing()
                : null}
            </tr>
          ))}
        </thead>
        <tbody>
          {block.rows.map((row, rowIdx) => (
            <tr key={rowIdx}>
              {/* columns가 아니라 row를 순회한다 — 행 길이가 컬럼 수와 다른
                  실데이터가 있고, 현행 5개 렌더러도 전부 row.map이다. 여기를
                  columnCount 기준으로 "바로잡으면" Gate B가 깨진다. */}
              {row.map((_cell, colIdx) => {
                const cellDesc = describeCell(block, rowIdx, colIdx);
                return (
                  <td
                    key={colIdx}
                    className={
                      activeParity.cellClassNames
                        ? cellDesc.className
                        : undefined
                    }
                  >
                    {activeSlots.cell(cellDesc, block)}
                  </td>
                );
              })}
              {/* 행 이동/삭제 등. 뷰에는 없다. */}
              {activeSlots.rowTrailing
                ? activeSlots.rowTrailing(rowIdx, block.rows.length)
                : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
