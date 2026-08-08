// =====================================================================
// 어드민 편집 모달 **전용** 표면 CSS(AdmissionEditorSurface.jsx) 격리 검증
//
// 무엇을 지키나
// -------------
// 사용자 요청: "전형방법 편집 모달의 '최저' 컬럼이 너무 좁다. 더 늘여라."
// 늘리는 건 쉽지만, 공개 모달(/admission/guidelines)과 편집 모달이 **같은
// `admission-surface` <style>** 을 공유한다는 사실이 함정이다(1440px 실측:
// 두 모달 컬럼 폭 104·216·112·120·462 완전 일치). 공개 폭을 같이 넓히면
// 198개 대학·557행에서 전형방법 컬럼이 462 → 406px(-12%)로 좁아지는데,
// 정작 공개에서 최저가 wrap 되는 셀은 조선대 1행뿐이다 — 순손실이다.
//
// 그래서 확대를 `.admission-table-editor`(편집 DOM 에만 붙는 클래스) 밑으로
// 스코프했다. 이 스크립트는 그 격리가 나중에 조용히 무너지는 4가지 경로를
// 막는다:
//   (1) 편집 규칙이 AdmissionSurface(공개 공유) 로 이주             → surf:1
//   (2) 새 셀렉터에서 `.admission-table-editor` 를 빼먹음            → surf:2
//   (3) `admission-table-editor` 훅이 공개 렌더 경로로 샘            → surf:4/5
//   (4) 공개 폭 규칙 자체가 바뀜(빨간 깃발 항목이 몰래 실행됨)       → surf:8
//
// 그리고 "규칙이 통째로 사라졌는데 스캔 테스트는 전부 통과"하는 가짜 GREEN
// 을 막기 위해 확대 규칙 자체의 존재도 단언한다(surf:7).
//
// 다른 verify 스크립트와 같은 제약: npm install 금지, jsdom 없음.
// esbuild(번들 모드) + react-dom/server 만 쓴다.
//
// 실행: node scripts/verify-admission-editor-surface.mjs
// =====================================================================

import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as esbuild from 'esbuild';

const REPO_ROOT = path.resolve(new URL('.', import.meta.url).pathname, '..');
const EDITOR_SURFACE_REL = 'src/components/admission/editor/AdmissionEditorSurface.jsx';
const PUBLIC_SURFACE_REL = 'src/components/admission/AdmissionSurface.jsx';
const TABLE_EDITOR_REL = 'src/components/admission/editor/TableBlockEditor.jsx';
const TABLE_EDITOR_VERIFY_REL = 'scripts/verify-admission-table-editor.mjs';
const SECTION_VIEW_REL = 'src/components/admission/AdmissionSectionView.jsx';
const EDIT_MODAL_REL = 'src/components/admission/editor/AdmissionSectionEditModal.jsx';

const EDIT_HOOK = 'admission-table-editor';

const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');

// ── CSS 본문 추출 ──────────────────────────────────────────────────────
//
// 소스에는 "px"·"admission-table-editor" 같은 토큰이 주석에 잔뜩 나온다
// (근거 실측치를 원문 그대로 보존하는 이 저장소의 관행). 단순 grep 은
// 주석에 걸려 오탐하므로, <style>{`…`}</style> 안쪽만 잘라내고 CSS 주석까지
// 제거한 뒤에 검사한다.
function styleBodyOf(source) {
  const start = source.indexOf('<style>{`');
  const end = source.lastIndexOf('`}</style>');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`<style>{\`…\`}</style> 블록을 찾지 못했다 — 셀렉터 스캔이 불가능하다.`);
  }
  return source.slice(start + '<style>{`'.length, end);
}

function stripCssComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

