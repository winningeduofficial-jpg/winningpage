import { useMemo, useState } from 'react';
import AdmissionBlockEditor from './AdmissionBlockEditor';
import { validateBlocks } from './tableEditorValidation';
import * as docOps from './docBlockOperations';

const ADDABLE_KINDS = [
  { kind: 'note', label: '안내 문구(note)' },
  { kind: 'emptyBox', label: '빈 상태 박스(emptyBox)' },
  { kind: 'heading', label: '소제목(heading)' },
  { kind: 'plainList', label: '목록(plainList)' },
  { kind: 'preText', label: '원문 텍스트(preText)' },
  { kind: 'footnote', label: '각주(footnote)' },
  { kind: 'table', label: '표(table, generic 2컬럼으로 시작)' }
];

// AdmissionDoc.blocks 배열 전체를 편집하는 최상위 컴포넌트. controlled —
// blocks/onChange만 받는다. Admin.jsx 배선(저장·doc 전체 조립)은 이번
// 범위 밖이다.
export default function DocBlocksEditor({ section, blocks, onChange }) {
  const [addKind, setAddKind] = useState(ADDABLE_KINDS[0].kind);
  const validation = useMemo(() => validateBlocks(section, blocks), [section, blocks]);

  function updateBlock(idx, nextBlock) {
    onChange(docOps.updateBlockAt(blocks, idx, nextBlock));
  }

  function removeBlock(idx) {
    onChange(docOps.removeBlockAt(blocks, idx));
  }

  function moveBlockUpDown(idx, delta) {
    onChange(docOps.moveBlock(blocks, idx, delta));
  }

  function addBlock() {
    const next = docOps.createDefaultBlock(addKind);
    if (!next) return;
    onChange(docOps.appendBlock(blocks, next));
  }

  return (
    <div className="admission-doc-blocks-editor">
      {!validation.ok && (
        <div className="mb-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-xs font-bold text-red-600">
          <p>문서 구조 검증 실패 — 저장하기 전에 고쳐야 합니다:</p>
          <ul className="mt-1 list-disc pl-4">
            {validation.errors.map((error, idx) => (
              <li key={idx}>{error}</li>
            ))}
          </ul>
        </div>
      )}

      {blocks.map((block, idx) => (
        <div key={idx} className="mb-4 rounded border border-[#e5e7eb]">
          <div className="flex items-center justify-between gap-2 border-b border-[#e5e7eb] bg-[#f9fafb] px-2 py-1">
            <span className="text-[11px] font-bold text-gray-500">
              #{idx + 1} {block.kind}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => moveBlockUpDown(idx, -1)}
                disabled={idx === 0}
                aria-label={`블록 ${idx + 1} 위로`}
                className="text-xs disabled:text-gray-300"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => moveBlockUpDown(idx, 1)}
                disabled={idx === blocks.length - 1}
                aria-label={`블록 ${idx + 1} 아래로`}
                className="text-xs disabled:text-gray-300"
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() => removeBlock(idx)}
                aria-label={`블록 ${idx + 1} 삭제`}
                className="text-xs font-bold text-red-500"
              >
                블록 삭제
              </button>
            </div>
          </div>
          <AdmissionBlockEditor section={section} block={block} onChange={(next) => updateBlock(idx, next)} />
        </div>
      ))}

      <div className="flex items-center gap-2">
        <select
          value={addKind}
          onChange={(e) => setAddKind(e.target.value)}
          aria-label="추가할 블록 종류"
          className="border border-[#d7d7d7] px-1 py-1 text-xs"
        >
          {ADDABLE_KINDS.map((k) => (
            <option key={k.kind} value={k.kind}>
              {k.label}
            </option>
          ))}
        </select>
        <button type="button" onClick={addBlock} className="text-xs font-bold text-[#2348ff]">
          + 블록 추가
        </button>
      </div>
    </div>
  );
}
