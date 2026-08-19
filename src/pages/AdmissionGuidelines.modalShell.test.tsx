// 공개 대학모집요강 모달 "껍데기" 골든 검증.
//
// 왜 필요한가
// -----------
// 기존 검증들은 전부 **섹션 문서 블록의 렌더 출력**만 본다. 모달 껍데기 —
// 오버레이 / sheet / head / body / 하단 프록시 가로 스크롤바 shell / 푸터 —
// 를 보는 게이트는 이 파일이 유일하다. 즉 껍데기를 컴포넌트로 추출하는
// 리팩터는 기존 게이트 전량 통과 상태로 공개 화면을 조용히 바꿀 수 있다.
//
// 자기증명 순환(self-proving circularity) 회피
// ---------------------------------------------
// 골든을 "새로 만든 컴포넌트 출력"으로 생성하면, 옮기다 깨진 결과가 그대로
// 정답으로 굳는다. 그래서 골든은 두 갈래로 떴다.
//
//  (A) 브라우저 캡처 골든 — scripts/__fixtures__/admission-modal-shell.browser.json
//      리팩터 착수 **전** 실제 dev 서버 화면에서 뜬 outerHTML + 프록시
//      스크롤바 실측 수치. 이 파일은 렌더 비교 스텝이 아니라(원본 스크립트도
//      `--browser <새로_캡처한_파일>` 인자로 사람이 넣어준 새 캡처와 이
//      골든을 비교하는 CLI 전용 모드였다) 골든 파일 자체가 온전한지만
//      확인한다.
//
//  (B) DOM 구조 골든 — scripts/__fixtures__/admission-modal-shell.dom.json
//      AdmissionGuidelines.tsx 의 모달 JSX 영역을 **소스에서 기계적으로
//      잘라내** 하네스로 감싸고 실제로 마운트한 결과. 이 파일이 매 실행마다
//      검증하는 대상 — 슬라이스는 **현재 소스 파일**에서 다시 뜨므로 사본이
//      아니라 실제 페이지 파일을 검사한다.
//
// 원본 fixture JSON 2개는 절대 수정/재생성하지 않는다 — 골든은 리팩터
// 이전 상태의 정답이다.
//
// AdmissionModalShell의 shadcn/ui Dialog(Base UI) 전환과 SSR → DOM 골든 전환
// ---------------------------------------------------------------------------
// AdmissionModalShell이 renderToStaticMarkup으로 문자열 바이트를 비교하던
// 방식(구 admission-modal-shell.ssr.json)은 더 이상 성립하지 않는다 —
// Base UI Dialog는 Portal로 렌더하는데, react-dom/server의
// renderToStaticMarkup은 포털을 지원하지 않는다(선례:
// src/components/performance/step5/EvaluationReportModal.test.tsx 헤더 주석 —
// "Portals are not currently supported by the server renderer"). 실측으로도
// 확인했다: 이 컴포넌트를 Base UI로 옮긴 뒤 옛 harness로 렌더하면 포털
// 서브트리가 통째로 빈 문자열이 된다.
//
// 그 선례가 택한 길(node:test → Vitest 이식하며 jsdom + @testing-library/react
// render()로 전환)을 그대로 따른다 — 다만 이 파일은 그 선례와 달리 **구조·클래스
// 단언이 아니라 골든 파일 비교를 유지**한다. 이유: 이 파일의 검증 대상은
// "AdmissionGuidelines.tsx 호출부가 만드는 모달 전체 마크업"(껍데기 + 데이터
// 배선)이라 단언식으로 옮기면 케이스마다 수십 줄의 개별 assertion이 필요하고,
// 그마저 "무엇이 바뀌면 안 되는지"를 완전히 커버한다는 보장이 약하다. 골든
// 파일 대조가 더 촘촘하다.
//
// 새 파이프라인의 두 가지 제약과 해법
// -------------------------------------
// 1. esbuild와 jsdom 전역의 충돌. 이 파일의 vitest 환경은 프로젝트 기본값인
//    jsdom(vitest.config.ts) — Base UI Dialog가 실제 Portal을 마운트하려면
//    `document`가 있어야 하므로 이제는 필수다. 문제는 `import * as esbuild
//    from "esbuild"` 자체가 jsdom 환경에서 즉시 던진다는 것이다(jsdom이 패치한
//    전역 TextEncoder가 esbuild의 자체 무결성 검사
//    "new TextEncoder().encode('') instanceof Uint8Array"와 충돌 —
//    node_modules/esbuild/lib/main.js:201, 실측 확인). 그래서 esbuild 번들링
//    단계만 `node:child_process`로 띄운 순수 node 자식 프로세스로 격리한다
//    (jsdom 오염이 없는 프로세스라 esbuild가 정상 동작한다). 산출 번들(.mjs
//    파일)은 그 다음 이 프로세스에서 평범하게 동적 import() 한다 — 모듈
//    "평가"는 esbuild의 무결성 검사를 거치지 않으므로 문제없다.
// 2. Base UI가 부여하는 동적 id. Dialog Portal 컨테이너와 Popup 둘 다 React
//    useId 기반 순번 id(`_r_0_`, `_r_1_`, ... 실측 확인)를 받는데, 이 값은
//    렌더 호출 누적 횟수에 따라 달라져 결정론적 바이트 골든과 상극이다.
//    normalizeDynamicIds가 `id="_r_\d+_"` 패턴을 전부 `id="[id]"` 플레이스홀더로
//    접어 실제 순번과 무관하게 비교되도록 한다(aria-labelledby가 가리키는
//    admission-modal-university-name/-title id는 이 컴포넌트가 idPrefix로
//    직접 만든 리터럴이라 정규화 대상이 아니다 — AdmissionModalShell.tsx의
//    "3. aria-labelledby" 규칙 참고).
//
// 이식 메모(node:test → Vitest, task 10.5 — 슬라이스/하네스 부분은 유지)
// -----------------------------------------------------------------------
// - esbuild.build() 번들링은 유지한다(A/B 파일과 달리 여기서는 정적 import가
//   불가능하다 — 검증 대상이 "현재 소스에서 기계적으로 잘라낸 임의의 JSX
//   조각"이라 반드시 런타임에 조립해야 한다). alias 옵션으로 "@/" 별칭을
//   esbuild에도 물려 vite.config.js의 별칭과 동일하게 맞췄다.
// - 구조 드리프트: 골든 캡처 시점(sourceRev) 이후 모달 마크업이
//   AdmissionModalShell 컴포넌트로 추출됐다(src/components/admission/modal/AdmissionModalShell.tsx
//   헤더 주석 참고). 그 결과 원래 슬라이스 앵커 **안**에서 직접 계산되던
//   `data-section` 값이 이제 앵커 **밖**(AdmissionGuidelines.tsx:1589-1591,
//   `modalBodyDataProps` 변수)에서 계산돼 `bodyProps`로 전달된다. 기계
//   슬라이스는 앵커 밖 변수를 볼 수 없으므로, 하네스 프리앰블에서 그 두 줄을
//   동일하게 재현한다.
//
// 슬라이스 규칙 (리팩터 후에도 반드시 유지할 것)
// ------------------------------------------------
//   src/pages/AdmissionGuidelines.tsx 안에
//     <indent>{selectedInfo ? (
//     ... 모달 전체 ...
//     <indent>) : null}
//   형태가 **정확히 1개** 있어야 한다. 이 앵커가 깨지면 이 파일의 beforeAll이
//   즉시 throw해 이 describe 블록 전체가 실패한다(조용히 통과하지 않는다).

