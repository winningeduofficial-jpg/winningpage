// =====================================================================
// 섹션 문서 React 렌더 컴포넌트 검증 스크립트 (자기 자신에 대한 스펙 테스트)
//
// renderDocToHtml(HTML 미러 렌더러)가 아직 없어(phase0 진행 중) 아직은
// Gate B(React 출력 vs renderDocToHtml 출력 DOM 비교)를 돌릴 수 없다.
// 그 전까지는 설계 문서 §5.3 DOM 동형성 계약 표를 정답으로 놓고, 각
// variant/블록이 그 표의 클래스 문자열을 정확히 내는지만 자체 검증한다.
// renderDocToHtml이 커밋되면 이 스크립트는 Gate B의 한쪽 입력(React 출력)
// 생성기로 재사용될 수 있다.
//
// scripts/verify-safe-html.mjs와 동일한 제약: npm install 금지, jsdom 등
// 미설치. 여기서는 SafeHtml처럼 DOMParser가 필요 없다(순수 React 컴포넌트
// 트리 렌더 + renderToStaticMarkup 문자열 검사만 하면 되므로).
//
// JSX가 여러 파일(blocks/*, tables/*, admissionLayout.js 등)에 걸쳐
// 상대 경로 import로 얽혀 있어 verify-safe-html.mjs처럼 단일 파일
// esbuild.transform으로는 부족하다 — 이 저장소에 이미 있는 esbuild의
// build()(번들 모드)를 써서 AdmissionSectionView.jsx를 엔트리포인트로
// 번들하되, react/react-dom은 external로 남겨 실제 설치된 패키지를
// 그대로 쓰게 한다(React 인스턴스 중복 방지 — 중복되면 렌더 자체가
// 조용히 깨지거나 훅 에러가 난다).
//
// rawHtml 블록은 내부적으로 SafeHtml(브라우저 DOMParser 전제)을 쓴다. 이
// 스크립트는 RawHtmlView/SafeHtml에 어떤 테스트 전용 prop도 추가하지 않고,
// scripts/verify-safe-html.mjs와 동일한 미니 HTML 파서를 globalThis.DOMParser
// 셔임으로 등록해 SafeHtml의 기본 경로(new DOMParser())가 그대로 동작하게
// 한다 — 프로덕션 코드 변경 없이 노드에서 rawHtml 블록까지 검증하기 위함.
//
// 실행: node scripts/verify-admission-block-render.mjs
// =====================================================================

import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as esbuild from 'esbuild';

const REPO_ROOT = path.resolve(new URL('.', import.meta.url).pathname, '..');
const ENTRY_PATH = path.join(REPO_ROOT, 'src/components/admission/AdmissionSectionView.jsx');

// ── scripts/verify-safe-html.mjs와 동일한 미니 HTML 파서(요약본) ─────────
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
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

function parseAttributeString(attrString) {
  const attrs = [];
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*("([^"]*)"|'([^']*)'|[^\s"'=<>`]+))?/g;
  let m = re.exec(attrString);
  while (m) {
    const name = m[1];
    let value = '';
    if (m[2] !== undefined) value = m[3] !== undefined ? m[3] : m[4] !== undefined ? m[4] : m[2];
    attrs.push({ name, value: decodeEntities(value) });
    m = re.exec(attrString);
  }
  return attrs;
}

