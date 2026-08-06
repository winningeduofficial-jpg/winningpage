import { getTableVariantLayout, SELECTION_CELL_CLASS_BY_ROLE, selectionEmptyFallback } from '../../admissionLayout';

// buildSelectionMethodTable(admissionParsing.js:1194) 재현.
// 빈값은 muted span이 아니라 리터럴 '-'(escapeHtml(row.type || '-') 계열).
// minimum 컬럼만 admission-minimum-badge 배지로 감싼다.
export default function SelectionTable({ columns, rows }) {
  const layout = getTableVariantLayout('selection');

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
                const className = SELECTION_CELL_CLASS_BY_ROLE[role] || '';
                const cellText = typeof cell === 'string' ? cell : cell?.text;

                if (role === 'minimum') {
                  const text = cellText || '-';
                  const explicitBadge = cell && typeof cell === 'object' ? cell.badge : undefined;
                  const badge = explicitBadge
                    ? explicitBadge === 'minimumHas'
                      ? 'has'
                      : 'none'
                    : text === '-'
                      ? 'none'
                      : 'has';
                  return (
                    <td key={colIdx} className={className}>
                      <span className={`admission-minimum-badge ${badge}`}>{text}</span>
                    </td>
                  );
                }

                return (
                  <td key={colIdx} className={className}>
                    {cellText || selectionEmptyFallback(role)}
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
