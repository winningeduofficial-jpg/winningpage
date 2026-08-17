// 수행평가 사이드바 메뉴 활성 표시 회귀 검증 — scripts/verify-performance-sidebar-nav.mjs 이식.
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
// 그래서 컴포넌트는 `Link` + 커스텀 판정을 쓰고, 이 파일이 그 계약을 고정한다.
// 반대로 `end`를 붙이는 해법은 `/app/performance/:sessionId`(새로고침 복구)에서
// 채팅 메뉴가 꺼지므로 채택하지 않는다 — 그 경로도 함께 검사한다.
//
// 이식 메모(node:test → Vitest, task 10.8)
// -----------------------------------------
// 원본은 esbuild로 컴포넌트를 번들해 `react-router-dom`을 external로 남긴 뒤
// `StaticRouter`로 감쌌다(react-router-dom/server.js가 CJS 전용이라 ESM 번들 출력에서
// dynamic require가 터지는 것을 피하기 위함). Vitest는 TSX를 그대로 변환하므로 그 번들링이
// 필요 없다 — 컴포넌트를 직접 import하고, 라우터도 저장소가 실제로 쓰는 `react-router`
// 패키지(v8, task 5에서 `react-router-dom`을 대체)에서 `MemoryRouter`를 가져와 감싼다.
// `.jsx` → `.tsx` 경로 드리프트: `PerformanceSidebar.jsx` → `PerformanceSidebar.tsx`.

import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, test } from "vitest";
import PerformanceSidebar from "./PerformanceSidebar";

// 검사 경로 4종. §3.4 메뉴 정본 + P13 세션 복구 라우트(`/app/performance/:sessionId`).
const CASES = [
  { pathname: "/app/performance", expected: "위닝 채팅" },
  {
    pathname: "/app/performance/8f1c2b3d-0000-4000-8000-000000000001",
    expected: "위닝 채팅",
  },
  { pathname: "/app/performance/reports", expected: "저장 리포트" },
  {
    pathname: "/app/performance/reports/8f1c2b3d-0000-4000-8000-000000000002",
    expected: "저장 리포트",
  },
] as const;

function render(pathname: string) {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[pathname]}>
      <PerformanceSidebar />
    </MemoryRouter>,
  );
}

// <a ...>라벨</a> 를 통째로 집어 속성과 텍스트를 함께 본다.
function collectAnchors(html: string) {
  const anchors: { attrs: string; text: string }[] = [];
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/g;
  for (const m of html.matchAll(re)) {
    anchors.push({
      attrs: m[1] as string,
      text: (m[2] as string).replace(/<[^>]*>/g, "").trim(),
    });
  }
  return anchors;
}

describe.each(CASES)("$pathname", ({ pathname, expected }) => {
  const html = render(pathname);
  const anchors = collectAnchors(html);

  test("메뉴 <a>가 정확히 2개다(§3.4 — 세 번째 항목 '설정'은 범위 밖)", () => {
    expect(anchors).toHaveLength(2);
  });

  test('aria-current="page"가 정확히 1개이고 기대 항목에 있다(NavLink 회귀 방지)', () => {
    const current = anchors.filter((a) => /aria-current="page"/.test(a.attrs));
    expect(
      current.length,
      `[${current.map((a) => a.text).join(", ")}] — NavLink로 되돌아갔거나 활성 판정이 깨졌다`,
    ).toBe(1);
    expect(current[0]?.text).toBe(expected);
  });

  test("NavLink 잔재인 리터럴 'active' 클래스가 새어 나오지 않는다", () => {
    expect(/class="[^"]*\bactive\b[^"]*"/.test(html)).toBe(false);
  });

  test("활성 pill이 정확히 1개다(시안 3754:3121 — pill은 이동한다)", () => {
    const pillCount = anchors.filter((a) =>
      /\bbg-performance-activePill\b(?!\/)/.test(a.attrs),
    ).length;
    expect(pillCount).toBe(1);
  });

  test("<nav>의 aria-labelledby ↔ '메뉴' id 연결이 유지된다", () => {
    expect(html.includes('aria-labelledby="perf-nav-heading"')).toBe(true);
    expect(html.includes('id="perf-nav-heading"')).toBe(true);
  });

  test("<section>의 aria-labelledby ↔ '진행단계' id 연결이 유지된다", () => {
    expect(html.includes('aria-labelledby="perf-steps-heading"')).toBe(true);
    expect(html.includes('id="perf-steps-heading"')).toBe(true);
  });
});