function makeElementNode(tagName, attrs) {
  const node = { nodeType: 1, tagName: tagName.toUpperCase(), attributes: attrs, childNodes: [] };
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

class MiniDOMParser {
  parseFromString(html) {
    return parseMiniHtml(html);
  }
}

globalThis.DOMParser = MiniDOMParser;

async function loadAdmissionSectionView() {
  const result = await esbuild.build({
    entryPoints: [ENTRY_PATH],
    bundle: true,
    format: 'esm',
    jsx: 'automatic',
    jsxImportSource: 'react',
    platform: 'node',
    external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/server'],
    write: false
  });
  const code = result.outputFiles[0].text;
  // node_modules 해석을 위해 저장소 루트 밑에 임시로 쓴다(verify-safe-html.mjs와 동일 이유).
  const tmpFile = path.join(REPO_ROOT, `.tmp-block-render-verify-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`);
  fs.writeFileSync(tmpFile, code);
  try {
    const mod = await import(`file://${tmpFile}`);
    return mod.default;
  } finally {
    fs.rmSync(tmpFile, { force: true });
  }
}

function classesOf(out) {
  const re = /class="([^"]*)"/g;
  const found = [];
  let m = re.exec(out);
  while (m) {
    found.push(m[1]);
    m = re.exec(out);
  }
  return found;
}

function hasClass(out, cls) {
  return classesOf(out).some((c) => c.split(/\s+/).includes(cls));
}

function classSetsEqual(actual, expected) {
  const a = new Set(actual.split(/\s+/).filter(Boolean));
  const b = new Set(expected.split(/\s+/).filter(Boolean));
  if (a.size !== b.size) return false;
  for (const cls of a) if (!b.has(cls)) return false;
  return true;
}

// 설계 §7-2 ② — thead 마크업 완전 문자열 골든용. 첫 <thead>…</thead>를
// 있는 그대로(속성 순서·케이싱 포함) 잘라낸다. 정규화하지 않는 것이 핵심이다:
// 정규화하는 순간 rowSpan/colSpan 케이싱이나 class 위치 변화를 놓친다.
function theadOf(out) {
  const start = out.indexOf('<thead>');
  const end = out.indexOf('</thead>');
  if (start === -1 || end === -1) return '';
  return out.slice(start, end + '</thead>'.length);
}

function findTagWithExactClass(out, tag, expectedClass) {
  const re = new RegExp(`<${tag}\\b[^>]*class="([^"]*)"`, 'g');
  let m = re.exec(out);
  while (m) {
    if (classSetsEqual(m[1], expectedClass)) return true;
    m = re.exec(out);
  }
  return false;
}

