import type { ComponentProps } from "react";
import { resolveCellKind } from "../tableEditorValidation";
import BadgeCellEditor from "./BadgeCellEditor";
import ChipsCellEditor from "./ChipsCellEditor";
import TextCellEditor from "./TextCellEditor";

type CellEditorProps = {
  // 실사용 호출부(editSlots.tsx)는 항상 cellDesc.edit.kind(CellKind, 항상 값 있음)를 넘긴다.
  roleKind: Parameters<typeof resolveCellKind>[0];
  value: unknown;
  onChange: (value: unknown) => void;
};

// Cell 스키마 3형태(문자열/{text,badge}/{chips}) 디스패처.
// roleKind는 admissionLayout.js의 getCellKind(variant, column.role) 결과다.
export default function CellEditor({
  roleKind,
  value,
  onChange,
}: CellEditorProps) {
  const kind = resolveCellKind(roleKind, value);

  // kind는 resolveCellKind가 value의 실제 형태(문자열/{text,badge}/{chips})를
  // 보고 이미 판정한 결과다 — 분기마다 그 형태에 맞는 편집기 value 타입으로 좁힌다.
  if (kind === "badge")
    return (
      <BadgeCellEditor
        value={value as ComponentProps<typeof BadgeCellEditor>["value"]}
        onChange={onChange}
      />
    );
  if (kind === "chips")
    return (
      <ChipsCellEditor
        value={value as ComponentProps<typeof ChipsCellEditor>["value"]}
        onChange={onChange}
      />
    );
  return (
    <TextCellEditor
      value={value as ComponentProps<typeof TextCellEditor>["value"]}
      onChange={onChange}
    />
  );
}
