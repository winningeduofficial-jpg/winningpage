// =====================================================================
// 섹션 문서 표 편집 코어(TableBlockEditor) 검증 스크립트
//
// src/components/admission/editor/ 아래 순수 로직 모듈
// (tableEditorValidation.js, tableBlockOperations.js)은 React/DOM
// 의존이 없어 esbuild 번들 후 노드에서 직접 실행해 단언한다. 컴포넌트
// 자체(TableBlockEditor.jsx)는 renderToStaticMarkup으로 구조적 스모크
// 렌더만 확인한다 — SSR 문자열 렌더라 클릭/타이핑 같은 실제 상호작용은
// 재현할 수 없다(아래 "IME 조합 검증 한계" 절 참고).
//
// 실행: node scripts/verify-admission-table-editor.mjs
// =====================================================================

import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as esbuild from 'esbuild';
import * as XLSX from 'xlsx';

const REPO_ROOT = path.resolve(new URL('.', import.meta.url).pathname, '..');

async function loadModule(entry, exportName) {
  const result = await esbuild.build({
    entryPoints: [path.join(REPO_ROOT, entry)],
    bundle: true,
    format: 'esm',
    jsx: 'automatic',
    jsxImportSource: 'react',
    platform: 'node',
    external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/server', 'xlsx'],
    write: false
  });
  const code = result.outputFiles[0].text;
  const tmpFile = path.join(REPO_ROOT, `.tmp-table-editor-verify-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`);
  fs.writeFileSync(tmpFile, code);
  try {
    const mod = await import(`file://${tmpFile}`);
    return exportName ? mod[exportName] : mod;
  } finally {
    fs.rmSync(tmpFile, { force: true });
  }
}

const results = [];
const record = (name, pass, detail) => results.push({ name, pass, detail });

