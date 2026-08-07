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
// 항목 번호 배분
//   entry:1~3  빈 카테고리 칸 진입 허용        (슬라이스 SSR)
//   entry:4~8  목록 '관리' 열 ✏️ config 게이팅 (소스 락)
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

// 관리 열(✏️/🗑) 슬라이스 앵커. 소스 전체에서 정확히 1개여야 한다.
const MANAGE_ANCHOR = 'onClick={() => onEdit(row)}';

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

// ── 관리 열 <td> 기계 슬라이스 ────────────────────────────────────────
//
// 두 번째 검사 축(entry:4~8): 목록 '관리' 열의 행 수정(✏️) 버튼.
// 2026-08-07 사용자 지시 "이제 '디테일한 수정'은 필요없어. 여기서 수정버튼을
// 삭제해줘." 인데, 그 ✏️ 한 줄은 AdminTable 이라는 **단일 컴포넌트**에 있고
// 36개 config 가 공유한다. 무조건 지우면 나머지 35개 메뉴의 수정 진입점이
// 통째로 사라지고, settlements 는 같은 버튼을 `config.readOnly ? <Eye/>` 로
// 상세보기에 쓰고 있어 그것까지 동반 사망한다. 그래서 `config.hideRowEdit`
// 스위치로 admissionGuidelines 1개 메뉴에만 적용했다.
//
// 여기서도 소스 문자열이 아니라 **실제 렌더**를 본다(entry:1~3 과 같은 이유).
// config 3종을 실제로 먹여보면 "게이팅이 좁게 잘 걸렸는가"가 직접 나온다.
function sliceManageCell(source) {
  const first = source.indexOf(MANAGE_ANCHOR);
  if (first === -1 || source.indexOf(MANAGE_ANCHOR, first + 1) !== -1) {
    throw new Error(
      `관리 열 앵커 "${MANAGE_ANCHOR}" 가 정확히 1개가 아니다. ` +
        '리팩터로 앵커가 사라졌다면 이 스크립트 상단의 슬라이스 규칙을 읽고 복원하라.'
    );
  }
  const start = source.lastIndexOf('<td', first);
  const end = source.indexOf('</td>', first);
  if (start === -1 || end === -1) throw new Error('관리 열 <td> 경계를 찾지 못했다.');
  return source.slice(start, end + '</td>'.length);
}

