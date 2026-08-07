import AdmissionTable from '../../table/AdmissionTable';

// 이관 shim. 표 골격이 table/AdmissionTable.jsx 한 벌로 합쳐지면서 이 파일의
// 마크업은 전부 그쪽으로 옮겨졌고, 여기 남은 것은 `{columns, rows}` props를
// block 한 덩어리로 바꿔 주는 어댑터뿐이다.
//
// 왜 지금 지우지 않는가: scripts/verify-admission-table-model.mjs가 이 5개
// 파일을 엔트리로 하드코딩해 코퍼스 2500여 건을 대조하고 있어, 지우는 순간
// 골격 교체와 하니스 폐기가 한 커밋에 섞인다. 도입과 삭제를 다른 커밋으로
// 끊는 것이 이 마이그레이션의 유일한 비가역 지점 관리 방법이다(설계 §6 Step 4).
export default function SelectionTable({ columns, rows }) {
  return <AdmissionTable block={{ variant: 'selection', columns, rows }} />;
}
