// =====================================================================
// 대학명 → official_source_url 배선 검증 스크립트
//
// 무엇을 지키나
// -------------
// 사용자 요청(2026-08-10): "official_source_url을 '대학이름'을 클릭했을 때
// 나오는 링크로. 어드민에서는 '다이얼로그'가 나와 수정할 수 있게."
//
// 이 축은 기존 게이트 11종이 **한 곳도** 보지 않는다:
//   - modal-shell 은 AdmissionGuidelines.jsx 를 읽지만 `{selectedInfo ? (`
//     ~ `) : null}` 모달 슬라이스만 본다. 목록 표의 이름 셀은 그 밖이다.
//   - admin-entry 는 Admin.jsx 를 읽지만 admissionSection 셀 / 관리 열 /
//     AdmissionGroupField / fields 선언만 본다.
//   - 나머지 9종은 문서 블록 렌더·바이트 계약만 본다.
// 즉 대학명 링크는 **조용히 죽을 수 있는** 기능이다. 이 파일이 그 구멍이다.
//
// 특히 이 기능의 최대 위험은 "코드는 완성인데 화면에서 아무 일도 안 일어남"
// 이다: 목록이 읽는 경량 뷰(admission_university_resource_index)에
// official_source_url 컬럼이 없으면 row.official_source_url 이 undefined 라
// 전 대학이 평문으로 렌더된다. 콘솔 에러도, 게이트 실패도, 리뷰 신호도 없다.
// 그래서 link:* 렌더 단언과 별개로 sql:view-column 이 SQL 파일의 존재와
// append-only 규율을 기계 검증한다.
//
// 어떻게 보나 — 소스 스캔이 아니라 **실제 슬라이스 SSR**
// -------------------------------------------------------
// verify-admission-admin-entry.mjs / verify-admission-modal-shell.mjs 와
// 같은 기법이다: 소스에서 대상 함수·분기만 기계적으로 잘라내 하네스로 감싸고
// renderToStaticMarkup 한다. 슬라이스는 매 실행마다 현재 소스에서 다시 뜨므로
// 이 스크립트는 사본이 아니라 실제 페이지 파일을 검사한다.
// 앵커가 깨지면 **조용히 통과하지 않고 throw** 한다.
//
// 슬라이스 규칙 (리팩터 후에도 유지할 것)
// ---------------------------------------
//   src/pages/AdmissionGuidelines.jsx 에
//     function externalUrl(value) {              … 1개
//     function UniversityResourceRow(            … 1개, 다음 최상위
//                                                  function UniversityResourceTable( 로 끝남
//   src/pages/Admin.jsx 에
//     column.type === 'universityNameMeta' && onOpenMetaEdit ? (   … 1개
//     그 분기는 `) : column.type === 'image' ? (` 로 끝나야 한다
//     (= 셀 삼항 체인의 **최상단**. admissionSection ~ fileList 앵커 사이에
//      끼우면 admin-entry 쪽 슬라이스가 ReferenceError 로 죽는다.)
//
// 항목 번호 배분
//   link:1~7    공개 목록 이름 셀 렌더                (슬라이스 SSR)
//   rel:8       외부 링크 rel 보안 속성               (소스 락)
//   admin:9~11  어드민 대학명 셀 → 다이얼로그 진입     (슬라이스 SSR + 클릭)
//   sql:12      목록 뷰 컬럼 계약                     (SQL 파일 파싱)
//   meta:13     메타 다이얼로그 URL 2종 라벨          (모듈 SSR)
//
// 실행: node scripts/verify-admission-university-link.mjs
// 제약: npm install 금지, jsdom 없음. esbuild(transform) + react-dom/server 만.
// =====================================================================

import fs from "node:fs";
import path from "node:path";
import * as esbuild from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const REPO_ROOT = path.resolve(new URL(".", import.meta.url).pathname, "..");
const PUBLIC_REL = "src/pages/AdmissionGuidelines.jsx";
const ADMIN_REL = "src/pages/Admin.jsx";
const META_MODAL_REL =
  "src/components/admission/editor/AdmissionMetaEditModal.jsx";
const VIEW_SQL_GLOB_SUFFIX = "_admission_resource_index_official_url.sql";
const BASE_VIEW_SQL = "sql/48_admission_resource_index_json_flags.sql";

const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), "utf8");

const results = [];
function record(id, name, pass, detail) {
  results.push({ id, name, pass: Boolean(pass), detail });
}

