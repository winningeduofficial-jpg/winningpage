import { Fragment } from 'react';

// 블록 JSON(BlockNote 0.52.1 document) -> React 컴포넌트 매핑 렌더러.
// dangerouslySetInnerHTML 사용 금지 — 전부 태그 직접 매핑.

const SAFE_LINK = /^(https?:\/\/|mailto:|tel:|\/)/i;

function safeHref(href) {
  const v = String(href || '').trim(); // trim 먼저 — \njavascript: 우회 방지
  return SAFE_LINK.test(v) ? v : undefined;
}

function inlineStyleClasses(styles = {}) {
  const classes = [];
  if (styles.bold) classes.push('font-semibold');
  if (styles.italic) classes.push('italic');
  if (styles.underline) classes.push('underline');
  if (styles.strike) classes.push('line-through');
  if (styles.textColor && styles.textColor !== 'default') classes.push('text-[#7A7A7A]');
  return classes.join(' ');
}

function renderInlineItem(item, key) {
  if (!item) return null;

  if (item.type === 'link') {
    const href = safeHref(item.href);
    const inner = renderInlineContent(item.content);
    if (!href) return <Fragment key={key}>{inner}</Fragment>;
    return (
      <a key={key} href={href} className="text-[#013262] underline" target="_blank" rel="noreferrer">
        {inner}
      </a>
    );
  }

  const text = item.type === 'text' ? item.text : item.text;
  const classes = inlineStyleClasses(item.styles);
  if (!classes) return <Fragment key={key}>{text}</Fragment>;
  return (
    <span key={key} className={classes}>
      {text}
    </span>
  );
}

// table류(스키마엔 있으나 렌더러 미지원)는 content가 { rows: [{ cells: [...] }] } 형태다.
// 폴백에서 최소한 셀 텍스트라도 살리기 위해 인라인 배열로 펴 준다.
function toInlineArray(content) {
  if (Array.isArray(content)) return content;
  if (content && Array.isArray(content.rows)) {
    const flat = [];
    content.rows.forEach((row, ri) => {
      if (ri > 0) flat.push({ type: 'text', text: ' / ', styles: {} });
      (row.cells || []).forEach((cell, ci) => {
        const cellContent = Array.isArray(cell) ? cell : cell?.content;
        if (Array.isArray(cellContent)) {
          if (ci > 0) flat.push({ type: 'text', text: ' | ', styles: {} });
          flat.push(...cellContent);
        }
      });
    });
    return flat;
  }
  return null;
}

function renderInlineContent(content) {
  const items = toInlineArray(content);
  if (!items || items.length === 0) return null;
  return items.map((item, i) => renderInlineItem(item, i));
}

function ParagraphBlock({ block }) {
  return <p className="mb-3">{renderInlineContent(block.content)}</p>;
}

function HeadingBlock({ block }) {
  const level = block.props?.level;
  const backgroundColor = block.props?.backgroundColor;
  const inline = renderInlineContent(block.content);

  // BlockNote는 배경을 지정하지 않아도 backgroundColor prop을 항상 문자열 'default'로
  // 채워 넣는다. 'default'는 "지정 안 함"을 의미하므로 truthy 판정에서 제외해야 한다.
  const hasBackground = backgroundColor && backgroundColor !== 'default';

  if (level === 2 && hasBackground) {
    // H-B: 본문 measure 풀폭 밴드
    return (
      <h2 className="mb-4 mt-12 block rounded bg-[#E6F1EB] px-3 py-2 text-xl font-semibold leading-[1.3] tracking-[-0.02em] sm:text-2xl">
        {inline}
      </h2>
    );
  }

  if (level === 3 && hasBackground) {
    // H-C: 텍스트 폭에만 배경 — span에 걸어야 줄바꿈 시 각 줄에 배경이 붙는다
    return (
      <h3 className="mb-3 mt-10 text-lg font-semibold leading-[1.3] tracking-[-0.02em] sm:text-xl">
        <span className="rounded-sm bg-[#E6F1EB] px-1.5 py-0.5 [-webkit-box-decoration-break:clone] [box-decoration-break:clone]">
          {inline}
        </span>
      </h3>
    );
  }

  if (level === 3) {
    return (
      <h3 className="mb-3 mt-10 text-lg font-semibold leading-[1.3] tracking-[-0.02em] sm:text-xl">{inline}</h3>
    );
  }

  return (
    <h2 className="mb-4 mt-12 text-xl font-semibold leading-[1.3] tracking-[-0.02em] sm:text-2xl">{inline}</h2>
  );
}

function QuoteBlock({ block }) {
  return <blockquote className="my-6 border-l-4 border-[#525252] pl-6">{renderInlineContent(block.content)}</blockquote>;
}

function DividerBlock() {
  return <hr className="my-10 h-px border-0 bg-[#D7D7D7]" />;
}

