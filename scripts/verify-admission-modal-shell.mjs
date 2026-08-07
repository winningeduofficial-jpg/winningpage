// =====================================================================
// 공개 대학모집요강 모달 "껍데기" 골든 검증 스크립트
//
// 왜 필요한가
// -----------
// 기존 검증 8종(Gate A/A2/B, drift, block-render, table-editor, bulk-xlsx,
// safe-html, renderer-total, regression-guard)은 전부 **섹션 문서 블록의
// 렌더 출력**만 본다. 모달 껍데기 — 오버레이 / sheet / head / body /
// 하단 프록시 가로 스크롤바 shell / 푸터 — 를 보는 게이트는 **0개**였다.
// 즉 껍데기를 컴포넌트로 추출하는 리팩터는 기존 게이트 전량 통과 상태로
// 공개 화면을 조용히 바꿀 수 있었다. 이 스크립트가 그 사각을 메운다.
//
// 자기증명 순환(self-proving circularity) 회피
// ---------------------------------------------
// 골든을 "새로 만든 컴포넌트 출력"으로 생성하면, 옮기다 깨진 결과가 그대로
// 정답으로 굳는다. 그래서 이 스크립트는 골든을 두 갈래로 뜬다.
//
//  (A) 브라우저 캡처 골든 — scripts/__fixtures__/admission-modal-shell.browser.json
//      리팩터 착수 **전** 실제 dev 서버 화면에서 뜬 outerHTML + 프록시
//      스크롤바 실측 수치. 출처가 코드가 아니라 "굴러가던 화면"이다.
//      (수치를 함께 뜨는 이유: 마크업 골든은 스크롤 "거리"를 못 본다.
//       프록시 바가 무증상으로 죽는 경로가 이 저장소의 최대 위험이다.)
//
//  (B) SSR 바이트 골든 — scripts/__fixtures__/admission-modal-shell.ssr.json
//      src/pages/AdmissionGuidelines.jsx 의 모달 JSX 영역을 **소스에서
//      기계적으로 잘라내** 하네스로 감싸고 renderToStaticMarkup 한 결과.
//      리팩터 前 골든은 `--capture --from-rev <리팩터 직전 커밋>` 으로
//      그 커밋의 소스에서 뜬다 — 사람이 다시 타이핑한 사본이 아니다.
//      슬라이스는 매 실행마다 **현재 소스 파일**에서 다시 뜨므로, 이
//      골든은 사본이 아니라 실제 페이지 파일을 검사한다.
//
// 슬라이스 규칙 (S2 리팩터 후에도 반드시 유지할 것)
// ------------------------------------------------
//   src/pages/AdmissionGuidelines.jsx 안에
//     <indent>{selectedInfo ? (
//     ... 모달 전체 ...
//     <indent>) : null}
//   형태가 **정확히 1개** 있어야 한다. 이 앵커가 깨지면 스크립트가 죽는다
//   (조용히 통과하지 않는다).
//
// 실행:
//   node scripts/verify-admission-modal-shell.mjs
//   node scripts/verify-admission-modal-shell.mjs --capture [--from-rev <rev>]
//   node scripts/verify-admission-modal-shell.mjs --browser <captured.json>
//
// 제약은 다른 verify 스크립트와 동일: npm install 금지, jsdom 없음.
// esbuild(번들 모드) + react-dom/server 만 쓴다. react/react-dom 은
// external 로 남겨 React 인스턴스 중복을 피한다.
// =====================================================================

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as esbuild from 'esbuild';

const REPO_ROOT = path.resolve(new URL('.', import.meta.url).pathname, '..');
const PAGE_REL = 'src/pages/AdmissionGuidelines.jsx';
const PAGE_PATH = path.join(REPO_ROOT, PAGE_REL);
const FIXTURE_DIR = path.join(REPO_ROOT, 'scripts/__fixtures__');
const SSR_FIXTURE = path.join(FIXTURE_DIR, 'admission-modal-shell.ssr.json');
const BROWSER_FIXTURE = path.join(FIXTURE_DIR, 'admission-modal-shell.browser.json');

const SLICE_START = '{selectedInfo ? (';
const SLICE_END = ') : null}';

// ── 1. 모달 JSX 영역 기계 슬라이스 ─────────────────────────────────────

