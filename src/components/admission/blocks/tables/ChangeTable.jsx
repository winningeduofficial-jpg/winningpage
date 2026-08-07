import { describeTable, describeCell } from '../../table/tableModel';

// buildChangeTableHtml(admissionParsing.js:941) 재현.
// no/title은 빈값이 리터럴 폴백('-' / '주요 변경'), content만 muted span.
//
// 어느 컬럼이 어떤 폴백을 쓰는지(= role 조건)는 table/tableModel.js가 단독
// 보유한다. 이 파일은 모델이 낸 leaf만 보고 감쌀 태그를 고른다.
export default function ChangeTable({ columns, rows }) {
  const block = { variant: 'change', columns, rows };
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

                if (view.leaf === 'changePlain' || view.leaf === 'muted') {
                  return (
                    <td key={colIdx} className={className}>
                      {view.leaf === 'changePlain' ? (
                        <div className="admission-change-plain-cell">
                          {view.text || view.fallback}
                        </div>
                      ) : (
                        <span className="muted">-</span>
                      )}
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
