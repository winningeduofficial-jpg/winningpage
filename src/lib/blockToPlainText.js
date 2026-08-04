// BlockNote 블록 배열 -> 평문 추출. 중립 위치(순환 의존 차단용) — columnData.js/ColumnBody.jsx에 두지 않는다.

function textFromInlineArray(content) {
  if (!Array.isArray(content)) return '';

  return content
    .map((item) => {
      if (!item) return '';
      if (item.type === 'text') return item.text || '';
      if (item.type === 'link') return textFromInlineArray(item.content);
      if (typeof item.text === 'string') return item.text;
      if (Array.isArray(item.content)) return textFromInlineArray(item.content);
      return '';
    })
    .join('');
}

// paragraph/heading/quote/callout 등은 content가 인라인 배열이지만,
// table류(스키마엔 있으나 렌더러 미지원)는 { rows: [{ cells: [...] }] } 형태다.
function textFromContent(content) {
  if (Array.isArray(content)) return textFromInlineArray(content);

  if (content && Array.isArray(content.rows)) {
    return content.rows
      .map((row) =>
        (row.cells || [])
          .map((cell) => textFromInlineArray(Array.isArray(cell) ? cell : cell?.content))
          .join(' ')
      )
      .join('\n');
  }

  return '';
}

function blockText(block) {
  if (!block) return '';

  const own = textFromContent(block.content);
  const childTexts = Array.isArray(block.children) ? block.children.map(blockText).filter(Boolean) : [];

  return [own, ...childTexts].filter(Boolean).join('\n');
}

export function blocksToPlainText(blocks) {
  if (!Array.isArray(blocks)) return '';

  // content가 인라인 배열인 블록(문단류)의 빈 결과는 의도된 빈 줄이라 살린다 —
  // 안 그러면 plainTextToBlocks 왕복 시 문단 사이 빈 줄·말미 개행이 사라진다.
  // content가 아예 없는 블록(divider/image 등)의 빈 결과만 버린다.
  return blocks
    .map((block) => ({ text: blockText(block), keepEmpty: Array.isArray(block?.content) }))
    .filter(({ text, keepEmpty }) => text || keepEmpty)
    .map(({ text }) => text)
    .join('\n');
}