// ── 공통: JSX 하네스를 임시 모듈로 굽는다 ────────────────────────────
async function bakeHarness(harness, tag) {
  const out = await esbuild.transform(harness, {
    loader: "jsx",
    jsx: "automatic",
    jsxImportSource: "react",
    format: "esm",
  });
  const tmpFile = path.join(
    REPO_ROOT,
    `.tmp-univ-link-${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`,
  );
  fs.writeFileSync(tmpFile, out.code);
  try {
    const mod = await import(`file://${tmpFile}`);
    return mod.default;
  } finally {
    fs.rmSync(tmpFile, { force: true });
  }
}

// 실제 .jsx 모듈을 번들해 import (verify-admission-admin-entry.mjs 와 동일).
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
      "lucide-react",
    ],
    write: false,
  });
  const tmpFile = path.join(
    REPO_ROOT,
    `.tmp-univ-link-module-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`,
  );
  fs.writeFileSync(tmpFile, result.outputFiles[0].text);
  try {
    const mod = await import(`file://${tmpFile}`);
    return exportName ? mod[exportName] : mod.default;
  } finally {
    fs.rmSync(tmpFile, { force: true });
  }
}

// 소스에서 `start` 로 시작해 `end` 직전까지를 잘라낸다. start 는 정확히 1개여야 한다.
function sliceExactlyOnce(source, start, end, what) {
  const idx = source.indexOf(start);
  if (idx === -1 || source.indexOf(start, idx + 1) !== -1) {
    throw new Error(
      `${what} 슬라이스 시작 앵커가 정확히 1개가 아니다: ${JSON.stringify(start)}\n` +
        '리팩터로 앵커가 사라졌다면 이 스크립트 상단의 "슬라이스 규칙"을 읽고 복원하라.',
    );
  }
  const endIdx = source.indexOf(end, idx + start.length);
  if (endIdx === -1) {
    throw new Error(
      `${what} 슬라이스 종료 앵커를 찾지 못했다: ${JSON.stringify(end)}`,
    );
  }
  return source.slice(idx, endIdx);
}

// ── 공개: UniversityResourceRow 하네스 ───────────────────────────────
//
// 이름 셀만 관심사다. 나머지(InfoButton/LinkButton/섹션 상수)는 식별 가능한
// 스텁으로 갈아끼운다 — 이 검사는 "대학명이 링크가 되는가"를 보지, 셀 버튼
// 내부를 보지 않는다. externalUrl 은 **검사 대상 본인**이라 실제 소스를 쓴다.
async function loadResourceRow() {
  const src = read(PUBLIC_REL);
  const externalUrlFn = sliceExactlyOnce(
    src,
    "function externalUrl(value) {",
    "\nfunction ",
    "externalUrl",
  );
  const rowFn = sliceExactlyOnce(
    src,
    "function UniversityResourceRow({ university, row, onOpenInfo }) {",
    "\nfunction UniversityResourceTable(",
    "UniversityResourceRow",
  );
  const harness = `
import React from 'react';
const INFO_SECTIONS = [{ key: 'selection_method', label: '전형방법' }];
const CATEGORY_INFO_SECTIONS = [{ key: 'selection_method', label: '입학자료' }];
const LINK_SECTIONS = [{ label: '정시모집요강', keys: ['jungsi_guideline_url'] }];
function InfoButton() { return <span data-stub="info" />; }
function LinkButton() { return <span data-stub="link" />; }
function requestUniversityInfo() {}
${externalUrlFn}
${rowFn}
export default function RowHarness(props) {
  return <table><tbody><UniversityResourceRow {...props} /></tbody></table>;
}
`;
  return bakeHarness(harness, "row");
}

