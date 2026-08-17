// =====================================================================
// 공개 대학모집요강 모달 "껍데기" 골든 재캡처 도구 (수동 전용)
//
// 이 파일은 테스트가 아니다 — package.json의 test/verify/CI 어디에도
// 연결하지 않는다. 리팩터 착수 **전** 사람이 손으로 한 번 돌려 골든을
// 뜨는 도구다. 자동 검증(읽기 전용)은
// src/pages/AdmissionGuidelines.modalShell.test.tsx가 맡는다 — 그 파일의
// 헤더 주석에 이 분리의 배경이 있다(task 10.5, scripts/verify-admission-modal-shell.mjs
// 이식).
//
// 두 모드:
//   node scripts/capture-admission-modal-shell-golden.mjs --capture [--from-rev <rev>]
//     AdmissionGuidelines.tsx의 모달 JSX 영역을 기계적으로 잘라 SSR 바이트
//     골든(scripts/__fixtures__/admission-modal-shell.ssr.json)을 다시 쓴다.
//     --from-rev를 주면 그 커밋 시점의 소스에서 뜬다(리팩터 직전 커밋에서
//     "정답"을 고정할 때 쓴다). 생략하면 현재 작업트리 소스에서 뜬다.
//
//   node scripts/capture-admission-modal-shell-golden.mjs --browser <captured.json>
//     실제 브라우저(예: Playwright)로 새로 캡처한 outerHTML+프록시 실측
//     JSON을 받아, 커밋된 브라우저 캡처 골든(admission-modal-shell.browser.json)과
//     diff한다. 읽기 전용 — 아무 파일도 쓰지 않는다. 새 캡처를 뜨는 과정
//     자체(dev 서버 + 브라우저 자동화)는 이 스크립트 밖의 일이다.
//
// 제약은 원본 verify-admission-modal-shell.mjs와 동일: esbuild(번들 모드) +
// react-dom/server만 쓴다. react/react-dom은 external로 남겨 React 인스턴스
// 중복을 피한다. AdmissionGuidelines.tsx가 "@/" 절대경로 import를 쓰므로
// (task 8) esbuild alias 옵션으로 vite.config.js의 별칭을 그대로 물린다.
// =====================================================================

import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import * as esbuild from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const REPO_ROOT = path.resolve(new URL(".", import.meta.url).pathname, "..");
const PAGE_REL = "src/pages/AdmissionGuidelines.tsx";
const PAGE_PATH = path.join(REPO_ROOT, PAGE_REL);
const FIXTURE_DIR = path.join(REPO_ROOT, "scripts/__fixtures__");
const SSR_FIXTURE = path.join(FIXTURE_DIR, "admission-modal-shell.ssr.json");
const BROWSER_FIXTURE = path.join(
  FIXTURE_DIR,
  "admission-modal-shell.browser.json",
);

const SLICE_START = "{selectedInfo ? (";
const SLICE_END = ") : null}";

// ── 1. 모달 JSX 영역 기계 슬라이스 ─────────────────────────────────────

function sliceModalRegion(sourceText) {
  const lines = sourceText.split("\n");
  const starts = [];
  lines.forEach((line, idx) => {
    if (line.trim() === SLICE_START) starts.push(idx);
  });
  if (starts.length !== 1) {
    throw new Error(
      `모달 슬라이스 앵커 "${SLICE_START}" 가 ${starts.length}개다(정확히 1개여야 함). ` +
        "리팩터로 앵커가 사라졌다면 AdmissionGuidelines.modalShell.test.tsx의 슬라이스 규칙 주석을 읽고 앵커를 복원하라.",
    );
  }
  const start = starts[0];
  const indent = lines[start].slice(
    0,
    lines[start].length - lines[start].trimStart().length,
  );
  let end = -1;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (lines[i] === `${indent}${SLICE_END}`) {
      end = i;
      break;
    }
  }
  if (end === -1) {
    throw new Error(
      `모달 슬라이스 종료 앵커 "${indent}${SLICE_END}" 를 찾지 못했다.`,
    );
  }
  return {
    text: lines.slice(start, end + 1).join("\n"),
    startLine: start + 1,
    endLine: end + 1,
  };
}

