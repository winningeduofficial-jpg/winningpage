import { Fragment } from 'react';

// dangerouslySetInnerHTML을 대체하는 화이트리스트 렌더러.
// DOMParser로 문자열을 파싱한 뒤 재귀적으로 React 엘리먼트로 변환한다.
// 내부적으로도 dangerouslySetInnerHTML을 쓰지 않는다 — 쓰면 이 컴포넌트의 존재 이유가 사라진다.
// 외부 의존성 0 (DOMPurify 등 미도입).

// 허용 태그 — 이 외 전부 제거(단, 자식은 unwrap으로 승계).
const ALLOWED_TAGS = new Set([
  'div',
  'span',
  'p',
  'br',
  'b',
  'strong',
  'em',
  'pre',
  'ul',
  'ol',
  'li',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'section',
  'h3'
]);

// 태그 자체뿐 아니라 자식 서브트리까지 통째로 버려야 하는 태그.
const STRIP_SUBTREE_TAGS = new Set(['script', 'style', 'iframe', 'object', 'embed', 'svg']);

// 허용 속성 화이트리스트 — 이 3개만 통과한다. on*/href/src/style/srcset/data-* 등은 전량 차단.
const ATTR_TO_PROP = {
  class: 'className',
  colspan: 'colSpan',
  rowspan: 'rowSpan'
};

// 악의적 중첩(예: <div><div><div>...) 방어용 재귀 깊이 상한.
const MAX_DEPTH = 100;

const NODE_TYPE = { ELEMENT: 1, TEXT: 3, COMMENT: 8 };

function convertAttributes(element) {
  const props = {};
  const attributes = element.attributes;
  if (!attributes) return props;
  for (let i = 0; i < attributes.length; i += 1) {
    const attr = attributes[i];
    const name = String(attr.name || '').toLowerCase();
    const prop = ATTR_TO_PROP[name];
    if (!prop) continue;
    props[prop] = attr.value;
  }
  return props;
}

function convertChildNodes(childNodes, depth, keyPrefix) {
  const nodes = childNodes || [];
  const children = [];
  for (let i = 0; i < nodes.length; i += 1) {
    const converted = convertNode(nodes[i], depth, `${keyPrefix}-${i}`);
    if (converted === null || converted === undefined) continue;
    children.push(converted);
  }
  return children;
}

function convertNode(node, depth, key) {
  if (!node) return null;

  if (node.nodeType === NODE_TYPE.TEXT) {
    return node.textContent || node.data || '';
  }

  // 주석 노드는 제거.
  if (node.nodeType !== NODE_TYPE.ELEMENT) {
    return null;
  }

  const tagName = String(node.tagName || '').toLowerCase();

  // script/style/iframe/object/embed/svg는 자식까지 통째로 버린다.
  if (STRIP_SUBTREE_TAGS.has(tagName)) {
    return null;
  }

  // 깊이 상한 초과 시 서브트리를 텍스트로 격하한다(재귀 폭탄 방어).
  if (depth > MAX_DEPTH) {
    return node.textContent || '';
  }

  const children = convertChildNodes(node.childNodes, depth + 1, key);

  if (!ALLOWED_TAGS.has(tagName)) {
    // 화이트리스트 밖 태그: 태그는 버리되 자식은 살린다(unwrap).
    if (children.length === 0) return null;
    if (children.length === 1) return children[0];
    return <Fragment key={key}>{children}</Fragment>;
  }

  const props = convertAttributes(node);

  if (tagName === 'br') {
    return <br key={key} {...props} />;
  }

  const Tag = tagName;
  return (
    <Tag key={key} {...props}>
      {children}
    </Tag>
  );
}

function isEffectivelyEmpty(children) {
  return children.every((child) => typeof child === 'string' && child.trim() === '');
}

function defaultParseDocument(html) {
  if (typeof DOMParser === 'undefined') return null;
  return new DOMParser().parseFromString(html, 'text/html');
}

/**
 * @param {{ html: string, className?: string, parseDocument?: (html: string) => Document }} props
 * parseDocument는 브라우저 외 환경(노드 검증 스크립트 등)에서 DOMParser 대용 파서를 주입하기 위한 훅이다.
 * 프로덕션에서는 생략하면 브라우저 DOMParser를 사용한다.
 */
export default function SafeHtml({ html, className, parseDocument }) {
  if (!html || !String(html).trim()) return null;

  const parse = parseDocument || defaultParseDocument;
  const doc = parse(html);
  if (!doc) return null;

  const root = doc.body || doc;
  const children = convertChildNodes(root.childNodes, 0, 'safe-html');

  if (children.length === 0 || isEffectivelyEmpty(children)) return null;

  return <div className={className}>{children}</div>;
}
