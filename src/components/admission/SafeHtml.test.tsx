// SafeHtml 화이트리스트 렌더러 검증 — scripts/verify-safe-html.mjs 이식.
//
// 이식 전(node:test 시절) 이 스크립트는 Node에 DOMParser가 없어서(jsdom
// 미설치 — 당시 "설치 금지" 지시에 따름) 손으로 만든 미니 HTML 파서를
// SafeHtml의 sanitizeToReact(html, parseDocument) 훅에 주입해 검증했다.
// task 10.1(PR #107)에서 Vitest + jsdom을 정식 도입하며 그 제약이 사라졌고,
// 이 파일은 진짜 jsdom의 전역 DOMParser만으로 동작한다.
//
// sanitizeToReact는 현재 SafeHtml.tsx에서 export되지 않는다(2026-08-06
// 보안 감사 지적 5번 — 테스트 전용 prop/export를 프로덕션 표면에서 뺐다).
// 그래서 미니 파서 시절처럼 sanitizeToReact를 직접 호출하는 대신, 모든
// 케이스를 SafeHtml 기본 컴포넌트를 통해 검증한다 — jsdom 환경에서는
// `new DOMParser()`가 전역으로 이미 존재하므로 globalThis.DOMParser 셔임도
// 필요 없다.
//
// ── 미니 파서의 한계(보안 감사 2026-08-06 확인) — 실제 jsdom 이식으로 해소됨 ──
// 과거 미니 파서는 진짜 HTML5 파싱 알고리즘이 아니라 화이트리스트 변환 로직을
// 노드에서 돌리기 위한 좁은 테스트 하네스였다. 아래 한계는 이 파일이 진짜
// jsdom DOMParser를 쓰면서 전부 해소됐다(재현을 위해 억지로 작업할 필요 없음):
//   - foreign content 모드 없음 → svg breakout(`<svg><p onclick=..>`가 HTML
//     integration point 규칙에 따라 <p>를 svg 밖으로 튕겨내는 동작)을 재현하지
//     못했다. jsdom은 이 규칙을 실제로 구현한다.
//   - RAWTEXT 모드 없음 → `<script>alert(1)</script foo>` 같은 RAWTEXT 콘텐츠
//     모델을 재현하지 못했다. jsdom은 RAWTEXT를 실제로 토큰화한다.
//   - 암시적 tbody 삽입·foster parenting 없음 → 미니 파서가 파싱한 구조가
//     실제 브라우저 구조와 같은지 보장되지 않았다. jsdom은 HTML5 파싱
//     알고리즘을 그대로 구현하므로 이 우려 자체가 사라진다.
//   - template.content 동작 반대 → 미니 파서는 template 내부를 일반
//     childNodes로 파싱했다(브라우저는 별도 DocumentFragment로 옮긴다).
//     jsdom은 진짜 DocumentFragment 분리를 재현한다.
//   - 엔티티 디코딩 6종 한정 → jsdom은 전체 HTML 엔티티(&#60; 등 수치 문자
//     참조 포함)를 디코딩한다.
//
// 실행: npx vitest run src/components/admission/SafeHtml.test.tsx

import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import SafeHtml from "./SafeHtml";

const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");
const GOLDEN_CACHE_PATH = path.join(
  REPO_ROOT,
  ".golden-cache/admission-html-golden.full.json",
);

function render(html: string, className?: string) {
  return renderToStaticMarkup(
    className === undefined ? (
      <SafeHtml html={html} />
    ) : (
      <SafeHtml html={html} className={className} />
    ),
  );
}

function countTag(html: string, tag: string) {
  const re = new RegExp(`<${tag}(?=[\\s/>])`, "gi");
  return (html.match(re) || []).length;
}

