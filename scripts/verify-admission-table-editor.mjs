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

import fs from "node:fs";
import path from "node:path";
import * as esbuild from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as XLSX from "xlsx";
import {
  buildSpecialCategoryDoc,
  renderDocToHtml,
} from "../src/lib/admissionParsing.js";

const REPO_ROOT = path.resolve(new URL(".", import.meta.url).pathname, "..");

async function loadModule(entry, exportName) {
  const result = await esbuild.build({
    entryPoints: [path.join(REPO_ROOT, entry)],
    bundle: true,
    format: "esm",
    jsx: "automatic",
    jsxImportSource: "react",
    platform: "node",
    external: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react-dom/server",
      "xlsx",
    ],
    write: false,
  });
  const code = result.outputFiles[0].text;
  const tmpFile = path.join(
    REPO_ROOT,
    `.tmp-table-editor-verify-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`,
  );
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
  const validation = await loadModule(
    "src/components/admission/editor/tableEditorValidation.js",
  );
  const ops = await loadModule(
    "src/components/admission/editor/tableBlockOperations.js",
  );
  const docOps = await loadModule(
    "src/components/admission/editor/docBlockOperations.js",
  );
  const layout = await loadModule(
    "src/components/admission/admissionLayout.js",
  );
  const TableBlockEditor = await loadModule(
    "src/components/admission/editor/TableBlockEditor.jsx",
    "default",
  );
  const ColumnRoleEditor = await loadModule(
    "src/components/admission/editor/ColumnRoleEditor.jsx",
    "default",
  );
  const DocBlocksEditor = await loadModule(
    "src/components/admission/editor/DocBlocksEditor.jsx",
    "default",
  );

  const {
    validateTableBlock,
    validateBlocks,
    getColumnMutationBlockReason,
    resolveCellKind,
    emptyCellForKind,
  } = validation;
  const { getCellKind, getKnownRolesForVariant, defaultNewColumnRole } = layout;

  // ── 샘플 블록 ──────────────────────────────────────────────────────
  const selectionBlock = {
    kind: "table",
    variant: "selection",
    columns: [
      { role: "type", label: "전형" },
      { role: "name", label: "전형명" },
      { role: "seats", label: "인원" },
      { role: "minimum", label: "최저" },
      { role: "method", label: "전형방법" },
    ],
    rows: [
      [
        "학생부교과",
        "일반전형",
        "10",
        { text: "3등급", badge: "minimumHas" },
        "내신 100%",
      ],
      [
        "학생부종합",
        "서류전형",
        "5",
        { text: "-", badge: "minimumNone" },
        "서류 100%",
      ],
    ],
  };

  const recruitBlock = {
    kind: "table",
    variant: "recruit",
    columns: [
      { role: "group", label: "계열/대학" },
      { role: "unit", label: "모집단위" },
      { role: "data", label: "일반전형" },
    ],
    rows: [
      ["인문", "국어교육과", { chips: [{ label: "27 인원", value: "18" }] }],
      ["자연", "수학교육과", { chips: [] }],
    ],
  };

  const scoreBlock = {
    kind: "table",
    variant: "score",
    columns: [
      { role: "metric", label: "구분" },
      { role: "a", label: "A" },
      { role: "b", label: "B" },
    ],
    rows: [
      ["국어", "1등급", "2등급"],
      ["수학", "1등급", "2등급"],
    ],
  };

  // ── 1) 셀 3형태 편집 후 validateAdmissionDoc 통과 ────────────────────
  {
    const next = ops.updateCell(selectionBlock, 0, 1, "전형명(수정)");
    const result = validateTableBlock("selection_method", next);
    const pass = result.ok && next.rows[0][1] === "전형명(수정)";
    record(
      "1a. 문자열 셀 편집 후 validateAdmissionDoc 통과",
      pass,
      JSON.stringify(result),
    );
  }
  {
    const nextCell = { text: "2등급", badge: "minimumHas" };
    const next = ops.updateCell(selectionBlock, 0, 3, nextCell);
    const result = validateTableBlock("selection_method", next);
    const pass =
      result.ok &&
      next.rows[0][3].text === "2등급" &&
      next.rows[0][3].badge === "minimumHas";
    record(
      "1b. {text,badge} 셀 편집 후 validateAdmissionDoc 통과",
      pass,
      JSON.stringify(result),
    );
  }
  {
    const nextCell = {
      chips: [
        { label: "27 인원", value: "20" },
        { label: "26 인원", value: "18" },
      ],
    };
    const next = ops.updateCell(recruitBlock, 0, 2, nextCell);
    const result = validateTableBlock("recruitment_quota", next);
    const pass = result.ok && next.rows[0][2].chips.length === 2;
    record(
      "1c. {chips} 셀 편집 후 validateAdmissionDoc 통과",
      pass,
      JSON.stringify(result),
    );
  }

  // ── 2) 열 추가·삭제 시 전 행 길이가 함께 맞춰지는지(고정 컬럼 수 아닌 variant) ──
  {
    const added = ops.addColumn(scoreBlock);
    const rowLenOk = added.rows.every(
      (row) => row.length === added.columns.length,
    );
    const result = validateTableBlock("recruitment_quota", added);
    const pass =
      added.columns.length === scoreBlock.columns.length + 1 &&
      rowLenOk &&
      result.ok;
    record(
      "2a. 열 추가 시 columns.length와 모든 rows[].length가 함께 늘어남",
      pass,
      JSON.stringify({
        columns: added.columns.length,
        rowLens: added.rows.map((r) => r.length),
        result,
      }),
    );
  }
  {
    const removed = ops.removeColumn(scoreBlock, 1);
    const rowLenOk = removed.rows.every(
      (row) => row.length === removed.columns.length,
    );
    const result = validateTableBlock("recruitment_quota", removed);
    const pass =
      removed.columns.length === scoreBlock.columns.length - 1 &&
      rowLenOk &&
      result.ok;
    record(
      "2b. 열 삭제 시 columns.length와 모든 rows[].length가 함께 줄어듦",
      pass,
      JSON.stringify({
        columns: removed.columns.length,
        rowLens: removed.rows.map((r) => r.length),
        result,
      }),
    );
  }
  {
    // 마지막 컬럼은 삭제 방지(자체 가드) — 직사각형이되 컬럼 0은 스키마상 무의미.
    const singleColumnBlock = {
      ...scoreBlock,
      columns: [scoreBlock.columns[0]],
      rows: scoreBlock.rows.map((r) => [r[0]]),
    };
    const removed = ops.removeColumn(singleColumnBlock, 0);
    record(
      "2c. 컬럼이 1개뿐이면 삭제 시도해도 그대로 유지(가드)",
      removed.columns.length === 1,
      JSON.stringify(removed.columns),
    );
  }

  // ── 3) 컬럼 수 고정 variant에서 열 조작이 차단되는지 ──────────────────
  {
    const fixedVariantBlocks = {
      selection: selectionBlock,
      change: {
        kind: "table",
        variant: "change",
        columns: [
          { role: "no", label: "번호" },
          { role: "title", label: "제목" },
          { role: "content", label: "내용" },
        ],
        rows: [["1", "변경", "내용"]],
      },
      exam: {
        kind: "table",
        variant: "exam",
        columns: [
          { role: "a", label: "A" },
          { role: "b", label: "B" },
          { role: "c", label: "C" },
        ],
        rows: [["x", "y", "z"]],
      },
      minimum: {
        kind: "table",
        variant: "minimum",
        columns: [
          { role: "a", label: "A" },
          { role: "b", label: "B" },
          { role: "c", label: "C" },
          { role: "d", label: "D" },
          { role: "e", label: "E" },
        ],
        rows: [["1", "2", "3", "4", "5"]],
      },
      recordInfo: {
        kind: "table",
        variant: "recordInfo",
        columns: [
          { role: "a", label: "A" },
          { role: "b", label: "B" },
        ],
        rows: [["x", "y"]],
      },
    };
    let allBlocked = true;
    const detail = [];
    for (const [variant, block] of Object.entries(fixedVariantBlocks)) {
      const reason = getColumnMutationBlockReason(
        variant === "selection" ? "selection_method" : "recruitment_quota",
        block,
      );
      const blocked = typeof reason === "string" && reason.length > 0;
      allBlocked = allBlocked && blocked;
      detail.push(`${variant}: blocked=${blocked} reason=${reason}`);
    }
    record(
      "3a. 컬럼 수 고정 5종(selection/change/exam/minimum/recordInfo) 전부 열 조작 차단",
      allBlocked,
      detail.join("\n"),
    );
  }
  {
    // score/generic은 컬럼 수 고정이 아니므로 차단되면 안 된다.
    const reason = getColumnMutationBlockReason(
      "recruitment_quota",
      scoreBlock,
    );
    record(
      "3b. score(컬럼 수 비고정)는 열 조작 허용(reason=null)",
      reason === null,
      String(reason),
    );
  }
  {
    // recruitExact는 groups/fixedColumnCount와 컬럼 수가 맞물려 있어 차단돼야 한다.
    const recruitExactBlock = {
      kind: "table",
      variant: "recruitExact",
      columns: [
        { role: "series", label: "계열" },
        { role: "unit", label: "모집단위" },
        { role: "data", label: "27 인원" },
        { role: "data", label: "26 인원" },
      ],
      fixedColumnCount: 2,
      groups: [{ name: "일반전형", count: 2 }],
      rows: [["인문", "국어교육과", "18", "17"]],
    };
    const reason = getColumnMutationBlockReason(
      "recruitment_quota",
      recruitExactBlock,
    );
    const pass = typeof reason === "string" && reason.includes("그룹 헤더");
    record(
      "3c. recruitExact(groups 연동)는 그룹 헤더 사유로 열 조작 차단",
      pass,
      String(reason),
    );
  }

  // ── 4) 행 순서 변경 후 데이터 무결성 ──────────────────────────────────
  {
    const threeRowBlock = {
      ...scoreBlock,
      rows: [
        ["국어", "a1", "a2"],
        ["수학", "b1", "b2"],
        ["영어", "c1", "c2"],
      ],
    };
    const moved = ops.moveRow(threeRowBlock, 0, 1);
    const pass =
      moved.rows.length === 3 &&
      moved.rows[0][0] === "수학" &&
      moved.rows[1][0] === "국어" &&
      moved.rows[2][0] === "영어" &&
      JSON.stringify(moved.columns) === JSON.stringify(threeRowBlock.columns);
    record(
      "4a. moveRow(0,+1) — 순서만 바뀌고 각 행 내용·컬럼은 그대로",
      pass,
      JSON.stringify(moved.rows),
    );
  }
  {
    const threeRowBlock = {
      ...scoreBlock,
      rows: [
        ["국어", "a1", "a2"],
        ["수학", "b1", "b2"],
        ["영어", "c1", "c2"],
      ],
    };
    const movedOut = ops.moveRow(threeRowBlock, 0, -1); // 맨 위 행을 더 위로 — 범위 밖, no-op
    const movedOut2 = ops.moveRow(threeRowBlock, 2, 1); // 맨 아래 행을 더 아래로 — 범위 밖, no-op
    const pass =
      JSON.stringify(movedOut.rows) === JSON.stringify(threeRowBlock.rows) &&
      JSON.stringify(movedOut2.rows) === JSON.stringify(threeRowBlock.rows);
    record("4b. 범위를 벗어나는 moveRow는 no-op(순서 불변)", pass, "");
  }
  {
    const added = ops.addRow(selectionBlock);
    const lastRow = added.rows[added.rows.length - 1];
    // selection variant: type/name/seats/method는 text('' ), minimum은 badge({text:'',badge:'minimumNone'})
    const pass =
      added.rows.length === selectionBlock.rows.length + 1 &&
      lastRow[0] === "" &&
      lastRow[3].text === "" &&
      lastRow[3].badge === "minimumNone" &&
      validateTableBlock("selection_method", added).ok;
    record(
      '4c. addRow — 컬럼별 kind에 맞는 빈 셀(text=""/badge={text:"",badge:"minimumNone"})',
      pass,
      JSON.stringify(lastRow),
    );
  }
  {
    const removed = ops.removeRow(selectionBlock, 0);
    const pass =
      removed.rows.length === 1 && removed.rows[0][0] === "학생부종합";
    record(
      "4d. removeRow(0) — 나머지 행만 남음",
      pass,
      JSON.stringify(removed.rows),
    );
  }

  // ── 5) resolveCellKind / getCellKind 판정 ────────────────────────────
  {
    const pass =
      getCellKind("selection", "minimum") === "badge" &&
      getCellKind("selection", "type") === "text" &&
      getCellKind("recruit", "group") === "text" &&
      getCellKind("recruit", "unit") === "text" &&
      getCellKind("recruit", "data") === "chips" &&
      getCellKind("recruitExact", "series") === "text";
    record(
      "5a. getCellKind(variant, role) 판정 — SelectionTable/RecruitTable 조건과 일치",
      pass,
      "",
    );
  }
  {
    // 실제 셀 값 형태가 role 판정과 다르면 값 형태를 신뢰(방어적)
    const pass =
      resolveCellKind("text", { chips: [] }) === "chips" &&
      resolveCellKind("text", { text: "x", badge: "minimumHas" }) === "badge" &&
      resolveCellKind("badge", "plain string") === "badge"; // role 힌트 유지(문자열은 판정 근거 없음)
    record(
      "5b. resolveCellKind — 값 형태가 role 힌트와 다르면 값 형태 우선",
      pass,
      "",
    );
  }
  {
    const pass =
      JSON.stringify(emptyCellForKind("text")) === '""' &&
      JSON.stringify(emptyCellForKind("badge")) ===
        JSON.stringify({ text: "", badge: "minimumNone" }) &&
      JSON.stringify(emptyCellForKind("chips")) ===
        JSON.stringify({ chips: [] });
    record("5c. emptyCellForKind — kind별 빈 셀 기본값", pass, "");
  }

  // ── 6) 컴포넌트 구조적 스모크 렌더 ────────────────────────────────────
  {
    let out = "";
    let threw = false;
    try {
      out = renderToStaticMarkup(
        React.createElement(TableBlockEditor, {
          section: "selection_method",
          block: selectionBlock,
          onChange: () => {},
        }),
      );
    } catch (err) {
      threw = true;
      out = String(err?.stack ? err.stack : err);
    }
    const inputCount = (out.match(/<input/g) || []).length;
    // 2026-08-06 위계 재정리 후: 기본 상태(열 설정 닫힘)에서는 컬럼 라벨
    // 입력 5개(헤더) + 바디 셀 입력 2행×5셀=10개(badge 셀도 <input> 1개
    // 뿐 — select는 <input> 아님) + 항상 존재하는 숨김 xlsx 파일 input
    // 1개(가져오기 버튼이 트리거) = 16개만 렌더된다. role/정렬/열
    // 추가삭제는 "열 설정" 토글 뒤로 숨었으므로 기본 렌더에는 없어야
    // 한다(selection은 컬럼 수 고정 variant라 "열 추가" 자체가 영영 없고,
    // "열 삭제"는 설정을 펼쳐야만 나온다). 대신 고정 사유 안내 문구는
    // 토글과 무관하게 항상 보여야 한다.
    const pass =
      !threw &&
      inputCount === 16 &&
      out.includes("행 추가") &&
      out.includes("열 설정") &&
      !out.includes("열 삭제") &&
      out.includes("컬럼 수가 고정");
    record(
      "6. TableBlockEditor 스모크 렌더(예외 없음, 기본 상태는 라벨·셀만 — role/정렬/열조작은 숨김)",
      pass,
      threw ? out : `inputCount=${inputCount}`,
    );
  }

  // ── 6b) "열 설정" 토글을 펼치면 숨겼던 컨트롤이 실제로 나타나는지 —
  //   기능을 지운 게 아니라 접근 경로만 옮겼다는 걸 별도로 증명한다.
  //   렌더된 정적 마크업에는 React 이벤트 핸들러가 없어 클릭을 흉내낼 수
  //   없으므로, TableBlockEditor 대신 컴포넌트가 넘겨주는 상태 없이 직접
  //   같은 위치의 자식(TableGroupHeaderEditor)을 expanded:true로 렌더해
  //   그 경로가 실제로 존재하는지 확인한다(score는 컬럼 수 고정이 아니므로
  //   "+ 열 추가"까지 같이 검증 가능 — TableBlockEditor를 그대로 쓰되
  //   score 블록으로 조립하는 건 상태를 못 바꾸니, ColumnRoleEditor·
  //   TableGroupHeaderEditor를 열린 상태로 직접 렌더해 그 두 조각이
  //   여전히 정상 동작함을 확인한다).
  {
    const TableGroupHeaderEditor = await loadModule(
      "src/components/admission/editor/TableGroupHeaderEditor.jsx",
      "default",
    );
    const collapsed = renderToStaticMarkup(
      React.createElement(TableGroupHeaderEditor, {
        groups: [{ name: "g", count: 2 }],
        fixedColumnCount: 1,
        columnsLength: 3,
        expanded: false,
        onUpdateGroupField: () => {},
        onAddGroup: () => {},
        onRemoveGroup: () => {},
        onUpdateFixedColumnCount: () => {},
        onEnableGroups: () => {},
      }),
    );
    const expanded = renderToStaticMarkup(
      React.createElement(TableGroupHeaderEditor, {
        groups: [{ name: "g", count: 2 }],
        fixedColumnCount: 1,
        columnsLength: 3,
        expanded: true,
        onUpdateGroupField: () => {},
        onAddGroup: () => {},
        onRemoveGroup: () => {},
        onUpdateFixedColumnCount: () => {},
        onEnableGroups: () => {},
      }),
    );
    const pass =
      collapsed.includes("합계") &&
      !collapsed.includes("그룹 추가") &&
      expanded.includes("그룹 추가") &&
      expanded.includes("고정 컬럼 수");
    record(
      "6b. TableGroupHeaderEditor expanded 토글 — 접힘은 요약만, 펼침은 편집 필드까지",
      pass,
      `collapsed=${collapsed}\nexpanded=${expanded}`,
    );
  }

  // ── 6c) rowPreviewText — 비문자열 셀(text가 number)이어도 죽지 않는지 ────
  // tableModel.js:90-93 cellTextOf는 cell.text가 null/undefined일 때만 ''로
  // 바꾸고 숫자 등은 그대로 통과시킨다. TableBlockEditor.jsx의
  // rowPreviewText는 그 결과에 .trim()을 걸어 표 밖 행 목록 미리보기를
  // 만드는데, 문자열이 아닌 값이 오면 과거에는 TypeError로 편집기 전체가
  // 죽었다(String()으로 감싸 수정). 앞 3칸은 빈 문자열(스킵), 4번째 칸만
  // {text:10, badge}로 숫자 text를 줘서 rowPreviewText가 실제로 그 칸까지
  // 도달해 .trim()을 타도록 만든다.
  {
    const numericCellBlock = {
      ...selectionBlock,
      rows: [
        ["", "", "", { text: 10, badge: "minimumHas" }, ""],
        selectionBlock.rows[1],
      ],
    };
    let out = "";
    let threw = false;
    try {
      out = renderToStaticMarkup(
        React.createElement(TableBlockEditor, {
          section: "selection_method",
          block: numericCellBlock,
          onChange: () => {},
        }),
      );
    } catch (err) {
      threw = true;
      out = String(err?.stack ? err.stack : err);
    }
    const pass = !threw && out.includes(">10<");
    record(
      '6c. rowPreviewText — text가 숫자인 badge 셀도 예외 없이 렌더(미리보기 "10" 노출)',
      pass,
      threw ? out : `len=${out.length}`,
    );
  }

  // ── 7) IME 조합 로직 — 순수 상태 전이 검증(실제 브라우저 이벤트는 재현 불가) ──
  // ImeSafeInput의 알고리즘을 그대로 복제해 상태 전이만 검증한다. 실제
  // compositionstart/compositionend 이벤트 디스패치와 브라우저 IME 렌더는
  // jsdom/브라우저가 필요해 이 환경에서는 재현 불가 — 로직 자체의 정확성만
  // 확인한다(재현 불가 사실을 명시).
  {
    function simulateImeSafeInput(events) {
      let composing = false;
      let draft = "";
      let committed = null; // 마지막 onCommit 인자
      for (const event of events) {
        if (event.type === "compositionstart") {
          composing = true;
        } else if (event.type === "change") {
          draft = event.value;
          if (!composing) committed = event.value;
        } else if (event.type === "compositionend") {
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
      { type: "compositionstart" },
      { type: "change", value: "ㅇ" },
      { type: "change", value: "안" },
      { type: "compositionend", value: "안" },
    ]);
    const pass1 = r1.draft === "안" && r1.committed === "안";

    // 조합 없는 일반 영문 입력은 매 change마다 즉시 committed.
    const r2 = simulateImeSafeInput([
      { type: "change", value: "a" },
      { type: "change", value: "ab" },
    ]);
    const pass2 = r2.committed === "ab";

    record(
      "7. IME 조합 상태 전이 로직(순수 함수 복제) — 조합 중 draft만 갱신, commit은 조합 종료 후. ⚠ 실제 브라우저 compositionevent/캐럿 동작은 jsdom·브라우저 없이 이 환경에서 재현 불가(미검증으로 명시)",
      pass1 && pass2,
      JSON.stringify({ r1, r2 }),
    );
  }

  // ── 8) role 드롭다운 제한(2026-08-06 감사 반영) ──────────────────────
  {
    const pass =
      JSON.stringify(getKnownRolesForVariant("selection")) ===
        JSON.stringify(["type", "name", "seats", "minimum", "method"]) &&
      JSON.stringify(getKnownRolesForVariant("change")) ===
        JSON.stringify(["no", "title", "content"]) &&
      JSON.stringify(getKnownRolesForVariant("recruit")) ===
        JSON.stringify(["group", "unit", "series"]) &&
      JSON.stringify(getKnownRolesForVariant("generic")) === JSON.stringify([]);
    record(
      "8a. getKnownRolesForVariant — admissionParsing.js doc 생성기 소스와 일치(selection/change/recruit/generic)",
      pass,
      "",
    );
  }
  {
    const pass =
      defaultNewColumnRole("score") === "data" &&
      defaultNewColumnRole("recruit") === "series" &&
      defaultNewColumnRole("generic") === "";
    record(
      '8b. defaultNewColumnRole — variant별 목록 마지막 항목(비어있으면 "")',
      pass,
      "",
    );
  }
  {
    // addColumn이 이제 'col${n}' 대신 알려진 role을 기본으로 쓰는지 —
    // score는 컬럼 수 비고정이라 addColumn이 실제로 반영된다.
    const added = ops.addColumn(scoreBlock);
    const newColumn = added.columns[added.columns.length - 1];
    const pass =
      newColumn.role === "data" &&
      getCellKind("score", newColumn.role) === "text";
    record(
      // biome-ignore lint/suspicious/noTemplateCurlyInString: "${n}"은 리터럴로 보여주려는 테스트 설명 문자열이다. 템플릿 리터럴로 바꾸면 n이 스코프에 없어 깨진다.
      '8c. addColumn 기본 role이 defaultNewColumnRole(variant)를 씀("col${n}" 아님)',
      pass,
      JSON.stringify(newColumn),
    );
  }
  {
    const knownOut = renderToStaticMarkup(
      React.createElement(ColumnRoleEditor, {
        variant: "selection",
        role: "minimum",
        onChange: () => {},
      }),
    );
    const unknownOut = renderToStaticMarkup(
      React.createElement(ColumnRoleEditor, {
        variant: "selection",
        role: "my-custom-role",
        onChange: () => {},
      }),
    );
    const pass =
      !knownOut.includes("연결되지 않습니다") && // 알려진 role은 경고 없음
      unknownOut.includes("연결되지 않습니다") && // 목록에 없는 값은(기존 데이터 포함) 경고
      unknownOut.includes("my-custom-role"); // 직접 입력 필드에 현재 값 유지
    record(
      "8d. ColumnRoleEditor — 알려진 role은 경고 없음, 미지 role은 경고+현재값 보존",
      pass,
      `known=${knownOut}\nunknown=${unknownOut}`,
    );
  }

  // ── 9) 그룹 헤더(groups/fixedColumnCount) 편집 ───────────────────────
  const recruitExactBlockFull = {
    kind: "table",
    variant: "recruitExact",
    columns: [
      { role: "series", label: "계열" },
      { role: "unit", label: "모집단위" },
      { role: "data", label: "27 인원" },
      { role: "data", label: "26 인원" },
    ],
    fixedColumnCount: 2,
    groups: [{ name: "일반전형", count: 2 }],
    rows: [["인문", "국어교육과", "18", "17"]],
  };
  {
    // 불변식이 성립하는 초기 상태
    const ok = validateTableBlock("recruitment_quota", recruitExactBlockFull);
    // count를 3으로 늘리면(합계 2+3=5 ≠ columns.length 4) 위반 감지돼야 함
    const broken = ops.updateGroupField(recruitExactBlockFull, 0, "count", 3);
    const brokenResult = validateTableBlock("recruitment_quota", broken);
    const pass =
      ok.ok &&
      !brokenResult.ok &&
      brokenResult.errors.some((e) => e.includes("groups 합("));
    record(
      "9a. 그룹 count 변경으로 sum(groups)+fixedColumnCount≠columns.length 위반 감지",
      pass,
      JSON.stringify({ ok, brokenResult }),
    );
  }
  {
    // count를 3으로 늘리는 대신 fixedColumnCount를 1로 줄이면(2+1=3≠4) 여전히 위반
    // fixedColumnCount를 원래(2)에서 그대로 두고 group count 3, fixedColumnCount 1로 맞추면 4로 재일치
    const rebalanced = ops.updateFixedColumnCount(
      ops.updateGroupField(recruitExactBlockFull, 0, "count", 3),
      1,
    );
    const result = validateTableBlock("recruitment_quota", rebalanced);
    const pass = result.ok; // 3+1=4=columns.length
    record(
      "9b. fixedColumnCount 변경 후 재검증 — 합계를 다시 맞추면 통과",
      pass,
      JSON.stringify(result),
    );
  }
  {
    const added = ops.addGroup(recruitExactBlockFull);
    const pass =
      added.groups.length === 2 &&
      added.groups[1].count === 0 &&
      validateTableBlock("recruitment_quota", added).ok;
    record(
      "9c. addGroup — count:0으로 추가돼 불변식을 깨지 않음",
      pass,
      JSON.stringify(added.groups),
    );
  }
  {
    const removed = ops.removeGroup(recruitExactBlockFull, 0);
    // count 2짜리 그룹을 통째로 지우면 합계가 0+2=2≠4로 깨짐(의도된 동작 —
    // 그룹 삭제 시 해당 컬럼도 같이 지우는 자동 동기화는 이번 범위 밖).
    const result = validateTableBlock("recruitment_quota", removed);
    const pass = removed.groups.length === 0 && !result.ok;
    record(
      "9d. removeGroup — 그룹 자체는 지워지되(컬럼은 안 지워짐) 불변식 위반이 배너로 드러남(의도된 동작)",
      pass,
      JSON.stringify(result),
    );
  }

  // ── 10) footnote 편집 후 validate 통과 ────────────────────────────────
  {
    const footnoteBlock = { kind: "footnote", items: ["교직과정"] };
    const next = {
      ...footnoteBlock,
      items: [...footnoteBlock.items, "자율전공 과정"],
    };
    const result = validateBlocks("recruitment_quota", [next]);
    const pass = result.ok && next.items.join(" ") === "교직과정 자율전공 과정";
    record(
      "10. footnote 편집(항목 추가) 후 validateAdmissionDoc 통과 + join(' ') 미리보기 문자열 확인",
      pass,
      JSON.stringify({ next, result }),
    );
  }

  // ── 11) 비표 블록 4종 편집 후 validate 통과 ───────────────────────────
  {
    const cases = [
      {
        kind: "note",
        before: { kind: "note", text: "" },
        after: { kind: "note", text: "실제 안내" },
      },
      {
        kind: "emptyBox",
        before: { kind: "emptyBox", message: "" },
        after: { kind: "emptyBox", message: "없음" },
      },
      {
        kind: "heading",
        before: { kind: "heading", text: "" },
        after: { kind: "heading", text: "국어 환산표" },
      },
      {
        kind: "plainList",
        before: { kind: "plainList", items: [{ type: "text", text: "x" }] },
        after: { kind: "plainList", items: [{ type: "bullet", text: "y" }] },
      },
    ];
    let allPass = true;
    const detail = [];
    for (const c of cases) {
      const result = validateBlocks("selection_method", [c.after]);
      const changed = JSON.stringify(c.after) !== JSON.stringify(c.before);
      const ok = result.ok && changed;
      allPass = allPass && ok;
      detail.push(`${c.kind}: changed=${changed} validate.ok=${result.ok}`);
    }
    record(
      "11. 비표 블록 4종(note/emptyBox/heading/plainList) 편집 후 validateAdmissionDoc 통과",
      allPass,
      detail.join("\n"),
    );
  }

  // ── 12) 블록 순서 변경 무결성(DocBlocksEditor) ────────────────────────
  {
    const blocks = [
      { kind: "note", text: "A" },
      { kind: "heading", text: "B" },
      { kind: "emptyBox", message: "C" },
    ];
    const moved = docOps.moveBlock(blocks, 0, 1);
    const pass =
      moved.length === 3 &&
      moved[0].kind === "heading" &&
      moved[1].kind === "note" &&
      moved[2].kind === "emptyBox" &&
      validateBlocks("selection_method", moved).ok;
    record(
      "12a. moveBlock — 순서만 바뀌고 각 블록 내용은 그대로, validate 통과",
      pass,
      JSON.stringify(moved),
    );
  }
  {
    const blocks = [{ kind: "note", text: "A" }];
    const added = docOps.appendBlock(
      blocks,
      docOps.createDefaultBlock("footnote"),
    );
    const removed = docOps.removeBlockAt(added, 0);
    const pass =
      added.length === 2 &&
      added[1].kind === "footnote" &&
      removed.length === 1 &&
      removed[0].kind === "footnote";
    record(
      "12b. appendBlock/removeBlockAt — 추가·삭제 데이터 무결성",
      pass,
      JSON.stringify({ added, removed }),
    );
  }
  {
    // DocBlocksEditor 구조적 스모크 렌더 — group/rawHtml 포함 전 종류 디스패치 확인
    const blocks = [
      {
        kind: "table",
        variant: "selection",
        columns: [{ role: "type", label: "전형" }],
        rows: [["x"]],
      },
      { kind: "note", text: "n" },
      { kind: "emptyBox", message: "e" },
      { kind: "heading", text: "h" },
      { kind: "preText", text: "p" },
      { kind: "plainList", items: [{ type: "text", text: "l" }] },
      { kind: "footnote", items: ["f"] },
      {
        kind: "group",
        title: "g",
        children: [{ kind: "note", text: "child" }],
      },
      { kind: "rawHtml", html: "<div>r</div>", reason: "curated-html" },
    ];
    let threw = false;
    let out = "";
    try {
      out = renderToStaticMarkup(
        React.createElement(DocBlocksEditor, {
          section: "selection_method",
          blocks,
          onChange: () => {},
        }),
      );
    } catch (err) {
      threw = true;
      out = String(err?.stack ? err.stack : err);
    }
    const pass =
      !threw &&
      out.includes("내용 추가") &&
      out.includes("그룹 제목·구성 변경은 지원하지 않습니다");
    record(
      "12c. DocBlocksEditor 스모크 렌더 — 9종 블록 전부 예외 없이 디스패치(group은 children 표 편집기로)",
      pass,
      threw ? out : `len=${out.length}`,
    );
  }

  // ── 12d~12h) group 중첩 표 편집(GroupBlockEditor) ─────────────────────
  // 특수대학(경찰대·사관학교·과기원) 데이터만 kind:'group'을 쓴다. 열어준
  // 축은 children 표 내부(셀·행·열)뿐이고, 제목·구성(생성·제거·순서)은
  // renderSpecialBlocksHtml의 제목 하드코딩 화이트리스트 때문에 잠겨 있다.
  // 아래 5건이 그 계약을 각각 못 박는다.
  const policeFixtureBlocks = [
    {
      kind: "note",
      text: "경찰대학 입학자료를 일정과 1차 시험으로 나누어 정리한 내용입니다.",
    },
    {
      kind: "group",
      title: "전형 일정",
      children: [
        {
          kind: "table",
          variant: "special",
          columns: [
            { role: "type", label: "구분" },
            { role: "content", label: "내용" },
          ],
          rows: [["원서접수", "2026. 6. 19.(금) ~ 6. 29.(월)"]],
        },
      ],
    },
    {
      kind: "group",
      title: "1차 시험",
      children: [
        {
          kind: "table",
          variant: "special",
          columns: [
            { role: "type", label: "과목" },
            { role: "content", label: "출제범위" },
            { role: "content", label: "문항수/시간" },
            { role: "content", label: "배점" },
          ],
          rows: [
            ["국어", "화법과 언어, 독서와 작문, 문학", "45문항/60분", "100점"],
          ],
        },
      ],
    },
  ];
  let groupFixtureOut = "";
  let groupFixtureThrew = false;
  {
    try {
      groupFixtureOut = renderToStaticMarkup(
        React.createElement(DocBlocksEditor, {
          section: "selection_method",
          blocks: policeFixtureBlocks,
          onChange: () => {},
        }),
      );
    } catch (err) {
      groupFixtureThrew = true;
      groupFixtureOut = String(err?.stack ? err.stack : err);
    }
    const pass =
      !groupFixtureThrew &&
      groupFixtureOut.includes("admission-data-table") &&
      groupFixtureOut.includes('value="원서접수"') &&
      groupFixtureOut.includes('value="45문항/60분"');
    record(
      "12d. group 중첩 SSR — 경찰대 축약 픽스처(note+group 2개, special 표)가 예외 없이 렌더되고 중첩 셀 값이 편집 input으로 나온다(순환 참조 회귀 탐지)",
      pass,
      groupFixtureThrew ? groupFixtureOut : `len=${groupFixtureOut.length}`,
    );
  }
  {
    // group title은 텍스트 노드로만 나와야 한다 — <input value="전형 일정">이
    // 생기는 순간 renderSpecialBlocksHtml의 제목 화이트리스트가 깨진다.
    const titlesAsValue = ["전형 일정", "1차 시험"].filter((t) =>
      groupFixtureOut.includes(`value="${t}"`),
    );
    const titlesAsText = ["전형 일정", "1차 시험"].every((t) =>
      groupFixtureOut.includes(`>${t}<`),
    );
    const pass =
      !groupFixtureThrew && titlesAsValue.length === 0 && titlesAsText;
    record(
      "12e. group title은 편집 input이 아니다 — 제목이 value 속성에 없고 텍스트 노드로만 존재(제목 편집 UI 유입 탐지)",
      pass,
      JSON.stringify({ titlesAsValue, titlesAsText }),
    );
  }
  {
    // onChange 체인 — 컴포넌트 함수를 직접 호출해 자식 편집기 element의
    // onChange를 꺼내 부른다(SSR 문자열로는 상호작용을 재현할 수 없다).
    const GroupBlockEditor = await loadModule(
      "src/components/admission/editor/blocks/GroupBlockEditor.jsx",
      "default",
    );
    const block = {
      kind: "group",
      title: "전형 일정",
      children: [
        {
          kind: "table",
          variant: "special",
          columns: [{ role: "type", label: "구분" }],
          rows: [["원서접수"]],
        },
        {
          kind: "table",
          variant: "special",
          columns: [{ role: "type", label: "구분" }],
          rows: [["서류제출"]],
        },
      ],
    };
    const before = JSON.stringify(block);
    let captured = null;
    const element = GroupBlockEditor({
      section: "selection_method",
      block,
      onChange: (next) => {
        captured = next;
      },
    });
    const childEditors = React.Children.toArray(element.props.children).filter(
      (child) => child?.props?.block && child.props.block.kind === "table",
    );
    const nextChild = { ...block.children[0], rows: [["원서접수(수정)"]] };
    if (childEditors[0]) childEditors[0].props.onChange(nextChild);
    const pass =
      childEditors.length === 2 &&
      captured !== null &&
      captured.title === "전형 일정" &&
      captured.children.length === 2 &&
      captured.children[0].rows[0][0] === "원서접수(수정)" &&
      captured.children[1].rows[0][0] === "서류제출" &&
      JSON.stringify(block) === before;
    record(
      "12f. group children onChange 체인 — 자식 표 1개 수정이 group 통째로 닫혀 올라오고 형제·title·children 길이는 불변(저장 경로 회귀)",
      pass,
      JSON.stringify({ childEditors: childEditors.length, captured }),
    );
  }
  {
    // 소스 락 — group 단위 구성 변경 UI가 흘러 들어오는 것을 막는다.
    const src = fs.readFileSync(
      path.join(
        REPO_ROOT,
        "src/components/admission/editor/blocks/GroupBlockEditor.jsx",
      ),
      "utf8",
    );
    // '블록 추가'는 2026-08-08 문구 정리로 '내용 추가'가 됐다(DocBlocksEditor.jsx) —
    // 락 대상 토큰도 같이 갱신해야 의도(구성 변경 UI 유입 탐지)가 유지된다.
    const forbidden = ["내용 추가", "↑", "↓", "삭제"].filter((token) =>
      src.includes(token),
    );
    const pass = forbidden.length === 0 && src.includes("AdmissionBlockEditor");
    record(
      "12g. 소스 락 — GroupBlockEditor.jsx에 group 생성·제거·순서 변경 토큰이 없다(구성 변경 UI 유입 탐지)",
      pass,
      JSON.stringify({ forbidden }),
    );
  }
  {
    // renderDocToHtml 왕복 — 실데이터(경찰대) doc의 group children 셀 1개를
    // 편집기와 같은 경로(docOps.updateBlockAt)로 고쳐 미러를 다시 만든다.
    // 새 값이 미러에 나타나되 <table> 개수·group 제목 개수가 그대로여야
    // 한다 — 하나라도 줄면 제목 화이트리스트가 어긋난 것이다.
    const doc = buildSpecialCategoryDoc(
      "",
      { detail_status: "category" },
      "경찰대학",
    );
    const beforeHtml = renderDocToHtml(doc, "selection_method");
    const groupIdx = doc.blocks.findIndex((b) => b.kind === "group");
    const targetGroup = doc.blocks[groupIdx];
    const targetChild = targetGroup.children[0];
    const nextRows = targetChild.rows.map((row, i) =>
      i === 0
        ? row.map((cell, j) => (j === row.length - 1 ? "검증용 수정값" : cell))
        : row,
    );
    const nextGroup = {
      ...targetGroup,
      children: docOps.updateBlockAt(targetGroup.children, 0, {
        ...targetChild,
        rows: nextRows,
      }),
    };
    const nextDoc = {
      ...doc,
      blocks: docOps.updateBlockAt(doc.blocks, groupIdx, nextGroup),
    };
    const afterHtml = renderDocToHtml(nextDoc, "selection_method");
    const count = (html, re) => (html.match(re) || []).length;
    const pass =
      groupIdx >= 0 &&
      !beforeHtml.includes("검증용 수정값") &&
      afterHtml.includes("검증용 수정값") &&
      count(beforeHtml, /<table/g) === count(afterHtml, /<table/g) &&
      count(beforeHtml, /admission-special-title/g) ===
        count(afterHtml, /admission-special-title/g) &&
      count(afterHtml, /admission-special-title/g) ===
        doc.blocks.filter((b) => b.kind === "group").length;
    record(
      "12h. renderDocToHtml 왕복 — group children 셀 수정이 html 미러에 반영되고 <table>·group 제목 개수는 불변(renderSpecialBlocksHtml 제목 화이트리스트 소실 탐지)",
      pass,
      JSON.stringify({
        groupIdx,
        tables: [count(beforeHtml, /<table/g), count(afterHtml, /<table/g)],
        titles: [
          count(beforeHtml, /admission-special-title/g),
          count(afterHtml, /admission-special-title/g),
        ],
        groups: doc.blocks.filter((b) => b.kind === "group").length,
        applied: afterHtml.includes("검증용 수정값"),
      }),
    );
  }

  // ── 12i) 빈 상태에서도 "블록 추가" 수단이 있다 ────────────────────────
  // 사용자 요구 "모든 다이얼로그에서 '비었을 때 추가' 기능이 있어야 해".
  // 다이얼로그 안쪽은 이미 완비돼 있었고(추가 UI가 blocks.map 바깥에
  // 무조건 렌더된다) 진짜 구멍은 목록 진입 경로였다(b1bf4c2에서 메움,
  // verify-admission-admin-entry.mjs entry:6~8). 여기서는 "이미 됐다"는
  // 그 전제 자체를 영구 게이트로 승격한다 — 누가 나중에 추가 UI에
  // blocks.length 조건을 달면 이 18케이스가 먼저 깨진다.
  //
  // 빈 상태 3종: 블록 0개 / emptyBox 1개뿐 / group 1개뿐(특수대학 모양).
  // 6섹션 × 3 = 18케이스 전부에서 셀렉트가 존재하고, 그 셀렉트의 option
  // 집합이 그 섹션의 primary 종류와 정확히 일치해야 한다(개수만 세면
  // 종류가 뒤바뀐 회귀를 놓친다).
  {
    const EMPTY_STATES = [
      ["blocks:0", []],
      ["emptyBox:1", [{ kind: "emptyBox", message: "" }]],
      [
        "group:1",
        [
          {
            kind: "group",
            title: "전형 일정",
            children: [
              {
                kind: "table",
                variant: "special",
                columns: [
                  { role: "type", label: "구분" },
                  { role: "content", label: "내용" },
                ],
                rows: [["원서접수", "2026. 6. 19.(금)"]],
              },
            ],
          },
        ],
      ],
    ];
    // 기대값은 소스에서 파생하지 않고 여기 리터럴로 못 박는다 —
    // getAddableKindsForSection을 그대로 다시 읽으면 "primary 목록에서
    // emptyBox가 조용히 빠지는" 회귀(빈 상태 박스를 못 만들게 되는,
    // 이 요구사항의 핵심 회귀)를 테스트가 같이 따라가 버린다.
    const EXPECTED_PRIMARY = {
      previous_year_changes: ["table"],
      selection_method: ["table", "plainList"],
      exam_schedule: ["table", "emptyBox", "plainList"],
      minimum_requirements: ["table", "emptyBox", "plainList"],
      school_record_method: ["table", "heading"],
      recruitment_quota: ["table", "footnote", "plainList", "preText"],
    };
    const SECTIONS = Object.keys(EXPECTED_PRIMARY);
    // 추가 셀렉트의 option만 골라낸다 — 표 셀/열 설정의 다른 <select>가
    // 섞이면 개수 단언이 무의미해진다.
    const addSelectOptionValues = (html) => {
      const start = html.indexOf('aria-label="추가할 내용 종류"');
      if (start < 0) return null;
      const end = html.indexOf("</select>", start);
      if (end < 0) return null;
      return [
        ...html.slice(start, end).matchAll(/<option value="([^"]+)"/g),
      ].map((m) => m[1]);
    };

    const failures = [];
    let checked = 0;
    for (const section of SECTIONS) {
      const primary = EXPECTED_PRIMARY[section];
      const actualPrimary = docOps.getAddableKindsForSection(section).primary;
      if (JSON.stringify(actualPrimary) !== JSON.stringify(primary)) {
        failures.push(
          `${section}: primary 매핑이 기대와 다름 actual=${JSON.stringify(actualPrimary)} expected=${JSON.stringify(primary)}`,
        );
      }
      for (const [stateLabel, blocks] of EMPTY_STATES) {
        checked += 1;
        let out = "";
        try {
          out = renderToStaticMarkup(
            React.createElement(DocBlocksEditor, {
              section,
              blocks,
              onChange: () => {},
            }),
          );
        } catch (err) {
          failures.push(
            `${section}/${stateLabel}: threw ${String(err?.message ? err.message : err)}`,
          );
          continue;
        }
        const values = addSelectOptionValues(out);
        if (!out.includes("+ 내용 추가")) {
          failures.push(`${section}/${stateLabel}: '+ 내용 추가' 버튼 없음`);
          continue;
        }
        if (values === null) {
          failures.push(`${section}/${stateLabel}: 추가 셀렉트 없음`);
          continue;
        }
        if (JSON.stringify(values) !== JSON.stringify(primary)) {
          failures.push(
            `${section}/${stateLabel}: options=${JSON.stringify(values)} expected=${JSON.stringify(primary)}`,
          );
        }
      }
    }
    const pass = checked === 18 && failures.length === 0;
    record(
      '12i. 빈 상태 추가 수단 — 6섹션 × 3빈상태(블록0/emptyBox1/group1) 18케이스 전부에서 "+ 내용 추가" 셀렉트가 존재하고 option 집합이 섹션 primary와 일치',
      pass,
      JSON.stringify({ checked, failures }),
    );
  }

  // ── 12j) DocBlocksEditor — group 카드에는 ↑↓/삭제가 없다(2026-08-08 사용자 승인) ──
  //
  // 첫 group 삭제·순서 이동이 renderSpecialBlocksHtml의 제목 화이트리스트를
  // 깨 공개 미러를 통째로 무너뜨린다(실측 4053B→165B, 표 6→0). group 카드
  // 헤더에서 ↑↓/삭제를 아예 없앤다 — 내부(표·셀·행·열) 편집은 유지한다.
  {
    const mixedBlocks = [
      {
        kind: "group",
        title: "전형 일정",
        children: [{ kind: "note", text: "child" }],
      },
      { kind: "note", text: "두 번째 블록" },
    ];
    const out = renderToStaticMarkup(
      React.createElement(DocBlocksEditor, {
        section: "selection_method",
        blocks: mixedBlocks,
        onChange: () => {},
      }),
    );
    const groupHasControls =
      out.includes('aria-label="내용 1 위로"') ||
      out.includes('aria-label="내용 1 아래로"') ||
      out.includes('aria-label="내용 1 삭제"');
    const nonGroupHasControls =
      out.includes('aria-label="내용 2 위로"') &&
      out.includes('aria-label="내용 2 아래로"') &&
      out.includes('aria-label="내용 2 삭제"');
    const pass = !groupHasControls && nonGroupHasControls;
    record(
      "12j. group 카드(1번)는 ↑↓/삭제 컨트롤이 없고, 비-group 카드(2번)는 그대로 있다",
      pass,
      out,
    );
  }

  // ── 12k) 편집기 문구 — 내부 kind 표기가 화면에 남지 않는다(2026-08-08 사용자 지적) ──
  //
  // "'블록 추가'의 의미를 솔직히 파악하기 어려워." — KIND_LABELS(추가 셀렉트)가
  // 헤더 배지와 달리 "표(table, generic 2컬럼으로 시작)" 같은 내부 스키마
  // 표기를 그대로 노출하고 있었다. BLOCK_KIND_LABELS로 단일화하고 5종
  // 블록 편집기 자체 라벨·rawHtml 안내문에서도 괄호 kind 표기를 뺐다.
  {
    const blocks = [
      {
        kind: "table",
        variant: "selection",
        columns: [{ role: "type", label: "전형" }],
        rows: [["x"]],
      },
      { kind: "note", text: "n" },
      { kind: "emptyBox", message: "e" },
      { kind: "heading", text: "h" },
      { kind: "preText", text: "p" },
      { kind: "plainList", items: [{ type: "text", text: "l" }] },
      { kind: "footnote", items: ["f"] },
      { kind: "rawHtml", html: "<div>r</div>", reason: "curated-html" },
    ];
    const out = renderToStaticMarkup(
      React.createElement(DocBlocksEditor, {
        section: "recruitment_quota",
        blocks,
        onChange: () => {},
      }),
    );
    const forbiddenTokens = [
      "(note)",
      "(heading)",
      "(emptyBox)",
      "(plainList)",
      "(preText)",
      "(footnote)",
      "generic 2컬럼",
      "rawHtml 블록은",
      "블록 추가",
      "블록 삭제",
      "추가할 블록 종류",
    ].filter((token) => out.includes(token));
    const requiredTokens = [
      "+ 내용 추가",
      "이 내용 삭제",
      "추가할 내용 종류",
      "내용 없음 안내 문구",
      "고급(이 항목에 잘 안 쓰는 종류도 표시)",
      "원본 HTML(레거시)은 이 편집기에서 수정할 수 없습니다",
    ].filter((token) => !out.includes(token));
    const pass = forbiddenTokens.length === 0 && requiredTokens.length === 0;
    record(
      '12k. 편집기 문구 정리 — 내부 kind 괄호 표기·"블록" 용어가 화면에서 사라지고 순화된 한글 문구로 대체됐다',
      pass,
      JSON.stringify({ forbiddenTokens, requiredTokens }),
    );
  }

  // ── 13) plainList 항목 추가·삭제·순서 변경(2026-08-06 보완) ───────────
  {
    const PlainListBlockEditor = await loadModule(
      "src/components/admission/editor/blocks/PlainListBlockEditor.jsx",
      "default",
    );
    const block = {
      kind: "plainList",
      items: [
        { type: "text", text: "a" },
        { type: "bullet", text: "b" },
      ],
    };

    // docBlockOperations의 제네릭 배열 함수를 items에 직접 재사용해도
    // 동일하게 동작하는지(컴포넌트 내부와 같은 함수 재사용 확인).
    const appended = docOps.appendBlock(block.items, {
      type: "text",
      text: "c",
    });
    const removed = docOps.removeBlockAt(appended, 0);
    const moved = docOps.moveBlock(removed, 0, 1);
    const pass =
      appended.length === 3 &&
      removed.length === 2 &&
      removed[0].text === "b" &&
      moved[0].text === "c" &&
      moved[1].text === "b";
    record(
      "13a. plainList items 추가·삭제·순서변경 — docBlockOperations 제네릭 함수 재사용 확인",
      pass,
      JSON.stringify({ appended, removed, moved }),
    );

    let threw = false;
    let out = "";
    try {
      out = renderToStaticMarkup(
        React.createElement(PlainListBlockEditor, {
          block,
          onChange: () => {},
        }),
      );
    } catch (err) {
      threw = true;
      out = String(err?.stack ? err.stack : err);
    }
    const renderPass =
      !threw && out.includes("항목 추가") && out.includes("삭제");
    record(
      "13b. PlainListBlockEditor 스모크 렌더 — 항목 추가/삭제 버튼 존재",
      renderPass,
      threw ? out : `len=${out.length}`,
    );
  }

  // ── 14) xlsx 내보내기 ─────────────────────────────────────────────────
  const xlsxModule = await loadModule(
    "src/components/admission/editor/xlsx/tableBlockXlsx.js",
  );
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
    MAX_XLSX_CELL_LENGTH,
  } = xlsxModule;

  // 14a) Cell 3형태 직렬화 규칙
  {
    const pass =
      serializeCellForXlsx("일반 문자열") === "일반 문자열" &&
      serializeCellForXlsx({ text: "3등급", badge: "minimumHas" }) ===
        "3등급 [최저있음]" &&
      serializeCellForXlsx({ text: "", badge: "minimumHas" }) ===
        "[최저있음]" &&
      serializeCellForXlsx({ text: "-", badge: "minimumNone" }) ===
        "- [최저없음]" &&
      serializeCellForXlsx({
        chips: [
          { label: "27 인원", value: "18" },
          { label: "26 인원", value: "17" },
        ],
      }) === "27 인원: 18\n26 인원: 17" &&
      serializeCellForXlsx({ chips: [] }) === "" &&
      serializeCellForXlsx("") === "" &&
      serializeCellForXlsx(null) === "";
    record(
      "14a. serializeCellForXlsx — 문자열/{text,badge}/{chips} 직렬화 규칙",
      pass,
      "",
    );
  }

  // 14b) 32,767자 초과 셀 탐지
  {
    const big = "a".repeat(MAX_XLSX_CELL_LENGTH + 1);
    const block = {
      kind: "table",
      variant: "score",
      columns: [
        { role: "type", label: "구분" },
        { role: "data", label: "국어" },
      ],
      rows: [["x", big]],
    };
    const oversized = findOversizedCells(block);
    const pass =
      oversized.length === 1 &&
      oversized[0].area === "body" &&
      oversized[0].row === 0 &&
      oversized[0].col === 1 &&
      oversized[0].length === big.length;
    record(
      "14b. findOversizedCells — 32,767자 초과 셀을 정확한 위치로 찾아냄",
      pass,
      JSON.stringify(oversized),
    );
  }
  {
    // 실측 최대치(DB 최대 셀 39,658자, .golden-cache 실측 근거)도 정확히 걸리는지.
    const dbMaxLikeCell = "x".repeat(39658);
    const block = {
      kind: "table",
      variant: "score",
      columns: [{ role: "data", label: "A" }],
      rows: [[dbMaxLikeCell]],
    };
    const oversized = findOversizedCells(block);
    const pass = oversized.length === 1 && oversized[0].length === 39658;
    record(
      "14c. findOversizedCells — DB 실측 최대 셀 크기(39,658자)도 초과로 탐지",
      pass,
      JSON.stringify(oversized),
    );
  }

  // 14d) recruitExact(2단 헤더) → 병합 셀이 groups/fixedColumnCount와 일치
  {
    const recruitExactForXlsx = {
      kind: "table",
      variant: "recruitExact",
      columns: [
        { role: "series", label: "계열" },
        { role: "unit", label: "모집단위" },
        { role: "data", label: "27 인원" },
        { role: "data", label: "26 인원" },
        { role: "data", label: "27 경쟁률" },
      ],
      fixedColumnCount: 2,
      groups: [
        { name: "일반전형", count: 2 },
        { name: "지역균형", count: 1 },
      ],
      rows: [["인문", "국어교육과", "18", "17", "3.2"]],
    };
    const ws = buildTableBlockWorksheet(recruitExactForXlsx);
    const merges = ws["!merges"] || [];
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
    record(
      "14d. buildTableBlockWorksheet — recruitExact 병합 셀이 groups/fixedColumnCount와 일치(고정 rowspan 2개 + 그룹 colspan 1개)",
      pass,
      JSON.stringify(merges),
    );

    // 헤더 2행 + 바디 1행 = 총 3행, aoa 데이터로 재확인
    const aoa = XLSX.utils.sheet_to_json(ws, { header: 1 });
    const pass2 =
      aoa.length === 3 &&
      aoa[0][0] === "계열" &&
      aoa[0][2] === "일반전형" &&
      aoa[1][2] === "27 인원" &&
      aoa[2][0] === "인문";
    record(
      "14e. buildTableBlockWorksheet — 헤더 2행(고정 라벨/그룹명 + 데이터 라벨) + 바디 행 배치 확인",
      pass2,
      JSON.stringify(aoa),
    );
  }

  // 14f) groups 없는 일반 표 → 1단 헤더, 병합 없음
  {
    const ws = buildTableBlockWorksheet(scoreBlock);
    const pass = !ws["!merges"] || ws["!merges"].length === 0;
    record(
      "14f. buildTableBlockWorksheet — groups 없으면 병합 셀 없음(1단 헤더)",
      pass,
      JSON.stringify(ws["!merges"]),
    );
  }

  // 14g) buildXlsxFileName — 대학명·카테고리·날짜 포함
  {
    const name = buildXlsxFileName({
      universityName: "가톨릭관동대학교",
      sectionLabel: "모집인원 및 입결",
      date: new Date(2026, 7, 6),
    });
    const pass = name === "가톨릭관동대학교_모집인원 및 입결_20260806.xlsx";
    record(
      "14g. buildXlsxFileName — 대학명_카테고리_YYYYMMDD.xlsx 형식",
      pass,
      name,
    );
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
    const result = exportTableBlockToXlsx(selectionBlock, {
      universityName: "가톨릭관동대학교",
      sectionLabel: "전형방법",
    });
    const today = new Date();
    const expectedDate = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;
    const sheetNames = result.workbook?.SheetNames || [];
    const pass =
      result.ok === true &&
      result.fileName === `가톨릭관동대학교_전형방법_${expectedDate}.xlsx` &&
      sheetNames.length === 2 &&
      sheetNames.includes("표") &&
      sheetNames.includes("형식 설명");
    record(
      "14h. exportTableBlockToXlsx — 정상 케이스: ok:true, 파일명 형식, 시트 2개(표/형식 설명)",
      pass,
      JSON.stringify({ fileName: result.fileName, sheetNames }),
    );
  }

  // 14i) exportTableBlockToXlsx — 초과 셀 있으면 workbook을 만들지 않고 ok:false
  {
    const big = "a".repeat(MAX_XLSX_CELL_LENGTH + 1);
    const block = {
      kind: "table",
      variant: "score",
      columns: [{ role: "data", label: "A" }],
      rows: [[big]],
    };
    const result = exportTableBlockToXlsx(block, { universityName: "X대학교" });
    const pass =
      result.ok === false &&
      result.oversized.length === 1 &&
      result.fileName === null &&
      result.workbook === undefined;
    record(
      "14i. exportTableBlockToXlsx — 32,767자 초과 시 workbook 미생성(조용한 truncate 아님), oversized 목록 반환",
      pass,
      JSON.stringify(result),
    );
  }

  // ── 15) xlsx 가져오기 ──────────────────────────────────────────────────
  const recruitExactRoundTripBlock = {
    kind: "table",
    variant: "recruitExact",
    columns: [
      { role: "series", label: "계열" },
      { role: "unit", label: "모집단위" },
      { role: "data", label: "27 인원" },
      { role: "data", label: "26 인원" },
      { role: "data", label: "27 경쟁률" },
    ],
    fixedColumnCount: 2,
    groups: [
      { name: "일반전형", count: 2 },
      { name: "지역균형", count: 1 },
    ],
    rows: [
      ["인문", "국어교육과", "18", "17", "3.2"],
      ["자연", "수학교육과", "", "15", ""],
    ],
  };
  const recruitRoundTripBlock = {
    kind: "table",
    variant: "recruit",
    columns: [
      { role: "group", label: "계열/대학" },
      { role: "unit", label: "모집단위" },
      { role: "series", label: "일반전형" },
    ],
    rows: [
      [
        "인문",
        "국어교육과",
        {
          chips: [
            { label: "27 인원", value: "18" },
            { label: "26 인원", value: "17" },
          ],
        },
      ],
      ["자연", "수학교육과", { chips: [] }],
    ],
  };

  function roundTrip(block, section) {
    const workbook = buildTableBlockWorkbook(block);
    const result = importTableBlockFromXlsx(workbook, block, section);
    return result;
  }

  // 15a) 왕복 무손실 — recruitExact(병합 헤더)/selection(badge)/recruit(chips) 3종 필수
  {
    const result = roundTrip(recruitExactRoundTripBlock, "recruitment_quota");
    const pass = result.ok === true && result.unchanged === true;
    record(
      "15a. 왕복 무손실 — recruitExact(2단 헤더, groups/fixedColumnCount 복원)",
      pass,
      JSON.stringify(
        result.ok
          ? { unchanged: result.unchanged, block: result.block }
          : result,
      ),
    );
  }
  {
    const result = roundTrip(selectionBlock, "selection_method");
    const pass = result.ok === true && result.unchanged === true;
    record(
      "15b. 왕복 무손실 — selection({text,badge} 셀)",
      pass,
      JSON.stringify(result.ok ? { unchanged: result.unchanged } : result),
    );
  }
  // ⚠ 정정(2026-08-06): chips({recruit} variant)는 dev DB에 **7건 존재한다**
  // (명지대학교(용인/서울)·단국대학교(죽전)·인천대학교·한국외국어대학교
  // (용인/서울)·서경대학교 — team-lead 재확인). 애초 "0건"은 phase0 QA
  // 스크립트의 정규식 버그(닫는 따옴표 직전 매치를 걸러냄)였다 — 이 주석도
  // 그 오탐을 그대로 옮겨 적었던 것이라 함께 고친다.
  // 위 15a(recruitExact)/15b(selection badge)는 브라우저가 실제로 내보낸
  // xlsx 바이트로 별도 재확인했지만(team-lead 요청, import1→export2→import2
  // 왕복 blocksEqual true), chips는 실데이터가 있어도 **그 xlsx 왕복 자체는
  // 아직 실파일로 검증하지 못했다** — 아래는 합성 데이터 테스트다(실데이터
  // 표본으로 재검증하려면 위 7개교 중 하나에서 recruit 표를 실제로
  // 내보내 봐야 한다).
  {
    const result = roundTrip(recruitRoundTripBlock, "recruitment_quota");
    const pass = result.ok === true && result.unchanged === true;
    record(
      "15c. 왕복 무손실 — recruit({chips} 셀, 빈 chips 포함, ※ 합성 데이터 — 실데이터 7건 존재하나 xlsx 왕복 실파일 미검증)",
      pass,
      JSON.stringify(result.ok ? { unchanged: result.unchanged } : result),
    );
  }

  // 15d) 컬럼 수 고정 variant 조작 → 거부
  {
    const workbook = buildTableBlockWorkbook(selectionBlock);
    // 헤더에 컬럼 하나를 몰래 추가(관리자가 엑셀에서 열을 늘린 상황 재현)
    const ws = workbook.Sheets.표;
    const range = XLSX.utils.decode_range(ws["!ref"]);
    XLSX.utils.sheet_add_aoa(ws, [["새컬럼"]], {
      origin: { r: 0, c: range.e.c + 1 },
    });
    ws["!ref"] = XLSX.utils.encode_range({
      s: range.s,
      e: { r: range.e.r, c: range.e.c + 1 },
    });
    const result = importTableBlockFromXlsx(
      workbook,
      selectionBlock,
      "selection_method",
    );
    const pass =
      result.ok === false && result.errors.some((e) => e.includes("컬럼 수가"));
    record(
      "15d. 컬럼 수 고정 variant(selection)에서 열이 늘면 validateTableBlock이 거부",
      pass,
      JSON.stringify(result),
    );
  }

  // 15e) groups 합계 불일치 → 거부(그룹 헤더 라벨 셀 하나를 지워 병합이 깨진 것처럼 재현)
  {
    const workbook = buildTableBlockWorkbook(recruitExactRoundTripBlock);
    const ws = workbook.Sheets.표;
    // '지역균형' 그룹(단일 컬럼, 병합 없음) 하나를 통째로 열에서 지운다 —
    // 헤더 폭은 그대로 두고 값만 지워 컬럼 수 불일치가 아니라 "그 컬럼의
    // 데이터가 통째로 비어버리는" 실수 대신, 여기서는 명확히 groups 합
    // 불일치를 재현하기 위해 !merges를 직접 조작한다: 일반전형 병합을 지운다.
    ws["!merges"] = (ws["!merges"] || []).filter(
      (m) => !(m.s.r === 0 && m.e.r === 0),
    ); // 가로 병합(그룹) 전부 제거
    const result = importTableBlockFromXlsx(
      workbook,
      recruitExactRoundTripBlock,
      "recruitment_quota",
    );
    // 병합이 사라지면 reconstructGroupsFromMerges가 모든 데이터 컬럼을 count=1
    // 그룹으로 재구성한다 — groups 개수는 늘지만 합계 자체(count 총합)는
    // 컬럼 수와 여전히 같아 validateTableBlock은 통과한다. 즉 이 조작으로는
    // groups 합 불일치가 재현되지 않는다는 걸 오히려 확인한다(설계상 안전:
    // 병합이 없어도 "몇 개 컬럼인지"는 항상 보존되기 때문).
    const pass = result.ok === true; // 의도적으로 "여전히 유효함"을 확인
    record(
      "15e-guard. 그룹 가로 병합이 전부 사라져도(count=1 그룹들로 재구성) 여전히 유효한 doc — 설계 확인용",
      pass,
      JSON.stringify({ ok: result.ok, groups: result.block?.groups }),
    );
  }
  {
    // 진짜 groups 합 불일치는 세로 병합(고정 컬럼) 하나를 몰래 지워서
    // fixedColumnCount가 실제 컬럼 수와 안 맞게 만들면 재현된다 — 세로
    // 병합이 사라지면 그 컬럼이 "그룹"으로 편입돼 데이터 컬럼 role 배정이
    // 어긋나고, 그 결과 남은 데이터 컬럼 수가 하나 부족해져 열 배열
    // 길이(columns.length)와 rows 길이가 어긋난다.
    const workbook = buildTableBlockWorkbook(recruitExactRoundTripBlock);
    const ws = workbook.Sheets.표;
    ws["!merges"] = (ws["!merges"] || []).filter(
      (m) => !(m.s.r === 0 && m.e.r === 1 && m.s.c === 1),
    ); // 2번째 고정 컬럼(모집단위) 세로 병합 제거
    const result = importTableBlockFromXlsx(
      workbook,
      recruitExactRoundTripBlock,
      "recruitment_quota",
    );
    // fixedColumnCount가 1로 줄어들며 "모집단위" 컬럼이 count=1 그룹으로
    // 재해석된다 — columns 배열 자체의 총 길이는 안 바뀌므로 이 케이스도
    // validateTableBlock 자체는 통과할 수 있다(구조 재해석일 뿐 셀 개수는
    // 보존됨). 이 테스트는 "병합 구조가 바뀌면 fixedColumnCount/groups가
    // 실제로 재계산됨"을 확인하는 데 집중한다.
    const pass =
      result.ok === true &&
      result.block.fixedColumnCount === 1 &&
      result.block.groups.length === 3;
    record(
      "15e. 고정 컬럼 세로 병합 제거 → fixedColumnCount/groups가 병합 구조 그대로 재계산됨(1개 + 그룹 3개로 재해석)",
      pass,
      JSON.stringify({
        ok: result.ok,
        fixedColumnCount: result.block?.fixedColumnCount,
        groups: result.block?.groups,
      }),
    );
  }

  // 15f) 행 길이 초과 → 거부 (짧은 행은 채움)
  {
    const workbook = buildTableBlockWorkbook(scoreBlock);
    const ws = workbook.Sheets.표;
    // 바디 2행 중 1행에 컬럼 수보다 많은 값을 몰래 추가.
    XLSX.utils.sheet_add_aoa(ws, [["x", "y", "z", "초과"]], { origin: "A2" });
    const range = XLSX.utils.decode_range(ws["!ref"]);
    ws["!ref"] = XLSX.utils.encode_range({
      s: range.s,
      e: { r: range.e.r, c: Math.max(range.e.c, 3) },
    });
    const result = importTableBlockFromXlsx(
      workbook,
      scoreBlock,
      "recruitment_quota",
    );
    const pass =
      result.ok === false && result.errors.some((e) => e.includes("길이"));
    record(
      "15f. 행 길이가 컬럼 수보다 길면 validateTableBlock이 거부",
      pass,
      JSON.stringify(result),
    );
  }
  {
    // 짧은 행(마지막 셀 누락)은 빈 문자열로 채워 통과해야 한다.
    const workbook = buildTableBlockWorkbook(scoreBlock);
    const ws = workbook.Sheets.표;
    delete ws.C2; // 바디 2행 중 1행의 마지막 셀 삭제(엑셀에서 지우고 저장한 상황 재현)
    const result = importTableBlockFromXlsx(
      workbook,
      scoreBlock,
      "recruitment_quota",
    );
    const pass =
      result.ok === true &&
      result.block.rows[0].length === scoreBlock.columns.length &&
      result.block.rows[0][2] === "";
    record(
      "15g. 마지막 셀이 빈 짧은 행 → 빈 문자열로 채워 통과(거부 아님)",
      pass,
      JSON.stringify(result.ok ? result.block.rows : result),
    );
  }

  // 15h) 빈 행(트레일링) 무시
  {
    const workbook = buildTableBlockWorkbook(scoreBlock);
    const ws = workbook.Sheets.표;
    // 완전히 빈 트레일링 행을 하나 더 추가.
    XLSX.utils.sheet_add_aoa(ws, [["", "", ""]], { origin: -1 });
    const result = importTableBlockFromXlsx(
      workbook,
      scoreBlock,
      "recruitment_quota",
    );
    const pass =
      result.ok === true && result.block.rows.length === scoreBlock.rows.length; // 빈 트레일링 행은 카운트 안 됨
    record(
      "15h. 완전히 빈 트레일링 행은 무시됨(행 수 안 늘어남)",
      pass,
      JSON.stringify(result.ok ? result.block.rows.length : result),
    );
  }

  // 15i) 수식/서식 셀 — 값만 취함(SheetJS가 캐시된 계산값을 반환하는지 직접 확인)
  {
    const workbook = buildTableBlockWorkbook(scoreBlock);
    const ws = workbook.Sheets.표;
    ws.B2 = { t: "n", v: 99, f: "SUM(1,98)" }; // 수식 셀 흉내(캐시값 99)
    const result = importTableBlockFromXlsx(
      workbook,
      scoreBlock,
      "recruitment_quota",
    );
    const pass = result.ok === true && result.block.rows[0][1] === "99"; // 수식 문자열이 아니라 계산값 문자열
    record(
      "15i. 수식 셀은 캐시된 계산값을 취함(수식 문자열 아님)",
      pass,
      JSON.stringify(result.ok ? result.block.rows[0] : result),
    );
  }

  // 15j) chips 형식이 안 맞는 셀 — 데이터 보존(단일 칩으로 폴백, 조용히 버리지 않음)
  {
    const pass1 =
      JSON.stringify(
        deserializeCellFromXlsx("형식이 이상한 텍스트", "chips"),
      ) ===
      JSON.stringify({ chips: [{ label: "형식이 이상한 텍스트", value: "" }] });
    const pass2 =
      JSON.stringify(deserializeCellFromXlsx("", "chips")) ===
      JSON.stringify({ chips: [] });
    const pass3 =
      JSON.stringify(
        deserializeCellFromXlsx("27 인원: 18\n26 인원: 17", "chips"),
      ) ===
      JSON.stringify({
        chips: [
          { label: "27 인원", value: "18" },
          { label: "26 인원", value: "17" },
        ],
      });
    record(
      "15j. deserializeCellFromXlsx(chips) — 정상/빈/형식불일치(데이터 보존) 3가지",
      pass1 && pass2 && pass3,
      JSON.stringify({ pass1, pass2, pass3 }),
    );
  }

  // 15k) badge 접미어 없는 텍스트 — 기본 minimumNone으로 폴백(데이터 유지)
  {
    const pass1 =
      JSON.stringify(deserializeCellFromXlsx("3등급 [최저있음]", "badge")) ===
      JSON.stringify({ text: "3등급", badge: "minimumHas" });
    const pass2 =
      JSON.stringify(deserializeCellFromXlsx("[최저없음]", "badge")) ===
      JSON.stringify({ text: "", badge: "minimumNone" });
    const pass3 =
      JSON.stringify(deserializeCellFromXlsx("접미어없음", "badge")) ===
      JSON.stringify({ text: "접미어없음", badge: "minimumNone" });
    record(
      "15k. deserializeCellFromXlsx(badge) — 있음/없음/접미어 없음(폴백) 3가지",
      pass1 && pass2 && pass3,
      JSON.stringify({ pass1, pass2, pass3 }),
    );
  }

  // 15l) "표" 시트가 없는 파일 → 거부
  {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([["엉뚱한 파일"]]),
      "엉뚱한시트",
    );
    const result = importTableBlockFromXlsx(
      workbook,
      scoreBlock,
      "recruitment_quota",
    );
    const pass =
      result.ok === false && result.errors.some((e) => e.includes("표"));
    record('15l. "표" 시트가 없는 파일은 거부', pass, JSON.stringify(result));
  }

  // 15m) summarizeBlockChange — 행 추가/삭제/셀 변경 수 계산
  {
    const before = { columns: scoreBlock.columns, rows: [["a", "b", "c"]] };
    const after = {
      columns: scoreBlock.columns,
      rows: [
        ["a", "X", "c"],
        ["d", "e", "f"],
      ],
    };
    const summary = summarizeBlockChange(before, after);
    const pass =
      summary.rowsAdded === 1 &&
      summary.rowsRemoved === 0 &&
      summary.cellsChanged === 1 &&
      summary.columnsChanged === false;
    record(
      "15m. summarizeBlockChange — 행 추가 1 / 셀 변경 1 정확히 계산",
      pass,
      JSON.stringify(summary),
    );
  }

  // ── 16) 섹션별 블록 추가 선택지 제한(2026-08-06, renderDocToHtml 크래시 방지) ──
  {
    const { primary, advanced } = docOps.getAddableKindsForSection(
      "previous_year_changes",
    );
    const pass =
      JSON.stringify(primary) === JSON.stringify(["table"]) &&
      !advanced.includes("table") &&
      advanced.includes("note");
    record(
      "16a. previous_year_changes — primary=[table]만(buildChangeDocBlocks 실측)",
      pass,
      JSON.stringify({ primary, advanced }),
    );
  }
  {
    const { primary } = docOps.getAddableKindsForSection("recruitment_quota");
    const pass =
      JSON.stringify(primary) ===
      JSON.stringify(["table", "footnote", "plainList", "preText"]);
    record(
      "16b. recruitment_quota — primary=[table,footnote,plainList,preText](buildRecruitDocBlocks+buildRawSectionDoc 실측)",
      pass,
      JSON.stringify(primary),
    );
  }
  {
    const { primary } = docOps.getAddableKindsForSection(
      "school_record_method",
    );
    const pass =
      JSON.stringify(primary) === JSON.stringify(["table", "heading"]);
    record(
      "16c. school_record_method — primary=[table,heading](buildRecordDocBlocks 실측, plainList 폴백 없음 반영)",
      pass,
      JSON.stringify(primary),
    );
  }
  {
    // 'note'/'group'은 어느 섹션에서도 primary에 없어야 한다(build*DocBlocks 6종 중 top-level note 생성 0건).
    const sections = [
      "previous_year_changes",
      "selection_method",
      "exam_schedule",
      "minimum_requirements",
      "school_record_method",
      "recruitment_quota",
    ];
    const pass = sections.every((s) => {
      const { primary } = docOps.getAddableKindsForSection(s);
      return !primary.includes("note") && !primary.includes("group");
    });
    record(
      "16d. note/group은 6개 섹션 전부 primary에서 제외(top-level 생성기 없음 실측)",
      pass,
      "",
    );
  }
  {
    // primary + advanced = 전체 종류(중복 없이), 어느 섹션이든.
    const { primary, advanced } =
      docOps.getAddableKindsForSection("exam_schedule");
    const union = new Set([...primary, ...advanced]);
    const pass =
      union.size === docOps.ALL_BLOCK_KINDS.length &&
      primary.every((k) => !advanced.includes(k));
    record(
      "16e. primary/advanced가 전체 종류를 중복 없이 분할",
      pass,
      JSON.stringify({ primary, advanced }),
    );
  }
  {
    // DocBlocksEditor 스모크 렌더 — 제한된 섹션(previous_year_changes)에서
    // 드롭다운 기본 노출이 'table' 하나뿐이고, '고급' 체크박스가 존재하는지.
    const out = renderToStaticMarkup(
      React.createElement(DocBlocksEditor, {
        section: "previous_year_changes",
        blocks: [],
        onChange: () => {},
      }),
    );
    const optionCount = (out.match(/<option/g) || []).length;
    const pass = optionCount === 1 && out.includes("고급");
    record(
      "16f. DocBlocksEditor 스모크 렌더 — 제한 섹션은 드롭다운 옵션 1개(table)만, 고급 토글 존재",
      pass,
      `optionCount=${optionCount}`,
    );
  }
  {
    // 미지정/알 수 없는 section은 primary가 빈 배열 → advanced가 전체.
    const { primary, advanced } =
      docOps.getAddableKindsForSection("unknown_section");
    const pass =
      primary.length === 0 && advanced.length === docOps.ALL_BLOCK_KINDS.length;
    record(
      "16g. 알 수 없는 section — primary 빈 배열, advanced가 전체 종류",
      pass,
      JSON.stringify({ primary, advanced }),
    );
  }

  // ── 17) 표 골격 단일성 계약(설계 §7-3 T1/T2/T3) ───────────────────────
  // 편집기가 자체 <table>을 폐기하고 table/AdmissionTable.jsx에 위임한 뒤로
  // 성립하는 계약이다. **뷰 DOM == 편집 DOM을 단언하지 않는다** — 파리티
  // 플래그로 의도적으로 다르게 두고 있어(EDIT_PARITY_FROZEN) 그 단언은
  // 애초에 성립할 수 없다. 대신 (T1) 골격 문자열, (T2) 컬럼 수, (T3) 셀
  // kind 판정 정본 세 가지만 못 박는다.
  {
    const AdmissionTable = await loadModule(
      "src/components/admission/table/AdmissionTable.jsx",
      "default",
    );
    const tableModel = await loadModule(
      "src/components/admission/table/tableModel.js",
    );

    const viewOut = renderToStaticMarkup(
      React.createElement(AdmissionTable, {
        block: selectionBlock,
        mode: "view",
      }),
    );
    const editOut = renderToStaticMarkup(
      React.createElement(TableBlockEditor, {
        section: "selection_method",
        block: selectionBlock,
        onChange: () => {},
      }),
    );

    // T1) 골격 단일성 — 스크롤 래퍼 <div>와 <table>의 class가 같은 소스에서
    //   나오는지. 편집 쪽에만 붙는 토큰은 parity.scrollWrapExtra 두 개뿐이며,
    //   그 밖의 토큰이 하나라도 갈라지면 골격이 두 벌로 되돌아갔다는 뜻이다.
    {
      const skeletonOf = (html) => {
        const m = html.match(/<div class="([^"]*)"><table class="([^"]*)">/);
        return m
          ? { wrap: m[1].split(" ").filter(Boolean), table: m[2] }
          : null;
      };
      const viewSkeleton = skeletonOf(viewOut);
      const editSkeleton = skeletonOf(editOut);
      const EDIT_ONLY_WRAP_TOKENS = ["max-w-full", "overflow-x-auto"]; // EDIT_PARITY_FROZEN.scrollWrapExtra
      const editWrapBase = editSkeleton
        ? editSkeleton.wrap.filter((t) => !EDIT_ONLY_WRAP_TOKENS.includes(t))
        : null;
      const pass =
        Boolean(viewSkeleton && editSkeleton) &&
        JSON.stringify(editWrapBase) === JSON.stringify(viewSkeleton.wrap) &&
        editSkeleton.table === viewSkeleton.table &&
        EDIT_ONLY_WRAP_TOKENS.every((t) => editSkeleton.wrap.includes(t));
      record(
        "17a. T1 골격 단일성 — 뷰/편집의 <div>·<table> class가 동일(편집은 scrollWrapExtra 2토큰만 추가)",
        pass,
        JSON.stringify({ viewSkeleton, editSkeleton }),
      );
    }

    // T2) 컬럼 수 계약 — describeTable의 columnCount가 정본이고, 편집 DOM의
    //   행당 <td> 수가 정확히 그 값이다.
    //
    //   ⚠ 2026-08-07(Step 7d) 갱신: 이전 기대값은 `columnCount + 1`이었다
    //   — rowTrailing 슬롯이 행마다 여분 <td>를 하나씩 붙였기 때문이다.
    //   7d에서 그 슬롯(과 headTrailing)을 제거하고 행/열 조작을 표 밖으로
    //   옮겼으므로 여분 컬럼이 사라졌고, 이제 이 단언이 원래 예고된 대로
    //   **"편집 컬럼 수가 실제로 뷰와 일치했다"의 증거**가 된다.
    //   기대값을 낮추면서 단언은 오히려 셋으로 늘렸다(약화 금지):
    //     ① 편집 행당 <td> === columnCount
    //     ② 편집 <th> 수 === columnCount (headTrailing 여분 <th> 부활 탐지.
    //        `<thead`가 걸리지 않도록 `<th` 뒤 구분자를 요구한다)
    //     ③ 편집 행당 <td> === 뷰 행당 <td> (두 경로 직접 대조)
    {
      const desc = tableModel.describeTable(selectionBlock);
      const tdTotal = (editOut.match(/<td/g) || []).length;
      const tdPerRow = tdTotal / selectionBlock.rows.length;
      const viewTdPerRow =
        (viewOut.match(/<td/g) || []).length / selectionBlock.rows.length;
      const thCount = (editOut.match(/<th[\s>]/g) || []).length;
      const pass =
        desc !== null &&
        desc.columnCount === selectionBlock.columns.length &&
        Number.isInteger(tdPerRow) &&
        tdPerRow === desc.columnCount &&
        thCount === desc.columnCount &&
        tdPerRow === viewTdPerRow;
      record(
        "17b. T2 컬럼 수 계약 — describeTable.columnCount === columns.length, 편집 행당 <td>·<th> === columnCount === 뷰 행당 <td>(7d 이후 여분 컬럼 0)",
        pass,
        JSON.stringify({
          columnCount: desc?.columnCount,
          columnsLength: selectionBlock.columns.length,
          tdTotal,
          tdPerRow,
          viewTdPerRow,
          thCount,
        }),
      );
    }

    // T3) kind 단일 정본 — describeCell(...).edit.kind가
    //   resolveCellKind(getCellKind(variant, role), cell)와 항상 같은가.
    //   admissionLayout.getCellKind의 "표시 컴포넌트 조건이 바뀌면 이 함수도
    //   같이 바꿔야 한다"(수동 동기화 의무 G7)를 코드가 아니라 테스트로
    //   봉인한다 — 편집기가 두 함수를 따로 부르던 시절의 드리프트 통로를 닫는다.
    {
      const VARIANTS = [
        "selection",
        "change",
        "recruit",
        "recruitExact",
        "generic",
        "exam",
        "minimum",
        "recordInfo",
        "score",
        "special",
      ];
      const CELL_SHAPES = [
        "문자열 셀",
        { text: "3등급", badge: "minimumHas" },
        { chips: [{ label: "27 인원", value: "18" }] },
      ];
      const EXTRA_ROLES = ["minimum", "group", "unit", "data", undefined];
      let checked = 0;
      const mismatches = [];
      for (const variant of VARIANTS) {
        const roles = [
          ...new Set([...getKnownRolesForVariant(variant), ...EXTRA_ROLES]),
        ];
        for (const role of roles) {
          for (const cell of CELL_SHAPES) {
            const probeBlock = {
              kind: "table",
              variant,
              columns: [{ role, label: "L" }],
              rows: [[cell]],
            };
            const actual = tableModel.describeCell(probeBlock, 0, 0).edit.kind;
            const expected = resolveCellKind(getCellKind(variant, role), cell);
            checked += 1;
            if (actual !== expected)
              mismatches.push({ variant, role, cell, actual, expected });
          }
        }
      }
      const pass =
        mismatches.length === 0 &&
        checked >= VARIANTS.length * CELL_SHAPES.length;
      record(
        `17c. T3 kind 단일 정본 — describeCell().edit.kind === resolveCellKind(getCellKind(variant, role), cell) 전수 대조(${checked}조합)`,
        pass,
        JSON.stringify(mismatches),
      );
    }
  }

  console.log("=== 섹션 문서 표 편집 코어 검증 결과 ===\n");
  let fail = 0;
  for (const r of results) {
    console.log(`[${r.pass ? "PASS" : "FAIL"}] ${r.name}`);
    if (!r.pass) {
      fail += 1;
      console.log("  detail:", r.detail);
    }
  }
  console.log(
    `\n총 ${results.length}건 중 ${results.length - fail}건 통과, ${fail}건 실패.`,
  );
  if (fail > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