// 아이콘(lucide-react)은 번들하지 않고 스텁으로 갈아끼운다 — 이 검사의 관심사는
// "어떤 버튼이 렌더되는가"이지 아이콘 모양이 아니다. data-icon 으로 식별한다.
async function loadManageCell(sliceText) {
  const harness = `
import React from 'react';
const Eye = () => <i data-icon="eye" />;
const Edit3 = () => <i data-icon="edit3" />;
const Trash2 = () => <i data-icon="trash2" />;
export default function ManageCellHarness({ config, row, onEdit, onDelete }) {
  return (
    <table><tbody><tr>
      ${sliceText}
    </tr></tbody></table>
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
    `.tmp-admin-manage-verify-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`
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

  // ===================================================================
  // entry:4~8 — 목록 '관리' 열 행 수정(✏️) 버튼 게이팅
  //
  // 사용자 지시(2026-08-07): "이제 '디테일한 수정'은 필요없어. [관리 열]에서
  // 수정버튼을 삭제해줘." 카테고리 6칸이 각각 1클릭으로 편집 다이얼로그를
  // 여는 구조가 되면서 행 전체 폼은 중복 진입점이 됐다.
  //
  // 그런데 그 ✏️ 한 줄은 **AdminTable 이라는 단일 컴포넌트**에 있고 36개
  // config 가 공유한다. 무조건 지우면 나머지 35개 메뉴의 행 수정 진입점이
  // 통째로 사라지고, settlements 는 같은 버튼을 `config.readOnly ? <Eye/>` 로
  // **상세보기**에 쓰고 있어 그것까지 동반 사망한다. 그래서
  // `config.hideRowEdit` 스위치로 admissionGuidelines 1개 메뉴에만 적용했다.
  //
  // 여기부터는 SSR 이 아니라 소스 락이다. 관리 열은 config 36개 × 렌더
  // 조건의 조합이라 "어떤 JSX 가 어떤 조건 아래 있는가"가 곧 계약이고,
  // 그건 소스 형태로 보는 게 정확하다(verify-admission-modal-shell.mjs 의
  // `lock:` 항목들과 같은 방식).
  // ===================================================================

  // 주석에는 계약 문자열이 설명 목적으로 잔뜩 등장한다(이 저장소 관행).
  // 락은 **코드**를 봐야 하므로 주석을 걷어낸 사본에서 검사한다.
  const code = adminSrc
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '') // JSX 주석 {/* … */}
    .replace(/\/\*[\s\S]*?\*\//g, '') // 블록 주석
    .replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1'); // 줄 주석(URL 의 // 는 제외)

  // 어떤 인덱스가 어떤 config 블록 안에 있는지 판정한다.
  // config 는 `const CONFIGS = { <key>: { … }, … }` 형태의 최상위 객체다.
  const configKeyAt = (index) => {
    const head = code.slice(0, index);
    const re = /\n {2}([A-Za-z_$][\w$]*): \{/g;
    let last = null;
    let m = re.exec(head);
    while (m) {
      last = m[1];
      m = re.exec(head);
    }
    return last;
  };

  // 관리 열 <td> 안쪽(✏️/🗑 이 사는 블록)만 잘라낸다.
  const manageCell = (() => {
    const anchor = code.indexOf('onClick={() => onEdit(row)}');
    if (anchor === -1) return null;
    const start = code.lastIndexOf('<td', anchor);
    const end = code.indexOf('</td>', anchor);
    if (start === -1 || end === -1) return null;
    return code.slice(start, end + '</td>'.length);
  })();

  // ── entry:4 — ✏️ 가 hideRowEdit 로 게이팅돼 있다 ─────────────────────
  {
    const pass =
      Boolean(manageCell) &&
      /\{!config\.hideRowEdit && \(\s*<button/.test(manageCell) &&
      manageCell.includes('onClick={() => onEdit(row)}');
    record(
      'entry:4',
      '관리 열의 onEdit(row) 버튼이 `{!config.hideRowEdit && (` 로 감싸져 있다',
      pass,
      manageCell ? manageCell.slice(0, 500) : '관리 열 <td> 를 찾지 못했다'
    );
  }

  // ── entry:5 — hideRowEdit 이 admissionGuidelines 1곳에만 있다 ────────
  {
    const decls = [...code.matchAll(/\bhideRowEdit:\s*true\b/g)];
    const owners = decls.map((m) => configKeyAt(m.index));
    const pass = decls.length === 1 && owners[0] === 'admissionGuidelines';
    record(
      'entry:5',
      '`hideRowEdit: true` 가 소스 전체에서 정확히 1회, admissionGuidelines config 안에만 있다(35개 메뉴 감염 방지)',
      pass,
      JSON.stringify({ count: decls.length, owners })
    );
  }

  // ── entry:6 — 🗑 은 그대로 살아 있다 ────────────────────────────────
  //
  // 사용자는 🗑 를 언급하지 않았고, 지우면 행 삭제 경로가 완전히 사라진다
  // (엑셀 일괄은 insert/update 만 한다).
  {
    const pass =
      Boolean(manageCell) &&
      /\{!config\.readOnly && \(\s*<button/.test(manageCell) &&
      manageCell.includes('onClick={() => onDelete(row)}') &&
      manageCell.includes('<Trash2 size={17} />');
    record(
      'entry:6',
      '🗑(onDelete) 버튼이 여전히 존재하고 !config.readOnly 게이트를 유지한다(사용자 미언급 = 손대지 않음)',
      pass,
      manageCell ? manageCell.slice(0, 800) : '관리 열 <td> 를 찾지 못했다'
    );
  }

  // ── entry:7 — settlements 의 👁 분기가 살아 있다 ────────────────────
  {
    const pass =
      Boolean(manageCell) &&
      /config\.readOnly \? <Eye size=\{17\} \/> : <Edit3 size=\{17\} \/>/.test(manageCell);
    record(
      'entry:7',
      '`config.readOnly ? <Eye /> : <Edit3 />` 분기가 그대로다(readOnly 메뉴의 상세보기 파손 방지)',
      pass,
      manageCell ? manageCell.slice(0, 500) : '관리 열 <td> 를 찾지 못했다'
    );
  }

  // ── entry:8 — 신규 등록 경로(HWP 파싱 패널)가 살아 있다 ─────────────
  //
  // ✏️ 를 지우면 기존 행에서는 파싱 패널에 못 들어간다(폼 우측 sticky 컬럼에만
  // 산다). 하지만 [등록] 신규 폼은 별도 진입점이라 계속 살아야 한다 —
  // 여기서 배선이 조용히 끊기면 "원문 붙여넣기 → 6카테고리 생성" 경로가
  // 어디에도 남지 않는다.
  {
    const wired = /FormPreview:\s*AdmissionParsingPreview/.test(code);
    const rendered = /<config\.FormPreview\b/.test(code);
    const defined = /function AdmissionParsingPreview\(/.test(code);
    const pass = wired && rendered && defined;
    record(
      'entry:8',
      'AdmissionParsingPreview 가 여전히 config.FormPreview 로 배선·렌더된다(신규 등록 폼의 HWP 파싱 경로 생존)',
      pass,
      JSON.stringify({ wired, rendered, defined })
    );
  }

  // ── entry:9 — 게이팅이 **실제 렌더**에서 정확히 1개 메뉴에만 걸린다 ──
  //
  // entry:4~8 은 전부 소스 문자열 락이라 "플래그를 읽기는 하는데 렌더 결과는
  // 틀린" 경우를 못 잡는다(예: 조건을 반대로 쓰거나, 게이팅을 🗑 쪽에 걸거나).
  // 관리 열 <td> 를 실제로 잘라내 config 3종을 먹여보고 결과 DOM 을 본다.
  //
  //   A. { hideRowEdit: true }  = admissionGuidelines → ✏️ 없음 · 🗑 있음
  //   B. {}                     = 나머지 34개 메뉴    → ✏️ 있음 · 🗑 있음
  //   C. { readOnly: true }     = settlements 등      → 👁 있음 · 🗑 없음
  //
  // B 가 이 스크립트의 핵심이다 — "✏️ 를 지워라"를 무조건 삭제로 구현하면
  // 여기서 즉시 걸린다.
  {
    const ManageCell = await loadManageCell(sliceManageCell(adminSrc));
    const renderManage = (config) => {
      const clicks = [];
      const html = renderToStaticMarkup(
        React.createElement(ManageCell, {
          config,
          row: { id: 'fixture' },
          onEdit: (...a) => clicks.push(['edit', ...a]),
          onDelete: (...a) => clicks.push(['delete', ...a])
        })
      );
      return {
        edit: html.includes('data-icon="edit3"'),
        eye: html.includes('data-icon="eye"'),
        trash: html.includes('data-icon="trash2"'),
        html
      };
    };
    const a = renderManage({ hideRowEdit: true });
    const b = renderManage({});
    const c = renderManage({ readOnly: true });
    const pass =
      !a.edit && !a.eye && a.trash && // 대학모집요강: 행 수정 진입점만 사라진다
      b.edit && !b.eye && b.trash && // 나머지 34개: 완전 보존
      c.eye && !c.edit && !c.trash; // readOnly: 👁 상세보기 보존, 🗑 없음
    record(
      'entry:9',
      '관리 열 실제 렌더 — hideRowEdit=✏️만 사라짐 / 기본 config=✏️🗑 보존 / readOnly=👁 보존(35개 메뉴 동반 파괴 차단)',
      pass,
      JSON.stringify({
        hideRowEdit: { edit: a.edit, eye: a.eye, trash: a.trash },
        default: { edit: b.edit, eye: b.eye, trash: b.trash },
        readOnly: { edit: c.edit, eye: c.eye, trash: c.trash }
      })
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