// 1) 정상 표 HTML — 클래스/colspan/rowspan 보존, 동일 구조로 렌더
test("1. 정상 표 HTML 구조/클래스/colspan/rowspan 보존", () => {
  const input =
    '<div class="admission-table-wrap"><table class="admission-data-table"><thead><tr><th colspan="2" rowspan="1">헤더</th></tr></thead>' +
    '<tbody><tr><td class="left">A</td><td>B</td></tr></tbody></table></div>';
  const out = render(input, "admission-existing-html");
  // 참고: react-dom 18.3.1의 renderToStaticMarkup은 rowSpan을 rowspan=으로
  // 출력하는 케이싱 비대칭이 있었으나, react-dom 19.2.8(task 4a React 19
  // 승격 이후 실측)에서는 rowSpan/colSpan 둘 다 카멜케이스로 나온다. HTML
  // 속성명은 대소문자 무관이라 브라우저에서는 어느 쪽이든 무해하며, 이
  // 프로젝트는 CSR SPA라 실제로는 SSR 경로를 타지 않는다 — 클라이언트 렌더
  // 시 React가 DOM 프로퍼티(td.colSpan)로 직접 반영하므로 케이싱 자체가
  // 무의미해진다. 여기서는 값(2/1)이 보존됐는지만 대소문자 무관하게 검증한다.
  expect(out, out).toContain('class="admission-existing-html"');
  expect(out, out).toContain('class="admission-table-wrap"');
  expect(out, out).toContain('class="admission-data-table"');
  expect(out, out).toMatch(/colspan="2"/i);
  expect(out, out).toMatch(/rowspan="1"/i);
  expect(out, out).toContain('class="left"');
  expect(countTag(out, "table"), out).toBe(1);
  expect(countTag(out, "tr"), out).toBe(2);
  expect(countTag(out, "td"), out).toBe(2);
});

// 2) <img src=x onerror=alert(1)> — onerror는 흔적 없이 제거, src="x"는
//    스킴 없는 상대경로라 안전하게 통과(2026-08-14부터 img가 화이트리스트에
//    들어왔다 — CompanyNews/Events sanitize 도입). onerror 등 on*는
//    ATTR_TO_PROP 화이트리스트 밖이라 애초에 convertAttributes가 거른다.
test("2. <img onerror> 속성만 제거되고 태그는 살아남는다", () => {
  const input = "<div>앞<img src=x onerror=alert(1)>뒤</div>";
  const out = render(input);
  expect(out, out).not.toContain("onerror");
  expect(out, out).not.toContain("alert");
  expect(out, out).toContain('<img src="x"');
  expect(out, out).toContain("앞");
  expect(out, out).toContain("뒤");
});

// 2b) <img src="javascript:alert(1)"> — 위험 스킴은 src 자체를 버린다(빈
//     src가 아니라 속성 자체가 없는 img가 나온다).
test("2b. img src=javascript: 스킴 차단 — src 속성 자체 제거", () => {
  const input = '<div><img src="javascript:alert(1)" alt="x"></div>';
  const out = render(input);
  expect(out, out).not.toContain("javascript");
  expect(out, out).not.toContain("src=");
  expect(out, out).toContain('alt="x"');
});

// 2c) <img src="https://cdn.example.com/a.png" alt="설명"> — 정상 이미지는
//     src/alt 보존.
test("2c. 정상 https img — src/alt 보존", () => {
  const input =
    '<div><img src="https://cdn.example.com/a.png" alt="설명"></div>';
  const out = render(input);
  expect(out, out).toContain('src="https://cdn.example.com/a.png"');
  expect(out, out).toContain('alt="설명"');
});

// 3) <svg onload=alert(1)><circle>...</svg> — 통째 제거
test("3. <svg onload> 자식까지 통째 제거", () => {
  const input =
    '<div>앞<svg onload=alert(1)><circle cx="1"></circle></svg>뒤</div>';
  const out = render(input);
  expect(out, out).not.toContain("svg");
  expect(out, out).not.toContain("onload");
  expect(out, out).not.toContain("alert");
  expect(out, out).not.toContain("circle");
  expect(out, out).toContain("앞");
  expect(out, out).toContain("뒤");
});

// 4) <a href="javascript:alert(1)">x</a> — a 태그는 살아남되(2026-08-14부터
//    화이트리스트에 들어왔다) href는 위험 스킴이라 아예 안 붙는다. href가
//    없으니 target/rel 강제 부착도 같이 안 붙는다(하이퍼링크가 아니므로).
test('4. <a href="javascript:..."> href 속성만 제거, 태그는 유지', () => {
  const input = '<div><a href="javascript:alert(1)">x</a></div>';
  const out = render(input);
  expect(out, out).not.toContain("href");
  expect(out, out).not.toContain("javascript");
  expect(out, out).not.toContain("target");
  expect(out, out).toContain("<a>x</a>");
});

// 4b) <a href="https://example.com">x</a> — 정상 링크는 href 보존 +
//     target="_blank" rel="noopener noreferrer" 강제 부착(작성자가 준
//     target/rel 값은 신뢰하지 않는다).
test("4b. 정상 https 링크 — href 보존 + target/rel 강제(작성자 값 무시)", () => {
  const input =
    '<div><a href="https://example.com" target="_self" rel="bogus">x</a></div>';
  const out = render(input);
  expect(out, out).toContain('href="https://example.com"');
  expect(out, out).toContain('target="_blank"');
  expect(out, out).toContain('rel="noopener noreferrer"');
  expect(out, out).not.toContain("_self");
  expect(out, out).not.toContain("bogus");
});