import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { act, cleanup, render } from "@testing-library/react";
import { beforeAll, describe, expect, test } from "vitest";

const REPO_ROOT = path.resolve(import.meta.dirname, "../..");
const PAGE_REL = "src/pages/AdmissionGuidelines.tsx";
const PAGE_PATH = path.join(REPO_ROOT, PAGE_REL);
const FIXTURE_DIR = path.join(REPO_ROOT, "scripts/__fixtures__");
const DOM_FIXTURE = path.join(FIXTURE_DIR, "admission-modal-shell.dom.json");
const BROWSER_FIXTURE = path.join(
  FIXTURE_DIR,
  "admission-modal-shell.browser.json",
);

const SLICE_START = "{selectedInfo ? (";
const SLICE_END = ") : null}";

// ── 1. 모달 JSX 영역 기계 슬라이스 ─────────────────────────────────────

function sliceModalRegion(sourceText: string) {
  const lines = sourceText.split("\n");
  const starts: number[] = [];
  lines.forEach((line, idx) => {
    if (line.trim() === SLICE_START) starts.push(idx);
  });
  if (starts.length !== 1) {
    throw new Error(
      `모달 슬라이스 앵커 "${SLICE_START}" 가 ${starts.length}개다(정확히 1개여야 함). ` +
        "리팩터로 앵커가 사라졌다면 이 파일 상단의 슬라이스 규칙 주석을 읽고 앵커를 복원하라.",
    );
  }
  const start = starts[0] as number;
  const startText = lines[start] as string;
  const indent = startText.slice(
    0,
    startText.length - startText.trimStart().length,
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
function collectImportStatements(sourceText: string): string[] {
  const lines = sourceText.split("\n");
  const statements: string[] = [];
  let buffer: string | null = null;
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

function bindingsOf(statement: string): string[] {
  // "import type { X } from ..." 의 선행 type 키워드는 바인딩 이름이
  // 아니다 — 제거하지 않으면 "type"이라는 가짜 식별자가 추출돼 슬라이스
  // 안의 우연한 "type=" 속성 매치로 오탐할 수 있다.
  const clause = statement
    .slice("import".length, statement.lastIndexOf(" from "))
    .trim()
    .replace(/^type\s+/, "");
  const names: string[] = [];
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
        names.push((parts[1] || parts[0] || "").trim());
      });
  }
  return names.filter(Boolean);
}

