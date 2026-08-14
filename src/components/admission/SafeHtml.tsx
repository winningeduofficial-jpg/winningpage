import { Fragment, type ReactNode } from "react";

type AllowedTag =
  | "div"
  | "span"
  | "p"
  | "br"
  | "b"
  | "strong"
  | "em"
  | "pre"
  | "ul"
  | "ol"
  | "li"
  | "table"
  | "thead"
  | "tbody"
  | "tr"
  | "th"
  | "td"
  | "section"
  | "h3"
  | "a"
  | "img";

// dangerouslySetInnerHTML을 대체하는 화이트리스트 렌더러.
// DOMParser로 문자열을 파싱한 뒤 재귀적으로 React 엘리먼트로 변환한다.
// 내부적으로도 dangerouslySetInnerHTML을 쓰지 않는다 — 쓰면 이 컴포넌트의 존재 이유가 사라진다.
// 외부 의존성 0 (DOMPurify 등 미도입).
//
// 보안 감사(2026-08-06) 반영 이력 — 지적 5건, 전부 저심각도(XSS 우회
// 페이로드 0건, 판정: "현행 dangerouslySetInnerHTML 대비 실질적 개선"):
//   1. STRIP_SUBTREE_TAGS에 title/textarea/noembed/noframes/xmp/plaintext/
//      template/noscript 추가 — RAWTEXT/RCDATA 콘텐츠 스푸핑, noscript
//      scripting-flag 역전 방어.
//   2. html 길이 상한(MAX_HTML_LENGTH) + 변환 노드 수 상한(MAX_NODE_COUNT) —
//      폭(breadth) 폭탄 방어. 초과 시 예외를 던지지 않고 평문(<pre>)으로
//      격하한다.
//   3. 깊이 상한 초과 시 node.textContent를 그대로 반환하지 않는다(빈
//      문자열로 격하) — STRIP_SUBTREE_TAGS 검사보다 깊이 검사가 늦게
//      걸리는 조상 노드를 거치면 script/style 내용이 텍스트로 새던 문제.
//   4. ATTR_TO_PROP를 Object.create(null) 기반으로 바꿔 prototype 체인
//      조회(constructor/__proto__ 등)를 원천 차단.
//   5. parseDocument 테스트 훅을 SafeHtml 컴포넌트 props에서 빼고
//      sanitizeToReact(html, parseDocument) 별도 export로 분리 — 프로덕션
//      표면에 테스트 전용 prop을 남기지 않는다.
//
// CompanyNews/Events 본문 sanitize 도입(2026-08-14) — a/img 지원 추가:
//   기존엔 <a>/<img>가 화이트리스트 밖이라 <a>는 unwrap(텍스트만 유지),
//   <img>는 자식이 없어 항상 사라졌다(2번 테스트가 그 동작을 golden으로
//   고정하고 있었다). CMS 본문(회사소식/공지) 텍스트에어리어에 관리자가
//   붙여넣는 링크·이미지를 살리기 위해 태그 자체는 허용하되, href/src는
//   isSafeUrl로 스킴을 검사해 javascript:/data: 등 실행형 스킴만 통과
//   못 시킨다(값 자체를 버림 — 중화가 아니라 제거). <a>는 href가 살아있을
//   때만 target="_blank" rel="noopener noreferrer"를 강제로 붙인다(작성자가
//   준 target/rel 값은 신뢰하지 않는다 — KeyValueView.jsx의 기존 관례와
//   동일). 대입 모집요강 rawHtml 골든 코퍼스(verify-admission-doc-equivalence.mjs
//   Gate B)에는 a/img 태그가 없어 이 확장이 그 계약을 건드리지 않는다
//   (재확인 완료, 2506/2506 그대로 통과).

// 허용 태그 — 이 외 전부 제거(단, 자식은 unwrap으로 승계).
const ALLOWED_TAGS = new Set([
  "div",
  "span",
  "p",
  "br",
  "b",
  "strong",
  "em",
  "pre",
  "ul",
  "ol",
  "li",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "section",
  "h3",
  "a",
  "img",
]);

// href/src에 허용하는 URL 스킴. javascript:/data:/vbscript: 등 실행형·
// 페이로드형 스킴을 차단한다. 스킴이 없는 값(상대경로 "/foo", "foo.html",
// "#anchor", protocol-relative "//host/foo")은 스크립트를 실행할 수 없으므로
// 그대로 허용한다.
const SAFE_URL_SCHEMES = new Set(["http:", "https:", "mailto:", "tel:"]);

