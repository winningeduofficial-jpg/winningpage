// TableBlock ↔ xlsx 왕복(표 단위) — 내보내기 절반. 가져오기(⑤)는 별도
// 커밋. SheetJS(xlsx@0.20.3, cdn.sheetjs.com에서 설치 — npm 레지스트리
// 취약 버전 아님)만 쓴다. 문서 전체가 아니라 TableBlock 하나 = 시트
// 하나다 — rawHtml/badge/chips/비표 블록은 여러 표를 아우르는 전체
// 문서 왕복으로는 무손실 표현이 안 되고, 엑셀 셀 32,767자 한도(DB 실측
// 최대 셀 39,658자가 실제로 이 한도에 걸린다)에도 걸린다.
//
// 시트 구성:
//   "표": 실제 데이터. groups/fixedColumnCount가 있으면(recruitExact 2단
//     헤더) 실제 merged cell로 표현한다 — 고정 컬럼은 세로 병합
//     (rowspan=2), 그룹은 가로 병합(colspan=count). 없으면 1단 헤더.
//   "형식 설명": Cell 3형태 직렬화 규칙을 사람이 읽을 수 있게 적어둔다 —
//     재업로드(⑤) 시 관리자가 엑셀만 보고 형식을 알아야 한다는 지시에
//     따른 것. 가져오기 파서도 여기 적은 규칙을 그대로 역직렬화 기준으로
//     삼는다(두 곳이 어긋나면 왕복이 깨지므로, 규칙을 바꿀 땐 이 파일과
//     ⑤ 파서를 반드시 같이 고쳐야 한다).
//
// Cell 직렬화 규칙:
//   문자열                    → 그대로
//   {text, badge}             → "{text} [최저있음]" / "{text} [최저없음]"
//     (badge 유무를 대괄호 접미어로 표기 — BadgeCellEditor.jsx의
//     "있음"/"없음" select 옵션 문구와 동일하게 맞췄다. text가 비어
//     있으면 접미어만 남는다. 대괄호 접미어를 고른 이유: 값 앞이 아니라
//     뒤에 붙어 원문 텍스트 검색·정렬을 방해하지 않고, 정규식
//     / \[최저(있음|없음)\]$/로 명확히 역파싱 가능하다.)
//   {chips:[{label,value}]}   → 칩마다 "label: value" 한 줄씩 셀 안
//     개행(\n)으로 이어붙인다(엑셀 Alt+Enter 줄바꿈과 동일한 형태로
//     보인다). 빈 배열은 빈 문자열.
import * as XLSX from "xlsx";
import {
  defaultNewColumnRole,
  getCellKind,
  getKnownRolesForVariant,
} from "../../admissionLayout";
import { blocksEqual, validateTableBlock } from "../tableEditorValidation";

// 엑셀 셀 문자 수 한도(SheetJS가 XLSX.writeFile 시점에 실제로 이 값으로
// throw한다 — 직접 재현 확인함). 사전 검사로 이 예외를 만나기 전에
// 막는다.
export const MAX_XLSX_CELL_LENGTH = 32767;

const BADGE_HAS_SUFFIX = " [최저있음]";
const BADGE_NONE_SUFFIX = " [최저없음]";
// 직렬화 접미어를 역파싱하는 정규식 — deserializeCellFromXlsx가 쓴다.
// 셀 끝에 붙는 " [최저있음]"/" [최저없음]"만 매칭한다(값 중간에 우연히
// 같은 문자열이 있어도 끝이 아니면 매칭 안 됨).
const BADGE_SUFFIX_RE = /\s?\[최저(있음|없음)\]$/;

export function serializeCellForXlsx(cell) {
  if (cell === null || cell === undefined) return "";
  if (typeof cell === "string") return cell;
  if (typeof cell === "object") {
    if (Array.isArray(cell.chips)) {
      return cell.chips
        .map((chip) => `${chip.label ?? ""}: ${chip.value ?? ""}`)
        .join("\n");
    }
    if ("badge" in cell || "text" in cell) {
      const text = cell.text ?? "";
      const suffix =
        cell.badge === "minimumHas" ? BADGE_HAS_SUFFIX : BADGE_NONE_SUFFIX;
      return text ? `${text}${suffix}` : suffix.trim();
    }
  }
  return String(cell);
}