// 파일 머리의 import 문을 통째로 모은다(다중 라인 지원).
function collectImportStatements(sourceText) {
  const lines = sourceText.split("\n");
  const statements = [];
  let buffer = null;
  for (const line of lines) {
    if (buffer === null && !line.startsWith("import ")) {
      if (line.trim() === "" || line.startsWith("//")) continue;
      if (statements.length > 0) break; // import 블록 종료
      continue;
    }
    buffer = buffer === null ? line : `${buffer}\n${line}`;
    if (line.trimEnd().endsWith(";")) {
      statements.push(buffer);
      buffer = null;
    }
  }
  return statements;
}

function bindingsOf(statement) {
  // "import type { X } from ..." 의 선행 type 키워드는 바인딩 이름이 아니다.
  const clause = statement
    .slice("import".length, statement.lastIndexOf(" from "))
    .trim()
    .replace(/^type\s+/, "");
  const names = [];
  const braceStart = clause.indexOf("{");
  const head = (braceStart === -1 ? clause : clause.slice(0, braceStart))
    .replace(/,\s*$/, "")
    .trim();
  if (head) names.push(head.replace(/^\*\s+as\s+/, "").trim());
  if (braceStart !== -1) {
    const inner = clause.slice(braceStart + 1, clause.lastIndexOf("}"));
    inner
      .split(",")
      .map((piece) => piece.trim())
      .filter(Boolean)
      .forEach((piece) => {
        const parts = piece.split(/\s+as\s+/);
        names.push((parts[1] || parts[0]).trim());
      });
  }
  return names.filter(Boolean);
}

function buildHarnessSource(sourceText) {
  const { text: slice, startLine, endLine } = sliceModalRegion(sourceText);
  const imports = collectImportStatements(sourceText).filter((statement) =>
    bindingsOf(statement).some((name) =>
      new RegExp(`\\b${name}\\b`).test(slice),
    ),
  );

  // 하네스는 페이지와 같은 디렉터리(src/pages/)에 쓴다 — "@/" 별칭은 아래
  // esbuild alias 옵션으로, 상대 경로 import는 물리적으로 같은 위치에 두는
  // 것만으로 재작성 없이 그대로 해석된다.
  const source = `// 자동 생성 — capture-admission-modal-shell-golden.mjs. 커밋하지 않는다.
// 원본: ${PAGE_REL} ${startLine}-${endLine} 행 기계 슬라이스.
import { useRef as __useRef } from 'react';
${imports.join("\n")}

export default function __ModalRegionHarness({ selectedInfo, modalXScroll }) {
  const modalBodyRef = __useRef(null);
  const modalXScrollRef = __useRef(null);
  const modalTriggerRef = __useRef(null);
  const setSelectedInfo = () => {};
  const handleRetryInfo = () => {};
  // ${PAGE_REL}:1589-1591 그대로 — 슬라이스 앵커(SLICE_START) 앞에서 선언되는
  // 변수라 기계 슬라이스에 포함되지 않는다. AdmissionModalShell#bodyProps로
  // 넘어가 "ref → data-section → className" 순서로 스프레드되므로 바이트가
  // 어긋나지 않게 여기서도 동일하게 계산한다.
  const modalBodyDataProps = { "data-section": selectedInfo?.section?.key || "" };
  return (
    <>
${slice}
    </>
  );
}
`;
  return { source, startLine, endLine, importCount: imports.length };
}

// ── 2. 번들 + 로드 ─────────────────────────────────────────────────────