function isSafeUrl(rawValue: unknown): boolean {
  const value = String(rawValue || "").trim();
  if (!value) return false;
  // 제어 문자로 스킴을 흐리는 우회("java\tscript:")를 막기 위해 검사 전
  // ASCII 제어문자를 제거한다 — 브라우저 URL 파서의 관례와 동일하다.
  // biome-ignore lint/suspicious/noControlCharactersInRegex: URL 스킴 우회(예: "java\tscript:") 방어가 목적이라 제어문자 자체를 매치 대상으로 써야 한다.
  const normalized = value.replace(/[\x00-\x1f\x7f]/g, "");
  const schemeMatch = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(normalized);
  if (!schemeMatch) return true;
  return SAFE_URL_SCHEMES.has(`${schemeMatch[1].toLowerCase()}:`);
}

// 태그 자체뿐 아니라 자식 서브트리까지 통째로 버려야 하는 태그.
// - script/style/iframe/object/embed/svg: 기존 5종 + svg(실행/임베드 표면).
// - title/textarea/noembed/noframes/xmp/plaintext: RAWTEXT·RCDATA 콘텐츠
//   모델 — 브라우저는 이 안을 항상 "단일 텍스트 노드"로 파싱하므로, 이
//   태그가 화이트리스트 밖이라 unwrap되면 <img onerror=...> 같은 마크업이
//   "실행되지 않되 리터럴 텍스트로 노출"된다(콘텐츠 스푸핑). 통째로 버려
//   그 가능성 자체를 없앤다.
// - noscript: DOMParser는 scripting flag가 꺼져 있어 내용을 "요소"로
//   파싱한다 — 브라우저에서 <noscript>는 스크립팅이 켜져 있으면 안 보여야
//   할 대체 콘텐츠인데, unwrap하면 작성자 의도와 정반대로 항상 렌더된다.
// - template: 브라우저는 <template> 콘텐츠를 .content(별도 DocumentFragment)로
//   옮기므로 일반 childNodes로는 애초에 안 보인다 — 이미 안전하지만 의도를
//   명시적으로 못박기 위해 넣는다.
const STRIP_SUBTREE_TAGS = new Set([
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "svg",
  "title",
  "textarea",
  "noembed",
  "noframes",
  "xmp",
  "plaintext",
  "template",
  "noscript",
]);

// 허용 속성 화이트리스트 — 이 3개만 통과한다. on*/href/src/style/srcset/data-* 등은 전량 차단.
// Object.create(null) 기반 — constructor/__proto__ 등 Object.prototype 체인
// 조회를 원천 차단한다(감사 지적 4번). 일반 객체 리터럴이면
// ATTR_TO_PROP['constructor']가 Object 함수로 truthy 평가돼 통과선을 가짜로
// 넘을 수 있었다(React가 이후 걸러내 실제 출력엔 영향 없었지만 가드 자체가 없었다).
const ATTR_TO_PROP: Record<string, string> = Object.assign(
  Object.create(null),
  {
    class: "className",
    colspan: "colSpan",
    rowspan: "rowSpan",
  },
);

// 악의적 중첩(예: <div><div><div>...) 방어용 재귀 깊이 상한.
const MAX_DEPTH = 100;

// 폭(breadth) 폭탄 방어. 실측(.golden-cache/admission-html-golden.full.json,
// 2026-08-06 기준 2834개 셀 전수): 최대 문자열 길이 39,658자(전남대학교(광주)
// recruitment_quota), p99 30,612자. 512KB는 실측 최대치의 13배 이상 여유다.
const MAX_HTML_LENGTH = 512 * 1024;

// 같은 실측 코퍼스 기준 셀 하나의 최대 태그 수(대략치, <태그 개수 카운트)는
// 1,765개(전남대학교(광주) recruitment_quota). 50,000은 그 28배 이상 여유다.
// 관리자가 HWP 변환 결과를 잘못 붙여넣는 등 "실수로" 발생 가능한 사고를
// 막는 게 목적이라 정상 데이터 여유를 넉넉히 뒀다.
const MAX_NODE_COUNT = 50000;

const NODE_TYPE = { ELEMENT: 1, TEXT: 3, COMMENT: 8 };

class SafeHtmlBudgetExceededError extends Error {}

