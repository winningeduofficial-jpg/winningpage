import AdmissionTable from "@/components/admission/table/AdmissionTable";
import type { TableBlock } from "@/lib/admissionDoc";

// TableBlock 뷰 진입점. 예전에는 variant별 렌더러 5개를 디스패치했지만,
// 이제 골격이 한 벌(table/AdmissionTable.jsx)이고 variant 분기는 전부
// table/tableModel.js가 흡수했으므로 여기서 고를 것이 없다.
//
// block 가드(columns/rows가 배열인가)도 AdmissionTable이 describeTable로
// 흡수했다 — 뷰 진입점만이 아니라 편집 진입점도 같은 보호를 받게 하기 위해서다.
type TableBlockViewProps = {
  block: unknown;
};

export default function TableBlockView({ block }: TableBlockViewProps) {
  // block은 의도적으로 unknown이다(위 주석) — 형태 가드는 AdmissionTable
  // 내부의 describeTable이 흡수한다(columns/rows가 배열이 아니면 null 렌더).
  return <AdmissionTable block={block as TableBlock} />;
}
