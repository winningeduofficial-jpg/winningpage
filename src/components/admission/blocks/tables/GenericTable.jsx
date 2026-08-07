import { describeTable, describeCell } from '../../table/tableModel';

// htmlTable(admissionParsing.js:294) 재현. exam/minimum/recordInfo/score/special
// 공용 — idx 0·1에만 'left' 클래스, 빈값은 muted span.
//
// 'left' 판정(위치 기반)과 빈값 폴백은 table/tableModel.js가 단독 보유한다.
export default function GenericTable({ variant, columns, rows }) {
  const block = { variant, columns, rows };
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
                return (
                  <td key={colIdx} className={className}>
                    {view.leaf === 'literal' ? (
                      view.text || view.fallback
                    ) : (
                      <span className="muted">-</span>
                    )}
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
