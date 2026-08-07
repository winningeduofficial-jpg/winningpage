import { describeTable, describeCell } from '../../table/tableModel';

// buildRecruitmentHtml(admissionParsing.js:2261) + buildRecruitCell(:2164) 재현.
// group/unit은 리터럴 '-' 폴백, 값 셀은 chips 구조(없으면 muted span).
//
// 셀 className과 `role === 'group' || role === 'unit'` 조건은 이제
// table/tableModel.js가 단독 보유한다(이전에는 이 파일이 인라인으로 들고 있어
// admissionLayout.js의 getCellKind와 수동 동기화 의무가 있었다).
export default function RecruitTable({ columns, rows }) {
  const block = { variant: 'recruit', columns, rows };
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

                if (view.leaf === 'literal') {
                  return (
                    <td key={colIdx} className={className}>
                      {view.text || view.fallback}
                    </td>
                  );
                }

                return (
                  <td key={colIdx} className={className}>
                    {view.leaf === 'chips' ? (
                      <div className="admission-recruit-cell-values">
                        {view.chips.map((chip, chipIdx) => (
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