function sliceModalRegion(sourceText) {
  const lines = sourceText.split('\n');
  const starts = [];
  lines.forEach((line, idx) => {
    if (line.trim() === SLICE_START) starts.push(idx);
  });
  if (starts.length !== 1) {
    throw new Error(
      `모달 슬라이스 앵커 "${SLICE_START}" 가 ${starts.length}개다(정확히 1개여야 함). ` +
        '리팩터로 앵커가 사라졌다면 이 스크립트의 슬라이스 규칙 주석을 읽고 앵커를 복원하라.'
    );
  }
  const start = starts[0];
  const indent = lines[start].slice(0, lines[start].length - lines[start].trimStart().length);
  let end = -1;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (lines[i] === `${indent}${SLICE_END}`) {
      end = i;
      break;
    }
  }
  if (end === -1) {
    throw new Error(`모달 슬라이스 종료 앵커 "${indent}${SLICE_END}" 를 찾지 못했다.`);
  }
  return { text: lines.slice(start, end + 1).join('\n'), startLine: start + 1, endLine: end + 1 };
}

// 파일 머리의 import 문을 통째로 모은다(다중 라인 지원).
function collectImportStatements(sourceText) {
  const lines = sourceText.split('\n');
  const statements = [];
  let buffer = null;
  for (const line of lines) {
    if (buffer === null && !line.startsWith('import ')) {
      if (line.trim() === '' || line.startsWith('//')) continue;
      if (statements.length > 0) break; // import 블록 종료
      continue;
    }
    buffer = buffer === null ? line : `${buffer}\n${line}`;
    if (line.trimEnd().endsWith(';')) {
      statements.push(buffer);
      buffer = null;
    }
  }
  return statements;
}

function bindingsOf(statement) {
  const clause = statement.slice('import'.length, statement.lastIndexOf(' from ')).trim();
  const names = [];
  const braceStart = clause.indexOf('{');
  const head = (braceStart === -1 ? clause : clause.slice(0, braceStart)).replace(/,\s*$/, '').trim();
  if (head) names.push(head.replace(/^\*\s+as\s+/, '').trim());
  if (braceStart !== -1) {
    const inner = clause.slice(braceStart + 1, clause.lastIndexOf('}'));
    inner
      .split(',')
      .map((piece) => piece.trim())
      .filter(Boolean)
      .forEach((piece) => {
        const parts = piece.split(/\s+as\s+/);
        names.push((parts[1] || parts[0]).trim());
      });
  }
  return names.filter(Boolean);
}

function specifierOf(statement) {
  const m = /from\s+'([^']+)';\s*$/.exec(statement);
  return m ? m[1] : null;
}

// 하네스를 저장소 루트에 쓰므로, 페이지 기준 상대 경로를 루트 기준으로 다시 쓴다.
function rewriteSpecifier(statement) {
  const spec = specifierOf(statement);
  if (!spec || !spec.startsWith('.')) return statement;
  const abs = path.resolve(path.dirname(PAGE_PATH), spec);
  let next = path.relative(REPO_ROOT, abs);
  if (!next.startsWith('.')) next = `./${next}`;
  return statement.replace(/from\s+'[^']+';\s*$/, `from '${next}';`);
}

function buildHarnessSource(sourceText) {
  const { text: slice, startLine, endLine } = sliceModalRegion(sourceText);
  const imports = collectImportStatements(sourceText)
    .filter((statement) =>
      bindingsOf(statement).some((name) => new RegExp(`\\b${name}\\b`).test(slice))
    )
    .map(rewriteSpecifier);

  const source = `// 자동 생성 — verify-admission-modal-shell.mjs. 커밋하지 않는다.
// 원본: ${PAGE_REL} ${startLine}-${endLine} 행 기계 슬라이스.
import { useRef as __useRef } from 'react';
${imports.join('\n')}

export default function __ModalRegionHarness({ selectedInfo, modalXScroll }) {
  const modalSheetRef = __useRef(null);
  const modalCloseButtonRef = __useRef(null);
  const modalBodyRef = __useRef(null);
  const modalXScrollRef = __useRef(null);
  const modalTriggerRef = __useRef(null);
  const setSelectedInfo = () => {};
  const handleRetryInfo = () => {};
  return (
    <>
${slice}
    </>
  );
}
`;
  return { source, startLine, endLine, importCount: imports.length };
}

// ── 2. 번들 + 로드 ─────────────────────────────────────────────────────

