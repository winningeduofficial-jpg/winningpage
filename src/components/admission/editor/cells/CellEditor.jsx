import TextCellEditor from './TextCellEditor';
import BadgeCellEditor from './BadgeCellEditor';
import ChipsCellEditor from './ChipsCellEditor';
import { resolveCellKind } from '../tableEditorValidation';

// Cell 스키마 3형태(문자열/{text,badge}/{chips}) 디스패처.
// roleKind는 admissionLayout.js의 getCellKind(variant, column.role) 결과다.
export default function CellEditor({ roleKind, value, onChange }) {
  const kind = resolveCellKind(roleKind, value);

  if (kind === 'badge') return <BadgeCellEditor value={value} onChange={onChange} />;
  if (kind === 'chips') return <ChipsCellEditor value={value} onChange={onChange} />;
  return <TextCellEditor value={value} onChange={onChange} />;
}
