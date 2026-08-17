// 표 골격(AdmissionTable)의 **뷰 모드 리프**. 현행 표시 렌더러 5개
// (blocks/tables/*.jsx)의 <th>/<td> 안쪽 마크업을 문자 그대로 이관한 것이며,
// 이 파일 밖으로는 태그를 한 개도 내보내지 않는다 — <div>/<table>/<thead>/
// <tr>/<th>/<td> 골격은 전부 AdmissionTable.jsx가 소유한다.
//
// 슬롯 계약(설계 §3-2 TableSlots):
//   header(headerCellDesc, block) -> <th> 안에 들어갈 내용
//   cell(cellDesc, block)         -> <td> 안에 들어갈 내용
// 뷰는 rowTrailing/headTrailing(행·열 조작 컨트롤)을 갖지 않는다. 그 둘은
// 편집 슬롯 전용이고, 없으면 골격이 여분 <td>/<th>를 아예 만들지 않는다.
//
// ⚠ 여기서 나가는 마크업은 Gate B(verify-admission-doc-equivalence.mjs,
// 실데이터 2506건)와 AdmissionSectionView.test.tsx(합성 25건)의 바이트
// 계약을 그대로 짊어진다. 클래스 문자열·태그 중첩·텍스트 폴백 순서를
// "정리"하지 말 것 — 리터럴 자리는 전부 `text || fallback`이며, 이 우선순위
// 자체가 현행(예: SelectionTable.jsx:43 `{cellText || '-'}`)의 재현이다.

import type { CellDesc, CellViewDesc, HeaderCellDesc } from "./tableModel";

/**
 * 셀 안쪽 리프 한 개. tableModel.describeCell(...).view의 leaf가 감쌀 태그를,
 * 나머지 필드가 내용을 정한다.
 */
function renderLeaf(view: CellViewDesc) {
  switch (view.leaf) {
    case "badge":
      // SelectionTable.jsx:34-36 — minimum 컬럼 전용 배지.
      return (
        <span className={`admission-minimum-badge ${view.badge}`}>
          {view.text || view.fallback}
        </span>
      );
    case "chips":
      // RecruitTable.jsx:40-47 — buildRecruitCell(admissionParsing.js:2164) 재현.
      return (
        <div className="admission-recruit-cell-values">
          {/* tableModel.cellViewOf가 leaf==='chips'일 때만 chips를 채운다 — 항상 배열. */}
          {(view.chips ?? []).map((chip, chipIdx) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: 읽기 전용 셀 렌더러 — chips는 doc JSON에 id가 없고 사용자가 재정렬하지 않는다.
            <span key={chipIdx}>
              <b>{chip.label}</b>
              {chip.value}
            </span>
          ))}
        </div>
      );
    case "changePlain":
      // ChangeTable.jsx:32-34 — content 컬럼에 값이 있을 때만.
      return (
        <div className="admission-change-plain-cell">
          {view.text || view.fallback}
        </div>
      );
    case "muted":
      // change(content) / recruit(값 셀) / recruitExact / generic 공통 빈값 표시.
      return <span className="muted">-</span>;
    default:
      // 'literal' — 텍스트 노드 하나. 감싸는 태그가 없다는 것이 요점이다.
      return view.text || view.fallback;
  }
}

const viewSlots = {
  header: (headerCell: HeaderCellDesc) => headerCell.label,
  cell: (cellDesc: CellDesc) => renderLeaf(cellDesc.view),
};

export default viewSlots;
