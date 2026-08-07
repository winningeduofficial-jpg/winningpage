// =====================================================================
// 표 모델(tableModel.js) 차등 대조 하니스 — 마이그레이션 전용 임시 검증
//
// 목적: src/components/admission/table/tableModel.js가 서술하는 표와,
// 현행 표시 렌더러 5개(blocks/tables/*.jsx)가 그리는 표가 **바이트 단위로**
// 같은지를 전 코퍼스에서 대조한다.
//
//   구(오라클) : TableBlockView.jsx의 디스패치 그대로 5개 렌더러 중 하나
//   신(피검증) : tableModel의 describeTable/describeHeader/describeCell만 보고
//                이 스크립트 안에서 조립한 어댑터 컴포넌트
//
// 어댑터를 프로덕션이 아니라 **이 스크립트 안에** 두는 것이 핵심이다 — 모델이
// 실제로 "표를 다시 그릴 수 있을 만큼 충분한 정보"를 담고 있는지를 독립
// 구현으로 확인하기 위함이다.
//
// ⚠ 수명: 설계 §7-2에 따라 Step 1~3 한정 하니스다. Step 4에서 구 렌더러가
// 삭제되면 오라클이 사라지므로 폐기하거나 "신 렌더러 vs 골든 문자열"로
// 전환한다. 영구 게이트가 아니다(게이트를 늘리지 않는다).
//
// 코퍼스: Gate B와 동일하다 — src/data/admissionHwpSections.json(번들 218개교)
// × 6카테고리 × {buildRawSectionDoc, buildHwpCategoryDoc} 두 경로에서 나온
// doc의 table 블록 전량(group children 재귀 포함). DB에 접속하지 않는다.
// 여기에 Gate B 코퍼스가 0건인 경로(recruitExact / generic / 셀 3형태 조합)를
// 메우는 합성 픽스처를 더한다.
//
// 비교는 renderToStaticMarkup 문자열 일치다 — 속성 **순서**만 정규화하고
// 나머지(태그·속성명 케이싱·class 토큰 순서·텍스트·공백)는 바이트 그대로
// 본다. Gate B의 정규화 DOM 비교보다 훨씬 엄격하다.
// 속성 순서만 푸는 이유: JSX의 prop 나열 순서가 곧 SSR 출력 순서라
// `<th rowSpan className>`과 `<th className rowSpan>`이 다른 문자열이 되는데,
// HTML 속성 순서는 의미가 없고 실제 게이트도 순서를 보지 않는다
// (verify-admission-doc-equivalence.mjs:511-522 normalizeAttrs는 속성을
// 키 집합으로 비교하고, verify-admission-block-render.mjs는 정규식으로 본다).
// 이 한 가지를 풀지 않으면 하니스가 "표를 다르게 그렸다"가 아니라 "prop을
// 다른 순서로 적었다"를 잡게 된다.
//
// 실행: node scripts/verify-admission-table-model.mjs
// 종료 코드: 불일치가 하나라도 있으면 1.
// =====================================================================

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as esbuild from 'esbuild';

import admissionHwpSections from '../src/data/admissionHwpSections.json' with { type: 'json' };
import {
  buildRawSectionDoc,
  buildHwpCategoryDoc,
  HWP_SECTION_HTML_KEYS,
  clean
} from '../src/lib/admissionParsing.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const CATEGORY_KEYS = Object.keys(HWP_SECTION_HTML_KEYS);
const MAX_DIFF_SAMPLES = 5;

// 공허한 통과 차단: 2026-08-07 실측(번들 218개교 × 6카테고리 × 2경로)에서
// 수집된 table 블록 수의 90%. 코퍼스 구성이나 import가 조용히 깨져 대상이
// 이 밑으로 떨어지면 그 자체를 실패로 본다.
const MIN_CORPUS_TABLES = 2247;

const h = React.createElement;

