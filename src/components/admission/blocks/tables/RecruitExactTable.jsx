import { getTableVariantLayout, recruitExactFixedCellClassName } from '../../admissionLayout';

// normalizeRecruitmentExactHtml(admissionParsing.js:553) 재현. 2단 헤더 —
// 고정 컬럼은 rowSpan=2(fixed-head), 그룹 헤더는 colSpan=count(recruit-group-head).
// 고정 컬럼 중 첫 번째만 series-cell이 추가로 붙는다(legacy는 idx===0만 구분).
export default function RecruitExactTable({ columns, rows, groups, fixedColumnCount }) {
  const layout = getTableVariantLayout('recruitExact');
  const fixedCount = fixedColumnCount || 0;
  const fixedColumns = columns.slice(0, fixedCount);
  const dataColumns = columns.slice(fixedCount);

  return (
    <div className={layout.scrollWrapClassName}>
      <table className={layout.tableClassName}>
        <thead>
          <tr>
            {fixedColumns.map((col, idx) => (
              <th key={`fixed-${idx}`} rowSpan={2} className="fixed-head">
                {col.label}
              </th>
            ))}
            {(groups || []).map((group, idx) => (
              <th key={`group-${idx}`} colSpan={group.count} className="recruit-group-head">
                {group.name}
              </th>
            ))}
          </tr>
          <tr>
            {dataColumns.map((col, idx) => (
              <th key={idx}>{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIdx) => (
            <tr key={rowIdx}>
              {row.map((cell, colIdx) => {
                const cellText = typeof cell === 'string' ? cell : cell?.text;
                const content = cellText ? cellText : <span className="muted">-</span>;
                if (colIdx < fixedCount) {
                  return (
                    <td key={colIdx} className={recruitExactFixedCellClassName(colIdx)}>
                      {content}
                    </td>
                  );
                }
                return <td key={colIdx}>{content}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