/** 32,767자를 초과하는 셀을 전부 찾는다(헤더 라벨 포함). 빈 배열이면 안전. */
export function findOversizedCells(block) {
  const oversized = [];
  const check = (rawValue, location) => {
    const text =
      typeof rawValue === "string" ? rawValue : serializeCellForXlsx(rawValue);
    if (text.length > MAX_XLSX_CELL_LENGTH) {
      oversized.push({ ...location, length: text.length });
    }
  };
  block.columns.forEach((col, c) => {
    check(col.label, {
      area: "header",
      row: 0,
      col: c,
      columnLabel: col.label,
    });
  });
  block.rows.forEach((row, r) => {
    row.forEach((cell, c) => {
      check(cell, {
        area: "body",
        row: r,
        col: c,
        columnLabel: block.columns[c]?.label,
      });
    });
  });
  return oversized;
}

function buildHeaderRowsAndMerges(block) {
  const { columns, groups, fixedColumnCount } = block;
  if (!groups) {
    return { headerRows: [columns.map((c) => c.label ?? "")], merges: [] };
  }

  const fixedCount = fixedColumnCount || 0;
  const dataColumns = columns.slice(fixedCount);
  const row0 = new Array(columns.length).fill("");
  const row1 = new Array(columns.length).fill("");
  const merges = [];

  columns.slice(0, fixedCount).forEach((col, idx) => {
    row0[idx] = col.label ?? "";
    // 고정 컬럼: rowspan=2 (세로 병합, row0~row1 같은 컬럼).
    merges.push({ s: { r: 0, c: idx }, e: { r: 1, c: idx } });
  });

  let cursor = fixedCount;
  groups.forEach((group) => {
    const count = Number(group.count) || 0;
    if (count > 0) {
      row0[cursor] = group.name ?? "";
      if (count > 1) {
        // 그룹: colspan=count (가로 병합, row0만).
        merges.push({
          s: { r: 0, c: cursor },
          e: { r: 0, c: cursor + count - 1 },
        });
      }
    }
    for (let i = 0; i < count; i += 1) {
      row1[cursor + i] = dataColumns[cursor - fixedCount + i]?.label ?? "";
    }
    cursor += count;
  });

  return { headerRows: [row0, row1], merges };
}

export function buildTableBlockWorksheet(block) {
  const { headerRows, merges } = buildHeaderRowsAndMerges(block);
  const bodyRows = block.rows.map((row) =>
    row.map((cell) => serializeCellForXlsx(cell)),
  );
  const worksheet = XLSX.utils.aoa_to_sheet([...headerRows, ...bodyRows]);
  if (merges.length) worksheet["!merges"] = merges;
  return worksheet;
}