// 셀렉터 목록 추출: `{` 직전 텍스트를 셀렉터로 보고, at-rule(@media 등)과
// 선언 블록 내부는 건너뛴다. 이 파일은 규칙이 몇 개뿐이라 완전한 CSS 파서가
// 필요 없다(중첩은 @media 1단뿐).
function selectorsOf(css) {
  const selectors = [];
  let buf = '';
  let depth = 0;
  for (let i = 0; i < css.length; i += 1) {
    const ch = css[i];
    if (ch === '{') {
      const head = buf.trim();
      buf = '';
      if (head.startsWith('@')) {
        // at-rule — 프렐류드는 셀렉터가 아니다. 안쪽을 계속 훑는다.
        depth += 1;
        continue;
      }
      depth += 1;
      for (const part of head.split(',')) {
        const s = part.trim();
        if (s) selectors.push(s);
      }
      // 선언 블록 본문은 셀렉터가 아니므로 대응 `}` 까지 건너뛴다.
      let inner = 1;
      i += 1;
      while (i < css.length && inner > 0) {
        if (css[i] === '{') inner += 1;
        else if (css[i] === '}') inner -= 1;
        i += 1;
      }
      i -= 1;
      depth -= 1;
      continue;
    }
    if (ch === '}') {
      depth = Math.max(0, depth - 1);
      buf = '';
      continue;
    }
    buf += ch;
  }
  return selectors;
}

// ── 공개 렌더 경로 SSR (surf:4) ────────────────────────────────────────
async function loadAdmissionSectionView() {
  const result = await esbuild.build({
    entryPoints: [path.join(REPO_ROOT, SECTION_VIEW_REL)],
    bundle: true,
    format: 'esm',
    jsx: 'automatic',
    jsxImportSource: 'react',
    platform: 'node',
    mainFields: ['module', 'main'],
    external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/server'],
    write: false
  });
  const tmpFile = path.join(
    REPO_ROOT,
    `.tmp-editor-surface-verify-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`
  );
  fs.writeFileSync(tmpFile, result.outputFiles[0].text);
  try {
    const mod = await import(`file://${tmpFile}`);
    return mod.default;
  } finally {
    fs.rmSync(tmpFile, { force: true });
  }
}

const SELECTION_DOC = {
  v: 1,
  section: 'selection_method',
  source: 'parser',
  generator: 'editor-surface-verify',
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
      rows: [['학생부교과', '일반전형', '10', { text: '있음: 일부', badge: 'minimumHas' }, '내신 100%']]
    }
  ]
};