function convertAttributes(
  element: Element,
  tagName: string,
): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  const attributes = element.attributes;
  if (attributes) {
    for (let i = 0; i < attributes.length; i += 1) {
      const attr = attributes[i];
      const name = String(attr.name || "").toLowerCase();
      // href/src는 값 자체를 스킴 검사한다 — 통과하면 값을 그대로 쓰고,
      // 안 통과하면 속성 자체를 아예 넣지 않는다(중화가 아니라 제거).
      if (name === "href" && tagName === "a") {
        if (isSafeUrl(attr.value)) props.href = attr.value;
        continue;
      }
      if (name === "src" && tagName === "img") {
        if (isSafeUrl(attr.value)) props.src = attr.value;
        continue;
      }
      if (name === "alt" && tagName === "img") {
        props.alt = attr.value;
        continue;
      }
      const prop = ATTR_TO_PROP[name];
      if (!prop) continue;
      props[prop] = attr.value;
    }
  }
  // href가 실제로 살아있는 <a>만 target/rel을 강제로 붙인다 — 작성자가 준
  // target/rel 값은 신뢰하지 않는다(탭내빙 방지). href가 없거나 스킴 검사에
  // 걸러졌으면 붙이지 않는다(빈 <a>는 하이퍼링크가 아니라 그냥 인라인
  // 텍스트 래퍼다).
  if (tagName === "a" && props.href) {
    props.target = "_blank";
    props.rel = "noopener noreferrer";
  }
  return props;
}

interface ConvertBudget {
  count: number;
}

function convertChildNodes(
  childNodes: NodeListOf<ChildNode> | undefined,
  depth: number,
  keyPrefix: string,
  budget: ConvertBudget,
): ReactNode[] {
  const nodes = childNodes || [];
  const children: ReactNode[] = [];
  for (let i = 0; i < nodes.length; i += 1) {
    const converted = convertNode(nodes[i], depth, `${keyPrefix}-${i}`, budget);
    if (converted === null || converted === undefined) continue;
    children.push(converted);
  }
  return children;
}

function convertNode(
  node: Node | null | undefined,
  depth: number,
  key: string,
  budget: ConvertBudget,
): ReactNode {
  if (!node) return null;

  if (node.nodeType === NODE_TYPE.TEXT) {
    return node.textContent || (node as CharacterData).data || "";
  }

  // 주석 노드는 제거.
  if (node.nodeType !== NODE_TYPE.ELEMENT) {
    return null;
  }

  budget.count += 1;
  if (budget.count > MAX_NODE_COUNT) {
    throw new SafeHtmlBudgetExceededError(
      `노드 수가 상한(${MAX_NODE_COUNT})을 초과했습니다.`,
    );
  }

  const element = node as Element;
  const tagName = String(element.tagName || "").toLowerCase();

  // script/style/iframe/object/embed/svg/title/textarea/noembed/noframes/
  // xmp/plaintext/template/noscript는 자식까지 통째로 버린다.
  if (STRIP_SUBTREE_TAGS.has(tagName)) {
    return null;
  }

  // 깊이 상한 초과 시 서브트리를 통째로 버린다(빈 문자열). node.textContent를
  // 반환하면 STRIP_SUBTREE_TAGS 검사(위)를 거치지 않은 채 그 서브트리 안의
  // script/style 내용이 텍스트로 새어나갈 수 있다(감사 지적 3번) — 깊이
  // 상한은 애초에 정상 데이터가 절대 도달하지 않는 방어선이므로, 내용을
  // 보존하지 않고 완전히 버리는 쪽이 안전하다.
  if (depth > MAX_DEPTH) {
    return "";
  }

  const children = convertChildNodes(
    element.childNodes as NodeListOf<ChildNode>,
    depth + 1,
    key,
    budget,
  );

  if (!ALLOWED_TAGS.has(tagName)) {
    // 화이트리스트 밖 태그: 태그는 버리되 자식은 살린다(unwrap).
    if (children.length === 0) return null;
    if (children.length === 1) return children[0];
    return <Fragment key={key}>{children}</Fragment>;
  }

  const props = convertAttributes(element, tagName);

  // br/img는 HTML void 요소다 — DOMParser도 childNodes를 항상 비워서
  // 주지만(children은 always []), 여기서도 JSX void 규칙을 명시적으로
  // 지킨다(React가 img에 children을 넘기면 경고한다).
  // ALLOWED_TAGS 통과분만 여기 오므로 안전한 캐스트다(위 화이트리스트가 정본).
  const Tag = tagName as AllowedTag;
  if (tagName === "br" || tagName === "img") {
    return <Tag key={key} {...props} />;
  }

  return (
    <Tag key={key} {...props}>
      {children}
    </Tag>
  );
}

