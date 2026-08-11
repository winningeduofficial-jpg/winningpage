// =====================================================================
// 수행평가 사이드바 메뉴 활성 표시 회귀 검증
//
// 무엇을 막는가
// -------------
// `PerformanceSidebar`의 메뉴 2항목은 **상호 배타**다 — 시안 `3754:3121`에서 pill이
// `저장 리포트`로 **이동**하고 `위닝 채팅` 쪽 pill은 사라진다. 그런데 활성 판정을
// react-router의 `NavLink`에 맡기면 이 규칙이 조용히 깨진다:
//
//   NavLink는 `aria-current` prop을 자기 기본값(`ariaCurrentProp = 'page'`)으로 흡수하고
//   **라우터 자체의 prefix 매칭**으로 다시 계산해 내보낸다
//   (`let ariaCurrent = isActive ? ariaCurrentProp : undefined`).
//   `to="/app/performance"`에 `end`가 없으면 `/app/performance/reports`도 prefix로 걸려
//   두 항목이 동시에 `aria-current="page"`가 된다. 시각적으로는 pill이 하나뿐이라
//   눈으로는 절대 안 보이고, 스크린리더에서만 「현재 페이지」가 2개로 들린다.
//
// 그래서 컴포넌트는 `Link` + 커스텀 판정을 쓰고, 이 스크립트가 그 계약을 고정한다.
// 반대로 `end`를 붙이는 해법은 `/app/performance/:sessionId`(새로고침 복구)에서
// 채팅 메뉴가 꺼지므로 채택하지 않는다 — 그 경로도 함께 검사한다.
//
// 어떻게 도는가
// -------------
// 실제 컴포넌트 파일을 esbuild로 번들해 `StaticRouter` 아래에서
// `renderToStaticMarkup` 한다. 사본이 아니라 배포되는 소스를 직접 검사한다.
// (하네스 방식은 scripts/verify-admission-modal-shell.mjs 와 동일 관례.)
//
//   node scripts/verify-performance-sidebar-nav.mjs
// =====================================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as esbuild from 'esbuild';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// 검사 경로 4종. §3.4 메뉴 정본 + P13 세션 복구 라우트(`/app/performance/:sessionId`).
const CASES = [
  { pathname: '/app/performance', expected: '위닝 채팅' },
  { pathname: '/app/performance/8f1c2b3d-0000-4000-8000-000000000001', expected: '위닝 채팅' },
  { pathname: '/app/performance/reports', expected: '저장 리포트' },
  {
    pathname: '/app/performance/reports/8f1c2b3d-0000-4000-8000-000000000002',
    expected: '저장 리포트'
  }
];

const HARNESS = `
import React from 'react';
import { StaticRouter } from 'react-router-dom/server.js';
import PerformanceSidebar from './src/components/performance/PerformanceSidebar.jsx';

export default function Harness({ pathname }) {
  return (
    <StaticRouter location={pathname}>
      <PerformanceSidebar />
    </StaticRouter>
  );
}
`;

async function loadHarness() {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const harnessPath = path.join(REPO_ROOT, `.tmp-perf-sidebar-harness-${stamp}.jsx`);
  const bundlePath = path.join(REPO_ROOT, `.tmp-perf-sidebar-bundle-${stamp}.mjs`);
  fs.writeFileSync(harnessPath, HARNESS);
  try {
    const result = await esbuild.build({
      entryPoints: [harnessPath],
      bundle: true,
      format: 'esm',
      jsx: 'automatic',
      jsxImportSource: 'react',
      platform: 'node',
      mainFields: ['module', 'main'],
      // react-router-dom/server.js 는 CJS 진입점뿐이라(exports 맵도 module 필드도 없다)
      // 번들에 끌어들이면 dynamic require('react') 가 ESM 출력에서 터진다. 그리고
      // StaticRouter와 useLocation이 **같은 react-router 인스턴스**를 봐야 하므로
      // react-router-dom 본체도 함께 external로 빼 Node의 CJS 해석 하나로 통일한다.
      external: [
        'react',
        'react-dom',
        'react/jsx-runtime',
        'react-dom/server',
        'react-router-dom',
        'react-router-dom/server.js'
      ],
      write: false
    });
    fs.writeFileSync(bundlePath, result.outputFiles[0].text);
    const mod = await import(`file://${bundlePath}`);
    return mod.default;
  } finally {
    fs.rmSync(harnessPath, { force: true });
    fs.rmSync(bundlePath, { force: true });
  }
}

// <a ...>라벨</a> 를 통째로 집어 속성과 텍스트를 함께 본다.
function collectAnchors(html) {
  const anchors = [];
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    anchors.push({ attrs: m[1], text: m[2].replace(/<[^>]*>/g, '').trim() });
  }
  return anchors;
}

const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

const Harness = await loadHarness();

for (const { pathname, expected } of CASES) {
  const html = renderToStaticMarkup(React.createElement(Harness, { pathname }));
  const anchors = collectAnchors(html);

  check(
    anchors.length === 2,
    `${pathname}: 메뉴 <a>가 2개여야 하는데 ${anchors.length}개다 (§3.4 — 세 번째 항목 '설정'은 범위 밖)`
  );

  const current = anchors.filter((a) => /aria-current="page"/.test(a.attrs));
  check(
    current.length === 1,
    `${pathname}: aria-current="page"가 정확히 1개여야 하는데 ${current.length}개다` +
      ` [${current.map((a) => a.text).join(', ')}] — NavLink로 되돌아갔거나 활성 판정이 깨졌다`
  );
  check(
    current.length !== 1 || current[0].text === expected,
    `${pathname}: aria-current가 '${expected}'에 있어야 하는데 '${current[0]?.text}'에 있다`
  );

  // NavLink가 문자열 className에 덧붙이는 리터럴 클래스가 새어 나오면 안 된다.
  check(
    !/class="[^"]*\bactive\b[^"]*"/.test(html),
    `${pathname}: NavLink 잔재인 리터럴 'active' 클래스가 렌더됐다`
  );

  // 활성 pill 역시 정확히 1개 — 시각 표시와 aria가 갈라지지 않게 함께 고정한다.
  const pillCount = anchors.filter((a) =>
    /\bbg-performance-activePill\b(?!\/)/.test(a.attrs)
  ).length;
  check(
    pillCount === 1,
    `${pathname}: 활성 pill이 정확히 1개여야 하는데 ${pillCount}개다 (시안 3754:3121 — pill은 이동한다)`
  );

  // 랜드마크 이름 — 보이는 라벨을 id로 묶어 둔 계약.
  check(
    html.includes('aria-labelledby="perf-nav-heading"') && html.includes('id="perf-nav-heading"'),
    `${pathname}: <nav>의 aria-labelledby ↔ '메뉴' id 연결이 끊겼다`
  );
  check(
    html.includes('aria-labelledby="perf-steps-heading"') &&
      html.includes('id="perf-steps-heading"'),
    `${pathname}: <section>의 aria-labelledby ↔ '진행단계' id 연결이 끊겼다`
  );
}

if (failures.length > 0) {
  console.error('✗ 수행평가 사이드바 메뉴 활성 표시 검증 실패');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(`✓ 수행평가 사이드바 메뉴 활성 표시 검증 통과 (경로 ${CASES.length}종)`);