async function loadHarness(harnessSource) {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const harnessPath = path.join(REPO_ROOT, `.tmp-modal-shell-harness-${stamp}.jsx`);
  const bundlePath = path.join(REPO_ROOT, `.tmp-modal-shell-bundle-${stamp}.mjs`);
  fs.writeFileSync(harnessPath, harnessSource);
  try {
    const result = await esbuild.build({
      entryPoints: [harnessPath],
      bundle: true,
      format: 'esm',
      jsx: 'automatic',
      jsxImportSource: 'react',
      platform: 'node',
      // platform:'node' 기본 해석은 CJS(main)를 먼저 집는다. lucide-react 의
      // CJS 번들은 dynamic require('react') 를 쓰는데 external 로 남긴 react 와
      // 만나면 ESM 출력에서 터진다. 브라우저 번들러(vite)와 같은 ESM 진입점을
      // 쓰도록 mainFields 를 명시한다.
      mainFields: ['module', 'main'],
      external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/server'],
      write: false
    });
    fs.writeFileSync(bundlePath, result.outputFiles[0].text);
    const mod = await import(`file://${bundlePath}`);
    return mod.default;
  } finally {
    fs.rmSync(harnessPath, { force: true });
    fs.rmSync(bundlePath, { force: true });
  }
}

// ── 3. 렌더 케이스 ─────────────────────────────────────────────────────
//
// AdmissionSurface 는 표면 CSS 전량을 <style> 하나로 뱉는다. 그 본문까지
// 골든에 박으면 (a) 픽스처가 수십 KB로 불고 (b) 이 게이트가 "표면 CSS
// 게이트"로 변질된다. 껍데기 골든의 관심사가 아니므로 <style> 본문은
// sha256 로 접는다 — 내용이 바뀌면 해시가 바뀌므로 민감도는 유지된다.

function foldStyleBodies(html) {
  return html.replace(/<style>([\s\S]*?)<\/style>/g, (_all, body) => {
    const sha = crypto.createHash('sha256').update(body).digest('hex').slice(0, 16);
    return `<style>[folded len=${body.length} sha256=${sha}]</style>`;
  });
}

const SECTION = { key: 'selection_method', label: '전형방법' };

const SAMPLE_DOC = {
  v: 1,
  section: 'selection_method',
  source: 'parser',
  generator: 'modal-shell-fixture',
  generatedAt: '2026-01-01T00:00:00.000Z',
  blocks: [
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
      rows: [['학생부교과', '일반전형', '10', '3등급', '내신 100%']]
    }
  ]
};

const BASE = {
  universityName: '검증대학교',
  title: '전형방법',
  cacheKey: 'fixture:selection_method',
  section: SECTION,
  row: { id: 'fixture' }
};

const CASES = {
  loading: {
    selectedInfo: { ...BASE, status: 'loading', mode: 'text', doc: null, html: '', text: '', isHtml: false },
    modalXScroll: { visible: false, width: 0 }
  },
  error: {
    selectedInfo: { ...BASE, status: 'error', mode: 'text', doc: null, html: '', text: '', isHtml: false },
    modalXScroll: { visible: false, width: 0 }
  },
  doc: {
    selectedInfo: { ...BASE, status: 'ready', mode: 'doc', doc: SAMPLE_DOC, html: '', text: '', isHtml: false },
    modalXScroll: { visible: false, width: 0 }
  },
  // 프록시 바가 붙는 유일한 조건은 `isHtml && modalXScroll.visible` 이다
  // (AdmissionGuidelines.jsx 원문). doc 본문 + 프록시 조합으로 하단
  // 셸/트랙/inner 인라인 width 까지 골든에 넣는다.
  docWithProxyBar: {
    selectedInfo: { ...BASE, status: 'ready', mode: 'doc', doc: SAMPLE_DOC, html: '', text: '', isHtml: true },
    modalXScroll: { visible: true, width: 1280 }
  },
  // SSR 에는 DOMParser 가 없어 SafeHtml 이 null 을 반환한다(SafeHtml.jsx
  // :217 `typeof DOMParser === 'undefined'`). 즉 이 케이스는 본문 내용이
  // 아니라 **html 분기의 래퍼 마크업**을 고정한다. 실제 html 본문 렌더는
  // verify-safe-html / Gate A·B 와 브라우저 캡처 골든이 덮는다.
  html: {
    selectedInfo: {
      ...BASE,
      status: 'ready',
      mode: 'html',
      doc: null,
      html: '<div class="admission-existing-html"><table><tr><td>a</td></tr></table></div>',
      text: '',
      isHtml: true
    },
    modalXScroll: { visible: true, width: 1567 }
  },
  text: {
    selectedInfo: { ...BASE, status: 'ready', mode: 'text', doc: null, html: '', text: '평문 본문입니다.', isHtml: false },
    modalXScroll: { visible: false, width: 0 }
  },
  empty: {
    selectedInfo: { ...BASE, status: 'ready', mode: 'text', doc: null, html: '', text: '', isHtml: false },
    modalXScroll: { visible: false, width: 0 }
  }
};

