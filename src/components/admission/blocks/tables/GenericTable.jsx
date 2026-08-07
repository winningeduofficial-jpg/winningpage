import AdmissionTable from '../../table/AdmissionTable';

// 이관 shim — SelectionTable.jsx의 주석 참조. variant를 그대로 흘려보내므로
// exam/minimum/recordInfo/score/special/generic 및 미지 variant 전부가
// tableModel의 default 분기로 떨어진다. 삭제는 설계 §6 Step 4.
export default function GenericTable({ variant, columns, rows }) {
  return <AdmissionTable block={{ variant, columns, rows }} />;
}
