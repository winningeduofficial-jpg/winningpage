// 섹션 문서 표 편집 코어(TableBlockEditor) 검증 — scripts/verify-admission-table-editor.mjs 이식.
//
// src/components/admission/editor/ 아래 순수 로직 모듈(tableEditorValidation.ts,
// tableBlockOperations.ts 등)은 React/DOM 의존이 없어 직접 import해 단언한다.
// 컴포넌트 자체(TableBlockEditor.tsx 등)는 renderToStaticMarkup으로 구조적
// 스모크 렌더만 확인한다 — SSR 문자열 렌더라 클릭/타이핑 같은 실제 상호작용은
// 재현할 수 없다(아래 "IME 조합 검증" 절 참고).
//
// 이식 메모(node:test → Vitest, task 10.6)
// -----------------------------------------
// - esbuild.build() 번들링을 걷어냈다 — 대상 모듈이 전부 .ts/.tsx로 전환됐고
//   (task 3b-4) Vite/Vitest가 TSX 변환·모듈 해석을 그대로 해 준다(task 10.1
//   PR #107 도입, AdmissionSectionView.test.tsx와 동일 이유).
// - export 추가: tableBlockXlsx.ts의 serializeCellForXlsx/deserializeCellFromXlsx/
//   findOversizedCells/buildTableBlockWorksheet/buildTableBlockWorkbook/
//   buildXlsxFileName/MAX_XLSX_CELL_LENGTH와 docBlockOperations.ts의
//   ALL_BLOCK_KINDS는 TS 전환 과정에서 모듈 비공개(unexported)로 바뀌어 있었다
//   (옛 esbuild 번들은 파일 전체를 번들해 이름공간으로 접근했기 때문에 드러나지
//   않았던 드리프트). 원본 스크립트와 같은 세밀도로 직접 단언하기 위해 다시
//   export했다 — 동작 변경 없음.
// - hand-rolled record(name, pass, detail) 하네스 → Vitest test/expect.
//   `expect(pass, detail).toBe(true)` 형태로 실패 시 상세 정보를 그대로 보존한다
//   (AdmissionSectionView.test.tsx와 동일 관례).
// - GroupBlockEditor는 원본처럼 React.createElement가 아니라 함수를 직접 호출해
//   반환된 엘리먼트 트리에서 자식 onChange를 꺼내 부른다(SSR 문자열로는 상호작용을
//   재현할 수 없다 — 12f).
//
// 실행: npx vitest run src/components/admission/editor/TableBlockEditor.test.tsx

import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import * as XLSX from "xlsx";
import {
  defaultNewColumnRole,
  getCellKind,
  getKnownRolesForVariant as getKnownRolesForVariantRaw,
} from "@/components/admission/admissionLayout";
import AdmissionTable from "@/components/admission/table/AdmissionTable";
import * as tableModel from "@/components/admission/table/tableModel";
import type { Block, Cell, TableBlock } from "@/lib/admissionDoc";
import {
  buildSpecialCategoryDoc,
  renderDocToHtml,
} from "@/lib/admissionParsing";
import GroupBlockEditor from "./blocks/GroupBlockEditor";
import PlainListBlockEditor from "./blocks/PlainListBlockEditor";
import ColumnRoleEditor from "./ColumnRoleEditor";
import DocBlocksEditor from "./DocBlocksEditor";
import * as docOps from "./docBlockOperations";
import { ALL_BLOCK_KINDS } from "./docBlockOperations";
import TableBlockEditor from "./TableBlockEditor";
import TableGroupHeaderEditor from "./TableGroupHeaderEditor";
import * as ops from "./tableBlockOperations";
import {
  emptyCellForKind,
  getColumnMutationBlockReason,
  resolveCellKind,
  validateBlocks,
  validateTableBlock,
} from "./tableEditorValidation";
import {
  buildTableBlockWorkbook,
  buildTableBlockWorksheet,
  buildXlsxFileName,
  deserializeCellFromXlsx,
  exportTableBlockToXlsx,
  findOversizedCells,
  importTableBlockFromXlsx,
  MAX_XLSX_CELL_LENGTH,
  serializeCellForXlsx,
  summarizeBlockChange,
} from "./xlsx/tableBlockXlsx";

// EDIT_ONLY_WRAP_TOKENS: scripts/verify-admission-editor-surface.mjs(surf:6,
// 이식 후 AdmissionEditorSurface.test.tsx)가 이 상수 선언을 소스에서
// 정규식으로 찾아 "파리티 축이 몰래 늘어나지 않았는지"를 대조한다. 이름·
// 형태(정확히 2개 문자열 배열)를 바꾸면 그 게이트도 함께 갱신해야 한다.
const EDIT_ONLY_WRAP_TOKENS = ["max-w-full", "overflow-x-auto"]; // EDIT_PARITY_FROZEN.scrollWrapExtra

const asBlock = (value: unknown) => value as TableBlock;
const asCell = (value: unknown) => value as Cell;