function buildHarnessSource(sourceText: string) {
  const { text: slice, startLine, endLine } = sliceModalRegion(sourceText);
  const imports = collectImportStatements(sourceText).filter((statement) =>
    bindingsOf(statement).some((name) =>
      new RegExp(`\\b${name}\\b`).test(slice),
    ),
  );

  // 하네스는 페이지와 같은 디렉터리(src/pages/)에 쓴다 — "@/" 별칭은 아래
  // esbuild alias 옵션으로, 상대 경로 import는 물리적으로 같은 위치에 두는
  // 것만으로 재작성 없이 그대로 해석된다.
  const source = `// 자동 생성 — AdmissionGuidelines.modalShell.test.tsx. 커밋하지 않는다.
// 원본: ${PAGE_REL} ${startLine}-${endLine} 행 기계 슬라이스.
import { useRef as __useRef } from 'react';
${imports.join("\n")}

export default function __ModalRegionHarness({ selectedInfo, modalXScroll }: any) {
  const modalBodyRef = __useRef(null);
  const modalXScrollRef = __useRef(null);
  const modalTriggerRef = __useRef(null);
  const setSelectedInfo = () => {};
  const handleRetryInfo = () => {};
  // ${PAGE_REL}:1589-1591 그대로 — 슬라이스 앵커(SLICE_START) 앞에서 선언되는
  // 변수라 기계 슬라이스에 포함되지 않는다. 이 파일 상단 헤더 주석의
  // "구조 드리프트" 절 참고.
  const modalBodyDataProps = { "data-section": selectedInfo?.section?.key || "" };
  return (
    <>
${slice}
    </>
  );
}
`;
  return { source, startLine, endLine };
}

