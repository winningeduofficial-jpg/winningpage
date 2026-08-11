import { useMemo, useState } from 'react';
import AdmissionBlockEditor from './AdmissionBlockEditor';
import { validateBlocks } from './tableEditorValidation';
import * as docOps from './docBlockOperations';

// 블록 kind → 화면 표기 라벨. 헤더 배지("표 1" 등)와 추가 셀렉트 옵션이
// 이 한 곳만 본다(2026-08-06 사용자 지적으로 헤더는 먼저 한글화됐는데
// 추가 셀렉트는 "표(table, generic 2컬럼으로 시작)" 같은 내부 스키마
// 표기가 그대로 남아 있었다 — 2026-08-08 재지적: "'블록 추가'의 의미를
// 솔직히 파악하기 어려워"). group/rawHtml은 추가 대상은 아니지만
// (ALL_BLOCK_KINDS 밖) 이미 doc에 있을 수 있어 헤더 표기는 필요하다.
// emptyBox는 다른 kind와 달리 원어 라벨을 그대로 줄이지 않고 뜻을
// 풀어 썼다 — "빈 상태 박스"는 그 자체로 무슨 상태인지 짐작하기 어렵다.
const BLOCK_KIND_LABELS = {
  table: '표',
  note: '안내 문구',
  emptyBox: '내용 없음 안내 문구',
  heading: '소제목',
  plainList: '목록',
  preText: '원문 텍스트',
  footnote: '각주',
  group: '그룹',
  rawHtml: '원본 HTML(레거시)'
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

      {blocks.map((block, idx) => {
        const isTable = block.kind === 'table';
        // 표 블록은 카드 껍데기(테두리+헤더바)를 벗긴다 — 표 자체가 이미
        // .admission-scroll-table 테두리를 갖고 있어 이중 테두리였고,
        // "공개 모달과 같은 모양" 요구상 표가 페이지에 바로 앉아야 한다.
        // 블록 조작(순서변경·삭제)은 없앤 게 아니라 우상단 호버 아이콘으로
        // 옮겼다 — group-hover로 평상시엔 숨긴다. 비표 블록(note/footnote
        // 등)은 원래도 작아 카드로 감싸도 무겁지 않으니 그대로 둔다.
        const blockControls = (
          <>
            <button
              type="button"
              onClick={() => moveBlockUpDown(idx, -1)}
              disabled={idx === 0}
              aria-label={`내용 ${idx + 1} 위로`}
              className="text-xs disabled:text-gray-300"
            >
              ↑
            </button>
            <button
              type="button"
              onClick={() => moveBlockUpDown(idx, 1)}
              disabled={idx === blocks.length - 1}
              aria-label={`내용 ${idx + 1} 아래로`}
              className="text-xs disabled:text-gray-300"
            >
              ↓
            </button>
            <button
              type="button"
              onClick={() => removeBlock(idx)}
              aria-label={`내용 ${idx + 1} 삭제`}
              className="text-xs font-bold text-red-500"
            >
              이 내용 삭제
            </button>
          </>
        );

        if (isTable) {
          return (
            <div key={idx} className="group relative mb-4">
              <div className="pointer-events-none absolute right-1 top-1 z-10 flex items-center gap-1 rounded border border-[#e5e7eb] bg-white/95 px-1.5 py-1 opacity-0 shadow-sm transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
                {blockControls}
              </div>
              <AdmissionBlockEditor
                section={section}
                block={block}
                onChange={(next) => updateBlock(idx, next)}
                universityName={universityName}
                sectionLabel={sectionLabel}
              />
            </div>
          );
        }

        // group 카드는 조작 버튼(↑↓/삭제)을 렌더하지 않는다 — 사용자 승인
        // (2026-08-08): 첫 group 삭제·순서 이동이 renderSpecialBlocksHtml의
        // 제목 화이트리스트를 깨 공개 미러를 통째로 무너뜨린다(실측
        // 4053B→165B, 표 6→0). "group 순서·구성을 못 바꾸게 된다"는
        // 트레이드오프는 감수한다. group 내부(표·셀·행·열) 편집은 그대로
        // 살아 있다 — GroupBlockEditor가 이미 렌더하는 안내문("그룹 제목·
        // 구성 변경은 지원하지 않습니다")이 이유를 설명하므로 헤더에
        // 별도 안내를 더 얹지 않는다.
        const isGroup = block.kind === 'group';

        return (
          <div key={idx} className="mb-4 rounded border border-[#e5e7eb]">
            <div className="flex items-center justify-between gap-2 border-b border-[#e5e7eb] bg-[#f9fafb] px-2 py-1">
              <span className="text-[11px] font-bold text-gray-500">
                {BLOCK_KIND_LABELS[block.kind] || block.kind} {idx + 1}
              </span>
              {!isGroup && <div className="flex items-center gap-1">{blockControls}</div>}
            </div>
            <AdmissionBlockEditor
              section={section}
              block={block}
              onChange={(next) => updateBlock(idx, next)}
              universityName={universityName}
              sectionLabel={sectionLabel}
            />
          </div>
        );
      })}

      {/* 3차(구조 변경) — 블록 추가는 드묾. 회색 소형으로 낮추고 위쪽에 구분선. */}
      <div className="flex flex-col gap-1 border-t border-[#e5e7eb] pt-2">
        <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold text-gray-500">
          <select
            value={addKind}
            onChange={(e) => setAddKind(e.target.value)}
            aria-label="추가할 내용 종류"
            className="border border-[#d7d7d7] px-1 py-1 text-[11px] font-normal text-gray-700"
          >
            {visibleKinds.map((kind) => (
              <option key={kind} value={kind}>
                {BLOCK_KIND_LABELS[kind] || kind}
              </option>
            ))}
          </select>
          <button type="button" onClick={addBlock} className="hover:text-gray-700">
            + 내용 추가
          </button>
          {advanced.length > 0 && (
            <label className="ml-2 flex items-center gap-1">
              <input
                type="checkbox"
                checked={showAdvanced}
                onChange={(e) => {
                  setShowAdvanced(e.target.checked);
                  if (!e.target.checked && advanced.includes(addKind)) setAddKind(primary[0] || advanced[0]);
                }}
              />
              고급(이 항목에 잘 안 쓰는 종류도 표시)
            </label>
          )}
        </div>
        {showAdvanced && isAdvancedKindSelected && (
          <p className="text-[11px] font-bold text-amber-600">
            이 내용은 이 항목에서 잘 쓰이지 않는 종류입니다 — 문서에는 저장되지만 공개 페이지 HTML 미러에는
            반영되지 않거나 정보가 누락될 수 있습니다.
          </p>
        )}
      </div>
    </div>
  );
}
