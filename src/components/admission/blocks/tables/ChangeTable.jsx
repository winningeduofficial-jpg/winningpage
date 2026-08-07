import AdmissionTable from '../../table/AdmissionTable';

// 이관 shim — SelectionTable.jsx의 주석 참조(마크업은 table/AdmissionTable.jsx로
// 이동, 여기는 props → block 어댑터만 남았다. 삭제는 설계 §6 Step 4).
export default function ChangeTable({ columns, rows }) {
  return <AdmissionTable block={{ variant: 'change', columns, rows }} />;
}
