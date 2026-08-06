import { getTableVariantLayout, isGenericLeftColumn } from '../../admissionLayout';

// htmlTable(admissionParsing.js:294) 재현. exam/minimum/recordInfo/score/special
// 공용 — idx 0·1에만 'left' 클래스, 빈값은 muted span.
export default function GenericTable({ variant, columns, rows }) {
  const layout = getTableVariantLayout(variant);

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
              {row.map((cell, colIdx) => {
                const cellText = typeof cell === 'string' ? cell : cell?.text;
                const className = isGenericLeftColumn(colIdx) ? 'left' : undefined;
                return (
                  <td key={colIdx} className={className}>
                    {cellText ? cellText : <span className="muted">-</span>}
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
