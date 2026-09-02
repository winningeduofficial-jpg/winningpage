// =====================================================================
// 대입모집요강 구조화 전환 — 골든 대조 검증 스크립트 (Gate A)
//
// scripts/verify-admission-html-snapshot.mjs 후계자. 폐기 사유(실행 확인):
//   - 이미 RED — 1253셀 중 853셀 일치(68.08%), 400 mismatch, exit 1.
//   - 기준점이 REFACTOR_COMMIT='8fc8fc3' + git show + `export default
//     function` 위치 정규식(:31-33, 71-115)이라 rebase/squash에 취약하다.
//   - 신규 export를 `missing`으로 warn만 하고 조용히 제외(:98-106) —
//     실행 시 실제로 replaceKnownPuaChars, splitHwpTextIntoSections,
//     buildHwpCategoryHtml 3개가 제외되고 있었다.
//
// 이 스크립트는 git 히스토리에 의존하지 않는다. 커밋된
// tests/fixtures/admission-html-golden.json(셀별 sha256 해시 골든)만
// 읽는다. 전문 diff는 선택적으로 .golden-cache/admission-html-golden.full.json
// (로컬 전용, gitignore)을 참조하지만, 없어도 게이트 판정(해시 비교)
// 자체는 동일하게 동작한다 — 캐시는 디버깅 편의 경로일 뿐이다.
//
// Gate A (해시, 허용 diff 0): 현재 코드(buildRawSectionHtml/
// buildHwpCategoryHtml/buildRecruitmentResultHtml)가 만드는 HTML의
// sha256이 골든과 바이트 단위로 일치하는지.
//
// Gate A2 (해시, 허용 diff 0): doc 파이프라인 도입 후 추가. renderDocToHtml
// (buildRawSectionDoc(raw, key, row, name))와 renderDocToHtml
// (buildHwpCategoryDoc(key, raw, row, name))이 골든의 rawSectionHtml/
// hwpCategoryHtml 셀과 바이트 단위로 일치하는지. recruitmentResultHtml
// (buildRecruitmentResultHtml의 wrap 없는 원시 출력)은 renderDocToHtml의
// 계약 밖이라(항상 heading wrap을 포함) Gate A2 비교 대상이 아니다 —
// 그 경로는 Gate A가 이미 커버한다.
//
// Gate B (구조, 허용 diff 2): renderToStaticMarkup(<AdmissionSectionView
// doc sectionKey surface="public" />) vs renderDocToHtml(doc, sectionKey)의
// 정규화 DOM 비교(공백 정규화, class는 토큰 집합 비교라 순서 무관, 태그·
// 속성명은 대소문자 무관). 코퍼스는 Gate A2와 동일(번들 218개교 ×
// 6카테고리, rawSectionHtml + hwpCategoryHtml 양쪽 경로).
// 허용 diff 2종(HTML 미러만 내는 빈 admission-result-note /
// admission-recruit-legend — React는 SECTION_NOTES가 항상 ''이므로 아예
// 렌더하지 않는다)은 비교 전에 양쪽 트리에서 동일하게 제거한다.
// KeyValueBlock은 양쪽 다 생산자가 0(파서도 doc 생성기도 만들지 않음)이라
// 코퍼스에 등장하지 않는다 — "정답이 없는" 케이스라 명시적으로 비교
// 대상에서 제외한다(조용히 빼지 않고 실행 시 로그로 남긴다).
//
// JSX를 노드에서 로드하는 방법은 AdmissionSectionView.test.tsx(옛
// scripts/verify-admission-block-render.mjs, safehtml 작성)가 이미 검증했다 — esbuild.build() 번들 모드로
// AdmissionSectionView.jsx를 엔트리포인트 삼아 react/react-dom을
// external 유지한 채 번들하고, 임시 파일에 써서 동적 import한다. 이
// 스크립트는 같은 esbuild 옵션·globalThis.DOMParser 셔임 접근을 그대로
// 재사용한다(그 스크립트 파일 자체는 수정하지 않는다 — src/components/
// 담당자 영역이라 결과물만 재사용).
//
// 전문 캐시가 없을 때(mismatch 디버깅용, 게이트 판정에는 불필요) 재구성:
//   git worktree add ../wp-golden-base <골든이 그린이던 커밋 SHA>
//   cd ../wp-golden-base && node scripts/build-admission-html-golden.mjs
// (또는 현재 워크트리에서 파서를 그 커밋으로 임시 되돌려 스크립트를
// 실행한 뒤 결과만 챙기고 원복해도 된다.)
//
// 사용법:
//   node scripts/verify-admission-doc-equivalence.mjs
//
// 종료 코드: mismatch가 하나라도 있으면 1, 전부 일치하면 0.
// =====================================================================