async function main() {
  const results = [];
  const record = (name, pass, detail) => results.push({ name, pass, detail });

  const AdmissionSectionView = await loadAdmissionSectionView();
  const render = (doc, sectionKey = 'selection_method', surface = 'public') =>
    renderToStaticMarkup(React.createElement(AdmissionSectionView, { doc, sectionKey, surface }));

  const baseDoc = (blocks, extra = {}) => ({
    v: 1,
    section: 'selection_method',
    source: 'parser',
    generator: 'test',
    generatedAt: '2026-01-01T00:00:00.000Z',
    blocks,
    ...extra
  });

  // ── 표 6종 ──────────────────────────────────────────────────────────

  {
    const doc = baseDoc([
      {
        kind: 'table',
        variant: 'selection',
        columns: [
          { role: 'type', label: '전형' },
          { role: 'name', label: '전형명' },
          { role: 'seats', label: '인원' },
          { role: 'minimum', label: '최저' },
          { role: 'method', label: '전형방법' }
        ],
        rows: [
          ['학생부교과', '일반전형', '10', { text: '3등급', badge: 'minimumHas' }, '내신 100%'],
          ['', '', '', '', '']
        ]
      }
    ]);
    const out = render(doc);
    const pass =
      findTagWithExactClass(out, 'div', 'admission-scroll-table') &&
      findTagWithExactClass(out, 'table', 'admission-data-table admission-selection-table') &&
      findTagWithExactClass(out, 'td', 'selection-type-cell') &&
      findTagWithExactClass(out, 'td', 'left selection-name-cell') &&
      findTagWithExactClass(out, 'td', 'selection-seat-cell') &&
      findTagWithExactClass(out, 'td', 'selection-minimum-cell') &&
      findTagWithExactClass(out, 'td', 'left selection-method-cell') &&
      findTagWithExactClass(out, 'span', 'admission-minimum-badge has') &&
      findTagWithExactClass(out, 'span', 'admission-minimum-badge none') &&
      out.includes('>-<') && // 빈 type/name/seats/method 셀의 리터럴 '-'
      !out.includes('muted'); // selection은 muted span을 쓰지 않는다
    record('table:selection — 클래스 5종 + badge has/none + 빈값 리터럴 -', pass, out);
  }

  {
    const doc = baseDoc([
      {
        kind: 'table',
        variant: 'change',
        columns: [
          { role: 'no', label: '번호' },
          { role: 'title', label: '변경 항목' },
          { role: 'content', label: '변경 내용' }
        ],
        rows: [
          ['1', '모집인원', '10명 → 12명'],
          ['', '', '']
        ]
      }
    ]);
    const out = render(doc);
    const pass =
      findTagWithExactClass(out, 'div', 'admission-scroll-table admission-change-scroll-table') &&
      findTagWithExactClass(out, 'table', 'admission-data-table admission-change-table admission-change-table-v87') &&
      findTagWithExactClass(out, 'td', 'change-no-cell') &&
      findTagWithExactClass(out, 'td', 'change-title-cell') &&
      findTagWithExactClass(out, 'td', 'change-content-cell') &&
      findTagWithExactClass(out, 'div', 'admission-change-plain-cell') &&
      out.includes('주요 변경') && // title 빈값 폴백
      hasClass(out, 'muted'); // content 빈값은 muted span
    record('table:change — 클래스 + 빈값 폴백(no/title 리터럴, content muted)', pass, out);
  }

  {
    const doc = baseDoc([
      {
        kind: 'table',
        variant: 'recruit',
        columns: [
          { role: 'group', label: '계열/대학' },
          { role: 'unit', label: '모집단위' },
          { role: 'data', label: '일반전형' }
        ],
        rows: [
          ['인문', '국어교육과', { chips: [{ label: '27 인원', value: '18' }] }],
          ['', '', {}]
        ]
      }
    ]);
    const out = render(doc);
    const pass =
      findTagWithExactClass(out, 'table', 'admission-data-table admission-recruit-table') &&
      findTagWithExactClass(out, 'td', 'left group-cell') &&
      findTagWithExactClass(out, 'td', 'left unit-cell') &&
      findTagWithExactClass(out, 'td', 'recruit-values-cell') &&
      findTagWithExactClass(out, 'div', 'admission-recruit-cell-values') &&
      out.includes('<b>27 인원</b>18') &&
      hasClass(out, 'muted');
    record('table:recruit — chips 구조 + 빈 값 muted', pass, out);
  }

  {
    const doc = baseDoc([
      {
        kind: 'table',
        variant: 'recruitExact',
        columns: [
          { role: 'series', label: '계열' },
          { role: 'unit', label: '모집단위' },
          { role: 'data', label: '27 인원' },
          { role: 'data', label: '26 인원' }
        ],
        fixedColumnCount: 2,
        groups: [{ name: '일반전형', count: 2 }],
        rows: [
          ['인문', '국어교육과', '18', ''],
          ['', '', '', '']
        ]
      }
    ]);
    const out = render(doc);
    const pass =
      findTagWithExactClass(out, 'table', 'admission-data-table admission-normalized-recruit-table') &&
      findTagWithExactClass(out, 'th', 'fixed-head') &&
      findTagWithExactClass(out, 'th', 'recruit-group-head') &&
      // react-dom 18.3.1 SSR은 rowSpan을 rowspan=으로, colSpan은 colSpan=
      // 그대로 출력하는 케이싱 비대칭이 있다(scripts/verify-safe-html.mjs와
      // 동일 실측 — HTML 속성명은 대소문자 무관이라 무해, CSR에선 미발생).
      /rowspan="2"/i.test(out) &&
      /colspan="2"/i.test(out) &&
      findTagWithExactClass(out, 'td', 'left series-cell') &&
      findTagWithExactClass(out, 'td', 'left') &&
      hasClass(out, 'muted');
    record('table:recruitExact — 2단 헤더(rowSpan/colSpan) + series-cell + muted', pass, out);
  }

  // ── 설계 §7-2 ② — recruitExact 비대칭 픽스처 + thead 완전 문자열 골든 ──
  //
  // 바로 위 픽스처는 fixedColumnCount:2 / groups count 2라 rowspan과 colspan이
  // 둘 다 2다. 즉 두 속성을 서로 뒤바꿔도, 헤더 두 행의 순서를 뒤집어도
  // `/rowspan="2"/i && /colspan="2"/i` 단언이 그대로 통과한다. 아래 픽스처는
  // fixedColumnCount:1 / groups count 3·2로 세 숫자를 전부 다르게 만들어
  // 그 자리바꿈을 실제로 잡는다.
  //
  // 골든 문자열은 "예뻐서" 고른 값이 아니라 통합 이전 렌더러(blocks/tables/
  // RecruitExactTable.jsx)와 바이트 동일함이 확인된 현행 출력이다. 여기서
  // 한 글자라도 달라지면 공개 표 DOM이 바뀐 것이므로 골든을 고치기 전에
  // 왜 바뀌었는지부터 답해야 한다. rowspan은 소문자, colSpan은 카멜 —
  // react-dom 18.3.1 SSR의 실측 케이싱 비대칭이며 의도적으로 보존한다.
  {
    const doc = baseDoc([
      {
        kind: 'table',
        variant: 'recruitExact',
        columns: [
          { role: 'series', label: '계열' },
          { role: 'unit', label: '가군' },
          { role: 'data', label: '나군' },
          { role: 'data', label: '다군' },
          { role: 'data', label: '라군' },
          { role: 'data', label: '마군' }
        ],
        fixedColumnCount: 1,
        groups: [
          { name: '수시', count: 3 },
          { name: '정시', count: 2 }
        ],
        rows: [['인문', '1', '2', '3', '4', '5']]
      }
    ]);
    const out = render(doc);
    const GOLDEN_THEAD =
      '<thead><tr>' +
      '<th rowspan="2" class="fixed-head">계열</th>' +
      '<th colSpan="3" class="recruit-group-head">수시</th>' +
      '<th colSpan="2" class="recruit-group-head">정시</th>' +
      '</tr><tr>' +
      '<th>가군</th><th>나군</th><th>다군</th><th>라군</th><th>마군</th>' +
      '</tr></thead>';
    record(
      'table:recruitExact 비대칭(fixed=1, groups 3+2) — thead 완전 문자열 골든',
      theadOf(out) === GOLDEN_THEAD,
      `actual=${theadOf(out)}`
    );
    // fixedColumnCount:1이므로 series-cell은 0열 하나뿐이고 1열은 left도 아니다
    // (대칭 픽스처에서는 1열이 left라 이 차이가 드러나지 않는다).
    const GOLDEN_TBODY =
      '<tbody><tr>' +
      '<td class="left series-cell">인문</td>' +
      '<td>1</td><td>2</td><td>3</td><td>4</td><td>5</td>' +
      '</tr></tbody>';
    const tbody = out.slice(out.indexOf('<tbody>'), out.indexOf('</tbody>') + 8);
    record(
      'table:recruitExact 비대칭 — tbody 고정열 경계(td 클래스) 골든',
      tbody === GOLDEN_TBODY,
      `actual=${tbody}`
    );
  }

  for (const variant of ['exam', 'minimum', 'recordInfo', 'score', 'special']) {
    const expectedTableClass = {
      exam: 'admission-data-table admission-exam-table',
      minimum: 'admission-data-table admission-minimum-table',
      recordInfo: 'admission-data-table admission-record-info-table',
      score: 'admission-data-table admission-score-table',
      special: 'admission-data-table admission-special-table'
    }[variant];
    const doc = baseDoc([
      {
        kind: 'table',
        variant,
        columns: [
          { role: 'col0', label: 'A' },
          { role: 'col1', label: 'B' },
          { role: 'col2', label: 'C' }
        ],
        rows: [
          ['x', 'y', 'z'],
          ['', '', '']
        ]
      }
    ]);
    const out = render(doc);
    const pass =
      findTagWithExactClass(out, 'table', expectedTableClass) &&
      out.match(/class="left"/g)?.length === 4 && // idx0·1 두 셀 * 2행
      hasClass(out, 'muted') &&
      !out.includes('admission-table-compact'); // 실측: compact는 현재 어느 variant에도 적용되지 않는다
    record(`table:${variant} — GenericTable idx0·1 left + muted, compact 미적용`, pass, out);
    // 설계 §7-2 ② — generic 계열 thead 완전 문자열 골든. 그룹 헤더가 없는
    // 단일 행이고 <th>에 클래스도 span도 붙지 않는다는 것이 계약이다.
    record(
      `table:${variant} — thead 완전 문자열 골든(1행, class/span 없음)`,
      theadOf(out) === '<thead><tr><th>A</th><th>B</th><th>C</th></tr></thead>',
      `actual=${theadOf(out)}`
    );
  }

  // ── 비표 블록 9종 ──────────────────────────────────────────────────

  {
    const doc = baseDoc([{ kind: 'keyValue', rows: [{ label: '지원자격', content: '고등학교 졸업(예정)자' }] }]);
    const out = render(doc);
    record('block:keyValue — 렌더 성공(legacy 대응 마크업 없음, 최소 구현)', out.includes('지원자격') && out.includes('고등학교 졸업'), out);
    // 하위 호환 잠금 — `href` 확장(수행평가 설계 리포트 §8.5)이 들어온 뒤에도 href 없는 행은
    // 앵커를 만들지 않는다. 대입 모집요강 생성 경로는 href를 만들지 않으므로 이 경로가 정상이다.
    record('block:keyValue — href 없으면 <a> 없음(기존 경로 불변)', !out.includes('<a '), out);
  }

  {
    // `href` 확장 — 외부 자료 링크라 새 창 + noopener noreferrer가 필수다.
    const doc = baseDoc([
      {
        kind: 'keyValue',
        rows: [{ label: '출처 링크', content: 'https://example.org/a', href: 'https://example.org/a' }]
      }
    ]);
    const out = render(doc);
    const pass =
      out.includes('<a class="admission-inline-link"') &&
      out.includes('href="https://example.org/a"') &&
      out.includes('target="_blank"') &&
      out.includes('rel="noopener noreferrer"') &&
      out.includes('aria-label="https://example.org/a (새 창)"');
    record('block:keyValue — href 확장이 새 창 앵커 + 안전 속성을 낸다', pass, out);
  }

  {
    // `ordered` 확장 — `<ol>` + admission-ordered-list. 기존 `<ul>` 경로는 위 픽스처가 잠근다.
    const doc = baseDoc([
      {
        kind: 'plainList',
        ordered: true,
        items: [
          { type: 'bullet', text: '첫째' },
          { type: 'bullet', text: '둘째' }
        ]
      }
    ]);
    const out = render(doc);
    const pass =
      out.includes('<ol class="admission-bullet-list admission-ordered-list">') &&
      !out.includes('<ul') &&
      (out.match(/<li>/g) || []).length === 2;
    record('block:plainList — ordered:true면 <ol>(번호 목록)', pass, out);
  }

  {
    const doc = baseDoc([
      {
        kind: 'plainList',
        items: [
          { type: 'bullet', text: '항목1' },
          { type: 'bullet', text: '항목2' },
          { type: 'subtitle', text: '※ 주요변경사항' },
          { type: 'text', text: '본문 텍스트' }
        ]
      }
    ]);
    const out = render(doc);
    const ulMatches = out.match(/<ul class="admission-bullet-list">/g) || [];
    const liMatches = out.match(/<li>/g) || [];
    const pass =
      findTagWithExactClass(out, 'div', 'admission-readable-body') &&
      ulMatches.length === 1 && // 연속 bullet 2개가 ul 하나로 묶임
      liMatches.length === 2 &&
      findTagWithExactClass(out, 'div', 'admission-subtitle-line') &&
      findTagWithExactClass(out, 'div', 'admission-text-line');
    record('block:plainList — 연속 bullet을 ul 하나로 그룹화', pass, out);
  }

  {
    const doc = baseDoc([{ kind: 'preText', text: '1줄\n2줄' }]);
    const out = render(doc);
    record('block:preText — admission-raw-pre admission-safe-text-block', findTagWithExactClass(out, 'pre', 'admission-raw-pre admission-safe-text-block'), out);
  }

  {
    const doc = baseDoc([{ kind: 'emptyBox', message: '대학별고사일 없음' }]);
    const out = render(doc);
    record('block:emptyBox — admission-empty-box', findTagWithExactClass(out, 'div', 'admission-empty-box') && out.includes('대학별고사일 없음'), out);
  }

  {
    const doc = baseDoc([{ kind: 'note', text: '실제 안내 문구' }]);
    const out = render(doc);
    record('block:note — admission-result-note(내용 있을 때만)', findTagWithExactClass(out, 'div', 'admission-result-note') && out.includes('실제 안내 문구'), out);
  }
  {
    // note 텍스트가 없으면 아예 렌더 안 함(6키 전부 빈 SECTION_NOTES와 동일 처리)
    const doc = baseDoc([{ kind: 'note', text: '' }]);
    const out = render(doc);
    record('block:note — 빈 텍스트면 렌더 생략', !out.includes('admission-result-note'), out);
  }

  {
    const doc = baseDoc([{ kind: 'footnote', items: ['교직과정', '자율전공 과정'] }]);
    const out = render(doc);
    record(
      'block:footnote — items를 공백 join해 div 하나로',
      findTagWithExactClass(out, 'div', 'admission-footnote') && out.includes('교직과정 자율전공 과정'),
      out
    );
  }

  {
    const doc = baseDoc([{ kind: 'heading', text: '국어 환산표' }]);
    const out = render(doc);
    record('block:heading — admission-subhead', findTagWithExactClass(out, 'div', 'admission-subhead') && out.includes('국어 환산표'), out);
  }

  {
    const doc = baseDoc(
      [
        {
          kind: 'group',
          title: '전형 일정',
          children: [{ kind: 'note', text: '내용' }]
        }
      ],
      { wrapModifier: 'special' }
    );
    const out = render(doc);
    const pass =
      findTagWithExactClass(out, 'section', 'admission-special-block') &&
      findTagWithExactClass(out, 'div', 'admission-special-title') &&
      findTagWithExactClass(out, 'div', 'admission-raw-section-wrap admission-special-wrap') &&
      out.includes('전형 일정') &&
      out.includes('내용');
    record('block:group — section.admission-special-block + wrapModifier=special', pass, out);
  }

  {
    const doc = baseDoc([
      { kind: 'rawHtml', html: '<table class="foo"><tr><td colspan="2">x</td></tr></table>', reason: 'curated-html' }
    ]);
    const out = render(doc);
    const pass =
      findTagWithExactClass(out, 'div', 'admission-existing-html') &&
      out.includes('class="foo"') &&
      /colspan="2"/i.test(out) &&
      countTag(out, 'table') === 1;
    record('block:rawHtml — SafeHtml + admission-existing-html 래퍼', pass, out);
  }

  function countTag(html, tag) {
    const re = new RegExp(`<${tag}(?=[\\s/>])`, 'gi');
    return (html.match(re) || []).length;
  }

  // ── 섹션 제목 + 루트 wrap ────────────────────────────────────────────
  {
    const doc = baseDoc([{ kind: 'note', text: '내용' }]);
    const out = render(doc, 'selection_method');
    const pass =
      out.startsWith('<div class="admission-hwp-section-title">2. 전형방법</div>') &&
      findTagWithExactClass(out, 'div', 'admission-raw-section-wrap') &&
      out.indexOf('admission-hwp-section-title') < out.indexOf('admission-raw-section-wrap');
    record('root — 섹션 제목(HWP_SECTION_TITLES) + admission-raw-section-wrap 형제 배치', pass, out);
  }

  // 2026-08-06 dev DB 실측 확정: curated-html이 이미 admission-hwp-section-title을
  // 품고 있으면(534셀) withHwpSectionHeading과 동일 규칙으로 제목 렌더를
  // 생략해야 한다 — 안 그러면 어드민 화면에서 제목이 두 번 찍힌다.
  {
    const doc = baseDoc([
      {
        kind: 'rawHtml',
        html: '<div class="admission-hwp-section-title">2. 전형방법</div><div class="admission-scroll-table">x</div>',
        reason: 'curated-html'
      }
    ]);
    const out = render(doc, 'selection_method');
    const titleCount = (out.match(/admission-hwp-section-title/g) || []).length;
    const pass = titleCount === 1; // rawHtml 안의 것 하나만 — AdmissionSectionView가 또 추가하지 않음
    record('root — 선두 rawHtml에 이미 heading 있으면 제목 중복 렌더 안 함', pass, `titleCount=${titleCount} ${out}`);
  }
  {
    const doc = baseDoc([
      { kind: 'rawHtml', html: '<div class="admission-scroll-table">heading 없는 본문</div>', reason: 'curated-html' }
    ]);
    const out = render(doc, 'selection_method');
    const titleCount = (out.match(/admission-hwp-section-title/g) || []).length;
    const pass = titleCount === 1 && out.includes('2. 전형방법'); // 이 경우엔 정상적으로 렌더돼야 함
    record('root — 선두 rawHtml에 heading 없으면 제목 정상 렌더', pass, `titleCount=${titleCount} ${out}`);
  }

  {
    const out = render(null);
    record('root — doc null이면 렌더 없음', out === '', out);
  }
  {
    const out = render({ v: 1, section: 'selection_method', blocks: [] });
    record('root — blocks 빈 배열이면 렌더 없음(isEmptyDoc)', out === '', out);
  }
  {
    const out = render({ v: 2, section: 'selection_method', blocks: [{ kind: 'note', text: 'x' }] });
    record('root — v!==1이면 렌더 없음(조용한 성공 금지)', out === '', out);
  }

  // ── 결과 출력 ──────────────────────────────────────────────────────
  console.log('=== 섹션 문서 React 렌더 컴포넌트 검증 결과 ===\n');
  // 상시 경고: Gate B(verify-admission-doc-equivalence.mjs, 실데이터 2506건)
  // 코퍼스에는 아래 4종이 0건이다(2026-08-07 실측 — variant 집계 change 414 /
  // selection 396 / recordInfo 414 / exam 360 / score 370 / minimum 252 /
  // recruit 207 / special 84, kind 집계에 rawHtml·keyValue 없음). 즉 이 경로들의
  // 회귀는 Gate B가 GREEN이어도 전혀 잡히지 않는다 — 아래 합성 픽스처가 유일한 탐지기다.
  console.log(
    '[block-render] ⚠ Gate B 실데이터 코퍼스(2506건) 미포함 경로 — variant: recruitExact/generic, kind: rawHtml/keyValue. 이 4종은 아래 합성 픽스처가 유일한 회귀 탐지기다.\n'
  );
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
