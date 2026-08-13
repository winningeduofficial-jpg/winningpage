// =====================================================================
// SafeHtml 화이트리스트 렌더러 검증 스크립트
//
// SafeHtml.jsx는 브라우저 DOMParser를 전제로 한다. Node에는 DOMParser가
// 없고, jsdom/linkedom/happy-dom 등도 이 저장소에 설치돼 있지 않다
// (설치 금지 지시에 따름 — `ls node_modules/jsdom` 확인 결과 없음).
//
// 따라서 이 스크립트는:
//   1. SafeHtml.jsx가 export하는 sanitizeToReact(html, parseDocument)를
//      직접 호출해, DOMParser API의 아주 좁은 부분집합(nodeType/tagName/
//      attributes/childNodes/textContent)만 구현한 "미니 HTML 파서"를
//      parseDocument로 주입한다. SafeHtml 컴포넌트 자체(default export)는
//      프로덕션 표면에서 parseDocument prop을 뺐으므로(보안 감사 지적 5번,
//      2026-08-06), 컴포넌트 레벨 스모크 테스트 1건만 globalThis.DOMParser
//      셔임으로 별도 검증한다(scripts/verify-admission-block-render.mjs와
//      동일 기법).
//   2. JSX 변환은 npm install 없이, 이 저장소에 이미 설치돼 있는
//      esbuild(vite의 전이 의존성)를 런타임에 사용한다. 변환 결과는
//      node_modules 해석이 되도록 저장소 루트에 임시 파일로 썼다가
//      실행 직후 즉시 삭제한다(os.tmpdir()는 node_modules 밖이라
//      'react' 패키지를 resolve하지 못해 사용할 수 없었다).
//
// ── 미니 파서의 한계(보안 감사 2026-08-06 확인, 반드시 읽을 것) ──────────
// 이 스크립트가 통과한다고 해서 "브라우저에서 안전함이 증명됐다"가 아니다.
// 미니 파서는 진짜 HTML5 파싱 알고리즘이 아니라 화이트리스트 변환 로직을
// 노드에서 돌리기 위한 좁은 테스트 하네스다:
//   - foreign content 모드 없음 → svg breakout(예: `<svg><p onclick=..>`가
//     실제 브라우저에서는 HTML integration point 규칙에 따라 <p>를 svg
//     밖으로 튕겨낸다) 재현 불가. 테스트 3(`<svg><circle>...`)은 breakout이
//     발생하지 않는 순수 SVG 네임스페이스 태그(circle)만 써서 이 한계를
//     피해 갔지만, `<svg><p>` 같은 breakout 페이로드는 이 스크립트로
//     검증되지 않는다. 다만 breakout이 일어나도 보안 영향은 없다 —
//     튕겨나간 <p>는 ALLOWED_TAGS 안이라 정상 렌더되고, on* 속성은
//     ATTR_TO_PROP 화이트리스트가 어차피 걸러낸다(구조가 다르게 나올 뿐
//     실행 가능한 마크업이 새는 게 아니다).
//   - RAWTEXT 모드 없음 → `<script>alert(1)</script foo>`,
//     `<style><img></style>` 같은 RAWTEXT 콘텐츠 모델을 재현할 수 없다.
//     다만 이번 감사 반영으로 STRIP_SUBTREE_TAGS가 태그 자체를 자식까지
//     통째로 버리므로(내용을 어떻게 토큰화했든 무관), 이 한계가 실제
//     화이트리스트 로직의 정확성에 영향을 주지 않는다(아래 회귀 테스트의
//     "STRIP_SUBTREE_TAGS 확장" 절 참고).
//   - 암시적 tbody 삽입·foster parenting 없음 → 테스트 1·7의 "구조 보존"은
//     "미니 파서가 파싱한 구조와 SafeHtml 출력 구조가 같다"만 증명한다.
//     실제 DB HTML을 진짜 브라우저 DOMParser에 먹였을 때도 동일한 트리
//     구조가 나오는지는 이 스크립트로 확인된 바 없다.
//   - template.content 동작 반대 → 미니 파서는 template 안 내용을 일반
//     childNodes로 파싱(브라우저는 별도 DocumentFragment로 옮겨 렌더
//     경로에서 원천 배제). 이번 감사로 template을 STRIP_SUBTREE_TAGS에
//     명시적으로 추가했으므로 미니 파서 기준으로도 안전하게 통째 제거된다
//     — 다만 이는 "미니 파서 결과가 우연히 안전한 것"이지 "미니 파서가
//     template.content 동작을 재현한 것"은 아니다.
//   - 엔티티 디코딩 6종(&lt; &gt; &quot; &#39; &nbsp; &amp;) 한정 →
//     &#60; 같은 수치 문자 참조는 미지원.
//
// 실행: node scripts/verify-safe-html.mjs
// =====================================================================