import fs from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as esbuild from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import admissionHwpSections from "../src/data/admissionHwpSections.json" with {
  type: "json",
};
import {
  buildHwpCategoryDoc,
  buildRawSectionDoc,
  clean,
  HWP_SECTION_HTML_KEYS,
  renderDocToHtml,
} from "../src/lib/admissionParsing.js";
import golden from "../tests/fixtures/admission-html-golden.json" with {
  type: "json",
};
import {
  buildCellKey,
  buildGolden,
  buildHashGolden,
  hashString,
} from "./build-admission-html-golden.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const FULL_CACHE_PATH = path.join(
  REPO_ROOT,
  ".golden-cache/admission-html-golden.full.json",
);
const MAX_DIFF_SAMPLES = 5;
const DIFF_CONTEXT = 200;

// 공허한 통과 차단: 이번 실행에서 실측된 골든 총 셀 수(2757, commit
// 16fa3c0 기준 tests/fixtures/admission-html-golden.json의 meta.cellCount)의
// 90%로 하드코딩한다. 2757 * 0.9 = 2481.3 → 2481. 골든 코퍼스나 경로 구성이
// 바뀌어 total이 이 아래로 떨어지면(예: import 실패로 대부분의 셀이
// 조용히 스킵되는 회귀) 그 자체를 실패로 간주한다.
const MIN_COMPARED_CELLS = 2481;

