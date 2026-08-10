// 본문 렌더 회귀 확인용 fixture. 손으로 작성한 BlockNote 블록 JSON 샘플.
// 지원 블록 전 타입 + table + javascript: 링크를 포함한다.
// (자체 매핑 렌더러는 폐기됐고 본문은 BlockNote 자체 렌더 경로가 그린다 — 링크 위생은 BlockNote가 담당.)
// galleries.content_json 저장 형태와 동일하게 { v, editor, blocks } 로 감싼다.

export const columnBlocksSample = {
  v: 1,
  editor: 'blocknote@0.52.1',
  blocks: [
    {
      id: 'p-intro',
      type: 'paragraph',
      props: {},
      content: [
        { type: 'text', text: '이 문단은 ', styles: {} },
        { type: 'text', text: '볼드', styles: { bold: true } },
        { type: 'text', text: '와 ', styles: {} },
        { type: 'text', text: '기울임', styles: { italic: true } },
        { type: 'text', text: ', ', styles: {} },
        { type: 'text', text: '밑줄', styles: { underline: true } },
        { type: 'text', text: ', ', styles: {} },
        { type: 'text', text: '취소선', styles: { strike: true } },
        { type: 'text', text: ', ', styles: {} },
        { type: 'text', text: '고지 문구', styles: { textColor: 'gray' } },
        { type: 'text', text: '를 포함한다.', styles: {} }
      ],
      children: []
    },
    {
      id: 'p-link-safe',
      type: 'paragraph',
      props: {},
      content: [
        { type: 'text', text: '정상 링크: ', styles: {} },
        {
          type: 'link',
          href: 'https://uwellnow.com',
          content: [{ type: 'text', text: '유웰나우 홈페이지', styles: {} }]
        }
      ],
      children: []
    },
    {
      id: 'p-link-unsafe',
      type: 'paragraph',
      props: {},
      content: [
        { type: 'text', text: '위험 링크(텍스트만 남아야 함): ', styles: {} },
        {
          type: 'link',
          href: '\njavascript:alert(1)',
          content: [{ type: 'text', text: '클릭 금지', styles: {} }]
        }
      ],
      children: []
    },
    {
      id: 'h2-plain',
      type: 'heading',
      props: { level: 2 },
      content: [{ type: 'text', text: '제목 (큰) — 일반', styles: {} }],
      children: []
    },
    {
      id: 'h2-band',
      type: 'heading',
      props: { level: 2, backgroundColor: 'green' },
      content: [{ type: 'text', text: '제목 (큰) — 밴드(풀폭 배경)', styles: {} }],
      children: []
    },
    {
      id: 'h3-plain',
      type: 'heading',
      props: { level: 3 },
      content: [{ type: 'text', text: '제목 (작은) — 일반', styles: {} }],
      children: []
    },
    {
      id: 'h3-highlight',
      type: 'heading',
      props: { level: 3, backgroundColor: 'green' },
      content: [{ type: 'text', text: '제목 (작은) — 하이라이트(텍스트폭 배경)', styles: {} }],
      children: []
    },
    {
      id: 'bullet-1',
      type: 'bulletListItem',
      props: {},
      content: [{ type: 'text', text: '글머리 목록 항목 1', styles: {} }],
      children: []
    },
    {
      id: 'bullet-2',
      type: 'bulletListItem',
      props: {},
      content: [{ type: 'text', text: '글머리 목록 항목 2', styles: {} }],
      children: []
    },
    {
      id: 'number-1',
      type: 'numberedListItem',
      props: {},
      content: [{ type: 'text', text: '번호 목록 항목 1', styles: {} }],
      children: []
    },
    {
      id: 'number-2',
      type: 'numberedListItem',
      props: {},
      content: [{ type: 'text', text: '번호 목록 항목 2', styles: {} }],
      children: []
    },
    {
      id: 'quote-1',
      type: 'quote',
      props: {},
      content: [{ type: 'text', text: '인용문 샘플입니다. 좌측 보더로 표현합니다.', styles: {} }],
      children: []
    },
    {
      id: 'divider-1',
      type: 'divider',
      props: {},
      content: undefined,
      children: []
    },
    {
      id: 'image-1',
      type: 'image',
      props: {
        url: 'https://placehold.co/1200x600',
        caption: '이미지 캡션 샘플',
        alt: '샘플 이미지 대체 텍스트',
        previewWidth: 1200
      },
      content: undefined,
      children: []
    },
    {
      id: 'callout-1',
      type: 'callout',
      props: { icon: '💡' },
      content: [{ type: 'text', text: '강조 박스 샘플입니다.', styles: {} }],
      children: []
    },
    {
      id: 'table-unsupported',
      type: 'table',
      props: {},
      content: {
        type: 'tableContent',
        rows: [
          {
            cells: [
              [{ type: 'text', text: '헤더1', styles: { bold: true } }],
              [{ type: 'text', text: '헤더2', styles: { bold: true } }]
            ]
          },
          {
            cells: [[{ type: 'text', text: '값1', styles: {} }], [{ type: 'text', text: '값2', styles: {} }]]
          }
        ]
      },
      children: []
    },
    {
      id: 'p-outro',
      type: 'paragraph',
      props: {},
      content: [{ type: 'text', text: '표(table)는 미지원 타입이라 위에서 문단 폴백으로 렌더된다.', styles: {} }],
      children: []
    }
  ]
};