// ── 2. 번들(격리된 자식 프로세스) + 로드 ────────────────────────────────

async function bundleHarness(harnessSource: string): Promise<unknown> {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const harnessPath = path.join(
    path.dirname(PAGE_PATH),
    `.tmp-modal-shell-harness-${stamp}.tsx`,
  );
  const bundlePath = path.join(
    REPO_ROOT,
    `.tmp-modal-shell-bundle-${stamp}.mjs`,
  );
  const driverPath = path.join(
    REPO_ROOT,
    `.tmp-modal-shell-esbuild-driver-${stamp}.mjs`,
  );
  fs.writeFileSync(harnessPath, harnessSource);
  // 이 파일 상단 헤더 주석 "새 파이프라인의 두 가지 제약과 해법 §1" 참고 —
  // esbuild는 이 파일의 jsdom 환경에서 import조차 못 한다. 번들링만 순수
  // node 자식 프로세스로 격리한다.
  const driverSource = `import * as esbuild from "esbuild";
import fs from "node:fs";
const result = await esbuild.build({
  entryPoints: [${JSON.stringify(harnessPath)}],
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
  // vite.config.js의 resolve.alias("@" -> src/)와 동일하게 맞춘다 —
  // AdmissionGuidelines.tsx가 "@/" 절대경로 import를 쓴다.
  alias: { "@": ${JSON.stringify(path.join(REPO_ROOT, "src"))} },
  // react-dom도 external로 남긴다 — Base UI Dialog가 내부적으로 createPortal을
  // 쓰는데, 번들에 별도로 딸려 들어가면 이 테스트 프로세스가 이미 로드해 둔
  // react-dom(및 @testing-library/react가 붙잡은 인스턴스)과 어긋나
  // 포털/리컨실러 인스턴스가 갈라진다.
  external: ["react", "react-dom", "react-dom/client", "react/jsx-runtime"],
  write: false,
});
fs.writeFileSync(${JSON.stringify(bundlePath)}, result.outputFiles[0].text);
`;
  fs.writeFileSync(driverPath, driverSource);
  try {
    execFileSync("node", [driverPath], { cwd: REPO_ROOT, stdio: "pipe" });
    const mod = (await import(`file://${bundlePath}`)) as {
      default: unknown;
    };
    return mod.default;
  } finally {
    fs.rmSync(harnessPath, { force: true });
    fs.rmSync(bundlePath, { force: true });
    fs.rmSync(driverPath, { force: true });
  }
}

// ── 3. 렌더 케이스 ─────────────────────────────────────────────────────
//
// AdmissionSurface 는 표면 CSS 전량을 <style> 하나로 뱉는다. 그 본문까지
// 골든에 박으면 (a) 픽스처가 수십 KB로 불고 (b) 이 게이트가 "표면 CSS
// 게이트"로 변질된다. 껍데기 골든의 관심사가 아니므로 <style> 본문은
// sha256 로 접는다 — 내용이 바뀌면 해시가 바뀌므로 민감도는 유지된다.

function foldStyleBodies(html: string): string {
  return html.replace(/<style>([\s\S]*?)<\/style>/g, (_all, body) => {
    const sha = crypto
      .createHash("sha256")
      .update(body)
      .digest("hex")
      .slice(0, 16);
    return `<style>[folded len=${body.length} sha256=${sha}]</style>`;
  });
}

