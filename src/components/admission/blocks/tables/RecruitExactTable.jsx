import AdmissionTable from '../../table/AdmissionTable';

// 이관 shim — SelectionTable.jsx의 주석 참조. 2단 병합 헤더(고정열 rowSpan=2 /
// 그룹 colSpan=count)는 table/tableModel.js의 describeHeader가, 그 <th> 조립은
// AdmissionTable이 갖고 있다. 삭제는 설계 §6 Step 4.
export default function RecruitExactTable({ columns, rows, groups, fixedColumnCount }) {
  return (
    <AdmissionTable block={{ variant: 'recruitExact', columns, rows, groups, fixedColumnCount }} />
  );
}