import fs from "node:fs";
import path from "node:path";
import * as esbuild from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const REPO_ROOT = path.resolve(new URL(".", import.meta.url).pathname, "..");
const SAFE_HTML_SRC_PATH = path.join(
  REPO_ROOT,
  "src/components/admission/SafeHtml.jsx",
);
const GOLDEN_CACHE_PATH = path.join(
  REPO_ROOT,
  ".golden-cache/admission-html-golden.full.json",
);

// ── 1. esbuild로 SafeHtml.jsx를 노드에서 import 가능한 ESM으로 변환 ──────

async function loadSafeHtmlModule() {
  const source = fs.readFileSync(SAFE_HTML_SRC_PATH, "utf8");
  const { code } = await esbuild.transform(source, {
    loader: "jsx",
    jsx: "automatic",
    jsxImportSource: "react",
    format: "esm",
  });
  // node_modules 해석을 위해 저장소 루트 밑에 임시로 쓴다(os.tmpdir()는
  // node_modules 트리 밖이라 'react' import를 resolve하지 못한다).
  const tmpFile = path.join(
    REPO_ROOT,
    `.tmp-safe-html-verify-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`,
  );
  fs.writeFileSync(tmpFile, code, "utf8");
  try {
    return await import(`file://${tmpFile}`);
  } finally {
    fs.rmSync(tmpFile, { force: true });
  }
}

// ── 2. 미니 HTML 파서 — DOMParser API의 좁은 부분집합만 구현 ────────────

const VOID_ELEMENTS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

function decodeEntities(str) {
  return String(str)
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

function parseAttributeString(attrString) {
  const attrs = [];
  const re =
    /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*("([^"]*)"|'([^']*)'|[^\s"'=<>`]+))?/g;
  let m = re.exec(attrString);
  while (m) {
    const name = m[1];
    let value = "";
    if (m[2] !== undefined) {
      value = m[3] !== undefined ? m[3] : m[4] !== undefined ? m[4] : m[2];
    }
    attrs.push({ name, value: decodeEntities(value) });
    m = re.exec(attrString);
  }
  return attrs;
}

function makeElementNode(tagName, attrs) {
  const node = {
    nodeType: 1,
    tagName: tagName.toUpperCase(),
    attributes: attrs,
    childNodes: [],
  };
  Object.defineProperty(node, "textContent", {
    get() {
      return node.childNodes.map((c) => c.textContent || "").join("");
    },
  });
  return node;
}

function makeTextNode(text) {
  return { nodeType: 3, textContent: decodeEntities(text) };
}

function makeCommentNode() {
  return { nodeType: 8, textContent: "" };
}