// 이 파일 상단 헤더 주석 "새 파이프라인의 두 가지 제약과 해법 §2" 참고 —
// Base UI Dialog Portal/Popup의 React useId 기반 순번 id를 플레이스홀더로
// 접어 렌더 호출 누적 횟수와 무관하게 비교되도록 한다.
function normalizeDynamicIds(html: string): string {
  return html.replace(/id="_r_\d+_"/g, 'id="[id]"');
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

const CASES: Record<
  string,
  { selectedInfo: unknown; modalXScroll: { visible: boolean; width: number } }
> = {
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
  // 프록시 바가 붙는 유일한 조건은 `isHtml && modalXScroll.visible` 이다
  // (AdmissionGuidelines.tsx 원문). doc 본문 + 프록시 조합으로 하단
  // 셸/트랙/inner 인라인 width 까지 골든에 넣는다.
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
  // SafeHtml은 jsdom에 전역 DOMParser가 실재하므로(node 전용 골든이었던 구
  // ssr.json과 달리) 이 케이스에서 실제로 html을 파싱해 렌더한다 — html 분기의
  // 래퍼 마크업뿐 아니라 본문 파싱 결과까지 이 골든이 함께 고정한다.
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

async function renderAllCases(sourceText: string) {
  const { source, startLine, endLine } = buildHarnessSource(sourceText);
  const Harness = (await bundleHarness(source)) as (props: unknown) => never;

  // Base UI Dialog는 Portal로 document.body에 직접 마운트한다(testing-library
  // 자체 렌더 컨테이너 밖) — 그래서 매 케이스 document.body.innerHTML을 직접
  // 읽는다. 케이스 사이에 cleanup()으로 포털 노드까지 언마운트해 다음 케이스로
  // 새어 들어가지 않게 한다(vitest.setup.ts의 전역 afterEach(cleanup)은
  // test() 사이에만 실행되고, 이 beforeAll 안 for 루프 안에서는 직접 호출해야
  // 한다).
  const rendered: Record<string, string> = {};
  for (const [name, props] of Object.entries(CASES)) {
    render(<Harness {...(props as object)} />);
    rendered[name] = normalizeDynamicIds(
      foldStyleBodies(document.body.innerHTML),
    );
    // Base UI의 초기 포커스 이동(enqueueFocus)은 requestAnimationFrame으로
    // 지연 예약된다 — cleanup() 전에 흘려보내 다음 케이스로 넘어가기 전에
    // 정리한다(scripts/capture-admission-modal-shell-golden.mjs의 동일 지점
    // 주석 참고. 골든 값 자체엔 영향 없다 — 위에서 이미 캡처 끝).
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    cleanup();
  }
  return { rendered, startLine, endLine };
}

// ── 4. DOM 구조 골든 대조 ─────────────────────────────────────────────

let renderedCases: Record<string, string>;

beforeAll(async () => {
  const sourceText = fs.readFileSync(PAGE_PATH, "utf8");
  const result = await renderAllCases(sourceText);
  renderedCases = result.rendered;
}, 30000);

describe("DOM 구조 골든 (scripts/__fixtures__/admission-modal-shell.dom.json)", () => {
  test("케이스 집합이 골든과 일치", () => {
    const golden = JSON.parse(fs.readFileSync(DOM_FIXTURE, "utf8"));
    const goldenNames = Object.keys(golden.cases).sort();
    const actualNames = Object.keys(renderedCases).sort();
    expect(actualNames).toEqual(goldenNames);
  });

  test.each(Object.keys(CASES))(
    "dom:%s 바이트 완전 일치(id 정규화 후)",
    (name) => {
      const golden = JSON.parse(fs.readFileSync(DOM_FIXTURE, "utf8"));
      const expected: string = golden.cases[name] ?? "";
      const actual = renderedCases[name] ?? "";
      let at = 0;
      while (
        at < expected.length &&
        at < actual.length &&
        expected[at] === actual[at]
      ) {
        at += 1;
      }
      const detail =
        expected === actual
          ? "일치"
          : `바이트 불일치 @${at}\n      기대: ${JSON.stringify(expected.slice(Math.max(0, at - 60), at + 120))}\n      실제: ${JSON.stringify(actual.slice(Math.max(0, at - 60), at + 120))}`;
      expect(actual, detail).toBe(expected);
    },
  );
});

// ── 5. 브라우저 캡처 골든 무결성(자동 렌더 비교 없음) ────────────────────

describe("브라우저 캡처 골든 (scripts/__fixtures__/admission-modal-shell.browser.json)", () => {
  test("파일 존재 + 파싱 가능 + cases 비어있지 않음(수동 재캡처는 scripts/capture-admission-modal-shell-golden.mjs)", () => {
    expect(fs.existsSync(BROWSER_FIXTURE)).toBe(true);
    const golden = JSON.parse(fs.readFileSync(BROWSER_FIXTURE, "utf8"));
    expect(Object.keys(golden.cases ?? {}).length).toBeGreaterThan(0);
  });
});

// ── 6. 프록시 가로 스크롤바 배선 정적 확인 ────────────────────────────
//
// 프록시 가로 스크롤바 배선이 별도 모듈로 빠지면, effect 의존성 배열의
// `visible` 자기참조가 유지되는지 정적으로 확인한다. 이 의존성이 떨어지면
// 바 DOM 이 생긴 뒤 리스너를 붙이는 재실행이 사라져 프록시가 **무증상으로**
// 죽는다(마크업 골든은 못 잡는다).
const PROXY_MODULE = path.join(
  REPO_ROOT,
  "src/components/admission/modal/modalProxyXScroll.ts",
);

test("proxy:deps — modalProxyXScroll useEffect 의존성 배열에 visible 포함", () => {
  if (!fs.existsSync(PROXY_MODULE)) {
    // 원본 스크립트의 방어적 skip 설계를 보존한다 — 이 저장소는 이미 추출이
    // 끝난 상태(모듈 존재 확인됨)라 이 분기는 정상적으로는 타지 않는다.
    return;
  }
  const src = fs.readFileSync(PROXY_MODULE, "utf8");
  const deps = /\}\s*,\s*\[([^\]]*)\]\s*\)/g;
  const found: string[] = [];
  let m = deps.exec(src);
  while (m) {
    found.push((m[1] ?? "").replace(/\s+/g, " ").trim());
    m = deps.exec(src);
  }
  expect(
    found.some((d) => /visible/.test(d)),
    `발견한 의존성 배열: ${JSON.stringify(found)}`,
  ).toBe(true);
});

