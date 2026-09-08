// 인앱 타입 스케일 토큰 전환(Group 2/4, [[app-shell-shadcn-unification]])의 시각 회귀
// 스모크. 목표관리(goal) 인앱 화면은 아직 커버하지 않는다 — 로컬 DB에 목표관리
// 학생 시드 행이 없어 로그인해도 온보딩으로 튕기거나 빈 상태만 보인다. 로컬
// 목표관리 시드가 생기면 이 파일에 `/app/goal/*` 스펙을 추가할 것.
//
// 수행평가 인앱 화면(/app/performance, /app/performance/reports)은 RequireEntitlement
// 가드를 통과해야 한다 — QA 학생 계정에 suhaeng 이용권(program_access_grants) 이
// 없으면 /pricing으로 리다이렉트되고 스크린샷이 셸이 아니라 랜딩을 찍는다.
// ([[local-e2e-api-stack-setup]] 참고, QA 학생은 program_access_grants 행 필요)
//
// 서버는 이 config가 띄우지 않는다 — 5303에 미리 떠 있는 로컬 dev 서버를 대상으로
// 돈다(playwright.config.ts 상단 주석 참고).
import { expect, test } from "./fixtures/auth";

// 카드 등장 애니메이션·스켈레톤 스피너 등 시간에 따라 달라지는 영역을 가리는
// 방어적 목록. `animations: "disabled"`(playwright.config.ts)가 CSS 트랜지션/
// 애니메이션은 이미 종결 상태로 고정해 주므로, 여기서는 그 밖의 동적 텍스트
// (스피너류)만 최소한으로 가린다. 매칭되는 요소가 없으면 마스크는 조용히 no-op이다.
function dynamicRegionMasks(page: import("@playwright/test").Page) {
  return [page.locator(".animate-pulse"), page.locator(".animate-spin")];
}

test.describe("서비스 랜딩 시각 스모크", () => {
  test("목표관리 랜딩 (/services/goal)", async ({ page }) => {
    await page.goto("/services/goal");
    await expect(page).toHaveScreenshot("goal-landing.png", {
      fullPage: true,
      mask: dynamicRegionMasks(page),
    });
  });

  test("수행평가 랜딩 (/services/performance)", async ({ page }) => {
    await page.goto("/services/performance");
    await expect(page).toHaveScreenshot("performance-landing.png", {
      fullPage: true,
      mask: dynamicRegionMasks(page),
    });
  });
});

test.describe("수행평가 인앱 셸 시각 스모크", () => {
  // 내장 `storageState` 픽스처를 우리 `authStorageStatePath`(워커 스코프, 최초 1회
  // 로그인)에 위임한다 — 테스트마다 다시 로그인하지 않는다.
  test.use({
    storageState: async ({ authStorageStatePath }, use) => {
      await use(authStorageStatePath);
    },
  });

  test("채팅 셸 (/app/performance)", async ({ page }) => {
    await page.goto("/app/performance");
    await expect(page).toHaveScreenshot("performance-chat-shell.png", {
      mask: dynamicRegionMasks(page),
    });
  });

  test("저장 리포트 (/app/performance/reports)", async ({ page }) => {
    await page.goto("/app/performance/reports");
    await expect(page).toHaveScreenshot("performance-reports-shell.png", {
      mask: dynamicRegionMasks(page),
    });
  });
});