async function renderAllCases(sourceText) {
  const { source, startLine, endLine, importCount } = buildHarnessSource(sourceText);
  const Harness = await loadHarness(source);
  const rendered = {};
  for (const [name, props] of Object.entries(CASES)) {
    rendered[name] = foldStyleBodies(renderToStaticMarkup(React.createElement(Harness, props)));
  }
  return { rendered, startLine, endLine, importCount };
}

// ── 4. 모드별 진입점 ───────────────────────────────────────────────────

function readSourceAt(rev) {
  if (!rev) return fs.readFileSync(PAGE_PATH, 'utf8');
  return execFileSync('git', ['show', `${rev}:${PAGE_REL}`], { cwd: REPO_ROOT, encoding: 'utf8' });
}

function gitRevParse(rev) {
  return execFileSync('git', ['rev-parse', rev], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
}

async function capture(rev) {
  const sourceText = readSourceAt(rev);
  const { rendered, startLine, endLine } = await renderAllCases(sourceText);
  const resolved = gitRevParse(rev || 'HEAD');
  fs.mkdirSync(FIXTURE_DIR, { recursive: true });
  const payload = {
    __why: [
      '공개 대학모집요강 모달 껍데기의 SSR 바이트 골든.',
      '이 값들은 "보기 좋아서 고른 값"이 아니라, 아래 sourceRev 커밋의',
      `${PAGE_REL} 소스에서 모달 JSX 영역을 기계적으로 잘라내 그대로`,
      'renderToStaticMarkup 한 출력이다. 재생성 명령이 재현성을 보장한다.',
      '골든을 새 컴포넌트 출력으로 다시 뜨면 자기증명 순환이 된다 — 하지 말 것.'
    ].join(' '),
    sourceRev: resolved,
    sourceRevMeansPreRefactor: rev ? `명시된 rev(${rev}) 소스에서 캡처` : '작업트리 소스에서 캡처',
    sourceSlice: `${PAGE_REL}:${startLine}-${endLine}`,
    regenerate: `node scripts/verify-admission-modal-shell.mjs --capture --from-rev ${resolved.slice(0, 7)}`,
    note: '<style> 본문은 sha256 로 접혀 있다(껍데기 게이트의 관심사가 아니므로). 접기 규칙은 스크립트의 foldStyleBodies 참고.',
    cases: rendered
  };
  fs.writeFileSync(SSR_FIXTURE, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`골든 기록: ${path.relative(REPO_ROOT, SSR_FIXTURE)}`);
  console.log(`  sourceRev = ${resolved}`);
  console.log(`  slice     = ${PAGE_REL}:${startLine}-${endLine}`);
  for (const [name, html] of Object.entries(rendered)) {
    console.log(`  ${name.padEnd(16)} ${html.length} bytes`);
  }
}

async function verifySsr(results, record) {
  if (!fs.existsSync(SSR_FIXTURE)) {
    record('ssr:fixture-exists', false, `${path.relative(REPO_ROOT, SSR_FIXTURE)} 없음 — --capture 로 먼저 골든을 떠라`);
    return;
  }
  const golden = JSON.parse(fs.readFileSync(SSR_FIXTURE, 'utf8'));
  const { rendered } = await renderAllCases(readSourceAt(null));

  const goldenNames = Object.keys(golden.cases);
  const actualNames = Object.keys(rendered);
  record(
    'ssr:case-set',
    goldenNames.length === actualNames.length && goldenNames.every((n) => actualNames.includes(n)),
    `골든 ${goldenNames.length}종 / 현재 ${actualNames.length}종`
  );

  for (const name of goldenNames) {
    const expected = golden.cases[name];
    const actual = rendered[name];
    if (expected === actual) {
      record(`ssr:${name}`, true, `${actual.length} bytes 일치`);
      continue;
    }
    let at = 0;
    while (at < expected.length && at < actual.length && expected[at] === actual[at]) at += 1;
    record(
      `ssr:${name}`,
      false,
      `바이트 불일치 @${at}\n      기대: ${JSON.stringify(expected.slice(Math.max(0, at - 60), at + 120))}\n      실제: ${JSON.stringify(actual.slice(Math.max(0, at - 60), at + 120))}`
    );
  }
}

// 프록시 가로 스크롤바 배선이 별도 모듈로 빠지면, effect 의존성 배열의
// `visible` 자기참조가 유지되는지 정적으로 확인한다. 이 의존성이 떨어지면
// 바 DOM 이 생긴 뒤 리스너를 붙이는 재실행이 사라져 프록시가 **무증상으로**
// 죽는다(마크업 골든은 못 잡는다).
const PROXY_MODULE = path.join(REPO_ROOT, 'src/components/admission/modal/modalProxyXScroll.js');

function verifyProxyDeps(record) {
  if (!fs.existsSync(PROXY_MODULE)) {
    record('proxy:module', true, '아직 추출 전 — 건너뜀(추출되면 자동으로 검사 대상)');
    return;
  }
  const src = fs.readFileSync(PROXY_MODULE, 'utf8');
  const deps = /\}\s*,\s*\[([^\]]*)\]\s*\)/g;
  const found = [];
  let m = deps.exec(src);
  while (m) {
    found.push(m[1].replace(/\s+/g, ' ').trim());
    m = deps.exec(src);
  }
  record(
    'proxy:deps-include-visible',
    found.some((d) => /visible/.test(d)),
    `발견한 의존성 배열: ${JSON.stringify(found)}`
  );
}