async function loadHarness(harnessSource) {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const harnessPath = path.join(
    path.dirname(PAGE_PATH),
    `.tmp-modal-shell-harness-${stamp}.tsx`,
  );
  const bundlePath = path.join(
    REPO_ROOT,
    `.tmp-modal-shell-bundle-${stamp}.mjs`,
  );
  fs.writeFileSync(harnessPath, harnessSource);
  try {
    const result = await esbuild.build({
      entryPoints: [harnessPath],
      bundle: true,
      format: "esm",
      jsx: "automatic",
      jsxImportSource: "react",
      platform: "node",
      // platform:'node' 기본 해석은 CJS(main)를 먼저 집는다. lucide-react 의
      // CJS 번들은 dynamic require('react') 를 쓰는데 external 로 남긴 react 와
      // 만나면 ESM 출력에서 터진다. 브라우저 번들러(vite)와 같은 ESM 진입점을
      // 쓰도록 mainFields 를 명시한다.
      mainFields: ["module", "main"],
      // vite.config.js의 resolve.alias("@" -> src/)와 동일하게 맞춘다.
      alias: { "@": path.join(REPO_ROOT, "src") },
      external: ["react", "react-dom", "react/jsx-runtime", "react-dom/server"],
      write: false,
    });
    fs.writeFileSync(bundlePath, result.outputFiles[0].text);
    const mod = await import(`file://${bundlePath}`);
    return mod.default;
  } finally {
    fs.rmSync(harnessPath, { force: true });
    fs.rmSync(bundlePath, { force: true });
  }
}

// ── 3. 렌더 케이스 ─────────────────────────────────────────────────────
//
// AdmissionSurface 는 표면 CSS 전량을 <style> 하나로 뱉는다. 그 본문까지
// 골든에 박으면 (a) 픽스처가 수십 KB로 불고 (b) 이 게이트가 "표면 CSS
// 게이트"로 변질된다. 껍데기 골든의 관심사가 아니므로 <style> 본문은
// sha256 로 접는다 — 내용이 바뀌면 해시가 바뀌므로 민감도는 유지된다.

function foldStyleBodies(html) {
  return html.replace(/<style>([\s\S]*?)<\/style>/g, (_all, body) => {
    const sha = crypto
      .createHash("sha256")
      .update(body)
      .digest("hex")
      .slice(0, 16);
    return `<style>[folded len=${body.length} sha256=${sha}]</style>`;
  });
}

const SECTION = { key: "selection_method", label: "전형방법" };

const SAMPLE_DOC = {
  v: 1,
  section: "selection_method",
  source: "parser",
  generator: "modal-shell-fixture",
  generatedAt: "2026-01-01T00:00:00.000Z",
  blocks: [
    {
      kind: "table",
      variant: "selection",
      columns: [
        { role: "type", label: "전형" },
        { role: "name", label: "전형명" },
        { role: "seats", label: "인원" },
        { role: "minimum", label: "최저" },
        { role: "method", label: "전형방법" },
      ],
      rows: [["학생부교과", "일반전형", "10", "3등급", "내신 100%"]],
    },
  ],
};

const BASE = {
  universityName: "검증대학교",
  title: "전형방법",
  cacheKey: "fixture:selection_method",
  section: SECTION,
  row: { id: "fixture" },
};