async function loadFullCacheIfPresent() {
  try {
    const raw = await readFile(FULL_CACHE_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// 삽입/삭제(길이 변화)가 섞이면 "뒤쪽 공통 접미사"를 찾으려는 순진한
// 접근이 오프셋 한 칸 밀림으로 끝까지 전부 다르다고 보고하므로, 앞쪽
// 공통 접두사가 갈리는 지점 기준 고정 폭 윈도우만 보여준다(정확한 diff가
// 아니라 "어디가 왜 깨졌는지 눈으로 확인"하는 용도로 충분하다).
function diffSnippet(before, after, context = DIFF_CONTEXT) {
  const a = String(before || "");
  const b = String(after || "");
  let start = 0;
  const minLen = Math.min(a.length, b.length);
  while (start < minLen && a[start] === b[start]) start += 1;

  const windowStart = Math.max(start - context, 0);
  return {
    before: a.slice(windowStart, start + context),
    after: b.slice(windowStart, start + context),
  };
}

export async function runDocEquivalenceVerification({ verbose = true } = {}) {
  const currentFullGolden = buildGolden();
  const currentHashGolden = buildHashGolden(currentFullGolden);

  const goldenKeys = Object.keys(golden.cells);
  const total = goldenKeys.length;
  const mismatches = [];

  goldenKeys.forEach((key) => {
    const expected = golden.cells[key];
    const actual = currentHashGolden.cells[key];

    if (!actual) {
      mismatches.push({
        key,
        reason:
          "현재 코드가 이 셀을 더 이상 생성하지 않음(빈 문자열로 바뀌었거나 경로가 사라짐)",
        expectedBytes: expected.bytes,
        actualBytes: null,
      });
      return;
    }

    if (actual.sha256 !== expected.sha256) {
      mismatches.push({
        key,
        reason: "해시 불일치",
        expectedBytes: expected.bytes,
        actualBytes: actual.bytes,
      });
    }
  });

  const newKeys = Object.keys(currentHashGolden.cells).filter(
    (key) => !(key in golden.cells),
  );

  const matched = total - mismatches.length;
  const matchRate = total ? (matched / total) * 100 : 100;

  if (total < MIN_COMPARED_CELLS) {
    throw new Error(
      `공허한 통과 방지: 비교 대상 셀 수(${total})가 하한(${MIN_COMPARED_CELLS})보다 적습니다. ` +
        "tests/fixtures/admission-html-golden.json 로딩이 실패했거나 골든 코퍼스가 축소된 것은 아닌지 확인하세요.",
    );
  }

  if (verbose) {
    console.log(
      `[doc-equivalence] Gate A: 골든 셀 ${total}개 중 ${matched}개 해시 일치 (${matchRate.toFixed(2)}%)`,
    );
    if (newKeys.length) {
      console.log(
        `[doc-equivalence] 참고: 골든에 없는 신규 셀 ${newKeys.length}개(코드가 새 출력을 만들기 시작함 — 골든 갱신 필요할 수 있음)`,
      );
    }

    if (mismatches.length) {
      console.error(`[doc-equivalence] 불일치 ${mismatches.length}건:`);
      const fullCache = await loadFullCacheIfPresent();
      let shown = 0;

      for (const m of mismatches) {
        if (shown >= MAX_DIFF_SAMPLES) break;
        const [universityName, category, pathName] = m.key.split("|");
        console.error(
          `  - ${m.key}: ${m.reason} (기존 ${m.expectedBytes}자 → 현재 ${m.actualBytes ?? 0}자)`,
        );

        if (fullCache) {
          const before =
            fullCache?.[universityName]?.[category]?.[pathName] || "";
          const after =
            currentFullGolden?.[universityName]?.[category]?.[pathName] || "";
          const { before: beforeSnippet, after: afterSnippet } = diffSnippet(
            before,
            after,
          );
          console.error(`      전: ...${beforeSnippet}...`);
          console.error(`      후: ...${afterSnippet}...`);
        } else {
          console.error(
            "      (전문 캐시 없음 — .golden-cache/admission-html-golden.full.json이 없어 길이 차이만 표시합니다. " +
              "실제 diff가 필요하면 스크립트 상단 주석의 재구성 방법을 참고하세요.)",
          );
        }
        shown += 1;
      }
      if (mismatches.length > MAX_DIFF_SAMPLES) {
        console.error(
          `  ... 외 ${mismatches.length - MAX_DIFF_SAMPLES}건 생략`,
        );
      }
    } else {
      console.log("[doc-equivalence] 전 항목 100% 일치.");
    }
  }

  return { total, matched, matchRate, mismatches };
}

const CATEGORY_KEYS = Object.keys(HWP_SECTION_HTML_KEYS);
const GATE_A2_PATHS = ["rawSectionHtml", "hwpCategoryHtml"];

function docBuilderForPath(pathName) {
  if (pathName === "rawSectionHtml") return buildRawSectionDoc;
  if (pathName === "hwpCategoryHtml") {
    // buildHwpCategoryDoc(sectionKey, rawText, ...) — 인자 순서가 나머지와
    // 다르다(buildRawSectionDoc은 (value, sectionKey, ...)).
    return (value, sectionKey, row, universityName) =>
      buildHwpCategoryDoc(sectionKey, value, row, universityName);
  }
  throw new Error(`알 수 없는 Gate A2 경로: ${pathName}`);
}

export async function runGateA2Verification({ verbose = true } = {}) {
  const universityNames = Object.keys(admissionHwpSections);
  const mismatches = [];
  let total = 0;
  let matched = 0;

  universityNames.forEach((universityName) => {
    const row = admissionHwpSections[universityName];
    CATEGORY_KEYS.forEach((key) => {
      const raw = clean(row[key]);
      if (!raw) return;

      GATE_A2_PATHS.forEach((pathName) => {
        const cellKey = buildCellKey(universityName, key, pathName);
        const expected = golden.cells[cellKey];
        if (!expected) return; // 골든에 없는 셀(빈 출력 등)은 비교 대상 아님 — Gate A가 이미 다룬다.
        total += 1;

        let rendered = null;
        let error = null;
        try {
          const doc = docBuilderForPath(pathName)(
            raw,
            key,
            row,
            universityName,
          );
          rendered = renderDocToHtml(doc, key);
        } catch (err) {
          error = err;
        }

        if (error) {
          mismatches.push({
            key: cellKey,
            reason: `렌더링 오류: ${error.message}`,
            expectedBytes: expected.bytes,
            actualBytes: null,
          });
          return;
        }

        const actualHash = hashString(rendered);
        if (actualHash === expected.sha256) {
          matched += 1;
        } else {
          mismatches.push({
            key: cellKey,
            reason: "해시 불일치",
            expectedBytes: expected.bytes,
            actualBytes: Buffer.byteLength(rendered, "utf-8"),
            rendered,
          });
        }
      });
    });
  });

  const matchRate = total ? (matched / total) * 100 : 100;

  if (verbose) {
    console.log(
      `[doc-equivalence] Gate A2: 골든 셀 ${total}개 중 ${matched}개 해시 일치 (${matchRate.toFixed(2)}%)`,
    );
    if (mismatches.length) {
      console.error(`[doc-equivalence] Gate A2 불일치 ${mismatches.length}건:`);
      const fullCache = await loadFullCacheIfPresent();
      mismatches.slice(0, MAX_DIFF_SAMPLES).forEach((m) => {
        const [universityName, category, pathName] = m.key.split("|");
        console.error(
          `  - ${m.key}: ${m.reason} (기존 ${m.expectedBytes}자 → 현재 ${m.actualBytes ?? 0}자)`,
        );
        if (fullCache && m.rendered !== undefined) {
          const before =
            fullCache?.[universityName]?.[category]?.[pathName] || "";
          const { before: beforeSnippet, after: afterSnippet } = diffSnippet(
            before,
            m.rendered,
          );
          console.error(`      전: ...${beforeSnippet}...`);
          console.error(`      후: ...${afterSnippet}...`);
        }
      });
      if (mismatches.length > MAX_DIFF_SAMPLES) {
        console.error(
          `  ... 외 ${mismatches.length - MAX_DIFF_SAMPLES}건 생략`,
        );
      }
    } else {
      console.log("[doc-equivalence] Gate A2 전 항목 100% 일치.");
    }
  }

  return { total, matched, matchRate, mismatches };
}

// =====================================================================
// Gate B — React 렌더러(<AdmissionSectionView>) vs HTML 미러 렌더러
// (renderDocToHtml) 정규화 DOM 비교.
// =====================================================================

const ADMISSION_SECTION_VIEW_ENTRY = path.join(
  REPO_ROOT,
  "src/components/admission/AdmissionSectionView.jsx",
);

// AdmissionSectionView.test.tsx(옛 scripts/verify-admission-block-render.mjs)와 동일한 미니 HTML 파서(요약본).
// SafeHtml(RawHtmlView가 씀)이 브라우저 DOMParser를 전제하므로, 노드에서
// 돌리려면 이 셔임이 필요하다. 이 코퍼스는 raw가 looksLikeHtml인 셀이
// 0건(측정 스크립트 실측)이라 rawHtml 블록이 실제로는 등장하지 않지만,
// 향후 코퍼스가 바뀌어도 죽지 않도록 방어적으로 등록해둔다.
const VOID_ELEMENTS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

function decodeEntities(str) {
  return String(str)
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

function parseAttributeString(attrString) {
  const attrs = [];
  const re =
    /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*("([^"]*)"|'([^']*)'|[^\s"'=<>`]+))?/g;
  let m = re.exec(attrString);
  while (m) {
    const name = m[1];
    let value = "";
    if (m[2] !== undefined)
      value = m[3] !== undefined ? m[3] : m[4] !== undefined ? m[4] : m[2];
    attrs.push({ name, value: decodeEntities(value) });
    m = re.exec(attrString);
  }
  return attrs;
}

function makeElementNode(tagName, attrs) {
  const node = {
    nodeType: 1,
    tagName: tagName.toUpperCase(),
    attributes: attrs,
    childNodes: [],
  };
  Object.defineProperty(node, "textContent", {
    get() {
      return node.childNodes.map((c) => c.textContent || "").join("");
    },
  });
  return node;
}

function makeTextNode(text) {
  return { nodeType: 3, textContent: decodeEntities(text) };
}

function makeCommentNode() {
  return { nodeType: 8, textContent: "" };
}

function parseMiniHtml(html) {
  const root = makeElementNode("body", []);
  const stack = [root];
  let i = 0;
  const n = html.length;
  const top = () => stack[stack.length - 1];

  while (i < n) {
    if (html[i] === "<") {
      if (html.startsWith("<!--", i)) {
        const end = html.indexOf("-->", i + 4);
        top().childNodes.push(makeCommentNode());
        i = end === -1 ? n : end + 3;
        continue;
      }
      if (html.startsWith("<!", i)) {
        const end = html.indexOf(">", i);
        i = end === -1 ? n : end + 1;
        continue;
      }
      const closeMatch = /^<\/([a-zA-Z][a-zA-Z0-9-]*)\s*>/.exec(html.slice(i));
      if (closeMatch) {
        const tagName = closeMatch[1].toLowerCase();
        for (let s = stack.length - 1; s > 0; s -= 1) {
          if (stack[s].tagName.toLowerCase() === tagName) {
            stack.length = s;
            break;
          }
        }
        i += closeMatch[0].length;
        continue;
      }
      const openMatch =
        /^<([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)(\/?)>/.exec(
          html.slice(i),
        );
      if (openMatch) {
        const tagName = openMatch[1];
        const attrs = parseAttributeString(openMatch[2]);
        const selfClose = Boolean(openMatch[3]);
        const el = makeElementNode(tagName, attrs);
        top().childNodes.push(el);
        const isVoid = VOID_ELEMENTS.has(tagName.toLowerCase());
        if (!selfClose && !isVoid) stack.push(el);
        i += openMatch[0].length;
        continue;
      }
      top().childNodes.push(makeTextNode("<"));
      i += 1;
      continue;
    }
    const next = html.indexOf("<", i);
    const end = next === -1 ? n : next;
    const text = html.slice(i, end);
    if (text) top().childNodes.push(makeTextNode(text));
    i = end;
  }

  return { body: root };
}

class MiniDOMParser {
  parseFromString(html) {
    return parseMiniHtml(html);
  }
}

async function loadAdmissionSectionView() {
  // MiniDOMParser는 실제 DOM 명세를 흉내낸 최소 목(mock)이라 parseFromString이
  // 진짜 Document를 반환하지 않는다(esbuild SSR 번들이 렌더 결과 비교용으로만
  // 쓴다) — 타입만 DOMParser로 캐스트하고 런타임 동작은 그대로 둔다.
  globalThis.DOMParser = /** @type {typeof DOMParser} */ (
    /** @type {unknown} */ (MiniDOMParser)
  );
  const result = await esbuild.build({
    entryPoints: [ADMISSION_SECTION_VIEW_ENTRY],
    bundle: true,
    format: "esm",
    jsx: "automatic",
    jsxImportSource: "react",
    platform: "node",
    external: ["react", "react-dom", "react/jsx-runtime", "react-dom/server"],
    write: false,
  });
  const code = result.outputFiles[0].text;
  const tmpFile = path.join(
    REPO_ROOT,
    `.tmp-gate-b-verify-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`,
  );
  fs.writeFileSync(tmpFile, code);
  try {
    const mod = await import(`file://${tmpFile}`);
    return mod.default;
  } finally {
    fs.rmSync(tmpFile, { force: true });
  }
}

// 허용 diff 2종: HTML 미러 렌더러만 내는 빈 admission-result-note /
// admission-recruit-legend div(둘 다 자식 엘리먼트 없이 텍스트도 빈
// 상태일 때만 — 실제 문구가 있는 note는 그대로 비교 대상이다).
function isAllowedEmptyDiffNode(node) {
  if (node.nodeType !== 1) return false;
  if (node.tagName.toLowerCase() !== "div") return false;
  const classAttr = node.attributes.find(
    (a) => a.name.toLowerCase() === "class",
  );
  const classes = (classAttr?.value || "").split(/\s+/).filter(Boolean);
  const isNoteDiv = classes.includes("admission-result-note");
  const isLegendDiv = classes.includes("admission-recruit-legend");
  if (!isNoteDiv && !isLegendDiv) return false;
  const hasElementChild = node.childNodes.some((c) => c.nodeType === 1);
  if (hasElementChild) return false;
  return normalizeWhitespaceText(node.textContent) === "";
}

function normalizeWhitespaceText(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim();
}

// Gate B 불일치 리포트용 — recruitment_quota의 <pre> 원문처럼 셀 하나가
// 수만 자인 경우 reason 문자열에 통째로 박히면 콘솔 로그가 읽을 수 없게
// 길어진다. 앞뒤 100자만 남기고 가운데를 생략 표시한다.
function truncateForReport(text, context = 100) {
  const s = String(text ?? "");
  if (s.length <= context * 2) return s;
  return `${s.slice(0, context)}…(${s.length - context * 2}자 생략)…${s.slice(-context)}`;
}

// 공백 정규화(빈 텍스트 노드/주석 무시, 텍스트는 trim+공백 압축) + 허용
// diff 2종 제거를 동시에 적용해 "의미 있는" 자식만 남긴다.
function collectSignificantChildren(node) {
  const result = [];
  node.childNodes.forEach((child) => {
    if (child.nodeType === 8) return;
    if (child.nodeType === 3) {
      const text = normalizeWhitespaceText(child.textContent);
      if (text) result.push({ kind: "text", text });
      return;
    }
    if (child.nodeType === 1) {
      if (isAllowedEmptyDiffNode(child)) return;
      result.push({ kind: "element", node: child });
    }
  });
  return result;
}

// class는 토큰 집합(순서 무관), 그 외 속성은 이름을 대소문자 무관으로 맞춘
// 뒤 값을 그대로 비교한다(react-dom SSR의 rowSpan→rowspan 케이싱 차이 등을
// 무해하게 흡수 — HTML 속성명은 원래 대소문자 무관이다).
function normalizeAttrs(node) {
  const attrs = {};
  node.attributes.forEach((a) => {
    const name = a.name.toLowerCase();
    if (name === "class") {
      attrs.class = a.value.split(/\s+/).filter(Boolean).sort().join(" ");
    } else {
      attrs[name] = a.value;
    }
  });
  return attrs;
}

function compareElementNodes(a, b, pathLabel) {
  const tagA = a.tagName.toLowerCase();
  const tagB = b.tagName.toLowerCase();
  if (tagA !== tagB) {
    return {
      ok: false,
      reason: `태그 불일치: <${tagA}> vs <${tagB}>`,
      path: pathLabel,
    };
  }
  const nextPath = `${pathLabel}/${tagA}`;

  const attrsA = normalizeAttrs(a);
  const attrsB = normalizeAttrs(b);
  const attrKeys = new Set([...Object.keys(attrsA), ...Object.keys(attrsB)]);
  for (const key of attrKeys) {
    if ((attrsA[key] ?? "") !== (attrsB[key] ?? "")) {
      return {
        ok: false,
        reason: `${nextPath} 속성 ${key} 불일치: "${truncateForReport(attrsA[key] ?? "")}" vs "${truncateForReport(attrsB[key] ?? "")}"`,
        path: nextPath,
      };
    }
  }

  const childrenA = collectSignificantChildren(a);
  const childrenB = collectSignificantChildren(b);
  if (childrenA.length !== childrenB.length) {
    return {
      ok: false,
      reason: `${nextPath} 자식 수 불일치: ${childrenA.length} vs ${childrenB.length}`,
      path: nextPath,
    };
  }
  for (let i = 0; i < childrenA.length; i += 1) {
    const ca = childrenA[i];
    const cb = childrenB[i];
    if (ca.kind !== cb.kind) {
      return {
        ok: false,
        reason: `${nextPath} idx=${i} 자식 종류(텍스트/엘리먼트) 불일치`,
        path: nextPath,
      };
    }
    if (ca.kind === "text") {
      if (ca.text !== cb.text) {
        return {
          ok: false,
          reason: `${nextPath} idx=${i} 텍스트 불일치: "${truncateForReport(ca.text)}" vs "${truncateForReport(cb.text)}"`,
          path: nextPath,
        };
      }
      continue;
    }
    const childResult = compareElementNodes(ca.node, cb.node, nextPath);
    if (!childResult.ok) return childResult;
  }

  return { ok: true };
}

// 두 HTML 문자열(React 프래그먼트 출력 vs HTML 미러 출력)을 형제 목록으로
// 비교한다 — AdmissionSectionView가 <>제목div, wrap div</>인 프래그먼트를
// 반환하므로 단일 루트가 아니다.
function compareHtmlFragments(htmlReact, htmlMirror) {
  const treeReact = parseMiniHtml(htmlReact);
  const treeMirror = parseMiniHtml(htmlMirror);
  const childrenReact = collectSignificantChildren(treeReact.body);
  const childrenMirror = collectSignificantChildren(treeMirror.body);

  if (childrenReact.length !== childrenMirror.length) {
    return {
      ok: false,
      reason: `최상위 자식 수 불일치: React ${childrenReact.length} vs HTML미러 ${childrenMirror.length}`,
      path: "/",
    };
  }
  for (let i = 0; i < childrenReact.length; i += 1) {
    const ca = childrenReact[i];
    const cb = childrenMirror[i];
    if (ca.kind !== cb.kind) {
      return {
        ok: false,
        reason: `최상위 idx=${i} 자식 종류 불일치`,
        path: "/",
      };
    }
    if (ca.kind === "text") {
      if (ca.text !== cb.text) {
        return {
          ok: false,
          reason: `최상위 idx=${i} 텍스트 불일치: "${truncateForReport(ca.text)}" vs "${truncateForReport(cb.text)}"`,
          path: "/",
        };
      }
      continue;
    }
    const result = compareElementNodes(ca.node, cb.node, "");
    if (!result.ok) return result;
  }
  return { ok: true };
}

export async function runGateBVerification({ verbose = true } = {}) {
  console.log(
    "[doc-equivalence] Gate B 참고: KeyValueBlock — 파서/doc 생성기 어느 쪽도 생산하지 않아(생산자 0) " +
      '"정답이 없는" 케이스입니다. 코퍼스에 등장하지 않으므로 비교 대상에서 명시적으로 제외합니다.',
  );

  const AdmissionSectionView = await loadAdmissionSectionView();
  const universityNames = Object.keys(admissionHwpSections);
  const mismatches = [];
  let total = 0;
  let matched = 0;

  universityNames.forEach((universityName) => {
    const row = admissionHwpSections[universityName];
    CATEGORY_KEYS.forEach((key) => {
      const raw = clean(row[key]);
      if (!raw) return;

      GATE_A2_PATHS.forEach((pathName) => {
        const cellKey = buildCellKey(universityName, key, pathName);
        if (!golden.cells[cellKey]) return; // Gate A2와 동일 코퍼스 범위(빈 출력 제외)
        total += 1;

        let comparison;
        try {
          const doc = docBuilderForPath(pathName)(
            raw,
            key,
            row,
            universityName,
          );
          const htmlMirror = renderDocToHtml(doc, key);
          const htmlReact = renderToStaticMarkup(
            React.createElement(AdmissionSectionView, {
              doc,
              sectionKey: key,
              surface: "public",
            }),
          );
          comparison = compareHtmlFragments(htmlReact, htmlMirror);
        } catch (err) {
          comparison = { ok: false, reason: `예외: ${err.message}`, path: "/" };
        }

        if (comparison.ok) {
          matched += 1;
        } else {
          mismatches.push({
            key: cellKey,
            reason: comparison.reason,
            path: comparison.path,
          });
        }
      });
    });
  });

  const matchRate = total ? (matched / total) * 100 : 100;

  if (verbose) {
    console.log(
      `[doc-equivalence] Gate B: 대상 ${total}개 중 ${matched}개 정규화 DOM 일치 (${matchRate.toFixed(2)}%)`,
    );
    if (mismatches.length) {
      console.error(`[doc-equivalence] Gate B 불일치 ${mismatches.length}건:`);
      mismatches.slice(0, MAX_DIFF_SAMPLES).forEach((m) => {
        console.error(`  - ${m.key}: ${m.reason}`);
      });
      if (mismatches.length > MAX_DIFF_SAMPLES) {
        console.error(
          `  ... 외 ${mismatches.length - MAX_DIFF_SAMPLES}건 생략`,
        );
      }
    } else {
      console.log("[doc-equivalence] Gate B 전 항목 일치.");
    }
  }

  return { total, matched, matchRate, mismatches };
}

const isMainModule =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  Promise.all([runDocEquivalenceVerification(), runGateA2Verification()])
    .then(async ([gateA, gateA2]) => {
      const gateB = await runGateBVerification();
      process.exit(
        gateA.mismatches.length ||
          gateA2.mismatches.length ||
          gateB.mismatches.length
          ? 1
          : 0,
      );
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
