import SelectionTable from './tables/SelectionTable';
import ChangeTable from './tables/ChangeTable';
import RecruitTable from './tables/RecruitTable';
import RecruitExactTable from './tables/RecruitExactTable';
import GenericTable from './tables/GenericTable';

// TableBlock.variant 디스패처. exam/minimum/recordInfo/score/special/generic은
// 전부 htmlTable(admissionParsing.js:294) 계열이라 GenericTable 하나로 공용한다.
export default function TableBlockView({ block }) {
  if (!block || !Array.isArray(block.columns) || !Array.isArray(block.rows)) return null;

  switch (block.variant) {
    case 'selection':
      return <SelectionTable columns={block.columns} rows={block.rows} />;
    case 'change':
      return <ChangeTable columns={block.columns} rows={block.rows} />;
    case 'recruit':
      return <RecruitTable columns={block.columns} rows={block.rows} />;
    case 'recruitExact':
      return (
        <RecruitExactTable
          columns={block.columns}
          rows={block.rows}
          groups={block.groups}
          fixedColumnCount={block.fixedColumnCount}
        />
      );
    case 'exam':
    case 'minimum':
    case 'recordInfo':
    case 'score':
    case 'special':
    case 'generic':
    default:
      return <GenericTable variant={block.variant} columns={block.columns} rows={block.rows} />;
  }
}