const CASES = {
  loading: {
    selectedInfo: {
      ...BASE,
      status: "loading",
      mode: "text",
      doc: null,
      html: "",
      text: "",
      isHtml: false,
    },
    modalXScroll: { visible: false, width: 0 },
  },
  error: {
    selectedInfo: {
      ...BASE,
      status: "error",
      mode: "text",
      doc: null,
      html: "",
      text: "",
      isHtml: false,
    },
    modalXScroll: { visible: false, width: 0 },
  },
  doc: {
    selectedInfo: {
      ...BASE,
      status: "ready",
      mode: "doc",
      doc: SAMPLE_DOC,
      html: "",
      text: "",
      isHtml: false,
    },
    modalXScroll: { visible: false, width: 0 },
  },
  docWithProxyBar: {
    selectedInfo: {
      ...BASE,
      status: "ready",
      mode: "doc",
      doc: SAMPLE_DOC,
      html: "",
      text: "",
      isHtml: true,
    },
    modalXScroll: { visible: true, width: 1280 },
  },
  html: {
    selectedInfo: {
      ...BASE,
      status: "ready",
      mode: "html",
      doc: null,
      html: '<div class="admission-existing-html"><table><tr><td>a</td></tr></table></div>',
      text: "",
      isHtml: true,
    },
    modalXScroll: { visible: true, width: 1567 },
  },
  text: {
    selectedInfo: {
      ...BASE,
      status: "ready",
      mode: "text",
      doc: null,
      html: "",
      text: "평문 본문입니다.",
      isHtml: false,
    },
    modalXScroll: { visible: false, width: 0 },
  },
  empty: {
    selectedInfo: {
      ...BASE,
      status: "ready",
      mode: "text",
      doc: null,
      html: "",
      text: "",
      isHtml: false,
    },
    modalXScroll: { visible: false, width: 0 },
  },
};

async function renderAllCases(sourceText) {
  const { source, startLine, endLine, importCount } =
    buildHarnessSource(sourceText);
  const Harness = await loadHarness(source);
  // 골든은 "DOMParser 없는 순수 Node SSR" 조건에서 뜬다 — 이 스크립트는
  // 플레인 node로 실행되므로(테스트 파일과 달리 jsdom 환경이 아니다) 전역
  // DOMParser가 애초에 없다. SafeHtml.tsx의 defaultParseDocument가
  // `typeof DOMParser === 'undefined'` 분기를 타 html 케이스는 항상
  // null/래퍼만 남는 축약 경로를 재현한다.
  const rendered = {};
  for (const [name, props] of Object.entries(CASES)) {
    rendered[name] = foldStyleBodies(
      renderToStaticMarkup(React.createElement(Harness, props)),
    );
  }
  return { rendered, startLine, endLine, importCount };
}

// ── 4. 모드별 진입점 ───────────────────────────────────────────────────

function readSourceAt(rev) {
  if (!rev) return fs.readFileSync(PAGE_PATH, "utf8");
  return execFileSync("git", ["show", `${rev}:${PAGE_REL}`], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
}

function gitRevParse(rev) {
  return execFileSync("git", ["rev-parse", rev], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  }).trim();
}

async function capture(rev) {
  const sourceText = readSourceAt(rev);
  const { rendered, startLine, endLine } = await renderAllCases(sourceText);
  const resolved = gitRevParse(rev || "HEAD");
  fs.mkdirSync(FIXTURE_DIR, { recursive: true });
  const payload = {
    __why: [
      "공개 대학모집요강 모달 껍데기의 SSR 바이트 골든.",
      '이 값들은 "보기 좋아서 고른 값"이 아니라, 아래 sourceRev 커밋의',
      `${PAGE_REL} 소스에서 모달 JSX 영역을 기계적으로 잘라내 그대로`,
      "renderToStaticMarkup 한 출력이다. 재생성 명령이 재현성을 보장한다.",
      "골든을 새 컴포넌트 출력으로 다시 뜨면 자기증명 순환이 된다 — 하지 말 것.",
    ].join(" "),
    sourceRev: resolved,
    sourceRevMeansPreRefactor: rev
      ? `명시된 rev(${rev}) 소스에서 캡처`
      : "작업트리 소스에서 캡처",
    sourceSlice: `${PAGE_REL}:${startLine}-${endLine}`,
    regenerate: `node scripts/capture-admission-modal-shell-golden.mjs --capture --from-rev ${resolved.slice(0, 7)}`,
    note: "<style> 본문은 sha256 로 접혀 있다(껍데기 게이트의 관심사가 아니므로). 접기 규칙은 이 스크립트의 foldStyleBodies 참고.",
    cases: rendered,
  };
  fs.writeFileSync(SSR_FIXTURE, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`골든 기록: ${path.relative(REPO_ROOT, SSR_FIXTURE)}`);
  console.log(`  sourceRev = ${resolved}`);
  console.log(`  slice     = ${PAGE_REL}:${startLine}-${endLine}`);
  for (const [name, html] of Object.entries(rendered)) {
    console.log(`  ${name.padEnd(16)} ${html.length} bytes`);
  }
}