// 브라우저 캡처 골든 대조. 새 캡처 JSON 을 인자로 받아 케이스별로
// outerHTML 문자열 완전 일치 + 프록시 실측 수치 일치를 본다.
function verifyBrowser(capturedPath, record) {
  if (!fs.existsSync(BROWSER_FIXTURE)) {
    record('browser:fixture-exists', false, `${path.relative(REPO_ROOT, BROWSER_FIXTURE)} 없음`);
    return;
  }
  const golden = JSON.parse(fs.readFileSync(BROWSER_FIXTURE, 'utf8'));
  const actual = JSON.parse(fs.readFileSync(capturedPath, 'utf8'));
  for (const [name, g] of Object.entries(golden.cases)) {
    const a = actual[name] || (actual.cases && actual.cases[name]);
    if (!a) {
      record(`browser:${name}`, false, '새 캡처에 해당 케이스 없음');
      continue;
    }
    // html: null 인 케이스는 "수치 전용"(용량 때문에 마크업을 안 담은 케이스)이다.
    if (g.html === null) {
      record(`browser:${name}:html`, true, '수치 전용 케이스 — 마크업 비교 없음');
    } else if (g.html !== a.html) {
      let at = 0;
      while (at < g.html.length && at < a.html.length && g.html[at] === a.html[at]) at += 1;
      record(
        `browser:${name}:html`,
        false,
        `outerHTML 불일치 @${at}\n      기대: ${JSON.stringify(g.html.slice(Math.max(0, at - 60), at + 120))}\n      실제: ${JSON.stringify(a.html.slice(Math.max(0, at - 60), at + 120))}`
      );
    } else {
      record(`browser:${name}:html`, true, `${a.html.length} bytes 일치`);
    }
    if (g.metrics) {
      const same =
        a.metrics &&
        a.metrics.barScrollWidth === g.metrics.barScrollWidth &&
        a.metrics.targetScrollWidth === g.metrics.targetScrollWidth &&
        a.metrics.innerStyleWidth === g.metrics.innerStyleWidth &&
        a.metrics.movedToEnd === true;
      record(
        `browser:${name}:proxy-scroll`,
        Boolean(same),
        `기대 ${JSON.stringify(g.metrics)} / 실제 ${JSON.stringify(a.metrics)}`
      );
    }
  }
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--capture')) {
    const i = argv.indexOf('--from-rev');
    await capture(i === -1 ? null : argv[i + 1]);
    return;
  }

  const results = [];
  const record = (name, pass, detail) => results.push({ name, pass, detail });

  const browserIdx = argv.indexOf('--browser');
  if (browserIdx !== -1) {
    verifyBrowser(argv[browserIdx + 1], record);
  } else {
    await verifySsr(results, record);
    verifyProxyDeps(record);
  }

  let passed = 0;
  for (const r of results) {
    if (r.pass) passed += 1;
    console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.pass ? '' : `\n      ${r.detail}`}`);
  }
  console.log(`\nmodal-shell: ${passed}/${results.length} 통과`);
  if (passed !== results.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
