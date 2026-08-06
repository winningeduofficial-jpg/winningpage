import { getTableVariantLayout, CHANGE_CELL_CLASS_BY_ROLE, CHANGE_EMPTY_FALLBACK_BY_ROLE } from '../../admissionLayout';

// buildChangeTableHtml(admissionParsing.js:941) 재현.
// no/title은 빈값이 리터럴 폴백('-' / '주요 변경'), content만 muted span.
export default function ChangeTable({ columns, rows }) {
  const layout = getTableVariantLayout('change');

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
                const role = columns[colIdx]?.role;
                const className = CHANGE_CELL_CLASS_BY_ROLE[role] || '';
                const cellText = typeof cell === 'string' ? cell : cell?.text;

                if (role === 'content') {
                  return (
                    <td key={colIdx} className={className}>
                      {cellText ? (
                        <div className="admission-change-plain-cell">{cellText}</div>
                      ) : (
                        <span className="muted">-</span>
                      )}
                    </td>
                  );
                }

                return (
                  <td key={colIdx} className={className}>
                    {cellText || CHANGE_EMPTY_FALLBACK_BY_ROLE[role] || '-'}
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