function isEffectivelyEmpty(children: ReactNode[]): boolean {
  return children.every(
    (child) => typeof child === "string" && child.trim() === "",
  );
}

// 크기/노드 수 상한을 넘겨 평문으로 격하할 때 쓰는 텍스트 추출기.
// STRIP_SUBTREE_TAGS는 여기서도 동일하게 존중한다 — script/style 등의
// 내용이 "격하됐으니까 안전"이라는 착각으로 텍스트에 새면 안 된다.
function extractSafeText(node: Node | null | undefined, depth = 0): string {
  if (!node) return "";

  if (node.nodeType === NODE_TYPE.TEXT) {
    return node.textContent || (node as CharacterData).data || "";
  }
  if (node.nodeType !== NODE_TYPE.ELEMENT) return "";

  const element = node as Element;
  const tagName = String(element.tagName || "").toLowerCase();
  if (STRIP_SUBTREE_TAGS.has(tagName)) return "";
  if (depth > MAX_DEPTH) return "";

  const nodes = element.childNodes || [];
  let text = "";
  for (let i = 0; i < nodes.length; i += 1) {
    text += extractSafeText(nodes[i], depth + 1);
  }
  return text;
}

function defaultParseDocument(html: string): Document | null {
  if (typeof DOMParser === "undefined") return null;
  return new DOMParser().parseFromString(html, "text/html");
}

/**
 * html 문자열을 화이트리스트 규칙에 따라 React 자식으로 변환한다.
 * SafeHtml 컴포넌트의 실제 로직이며, 프로덕션 표면(컴포넌트 props)에
 * parseDocument 테스트 훅을 남기지 않기 위해 별도 export로 분리했다
 * (감사 지적 5번). parseDocument는 브라우저 외 환경(노드 검증 스크립트
 * 등)에서 DOMParser 대용 파서를 주입하는 용도로만 쓴다 — 생략하면 브라우저
 * DOMParser를 쓴다.
 *
 * null이면 렌더할 게 없다는 뜻. degraded=true면 children은 이미 문자열(평문 격하 결과)이다.
 */
export function sanitizeToReact(
  html: string,
  parseDocument?: (html: string) => Document | null,
): { degraded: boolean; children: ReactNode } | null {
  if (!html || !String(html).trim()) return null;
  const source = String(html);

  const parse = parseDocument || defaultParseDocument;
  const doc = parse(source);
  if (!doc) return null;
  const root = doc.body || doc;

  // 크기 상한 초과 — 파싱/변환을 시도하지 않고 바로 평문으로 격하한다.
  if (source.length > MAX_HTML_LENGTH) {
    const text = extractSafeText(root);
    return text.trim() ? { degraded: true, children: text } : null;
  }

  const budget: ConvertBudget = { count: 0 };
  let children: ReactNode[];
  try {
    children = convertChildNodes(root.childNodes, 0, "safe-html", budget);
  } catch (err) {
    if (!(err instanceof SafeHtmlBudgetExceededError)) throw err;
    // 노드 수 상한 초과 — 이미 만든 부분 트리는 버리고 평문으로 격하한다.
    const text = extractSafeText(root);
    return text.trim() ? { degraded: true, children: text } : null;
  }

  if (children.length === 0 || isEffectivelyEmpty(children)) return null;

  return { degraded: false, children };
}

/**
 * className이 없으면 정상(비degraded) 경로에서는 감싸는 <div>를 만들지
 * 않고 Fragment로 자식만 반환한다(2026-08-06 감사 반영) — 호출부가 이미
 * 자기 래퍼(admission-existing-html/admission-raw-section-wrap)를 문자열에
 * 갖고 있는 html을 넘길 때(AdmissionGuidelines.jsx의 resolveInfoContent가
 * 그렇다), SafeHtml이 불필요한 빈 래퍼 div까지 하나 더 얹지 않게 하기
 * 위함이다. degraded(평문 격하) 경로는 <pre>의 공백 보존 의미가 필요해
 * className 유무와 무관하게 항상 <pre>를 유지한다.
 */
export default function SafeHtml({
  html,
  className,
}: {
  html: string;
  className?: string;
}) {
  const result = sanitizeToReact(html);
  if (!result) return null;

  if (result.degraded) {
    return <pre className={className}>{result.children}</pre>;
  }

  if (!className) {
    return <>{result.children}</>;
  }

  return <div className={className}>{result.children}</div>;
}