function ImageBlock({ block }) {
  const props = block.props || {};
  const src = props.url;
  if (!src) return null;

  const alt = props.alt || props.caption || '';
  const dims = {};
  if (props.previewWidth || props.width) dims.width = props.previewWidth || props.width;
  if (props.height) dims.height = props.height;

  return (
    <figure className="my-8">
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        {...dims}
        className="mx-auto block w-full rounded-xl object-cover"
      />
      {props.caption && <figcaption className="mt-2 text-center text-sm text-[#7A7A7A]">{props.caption}</figcaption>}
    </figure>
  );
}

function CalloutBlock({ block }) {
  const icon = block.props?.icon || '💡';
  return (
    <div className="my-6 flex gap-3 rounded-2xl bg-[#F4F4F4] px-5 py-4 sm:gap-8 sm:px-9 sm:py-5">
      <span className="shrink-0 text-xl" aria-hidden="true">
        {icon}
      </span>
      <div className="flex-1">{renderInlineContent(block.content)}</div>
    </div>
  );
}

const BLOCK_RENDERERS = {
  paragraph: ParagraphBlock,
  heading: HeadingBlock,
  quote: QuoteBlock,
  divider: DividerBlock,
  image: ImageBlock,
  callout: CalloutBlock
};

function renderOwnBlock(block) {
  const Component = BLOCK_RENDERERS[block.type];
  if (!Component) {
    // 슬래시 메뉴에서 뺀 타입(H1·체크리스트·코드블록·토글·표 등)도 스키마에는 남아 있어
    // Notion·워드 붙여넣기로 그대로 생성될 수 있다. 건너뛰지 않고 문단으로 보존한다.
    return <p>{renderInlineContent(block.content)}</p>;
  }
  return <Component block={block} />;
}

// 모든 블록 타입(폴백 포함)이 대상이다 — children을 렌더하는 곳이 renderListGroup
// 한 곳뿐이면 토글·체크리스트 등 그 밖의 블록에 붙은 children이 조용히 사라진다.
// 목록 밖 중첩은 목록과 같은 폭(pl-9)으로 들여써 시각적으로 일관되게 한다.
function renderBlock(block) {
  const nested = renderChildren(block.children, 'pl-9');
  if (!nested) {
    return <Fragment key={block.id}>{renderOwnBlock(block)}</Fragment>;
  }
  return (
    <div key={block.id}>
      {renderOwnBlock(block)}
      {nested}
    </div>
  );
}

function renderChildren(children, extraClass = '') {
  if (!Array.isArray(children) || children.length === 0) return null;
  return <div className={['mt-2', extraClass].filter(Boolean).join(' ')}>{renderBlockList(children)}</div>;
}

function groupBlocks(blocks) {
  const groups = [];
  let currentListType = null;
  let currentItems = [];

  const flushList = () => {
    if (currentListType && currentItems.length > 0) {
      groups.push({ type: 'list', listType: currentListType, items: currentItems });
    }
    currentListType = null;
    currentItems = [];
  };

  for (const block of blocks) {
    if (block.type === 'bulletListItem' || block.type === 'numberedListItem') {
      if (currentListType && currentListType !== block.type) flushList();
      currentListType = block.type;
      currentItems.push(block);
    } else {
      flushList();
      groups.push({ type: 'block', block });
    }
  }
  flushList();

  return groups;
}

function renderListGroup(group, key) {
  const Tag = group.listType === 'bulletListItem' ? 'ul' : 'ol';
  const listClass =
    group.listType === 'bulletListItem' ? 'mb-3 list-outside list-disc pl-9' : 'mb-3 list-outside list-decimal pl-9';

  return (
    <Tag key={key} className={listClass}>
      {group.items.map((item) => (
        <li key={item.id} className="mb-2">
          {renderInlineContent(item.content)}
          {renderChildren(item.children)}
        </li>
      ))}
    </Tag>
  );
}

function renderBlockList(blocks) {
  const groups = groupBlocks(blocks);
  return groups.map((group, i) =>
    group.type === 'list' ? renderListGroup(group, group.items[0]?.id ?? i) : renderBlock(group.block)
  );
}

const RICH_BASE = 'max-w-[45rem] break-keep text-base font-normal leading-8 text-[#525252]';
const PLAIN_BASE = 'max-w-[45rem] whitespace-pre-wrap break-keep text-base font-normal leading-8 text-[#525252]';

export default function ColumnBody({ post, className = '' }) {
  const hasBlocks = post?.content_json?.blocks?.length > 0; // Array.isArray(post.content_json) 아님

  if (!hasBlocks) {
    return <div className={`${PLAIN_BASE} ${className}`}>{post?.content}</div>;
  }

  return <div className={`${RICH_BASE} ${className}`}>{renderBlockList(post.content_json.blocks)}</div>;
}