// ── 어드민: 목록 셀 <td> 통째 하네스 ─────────────────────────────────
//
// **분기만** 잘라내면 안 된다. AdminTable 의 이 <td> 는 36개 config 가
// 공유하는 단일 셀이고, 진짜 위험은 "우리 분기가 잘못 발동하는 것"보다
// "이 셀에 무언가를 덧붙여 나머지 35개 메뉴가 같이 바뀌는 것"이다.
// 분기만 슬라이스하면 그 오염이 슬라이스 밖에 생겨 검사를 통과해버린다
// (실제로 뮤테이션 테스트에서 이 구멍이 잡혀 슬라이스를 넓혔다).
// 그래서 셀 전체를 잘라 "평범한 컬럼은 formatValue 결과만 낸다"까지 못박는다.
async function loadNameCell() {
  const src = read(ADMIN_REL);
  const cell = sliceExactlyOnce(
    src,
    '<td key={column.key} className="px-3 py-3">',
    "</td>",
    "어드민 목록 셀",
  );
  const formatValueFn = sliceExactlyOnce(
    src,
    "function formatValue(value, type, options) {",
    "\nfunction searchable(",
    "formatValue",
  );
  // 셀이 참조하는 나머지 자유 변수는 식별 가능한 스텁으로 갈아끼운다 —
  // 이 검사의 관심사는 대학명 셀과 "평범한 셀의 순수함"이지 이미지/파일
  // 목록 렌더가 아니다. formatValue 만 실제 소스를 쓴다(폴백 경로 본인).
  const harness = `
import React from 'react';
${formatValueFn}
const fileNameFromUrl = () => 'stub-file';
const normalizeArray = (v) => (Array.isArray(v) ? v : []);
const formatListValue = () => 'stub-list';
const truncateText = () => 'stub-truncate';
export default function CellHarness({
  column, row, index, sectionSummaries, onOpenMetaEdit, onEdit, onOpenSection
}) {
  return (
    <table><tbody><tr>
      ${cell}</td>
    </tr></tbody></table>
  );
}
`;
  return bakeHarness(harness, "cell");
}

// React 엘리먼트 트리에서 조건에 맞는 첫 노드를 찾는다(클릭 재현용).
function findNode(node, predicate) {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = findNode(child, predicate);
      if (hit) return hit;
    }
    return null;
  }
  if (predicate(node)) return node;
  return findNode(node.props?.children, predicate);
}

