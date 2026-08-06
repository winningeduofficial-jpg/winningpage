// =====================================================================
// SafeHtml 화이트리스트 렌더러 검증 스크립트
//
// SafeHtml.jsx는 브라우저 DOMParser를 전제로 한다. Node에는 DOMParser가
// 없고, jsdom/linkedom/happy-dom 등도 이 저장소에 설치돼 있지 않다
// (설치 금지 지시에 따름 — `ls node_modules/jsdom` 확인 결과 없음).
//
// 따라서 이 스크립트는:
//   1. SafeHtml.jsx가 이미 지원하는 parseDocument 주입 훅을 이용해,
//      DOMParser API의 아주 좁은 부분집합(nodeType/tagName/attributes/
//      childNodes/textContent)만 구현한 "미니 HTML 파서"를 자체 작성해
//      브라우저 없이 SafeHtml의 화이트리스트 로직을 실행한다.
//   2. 이 미니 파서는 진짜 HTML5 파서가 아니다 — 태그 생략 규칙
//      (예: <table>에 <tbody> 암시적 삽입), <script>/<style> raw-text
//      모드, 잘못된 중첩 복구 등 브라우저 파서의 세부 동작을 재현하지
//      않는다. 어디까지나 "화이트리스트 변환 로직 자체"를 노드에서
//      실행 가능하게 하는 테스트 하네스이며, 브라우저 DOMParser의
//      완전한 대체물이 아니다. 이 사실은 아래 report()에도 명시한다.
//   3. JSX 변환은 npm install 없이, 이 저장소에 이미 설치돼 있는
//      esbuild(vite의 전이 의존성)를 런타임에 사용한다. 변환 결과는
//      node_modules 해석이 되도록 저장소 루트에 임시 파일로 썼다가
//      실행 직후 즉시 삭제한다(os.tmpdir()는 node_modules 밖이라
//      'react' 패키지를 resolve하지 못해 사용할 수 없었다).
//
// 실행: node scripts/verify-safe-html.mjs
// =====================================================================

import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as esbuild from 'esbuild';

const REPO_ROOT = path.resolve(new URL('.', import.meta.url).pathname, '..');
const SAFE_HTML_SRC_PATH = path.join(REPO_ROOT, 'src/components/admission/SafeHtml.jsx');
const GOLDEN_CACHE_PATH = path.join(REPO_ROOT, '.golden-cache/admission-html-golden.full.json');

// ── 1. esbuild로 SafeHtml.jsx를 노드에서 import 가능한 ESM으로 변환 ──────

async function loadSafeHtmlComponent() {
  const source = fs.readFileSync(SAFE_HTML_SRC_PATH, 'utf8');
  const { code } = await esbuild.transform(source, {
    loader: 'jsx',
    jsx: 'automatic',
    jsxImportSource: 'react',
    format: 'esm'
  });
  // node_modules 해석을 위해 저장소 루트 밑에 임시로 쓴다(os.tmpdir()는
  // node_modules 트리 밖이라 'react' import를 resolve하지 못한다).
  const tmpFile = path.join(REPO_ROOT, `.tmp-safe-html-verify-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`);
  fs.writeFileSync(tmpFile, code, 'utf8');
  try {
    const mod = await import(`file://${tmpFile}`);
    return mod.default;
  } finally {
    fs.rmSync(tmpFile, { force: true });
  }
}

// ── 2. 미니 HTML 파서 — DOMParser API의 좁은 부분집합만 구현 ────────────

const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img',
  'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'
]);

function decodeEntities(str) {
  return String(str)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

function parseAttributeString(attrString) {
  const attrs = [];
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*("([^"]*)"|'([^']*)'|[^\s"'=<>`]+))?/g;
  let m = re.exec(attrString);
  while (m) {
    const name = m[1];
    let value = '';
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
    childNodes: []
  };
  Object.defineProperty(node, 'textContent', {
    get() {
      return node.childNodes.map((c) => c.textContent || '').join('');
    }
  });
  return node;
}

function makeTextNode(text) {
  return { nodeType: 3, textContent: decodeEntities(text) };
}

function makeCommentNode() {
  return { nodeType: 8, textContent: '' };
}