// 4c) <a href="data:text/html,...">x</a> — data: 스킴도 href 자체를 버린다.
test("4c. a href=data: 스킴 차단 — href 속성 자체 제거", () => {
  const input =
    '<div><a href="data:text/html,<script>alert(1)</script>">x</a></div>';
  const out = render(input);
  expect(out, out).not.toContain("href");
  expect(out, out).not.toContain("data:");
  expect(out, out).toContain(">x<");
});

// 5) <div style="position:fixed">x</div> — style 속성 제거
test("5. style 속성 제거", () => {
  const input = '<div style="position:fixed">x</div>';
  const out = render(input);
  expect(out, out).not.toContain("style");
  expect(out, out).not.toContain("position");
  expect(out, out).toContain("x");
});

// 6) <script>alert(1)</script> — 통째 제거
test("6. <script> 자식까지 통째 제거", () => {
  const input = "<div>앞<script>alert(1)</script>뒤</div>";
  const out = render(input);
  expect(out, out).not.toContain("script");
  expect(out, out).not.toContain("alert");
  expect(out, out).toContain("앞");
  expect(out, out).toContain("뒤");
});

// 7) 실제 DB 저장 HTML 샘플 — recruitment_quota 셀 3개, table/tr/td 개수 보존.
// .golden-cache/는 .gitignore 처리돼 있어 CI에는 없다 — 없는 머신에서는
// FAIL이 아니라 스킵한다(있는 로컬 머신에서는 실제로 돈다).
//
// describe 콜백 몸체는 skipIf 여부와 무관하게 항상 실행되므로(테스트만
// skip), 파일 읽기는 존재 여부를 다시 확인하는 if 안에서만 한다 — 없는
// 머신에서 describe 몸체 실행 시점에 ENOENT로 터지는 것을 막기 위함.
const goldenCacheExists = fs.existsSync(GOLDEN_CACHE_PATH);

describe("7. 실제 DB 저장 HTML 샘플(recruitment_quota) — table/tr/td 개수 보존", () => {
  if (!goldenCacheExists) {
    test.skip(`골든 캐시 없음: ${GOLDEN_CACHE_PATH}`, () => {});
    return;
  }

  const golden = JSON.parse(fs.readFileSync(GOLDEN_CACHE_PATH, "utf8"));
  const universities = Object.keys(golden);
  const samples: Array<{ uni: string; html: string }> = [];
  for (const uni of universities) {
    const html = golden[uni]?.recruitment_quota?.recruitmentResultHtml;
    if (html?.includes("<table") && samples.length < 3) {
      samples.push({ uni, html });
    }
    if (samples.length >= 3) break;
  }

  test("샘플 3건을 찾는다", () => {
    expect(samples.length).toBe(3);
  });

  test.each(samples)("$uni — table/tr/td 개수 보존", ({ uni, html }) => {
    const out = render(html, "admission-existing-html");
    const srcTable = countTag(html, "table");
    const srcTr = countTag(html, "tr");
    const srcTd = countTag(html, "td");
    expect(countTag(out, "table"), `${uni}: table ${out}`).toBe(srcTable);
    expect(countTag(out, "tr"), `${uni}: tr ${out}`).toBe(srcTr);
    expect(countTag(out, "td"), `${uni}: td ${out}`).toBe(srcTd);
  });
});

// ── 8~12) 보안 감사(2026-08-06) 지적 5건 회귀 테스트 ───────────────────
// 이 스크립트의 핵심 존재 이유 — 절대 누락 금지.

