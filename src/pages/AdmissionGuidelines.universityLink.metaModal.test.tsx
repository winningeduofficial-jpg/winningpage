// AdmissionGuidelines.universityLink.test.tsx의 meta:13(AdmissionMetaEditModal
// 렌더 검증)을 이 파일로 옮겼다.
//
// 왜 옮겼나
// ---------
// AdmissionMetaEditModal은 AdmissionModalShell을 통해 shadcn/ui Dialog(Base
// UI)로 렌더한다(task: AdmissionModalShell Base UI 전환). Base UI Dialog는
// Portal로 렌더하는데, meta:13의 원래 구현은 원본 파일의 vitest-environment 지시어(값:
// node) + `renderToStaticMarkup`을 썼다 — react-dom/server의
// renderToStaticMarkup은 포털을 지원하지 않아(선례:
// src/components/performance/step5/EvaluationReportModal.test.tsx 헤더 주석)
// 렌더 결과가 조용히 빈 문자열이 되고, "두 URL 라벨과 기존 값이 렌더된다"는
// 이 게이트가 통째로 무력화된다.
//
// 원본 파일의 나머지 12개 테스트는 AdmissionGuidelines.tsx/AdminEngine.tsx의
// 문자열 슬라이스 하네스만 쓰고 Portal과 무관해 vitest-environment 지시어(node)를
// 그대로 유지해도 된다 — 그래서 파일 전체를 jsdom으로 바꾸는 대신(esbuild
// 자체가 jsdom 전역과 충돌해 그 파일의 최상단 `import * as esbuild from
// "esbuild"`가 즉시 깨진다) meta:13만 이 새 파일(jsdom 기본 환경)로
// 분리했다. 자세한 esbuild/jsdom 충돌 배경과 해법은
// src/pages/AdmissionGuidelines.modalShell.test.tsx 헤더 주석 "새 파이프라인의
// 두 가지 제약과 해법" 절 참고 — 이 파일도 같은 두 제약을 그대로 따른다
// (esbuild 번들링은 자식 프로세스로 격리, 번들 import()는 jsdom이 이미 있는
// 이 프로세스에서 바로 함).
//
// 실행: npx vitest run src/pages/AdmissionGuidelines.universityLink.metaModal.test.tsx

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { cleanup, render } from "@testing-library/react";
import React from "react";
import { describe, expect, test } from "vitest";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");
const META_MODAL_REL =
  "src/components/admission/editor/AdmissionMetaEditModal.tsx";

// esbuild는 jsdom 전역과 충돌해(TextEncoder 무결성 검사, 실측 확인 — 위 헤더
// 주석 참고) 이 파일의 jsdom 환경에서 직접 import조차 못 한다. 번들링만 순수
// node 자식 프로세스로 격리한다.
async function loadModule(entryRel: string, exportName?: string) {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const bundlePath = path.join(
    REPO_ROOT,
    `.tmp-univ-link-meta-bundle-${stamp}.mjs`,
  );
  const driverPath = path.join(
    REPO_ROOT,
    `.tmp-univ-link-meta-driver-${stamp}.mjs`,
  );
  const driverSource = `import * as esbuild from "esbuild";
import fs from "node:fs";
const result = await esbuild.build({
  entryPoints: [${JSON.stringify(path.join(REPO_ROOT, entryRel))}],
  bundle: true,
  format: "esm",
  jsx: "automatic",
  jsxImportSource: "react",
  platform: "node",
  mainFields: ["module", "main"],
  alias: { "@": ${JSON.stringify(path.join(REPO_ROOT, "src"))} },
  external: ["react", "react-dom", "react-dom/client", "react/jsx-runtime"],
  write: false,
});
fs.writeFileSync(${JSON.stringify(bundlePath)}, result.outputFiles[0].text);
`;
  fs.writeFileSync(driverPath, driverSource);
  try {
    execFileSync("node", [driverPath], { cwd: REPO_ROOT, stdio: "pipe" });
    const mod = (await import(`file://${bundlePath}`)) as Record<
      string,
      unknown
    >;
    return exportName ? mod[exportName] : mod.default;
  } finally {
    fs.rmSync(bundlePath, { force: true });
    fs.rmSync(driverPath, { force: true });
  }
}

describe("대학명 → official_source_url 배선 검증 — meta:13(메타 모달)", () => {
  test('meta:13. 메타 수정 다이얼로그에 "대학명 링크 URL"·"정시모집요강 URL" 두 라벨이 모두 있고(서로 다른 컬럼), 기존 official_source_url 값이 입력칸에 실려 나온다', async () => {
    // loadModule은 esbuild가 자식 프로세스에서 번들한 컴포넌트를 동적
    // import한 결과라 정적 타입이 없다 — 원본(AdmissionGuidelines.universityLink.test.tsx의
    // 옛 meta:13)도 loadModule의 암묵적 any 반환값을 그대로 썼다.
    // biome-ignore lint/suspicious/noExplicitAny: 위 설명 참고.
    const AdmissionMetaEditModal = (await loadModule(META_MODAL_REL)) as any;
    const row = {
      id: "fixture",
      university_name: "가톨릭관동대학교",
      official_source_url: "https://ex.ac.kr/adm",
      jungsi_guideline_url: "https://ex.ac.kr/jungsi",
      is_active: true,
    };
    render(
      React.createElement(AdmissionMetaEditModal, {
        row,
        onClose: () => {},
        onSave: async () => true,
      }),
    );
    const html = document.body.innerHTML;
    cleanup();
    const hasOfficial = html.includes("대학명 링크 URL");
    const hasJungsi = html.includes("정시모집요강 URL");
    const hasValue = html.includes("https://ex.ac.kr/adm");
    const pass = hasOfficial && hasJungsi && hasValue;
    expect(pass, JSON.stringify({ hasOfficial, hasJungsi, hasValue })).toBe(
      true,
    );
  });
});