// html 문자열 -> { body: { childNodes: [...] } } 형태의 미니 DOM.
// SafeHtml의 parseDocument(html) 훅에 그대로 넘길 수 있는 시그니처.
function parseMiniHtml(html) {
  const root = makeElementNode('body', []);
  const stack = [root];
  let i = 0;
  const n = html.length;
  const top = () => stack[stack.length - 1];

  while (i < n) {
    if (html[i] === '<') {
      if (html.startsWith('<!--', i)) {
        const end = html.indexOf('-->', i + 4);
        top().childNodes.push(makeCommentNode());
        i = end === -1 ? n : end + 3;
        continue;
      }
      if (html.startsWith('<!', i)) {
        const end = html.indexOf('>', i);
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
      const openMatch = /^<([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)(\/?)>/.exec(html.slice(i));
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
      top().childNodes.push(makeTextNode('<'));
      i += 1;
      continue;
    }
    const next = html.indexOf('<', i);
    const end = next === -1 ? n : next;
    const text = html.slice(i, end);
    if (text) top().childNodes.push(makeTextNode(text));
    i = end;
  }

  return { body: root };
}

// ── 3. 테스트 케이스 ─────────────────────────────────────────────────

function renderSafeHtml(SafeHtml, html, extraProps = {}) {
  return renderToStaticMarkup(
    React.createElement(SafeHtml, { html, parseDocument: parseMiniHtml, ...extraProps })
  );
}

function countOccurrences(str, sub) {
  if (!sub) return 0;
  let count = 0;
  let idx = 0;
  while ((idx = str.indexOf(sub, idx)) !== -1) {
    count += 1;
    idx += sub.length;
  }
  return count;
}

function countTag(html, tag) {
  const re = new RegExp(`<${tag}(?=[\\s/>])`, 'gi');
  return (html.match(re) || []).length;
}

async function main() {
  const results = [];
  const record = (name, pass, detail) => {
    results.push({ name, pass, detail });
  };

  const SafeHtml = await loadSafeHtmlComponent();

  // 1) 정상 표 HTML — 클래스/colspan/rowspan 보존, 동일 구조로 렌더
  {
    const input =
      '<div class="admission-table-wrap"><table class="admission-data-table"><thead><tr><th colspan="2" rowspan="1">헤더</th></tr></thead>' +
      '<tbody><tr><td class="left">A</td><td>B</td></tr></tbody></table></div>';
    const out = renderSafeHtml(SafeHtml, input, { className: 'admission-existing-html' });
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
      countTag(out, 'table') === 1 &&
      countTag(out, 'tr') === 2 &&
      countTag(out, 'td') === 2;
    record('1. 정상 표 HTML 구조/클래스/colspan/rowspan 보존', pass, out);
  }

  // 2) <img src=x onerror=alert(1)> — 흔적 없이 제거
  {
    const input = '<div>앞<img src=x onerror=alert(1)>뒤</div>';
    const out = renderSafeHtml(SafeHtml, input);
    const pass = !out.includes('onerror') && !out.includes('alert') && !out.includes('<img') && out.includes('앞') && out.includes('뒤');
    record('2. <img onerror> 흔적 없이 제거', pass, out);
  }

  // 3) <svg onload=alert(1)> — 통째 제거
  {
    const input = '<div>앞<svg onload=alert(1)><circle cx="1"></circle></svg>뒤</div>';
    const out = renderSafeHtml(SafeHtml, input);
    const pass = !out.includes('svg') && !out.includes('onload') && !out.includes('alert') && !out.includes('circle') && out.includes('앞') && out.includes('뒤');
    record('3. <svg onload> 자식까지 통째 제거', pass, out);
  }

  // 4) <a href="javascript:alert(1)">x</a> — unwrap, 텍스트만 남음
  {
    const input = '<div><a href="javascript:alert(1)">x</a></div>';
    const out = renderSafeHtml(SafeHtml, input);
    const pass = !out.includes('<a') && !out.includes('href') && !out.includes('javascript') && /(?:^|>)x(?:<|$)/.test(out);
    record('4. <a href="javascript:..."> unwrap, 텍스트만 유지', pass, out);
  }

  // 5) <div style="position:fixed">x</div> — style 속성 제거
  {
    const input = '<div style="position:fixed">x</div>';
    const out = renderSafeHtml(SafeHtml, input);
    const pass = !out.includes('style') && !out.includes('position') && out.includes('x');
    record('5. style 속성 제거', pass, out);
  }

  // 6) <script>alert(1)</script> — 통째 제거
  {
    const input = '<div>앞<script>alert(1)</script>뒤</div>';
    const out = renderSafeHtml(SafeHtml, input);
    const pass = !out.includes('script') && !out.includes('alert') && out.includes('앞') && out.includes('뒤');
    record('6. <script> 자식까지 통째 제거', pass, out);
  }

  // 7) 실제 DB 저장 HTML 샘플 — recruitment_quota 셀 3개, table/tr/td 개수 보존
  if (fs.existsSync(GOLDEN_CACHE_PATH)) {
    const golden = JSON.parse(fs.readFileSync(GOLDEN_CACHE_PATH, 'utf8'));
    const universities = Object.keys(golden);
    const samples = [];
    for (const uni of universities) {
      const html = golden[uni]?.recruitment_quota?.recruitmentResultHtml;
      if (html && html.includes('<table') && samples.length < 3) {
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
        out = renderSafeHtml(SafeHtml, html, { className: 'admission-existing-html' });
      } catch (err) {
        threw = true;
        out = String(err && err.stack ? err.stack : err);
      }
      const srcTable = countTag(html, 'table');
      const srcTr = countTag(html, 'tr');
      const srcTd = countTag(html, 'td');
      const outTable = threw ? -1 : countTag(out, 'table');
      const outTr = threw ? -1 : countTag(out, 'tr');
      const outTd = threw ? -1 : countTag(out, 'td');
      const ok = !threw && srcTable === outTable && srcTr === outTr && srcTd === outTd;
      allPass = allPass && ok;
      detail.push(
        `${uni}: 예외=${threw} table ${srcTable}->${outTable} tr ${srcTr}->${outTr} td ${srcTd}->${outTd} ${ok ? 'OK' : 'MISMATCH'}`
      );
    }
    record('7. 실제 DB 저장 HTML 샘플(recruitment_quota) 3건 — table/tr/td 개수 보존', allPass, detail.join('\n'));
  } else {
    record('7. 실제 DB 저장 HTML 샘플', false, `골든 캐시 없음: ${GOLDEN_CACHE_PATH}`);
  }

  // ── 결과 출력 ──────────────────────────────────────────────────────
  console.log('=== SafeHtml 검증 결과 ===');
  console.log('(주의: DOMParser 대신 자체 미니 HTML 파서로 실행한 노드 검증. 완전한 브라우저 DOMParser 재현 아님 — 상단 주석 참조.)\n');
  let failCount = 0;
  for (const r of results) {
    console.log(`[${r.pass ? 'PASS' : 'FAIL'}] ${r.name}`);
    if (!r.pass) {
      failCount += 1;
      console.log('  detail:', r.detail);
    }
  }
  console.log(`\n총 ${results.length}건 중 ${results.length - failCount}건 통과, ${failCount}건 실패.`);
  if (failCount > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