// ── 9a9f3f0 재발 방지 소스 스캔 락 ─────────────────────────────────────
//
// 커밋 9a9f3f0 이 고친 사고: 공개 모달 전용 스코프 규칙
//   .admission-modal-body .admission-scroll-table { scrollbar-width: none }
// 이 어드민 화면에 딸려 들어갔다. 공개는 그 대신 하단 프록시 바를 그리므로
// 문제가 없지만 어드민에는 프록시가 없다 — 관리자가 870px 컨테이너 안에서
// 1567px 표를 스크롤할 수단 자체를 잃었다(스크롤은 되는데 스크롤바가 안
// 보여 존재를 알 방법이 없었다).
//
// 방어는 "클래스 이름을 아예 다르게 한다"(어드민 = admission-editor-modal-body)
// 이고, 이 게이트가 그 방어를 기계로 못박는다: 아래 파일들의 **문자열 리터럴
// 안에** admission-modal-body 가 등장하면 실패다.
//
// ⚠ 나이브 grep 금지 — Admin.tsx / AdmissionSectionEditModal.tsx 의 주석에
// 이 문자열이 설명으로 등장한다(바로 이 사고를 설명하는 주석이다). 그래서
// 주석을 먼저 걷어내고 문자열 리터럴만 본다. 아래 stripCommentsKeepStrings 는
// 문자열/템플릿/정규식 상태를 추적하며 주석만 지운다(URL 의 '//' 오탐 방지).
const SCAN_TARGETS = [
  "src/pages/Admin.tsx",
  "src/components/admission/editor", // 디렉터리면 재귀
];
const FORBIDDEN_CLASS = "admission-modal-body";