async function main() {
  const results = [];
  const record = (id, name, pass, detail) => results.push({ id, name, pass, detail });

  const editorSurfaceSrc = read(EDITOR_SURFACE_REL);
  const publicSurfaceSrc = read(PUBLIC_SURFACE_REL);
  const editorCss = stripCssComments(styleBodyOf(editorSurfaceSrc));
  const publicCss = stripCssComments(styleBodyOf(publicSurfaceSrc));

  // ── surf:1 — 편집 훅이 공개 표면 CSS 로 이주하지 않았다 ───────────────
  {
    const pass = !publicCss.includes(EDIT_HOOK);
    record(
      'surf:1',
      `${PUBLIC_SURFACE_REL} CSS 본문에 '${EDIT_HOOK}' 토큰이 없다(편집 전용 규칙의 공개 이주 금지)`,
      pass,
      pass ? '' : '공개 표면 CSS에 편집 전용 훅이 들어왔다 — modal-shell 골든 sha 재생성까지 유발한다.'
    );
  }

  // ── surf:2 — 모든 셀렉터가 편집 훅으로 스코프됐다 ────────────────────
  {
    const selectors = selectorsOf(editorCss);
    const unscoped = selectors.filter((s) => !s.includes(`.${EDIT_HOOK}`));
    const pass = selectors.length > 0 && unscoped.length === 0;
    record(
      'surf:2',
      `${EDITOR_SURFACE_REL} 의 모든 셀렉터가 '.${EDIT_HOOK}' 를 포함한다(스코프 누락 = 공개 오염)`,
      pass,
      `selectors=${selectors.length} unscoped=${JSON.stringify(unscoped)}`
    );
  }

  // ── surf:3 — 길이 단위는 rem/% 만 (사용자 규칙) ──────────────────────
  {
    // 값 위치의 px 만 본다. 셀렉터의 nth-child(4) 등은 대상이 아니다.
    const declarations = editorCss.match(/:[^;{}]*/g) || [];
    const pxHits = declarations.filter((d) => /\d\s*px\b/.test(d));
    const pass = pxHits.length === 0;
    record(
      'surf:3',
      `${EDITOR_SURFACE_REL} CSS 값에 px 길이가 없다(rem/% 만)`,
      pass,
      `pxHits=${JSON.stringify(pxHits)}`
    );
  }

  // ── surf:4 — 공개 렌더 경로 SSR 에 편집 훅이 없다 ────────────────────
  {
    const AdmissionSectionView = await loadAdmissionSectionView();
    const out = renderToStaticMarkup(
      React.createElement(AdmissionSectionView, {
        doc: SELECTION_DOC,
        sectionKey: 'selection_method',
        surface: 'public'
      })
    );
    const pass = out.length > 0 && !out.includes(EDIT_HOOK) && out.includes('admission-selection-table');
    record(
      'surf:4',
      `공개 렌더(AdmissionSectionView → selection 표) 출력에 '${EDIT_HOOK}' 클래스가 없다`,
      pass,
      pass ? '' : out.slice(0, 400)
    );
  }

  // ── surf:5 — 편집 훅의 정의처가 1곳뿐이다 ────────────────────────────
  {
    // src/ 전수 스캔. 클래스로 **붙이는** 곳만 센다(주석 언급 제외).
    const files = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(jsx?|tsx?|css)$/.test(entry.name)) files.push(full);
      }
    };
    walk(path.join(REPO_ROOT, 'src'));
    // 파일 단위가 아니라 **부착 횟수** 단위로 센다 — 같은 파일 안에 두 번째
    // 부착이 생겨도(중첩 래퍼 등) 스코프는 똑같이 흐려진다.
    const attachments = [];
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      const withoutLineComments = src.replace(/^[ \t]*\/\/.*$/gm, '');
      const withoutBlockComments = withoutLineComments.replace(/\/\*[\s\S]*?\*\//g, '');
      const hits = withoutBlockComments.match(
        new RegExp(`className=["'\`][^"'\`]*${EDIT_HOOK}`, 'g')
      );
      for (let i = 0; i < (hits ? hits.length : 0); i += 1) {
        attachments.push(path.relative(REPO_ROOT, f));
      }
    }
    attachments.sort();
    const pass = attachments.length === 1 && attachments[0] === TABLE_EDITOR_REL;
    record(
      'surf:5',
      `'${EDIT_HOOK}' 클래스 부착이 ${TABLE_EDITOR_REL} 단 1회뿐이다(훅 중복 = 스코프 희석)`,
      pass,
      JSON.stringify(attachments)
    );
  }

  // ── surf:6 — 파리티 축이 몰래 늘어나지 않았다 ────────────────────────
  {
    const src = read(TABLE_EDITOR_VERIFY_REL);
    const m = src.match(/const EDIT_ONLY_WRAP_TOKENS = \[([^\]]*)\]/);
    const tokens = m
      ? m[1]
          .split(',')
          .map((t) => t.trim().replace(/^['"]|['"]$/g, ''))
          .filter(Boolean)
      : null;
    const pass =
      Array.isArray(tokens) &&
      tokens.length === 2 &&
      tokens.includes('max-w-full') &&
      tokens.includes('overflow-x-auto');
    record(
      'surf:6',
      "EDIT_ONLY_WRAP_TOKENS 가 여전히 2개(max-w-full, overflow-x-auto) — 편집/뷰 파리티 축 불변",
      pass,
      JSON.stringify(tokens)
    );
  }

  // ── surf:7 — 확대 규칙이 실제로 있다(가짜 GREEN 방지) ────────────────
  //
  // surf:1~6 은 전부 "없어야 할 것이 없다" 형태라 AdmissionEditorSurface 가
  // 빈 파일이 돼도 통과한다. 사용자 요청의 본체(최저 컬럼 확대)가 살아 있는지를
  // 직접 단언한다. 4번째 컬럼이 selection 표의 '최저'다.
  {
    const rules = [...editorCss.matchAll(/([^{}]*)\{([^{}]*)\}/g)].map((m) => ({
      head: m[1].trim(),
      body: m[2].trim()
    }));
    const col4Rules = rules.filter(
      (r) => r.head.includes('.admission-selection-table') && r.head.includes('nth-child(4)')
    );
    const widths = col4Rules.map((r) => (r.body.match(/width:\s*([^;]+)/) || [])[1]?.trim());
    const desktop = widths.includes('11rem');
    const mobile = widths.some((w) => /%$/.test(w || ''));
    const pass = col4Rules.length === 2 && desktop && mobile;
    record(
      'surf:7',
      "편집 전용 '최저'(4번째) 컬럼 확대 규칙이 존재한다 — 데스크톱 11rem + 모바일 % 2벌",
      pass,
      JSON.stringify({ count: col4Rules.length, widths })
    );
  }

  // ── surf:8 — 🚩 공개 폭은 그대로다 ───────────────────────────────────
  //
  // 스펙 §5 빨간 깃발: 공개 '최저' 폭 확대는 **사용자 승인 사항**이며 이번
  // 범위에서 실행하지 않는다. 나중에 누가 AdmissionSurface 의 7.5rem 을
  // 건드리면 여기서 먼저 걸린다(drift 는 HTML 바이트 계약이라 CSS 를 못 본다).
  {
    const hasDesktop = /\.admission-surface \.admission-selection-table td:nth-child\(4\)\s*\{[^}]*width:\s*7\.5rem/.test(
      publicCss
    );
    const hasMobile = /\.admission-surface \.admission-selection-table td:nth-child\(4\)\s*\{[^}]*width:\s*9%/.test(
      publicCss
    );
    const pass = hasDesktop && hasMobile;
    record(
      'surf:8',
      '🚩 공개 selection 표 최저 컬럼 폭이 불변(데스크톱 7.5rem · 모바일 9%) — 공개 확대는 사용자 승인 사항',
      pass,
      JSON.stringify({ hasDesktop, hasMobile })
    );
  }

  // ── surf:9 — 배선이 살아 있다(조용한 무효화 방지) ────────────────────
  //
  // 뮤테이션 실측으로 발견한 구멍: 편집 모달에서 <AdmissionEditorSurface />
  // 렌더 한 줄만 지우면 규칙이 **어디에도 로드되지 않는데** surf:1~8 은 전부
  // 통과한다(전부 파일 내용만 보기 때문). 파일이 있고 내용이 옳아도 화면에
  // 도달하지 않으면 사용자 요청은 무음으로 사라진다. 배선 자체를 고정한다.
  {
    const modalSrc = read(EDIT_MODAL_REL);
    const importCount = (modalSrc.match(/import AdmissionEditorSurface from ['"]\.\/AdmissionEditorSurface['"]/g) || [])
      .length;
    const renderCount = (modalSrc.match(/<AdmissionEditorSurface\s*\/>/g) || []).length;
    const pass = importCount === 1 && renderCount === 1;
    record(
      'surf:9',
      `${EDIT_MODAL_REL} 이 AdmissionEditorSurface 를 정확히 1회 import·렌더한다(배선 소실 = 규칙 무음 사망)`,
      pass,
      JSON.stringify({ importCount, renderCount })
    );
  }

  // ── surf:10 — 모바일 최저 컬럼 폭이 65rem 미만에서도 잘리지 않을 만큼 넓다 ──
  //
  // 2026-08-08: 1000px 창 실측(input 21px, 21칸 중 12칸 잘림)으로 기존 16%가
  // 부족함이 드러나 32%로 재보정했다(AdmissionEditorSurface.jsx 산출 과정
  // 주석 참고 — 768px 기준 필요치 31.0%가 상한). 30% 미만으로 되돌아가면
  // (예: 원래 값 16%로 회귀) 이 게이트가 잡는다 — 정확한 32% 고정 대신
  // 하한선(30%)으로 두어, 이후 실측으로 미세 조정할 여지는 남긴다.
  {
    const rules = [...editorCss.matchAll(/([^{}]*)\{([^{}]*)\}/g)].map((m) => ({
      head: m[1].trim(),
      body: m[2].trim()
    }));
    const col4Rules = rules.filter(
      (r) => r.head.includes('.admission-selection-table') && r.head.includes('nth-child(4)')
    );
    const mobileWidth = col4Rules
      .map((r) => (r.body.match(/width:\s*([^;]+)/) || [])[1]?.trim())
      .find((w) => /%$/.test(w || ''));
    const mobilePercent = mobileWidth ? Number(mobileWidth.replace('%', '')) : NaN;
    const pass = Number.isFinite(mobilePercent) && mobilePercent >= 30;
    record(
      'surf:10',
      "모바일·태블릿(max-width:65rem) 최저 컬럼 폭이 30% 이상이다(2026-08-08 재보정 — 16% 회귀 차단)",
      pass,
      JSON.stringify({ mobileWidth, mobilePercent })
    );
  }

  console.log('=== 어드민 편집 전용 표면 CSS 격리 검증 결과 ===\n');
  let failCount = 0;
  for (const r of results) {
    console.log(`[${r.pass ? 'PASS' : 'FAIL'}] ${r.id}. ${r.name}`);
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
