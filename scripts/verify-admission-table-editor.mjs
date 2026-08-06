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

const REPO_ROOT = path.resolve(new URL('.', import.meta.url).pathname, '..');

async function loadModule(entry, exportName) {
  const result = await esbuild.build({
    entryPoints: [path.join(REPO_ROOT, entry)],
    bundle: true,
    format: 'esm',
    jsx: 'automatic',
    jsxImportSource: 'react',
    platform: 'node',
    external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/server'],
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