function stripCommentsKeepStrings(src: string): string {
  let out = "";
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const next = src[i + 1];
    if (c === "/" && next === "/") {
      while (i < n && src[i] !== "\n") i += 1;
      continue;
    }
    if (c === "/" && next === "*") {
      i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) i += 1;
      i += 2;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      out += c;
      i += 1;
      while (i < n) {
        if (src[i] === "\\") {
          out += (src[i] ?? "") + (src[i + 1] ?? "");
          i += 2;
          continue;
        }
        out += src[i];
        if (src[i] === quote) {
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

function collectScanFiles(): string[] {
  const files: string[] = [];
  for (const target of SCAN_TARGETS) {
    const abs = path.join(REPO_ROOT, target);
    if (!fs.existsSync(abs)) continue;
    if (fs.statSync(abs).isDirectory()) {
      const walk = (dir: string) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const child = path.join(dir, entry.name);
          if (entry.isDirectory()) walk(child);
          else if (/\.(jsx?|tsx?)$/.test(entry.name)) files.push(child);
        }
      };
      walk(abs);
    } else {
      files.push(abs);
    }
  }
  return files;
}

// 주석을 걷어낸 소스에서 문자열/템플릿 리터럴만 모은다.
function stringLiteralsOf(strippedSrc: string): string[] {
  const literals: string[] = [];
  const re = /"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g;
  let m = re.exec(strippedSrc);
  while (m) {
    literals.push(m[1] ?? m[2] ?? m[3] ?? "");
    m = re.exec(strippedSrc);
  }
  return literals;
}

test("lock:no-admission-modal-body-in-admin — 어드민 소스 문자열 리터럴에 공개 전용 클래스가 없다", () => {
  const files = collectScanFiles();
  const hits: string[] = [];
  for (const file of files) {
    const stripped = stripCommentsKeepStrings(fs.readFileSync(file, "utf8"));
    for (const literal of stringLiteralsOf(stripped)) {
      if (literal.includes(FORBIDDEN_CLASS)) {
        hits.push(
          `${path.relative(REPO_ROOT, file)} → ${JSON.stringify(literal.slice(0, 120))}`,
        );
      }
    }
  }
  expect(
    hits.length,
    hits.length === 0
      ? ""
      : `어드민 소스의 문자열 리터럴에 "${FORBIDDEN_CLASS}" 가 있다 — 9a9f3f0 사고 재발 경로다. ` +
          `어드민 본문은 admission-editor-modal-body 를 써라.\n      ${hits.join("\n      ")}`,
  ).toBe(0);
});

// 스캔 자체가 공허하지 않은지(주석만 걸러내고 실제 리터럴은 잡는지) 자기 검사.
test("lock:self-check — 스캔이 주석은 무시하고 실제 className 리터럴만 잡는다", () => {
  const sample = `
    // 주석에 admission-modal-body 가 있어도 통과해야 한다
    /* 블록 주석 admission-modal-body */
    const a = 'https://example.com/x'; // URL 의 // 가 문자열을 깨면 안 된다
    const ok = 'admission-editor-modal-body flex-1';
  `;
  const bad = `${sample}\n    const bad = "admission-modal-body flex-1";`;
  const goodHits = stringLiteralsOf(stripCommentsKeepStrings(sample)).filter(
    (s) => s.includes(FORBIDDEN_CLASS),
  );
  const badHits = stringLiteralsOf(stripCommentsKeepStrings(bad)).filter((s) =>
    s.includes(FORBIDDEN_CLASS),
  );
  expect(
    goodHits.length,
    `주석 전용 샘플 히트 ${goodHits.length}(기대 0)`,
  ).toBe(0);
  expect(
    badHits.length,
    `실제 className 샘플 히트 ${badHits.length}(기대 1)`,
  ).toBe(1);
});