// 태그별 속성을 이름순으로 재배열한다. React가 속성값 안의 &<>"'를 전부
// 이스케이프하므로 값 안에 생 `>`가 들어올 수 없어 이 정규식으로 안전하다.
function canonicalizeAttrOrder(html) {
  return html.replace(
    /<([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^\s=/>]+(?:="[^"]*")?)*)\s*(\/?)>/g,
    (_all, tagName, attrString, selfClose) => {
      const attrs = attrString.match(/[^\s=/>]+(?:="[^"]*")?/g) || [];
      const sorted = [...attrs].sort();
      return `<${tagName}${sorted.length ? ` ${sorted.join(' ')}` : ''}${selfClose}>`;
    }
  );
}

// ── 구/신 모듈 로드 ────────────────────────────────────────────────────
// blocks/tables/*.jsx 5개와 table/tableModel.js를 한 번에 번들한다.
// react는 external로 남겨 인스턴스 중복을 막는다
// (scripts/verify-admission-block-render.mjs:155-176과 동일 전략).
const HARNESS_ENTRY = `
export { default as SelectionTable } from './src/components/admission/blocks/tables/SelectionTable.jsx';
export { default as ChangeTable } from './src/components/admission/blocks/tables/ChangeTable.jsx';
export { default as RecruitTable } from './src/components/admission/blocks/tables/RecruitTable.jsx';
export { default as RecruitExactTable } from './src/components/admission/blocks/tables/RecruitExactTable.jsx';
export { default as GenericTable } from './src/components/admission/blocks/tables/GenericTable.jsx';
export { describeTable, describeHeader, describeCell } from './src/components/admission/table/tableModel.js';
`;

async function loadHarnessModule() {
  const result = await esbuild.build({
    stdin: {
      contents: HARNESS_ENTRY,
      resolveDir: REPO_ROOT,
      loader: 'js',
      sourcefile: 'verify-admission-table-model-entry.js'
    },
    bundle: true,
    format: 'esm',
    jsx: 'automatic',
    jsxImportSource: 'react',
    platform: 'node',
    external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/server'],
    write: false
  });
  const code = result.outputFiles[0].text;
  // node_modules 해석을 위해 저장소 루트 밑에 임시로 쓴다(기존 스크립트들과 동일 이유).
  const tmpFile = path.join(
    REPO_ROOT,
    `.tmp-table-model-verify-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`
  );
  fs.writeFileSync(tmpFile, code);
  try {
    return await import(`file://${tmpFile}`);
  } finally {
    fs.rmSync(tmpFile, { force: true });
  }
}

// ── 구(오라클): TableBlockView.jsx:12-36 디스패치를 그대로 재현 ──────────
function makeOldRenderer(mod) {
  const { SelectionTable, ChangeTable, RecruitTable, RecruitExactTable, GenericTable } = mod;
  return function renderOld(block) {
    switch (block.variant) {
      case 'selection':
        return h(SelectionTable, { columns: block.columns, rows: block.rows });
      case 'change':
        return h(ChangeTable, { columns: block.columns, rows: block.rows });
      case 'recruit':
        return h(RecruitTable, { columns: block.columns, rows: block.rows });
      case 'recruitExact':
        return h(RecruitExactTable, {
          columns: block.columns,
          rows: block.rows,
          groups: block.groups,
          fixedColumnCount: block.fixedColumnCount
        });
      default:
        return h(GenericTable, { variant: block.variant, columns: block.columns, rows: block.rows });
    }
  };
}

// ── 신(피검증): 모델만 보고 조립하는 어댑터 ────────────────────────────
function makeModelRenderer(mod) {
  const { describeTable, describeHeader, describeCell } = mod;

  function renderLeaf(view) {
    switch (view.leaf) {
      case 'badge':
        return h('span', { className: `admission-minimum-badge ${view.badge}` }, view.text || view.fallback);
      case 'chips':
        return h(
          'div',
          { className: 'admission-recruit-cell-values' },
          view.chips.map((chip, chipIdx) => h('span', { key: chipIdx }, h('b', null, chip.label), chip.value))
        );
      case 'changePlain':
        return h('div', { className: 'admission-change-plain-cell' }, view.text || view.fallback);
      case 'muted':
        return h('span', { className: 'muted' }, '-');
      default:
        return view.text || view.fallback;
    }
  }

  function ModelTable({ block }) {
    const desc = describeTable(block);
    if (!desc) return null;
    const header = describeHeader(block);

    return h(
      'div',
      { className: desc.layout.scrollWrapClassName },
      h(
        'table',
        { className: desc.layout.tableClassName },
        h(
          'thead',
          null,
          header.rows.map((headerRow, headerRowIdx) =>
            h(
              'tr',
              { key: headerRowIdx },
              headerRow.cells.map((cell) =>
                h(
                  'th',
                  { key: cell.key, className: cell.className, rowSpan: cell.rowSpan, colSpan: cell.colSpan },
                  cell.label
                )
              )
            )
          )
        ),
        h(
          'tbody',
          null,
          block.rows.map((row, rowIdx) =>
            h(
              'tr',
              { key: rowIdx },
              row.map((_cell, colIdx) => {
                const cellDesc = describeCell(block, rowIdx, colIdx);
                return h('td', { key: colIdx, className: cellDesc.className }, renderLeaf(cellDesc.view));
              })
            )
          )
        )
      )
    );
  }

  return (block) => h(ModelTable, { block });
}

// ── 코퍼스 수집 ────────────────────────────────────────────────────────
function collectTableBlocks(blocks, out) {
  if (!Array.isArray(blocks)) return out;
  blocks.forEach((block) => {
    if (!block) return;
    if (block.kind === 'table') out.push(block);
    if (block.kind === 'group') collectTableBlocks(block.children, out);
  });
  return out;
}

function collectCorpusCases() {
  const cases = [];
  Object.keys(admissionHwpSections).forEach((universityName) => {
    const row = admissionHwpSections[universityName];
    CATEGORY_KEYS.forEach((key) => {
      const raw = clean(row[key]);
      if (!raw) return;
      [
        ['rawSectionHtml', buildRawSectionDoc],
        ['hwpCategoryHtml', buildHwpCategoryDoc]
      ].forEach(([pathName, builder]) => {
        let doc;
        try {
          doc =
            pathName === 'rawSectionHtml'
              ? builder(raw, key, row, universityName)
              : builder(key, raw, row, universityName);
        } catch (err) {
          cases.push({ label: `${universityName}|${key}|${pathName}`, error: err.message });
          return;
        }
        collectTableBlocks(doc?.blocks, []).forEach((block, idx) => {
          cases.push({ label: `${universityName}|${key}|${pathName}#${idx}`, block });
        });
      });
    });
  });
  return cases;
}

// ── 합성 픽스처 — Gate B 코퍼스 0건 경로 + 셀 3형태 조합 ────────────────
function syntheticCases() {
  const cases = [];
  const add = (label, block) => cases.push({ label: `synthetic:${label}`, block, synthetic: true });

  add('selection', {
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
      ['', '', '', { text: '', badge: 'minimumNone' }, ''],
      ['', '', '', '3개 등급합 7', ''],
      ['', '', '', '-', ''],
      ['', '', '', '', '']
    ]
  });

  // role이 알려진 목록 밖일 때(className 폴백 '')
  add('selection-unknown-role', {
    kind: 'table',
    variant: 'selection',
    columns: [
      { role: 'mystery', label: 'A' },
      { role: 'minimum', label: '최저' }
    ],
    rows: [
      ['x', '2등급'],
      ['', '']
    ]
  });

  add('change', {
    kind: 'table',
    variant: 'change',
    columns: [
      { role: 'no', label: '번호' },
      { role: 'title', label: '변경 항목' },
      { role: 'content', label: '변경 내용' }
    ],
    rows: [
      ['1', '모집인원', '10명 → 12명'],
      ['', '', ''],
      [{ text: '2' }, { text: '' }, { text: '내용' }]
    ]
  });

  add('recruit', {
    kind: 'table',
    variant: 'recruit',
    columns: [
      { role: 'group', label: '계열/대학' },
      { role: 'unit', label: '모집단위' },
      { role: 'series', label: '일반전형' },
      { role: 'data', label: '교과전형' }
    ],
    rows: [
      ['인문', '국어교육과', { chips: [{ label: '27 인원', value: '18' }] }, { chips: [] }],
      ['', '', {}, 'text-shaped'],
      ['', '', { chips: [{ label: 'a', value: '1' }, { label: 'b', value: '2' }] }, null]
    ]
  });

  // Gate B 코퍼스 0건 — 대칭(rowspan/colspan 둘 다 2)
  add('recruitExact-symmetric', {
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
  });

  // 비대칭 — rowSpan(2) ≠ colSpan(3,2), 고정열 1개.
  // 설계 §7-2가 지적한 "두 속성을 뒤바꿔도 통과하는" 대칭 픽스처의 사각을 메운다.
  add('recruitExact-asymmetric', {
    kind: 'table',
    variant: 'recruitExact',
    columns: [
      { role: 'series', label: '계열' },
      { role: 'data', label: 'a' },
      { role: 'data', label: 'b' },
      { role: 'data', label: 'c' },
      { role: 'data', label: 'd' },
      { role: 'data', label: 'e' }
    ],
    fixedColumnCount: 1,
    groups: [
      { name: '수시', count: 3 },
      { name: '정시', count: 2 }
    ],
    rows: [
      ['인문', '1', '2', '3', '4', '5'],
      ['', '', '', '', '', '']
    ]
  });

  // groups 부재 / fixedColumnCount 0 / fixedColumnCount가 컬럼 수 이상 —
  // 현행이 내는 빈 <tr>까지 그대로 재현되는지.
  add('recruitExact-no-groups', {
    kind: 'table',
    variant: 'recruitExact',
    columns: [
      { role: 'series', label: '계열' },
      { role: 'data', label: 'a' }
    ],
    fixedColumnCount: 1,
    rows: [['인문', '1']]
  });
  add('recruitExact-zero-fixed', {
    kind: 'table',
    variant: 'recruitExact',
    columns: [
      { role: 'data', label: 'a' },
      { role: 'data', label: 'b' }
    ],
    fixedColumnCount: 0,
    groups: [{ name: '전체', count: 2 }],
    rows: [['1', '']]
  });
  add('recruitExact-all-fixed', {
    kind: 'table',
    variant: 'recruitExact',
    columns: [
      { role: 'series', label: '계열' },
      { role: 'unit', label: '모집단위' }
    ],
    fixedColumnCount: 2,
    rows: [['인문', '국어교육과']]
  });

  ['exam', 'minimum', 'recordInfo', 'score', 'special', 'generic'].forEach((variant) => {
    add(`generic-${variant}`, {
      kind: 'table',
      variant,
      columns: [
        { role: 'col0', label: 'A' },
        { role: 'col1', label: 'B' },
        { role: 'col2', label: 'C' }
      ],
      rows: [
        ['x', 'y', 'z'],
        ['', '', ''],
        [{ text: 'p' }, {}, { chips: [{ label: 'l', value: 'v' }] }]
      ]
    });
  });

  // TableBlockView.jsx:34 default가 흘려보내는 미지 variant.
  add('unknown-variant', {
    kind: 'table',
    variant: 'nonexistent',
    columns: [
      { role: 'a', label: 'A' },
      { role: 'b', label: 'B' }
    ],
    rows: [['1', '']]
  });

  return cases;
}

// ── 실행 ───────────────────────────────────────────────────────────────
async function main() {
  const mod = await loadHarnessModule();
  const renderOld = makeOldRenderer(mod);
  const renderModel = makeModelRenderer(mod);
  const { describeTable } = mod;

  const corpusCases = collectCorpusCases();
  const synthetic = syntheticCases();
  const allCases = [...corpusCases, ...synthetic];

  const variantTally = {};
  const mismatches = [];
  const errors = [];
  let compared = 0;
  let columnCountFailures = 0;

  allCases.forEach((testCase) => {
    if (testCase.error) {
      errors.push({ label: testCase.label, reason: `doc 생성 예외: ${testCase.error}` });
      return;
    }
    const { block, label } = testCase;
    variantTally[block.variant] = (variantTally[block.variant] || 0) + 1;

    let oldHtml;
    let newHtml;
    try {
      oldHtml = canonicalizeAttrOrder(renderToStaticMarkup(renderOld(block)));
      newHtml = canonicalizeAttrOrder(renderToStaticMarkup(renderModel(block)));
    } catch (err) {
      errors.push({ label, reason: `렌더 예외: ${err.message}` });
      return;
    }

    compared += 1;
    if (oldHtml !== newHtml) {
      mismatches.push({ label, oldHtml, newHtml });
    }

    // describeTable의 columnCount 계약(설계 §7-3 T2의 절반).
    const desc = describeTable(block);
    if (!desc || desc.columnCount !== block.columns.length) columnCountFailures += 1;
  });

  console.log('=== 표 모델 차등 대조(구 렌더러 vs tableModel) ===\n');
  console.log(`[table-model] 코퍼스 표 블록 ${corpusCases.length}건 + 합성 픽스처 ${synthetic.length}건`);
  console.log(
    `[table-model] variant 분포: ${Object.entries(variantTally)
      .sort((a, b) => b[1] - a[1])
      .map(([v, n]) => `${v} ${n}`)
      .join(' / ')}`
  );
  console.log(`[table-model] 비교 ${compared}건 중 일치 ${compared - mismatches.length}건`);

  let failed = false;

  if (corpusCases.length < MIN_CORPUS_TABLES) {
    console.error(
      `[table-model] 실패: 코퍼스 표 블록이 ${corpusCases.length}건으로 하한 ${MIN_CORPUS_TABLES}건 미만입니다(공허한 통과 방지).`
    );
    failed = true;
  }

  if (errors.length) {
    console.error(`[table-model] 예외 ${errors.length}건:`);
    errors.slice(0, MAX_DIFF_SAMPLES).forEach((e) => console.error(`  - ${e.label}: ${e.reason}`));
    failed = true;
  }

  if (columnCountFailures) {
    console.error(`[table-model] describeTable().columnCount 계약 위반 ${columnCountFailures}건.`);
    failed = true;
  }

  if (mismatches.length) {
    console.error(`[table-model] 마크업 불일치 ${mismatches.length}건:`);
    mismatches.slice(0, MAX_DIFF_SAMPLES).forEach((m) => {
      console.error(`  - ${m.label}`);
      console.error(`      구: ${m.oldHtml.slice(0, 600)}`);
      console.error(`      신: ${m.newHtml.slice(0, 600)}`);
    });
    if (mismatches.length > MAX_DIFF_SAMPLES) {
      console.error(`  ... 외 ${mismatches.length - MAX_DIFF_SAMPLES}건 생략`);
    }
    failed = true;
  } else {
    console.log('[table-model] 전 항목 바이트 일치.');
  }

  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