// 8) STRIP_SUBTREE_TAGS 확장 — RAWTEXT/RCDATA 콘텐츠 스푸핑 방어
describe("8. STRIP_SUBTREE_TAGS 확장 — 자식까지 통째 제거", () => {
  const cases: Array<[string, string]> = [
    ["<title>", "<div>앞<title><img src=x onerror=alert(1)></title>뒤</div>"],
    ["<textarea>", "<div>앞<textarea><b>bold</b></textarea>뒤</div>"],
    ["<noembed>", "<div>앞<noembed><b>x</b></noembed>뒤</div>"],
    ["<noframes>", "<div>앞<noframes><b>x</b></noframes>뒤</div>"],
    ["<xmp>", "<div>앞<xmp><b>x</b></xmp>뒤</div>"],
    ["<template>", "<div>앞<template><b>x</b></template>뒤</div>"],
    ["<noscript>", "<div>앞<noscript><b>x</b></noscript>뒤</div>"],
  ];

  test.each(cases)("%s", (_label, input) => {
    const out = render(input);
    expect(out, out).toContain("앞");
    expect(out, out).toContain("뒤");
    expect(out, out).not.toContain("<b>");
    expect(out, out).not.toContain("bold");
    expect(out, out).not.toContain("img");
    expect(out, out).not.toContain("onerror");
  });

  // <plaintext>는 미니 파서 시절 다른 RAWTEXT류와 동일하게 취급했지만, 실제
  // HTML5 파싱 알고리즘에서는 종료 태그 자체가 없다 — 토크나이저가 PLAINTEXT
  // 상태로 전환되면 그 뒤로는 문서(프래그먼트) 끝까지 전부 리터럴 텍스트로
  // 삼킨다("</plaintext>뒤</div>" 문자열 그대로 plaintext 요소의 텍스트가
  // 된다). 그래서 STRIP_SUBTREE_TAGS가 plaintext 서브트리를 통째로 제거하면
  // "뒤"도 함께 사라진다 — SafeHtml의 결함이 아니라 실제 브라우저의
  // plaintext 콘텐츠 모델 자체다. jsdom(HTML5 파싱 알고리즘 그대로 구현)으로
  // 이식하며 드러난 케이스라 별도 테스트로 분리한다.
  test("<plaintext> — 종료 태그 없음, 이후 형제(뒤)까지 통째로 삼켜져 함께 제거된다", () => {
    const input = "<div>앞<plaintext><b>x</b></plaintext>뒤</div>";
    const out = render(input);
    expect(out, out).toContain("앞");
    expect(out, out).not.toContain("<b>");
    expect(out, out).not.toContain("뒤");
  });
});

// 9) 크기 상한 — html.length > MAX_HTML_LENGTH(512KB)면 평문(<pre>)으로 격하.
// sanitizeToReact가 더 이상 export되지 않아(감사 지적 5번, prod 표면에서
// 테스트 훅 제거) result.degraded를 직접 못 보므로, 컴포넌트 출력이 <pre>
// 래퍼로 격하됐는지 + 원문 길이만큼 텍스트가 보존됐는지로 동등하게 검증한다.
test("9. 크기 상한(512KB) 초과 시 평문 격하", () => {
  const big = `<div>${"a".repeat(530 * 1024)}</div>`;
  const out = render(big, "admission-existing-html");
  expect(out.startsWith("<pre"), out.slice(0, 80)).toBe(true);
  expect(out.length).toBeGreaterThan(500000);
});

// 10) 노드 수 상한 — 태그 5만 개 초과면(문자열은 512KB 미만) 평문으로 격하
test("10. 노드 수 상한(50,000) 초과 시 평문 격하(크기는 상한 밑)", () => {
  const manyTags = "<b>x</b>".repeat(60000); // 480,000자 — 크기 상한 밑, 노드 수 상한(50,000) 위
  expect(manyTags.length).toBeLessThan(512 * 1024);
  const out = render(manyTags);
  expect(out.startsWith("<pre"), out.slice(0, 80)).toBe(true);
});

// 11) 깊이 상한 초과 시 텍스트 유출 방지 — 이전 버전은 node.textContent를
//     반환해 STRIP_SUBTREE_TAGS 검사를 거치지 않은 script 내용이 샜다.
test("11. 깊이 상한(100) 초과 서브트리 안의 script 내용 유출 방지", () => {
  const input = `${"<div>".repeat(102)}<script>alert(1)</script>${"</div>".repeat(102)}`;
  const out = render(input);
  expect(out, out).not.toContain("alert");
  expect(out, out).not.toContain("script");
});

// 12) ATTR_TO_PROP 프로토타입 체인 오염 방어
test("12. ATTR_TO_PROP constructor/__proto__ 속성 무시(프로토타입 체인 미조회)", () => {
  const input =
    '<table><tbody><tr><td constructor="x" __proto__="y">z</td></tr></tbody></table>';
  const out = render(input);
  expect(out, out).toContain(">z<");
  expect(out, out).not.toContain("constructor");
  expect(out, out).not.toContain("__proto__");
  expect(out, out).not.toContain("[object");
});

// 13) SafeHtml 컴포넌트 스모크 테스트 — jsdom 전역 DOMParser로 동작 확인.
test("13. SafeHtml 컴포넌트 정상 동작(jsdom 전역 DOMParser)", () => {
  const out = render("<div>x</div>", "admission-existing-html");
  expect(out, out).toContain('class="admission-existing-html"');
  expect(out, out).toContain(">x<");
});
