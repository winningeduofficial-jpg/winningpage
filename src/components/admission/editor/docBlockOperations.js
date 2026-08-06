// Block 배열(문서 전체) 순서 변경·추가·삭제를 순수 함수로 분리 —
// tableBlockOperations.js와 같은 이유로 컴포넌트(DocBlocksEditor.jsx)와
// 검증 스크립트가 공유한다.

export function updateBlockAt(blocks, idx, nextBlock) {
  return blocks.map((b, i) => (i === idx ? nextBlock : b));
}

export function removeBlockAt(blocks, idx) {
  return blocks.filter((_, i) => i !== idx);
}

export function moveBlock(blocks, idx, delta) {
  const targetIdx = idx + delta;
  if (targetIdx < 0 || targetIdx >= blocks.length) return blocks;
  const next = blocks.slice();
  const [moved] = next.splice(idx, 1);
  next.splice(targetIdx, 0, moved);
  return next;
}

export function appendBlock(blocks, block) {
  return [...blocks, block];
}

// 새 블록 종류별 기본값. 'table'은 컬럼 수 비고정인 'generic' variant
// 2컬럼으로 시작한다(고정 5종은 처음부터 잘못된 컬럼 수로 만들면 바로
// 검증 실패가 뜨므로 시작점으로 부적절 — generic은 어떤 컬럼 수도
// 허용된다). 'group'(GroupBlock, 중첩 컨테이너)과 'rawHtml'은 이
// 편집기에서 새로 만들지 않는다(중첩·레거시 승계 전용, 범위 밖).
export function createDefaultBlock(kind) {
  switch (kind) {
    case 'note':
      return { kind: 'note', text: '' };
    case 'emptyBox':
      return { kind: 'emptyBox', message: '' };
    case 'heading':
      return { kind: 'heading', text: '' };
    case 'plainList':
      return { kind: 'plainList', items: [] };
    case 'preText':
      return { kind: 'preText', text: '' };
    case 'footnote':
      return { kind: 'footnote', items: [] };
    case 'table':
      return {
        kind: 'table',
        variant: 'generic',
        columns: [
          { role: 'type', label: '구분' },
          { role: 'content', label: '내용' }
        ],
        rows: []
      };
    default:
      return null;
  }
}