// ── 샘플 블록 ──────────────────────────────────────────────────────────
const selectionBlock: TableBlock = {
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

const recruitBlock: TableBlock = {
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

const scoreBlock: TableBlock = {
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

// ── 1) 셀 3형태 편집 후 validateAdmissionDoc 통과 ────────────────────────
describe("1) 셀 3형태 편집 후 validateAdmissionDoc 통과", () => {
  test("1a. 문자열 셀 편집 후 validateAdmissionDoc 통과", () => {
    const next = ops.updateCell(selectionBlock, 0, 1, "전형명(수정)");
    const result = validateTableBlock("selection_method", next);
    expect(
      result.ok && next.rows[0]?.[1] === "전형명(수정)",
      JSON.stringify(result),
    ).toBe(true);
  });

  test("1b. {text,badge} 셀 편집 후 validateAdmissionDoc 통과", () => {
    const nextCell = { text: "2등급", badge: "minimumHas" } as const;
    const next = ops.updateCell(selectionBlock, 0, 3, nextCell);
    const result = validateTableBlock("selection_method", next);
    const cell = next.rows[0]?.[3] as { text: string; badge: string };
    expect(
      result.ok && cell.text === "2등급" && cell.badge === "minimumHas",
      JSON.stringify(result),
    ).toBe(true);
  });

  test("1c. {chips} 셀 편집 후 validateAdmissionDoc 통과", () => {
    const nextCell = {
      chips: [
        { label: "27 인원", value: "20" },
        { label: "26 인원", value: "18" },
      ],
    };
    const next = ops.updateCell(recruitBlock, 0, 2, nextCell);
    const result = validateTableBlock("recruitment_quota", next);
    const cell = next.rows[0]?.[2] as { chips: unknown[] };
    expect(result.ok && cell.chips.length === 2, JSON.stringify(result)).toBe(
      true,
    );
  });
});

// ── 2) 열 추가·삭제 시 전 행 길이가 함께 맞춰지는지 ──────────────────────
describe("2) 열 추가·삭제 — 컬럼 수 비고정 variant", () => {
  test("2a. 열 추가 시 columns.length와 모든 rows[].length가 함께 늘어남", () => {
    const added = ops.addColumn(scoreBlock);
    const rowLenOk = added.rows.every(
      (row) => row.length === added.columns.length,
    );
    const result = validateTableBlock("recruitment_quota", added);
    expect(
      added.columns.length === scoreBlock.columns.length + 1 &&
        rowLenOk &&
        result.ok,
      JSON.stringify({
        columns: added.columns.length,
        rowLens: added.rows.map((r) => r.length),
        result,
      }),
    ).toBe(true);
  });

  test("2b. 열 삭제 시 columns.length와 모든 rows[].length가 함께 줄어듦", () => {
    const removed = ops.removeColumn(scoreBlock, 1);
    const rowLenOk = removed.rows.every(
      (row) => row.length === removed.columns.length,
    );
    const result = validateTableBlock("recruitment_quota", removed);
    expect(
      removed.columns.length === scoreBlock.columns.length - 1 &&
        rowLenOk &&
        result.ok,
      JSON.stringify({
        columns: removed.columns.length,
        rowLens: removed.rows.map((r) => r.length),
        result,
      }),
    ).toBe(true);
  });

  test("2c. 컬럼이 1개뿐이면 삭제 시도해도 그대로 유지(가드)", () => {
    const singleColumnBlock: TableBlock = {
      ...scoreBlock,
      columns: [scoreBlock.columns[0]!],
      rows: scoreBlock.rows.map((r) => [r[0]!]),
    };
    const removed = ops.removeColumn(singleColumnBlock, 0);
    expect(removed.columns.length, JSON.stringify(removed.columns)).toBe(1);
  });
});

// ── 3) 컬럼 수 고정 variant에서 열 조작이 차단되는지 ─────────────────────
describe("3) 컬럼 수 고정 variant 열 조작 차단", () => {
  test("3a. 컬럼 수 고정 5종(selection/change/exam/minimum/recordInfo) 전부 열 조작 차단", () => {
    const fixedVariantBlocks: Record<string, TableBlock> = {
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
    const detail: string[] = [];
    for (const [variant, block] of Object.entries(fixedVariantBlocks)) {
      const reason = getColumnMutationBlockReason(
        variant === "selection" ? "selection_method" : "recruitment_quota",
        block,
      );
      const blocked = typeof reason === "string" && reason.length > 0;
      allBlocked = allBlocked && blocked;
      detail.push(`${variant}: blocked=${blocked} reason=${reason}`);
    }
    expect(allBlocked, detail.join("\n")).toBe(true);
  });

  test("3b. score(컬럼 수 비고정)는 열 조작 허용(reason=null)", () => {
    const reason = getColumnMutationBlockReason(
      "recruitment_quota",
      scoreBlock,
    );
    expect(reason, String(reason)).toBe(null);
  });

  test("3c. recruitExact(groups 연동)는 그룹 헤더 사유로 열 조작 차단", () => {
    const recruitExactBlock: TableBlock = {
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
    expect(
      typeof reason === "string" && reason.includes("그룹 헤더"),
      String(reason),
    ).toBe(true);
  });
});

// ── 4) 행 순서 변경 후 데이터 무결성 ──────────────────────────────────────
describe("4) 행 순서·추가·삭제", () => {
  test("4a. moveRow(0,+1) — 순서만 바뀌고 각 행 내용·컬럼은 그대로", () => {
    const threeRowBlock: TableBlock = {
      ...scoreBlock,
      rows: [
        ["국어", "a1", "a2"],
        ["수학", "b1", "b2"],
        ["영어", "c1", "c2"],
      ],
    };
    const moved = ops.moveRow(threeRowBlock, 0, 1);
    expect(
      moved.rows.length === 3 &&
        moved.rows[0]?.[0] === "수학" &&
        moved.rows[1]?.[0] === "국어" &&
        moved.rows[2]?.[0] === "영어" &&
        JSON.stringify(moved.columns) === JSON.stringify(threeRowBlock.columns),
      JSON.stringify(moved.rows),
    ).toBe(true);
  });

  test("4b. 범위를 벗어나는 moveRow는 no-op(순서 불변)", () => {
    const threeRowBlock: TableBlock = {
      ...scoreBlock,
      rows: [
        ["국어", "a1", "a2"],
        ["수학", "b1", "b2"],
        ["영어", "c1", "c2"],
      ],
    };
    const movedOut = ops.moveRow(threeRowBlock, 0, -1);
    const movedOut2 = ops.moveRow(threeRowBlock, 2, 1);
    expect(
      JSON.stringify(movedOut.rows) === JSON.stringify(threeRowBlock.rows) &&
        JSON.stringify(movedOut2.rows) === JSON.stringify(threeRowBlock.rows),
    ).toBe(true);
  });

  test('4c. addRow — 컬럼별 kind에 맞는 빈 셀(text=""/badge={text:"",badge:"minimumNone"})', () => {
    const added = ops.addRow(selectionBlock);
    const lastRow = added.rows[added.rows.length - 1]!;
    const badgeCell = lastRow[3] as { text: string; badge: string };
    expect(
      added.rows.length === selectionBlock.rows.length + 1 &&
        lastRow[0] === "" &&
        badgeCell.text === "" &&
        badgeCell.badge === "minimumNone" &&
        validateTableBlock("selection_method", added).ok,
      JSON.stringify(lastRow),
    ).toBe(true);
  });

  test("4d. removeRow(0) — 나머지 행만 남음", () => {
    const removed = ops.removeRow(selectionBlock, 0);
    expect(
      removed.rows.length === 1 && removed.rows[0]?.[0] === "학생부종합",
      JSON.stringify(removed.rows),
    ).toBe(true);
  });
});

// ── 5) resolveCellKind / getCellKind 판정 ─────────────────────────────────
describe("5) resolveCellKind / getCellKind / emptyCellForKind", () => {
  test("5a. getCellKind(variant, role) 판정 — SelectionTable/RecruitTable 조건과 일치", () => {
    expect(
      getCellKind("selection", "minimum") === "badge" &&
        getCellKind("selection", "type") === "text" &&
        getCellKind("recruit", "group") === "text" &&
        getCellKind("recruit", "unit") === "text" &&
        getCellKind("recruit", "data") === "chips" &&
        getCellKind("recruitExact", "series") === "text",
    ).toBe(true);
  });

  test("5b. resolveCellKind — 값 형태가 role 힌트와 다르면 값 형태 우선", () => {
    expect(
      resolveCellKind("text", { chips: [] }) === "chips" &&
        resolveCellKind("text", { text: "x", badge: "minimumHas" }) ===
          "badge" &&
        resolveCellKind("badge", "plain string") === "badge",
    ).toBe(true);
  });

  test("5c. emptyCellForKind — kind별 빈 셀 기본값", () => {
    expect(
      JSON.stringify(emptyCellForKind("text")) === '""' &&
        JSON.stringify(emptyCellForKind("badge")) ===
          JSON.stringify({ text: "", badge: "minimumNone" }) &&
        JSON.stringify(emptyCellForKind("chips")) ===
          JSON.stringify({ chips: [] }),
    ).toBe(true);
  });
});

// ── 6) 컴포넌트 구조적 스모크 렌더 ─────────────────────────────────────────
describe("6) TableBlockEditor 스모크 렌더", () => {
  test("6. TableBlockEditor 스모크 렌더(예외 없음, 기본 상태는 라벨·셀만 — role/정렬/열조작은 숨김)", () => {
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
      out = String(err instanceof Error ? err.stack : err);
    }
    const inputCount = (out.match(/<input/g) || []).length;
    expect(
      !threw &&
        inputCount === 16 &&
        out.includes("행 추가") &&
        out.includes("열 설정") &&
        !out.includes("열 삭제") &&
        out.includes("컬럼 수가 고정"),
      threw ? out : `inputCount=${inputCount}`,
    ).toBe(true);
  });

  test("6b. TableGroupHeaderEditor expanded 토글 — 접힘은 요약만, 펼침은 편집 필드까지", () => {
    const baseProps = {
      groups: [{ name: "g", count: 2 }],
      fixedColumnCount: 1,
      columnsLength: 3,
      onUpdateGroupField: () => {},
      onAddGroup: () => {},
      onRemoveGroup: () => {},
      onUpdateFixedColumnCount: () => {},
      onEnableGroups: () => {},
    };
    const collapsed = renderToStaticMarkup(
      React.createElement(TableGroupHeaderEditor, {
        ...baseProps,
        expanded: false,
      }),
    );
    const expanded = renderToStaticMarkup(
      React.createElement(TableGroupHeaderEditor, {
        ...baseProps,
        expanded: true,
      }),
    );
    expect(
      collapsed.includes("합계") &&
        !collapsed.includes("그룹 추가") &&
        expanded.includes("그룹 추가") &&
        expanded.includes("고정 컬럼 수"),
      `collapsed=${collapsed}\nexpanded=${expanded}`,
    ).toBe(true);
  });

  test('6c. rowPreviewText — text가 숫자인 badge 셀도 예외 없이 렌더(미리보기 "10" 노출)', () => {
    const numericCellBlock: TableBlock = {
      ...selectionBlock,
      rows: [
        ["", "", "", asCell({ text: 10, badge: "minimumHas" }), ""],
        selectionBlock.rows[1]!,
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
      out = String(err instanceof Error ? err.stack : err);
    }
    expect(
      !threw && out.includes(">10<"),
      threw ? out : `len=${out.length}`,
    ).toBe(true);
  });
});

// ── 7) IME 조합 로직 — 순수 상태 전이 검증 ─────────────────────────────────
// ImeSafeInput의 알고리즘을 그대로 복제해 상태 전이만 검증한다. 실제
// compositionstart/compositionend 이벤트 디스패치와 브라우저 IME 렌더는
// jsdom/브라우저가 필요해 이 환경에서는 재현 불가 — 로직 자체의 정확성만
// 확인한다(재현 불가 사실을 명시).
describe("7) IME 조합 상태 전이 로직(순수 함수 복제)", () => {
  type ImeEvent =
    | { type: "compositionstart" }
    | { type: "change"; value: string }
    | { type: "compositionend"; value: string };

  function simulateImeSafeInput(events: ImeEvent[]) {
    let composing = false;
    let draft = "";
    let committed: string | null = null;
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

  test("7. 조합 중 draft만 갱신, commit은 조합 종료 후. ⚠ 실제 브라우저 compositionevent/캐럿 동작은 jsdom·브라우저 없이 이 환경에서 재현 불가(미검증으로 명시)", () => {
    const r1 = simulateImeSafeInput([
      { type: "compositionstart" },
      { type: "change", value: "ㅇ" },
      { type: "change", value: "안" },
      { type: "compositionend", value: "안" },
    ]);
    const pass1 = r1.draft === "안" && r1.committed === "안";

    const r2 = simulateImeSafeInput([
      { type: "change", value: "a" },
      { type: "change", value: "ab" },
    ]);
    const pass2 = r2.committed === "ab";

    expect(pass1 && pass2, JSON.stringify({ r1, r2 })).toBe(true);
  });
});

// ── 8) role 드롭다운 제한(2026-08-06 감사 반영) ────────────────────────────
describe("8) role 드롭다운 제한", () => {
  test("8a. getKnownRolesForVariant — admissionParsing.ts doc 생성기 소스와 일치(selection/change/recruit/generic)", () => {
    expect(
      JSON.stringify(getKnownRolesForVariantRaw("selection")) ===
        JSON.stringify(["type", "name", "seats", "minimum", "method"]) &&
        JSON.stringify(getKnownRolesForVariantRaw("change")) ===
          JSON.stringify(["no", "title", "content"]) &&
        JSON.stringify(getKnownRolesForVariantRaw("recruit")) ===
          JSON.stringify(["group", "unit", "series"]) &&
        JSON.stringify(getKnownRolesForVariantRaw("generic")) ===
          JSON.stringify([]),
    ).toBe(true);
  });

  test('8b. defaultNewColumnRole — variant별 목록 마지막 항목(비어있으면 "")', () => {
    expect(
      defaultNewColumnRole("score") === "data" &&
        defaultNewColumnRole("recruit") === "series" &&
        defaultNewColumnRole("generic") === "",
    ).toBe(true);
  });

  test('8c. addColumn 기본 role이 defaultNewColumnRole(variant)를 씀("col${n}" 아님)', () => {
    const added = ops.addColumn(scoreBlock);
    const newColumn = added.columns[added.columns.length - 1]!;
    expect(
      newColumn.role === "data" &&
        getCellKind("score", newColumn.role) === "text",
      JSON.stringify(newColumn),
    ).toBe(true);
  });

  test("8d. ColumnRoleEditor — 알려진 role은 경고 없음, 미지 role은 경고+현재값 보존", () => {
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
    expect(
      !knownOut.includes("연결되지 않습니다") &&
        unknownOut.includes("연결되지 않습니다") &&
        unknownOut.includes("my-custom-role"),
      `known=${knownOut}\nunknown=${unknownOut}`,
    ).toBe(true);
  });
});

// ── 9) 그룹 헤더(groups/fixedColumnCount) 편집 ─────────────────────────────
describe("9) 그룹 헤더(groups/fixedColumnCount) 편집", () => {
  const recruitExactBlockFull: TableBlock = {
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

  test("9a. 그룹 count 변경으로 sum(groups)+fixedColumnCount≠columns.length 위반 감지", () => {
    const ok = validateTableBlock("recruitment_quota", recruitExactBlockFull);
    const broken = ops.updateGroupField(recruitExactBlockFull, 0, "count", 3);
    const brokenResult = validateTableBlock("recruitment_quota", broken);
    expect(
      ok.ok &&
        !brokenResult.ok &&
        brokenResult.errors.some((e) => e.includes("groups 합(")),
      JSON.stringify({ ok, brokenResult }),
    ).toBe(true);
  });

  test("9b. fixedColumnCount 변경 후 재검증 — 합계를 다시 맞추면 통과", () => {
    const rebalanced = ops.updateFixedColumnCount(
      ops.updateGroupField(recruitExactBlockFull, 0, "count", 3),
      1,
    );
    const result = validateTableBlock("recruitment_quota", rebalanced);
    expect(result.ok, JSON.stringify(result)).toBe(true);
  });

  test("9c. addGroup — count:0으로 추가돼 불변식을 깨지 않음", () => {
    const added = ops.addGroup(recruitExactBlockFull);
    expect(
      added.groups?.length === 2 &&
        added.groups?.[1]?.count === 0 &&
        validateTableBlock("recruitment_quota", added).ok,
      JSON.stringify(added.groups),
    ).toBe(true);
  });

  test("9d. removeGroup — 그룹 자체는 지워지되(컬럼은 안 지워짐) 불변식 위반이 배너로 드러남(의도된 동작)", () => {
    const removed = ops.removeGroup(recruitExactBlockFull, 0);
    const result = validateTableBlock("recruitment_quota", removed);
    expect(
      removed.groups?.length === 0 && !result.ok,
      JSON.stringify(result),
    ).toBe(true);
  });
});

// ── 10) footnote 편집 후 validate 통과 ─────────────────────────────────────
test("10. footnote 편집(항목 추가) 후 validateAdmissionDoc 통과 + join(' ') 미리보기 문자열 확인", () => {
  const footnoteBlock: Block = { kind: "footnote", items: ["교직과정"] };
  const next: Block = {
    ...footnoteBlock,
    items: [...footnoteBlock.items, "자율전공 과정"],
  };
  const result = validateBlocks("recruitment_quota", [next]);
  expect(
    result.ok && next.items.join(" ") === "교직과정 자율전공 과정",
    JSON.stringify({ next, result }),
  ).toBe(true);
});

// ── 11) 비표 블록 4종 편집 후 validate 통과 ────────────────────────────────
test("11. 비표 블록 4종(note/emptyBox/heading/plainList) 편집 후 validateAdmissionDoc 통과", () => {
  const cases: { kind: string; before: Block; after: Block }[] = [
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
  const detail: string[] = [];
  for (const c of cases) {
    const result = validateBlocks("selection_method", [c.after]);
    const changed = JSON.stringify(c.after) !== JSON.stringify(c.before);
    const ok = result.ok && changed;
    allPass = allPass && ok;
    detail.push(`${c.kind}: changed=${changed} validate.ok=${result.ok}`);
  }
  expect(allPass, detail.join("\n")).toBe(true);
});

// ── 12) 블록 순서 변경 무결성(DocBlocksEditor) ─────────────────────────────
describe("12) 블록 순서 변경 무결성(DocBlocksEditor)", () => {
  test("12a. moveBlock — 순서만 바뀌고 각 블록 내용은 그대로, validate 통과", () => {
    const blocks: Block[] = [
      { kind: "note", text: "A" },
      { kind: "heading", text: "B" },
      { kind: "emptyBox", message: "C" },
    ];
    const moved = docOps.moveBlock(blocks, 0, 1);
    expect(
      moved.length === 3 &&
        moved[0]?.kind === "heading" &&
        moved[1]?.kind === "note" &&
        moved[2]?.kind === "emptyBox" &&
        validateBlocks("selection_method", moved).ok,
      JSON.stringify(moved),
    ).toBe(true);
  });

  test("12b. appendBlock/removeBlockAt — 추가·삭제 데이터 무결성", () => {
    const blocks: Block[] = [{ kind: "note", text: "A" }];
    const newBlock = docOps.createDefaultBlock("footnote");
    if (!newBlock) throw new Error("createDefaultBlock('footnote')이 null");
    const added = docOps.appendBlock(blocks, newBlock);
    const removed = docOps.removeBlockAt(added, 0);
    expect(
      added.length === 2 &&
        added[1]?.kind === "footnote" &&
        removed.length === 1 &&
        removed[0]?.kind === "footnote",
      JSON.stringify({ added, removed }),
    ).toBe(true);
  });

  test("12c. DocBlocksEditor 스모크 렌더 — 9종 블록 전부 예외 없이 디스패치(group은 children 표 편집기로)", () => {
    const blocks: Block[] = [
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
      out = String(err instanceof Error ? err.stack : err);
    }
    expect(
      !threw &&
        out.includes("내용 추가") &&
        out.includes("그룹 제목·구성 변경은 지원하지 않습니다"),
      threw ? out : `len=${out.length}`,
    ).toBe(true);
  });

  // ── 12d~12h) group 중첩 표 편집(GroupBlockEditor) ────────────────────
  const policeFixtureBlocks: Block[] = [
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
    groupFixtureOut = String(err instanceof Error ? err.stack : err);
  }

  test("12d. group 중첩 SSR — 경찰대 축약 픽스처(note+group 2개, special 표)가 예외 없이 렌더되고 중첩 셀 값이 편집 input으로 나온다(순환 참조 회귀 탐지)", () => {
    expect(
      !groupFixtureThrew &&
        groupFixtureOut.includes("admission-data-table") &&
        groupFixtureOut.includes('value="원서접수"') &&
        groupFixtureOut.includes('value="45문항/60분"'),
      groupFixtureThrew ? groupFixtureOut : `len=${groupFixtureOut.length}`,
    ).toBe(true);
  });

  test("12e. group title은 편집 input이 아니다 — 제목이 value 속성에 없고 텍스트 노드로만 존재(제목 편집 UI 유입 탐지)", () => {
    const titlesAsValue = ["전형 일정", "1차 시험"].filter((t) =>
      groupFixtureOut.includes(`value="${t}"`),
    );
    const titlesAsText = ["전형 일정", "1차 시험"].every((t) =>
      groupFixtureOut.includes(`>${t}<`),
    );
    expect(
      !groupFixtureThrew && titlesAsValue.length === 0 && titlesAsText,
      JSON.stringify({ titlesAsValue, titlesAsText }),
    ).toBe(true);
  });

  test("12f. group children onChange 체인 — 자식 표 1개 수정이 group 통째로 닫혀 올라오고 형제·title·children 길이는 불변(저장 경로 회귀)", async () => {
    // React Compiler(task 4b)가 모든 컴포넌트 함수에 useMemoCache 훅을
    // 주입한다 — 원본(node:test 시절)처럼 GroupBlockEditor(props)를 일반
    // 함수로 직접 호출하면(React 렌더 디스패처 밖) "Invalid hook call"로
    // 죽는다. 실제 React 렌더 경로(RTL)를 타야 하므로, SSR 문자열 대신
    // 진짜 DOM에 마운트하고 입력 change 이벤트로 자식 표의 셀 수정을
    // 재현한다(ImeSafeInput의 onCommit은 IME 조합 중이 아니면 change
    // 즉시 발화한다 — 7절 참고).
    type GroupBlockFixture = {
      kind: "group";
      title: string;
      children: {
        kind: "table";
        variant: "special";
        columns: { role: string; label: string }[];
        rows: string[][];
      }[];
    };
    const block: GroupBlockFixture = {
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
    let captured: GroupBlockFixture | null = null;
    render(
      React.createElement(GroupBlockEditor, {
        section: "selection_method",
        block: block as never,
        onChange: (next) => {
          captured = next as unknown as GroupBlockFixture;
        },
      }),
    );
    const input = screen.getByDisplayValue("원서접수");
    fireEvent.change(input, { target: { value: "원서접수(수정)" } });
    const result = captured as GroupBlockFixture | null;
    expect(
      result !== null &&
        result.title === "전형 일정" &&
        result.children.length === 2 &&
        result.children[0]?.rows[0]?.[0] === "원서접수(수정)" &&
        result.children[1]?.rows[0]?.[0] === "서류제출" &&
        JSON.stringify(block) === before,
      JSON.stringify({ captured: result }),
    ).toBe(true);
  });
});

// ── 12i) 빈 상태에서도 "블록 추가" 수단이 있다 ─────────────────────────────
test('12i. 빈 상태 추가 수단 — 6섹션 × 3빈상태(블록0/emptyBox1/group1) 18케이스 전부에서 "+ 내용 추가" 셀렉트가 존재하고 option 집합이 섹션 primary와 일치', () => {
  const EMPTY_STATES: [string, Block[]][] = [
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
  const EXPECTED_PRIMARY: Record<string, string[]> = {
    previous_year_changes: ["table"],
    selection_method: ["table", "plainList"],
    exam_schedule: ["table", "emptyBox", "plainList"],
    minimum_requirements: ["table", "emptyBox", "plainList"],
    school_record_method: ["table", "heading"],
    recruitment_quota: ["table", "footnote", "plainList", "preText"],
  };
  const SECTIONS = Object.keys(EXPECTED_PRIMARY);
  const addSelectOptionValues = (html: string) => {
    const start = html.indexOf('aria-label="추가할 내용 종류"');
    if (start < 0) return null;
    const end = html.indexOf("</select>", start);
    if (end < 0) return null;
    return [...html.slice(start, end).matchAll(/<option value="([^"]+)"/g)].map(
      (m) => m[1],
    );
  };

  const failures: string[] = [];
  let checked = 0;
  for (const section of SECTIONS) {
    const primary = EXPECTED_PRIMARY[section]!;
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
          `${section}/${stateLabel}: threw ${String(err instanceof Error ? err.message : err)}`,
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
  expect(
    checked === 18 && failures.length === 0,
    JSON.stringify({ checked, failures }),
  ).toBe(true);
});

// ── 12g) 소스 락 — group 단위 구성 변경 UI가 흘러 들어오지 않는다 ─────────
test("12g. 소스 락 — GroupBlockEditor.tsx에 group 생성·제거·순서 변경 토큰이 없다(구성 변경 UI 유입 탐지)", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const src = fs.readFileSync(
    path.join(import.meta.dirname, "blocks/GroupBlockEditor.tsx"),
    "utf8",
  );
  const forbidden = ["내용 추가", "↑", "↓", "삭제"].filter((token) =>
    src.includes(token),
  );
  const pass = forbidden.length === 0 && src.includes("AdmissionBlockEditor");
  expect(pass, JSON.stringify({ forbidden })).toBe(true);
});

test("12h. renderDocToHtml 왕복 — group children 셀 수정이 html 미러에 반영되고 <table>·group 제목 개수는 불변(renderSpecialBlocksHtml 제목 화이트리스트 소실 탐지)", () => {
  const doc = buildSpecialCategoryDoc(
    "",
    { detail_status: "category" },
    "경찰대학",
  );
  const beforeHtml = renderDocToHtml(doc, "selection_method");
  const groupIdx = doc.blocks.findIndex(
    (b: { kind: string }) => b.kind === "group",
  );
  const targetGroup = doc.blocks[groupIdx] as unknown as {
    children: { rows: unknown[][] }[];
  };
  const targetChild = targetGroup.children[0]!;
  const nextRows = targetChild.rows.map((row, i) =>
    i === 0
      ? row.map((cell, j) => (j === row.length - 1 ? "검증용 수정값" : cell))
      : row,
  );
  const nextGroup = {
    ...targetGroup,
    children: docOps.updateBlockAt(
      targetGroup.children as unknown as Block[],
      0,
      { ...targetChild, rows: nextRows } as unknown as Block,
    ),
  };
  const nextDoc = {
    ...doc,
    blocks: docOps.updateBlockAt(
      doc.blocks,
      groupIdx,
      nextGroup as unknown as Block,
    ),
  };
  const afterHtml = renderDocToHtml(nextDoc, "selection_method");
  const count = (html: string, re: RegExp) => (html.match(re) || []).length;
  const pass =
    groupIdx >= 0 &&
    !beforeHtml.includes("검증용 수정값") &&
    afterHtml.includes("검증용 수정값") &&
    count(beforeHtml, /<table/g) === count(afterHtml, /<table/g) &&
    count(beforeHtml, /admission-special-title/g) ===
      count(afterHtml, /admission-special-title/g) &&
    count(afterHtml, /admission-special-title/g) ===
      doc.blocks.filter((b: { kind: string }) => b.kind === "group").length;
  expect(
    pass,
    JSON.stringify({
      groupIdx,
      tables: [count(beforeHtml, /<table/g), count(afterHtml, /<table/g)],
      titles: [
        count(beforeHtml, /admission-special-title/g),
        count(afterHtml, /admission-special-title/g),
      ],
      groups: doc.blocks.filter((b: { kind: string }) => b.kind === "group")
        .length,
      applied: afterHtml.includes("검증용 수정값"),
    }),
  ).toBe(true);
});

// ── 12j) DocBlocksEditor — group 카드에는 ↑↓/삭제가 없다 ──────────────────
test("12j. group 카드(1번)는 ↑↓/삭제 컨트롤이 없고, 비-group 카드(2번)는 그대로 있다", () => {
  const mixedBlocks: Block[] = [
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
  expect(!groupHasControls && nonGroupHasControls, out).toBe(true);
});

// ── 12k) 편집기 문구 — 내부 kind 표기가 화면에 남지 않는다 ────────────────
test('12k. 편집기 문구 정리 — 내부 kind 괄호 표기·"블록" 용어가 화면에서 사라지고 순화된 한글 문구로 대체됐다', () => {
  const blocks: Block[] = [
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
  expect(
    forbiddenTokens.length === 0 && requiredTokens.length === 0,
    JSON.stringify({ forbiddenTokens, requiredTokens }),
  ).toBe(true);
});

// ── 13) plainList 항목 추가·삭제·순서 변경 ─────────────────────────────────
test("13a. plainList items 추가·삭제·순서변경 — docBlockOperations 제네릭 함수 재사용 확인", () => {
  const block = {
    kind: "plainList",
    items: [
      { type: "text", text: "a" },
      { type: "bullet", text: "b" },
    ],
  };
  const appended = docOps.appendBlock(block.items, {
    type: "text",
    text: "c",
  });
  const removed = docOps.removeBlockAt(appended, 0);
  const moved = docOps.moveBlock(removed, 0, 1);
  expect(
    appended.length === 3 &&
      removed.length === 2 &&
      removed[0]?.text === "b" &&
      moved[0]?.text === "c" &&
      moved[1]?.text === "b",
    JSON.stringify({ appended, removed, moved }),
  ).toBe(true);
});

test("13b. PlainListBlockEditor 스모크 렌더 — 항목 추가/삭제 버튼 존재", () => {
  const block = {
    kind: "plainList",
    items: [
      { type: "text", text: "a" },
      { type: "bullet", text: "b" },
    ],
  };
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
    out = String(err instanceof Error ? err.stack : err);
  }
  expect(
    !threw && out.includes("항목 추가") && out.includes("삭제"),
    threw ? out : `len=${out.length}`,
  ).toBe(true);
});

// ── 14) xlsx 내보내기 ──────────────────────────────────────────────────────
describe("14) xlsx 내보내기", () => {
  test("14a. serializeCellForXlsx — 문자열/{text,badge}/{chips} 직렬화 규칙", () => {
    expect(
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
        serializeCellForXlsx(asCell(null)) === "",
    ).toBe(true);
  });

  test("14b. findOversizedCells — 32,767자 초과 셀을 정확한 위치로 찾아냄", () => {
    const big = "a".repeat(MAX_XLSX_CELL_LENGTH + 1);
    const block: TableBlock = {
      kind: "table",
      variant: "score",
      columns: [
        { role: "type", label: "구분" },
        { role: "data", label: "국어" },
      ],
      rows: [["x", big]],
    };
    const oversized = findOversizedCells(block);
    expect(
      oversized.length === 1 &&
        oversized[0]?.area === "body" &&
        oversized[0]?.row === 0 &&
        oversized[0]?.col === 1 &&
        oversized[0]?.length === big.length,
      JSON.stringify(oversized),
    ).toBe(true);
  });

  test("14c. findOversizedCells — DB 실측 최대 셀 크기(39,658자)도 초과로 탐지", () => {
    const dbMaxLikeCell = "x".repeat(39658);
    const block: TableBlock = {
      kind: "table",
      variant: "score",
      columns: [{ role: "data", label: "A" }],
      rows: [[dbMaxLikeCell]],
    };
    const oversized = findOversizedCells(block);
    expect(
      oversized.length === 1 && oversized[0]?.length === 39658,
      JSON.stringify(oversized),
    ).toBe(true);
  });

  test("14d. buildTableBlockWorksheet — recruitExact 병합 셀이 groups/fixedColumnCount와 일치(고정 rowspan 2개 + 그룹 colspan 1개)", () => {
    const recruitExactForXlsx: TableBlock = {
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
    const merges =
      (ws["!merges"] as {
        s: { r: number; c: number };
        e: { r: number; c: number };
      }[]) || [];
    const fixedMerges = merges.filter((m) => m.s.r === 0 && m.e.r === 1);
    const groupMerges = merges.filter((m) => m.s.r === 0 && m.e.r === 0);
    expect(
      fixedMerges.length === 2 &&
        fixedMerges.some((m) => m.s.c === 0 && m.e.c === 0) &&
        fixedMerges.some((m) => m.s.c === 1 && m.e.c === 1) &&
        groupMerges.length === 1 &&
        groupMerges[0]?.s.c === 2 &&
        groupMerges[0]?.e.c === 3,
      JSON.stringify(merges),
    ).toBe(true);

    const aoa = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][];
    expect(
      aoa.length === 3 &&
        aoa[0]?.[0] === "계열" &&
        aoa[0]?.[2] === "일반전형" &&
        aoa[1]?.[2] === "27 인원" &&
        aoa[2]?.[0] === "인문",
      JSON.stringify(aoa),
    ).toBe(true);
  });

  test("14f. buildTableBlockWorksheet — groups 없으면 병합 셀 없음(1단 헤더)", () => {
    const ws = buildTableBlockWorksheet(scoreBlock);
    const merges = ws["!merges"] as unknown[] | undefined;
    expect(!merges || merges.length === 0, JSON.stringify(merges)).toBe(true);
  });

  test("14g. buildXlsxFileName — 대학명_카테고리_YYYYMMDD.xlsx 형식", () => {
    const name = buildXlsxFileName({
      universityName: "가톨릭관동대학교",
      sectionLabel: "모집인원 및 입결",
      date: new Date(2026, 7, 6),
    });
    expect(name, name).toBe("가톨릭관동대학교_모집인원 및 입결_20260806.xlsx");
  });

  test("14h. exportTableBlockToXlsx — 정상 케이스: ok:true, 파일명 형식, 시트 2개(표/형식 설명)", () => {
    const result = exportTableBlockToXlsx(selectionBlock, {
      universityName: "가톨릭관동대학교",
      sectionLabel: "전형방법",
    });
    const today = new Date();
    const expectedDate = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;
    const sheetNames = result.workbook?.SheetNames || [];
    expect(
      result.ok === true &&
        result.fileName === `가톨릭관동대학교_전형방법_${expectedDate}.xlsx` &&
        sheetNames.length === 2 &&
        sheetNames.includes("표") &&
        sheetNames.includes("형식 설명"),
      JSON.stringify({ fileName: result.fileName, sheetNames }),
    ).toBe(true);
  });

  test("14i. exportTableBlockToXlsx — 32,767자 초과 시 workbook 미생성(조용한 truncate 아님), oversized 목록 반환", () => {
    const big = "a".repeat(MAX_XLSX_CELL_LENGTH + 1);
    const block: TableBlock = {
      kind: "table",
      variant: "score",
      columns: [{ role: "data", label: "A" }],
      rows: [[big]],
    };
    const result = exportTableBlockToXlsx(block, { universityName: "X대학교" });
    expect(
      result.ok === false &&
        result.oversized.length === 1 &&
        result.fileName === null &&
        result.workbook === undefined,
      JSON.stringify(result),
    ).toBe(true);
  });
});

// ── 15) xlsx 가져오기 ────────────────────────────────────────────────────
describe("15) xlsx 가져오기", () => {
  const recruitExactRoundTripBlock: TableBlock = {
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
  const recruitRoundTripBlock: TableBlock = {
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

  function roundTrip(block: TableBlock, section: string) {
    const workbook = buildTableBlockWorkbook(block);
    return importTableBlockFromXlsx(workbook, block, section);
  }

  test("15a. 왕복 무손실 — recruitExact(2단 헤더, groups/fixedColumnCount 복원)", () => {
    const result = roundTrip(recruitExactRoundTripBlock, "recruitment_quota");
    expect(
      result.ok === true && result.unchanged === true,
      JSON.stringify(
        result.ok
          ? { unchanged: result.unchanged, block: result.block }
          : result,
      ),
    ).toBe(true);
  });

  test("15b. 왕복 무손실 — selection({text,badge} 셀)", () => {
    const result = roundTrip(selectionBlock, "selection_method");
    expect(
      result.ok === true && result.unchanged === true,
      JSON.stringify(result.ok ? { unchanged: result.unchanged } : result),
    ).toBe(true);
  });

  // ⚠ 정정(2026-08-06): chips({recruit} variant)는 dev DB에 7건 존재한다
  // (명지대학교(용인/서울)·단국대학교(죽전)·인천대학교·한국외국어대학교
  // (용인/서울)·서경대학교). 아래는 합성 데이터 테스트다(실데이터 표본으로
  // 재검증하려면 위 7개교 중 하나에서 recruit 표를 실제로 내보내 봐야 한다).
  test("15c. 왕복 무손실 — recruit({chips} 셀, 빈 chips 포함, ※ 합성 데이터 — 실데이터 7건 존재하나 xlsx 왕복 실파일 미검증)", () => {
    const result = roundTrip(recruitRoundTripBlock, "recruitment_quota");
    expect(
      result.ok === true && result.unchanged === true,
      JSON.stringify(result.ok ? { unchanged: result.unchanged } : result),
    ).toBe(true);
  });

  test("15d. 컬럼 수 고정 variant(selection)에서 열이 늘면 validateTableBlock이 거부", () => {
    const workbook = buildTableBlockWorkbook(selectionBlock);
    const ws = workbook.Sheets["표"]!;
    const range = XLSX.utils.decode_range(ws["!ref"] as string);
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
    expect(
      result.ok === false &&
        result.errors?.some((e) => e.includes("컬럼 수가")),
      JSON.stringify(result),
    ).toBe(true);
  });

  test("15e-guard. 그룹 가로 병합이 전부 사라져도(count=1 그룹들로 재구성) 여전히 유효한 doc — 설계 확인용", () => {
    const workbook = buildTableBlockWorkbook(recruitExactRoundTripBlock);
    const ws = workbook.Sheets["표"]!;
    ws["!merges"] = ((ws["!merges"] as XLSX.Range[]) || []).filter(
      (m) => !(m.s.r === 0 && m.e.r === 0),
    );
    const result = importTableBlockFromXlsx(
      workbook,
      recruitExactRoundTripBlock,
      "recruitment_quota",
    );
    expect(
      result.ok === true,
      JSON.stringify({ ok: result.ok, groups: result.block?.groups }),
    ).toBe(true);
  });

  test("15e. 고정 컬럼 세로 병합 제거 → fixedColumnCount/groups가 병합 구조 그대로 재계산됨(1개 + 그룹 3개로 재해석)", () => {
    const workbook = buildTableBlockWorkbook(recruitExactRoundTripBlock);
    const ws = workbook.Sheets["표"]!;
    ws["!merges"] = ((ws["!merges"] as XLSX.Range[]) || []).filter(
      (m) => !(m.s.r === 0 && m.e.r === 1 && m.s.c === 1),
    );
    const result = importTableBlockFromXlsx(
      workbook,
      recruitExactRoundTripBlock,
      "recruitment_quota",
    );
    expect(
      result.ok === true &&
        result.block?.fixedColumnCount === 1 &&
        result.block?.groups?.length === 3,
      JSON.stringify({
        ok: result.ok,
        fixedColumnCount: result.block?.fixedColumnCount,
        groups: result.block?.groups,
      }),
    ).toBe(true);
  });

  test("15f. 행 길이가 컬럼 수보다 길면 validateTableBlock이 거부", () => {
    const workbook = buildTableBlockWorkbook(scoreBlock);
    const ws = workbook.Sheets["표"]!;
    XLSX.utils.sheet_add_aoa(ws, [["x", "y", "z", "초과"]], { origin: "A2" });
    const range = XLSX.utils.decode_range(ws["!ref"] as string);
    ws["!ref"] = XLSX.utils.encode_range({
      s: range.s,
      e: { r: range.e.r, c: Math.max(range.e.c, 3) },
    });
    const result = importTableBlockFromXlsx(
      workbook,
      scoreBlock,
      "recruitment_quota",
    );
    expect(
      result.ok === false && result.errors?.some((e) => e.includes("길이")),
      JSON.stringify(result),
    ).toBe(true);
  });

  test("15g. 마지막 셀이 빈 짧은 행 → 빈 문자열로 채워 통과(거부 아님)", () => {
    const workbook = buildTableBlockWorkbook(scoreBlock);
    const ws = workbook.Sheets["표"]!;
    delete ws["C2"];
    const result = importTableBlockFromXlsx(
      workbook,
      scoreBlock,
      "recruitment_quota",
    );
    expect(
      result.ok === true &&
        result.block?.rows[0]?.length === scoreBlock.columns.length &&
        result.block?.rows[0]?.[2] === "",
      JSON.stringify(result.ok ? result.block?.rows : result),
    ).toBe(true);
  });

  test("15h. 완전히 빈 트레일링 행은 무시됨(행 수 안 늘어남)", () => {
    const workbook = buildTableBlockWorkbook(scoreBlock);
    const ws = workbook.Sheets["표"]!;
    XLSX.utils.sheet_add_aoa(ws, [["", "", ""]], { origin: -1 });
    const result = importTableBlockFromXlsx(
      workbook,
      scoreBlock,
      "recruitment_quota",
    );
    expect(
      result.ok === true &&
        result.block?.rows.length === scoreBlock.rows.length,
      JSON.stringify(result.ok ? result.block?.rows.length : result),
    ).toBe(true);
  });

  test("15i. 수식 셀은 캐시된 계산값을 취함(수식 문자열 아님)", () => {
    const workbook = buildTableBlockWorkbook(scoreBlock);
    const ws = workbook.Sheets["표"]!;
    ws["B2"] = { t: "n", v: 99, f: "SUM(1,98)" };
    const result = importTableBlockFromXlsx(
      workbook,
      scoreBlock,
      "recruitment_quota",
    );
    expect(
      result.ok === true && result.block?.rows[0]?.[1] === "99",
      JSON.stringify(result.ok ? result.block?.rows[0] : result),
    ).toBe(true);
  });

  test("15j. deserializeCellFromXlsx(chips) — 정상/빈/형식불일치(데이터 보존) 3가지", () => {
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
    expect(
      pass1 && pass2 && pass3,
      JSON.stringify({ pass1, pass2, pass3 }),
    ).toBe(true);
  });

  test("15k. deserializeCellFromXlsx(badge) — 있음/없음/접미어 없음(폴백) 3가지", () => {
    const pass1 =
      JSON.stringify(deserializeCellFromXlsx("3등급 [최저있음]", "badge")) ===
      JSON.stringify({ text: "3등급", badge: "minimumHas" });
    const pass2 =
      JSON.stringify(deserializeCellFromXlsx("[최저없음]", "badge")) ===
      JSON.stringify({ text: "", badge: "minimumNone" });
    const pass3 =
      JSON.stringify(deserializeCellFromXlsx("접미어없음", "badge")) ===
      JSON.stringify({ text: "접미어없음", badge: "minimumNone" });
    expect(
      pass1 && pass2 && pass3,
      JSON.stringify({ pass1, pass2, pass3 }),
    ).toBe(true);
  });

  test('15l. "표" 시트가 없는 파일은 거부', () => {
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
    expect(
      result.ok === false && result.errors?.some((e) => e.includes("표")),
      JSON.stringify(result),
    ).toBe(true);
  });

  test("15m. summarizeBlockChange — 행 추가 1 / 셀 변경 1 정확히 계산", () => {
    const before = { columns: scoreBlock.columns, rows: [["a", "b", "c"]] };
    const after = {
      columns: scoreBlock.columns,
      rows: [
        ["a", "X", "c"],
        ["d", "e", "f"],
      ],
    };
    const summary = summarizeBlockChange(
      before as unknown as TableBlock,
      after as unknown as TableBlock,
    );
    expect(
      summary.rowsAdded === 1 &&
        summary.rowsRemoved === 0 &&
        summary.cellsChanged === 1 &&
        summary.columnsChanged === false,
      JSON.stringify(summary),
    ).toBe(true);
  });
});

// ── 16) 섹션별 블록 추가 선택지 제한 ───────────────────────────────────────
describe("16) 섹션별 블록 추가 선택지 제한", () => {
  test("16a. previous_year_changes — primary=[table]만(buildChangeDocBlocks 실측)", () => {
    const { primary, advanced } = docOps.getAddableKindsForSection(
      "previous_year_changes",
    );
    expect(
      JSON.stringify(primary) === JSON.stringify(["table"]) &&
        !advanced.includes("table") &&
        advanced.includes("note"),
      JSON.stringify({ primary, advanced }),
    ).toBe(true);
  });

  test("16b. recruitment_quota — primary=[table,footnote,plainList,preText](buildRecruitDocBlocks+buildRawSectionDoc 실측)", () => {
    const { primary } = docOps.getAddableKindsForSection("recruitment_quota");
    expect(
      JSON.stringify(primary) ===
        JSON.stringify(["table", "footnote", "plainList", "preText"]),
      JSON.stringify(primary),
    ).toBe(true);
  });

  test("16c. school_record_method — primary=[table,heading](buildRecordDocBlocks 실측, plainList 폴백 없음 반영)", () => {
    const { primary } = docOps.getAddableKindsForSection(
      "school_record_method",
    );
    expect(
      JSON.stringify(primary) === JSON.stringify(["table", "heading"]),
      JSON.stringify(primary),
    ).toBe(true);
  });

  test("16d. note/group은 6개 섹션 전부 primary에서 제외(top-level 생성기 없음 실측)", () => {
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
    expect(pass).toBe(true);
  });

  test("16e. primary/advanced가 전체 종류를 중복 없이 분할", () => {
    const { primary, advanced } =
      docOps.getAddableKindsForSection("exam_schedule");
    const union = new Set([...primary, ...advanced]);
    expect(
      union.size === ALL_BLOCK_KINDS.length &&
        primary.every((k) => !advanced.includes(k)),
      JSON.stringify({ primary, advanced }),
    ).toBe(true);
  });

  test("16f. DocBlocksEditor 스모크 렌더 — 제한 섹션은 드롭다운 옵션 1개(table)만, 고급 토글 존재", () => {
    const out = renderToStaticMarkup(
      React.createElement(DocBlocksEditor, {
        section: "previous_year_changes",
        blocks: [],
        onChange: () => {},
      }),
    );
    const optionCount = (out.match(/<option/g) || []).length;
    expect(
      optionCount === 1 && out.includes("고급"),
      `optionCount=${optionCount}`,
    ).toBe(true);
  });

  test("16g. 알 수 없는 section — primary 빈 배열, advanced가 전체 종류", () => {
    const { primary, advanced } =
      docOps.getAddableKindsForSection("unknown_section");
    expect(
      primary.length === 0 && advanced.length === ALL_BLOCK_KINDS.length,
      JSON.stringify({ primary, advanced }),
    ).toBe(true);
  });
});

// ── 17) 표 골격 단일성 계약(설계 §7-3 T1/T2/T3) ────────────────────────────
// 편집기가 자체 <table>을 폐기하고 table/AdmissionTable.tsx에 위임한 뒤로
// 성립하는 계약이다. **뷰 DOM == 편집 DOM을 단언하지 않는다** — 파리티
// 플래그로 의도적으로 다르게 두고 있어(EDIT_PARITY_FROZEN) 그 단언은 애초에
// 성립할 수 없다. 대신 (T1) 골격 문자열, (T2) 컬럼 수, (T3) 셀 kind 판정
// 정본 세 가지만 못 박는다.
describe("17) 표 골격 단일성 계약(T1/T2/T3)", () => {
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

  test("17a. T1 골격 단일성 — 뷰/편집의 <div>·<table> class가 동일(편집은 scrollWrapExtra 2토큰만 추가)", () => {
    const skeletonOf = (html: string) => {
      const m = html.match(/<div class="([^"]*)"><table class="([^"]*)">/);
      return m
        ? { wrap: (m[1] ?? "").split(" ").filter(Boolean), table: m[2] }
        : null;
    };
    const viewSkeleton = skeletonOf(viewOut);
    const editSkeleton = skeletonOf(editOut);
    const editWrapBase = editSkeleton
      ? editSkeleton.wrap.filter((t) => !EDIT_ONLY_WRAP_TOKENS.includes(t))
      : null;
    expect(
      Boolean(viewSkeleton && editSkeleton) &&
        JSON.stringify(editWrapBase) === JSON.stringify(viewSkeleton?.wrap) &&
        editSkeleton?.table === viewSkeleton?.table &&
        EDIT_ONLY_WRAP_TOKENS.every((t) => editSkeleton?.wrap.includes(t)),
      JSON.stringify({ viewSkeleton, editSkeleton }),
    ).toBe(true);
  });

  test("17b. T2 컬럼 수 계약 — describeTable.columnCount === columns.length, 편집 행당 <td>·<th> === columnCount === 뷰 행당 <td>(7d 이후 여분 컬럼 0)", () => {
    const desc = tableModel.describeTable(selectionBlock);
    const tdTotal = (editOut.match(/<td/g) || []).length;
    const tdPerRow = tdTotal / selectionBlock.rows.length;
    const viewTdPerRow =
      (viewOut.match(/<td/g) || []).length / selectionBlock.rows.length;
    const thCount = (editOut.match(/<th[\s>]/g) || []).length;
    expect(
      desc !== null &&
        desc.columnCount === selectionBlock.columns.length &&
        Number.isInteger(tdPerRow) &&
        tdPerRow === desc.columnCount &&
        thCount === desc.columnCount &&
        tdPerRow === viewTdPerRow,
      JSON.stringify({
        columnCount: desc?.columnCount,
        columnsLength: selectionBlock.columns.length,
        tdTotal,
        tdPerRow,
        viewTdPerRow,
        thCount,
      }),
    ).toBe(true);
  });

  test("17c. T3 kind 단일 정본 — describeCell().edit.kind === resolveCellKind(getCellKind(variant, role), cell) 전수 대조", () => {
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
    const CELL_SHAPES: Cell[] = [
      "문자열 셀",
      { text: "3등급", badge: "minimumHas" },
      { chips: [{ label: "27 인원", value: "18" }] },
    ];
    const EXTRA_ROLES = ["minimum", "group", "unit", "data", undefined];
    let checked = 0;
    const mismatches: unknown[] = [];
    for (const variant of VARIANTS) {
      const roles = [
        ...new Set([...getKnownRolesForVariantRaw(variant), ...EXTRA_ROLES]),
      ];
      for (const role of roles) {
        for (const cell of CELL_SHAPES) {
          const probeBlock = asBlock({
            kind: "table",
            variant,
            columns: [{ role, label: "L" }],
            rows: [[cell]],
          });
          const actual = tableModel.describeCell(probeBlock, 0, 0).edit.kind;
          const expected = resolveCellKind(getCellKind(variant, role), cell);
          checked += 1;
          if (actual !== expected)
            mismatches.push({ variant, role, cell, actual, expected });
        }
      }
    }
    expect(
      mismatches.length === 0 &&
        checked >= VARIANTS.length * CELL_SHAPES.length,
      JSON.stringify(mismatches),
    ).toBe(true);
  });
});
