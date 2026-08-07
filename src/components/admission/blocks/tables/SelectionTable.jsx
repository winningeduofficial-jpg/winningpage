import { describeTable, describeCell } from '../../table/tableModel';

// buildSelectionMethodTable(admissionParsing.js:1194) 재현.
// 빈값은 muted span이 아니라 리터럴 '-'(escapeHtml(row.type || '-') 계열).
// minimum 컬럼만 admission-minimum-badge 배지로 감싼다.
//
// 셀 className·배지 추론·빈값 폴백은 이제 table/tableModel.js가 단독 보유한다
// (이전에는 이 파일이 `role === 'minimum'` 조건을 인라인으로 들고 있어
// admissionLayout.js의 getCellKind와 수동 동기화 의무가 있었다). 이 파일은
// 모델이 낸 서술을 JSX로 펴기만 하며, 마크업 자체는 한 글자도 바뀌지 않았다.
export default function SelectionTable({ columns, rows }) {
  const block = { variant: 'selection', columns, rows };
  const { layout } = describeTable(block);

  return (
    <div className={layout.scrollWrapClassName}>
      <table className={layout.tableClassName}>
        <thead>
          <tr>
            {columns.map((col, idx) => (
              <th key={idx}>{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIdx) => (
            <tr key={rowIdx}>
              {row.map((_cell, colIdx) => {
                const { className, view } = describeCell(block, rowIdx, colIdx);

                if (view.leaf === 'badge') {
                  return (
                    <td key={colIdx} className={className}>
                      <span className={`admission-minimum-badge ${view.badge}`}>
                        {view.text || view.fallback}
                      </span>
                    </td>
                  );
                }

                return (
                  <td key={colIdx} className={className}>
                    {view.text || view.fallback}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