// 브라우저 캡처 골든 대조. 새 캡처 JSON 을 인자로 받아 케이스별로
// outerHTML 문자열 완전 일치 + 프록시 실측 수치 일치를 본다. 읽기 전용 —
// 아무 파일도 쓰지 않는다.
function compareBrowser(capturedPath) {
  const results = [];
  const record = (name, pass, detail) => results.push({ name, pass, detail });

  if (!fs.existsSync(BROWSER_FIXTURE)) {
    record(
      "browser:fixture-exists",
      false,
      `${path.relative(REPO_ROOT, BROWSER_FIXTURE)} 없음`,
    );
  } else {
    const golden = JSON.parse(fs.readFileSync(BROWSER_FIXTURE, "utf8"));
    const actual = JSON.parse(fs.readFileSync(capturedPath, "utf8"));
    for (const [name, g] of Object.entries(golden.cases)) {
      const a = actual[name] || actual.cases?.[name];
      if (!a) {
        record(`browser:${name}`, false, "새 캡처에 해당 케이스 없음");
        continue;
      }
      // html: null 인 케이스는 "수치 전용"(용량 때문에 마크업을 안 담은 케이스)이다.
      if (g.html === null) {
        record(
          `browser:${name}:html`,
          true,
          "수치 전용 케이스 — 마크업 비교 없음",
        );
      } else if (g.html !== a.html) {
        let at = 0;
        while (
          at < g.html.length &&
          at < a.html.length &&
          g.html[at] === a.html[at]
        )
          at += 1;
        record(
          `browser:${name}:html`,
          false,
          `outerHTML 불일치 @${at}\n      기대: ${JSON.stringify(g.html.slice(Math.max(0, at - 60), at + 120))}\n      실제: ${JSON.stringify(a.html.slice(Math.max(0, at - 60), at + 120))}`,
        );
      } else {
        record(`browser:${name}:html`, true, `${a.html.length} bytes 일치`);
      }
      if (g.metrics) {
        const same =
          a.metrics &&
          a.metrics.barScrollWidth === g.metrics.barScrollWidth &&
          a.metrics.targetScrollWidth === g.metrics.targetScrollWidth &&
          a.metrics.innerStyleWidth === g.metrics.innerStyleWidth &&
          a.metrics.movedToEnd === true;
        record(
          `browser:${name}:proxy-scroll`,
          Boolean(same),
          `기대 ${JSON.stringify(g.metrics)} / 실제 ${JSON.stringify(a.metrics)}`,
        );
      }
    }
  }

  let passed = 0;
  for (const r of results) {
    if (r.pass) passed += 1;
    console.log(
      `${r.pass ? "PASS" : "FAIL"}  ${r.name}${r.pass ? "" : `\n      ${r.detail}`}`,
    );
  }
  console.log(`\nbrowser 대조: ${passed}/${results.length} 통과`);
  if (passed !== results.length) process.exitCode = 1;
}

async function main() {
  const argv = process.argv.slice(2);

  if (argv.includes("--capture")) {
    const i = argv.indexOf("--from-rev");
    await capture(i === -1 ? null : argv[i + 1]);
    return;
  }

  const browserIdx = argv.indexOf("--browser");
  if (browserIdx !== -1) {
    compareBrowser(argv[browserIdx + 1]);
    return;
  }

  console.error(
    "사용법:\n" +
      "  node scripts/capture-admission-modal-shell-golden.mjs --capture [--from-rev <rev>]\n" +
      "  node scripts/capture-admission-modal-shell-golden.mjs --browser <captured.json>",
  );
  process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