// ── SQL: 뷰 select 항목을 최상위 콤마로 분해 ─────────────────────────
function selectItems(sqlText, whatFile) {
  const stripped = sqlText
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n");
  const m = stripped.match(
    /create or replace view[\s\S]*?\bas\s*select\b([\s\S]*?)\bfrom\s+public\.admission_university_resources/i,
  );
  if (!m)
    throw new Error(
      `${whatFile}: create or replace view … select … from 구간을 파싱하지 못했다.`,
    );
  const items = [];
  let depth = 0;
  let cur = "";
  for (const ch of m[1]) {
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (ch === "," && depth === 0) {
      items.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) items.push(cur);
  return items.map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
}

async function main() {
  const publicSrc = read(PUBLIC_REL);
  const RowHarness = await loadResourceRow();
  const university = { name: "가톨릭관동대학교", region: "강원" };
  const renderRow = (row) =>
    renderToStaticMarkup(
      React.createElement(RowHarness, {
        university,
        row,
        onOpenInfo: () => {},
      }),
    );

  // 이름 셀의 <a> 만 센다(스텁 버튼은 <span> 이라 섞이지 않는다).
  const nameAnchors = (html) =>
    html.match(/<a\b[^>]*admission-directory-name-link[^>]*>/g) || [];

  // ── link:1 — https URL 이면 <a href> 로 승격 ────────────────────────
  {
    const html = renderRow({ official_source_url: "https://ex.ac.kr/adm" });
    const anchors = nameAnchors(html);
    const pass =
      anchors.length === 1 &&
      anchors[0].includes('href="https://ex.ac.kr/adm"') &&
      html.includes("가톨릭관동대학교");
    record(
      "link:1",
      'official_source_url 이 https URL 이면 대학명이 <a href="(그 URL)"> 정확히 1개로 렌더된다',
      pass,
      JSON.stringify({ anchors, hasName: html.includes("가톨릭관동대학교") }),
    );
  }

  // ── link:2 — target/rel 보안 속성 ───────────────────────────────────
  {
    const html = renderRow({ official_source_url: "https://ex.ac.kr/adm" });
    const tag = nameAnchors(html)[0] || "";
    const rel = (tag.match(/rel="([^"]*)"/) || [])[1] || "";
    const pass =
      tag.includes('target="_blank"') &&
      rel.includes("noopener") &&
      rel.includes("noreferrer");
    record(
      "link:2",
      '대학명 링크는 target="_blank" 이고 rel 에 noopener·noreferrer 를 **둘 다** 갖는다(탭 나빙·리퍼러 유출 차단)',
      pass,
      JSON.stringify({ tag, rel }),
    );
  }

  // ── link:3 — URL 없음 → 평문 ────────────────────────────────────────
  {
    const html = renderRow({ detail_status: "normal" });
    const pass =
      nameAnchors(html).length === 0 && html.includes("가톨릭관동대학교");
    record(
      "link:3",
      "official_source_url 이 없으면 <a> 를 만들지 않고 대학명을 평문으로 렌더한다(빈 링크 금지)",
      pass,
      JSON.stringify({
        anchors: nameAnchors(html),
        hasName: html.includes("가톨릭관동대학교"),
      }),
    );
  }

  // ── link:4 — row=null(미매칭 대학) ──────────────────────────────────
  {
    let threw = null;
    let html = "";
    try {
      html = renderRow(null);
    } catch (err) {
      threw = String(err?.message);
    }
    const pass =
      threw === null &&
      nameAnchors(html).length === 0 &&
      html.includes("가톨릭관동대학교");
    record(
      "link:4",
      "row 가 null 인 미매칭 대학(교대·예종 등)도 throw 없이 평문으로 렌더된다",
      pass,
      JSON.stringify({ threw, anchors: nameAnchors(html) }),
    );
  }

  // ── link:5 — 자리표시자 '-' (해군사관학교) ──────────────────────────
  //
  // 회귀 방지의 핵심. <a href="-"> 는 **상대경로**라 클릭 시 SPA 라우트가
  // 엉뚱한 곳으로 튄다(외부 이동도 에러도 아니어서 조용히 깨진다).
  {
    const dashHtml = renderRow({ official_source_url: "-" });
    const relHtml = renderRow({ official_source_url: "/admission/foo" });
    const spaceHtml = renderRow({ official_source_url: "   " });
    const pass =
      nameAnchors(dashHtml).length === 0 &&
      nameAnchors(relHtml).length === 0 &&
      nameAnchors(spaceHtml).length === 0 &&
      !dashHtml.includes('href="-"');
    record(
      "link:5",
      "자리표시자 '-' · 상대경로 · 공백만 있는 값은 링크로 승격되지 않는다(href=\"-\" 회귀 방지)",
      pass,
      JSON.stringify({
        dash: nameAnchors(dashHtml).length,
        relative: nameAnchors(relHtml).length,
        space: nameAnchors(spaceHtml).length,
      }),
    );
  }

  // ── link:6 — 특수대학(detail_status='category') 동일 동작 ───────────
  {
    const catHtml = renderRow({
      detail_status: "category",
      official_source_url: "https://kps.ac.kr",
    });
    const normalHtml = renderRow({
      detail_status: "normal",
      official_source_url: "https://kps.ac.kr",
    });
    const catAnchor = nameAnchors(catHtml)[0] || "";
    const normalAnchor = nameAnchors(normalHtml)[0] || "";
    const pass = catAnchor !== "" && catAnchor === normalAnchor;
    record(
      "link:6",
      "특수대학(detail_status='category', 경찰대/과기원/사관학교 11개교)의 이름 링크가 일반 대학과 **문자 그대로 동일**하게 렌더된다",
      pass,
      JSON.stringify({ catAnchor, normalAnchor }),
    );
  }

  // ── link:7 — 죽은 href 부재 ─────────────────────────────────────────
  {
    const combined = [
      renderRow({ official_source_url: "https://ex.ac.kr/adm" }),
      renderRow({ official_source_url: "-" }),
      renderRow(null),
      renderRow({}),
    ].join("");
    const pass =
      !combined.includes('href="#"') && !combined.includes('href=""');
    record(
      "link:7",
      '어떤 입력에서도 href="#" / href="" 같은 죽은 링크를 만들지 않는다',
      pass,
      JSON.stringify({
        hash: combined.includes('href="#"'),
        empty: combined.includes('href=""'),
      }),
    );
  }

  // ── rel:8 — 소스 락: 모든 외부 링크의 rel ───────────────────────────
  //
  // 렌더 단언(link:2)은 이름 링크 하나만 본다. 같은 화면의 '정시모집요강'
  // 버튼도 새 탭을 여는 외부 링크라 같은 보안 속성을 가져야 한다 — 한쪽만
  // 지키면 표 안에서 동작이 갈린다.
  {
    const offenders = [];
    const needle = 'target="_blank"';
    let from = 0;
    let count = 0;
    for (;;) {
      const at = publicSrc.indexOf(needle, from);
      if (at === -1) break;
      count += 1;
      const window = publicSrc.slice(Math.max(0, at - 300), at + 300);
      const rel = (window.match(/rel="([^"]*)"/) || [])[1] || "";
      if (!rel.includes("noopener") || !rel.includes("noreferrer")) {
        offenders.push({ at, rel });
      }
      from = at + needle.length;
    }
    const pass = count >= 2 && offenders.length === 0;
    record(
      "rel:8",
      `${PUBLIC_REL} 의 모든 target="_blank" 링크가 rel 에 noopener·noreferrer 를 갖는다(대학명 링크 + 정시모집요강 버튼)`,
      pass,
      JSON.stringify({ blankCount: count, offenders }),
    );
  }

  // ── admin:9 — 대학명 셀이 <button> 으로 렌더 ────────────────────────
  const NameCell = await loadNameCell();
  const renderCell = (column, onOpenMetaEdit) =>
    React.createElement(NameCell, {
      column,
      row: { id: "fixture", university_name: "가톨릭관동대학교" },
      index: 0,
      sectionSummaries: null,
      onOpenMetaEdit,
      onEdit: () => {},
      onOpenSection: () => {},
    });
  {
    const html = renderToStaticMarkup(
      renderCell(
        { key: "university_name", type: "universityNameMeta" },
        () => {},
      ),
    );
    const buttons = html.match(/<button\b/g) || [];
    const pass = buttons.length === 1 && html.includes("가톨릭관동대학교");
    record(
      "admin:9",
      "column.type='universityNameMeta' 이고 onOpenMetaEdit 가 있으면 대학명이 <button> 1개로 렌더된다",
      pass,
      JSON.stringify({ buttons: buttons.length, html: html.slice(0, 200) }),
    );
  }

  // ── admin:10 — 클릭하면 onOpenMetaEdit(row) 가 정확히 1회 ───────────
  {
    const metaClicks = [];
    const editClicks = [];
    const element = React.createElement(NameCell, {
      column: { key: "university_name", type: "universityNameMeta" },
      row: { id: "fixture", university_name: "가톨릭관동대학교" },
      onOpenMetaEdit: (...a) => metaClicks.push(a),
      onEdit: (...a) => editClicks.push(a),
    });
    const button = findNode(
      element.type(element.props),
      (n) => n.type === "button",
    );
    button?.props?.onClick?.();
    const pass =
      Boolean(button) &&
      metaClicks.length === 1 &&
      metaClicks[0][0].id === "fixture" &&
      editClicks.length === 0;
    record(
      "admin:10",
      "그 버튼을 클릭하면 onOpenMetaEdit 가 해당 row 로 정확히 1회 호출되고, onEdit(행 전체 폼)은 호출되지 않는다",
      pass,
      JSON.stringify({
        hasButton: Boolean(button),
        metaClicks: metaClicks.length,
        editClicks: editClicks.length,
      }),
    );
  }

  // ── admin:11 — 공유 셀 무오염(나머지 35개 메뉴) ─────────────────────
  //
  // AdminTable 의 이 <td> 는 36개 config 가 공유한다. 평범한 컬럼(타입 없음)의
  // 셀은 formatValue 결과 **그것만** 이어야 한다 — 버튼이든 아이콘이든 무엇을
  // 덧붙이면 대학모집요강과 무관한 35개 메뉴의 목록이 전부 바뀐다.
  // 부분 문자열이 아니라 **완전 일치**로 못박는다(덧붙임을 전부 잡기 위해).
  {
    const WRAP = (inner) =>
      `<table><tbody><tr><td class="px-3 py-3">${inner}</td></tr></tbody></table>`;
    const plain = renderToStaticMarkup(
      React.createElement(NameCell, {
        column: { key: "title" },
        row: { id: "fixture", title: "평범한 제목" },
        index: 0,
        sectionSummaries: null,
        onOpenMetaEdit: () => {},
        onEdit: () => {},
        onOpenSection: () => {},
      }),
    );
    const noHandler = renderToStaticMarkup(
      renderCell(
        { key: "university_name", type: "universityNameMeta" },
        undefined,
      ),
    );
    const plainExact = plain === WRAP("평범한 제목");
    const noHandlerExact = noHandler === WRAP("가톨릭관동대학교");
    const pass = plainExact && noHandlerExact;
    record(
      "admin:11",
      "공유 셀 무오염 — 타입 없는 평범한 컬럼(35개 메뉴)의 셀은 formatValue 결과만 렌더하고, onOpenMetaEdit 가 없으면 대학명도 평문이다(완전 일치)",
      pass,
      JSON.stringify({ plainExact, noHandlerExact, plain, noHandler }),
    );
  }

  // ── sql:12 — 목록 뷰 컬럼 계약 ──────────────────────────────────────
  //
  // 이 기능의 최대 위험(뷰에 컬럼이 없으면 조용히 전멸)을 기계로 막는다.
  {
    const sqlDir = path.join(REPO_ROOT, "sql");
    const matches = fs
      .readdirSync(sqlDir)
      .filter((f) => f.endsWith(VIEW_SQL_GLOB_SUFFIX));
    let pass = false;
    let detail;
    if (matches.length !== 1) {
      detail = JSON.stringify({
        matches,
        expected: `sql/<번호>${VIEW_SQL_GLOB_SUFFIX} 1개`,
      });
    } else {
      const newSql = fs.readFileSync(path.join(sqlDir, matches[0]), "utf8");
      const baseItems = selectItems(read(BASE_VIEW_SQL), BASE_VIEW_SQL);
      const newItems = selectItems(newSql, matches[0]);
      // append-only: 기존 정의가 새 정의의 접두사로 **그대로** 보존돼야 한다.
      // (컬럼 삭제/이름변경/타입변경/순서변경은 create or replace view 에서
      //  42P16 으로 거부된다 — 배포 시점에 터지느니 여기서 잡는다.)
      const prefixOk = baseItems.every((v, i) => newItems[i] === v);
      const appended = newItems.slice(baseItems.length);
      const hasGrant =
        /grant\s+select\s+on\s+public\.admission_university_resource_index\s+to\s+anon,\s*authenticated/i.test(
          newSql,
        );
      pass =
        prefixOk &&
        appended.length === 1 &&
        appended[0] === "official_source_url" &&
        hasGrant;
      detail = JSON.stringify({
        file: matches[0],
        prefixOk,
        appended,
        hasGrant,
        baseCount: baseItems.length,
      });
    }
    record(
      "sql:12",
      "목록 뷰 SQL 이 존재하고, 48번 select 컬럼 전부를 접두사로 보존한 채 official_source_url 1개만 맨 뒤에 추가하며, grant 를 재부여한다",
      pass,
      detail,
    );
  }

  // ── meta:13 — 메타 다이얼로그에 URL 2종이 서로 다른 라벨로 존재 ─────
  {
    const AdmissionMetaEditModal = await loadModule(META_MODAL_REL);
    const row = {
      id: "fixture",
      university_name: "가톨릭관동대학교",
      official_source_url: "https://ex.ac.kr/adm",
      jungsi_guideline_url: "https://ex.ac.kr/jungsi",
      is_active: true,
    };
    const html = renderToStaticMarkup(
      React.createElement(AdmissionMetaEditModal, {
        row,
        onClose: () => {},
        onSave: async () => true,
      }),
    );
    const hasOfficial = html.includes("대학명 링크 URL");
    const hasJungsi = html.includes("정시모집요강 URL");
    // 값이 실제로 폼에 실려야 한다 — 라벨만 있고 값이 안 붙으면 수정할 수 없다.
    const hasValue = html.includes("https://ex.ac.kr/adm");
    const pass = hasOfficial && hasJungsi && hasValue;
    record(
      "meta:13",
      '메타 수정 다이얼로그에 "대학명 링크 URL"·"정시모집요강 URL" 두 라벨이 모두 있고(서로 다른 컬럼), 기존 official_source_url 값이 입력칸에 실려 나온다',
      pass,
      JSON.stringify({ hasOfficial, hasJungsi, hasValue }),
    );
  }

  // ── 출력 ────────────────────────────────────────────────────────────
  console.log("=== 대학명 → official_source_url 배선 검증 결과 ===\n");
  let failCount = 0;
  for (const r of results) {
    console.log(`[${r.pass ? "PASS" : "FAIL"}] ${r.id}. ${r.name}`);
    if (!r.pass) {
      failCount += 1;
      console.log("  detail:", r.detail);
    }
  }
  console.log(
    `\n총 ${results.length}건 중 ${results.length - failCount}건 통과, ${failCount}건 실패.`,
  );
  if (failCount > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
