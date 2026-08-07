import { describeTable, describeCell } from '../../table/tableModel';

// normalizeRecruitmentExactHtml(admissionParsing.js:553) 재현. 2단 헤더 —
// 고정 컬럼은 rowSpan=2(fixed-head), 그룹 헤더는 colSpan=count(recruit-group-head).
// 고정 컬럼 중 첫 번째만 series-cell이 추가로 붙는다(legacy는 idx===0만 구분).
//
// 바디 셀의 className·빈값 폴백은 table/tableModel.js가 단독 보유한다.
// thead의 span/클래스 리터럴은 이 단계에서 손대지 않는다 — 모델의
// describeHeader가 이미 같은 계산을 갖고 있고, 그 소비는 표 골격 컴포넌트를
// 세우는 다음 단계에서 한 번에 이뤄진다(여기서 옮기면 두 개의 map을 하나로
// 합쳐야 해 JSX 트리가 바뀐다).
export default function RecruitExactTable({ columns, rows, groups, fixedColumnCount }) {
  const block = { variant: 'recruitExact', columns, rows, groups, fixedColumnCount };
  const { layout } = describeTable(block);
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
              {row.map((_cell, colIdx) => {
                const { className, view } = describeCell(block, rowIdx, colIdx);
                const content =
                  view.leaf === 'literal' ? (
                    view.text || view.fallback
                  ) : (
                    <span className="muted">-</span>
                  );
                if (colIdx < fixedCount) {
                  return (
                    <td key={colIdx} className={className}>
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