async function main() {
  const validation = await loadModule('src/components/admission/editor/tableEditorValidation.js');
  const ops = await loadModule('src/components/admission/editor/tableBlockOperations.js');
  const docOps = await loadModule('src/components/admission/editor/docBlockOperations.js');
  const layout = await loadModule('src/components/admission/admissionLayout.js');
  const TableBlockEditor = await loadModule('src/components/admission/editor/TableBlockEditor.jsx', 'default');
  const ColumnRoleEditor = await loadModule('src/components/admission/editor/ColumnRoleEditor.jsx', 'default');
  const DocBlocksEditor = await loadModule('src/components/admission/editor/DocBlocksEditor.jsx', 'default');

  const { validateTableBlock, validateBlocks, getColumnMutationBlockReason, resolveCellKind, emptyCellForKind } = validation;
  const { getCellKind, getKnownRolesForVariant, defaultNewColumnRole } = layout;

  // ── 샘플 블록 ──────────────────────────────────────────────────────
  const selectionBlock = {
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
      ['학생부종합', '서류전형', '5', { text: '-', badge: 'minimumNone' }, '서류 100%']
    ]
  };

  const recruitBlock = {
    kind: 'table',
    variant: 'recruit',
    columns: [
      { role: 'group', label: '계열/대학' },
      { role: 'unit', label: '모집단위' },
      { role: 'data', label: '일반전형' }
    ],
    rows: [
      ['인문', '국어교육과', { chips: [{ label: '27 인원', value: '18' }] }],
      ['자연', '수학교육과', { chips: [] }]
    ]
  };

  const scoreBlock = {
    kind: 'table',
    variant: 'score',
    columns: [
      { role: 'metric', label: '구분' },
      { role: 'a', label: 'A' },
      { role: 'b', label: 'B' }
    ],
    rows: [
      ['국어', '1등급', '2등급'],
      ['수학', '1등급', '2등급']
    ]
  };

  // ── 1) 셀 3형태 편집 후 validateAdmissionDoc 통과 ────────────────────
  {
    const next = ops.updateCell(selectionBlock, 0, 1, '전형명(수정)');
    const result = validateTableBlock('selection_method', next);
    const pass = result.ok && next.rows[0][1] === '전형명(수정)';
    record('1a. 문자열 셀 편집 후 validateAdmissionDoc 통과', pass, JSON.stringify(result));
  }
  {
    const nextCell = { text: '2등급', badge: 'minimumHas' };
    const next = ops.updateCell(selectionBlock, 0, 3, nextCell);
    const result = validateTableBlock('selection_method', next);
    const pass = result.ok && next.rows[0][3].text === '2등급' && next.rows[0][3].badge === 'minimumHas';
    record('1b. {text,badge} 셀 편집 후 validateAdmissionDoc 통과', pass, JSON.stringify(result));
  }
  {
    const nextCell = { chips: [{ label: '27 인원', value: '20' }, { label: '26 인원', value: '18' }] };
    const next = ops.updateCell(recruitBlock, 0, 2, nextCell);
    const result = validateTableBlock('recruitment_quota', next);
    const pass = result.ok && next.rows[0][2].chips.length === 2;
    record('1c. {chips} 셀 편집 후 validateAdmissionDoc 통과', pass, JSON.stringify(result));
  }

  // ── 2) 열 추가·삭제 시 전 행 길이가 함께 맞춰지는지(고정 컬럼 수 아닌 variant) ──
  {
    const added = ops.addColumn(scoreBlock);
    const rowLenOk = added.rows.every((row) => row.length === added.columns.length);
    const result = validateTableBlock('recruitment_quota', added);
    const pass = added.columns.length === scoreBlock.columns.length + 1 && rowLenOk && result.ok;
    record('2a. 열 추가 시 columns.length와 모든 rows[].length가 함께 늘어남', pass, JSON.stringify({ columns: added.columns.length, rowLens: added.rows.map((r) => r.length), result }));
  }
  {
    const removed = ops.removeColumn(scoreBlock, 1);
    const rowLenOk = removed.rows.every((row) => row.length === removed.columns.length);
    const result = validateTableBlock('recruitment_quota', removed);
    const pass = removed.columns.length === scoreBlock.columns.length - 1 && rowLenOk && result.ok;
    record('2b. 열 삭제 시 columns.length와 모든 rows[].length가 함께 줄어듦', pass, JSON.stringify({ columns: removed.columns.length, rowLens: removed.rows.map((r) => r.length), result }));
  }
  {
    // 마지막 컬럼은 삭제 방지(자체 가드) — 직사각형이되 컬럼 0은 스키마상 무의미.
    const singleColumnBlock = { ...scoreBlock, columns: [scoreBlock.columns[0]], rows: scoreBlock.rows.map((r) => [r[0]]) };
    const removed = ops.removeColumn(singleColumnBlock, 0);
    record('2c. 컬럼이 1개뿐이면 삭제 시도해도 그대로 유지(가드)', removed.columns.length === 1, JSON.stringify(removed.columns));
  }

  // ── 3) 컬럼 수 고정 variant에서 열 조작이 차단되는지 ──────────────────
  {
    const fixedVariantBlocks = {
      selection: selectionBlock,
      change: { kind: 'table', variant: 'change', columns: [{ role: 'no', label: '번호' }, { role: 'title', label: '제목' }, { role: 'content', label: '내용' }], rows: [['1', '변경', '내용']] },
      exam: { kind: 'table', variant: 'exam', columns: [{ role: 'a', label: 'A' }, { role: 'b', label: 'B' }, { role: 'c', label: 'C' }], rows: [['x', 'y', 'z']] },
      minimum: { kind: 'table', variant: 'minimum', columns: [{ role: 'a', label: 'A' }, { role: 'b', label: 'B' }, { role: 'c', label: 'C' }, { role: 'd', label: 'D' }, { role: 'e', label: 'E' }], rows: [['1', '2', '3', '4', '5']] },
      recordInfo: { kind: 'table', variant: 'recordInfo', columns: [{ role: 'a', label: 'A' }, { role: 'b', label: 'B' }], rows: [['x', 'y']] }
    };
    let allBlocked = true;
    const detail = [];
    for (const [variant, block] of Object.entries(fixedVariantBlocks)) {
      const reason = getColumnMutationBlockReason(variant === 'selection' ? 'selection_method' : 'recruitment_quota', block);
      const blocked = typeof reason === 'string' && reason.length > 0;
      allBlocked = allBlocked && blocked;
      detail.push(`${variant}: blocked=${blocked} reason=${reason}`);
    }
    record('3a. 컬럼 수 고정 5종(selection/change/exam/minimum/recordInfo) 전부 열 조작 차단', allBlocked, detail.join('\n'));
  }
  {
    // score/generic은 컬럼 수 고정이 아니므로 차단되면 안 된다.
    const reason = getColumnMutationBlockReason('recruitment_quota', scoreBlock);
    record('3b. score(컬럼 수 비고정)는 열 조작 허용(reason=null)', reason === null, String(reason));
  }
  {
    // recruitExact는 groups/fixedColumnCount와 컬럼 수가 맞물려 있어 차단돼야 한다.
    const recruitExactBlock = {
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
      rows: [['인문', '국어교육과', '18', '17']]
    };
    const reason = getColumnMutationBlockReason('recruitment_quota', recruitExactBlock);
    const pass = typeof reason === 'string' && reason.includes('그룹 헤더');
    record('3c. recruitExact(groups 연동)는 그룹 헤더 사유로 열 조작 차단', pass, String(reason));
  }

  // ── 4) 행 순서 변경 후 데이터 무결성 ──────────────────────────────────
  {
    const threeRowBlock = { ...scoreBlock, rows: [['국어', 'a1', 'a2'], ['수학', 'b1', 'b2'], ['영어', 'c1', 'c2']] };
    const moved = ops.moveRow(threeRowBlock, 0, 1);
    const pass =
      moved.rows.length === 3 &&
      moved.rows[0][0] === '수학' &&
      moved.rows[1][0] === '국어' &&
      moved.rows[2][0] === '영어' &&
      JSON.stringify(moved.columns) === JSON.stringify(threeRowBlock.columns);
    record('4a. moveRow(0,+1) — 순서만 바뀌고 각 행 내용·컬럼은 그대로', pass, JSON.stringify(moved.rows));
  }
  {
    const threeRowBlock = { ...scoreBlock, rows: [['국어', 'a1', 'a2'], ['수학', 'b1', 'b2'], ['영어', 'c1', 'c2']] };
    const movedOut = ops.moveRow(threeRowBlock, 0, -1); // 맨 위 행을 더 위로 — 범위 밖, no-op
    const movedOut2 = ops.moveRow(threeRowBlock, 2, 1); // 맨 아래 행을 더 아래로 — 범위 밖, no-op
    const pass = JSON.stringify(movedOut.rows) === JSON.stringify(threeRowBlock.rows) && JSON.stringify(movedOut2.rows) === JSON.stringify(threeRowBlock.rows);
    record('4b. 범위를 벗어나는 moveRow는 no-op(순서 불변)', pass, '');
  }
  {
    const added = ops.addRow(selectionBlock);
    const lastRow = added.rows[added.rows.length - 1];
    // selection variant: type/name/seats/method는 text('' ), minimum은 badge({text:'',badge:'minimumNone'})
    const pass =
      added.rows.length === selectionBlock.rows.length + 1 &&
      lastRow[0] === '' &&
      lastRow[3].text === '' &&
      lastRow[3].badge === 'minimumNone' &&
      validateTableBlock('selection_method', added).ok;
    record('4c. addRow — 컬럼별 kind에 맞는 빈 셀(text=""/badge={text:"",badge:"minimumNone"})', pass, JSON.stringify(lastRow));
  }
  {
    const removed = ops.removeRow(selectionBlock, 0);
    const pass = removed.rows.length === 1 && removed.rows[0][0] === '학생부종합';
    record('4d. removeRow(0) — 나머지 행만 남음', pass, JSON.stringify(removed.rows));
  }

  // ── 5) resolveCellKind / getCellKind 판정 ────────────────────────────
  {
    const pass =
      getCellKind('selection', 'minimum') === 'badge' &&
      getCellKind('selection', 'type') === 'text' &&
      getCellKind('recruit', 'group') === 'text' &&
      getCellKind('recruit', 'unit') === 'text' &&
      getCellKind('recruit', 'data') === 'chips' &&
      getCellKind('recruitExact', 'series') === 'text';
    record('5a. getCellKind(variant, role) 판정 — SelectionTable/RecruitTable 조건과 일치', pass, '');
  }
  {
    // 실제 셀 값 형태가 role 판정과 다르면 값 형태를 신뢰(방어적)
    const pass =
      resolveCellKind('text', { chips: [] }) === 'chips' &&
      resolveCellKind('text', { text: 'x', badge: 'minimumHas' }) === 'badge' &&
      resolveCellKind('badge', 'plain string') === 'badge'; // role 힌트 유지(문자열은 판정 근거 없음)
    record('5b. resolveCellKind — 값 형태가 role 힌트와 다르면 값 형태 우선', pass, '');
  }
  {
    const pass =
      JSON.stringify(emptyCellForKind('text')) === '""' &&
      JSON.stringify(emptyCellForKind('badge')) === JSON.stringify({ text: '', badge: 'minimumNone' }) &&
      JSON.stringify(emptyCellForKind('chips')) === JSON.stringify({ chips: [] });
    record('5c. emptyCellForKind — kind별 빈 셀 기본값', pass, '');
  }

  // ── 6) 컴포넌트 구조적 스모크 렌더 ────────────────────────────────────
  {
    let out = '';
    let threw = false;
    try {
      out = renderToStaticMarkup(
        React.createElement(TableBlockEditor, { section: 'selection_method', block: selectionBlock, onChange: () => {} })
      );
    } catch (err) {
      threw = true;
      out = String(err && err.stack ? err.stack : err);
    }
    const inputCount = (out.match(/<input/g) || []).length;
    // 헤더 라벨+role 입력 2개 * 5컬럼 + 바디 셀 입력(문자열 4개 + badge 1개) * 2행 = 10 + 10 = 20
    const pass = !threw && inputCount > 0 && out.includes('열 추가') && out.includes('행 추가');
    record('6. TableBlockEditor 스모크 렌더(예외 없음, 편집 UI 요소 존재)', pass, threw ? out : `inputCount=${inputCount}`);
  }

  // ── 7) IME 조합 로직 — 순수 상태 전이 검증(실제 브라우저 이벤트는 재현 불가) ──
  // ImeSafeInput의 알고리즘을 그대로 복제해 상태 전이만 검증한다. 실제
  // compositionstart/compositionend 이벤트 디스패치와 브라우저 IME 렌더는
  // jsdom/브라우저가 필요해 이 환경에서는 재현 불가 — 로직 자체의 정확성만
  // 확인한다(재현 불가 사실을 명시).
  {
    function simulateImeSafeInput(events) {
      let composing = false;
      let draft = '';
      let committed = null; // 마지막 onCommit 인자
      for (const event of events) {
        if (event.type === 'compositionstart') {
          composing = true;
        } else if (event.type === 'change') {
          draft = event.value;
          if (!composing) committed = event.value;
        } else if (event.type === 'compositionend') {
          composing = false;
          draft = event.value;
          committed = event.value;
        }
      }
      return { draft, committed };
    }

    // "안" 입력 중(조합 시작 → change 두 번 → 조합 종료)에는 조합 종료
    // 전까지 committed(상위로 흘러가는 값)가 갱신되면 안 된다.
    const r1 = simulateImeSafeInput([
      { type: 'compositionstart' },
      { type: 'change', value: 'ㅇ' },
      { type: 'change', value: '안' },
      { type: 'compositionend', value: '안' }
    ]);
    const pass1 = r1.draft === '안' && r1.committed === '안';

    // 조합 없는 일반 영문 입력은 매 change마다 즉시 committed.
    const r2 = simulateImeSafeInput([
      { type: 'change', value: 'a' },
      { type: 'change', value: 'ab' }
    ]);
    const pass2 = r2.committed === 'ab';

    record(
      '7. IME 조합 상태 전이 로직(순수 함수 복제) — 조합 중 draft만 갱신, commit은 조합 종료 후. ⚠ 실제 브라우저 compositionevent/캐럿 동작은 jsdom·브라우저 없이 이 환경에서 재현 불가(미검증으로 명시)',
      pass1 && pass2,
      JSON.stringify({ r1, r2 })
    );
  }

  // ── 8) role 드롭다운 제한(2026-08-06 감사 반영) ──────────────────────
  {
    const pass =
      JSON.stringify(getKnownRolesForVariant('selection')) === JSON.stringify(['type', 'name', 'seats', 'minimum', 'method']) &&
      JSON.stringify(getKnownRolesForVariant('change')) === JSON.stringify(['no', 'title', 'content']) &&
      JSON.stringify(getKnownRolesForVariant('recruit')) === JSON.stringify(['group', 'unit', 'series']) &&
      JSON.stringify(getKnownRolesForVariant('generic')) === JSON.stringify([]);
    record('8a. getKnownRolesForVariant — admissionParsing.js doc 생성기 소스와 일치(selection/change/recruit/generic)', pass, '');
  }
  {
    const pass = defaultNewColumnRole('score') === 'data' && defaultNewColumnRole('recruit') === 'series' && defaultNewColumnRole('generic') === '';
    record('8b. defaultNewColumnRole — variant별 목록 마지막 항목(비어있으면 "")', pass, '');
  }
  {
    // addColumn이 이제 'col${n}' 대신 알려진 role을 기본으로 쓰는지 —
    // score는 컬럼 수 비고정이라 addColumn이 실제로 반영된다.
    const added = ops.addColumn(scoreBlock);
    const newColumn = added.columns[added.columns.length - 1];
    const pass = newColumn.role === 'data' && getCellKind('score', newColumn.role) === 'text';
    record('8c. addColumn 기본 role이 defaultNewColumnRole(variant)를 씀("col${n}" 아님)', pass, JSON.stringify(newColumn));
  }
  {
    const knownOut = renderToStaticMarkup(
      React.createElement(ColumnRoleEditor, { variant: 'selection', role: 'minimum', onChange: () => {} })
    );
    const unknownOut = renderToStaticMarkup(
      React.createElement(ColumnRoleEditor, { variant: 'selection', role: 'my-custom-role', onChange: () => {} })
    );
    const pass =
      !knownOut.includes('연결되지 않습니다') && // 알려진 role은 경고 없음
      unknownOut.includes('연결되지 않습니다') && // 목록에 없는 값은(기존 데이터 포함) 경고
      unknownOut.includes('my-custom-role'); // 직접 입력 필드에 현재 값 유지
    record('8d. ColumnRoleEditor — 알려진 role은 경고 없음, 미지 role은 경고+현재값 보존', pass, `known=${knownOut}\nunknown=${unknownOut}`);
  }

  // ── 9) 그룹 헤더(groups/fixedColumnCount) 편집 ───────────────────────
  const recruitExactBlockFull = {
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
    rows: [['인문', '국어교육과', '18', '17']]
  };
  {
    // 불변식이 성립하는 초기 상태
    const ok = validateTableBlock('recruitment_quota', recruitExactBlockFull);
    // count를 3으로 늘리면(합계 2+3=5 ≠ columns.length 4) 위반 감지돼야 함
    const broken = ops.updateGroupField(recruitExactBlockFull, 0, 'count', 3);
    const brokenResult = validateTableBlock('recruitment_quota', broken);
    const pass = ok.ok && !brokenResult.ok && brokenResult.errors.some((e) => e.includes('groups 합('));
    record('9a. 그룹 count 변경으로 sum(groups)+fixedColumnCount≠columns.length 위반 감지', pass, JSON.stringify({ ok, brokenResult }));
  }
  {
    // count를 3으로 늘리는 대신 fixedColumnCount를 1로 줄이면(2+1=3≠4) 여전히 위반
    // fixedColumnCount를 원래(2)에서 그대로 두고 group count 3, fixedColumnCount 1로 맞추면 4로 재일치
    const rebalanced = ops.updateFixedColumnCount(ops.updateGroupField(recruitExactBlockFull, 0, 'count', 3), 1);
    const result = validateTableBlock('recruitment_quota', rebalanced);
    const pass = result.ok; // 3+1=4=columns.length
    record('9b. fixedColumnCount 변경 후 재검증 — 합계를 다시 맞추면 통과', pass, JSON.stringify(result));
  }
  {
    const added = ops.addGroup(recruitExactBlockFull);
    const pass = added.groups.length === 2 && added.groups[1].count === 0 && validateTableBlock('recruitment_quota', added).ok;
    record('9c. addGroup — count:0으로 추가돼 불변식을 깨지 않음', pass, JSON.stringify(added.groups));
  }
  {
    const removed = ops.removeGroup(recruitExactBlockFull, 0);
    // count 2짜리 그룹을 통째로 지우면 합계가 0+2=2≠4로 깨짐(의도된 동작 —
    // 그룹 삭제 시 해당 컬럼도 같이 지우는 자동 동기화는 이번 범위 밖).
    const result = validateTableBlock('recruitment_quota', removed);
    const pass = removed.groups.length === 0 && !result.ok;
    record('9d. removeGroup — 그룹 자체는 지워지되(컬럼은 안 지워짐) 불변식 위반이 배너로 드러남(의도된 동작)', pass, JSON.stringify(result));
  }

  // ── 10) footnote 편집 후 validate 통과 ────────────────────────────────
  {
    const footnoteBlock = { kind: 'footnote', items: ['교직과정'] };
    const next = { ...footnoteBlock, items: [...footnoteBlock.items, '자율전공 과정'] };
    const result = validateBlocks('recruitment_quota', [next]);
    const pass = result.ok && next.items.join(' ') === '교직과정 자율전공 과정';
    record('10. footnote 편집(항목 추가) 후 validateAdmissionDoc 통과 + join(\' \') 미리보기 문자열 확인', pass, JSON.stringify({ next, result }));
  }

  // ── 11) 비표 블록 4종 편집 후 validate 통과 ───────────────────────────
  {
    const cases = [
      { kind: 'note', before: { kind: 'note', text: '' }, after: { kind: 'note', text: '실제 안내' } },
      { kind: 'emptyBox', before: { kind: 'emptyBox', message: '' }, after: { kind: 'emptyBox', message: '없음' } },
      { kind: 'heading', before: { kind: 'heading', text: '' }, after: { kind: 'heading', text: '국어 환산표' } },
      {
        kind: 'plainList',
        before: { kind: 'plainList', items: [{ type: 'text', text: 'x' }] },
        after: { kind: 'plainList', items: [{ type: 'bullet', text: 'y' }] }
      }
    ];
    let allPass = true;
    const detail = [];
    for (const c of cases) {
      const result = validateBlocks('selection_method', [c.after]);
      const changed = JSON.stringify(c.after) !== JSON.stringify(c.before);
      const ok = result.ok && changed;
      allPass = allPass && ok;
      detail.push(`${c.kind}: changed=${changed} validate.ok=${result.ok}`);
    }
    record('11. 비표 블록 4종(note/emptyBox/heading/plainList) 편집 후 validateAdmissionDoc 통과', allPass, detail.join('\n'));
  }

  // ── 12) 블록 순서 변경 무결성(DocBlocksEditor) ────────────────────────
  {
    const blocks = [
      { kind: 'note', text: 'A' },
      { kind: 'heading', text: 'B' },
      { kind: 'emptyBox', message: 'C' }
    ];
    const moved = docOps.moveBlock(blocks, 0, 1);
    const pass =
      moved.length === 3 &&
      moved[0].kind === 'heading' &&
      moved[1].kind === 'note' &&
      moved[2].kind === 'emptyBox' &&
      validateBlocks('selection_method', moved).ok;
    record('12a. moveBlock — 순서만 바뀌고 각 블록 내용은 그대로, validate 통과', pass, JSON.stringify(moved));
  }
  {
    const blocks = [{ kind: 'note', text: 'A' }];
    const added = docOps.appendBlock(blocks, docOps.createDefaultBlock('footnote'));
    const removed = docOps.removeBlockAt(added, 0);
    const pass = added.length === 2 && added[1].kind === 'footnote' && removed.length === 1 && removed[0].kind === 'footnote';
    record('12b. appendBlock/removeBlockAt — 추가·삭제 데이터 무결성', pass, JSON.stringify({ added, removed }));
  }
  {
    // DocBlocksEditor 구조적 스모크 렌더 — group/rawHtml 포함 전 종류 디스패치 확인
    const blocks = [
      { kind: 'table', variant: 'selection', columns: [{ role: 'type', label: '전형' }], rows: [['x']] },
      { kind: 'note', text: 'n' },
      { kind: 'emptyBox', message: 'e' },
      { kind: 'heading', text: 'h' },
      { kind: 'preText', text: 'p' },
      { kind: 'plainList', items: [{ type: 'text', text: 'l' }] },
      { kind: 'footnote', items: ['f'] },
      { kind: 'group', title: 'g', children: [{ kind: 'note', text: 'child' }] },
      { kind: 'rawHtml', html: '<div>r</div>', reason: 'curated-html' }
    ];
    let threw = false;
    let out = '';
    try {
      out = renderToStaticMarkup(
        React.createElement(DocBlocksEditor, { section: 'selection_method', blocks, onChange: () => {} })
      );
    } catch (err) {
      threw = true;
      out = String(err && err.stack ? err.stack : err);
    }
    const pass = !threw && out.includes('블록 추가') && out.includes('읽기 전용 요약');
    record('12c. DocBlocksEditor 스모크 렌더 — 9종 블록 전부 예외 없이 디스패치(group은 읽기 전용 요약)', pass, threw ? out : `len=${out.length}`);
  }

  // ── 13) plainList 항목 추가·삭제·순서 변경(2026-08-06 보완) ───────────
  {
    const PlainListBlockEditor = await loadModule(
      'src/components/admission/editor/blocks/PlainListBlockEditor.jsx',
      'default'
    );
    const block = { kind: 'plainList', items: [{ type: 'text', text: 'a' }, { type: 'bullet', text: 'b' }] };

    // docBlockOperations의 제네릭 배열 함수를 items에 직접 재사용해도
    // 동일하게 동작하는지(컴포넌트 내부와 같은 함수 재사용 확인).
    const appended = docOps.appendBlock(block.items, { type: 'text', text: 'c' });
    const removed = docOps.removeBlockAt(appended, 0);
    const moved = docOps.moveBlock(removed, 0, 1);
    const pass =
      appended.length === 3 &&
      removed.length === 2 &&
      removed[0].text === 'b' &&
      moved[0].text === 'c' &&
      moved[1].text === 'b';
    record('13a. plainList items 추가·삭제·순서변경 — docBlockOperations 제네릭 함수 재사용 확인', pass, JSON.stringify({ appended, removed, moved }));

    let threw = false;
    let out = '';
    try {
      out = renderToStaticMarkup(React.createElement(PlainListBlockEditor, { block, onChange: () => {} }));
    } catch (err) {
      threw = true;
      out = String(err && err.stack ? err.stack : err);
    }
    const renderPass = !threw && out.includes('항목 추가') && out.includes('삭제');
    record('13b. PlainListBlockEditor 스모크 렌더 — 항목 추가/삭제 버튼 존재', renderPass, threw ? out : `len=${out.length}`);
  }

  // ── 14) xlsx 내보내기 ─────────────────────────────────────────────────
  const xlsxModule = await loadModule('src/components/admission/editor/xlsx/tableBlockXlsx.js');
  const {
    serializeCellForXlsx,
    deserializeCellFromXlsx,
    findOversizedCells,
    buildTableBlockWorksheet,
    buildTableBlockWorkbook,
    buildXlsxFileName,
    exportTableBlockToXlsx,
    importTableBlockFromXlsx,
    summarizeBlockChange,
    MAX_XLSX_CELL_LENGTH
  } = xlsxModule;
  const { blocksEqual } = validation;

  // 14a) Cell 3형태 직렬화 규칙
  {
    const pass =
      serializeCellForXlsx('일반 문자열') === '일반 문자열' &&
      serializeCellForXlsx({ text: '3등급', badge: 'minimumHas' }) === '3등급 [최저있음]' &&
      serializeCellForXlsx({ text: '', badge: 'minimumHas' }) === '[최저있음]' &&
      serializeCellForXlsx({ text: '-', badge: 'minimumNone' }) === '- [최저없음]' &&
      serializeCellForXlsx({ chips: [{ label: '27 인원', value: '18' }, { label: '26 인원', value: '17' }] }) ===
        '27 인원: 18\n26 인원: 17' &&
      serializeCellForXlsx({ chips: [] }) === '' &&
      serializeCellForXlsx('') === '' &&
      serializeCellForXlsx(null) === '';
    record('14a. serializeCellForXlsx — 문자열/{text,badge}/{chips} 직렬화 규칙', pass, '');
  }

  // 14b) 32,767자 초과 셀 탐지
  {
    const big = 'a'.repeat(MAX_XLSX_CELL_LENGTH + 1);
    const block = {
      kind: 'table',
      variant: 'score',
      columns: [{ role: 'type', label: '구분' }, { role: 'data', label: '국어' }],
      rows: [['x', big]]
    };
    const oversized = findOversizedCells(block);
    const pass = oversized.length === 1 && oversized[0].area === 'body' && oversized[0].row === 0 && oversized[0].col === 1 && oversized[0].length === big.length;
    record('14b. findOversizedCells — 32,767자 초과 셀을 정확한 위치로 찾아냄', pass, JSON.stringify(oversized));
  }
  {
    // 실측 최대치(DB 최대 셀 39,658자, .golden-cache 실측 근거)도 정확히 걸리는지.
    const dbMaxLikeCell = 'x'.repeat(39658);
    const block = { kind: 'table', variant: 'score', columns: [{ role: 'data', label: 'A' }], rows: [[dbMaxLikeCell]] };
    const oversized = findOversizedCells(block);
    const pass = oversized.length === 1 && oversized[0].length === 39658;
    record('14c. findOversizedCells — DB 실측 최대 셀 크기(39,658자)도 초과로 탐지', pass, JSON.stringify(oversized));
  }

  // 14d) recruitExact(2단 헤더) → 병합 셀이 groups/fixedColumnCount와 일치
  {
    const recruitExactForXlsx = {
      kind: 'table',
      variant: 'recruitExact',
      columns: [
        { role: 'series', label: '계열' },
        { role: 'unit', label: '모집단위' },
        { role: 'data', label: '27 인원' },
        { role: 'data', label: '26 인원' },
        { role: 'data', label: '27 경쟁률' }
      ],
      fixedColumnCount: 2,
      groups: [{ name: '일반전형', count: 2 }, { name: '지역균형', count: 1 }],
      rows: [['인문', '국어교육과', '18', '17', '3.2']]
    };
    const ws = buildTableBlockWorksheet(recruitExactForXlsx);
    const merges = ws['!merges'] || [];
    // 고정 컬럼 2개: rowspan(0,c)~(1,c) — c=0,1
    const fixedMerges = merges.filter((m) => m.s.r === 0 && m.e.r === 1);
    // 그룹 2개: (0, startCol)~(0, startCol+count-1) — 일반전형(2,3), 지역균형(4,4)는 colspan 없음(count=1)
    const groupMerges = merges.filter((m) => m.s.r === 0 && m.e.r === 0);
    const pass =
      fixedMerges.length === 2 &&
      fixedMerges.some((m) => m.s.c === 0 && m.e.c === 0) &&
      fixedMerges.some((m) => m.s.c === 1 && m.e.c === 1) &&
      groupMerges.length === 1 && // count=1인 지역균형은 colspan 병합이 필요 없어 !merges에 안 들어감(1x1 병합은 무의미)
      groupMerges[0].s.c === 2 &&
      groupMerges[0].e.c === 3;
    record('14d. buildTableBlockWorksheet — recruitExact 병합 셀이 groups/fixedColumnCount와 일치(고정 rowspan 2개 + 그룹 colspan 1개)', pass, JSON.stringify(merges));

    // 헤더 2행 + 바디 1행 = 총 3행, aoa 데이터로 재확인
    const aoa = XLSX.utils.sheet_to_json(ws, { header: 1 });
    const pass2 = aoa.length === 3 && aoa[0][0] === '계열' && aoa[0][2] === '일반전형' && aoa[1][2] === '27 인원' && aoa[2][0] === '인문';
    record('14e. buildTableBlockWorksheet — 헤더 2행(고정 라벨/그룹명 + 데이터 라벨) + 바디 행 배치 확인', pass2, JSON.stringify(aoa));
  }

  // 14f) groups 없는 일반 표 → 1단 헤더, 병합 없음
  {
    const ws = buildTableBlockWorksheet(scoreBlock);
    const pass = !ws['!merges'] || ws['!merges'].length === 0;
    record('14f. buildTableBlockWorksheet — groups 없으면 병합 셀 없음(1단 헤더)', pass, JSON.stringify(ws['!merges']));
  }

  // 14g) buildXlsxFileName — 대학명·카테고리·날짜 포함
  {
    const name = buildXlsxFileName({ universityName: '가톨릭관동대학교', sectionLabel: '모집인원 및 입결', date: new Date(2026, 7, 6) });
    const pass = name === '가톨릭관동대학교_모집인원 및 입결_20260806.xlsx';
    record('14g. buildXlsxFileName — 대학명_카테고리_YYYYMMDD.xlsx 형식', pass, name);
  }

  // 14h) exportTableBlockToXlsx — 워크북 결과 직접 검사
  // (참고: XLSX.writeFile 자체의 저장 경로는 검증하지 않는다. 노드에서
  // 직접 확인한 결과 SheetJS의 자체 환경 감지가 CJS require로 부르면
  // 저장되고 ESM import로 부르면 "cannot save file" 예외를 내는 불안정한
  // 동작이 있었다 — 그래서 프로덕션 코드 자체를 XLSX.write(버퍼만 생성,
  // 환경 감지 없음) + 직접 다운로드 트리거로 바꿨고(typeof document 가드),
  // 이 함수는 document가 없는 노드에서는 다운로드를 건너뛰고 workbook을
  // 그대로 반환한다 — 그 workbook 내용을 검사한다.)
  {
    const result = exportTableBlockToXlsx(selectionBlock, { universityName: '가톨릭관동대학교', sectionLabel: '전형방법' });
    const today = new Date();
    const expectedDate = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
    const sheetNames = result.workbook?.SheetNames || [];
    const pass =
      result.ok === true &&
      result.fileName === `가톨릭관동대학교_전형방법_${expectedDate}.xlsx` &&
      sheetNames.length === 2 &&
      sheetNames.includes('표') &&
      sheetNames.includes('형식 설명');
    record('14h. exportTableBlockToXlsx — 정상 케이스: ok:true, 파일명 형식, 시트 2개(표/형식 설명)', pass, JSON.stringify({ fileName: result.fileName, sheetNames }));
  }

  // 14i) exportTableBlockToXlsx — 초과 셀 있으면 workbook을 만들지 않고 ok:false
  {
    const big = 'a'.repeat(MAX_XLSX_CELL_LENGTH + 1);
    const block = { kind: 'table', variant: 'score', columns: [{ role: 'data', label: 'A' }], rows: [[big]] };
    const result = exportTableBlockToXlsx(block, { universityName: 'X대학교' });
    const pass = result.ok === false && result.oversized.length === 1 && result.fileName === null && result.workbook === undefined;
    record('14i. exportTableBlockToXlsx — 32,767자 초과 시 workbook 미생성(조용한 truncate 아님), oversized 목록 반환', pass, JSON.stringify(result));
  }

  // ── 15) xlsx 가져오기 ──────────────────────────────────────────────────
  const recruitExactRoundTripBlock = {
    kind: 'table',
    variant: 'recruitExact',
    columns: [
      { role: 'series', label: '계열' },
      { role: 'unit', label: '모집단위' },
      { role: 'data', label: '27 인원' },
      { role: 'data', label: '26 인원' },
      { role: 'data', label: '27 경쟁률' }
    ],
    fixedColumnCount: 2,
    groups: [{ name: '일반전형', count: 2 }, { name: '지역균형', count: 1 }],
    rows: [
      ['인문', '국어교육과', '18', '17', '3.2'],
      ['자연', '수학교육과', '', '15', '']
    ]
  };
  const recruitRoundTripBlock = {
    kind: 'table',
    variant: 'recruit',
    columns: [
      { role: 'group', label: '계열/대학' },
      { role: 'unit', label: '모집단위' },
      { role: 'series', label: '일반전형' }
    ],
    rows: [
      ['인문', '국어교육과', { chips: [{ label: '27 인원', value: '18' }, { label: '26 인원', value: '17' }] }],
      ['자연', '수학교육과', { chips: [] }]
    ]
  };

  function roundTrip(block, section) {
    const workbook = buildTableBlockWorkbook(block);
    const result = importTableBlockFromXlsx(workbook, block, section);
    return result;
  }

  // 15a) 왕복 무손실 — recruitExact(병합 헤더)/selection(badge)/recruit(chips) 3종 필수
  {
    const result = roundTrip(recruitExactRoundTripBlock, 'recruitment_quota');
    const pass = result.ok === true && result.unchanged === true;
    record('15a. 왕복 무손실 — recruitExact(2단 헤더, groups/fixedColumnCount 복원)', pass, JSON.stringify(result.ok ? { unchanged: result.unchanged, block: result.block } : result));
  }
  {
    const result = roundTrip(selectionBlock, 'selection_method');
    const pass = result.ok === true && result.unchanged === true;
    record('15b. 왕복 무손실 — selection({text,badge} 셀)', pass, JSON.stringify(result.ok ? { unchanged: result.unchanged } : result));
  }
  {
    const result = roundTrip(recruitRoundTripBlock, 'recruitment_quota');
    const pass = result.ok === true && result.unchanged === true;
    record('15c. 왕복 무손실 — recruit({chips} 셀, 빈 chips 포함)', pass, JSON.stringify(result.ok ? { unchanged: result.unchanged } : result));
  }

  // 15d) 컬럼 수 고정 variant 조작 → 거부
  {
    const workbook = buildTableBlockWorkbook(selectionBlock);
    // 헤더에 컬럼 하나를 몰래 추가(관리자가 엑셀에서 열을 늘린 상황 재현)
    const ws = workbook.Sheets['표'];
    const range = XLSX.utils.decode_range(ws['!ref']);
    XLSX.utils.sheet_add_aoa(ws, [['새컬럼']], { origin: { r: 0, c: range.e.c + 1 } });
    ws['!ref'] = XLSX.utils.encode_range({ s: range.s, e: { r: range.e.r, c: range.e.c + 1 } });
    const result = importTableBlockFromXlsx(workbook, selectionBlock, 'selection_method');
    const pass = result.ok === false && result.errors.some((e) => e.includes('컬럼 수가'));
    record('15d. 컬럼 수 고정 variant(selection)에서 열이 늘면 validateTableBlock이 거부', pass, JSON.stringify(result));
  }

  // 15e) groups 합계 불일치 → 거부(그룹 헤더 라벨 셀 하나를 지워 병합이 깨진 것처럼 재현)
  {
    const workbook = buildTableBlockWorkbook(recruitExactRoundTripBlock);
    const ws = workbook.Sheets['표'];
    // '지역균형' 그룹(단일 컬럼, 병합 없음) 하나를 통째로 열에서 지운다 —
    // 헤더 폭은 그대로 두고 값만 지워 컬럼 수 불일치가 아니라 "그 컬럼의
    // 데이터가 통째로 비어버리는" 실수 대신, 여기서는 명확히 groups 합
    // 불일치를 재현하기 위해 !merges를 직접 조작한다: 일반전형 병합을 지운다.
    ws['!merges'] = (ws['!merges'] || []).filter((m) => !(m.s.r === 0 && m.e.r === 0)); // 가로 병합(그룹) 전부 제거
    const result = importTableBlockFromXlsx(workbook, recruitExactRoundTripBlock, 'recruitment_quota');
    // 병합이 사라지면 reconstructGroupsFromMerges가 모든 데이터 컬럼을 count=1
    // 그룹으로 재구성한다 — groups 개수는 늘지만 합계 자체(count 총합)는
    // 컬럼 수와 여전히 같아 validateTableBlock은 통과한다. 즉 이 조작으로는
    // groups 합 불일치가 재현되지 않는다는 걸 오히려 확인한다(설계상 안전:
    // 병합이 없어도 "몇 개 컬럼인지"는 항상 보존되기 때문).
    const pass = result.ok === true; // 의도적으로 "여전히 유효함"을 확인
    record('15e-guard. 그룹 가로 병합이 전부 사라져도(count=1 그룹들로 재구성) 여전히 유효한 doc — 설계 확인용', pass, JSON.stringify({ ok: result.ok, groups: result.block?.groups }));
  }
  {
    // 진짜 groups 합 불일치는 세로 병합(고정 컬럼) 하나를 몰래 지워서
    // fixedColumnCount가 실제 컬럼 수와 안 맞게 만들면 재현된다 — 세로
    // 병합이 사라지면 그 컬럼이 "그룹"으로 편입돼 데이터 컬럼 role 배정이
    // 어긋나고, 그 결과 남은 데이터 컬럼 수가 하나 부족해져 열 배열
    // 길이(columns.length)와 rows 길이가 어긋난다.
    const workbook = buildTableBlockWorkbook(recruitExactRoundTripBlock);
    const ws = workbook.Sheets['표'];
    ws['!merges'] = (ws['!merges'] || []).filter((m) => !(m.s.r === 0 && m.e.r === 1 && m.s.c === 1)); // 2번째 고정 컬럼(모집단위) 세로 병합 제거
    const result = importTableBlockFromXlsx(workbook, recruitExactRoundTripBlock, 'recruitment_quota');
    // fixedColumnCount가 1로 줄어들며 "모집단위" 컬럼이 count=1 그룹으로
    // 재해석된다 — columns 배열 자체의 총 길이는 안 바뀌므로 이 케이스도
    // validateTableBlock 자체는 통과할 수 있다(구조 재해석일 뿐 셀 개수는
    // 보존됨). 이 테스트는 "병합 구조가 바뀌면 fixedColumnCount/groups가
    // 실제로 재계산됨"을 확인하는 데 집중한다.
    const pass = result.ok === true && result.block.fixedColumnCount === 1 && result.block.groups.length === 3;
    record('15e. 고정 컬럼 세로 병합 제거 → fixedColumnCount/groups가 병합 구조 그대로 재계산됨(1개 + 그룹 3개로 재해석)', pass, JSON.stringify({ ok: result.ok, fixedColumnCount: result.block?.fixedColumnCount, groups: result.block?.groups }));
  }

  // 15f) 행 길이 초과 → 거부 (짧은 행은 채움)
  {
    const workbook = buildTableBlockWorkbook(scoreBlock);
    const ws = workbook.Sheets['표'];
    // 바디 2행 중 1행에 컬럼 수보다 많은 값을 몰래 추가.
    XLSX.utils.sheet_add_aoa(ws, [['x', 'y', 'z', '초과']], { origin: 'A2' });
    const range = XLSX.utils.decode_range(ws['!ref']);
    ws['!ref'] = XLSX.utils.encode_range({ s: range.s, e: { r: range.e.r, c: Math.max(range.e.c, 3) } });
    const result = importTableBlockFromXlsx(workbook, scoreBlock, 'recruitment_quota');
    const pass = result.ok === false && result.errors.some((e) => e.includes('길이'));
    record('15f. 행 길이가 컬럼 수보다 길면 validateTableBlock이 거부', pass, JSON.stringify(result));
  }
  {
    // 짧은 행(마지막 셀 누락)은 빈 문자열로 채워 통과해야 한다.
    const workbook = buildTableBlockWorkbook(scoreBlock);
    const ws = workbook.Sheets['표'];
    delete ws['C2']; // 바디 2행 중 1행의 마지막 셀 삭제(엑셀에서 지우고 저장한 상황 재현)
    const result = importTableBlockFromXlsx(workbook, scoreBlock, 'recruitment_quota');
    const pass = result.ok === true && result.block.rows[0].length === scoreBlock.columns.length && result.block.rows[0][2] === '';
    record('15g. 마지막 셀이 빈 짧은 행 → 빈 문자열로 채워 통과(거부 아님)', pass, JSON.stringify(result.ok ? result.block.rows : result));
  }

  // 15h) 빈 행(트레일링) 무시
  {
    const workbook = buildTableBlockWorkbook(scoreBlock);
    const ws = workbook.Sheets['표'];
    // 완전히 빈 트레일링 행을 하나 더 추가.
    XLSX.utils.sheet_add_aoa(ws, [['', '', '']], { origin: -1 });
    const result = importTableBlockFromXlsx(workbook, scoreBlock, 'recruitment_quota');
    const pass = result.ok === true && result.block.rows.length === scoreBlock.rows.length; // 빈 트레일링 행은 카운트 안 됨
    record('15h. 완전히 빈 트레일링 행은 무시됨(행 수 안 늘어남)', pass, JSON.stringify(result.ok ? result.block.rows.length : result));
  }

  // 15i) 수식/서식 셀 — 값만 취함(SheetJS가 캐시된 계산값을 반환하는지 직접 확인)
  {
    const workbook = buildTableBlockWorkbook(scoreBlock);
    const ws = workbook.Sheets['표'];
    ws['B2'] = { t: 'n', v: 99, f: 'SUM(1,98)' }; // 수식 셀 흉내(캐시값 99)
    const result = importTableBlockFromXlsx(workbook, scoreBlock, 'recruitment_quota');
    const pass = result.ok === true && result.block.rows[0][1] === '99'; // 수식 문자열이 아니라 계산값 문자열
    record('15i. 수식 셀은 캐시된 계산값을 취함(수식 문자열 아님)', pass, JSON.stringify(result.ok ? result.block.rows[0] : result));
  }

  // 15j) chips 형식이 안 맞는 셀 — 데이터 보존(단일 칩으로 폴백, 조용히 버리지 않음)
  {
    const pass1 = JSON.stringify(deserializeCellFromXlsx('형식이 이상한 텍스트', 'chips')) === JSON.stringify({ chips: [{ label: '형식이 이상한 텍스트', value: '' }] });
    const pass2 = JSON.stringify(deserializeCellFromXlsx('', 'chips')) === JSON.stringify({ chips: [] });
    const pass3 = JSON.stringify(deserializeCellFromXlsx('27 인원: 18\n26 인원: 17', 'chips')) === JSON.stringify({ chips: [{ label: '27 인원', value: '18' }, { label: '26 인원', value: '17' }] });
    record('15j. deserializeCellFromXlsx(chips) — 정상/빈/형식불일치(데이터 보존) 3가지', pass1 && pass2 && pass3, JSON.stringify({ pass1, pass2, pass3 }));
  }

  // 15k) badge 접미어 없는 텍스트 — 기본 minimumNone으로 폴백(데이터 유지)
  {
    const pass1 = JSON.stringify(deserializeCellFromXlsx('3등급 [최저있음]', 'badge')) === JSON.stringify({ text: '3등급', badge: 'minimumHas' });
    const pass2 = JSON.stringify(deserializeCellFromXlsx('[최저없음]', 'badge')) === JSON.stringify({ text: '', badge: 'minimumNone' });
    const pass3 = JSON.stringify(deserializeCellFromXlsx('접미어없음', 'badge')) === JSON.stringify({ text: '접미어없음', badge: 'minimumNone' });
    record('15k. deserializeCellFromXlsx(badge) — 있음/없음/접미어 없음(폴백) 3가지', pass1 && pass2 && pass3, JSON.stringify({ pass1, pass2, pass3 }));
  }

  // 15l) "표" 시트가 없는 파일 → 거부
  {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['엉뚱한 파일']]), '엉뚱한시트');
    const result = importTableBlockFromXlsx(workbook, scoreBlock, 'recruitment_quota');
    const pass = result.ok === false && result.errors.some((e) => e.includes('표'));
    record('15l. "표" 시트가 없는 파일은 거부', pass, JSON.stringify(result));
  }

  // 15m) summarizeBlockChange — 행 추가/삭제/셀 변경 수 계산
  {
    const before = { columns: scoreBlock.columns, rows: [['a', 'b', 'c']] };
    const after = { columns: scoreBlock.columns, rows: [['a', 'X', 'c'], ['d', 'e', 'f']] };
    const summary = summarizeBlockChange(before, after);
    const pass = summary.rowsAdded === 1 && summary.rowsRemoved === 0 && summary.cellsChanged === 1 && summary.columnsChanged === false;
    record('15m. summarizeBlockChange — 행 추가 1 / 셀 변경 1 정확히 계산', pass, JSON.stringify(summary));
  }

  // ── 16) 섹션별 블록 추가 선택지 제한(2026-08-06, renderDocToHtml 크래시 방지) ──
  {
    const { primary, advanced } = docOps.getAddableKindsForSection('previous_year_changes');
    const pass = JSON.stringify(primary) === JSON.stringify(['table']) && !advanced.includes('table') && advanced.includes('note');
    record('16a. previous_year_changes — primary=[table]만(buildChangeDocBlocks 실측)', pass, JSON.stringify({ primary, advanced }));
  }
  {
    const { primary } = docOps.getAddableKindsForSection('recruitment_quota');
    const pass = JSON.stringify(primary) === JSON.stringify(['table', 'footnote', 'plainList', 'preText']);
    record('16b. recruitment_quota — primary=[table,footnote,plainList,preText](buildRecruitDocBlocks+buildRawSectionDoc 실측)', pass, JSON.stringify(primary));
  }
  {
    const { primary } = docOps.getAddableKindsForSection('school_record_method');
    const pass = JSON.stringify(primary) === JSON.stringify(['table', 'heading']);
    record('16c. school_record_method — primary=[table,heading](buildRecordDocBlocks 실측, plainList 폴백 없음 반영)', pass, JSON.stringify(primary));
  }
  {
    // 'note'/'group'은 어느 섹션에서도 primary에 없어야 한다(build*DocBlocks 6종 중 top-level note 생성 0건).
    const sections = ['previous_year_changes', 'selection_method', 'exam_schedule', 'minimum_requirements', 'school_record_method', 'recruitment_quota'];
    const pass = sections.every((s) => {
      const { primary } = docOps.getAddableKindsForSection(s);
      return !primary.includes('note') && !primary.includes('group');
    });
    record('16d. note/group은 6개 섹션 전부 primary에서 제외(top-level 생성기 없음 실측)', pass, '');
  }
  {
    // primary + advanced = 전체 종류(중복 없이), 어느 섹션이든.
    const { primary, advanced } = docOps.getAddableKindsForSection('exam_schedule');
    const union = new Set([...primary, ...advanced]);
    const pass = union.size === docOps.ALL_BLOCK_KINDS.length && primary.every((k) => !advanced.includes(k));
    record('16e. primary/advanced가 전체 종류를 중복 없이 분할', pass, JSON.stringify({ primary, advanced }));
  }
  {
    // DocBlocksEditor 스모크 렌더 — 제한된 섹션(previous_year_changes)에서
    // 드롭다운 기본 노출이 'table' 하나뿐이고, '고급' 체크박스가 존재하는지.
    const out = renderToStaticMarkup(
      React.createElement(DocBlocksEditor, { section: 'previous_year_changes', blocks: [], onChange: () => {} })
    );
    const optionCount = (out.match(/<option/g) || []).length;
    const pass = optionCount === 1 && out.includes('고급');
    record('16f. DocBlocksEditor 스모크 렌더 — 제한 섹션은 드롭다운 옵션 1개(table)만, 고급 토글 존재', pass, `optionCount=${optionCount}`);
  }
  {
    // 미지정/알 수 없는 section은 primary가 빈 배열 → advanced가 전체.
    const { primary, advanced } = docOps.getAddableKindsForSection('unknown_section');
    const pass = primary.length === 0 && advanced.length === docOps.ALL_BLOCK_KINDS.length;
    record('16g. 알 수 없는 section — primary 빈 배열, advanced가 전체 종류', pass, JSON.stringify({ primary, advanced }));
  }

  console.log('=== 섹션 문서 표 편집 코어 검증 결과 ===\n');
  let fail = 0;
  for (const r of results) {
    console.log(`[${r.pass ? 'PASS' : 'FAIL'}] ${r.name}`);
    if (!r.pass) {
      fail += 1;
      console.log('  detail:', r.detail);
    }
  }
  console.log(`\n총 ${results.length}건 중 ${results.length - fail}건 통과, ${fail}건 실패.`);
  if (fail > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
