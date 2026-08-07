// =====================================================================
// 어드민 대학모집요강 목록 — "편집 진입 경로" 검증 스크립트
//
// 무엇을 지키나
// -------------
// 이 저장소의 기존 게이트 10종은 전부 **문서 블록의 렌더 출력**(Gate A/A2/B,
// drift, block-render, table-editor …)이나 모달 껍데기·표면 CSS 만 본다.
// "관리자가 그 편집기에 **도달할 수 있는가**"를 보는 게이트는 0개였다.
// 그런데 실제로 가장 조용히 깨지는 게 그 축이다 — 편집기는 멀쩡한데 버튼이
// 없어서 못 여는 상태는 어떤 바이트 계약도 위반하지 않는다.
//
// 실제 사고가 이 스크립트의 존재 이유다:
//   목록 셀에 `summary === '내용 없음' → <span>-</span>` 게이트가 있어서
//   dev DB 55칸(특수대학 11개교 × 5카테고리)이 목록에서 열리지 않았다.
//   그 11개교는 전형방법 1칸만 내용이 있고 나머지 5칸이 전부 비어 있어,
//   "빈 칸을 채운다"는 동작 자체가 불가능했다.
//
// 어떻게 보나 — 소스 스캔이 아니라 **실제 슬라이스 SSR**
// -------------------------------------------------------
// Admin.jsx 는 6,000줄이 넘고 supabase 클라이언트를 모듈 레벨에서 만든다.
// 통째로 번들해 렌더하는 건 비싸고 불안정하다. 대신
// scripts/verify-admission-modal-shell.mjs 가 공개 모달 JSX 영역에 쓰는 것과
// 같은 기법을 쓴다: **소스에서 해당 분기만 기계적으로 잘라내** 하네스로 감싸고
// renderToStaticMarkup 한다. 슬라이스는 매 실행마다 현재 소스에서 다시 뜨므로
// 이 스크립트는 사본이 아니라 실제 페이지 파일을 검사한다.
//
// 소스 스캔(문자열 유무)은 "없어야 할 것이 없다"만 볼 수 있어 리팩터에 약하다.
// 렌더 단언은 어포던스가 실제로 나오는지를 본다 — 게이트를 삼항이 아닌 다른
// 형태로 되살려도 잡힌다.
//
// 슬라이스 규칙 (리팩터 후에도 유지할 것)
// ---------------------------------------
//   src/pages/Admin.jsx 안에
//     column.type === 'admissionSection' ? (
//     ... 셀 표현식 ...
//     ) : column.type === 'fileList' ? (
//   형태가 **정확히 1개** 있어야 한다. 앵커가 깨지면 스크립트가 죽는다
//   (조용히 통과하지 않는다).
//
// 실행: node scripts/verify-admission-admin-entry.mjs
// 제약: npm install 금지, jsdom 없음. esbuild(transform) + react-dom/server 만.
// =====================================================================

import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as esbuild from 'esbuild';

const REPO_ROOT = path.resolve(new URL('.', import.meta.url).pathname, '..');
const ADMIN_REL = 'src/pages/Admin.jsx';

const CELL_SLICE_START = "column.type === 'admissionSection' ? (";
const CELL_SLICE_END = ") : column.type === 'fileList' ? (";

const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');

// ── 셀 분기 기계 슬라이스 ──────────────────────────────────────────────
function sliceSectionCell(source) {
  const startIdx = source.indexOf(CELL_SLICE_START);
  if (startIdx === -1 || source.indexOf(CELL_SLICE_START, startIdx + 1) !== -1) {
    throw new Error(
      `셀 슬라이스 앵커 "${CELL_SLICE_START}" 가 정확히 1개가 아니다. ` +
        '리팩터로 앵커가 사라졌다면 이 스크립트 상단의 슬라이스 규칙을 읽고 복원하라.'
    );
  }
  const bodyStart = startIdx + CELL_SLICE_START.length;
  const endIdx = source.indexOf(CELL_SLICE_END, bodyStart);
  if (endIdx === -1) {
    throw new Error(`셀 슬라이스 종료 앵커 "${CELL_SLICE_END}" 를 찾지 못했다.`);
  }
  return source.slice(bodyStart, endIdx);
}

