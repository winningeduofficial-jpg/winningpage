import { getTableVariantLayout, RECRUIT_FIXED_CELL_CLASS_BY_ROLE, recruitFixedEmptyFallback } from '../../admissionLayout';

// buildRecruitmentHtml(admissionParsing.js:2261) + buildRecruitCell(:2164) 재현.
// group/unit은 리터럴 '-' 폴백, 값 셀은 chips 구조(없으면 muted span).
export default function RecruitTable({ columns, rows }) {
  const layout = getTableVariantLayout('recruit');

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

                if (role === 'group' || role === 'unit') {
                  const className = RECRUIT_FIXED_CELL_CLASS_BY_ROLE[role];
                  const cellText = typeof cell === 'string' ? cell : cell?.text;
                  return (
                    <td key={colIdx} className={className}>
                      {cellText || recruitFixedEmptyFallback()}
                    </td>
                  );
                }

                const chips = cell && typeof cell === 'object' && Array.isArray(cell.chips) ? cell.chips : null;
                return (
                  <td key={colIdx} className="recruit-values-cell">
                    {chips && chips.length ? (
                      <div className="admission-recruit-cell-values">
                        {chips.map((chip, chipIdx) => (
                          <span key={chipIdx}>
                            <b>{chip.label}</b>
                            {chip.value}
                          </span>
                        ))}
                      </div>
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
