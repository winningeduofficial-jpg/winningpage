import { useMemo, useState } from 'react';
import AdmissionBlockEditor from './AdmissionBlockEditor';
import { validateBlocks } from './tableEditorValidation';
import * as docOps from './docBlockOperations';

const KIND_LABELS = {
  table: '표(table, generic 2컬럼으로 시작)',
  note: '안내 문구(note)',
  emptyBox: '빈 상태 박스(emptyBox)',
  heading: '소제목(heading)',
  plainList: '목록(plainList)',
  preText: '원문 텍스트(preText)',
  footnote: '각주(footnote)'
};

// AdmissionDoc.blocks 배열 전체를 편집하는 최상위 컴포넌트. controlled —
// blocks/onChange만 받는다. universityName/sectionLabel은 하위 table
// 블록의 xlsx 파일명 구성용으로 그대로 흘려보낸다(선택 — 없어도 동작).
//
// "블록 추가" 선택지는 section별로 제한한다(docBlockOperations.js의
// getAddableKindsForSection — admissionParsing.js의 doc 생성기가 실제로
// 만드는 종류만 기본 노출). renderDocToHtml이 그 조합 밖에서 정보를
// 잃거나 예외를 던지는 걸 실제로 재현 확인했기 때문이다(bc6f689) — 제한
// 밖 종류는 "고급" 토글 뒤에 두고, 선택 시 경고를 보여준다.
export default function DocBlocksEditor({ section, blocks, onChange, universityName, sectionLabel }) {
  const { primary, advanced } = useMemo(() => docOps.getAddableKindsForSection(section), [section]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [addKind, setAddKind] = useState(primary[0] || advanced[0]);
  const validation = useMemo(() => validateBlocks(section, blocks), [section, blocks]);

  const visibleKinds = showAdvanced ? [...primary, ...advanced] : primary;
  const isAdvancedKindSelected = advanced.includes(addKind);

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
          <AdmissionBlockEditor
            section={section}
            block={block}
            onChange={(next) => updateBlock(idx, next)}
            universityName={universityName}
            sectionLabel={sectionLabel}
          />
        </div>
      ))}

      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <select
            value={addKind}
            onChange={(e) => setAddKind(e.target.value)}
            aria-label="추가할 블록 종류"
            className="border border-[#d7d7d7] px-1 py-1 text-xs"
          >
            {visibleKinds.map((kind) => (
              <option key={kind} value={kind}>
                {KIND_LABELS[kind] || kind}
              </option>
            ))}
          </select>
          <button type="button" onClick={addBlock} className="text-xs font-bold text-[#2348ff]">
            + 블록 추가
          </button>
          {advanced.length > 0 && (
            <label className="ml-2 flex items-center gap-1 text-[11px] font-bold text-gray-500">
              <input
                type="checkbox"
                checked={showAdvanced}
                onChange={(e) => {
                  setShowAdvanced(e.target.checked);
                  if (!e.target.checked && advanced.includes(addKind)) setAddKind(primary[0] || advanced[0]);
                }}
              />
              고급(이 섹션에 흔치 않은 블록도 표시)
            </label>
          )}
        </div>
        {showAdvanced && isAdvancedKindSelected && (
          <p className="text-[11px] font-bold text-amber-600">
            이 블록은 이 섹션에서 잘 쓰이지 않는 종류입니다 — 문서에는 저장되지만 공개 페이지 HTML 미러에는
            반영되지 않거나 정보가 누락될 수 있습니다.
          </p>
        )}
      </div>
    </div>
  );
}