// 잘라낸 표현식을 그대로 렌더하는 하네스. 셀이 참조하는 자유 변수
// (sectionSummaries / index / column / row / onOpenSection)만 props 로 주입한다.
async function loadSectionCell(sliceText) {
  const harness = `
import React from 'react';
export default function SectionCellHarness({ sectionSummaries, index, column, row, onOpenSection }) {
  return (
    <>
      {${sliceText}}
    </>
  );
}
`;
  const out = await esbuild.transform(harness, {
    loader: 'jsx',
    jsx: 'automatic',
    jsxImportSource: 'react',
    format: 'esm'
  });
  const tmpFile = path.join(
    REPO_ROOT,
    `.tmp-admin-entry-verify-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`
  );
  fs.writeFileSync(tmpFile, out.code);
  try {
    const mod = await import(`file://${tmpFile}`);
    return mod.default;
  } finally {
    fs.rmSync(tmpFile, { force: true });
  }
}

// 렌더 트리에서 첫 <button> 엘리먼트를 찾는다. SSR 문자열엔 핸들러가 남지
// 않으므로, "버튼이 실제로 onOpenSection 을 부르는가"는 엘리먼트 트리로 본다.
function findButton(node) {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = findButton(child);
      if (hit) return hit;
    }
    return null;
  }
  if (node.type === 'button') return node;
  return findButton(node.props?.children);
}

async function main() {
  const results = [];
  const record = (id, name, pass, detail) => results.push({ id, name, pass, detail });

  const adminSrc = read(ADMIN_REL);
  const SectionCell = await loadSectionCell(sliceSectionCell(adminSrc));

  const makeProps = (summary, sink) => ({
    sectionSummaries: [{ selection_method: summary }],
    index: 0,
    column: { sectionKey: 'selection_method' },
    row: { id: 'fixture', university_name: '검증대학교' },
    onOpenSection: (...args) => sink.push(args)
  });

  const renderCell = (summary) =>
    renderToStaticMarkup(React.createElement(SectionCell, makeProps(summary, [])));

  // summarizeHwpSection 이 낼 수 있는 값 3종. '내용 없음' 만 특별 취급 대상이었다.
  const EMPTY = '내용 없음';
  const RAW_ONLY = '원문 있음(문서 미생성)';
  const FILLED = '표 1개 · 5열 12행';

  // ── entry:1 — 빈 칸에서도 버튼이 렌더된다 (핵심) ─────────────────────
  //
  // 55칸 고아 사고를 막는 단 하나의 단언이다. 이전 코드는 여기서
  // <span class="text-gray-300">-</span> 를 냈다.
  {
    const html = renderCell(EMPTY);
    const hasButton = /<button\b/.test(html);
    const pass = hasButton;
    record(
      'entry:1',
      "요약이 '내용 없음'인 빈 카테고리 칸에서도 <button>이 렌더된다(진입 게이트 부활 차단)",
      pass,
      html
    );
  }

  // ── entry:2 — 세 상태 전부 onOpenSection 으로 같은 모달을 연다 ────────
  //
  // 버튼이 있어도 핸들러가 조건부면 의미가 없다. 실제로 호출까지 시킨다.
  {
    const detail = {};
    let pass = true;
    for (const summary of [EMPTY, RAW_ONLY, FILLED]) {
      const clicks = [];
      const props = makeProps(summary, clicks);
      const el = React.createElement(SectionCell, props);
      const button = findButton(el.type(el.props));
      button?.props?.onClick?.();
      const ok = Boolean(button) && clicks.length === 1 && clicks[0][1] === 'selection_method';
      detail[summary] = { hasButton: Boolean(button), clicks };
      if (!ok) pass = false;
    }
    record(
      'entry:2',
      '빈 칸/원문만 있음/내용 있음 3상태 전부 onOpenSection(row, sectionKey)를 조건 없이 호출한다',
      pass,
      JSON.stringify(detail)
    );
  }

  // ── entry:3 — 어포던스는 구분된다 (추가 vs 수정) ─────────────────────
  //
  // 기존 `-` 가 주던 정보("이 칸은 비었다")를 잃지 않아야 한다. 라벨을
  // 통일해버리면 목록에서 빈 칸을 눈으로 못 찾는다.
  {
    const empty = renderCell(EMPTY);
    const filled = renderCell(FILLED);
    const rawOnly = renderCell(RAW_ONLY);
    const pass =
      empty.includes('추가') &&
      !empty.includes('수정') &&
      filled.includes('수정') &&
      !filled.includes('추가') &&
      rawOnly.includes('수정');
    record(
      'entry:3',
      "빈 칸 라벨은 '추가', 내용/원문 있는 칸 라벨은 '수정'",
      pass,
      JSON.stringify({ empty, filled, rawOnly })
    );
  }

  // ── 출력 ────────────────────────────────────────────────────────────
  console.log('=== 어드민 대학모집요강 편집 진입 경로 검증 결과 ===\n');
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