// html 문자열 -> { body: { childNodes: [...] } } 형태의 미니 DOM.
// sanitizeToReact(html, parseDocument)의 parseDocument 훅에 그대로 넘길 수
// 있는 시그니처.
function parseMiniHtml(html) {
  const root = makeElementNode("body", []);
  const stack = [root];
  let i = 0;
  const n = html.length;
  const top = () => stack[stack.length - 1];

  while (i < n) {
    if (html[i] === "<") {
      if (html.startsWith("<!--", i)) {
        const end = html.indexOf("-->", i + 4);
        top().childNodes.push(makeCommentNode());
        i = end === -1 ? n : end + 3;
        continue;
      }
      if (html.startsWith("<!", i)) {
        const end = html.indexOf(">", i);
        i = end === -1 ? n : end + 1;
        continue;
      }
      const closeMatch = /^<\/([a-zA-Z][a-zA-Z0-9-]*)\s*>/.exec(html.slice(i));
      if (closeMatch) {
        const tagName = closeMatch[1].toLowerCase();
        for (let s = stack.length - 1; s > 0; s -= 1) {
          if (stack[s].tagName.toLowerCase() === tagName) {
            stack.length = s;
            break;
          }
        }
        i += closeMatch[0].length;
        continue;
      }
      const openMatch =
        /^<([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)(\/?)>/.exec(
          html.slice(i),
        );
      if (openMatch) {
        const tagName = openMatch[1];
        const attrs = parseAttributeString(openMatch[2]);
        const selfClose = Boolean(openMatch[3]);
        const el = makeElementNode(tagName, attrs);
        top().childNodes.push(el);
        const isVoid = VOID_ELEMENTS.has(tagName.toLowerCase());
        if (!selfClose && !isVoid) stack.push(el);
        i += openMatch[0].length;
        continue;
      }
      // 인식 불가한 '<' — 리터럴 텍스트로 취급(관용 처리)
      top().childNodes.push(makeTextNode("<"));
      i += 1;
      continue;
    }
    const next = html.indexOf("<", i);
    const end = next === -1 ? n : next;
    const text = html.slice(i, end);
    if (text) top().childNodes.push(makeTextNode(text));
    i = end;
  }

  return { body: root };
}

class MiniDOMParser {
  parseFromString(html) {
    return parseMiniHtml(html);
  }
}

// ── 3. 헬퍼 ──────────────────────────────────────────────────────────

// sanitizeToReact(html, parseMiniHtml)의 결과를 SafeHtml 컴포넌트와 동일한
// 방식(degraded ? <pre> : <div>)으로 감싸 문자열로 렌더한다.
function renderSanitized(sanitizeToReact, html, className) {
  const result = sanitizeToReact(html, parseMiniHtml);
  if (!result) return "";
  const Tag = result.degraded ? "pre" : "div";
  return renderToStaticMarkup(
    React.createElement(Tag, { className }, result.children),
  );
}

function countTag(html, tag) {
  const re = new RegExp(`<${tag}(?=[\\s/>])`, "gi");
  return (html.match(re) || []).length;
}

async function main() {
  const results = [];
  const record = (name, pass, detail) => {
    results.push({ name, pass, detail });
  };

  const mod = await loadSafeHtmlModule();
  const SafeHtml = mod.default;
  const { sanitizeToReact } = mod;

  const render = (html, className) =>
    renderSanitized(sanitizeToReact, html, className);

  // 1) 정상 표 HTML — 클래스/colspan/rowspan 보존, 동일 구조로 렌더
  {
    const input =
      '<div class="admission-table-wrap"><table class="admission-data-table"><thead><tr><th colspan="2" rowspan="1">헤더</th></tr></thead>' +
      '<tbody><tr><td class="left">A</td><td>B</td></tr></tbody></table></div>';
    const out = render(input, "admission-existing-html");
    // 참고: react-dom 18.3.1의 renderToStaticMarkup은 colSpan을 colSpan= 그대로,
    // rowSpan을 rowspan=으로 출력하는 알려진 케이싱 비대칭이 있다(react-dom
    // 자체 SSR 속성 테이블 문제). HTML 속성명은 대소문자 무관이라 브라우저에서는
    // 무해하며, 이 프로젝트는 CSR SPA라 실제로는 SSR 경로를 타지 않는다 — 클라
    // 이언트 렌더 시 React가 DOM 프로퍼티(td.colSpan)로 직접 반영하므로 이 케이싱
    // 문제 자체가 발생하지 않는다. 여기서는 값(2/1)이 보존됐는지만 검증한다.
    const pass =
      out.includes('class="admission-existing-html"') &&
      out.includes('class="admission-table-wrap"') &&
      out.includes('class="admission-data-table"') &&
      /colspan="2"/i.test(out) &&
      /rowspan="1"/i.test(out) &&
      out.includes('class="left"') &&
      countTag(out, "table") === 1 &&
      countTag(out, "tr") === 2 &&
      countTag(out, "td") === 2;
    record("1. 정상 표 HTML 구조/클래스/colspan/rowspan 보존", pass, out);
  }

  // 2) <img src=x onerror=alert(1)> — 흔적 없이 제거
  {
    const input = "<div>앞<img src=x onerror=alert(1)>뒤</div>";
    const out = render(input);
    const pass =
      !out.includes("onerror") &&
      !out.includes("alert") &&
      !out.includes("<img") &&
      out.includes("앞") &&
      out.includes("뒤");
    record("2. <img onerror> 흔적 없이 제거", pass, out);
  }

  // 3) <svg onload=alert(1)><circle>...</svg> — 통째 제거
  //    circle은 breakout이 일어나지 않는 순수 SVG 네임스페이스 태그라 미니
  //    파서로도 유효한 검증이다. <svg><p> 같은 breakout 페이로드는 재현 불가
  //    (상단 헤더 주석 참조 — 보안 영향 없음, 테스트 미포함).
  {
    const input =
      '<div>앞<svg onload=alert(1)><circle cx="1"></circle></svg>뒤</div>';
    const out = render(input);
    const pass =
      !out.includes("svg") &&
      !out.includes("onload") &&
      !out.includes("alert") &&
      !out.includes("circle") &&
      out.includes("앞") &&
      out.includes("뒤");
    record("3. <svg onload> 자식까지 통째 제거", pass, out);
  }

  // 4) <a href="javascript:alert(1)">x</a> — unwrap, 텍스트만 남음
  {
    const input = '<div><a href="javascript:alert(1)">x</a></div>';
    const out = render(input);
    const pass =
      !out.includes("<a") &&
      !out.includes("href") &&
      !out.includes("javascript") &&
      /(?:^|>)x(?:<|$)/.test(out);
    record('4. <a href="javascript:..."> unwrap, 텍스트만 유지', pass, out);
  }

  // 5) <div style="position:fixed">x</div> — style 속성 제거
  {
    const input = '<div style="position:fixed">x</div>';
    const out = render(input);
    const pass =
      !out.includes("style") && !out.includes("position") && out.includes("x");
    record("5. style 속성 제거", pass, out);
  }

  // 6) <script>alert(1)</script> — 통째 제거
  {
    const input = "<div>앞<script>alert(1)</script>뒤</div>";
    const out = render(input);
    const pass =
      !out.includes("script") &&
      !out.includes("alert") &&
      out.includes("앞") &&
      out.includes("뒤");
    record("6. <script> 자식까지 통째 제거", pass, out);
  }

  // 7) 실제 DB 저장 HTML 샘플 — recruitment_quota 셀 3개, table/tr/td 개수 보존
  if (fs.existsSync(GOLDEN_CACHE_PATH)) {
    const golden = JSON.parse(fs.readFileSync(GOLDEN_CACHE_PATH, "utf8"));
    const universities = Object.keys(golden);
    const samples = [];
    for (const uni of universities) {
      const html = golden[uni]?.recruitment_quota?.recruitmentResultHtml;
      if (html?.includes("<table") && samples.length < 3) {
        samples.push({ uni, html });
      }
      if (samples.length >= 3) break;
    }
    let allPass = samples.length === 3;
    const detail = [];
    for (const { uni, html } of samples) {
      let out;
      let threw = false;
      try {
        out = render(html, "admission-existing-html");
      } catch (err) {
        threw = true;
        out = String(err?.stack ? err.stack : err);
      }
      const srcTable = countTag(html, "table");
      const srcTr = countTag(html, "tr");
      const srcTd = countTag(html, "td");
      const outTable = threw ? -1 : countTag(out, "table");
      const outTr = threw ? -1 : countTag(out, "tr");
      const outTd = threw ? -1 : countTag(out, "td");
      const ok =
        !threw && srcTable === outTable && srcTr === outTr && srcTd === outTd;
      allPass = allPass && ok;
      detail.push(
        `${uni}: 예외=${threw} table ${srcTable}->${outTable} tr ${srcTr}->${outTr} td ${srcTd}->${outTd} ${ok ? "OK" : "MISMATCH"}`,
      );
    }
    record(
      "7. 실제 DB 저장 HTML 샘플(recruitment_quota) 3건 — table/tr/td 개수 보존",
      allPass,
      detail.join("\n"),
    );
  } else {
    record(
      "7. 실제 DB 저장 HTML 샘플",
      false,
      `골든 캐시 없음: ${GOLDEN_CACHE_PATH}`,
    );
  }

  // ── 8~12) 보안 감사(2026-08-06) 지적 5건 회귀 테스트 ───────────────────

  // 8) STRIP_SUBTREE_TAGS 확장 — RAWTEXT/RCDATA 콘텐츠 스푸핑 방어
  {
    const cases = [
      ["<title>", "<div>앞<title><img src=x onerror=alert(1)></title>뒤</div>"],
      ["<textarea>", "<div>앞<textarea><b>bold</b></textarea>뒤</div>"],
      ["<noembed>", "<div>앞<noembed><b>x</b></noembed>뒤</div>"],
      ["<noframes>", "<div>앞<noframes><b>x</b></noframes>뒤</div>"],
      ["<xmp>", "<div>앞<xmp><b>x</b></xmp>뒤</div>"],
      ["<plaintext>", "<div>앞<plaintext><b>x</b></plaintext>뒤</div>"],
      ["<template>", "<div>앞<template><b>x</b></template>뒤</div>"],
      ["<noscript>", "<div>앞<noscript><b>x</b></noscript>뒤</div>"],
    ];
    let allPass = true;
    const detail = [];
    for (const [label, input] of cases) {
      const out = render(input);
      const ok =
        out.includes("앞") &&
        out.includes("뒤") &&
        !out.includes("<b>") &&
        !out.includes("bold") &&
        !out.includes("img") &&
        !out.includes("onerror");
      allPass = allPass && ok;
      detail.push(`${label}: ${ok ? "OK" : "FAIL"} → ${out}`);
    }
    record(
      "8. STRIP_SUBTREE_TAGS 확장(title/textarea/noembed/noframes/xmp/plaintext/template/noscript) 자식까지 제거",
      allPass,
      detail.join("\n"),
    );
  }

  // 9) 크기 상한 — html.length > MAX_HTML_LENGTH(512KB)면 평문(<pre>)으로 격하
  {
    const big = `<div>${"a".repeat(530 * 1024)}</div>`;
    const result = sanitizeToReact(big, parseMiniHtml);
    const pass =
      Boolean(result) &&
      result.degraded === true &&
      typeof result.children === "string" &&
      result.children.length > 500000;
    record(
      "9. 크기 상한(512KB) 초과 시 평문 격하",
      pass,
      `degraded=${result?.degraded} length=${result?.children?.length}`,
    );
  }

  // 10) 노드 수 상한 — 태그 5만 개 초과면(문자열은 512KB 미만) 평문으로 격하
  {
    const manyTags = "<b>x</b>".repeat(60000); // 480,000자 — 크기 상한 밑, 노드 수 상한(50,000) 위
    const result = sanitizeToReact(manyTags, parseMiniHtml);
    const pass =
      Boolean(result) &&
      result.degraded === true &&
      typeof result.children === "string" &&
      manyTags.length < 512 * 1024;
    record(
      "10. 노드 수 상한(50,000) 초과 시 평문 격하(크기는 상한 밑)",
      pass,
      `input.length=${manyTags.length} degraded=${result?.degraded}`,
    );
  }

  // 11) 깊이 상한 초과 시 텍스트 유출 방지 — 이전 버전은 node.textContent를
  //     반환해 STRIP_SUBTREE_TAGS 검사를 거치지 않은 script 내용이 샜다.
  {
    const input = `${"<div>".repeat(102)}<script>alert(1)</script>${"</div>".repeat(102)}`;
    const out = render(input);
    const pass = !out.includes("alert") && !out.includes("script");
    record(
      "11. 깊이 상한(100) 초과 서브트리 안의 script 내용 유출 방지",
      pass,
      out,
    );
  }

  // 12) ATTR_TO_PROP 프로토타입 체인 오염 방어
  {
    const input =
      '<table><tbody><tr><td constructor="x" __proto__="y">z</td></tr></tbody></table>';
    const out = render(input);
    const pass =
      out.includes(">z<") &&
      !out.includes("constructor") &&
      !out.includes("__proto__") &&
      !out.includes("[object");
    record(
      "12. ATTR_TO_PROP constructor/__proto__ 속성 무시(프로토타입 체인 미조회)",
      pass,
      out,
    );
  }

  // 13) parseDocument prop 분리 확인 — SafeHtml 기본 컴포넌트는 이제
  //     globalThis.DOMParser 셔임으로만 노드에서 검증 가능하다(prop 없음).
  {
    const prevDOMParser = globalThis.DOMParser;
    globalThis.DOMParser = MiniDOMParser;
    let out = "";
    let threw = false;
    try {
      out = renderToStaticMarkup(
        React.createElement(SafeHtml, {
          html: "<div>x</div>",
          className: "admission-existing-html",
        }),
      );
    } catch (err) {
      threw = true;
      out = String(err);
    } finally {
      globalThis.DOMParser = prevDOMParser;
    }
    const pass =
      !threw &&
      out.includes('class="admission-existing-html"') &&
      out.includes(">x<");
    record(
      "13. SafeHtml 컴포넌트(prop 없이, globalThis.DOMParser 셔임) 정상 동작",
      pass,
      out,
    );
  }

  // ── 결과 출력 ──────────────────────────────────────────────────────
  console.log("=== SafeHtml 검증 결과 ===");
  console.log(
    "(주의: DOMParser 대신 자체 미니 HTML 파서로 실행한 노드 검증. 완전한 브라우저 DOMParser 재현 아님 — 상단 주석 참조.)\n",
  );
  let failCount = 0;
  for (const r of results) {
    console.log(`[${r.pass ? "PASS" : "FAIL"}] ${r.name}`);
    if (!r.pass) {
      failCount += 1;
      console.log("  detail:", r.detail);
    }
  }
  console.log(
    `\n총 ${results.length}건 중 ${results.length - failCount}건 통과, ${failCount}건 실패.`,
  );
  if (failCount > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