function buildFormatSheet(block) {
  const rows = [
    ["winningpage 어드민 표 편집기(TableBlock) 내보내기 — 형식 안내"],
    ["variant", block.variant],
    [""],
    ["셀 형식", "표기 규칙"],
    ["문자열 셀", "그대로"],
    [
      "{text,badge} 셀(예: 최저학력기준)",
      `"텍스트${BADGE_HAS_SUFFIX}" 또는 "텍스트${BADGE_NONE_SUFFIX}" — 대괄호 접미어로 badge 표기`,
    ],
    [
      "{chips} 셀(예: 모집인원 값)",
      '칩마다 "라벨: 값" 한 줄씩, 셀 안 줄바꿈(Alt+Enter)으로 구분',
    ],
    [""],
    [
      `이 variant(${block.variant})에서 알려진 role`,
      getKnownRolesForVariant(block.variant).join(", ") || "(없음)",
    ],
  ];
  if (block.groups) {
    rows.push([""], ["2단 헤더(그룹) 구성"]);
    rows.push(["fixedColumnCount", block.fixedColumnCount ?? 0]);
    block.groups.forEach((g) => {
      rows.push([`그룹: ${g.name}`, `count=${g.count}`]);
    });
  }
  return XLSX.utils.aoa_to_sheet(rows);
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function sanitizeFileNamePart(value) {
  return String(value || "")
    .replace(/[\\/:*?"<>|]/g, "_")
    .trim();
}

export function buildXlsxFileName({
  universityName,
  sectionLabel,
  variant,
  date,
} = {}) {
  const d = date instanceof Date ? date : new Date();
  const dateStr = `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
  const namePart = sanitizeFileNamePart(universityName) || "대학명미상";
  const labelPart = sanitizeFileNamePart(sectionLabel || variant) || "표";
  return `${namePart}_${labelPart}_${dateStr}.xlsx`;
}

/**
 * TableBlock 하나를 xlsx 파일로 내보낸다. 32,767자 초과 셀이 하나라도
 * 있으면 파일을 만들지 않고 그 목록을 반환한다(조용한 truncate 금지 —
 * XLSX.writeFile 자체가 이 상황에서 예외를 던지는 걸 직접 재현
 * 확인했다. 그 저수준 예외 대신 어떤 셀이 문제인지 미리 알려준다).
 * @returns {{ ok: boolean, oversized: Array, fileName: string|null }}
 */
export function exportTableBlockToXlsx(block, meta = {}) {
  const oversized = findOversizedCells(block);
  if (oversized.length > 0) {
    return { ok: false, oversized, fileName: null };
  }

  const workbook = buildTableBlockWorkbook(block);
  const fileName = buildXlsxFileName({ ...meta, variant: block.variant });
  if (typeof document !== "undefined") {
    triggerBrowserDownload(workbook, fileName);
  }
  // workbook을 함께 반환한다 — 노드 검증 스크립트가 document 없이도(다운로드
  // 트리거 없이) 결과 워크북 내용(시트/병합/셀 값)을 직접 검사할 수 있게
  // 하기 위함(XLSX.writeFile 자체 환경 감지에 기대지 않는 이유는 아래
  // triggerBrowserDownload 주석 참고).
  return { ok: true, oversized: [], fileName, workbook };
}

export function buildTableBlockWorkbook(block) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, buildTableBlockWorksheet(block), "표");
  XLSX.utils.book_append_sheet(workbook, buildFormatSheet(block), "형식 설명");
  return workbook;
}

// XLSX.writeFile은 실행 환경을 자체 감지해 브라우저면 다운로드를,
// Node면 fs로 저장을 시도한다. 이 감지가 Node ESM(import) 하에서
// 불안정함을 노드 검증 중 직접 확인했다 — 똑같은 패키지를 require로
// 불러오면 저장되고 import로 불러오면 "cannot save file" 예외가 난다
// (SheetJS 내부 환경 감지가 CJS/ESM 인터롭 차이에 영향을 받는 것으로
// 보인다). 그래서 저장 자체는 writeFile에 위임하지 않고 저수준
// XLSX.write(...)(버퍼만 만듦, 환경 감지 없음)로 바이트를 만든 뒤 이
// 함수가 브라우저 API로 직접 다운로드를 트리거한다 — 프로덕션(Vite
// 브라우저 번들)에서는 typeof document !== 'undefined'이므로 정상
// 동작하고, 노드 검증에서는 이 분기를 타지 않아 워크북 생성 로직만
// 안정적으로 검증할 수 있다.
function triggerBrowserDownload(workbook, fileName) {
  const wbout = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  const blob = new Blob([wbout], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

// =====================================================================
// 가져오기(⑤) — 내보내기가 만든 형식의 역함수. "신뢰하지 마라"가 원칙:
// 관리자가 엑셀에서 무슨 짓을 했는지 알 수 없다. 파싱 성공 ≠ 데이터
// 정상이므로, 구조 불변식은 새로 만들지 않고 validateAdmissionDoc(를
// 감싼 validateTableBlock)에게 그대로 위임한다 — 컬럼 수 고정 variant
// 위반, groups 합 불일치, rows 길이 불일치를 전부 그 한 번의 호출이
// 잡아준다(아래 참고 — 이 파일에서 그 규칙을 다시 구현하지 않는다).
// =====================================================================

/**
 * 셀 텍스트를 kind(column의 role로 결정된 기대 형태)에 맞춰 역직렬화한다.
 * kind는 항상 role에서 나온다(텍스트 모양을 보고 추측하지 않는다) — 그래야
 * "우연히 badge 접미어와 같은 문자열을 담은 일반 텍스트 셀"을 잘못
 * badge로 오인하는 사고가 없다(역도 마찬가지: role이 badge인데 텍스트가
 * 접미어 없이 들어오면 has/none 여부는 기본값 minimumNone으로 폴백 —
 * 관리자가 표 편집기에서 직접 고칠 수 있다).
 */
export function deserializeCellFromXlsx(rawValue, kind) {
  const text =
    rawValue === null || rawValue === undefined ? "" : String(rawValue);

  if (kind === "chips") {
    if (!text) return { chips: [] };
    const lines = text.split("\n");
    const allMatch = lines.every((line) => line.includes(": "));
    if (!allMatch) {
      // 형식이 "label: value" 줄바꿈 규칙을 안 지키면(관리자가 손으로
      // 다른 걸 써넣은 경우) 데이터를 조용히 버리지 않는다 — 원문 전체를
      // 라벨 하나짜리 칩으로 보존해 표 편집기에서 눈에 띄게 하고 직접
      // 고칠 수 있게 한다.
      return { chips: [{ label: text, value: "" }] };
    }
    return {
      chips: lines.map((line) => {
        const idx = line.indexOf(": ");
        return { label: line.slice(0, idx), value: line.slice(idx + 2) };
      }),
    };
  }

  if (kind === "badge") {
    const match = text.match(BADGE_SUFFIX_RE);
    if (match) {
      return {
        text: text.slice(0, text.length - match[0].length),
        badge: match[1] === "있음" ? "minimumHas" : "minimumNone",
      };
    }
    return { text, badge: "minimumNone" };
  }

  return text;
}

// row0의 세로 병합(고정 컬럼, rowspan=2)과 가로 병합(그룹, colspan=count)
// 좌표로부터 fixedColumnCount/groups를 복원한다. count=1인 그룹은
// 내보내기가 병합을 안 넣으므로(1칸짜리 병합은 무의미) 병합이 없는
// 컬럼을 count=1 그룹으로 취급한다.
function reconstructGroupsFromMerges(merges, row0Labels, totalColumns) {
  const verticalMerges = merges.filter(
    (m) => m.s.r === 0 && m.e.r === 1 && m.s.c === m.e.c,
  );
  const fixedCols = verticalMerges.map((m) => m.s.c).sort((a, b) => a - b);
  const fixedColumnCount = fixedCols.length;
  const contiguousFromZero = fixedCols.every((c, idx) => c === idx);
  if (!contiguousFromZero) {
    return {
      error:
        "고정 컬럼(세로 병합) 구성이 0번 컬럼부터 연속되지 않습니다 — 헤더 병합 구조가 손상된 것으로 보입니다.",
    };
  }

  const horizontalSpanByStart = new Map(
    merges
      .filter((m) => m.s.r === 0 && m.e.r === 0 && m.e.c > m.s.c)
      .map((m) => [m.s.c, m.e.c]),
  );

  const groups = [];
  let c = fixedColumnCount;
  while (c < totalColumns) {
    const spanEnd = horizontalSpanByStart.get(c);
    if (spanEnd !== undefined) {
      groups.push({
        name: String(row0Labels[c] ?? ""),
        count: spanEnd - c + 1,
      });
      c = spanEnd + 1;
    } else {
      groups.push({ name: String(row0Labels[c] ?? ""), count: 1 });
      c += 1;
    }
  }

  return { fixedColumnCount, groups };
}

/**
 * TableBlock 변경 요약(행 추가/삭제 수, 셀 변경 수, 컬럼 구성 변경 여부) —
 * 가져오기 미리보기 UI가 "무엇이 바뀌는지" 보여줄 때 쓴다.
 */
export function summarizeBlockChange(oldBlock, newBlock) {
  const rowsAdded = Math.max(0, newBlock.rows.length - oldBlock.rows.length);
  const rowsRemoved = Math.max(0, oldBlock.rows.length - newBlock.rows.length);

  let cellsChanged = 0;
  const commonRows = Math.min(oldBlock.rows.length, newBlock.rows.length);
  for (let r = 0; r < commonRows; r += 1) {
    const oldRow = oldBlock.rows[r];
    const newRow = newBlock.rows[r];
    const commonCols = Math.min(oldRow.length, newRow.length);
    for (let c = 0; c < commonCols; c += 1) {
      if (JSON.stringify(oldRow[c]) !== JSON.stringify(newRow[c]))
        cellsChanged += 1;
    }
  }

  const columnsChanged =
    JSON.stringify(oldBlock.columns) !== JSON.stringify(newBlock.columns);

  return { rowsAdded, rowsRemoved, cellsChanged, columnsChanged };
}

/**
 * xlsx 워크북 → TableBlock. referenceBlock(가져오기 대상이 되는 기존
 * 블록)의 variant/columns를 구조 기준(역할·정렬)으로 삼는다 — 시트에는
 * role이 담겨 있지 않기 때문이다(라벨만 편집 가능). 컬럼 수가 바뀌면
 * 새/사라진 컬럼의 role은 defaultNewColumnRole(variant)로 채우거나
 * 버려진다.
 *
 * 구조 불변식(컬럼 수 고정 variant, groups 합, rows 길이)은 이 함수가
 * 재구현하지 않는다 — 후보 블록을 일단 만들고 validateTableBlock에
 * 그대로 맡긴다. 실패하면 후보를 버리고 ok:false + validateAdmissionDoc
 * 원본 에러 메시지를 그대로 반환한다("억지로 고쳐서 넣지 마라").
 *
 * @returns {{ ok: boolean, errors?: string[], block?: object,
 *   changeSummary?: object, unchanged?: boolean }}
 */
export function importTableBlockFromXlsx(workbook, referenceBlock, section) {
  const worksheet = workbook.Sheets?.표;
  if (!worksheet) {
    return {
      ok: false,
      errors: [
        '"표" 시트를 찾을 수 없습니다 — 이 편집기로 내보낸 xlsx 파일이 맞는지 확인하세요.',
      ],
    };
  }

  // defval을 주지 않는다 — 그러면 SheetJS가 시트 전체에서 가장 넓은 행에
  // 맞춰 모든 행(헤더 포함)을 그 폭으로 강제 패딩해버려서, "이 행이
  // 실제로 몇 칸을 채웠는지"(행 길이 초과 판정에 필수)를 알 수 없게
  // 된다. defval 없이 읽으면 각 행 배열의 길이가 그 행이 실제로 채운
  // 마지막 칸까지만 반영된다(직접 재현 확인함).
  const grid = XLSX.utils
    .sheet_to_json(worksheet, { header: 1 })
    .map((row) =>
      row.map((cell) =>
        cell === undefined || cell === null ? "" : String(cell),
      ),
    );

  const hasGroups = Boolean(referenceBlock.groups);
  const headerRowCount = hasGroups ? 2 : 1;
  const headerRows = grid.slice(0, headerRowCount);
  // 헤더 이후 완전히 빈 행(엑셀 트레일링 공백 등)은 제외한다 — 의도적으로
  // 넣은 빈 행과 구분할 방법이 없어, "전부 빈 칸"만 제외 대상으로 삼는다.
  const bodyRowsRaw = grid
    .slice(headerRowCount)
    .filter((row) => row.some((cell) => cell !== ""));

  if (
    headerRows.length < headerRowCount ||
    headerRows.some((row) => row.length === 0)
  ) {
    return {
      ok: false,
      errors: ["헤더 행을 읽을 수 없습니다 — 시트 구조가 예상과 다릅니다."],
    };
  }

  let columns;
  let groups;
  let fixedColumnCount;

  if (hasGroups) {
    const merges = worksheet["!merges"] || [];
    const totalColumns = Math.max(
      headerRows[0].length,
      headerRows[1]?.length || 0,
    );
    const reconstructed = reconstructGroupsFromMerges(
      merges,
      headerRows[0],
      totalColumns,
    );
    if (reconstructed.error) {
      return { ok: false, errors: [reconstructed.error] };
    }
    ({ fixedColumnCount, groups } = reconstructed);

    columns = [];
    for (let c = 0; c < fixedColumnCount; c += 1) {
      columns.push({
        role:
          referenceBlock.columns[c]?.role ??
          defaultNewColumnRole(referenceBlock.variant),
        label: String(headerRows[0][c] ?? ""),
      });
    }
    for (let c = fixedColumnCount; c < totalColumns; c += 1) {
      columns.push({
        role:
          referenceBlock.columns[c]?.role ??
          defaultNewColumnRole(referenceBlock.variant),
        label: String(headerRows[1][c] ?? ""),
      });
    }
  } else {
    columns = headerRows[0].map((label, idx) => {
      const refCol = referenceBlock.columns[idx];
      return {
        role: refCol?.role ?? defaultNewColumnRole(referenceBlock.variant),
        label: String(label ?? ""),
        ...(refCol?.align ? { align: refCol.align } : {}),
      };
    });
  }

  const targetColumnCount = columns.length;
  const rows = bodyRowsRaw.map((row) => {
    // 짧은 행은 빈 셀로 채운다. 긴 행은 여기서 자르지 않는다 — 그대로
    // candidate에 실어 validateTableBlock의 rows.length===columns.length
    // 불변식이 거부하게 한다("길면 거부"를 이 파일에서 재구현하지 않고
    // 기존 검증기에 위임).
    const padded =
      row.length < targetColumnCount
        ? [...row, ...new Array(targetColumnCount - row.length).fill("")]
        : row;
    return padded.map((cell, colIdx) =>
      deserializeCellFromXlsx(
        cell,
        getCellKind(referenceBlock.variant, columns[colIdx]?.role),
      ),
    );
  });

  const candidate = {
    ...referenceBlock,
    columns,
    rows,
    ...(hasGroups ? { groups, fixedColumnCount } : {}),
  };

  const validation = validateTableBlock(section, candidate);
  if (!validation.ok) {
    return { ok: false, errors: validation.errors };
  }

  return {
    ok: true,
    block: candidate,
    changeSummary: summarizeBlockChange(referenceBlock, candidate),
    unchanged: blocksEqual(section, referenceBlock, candidate),
  };
}
