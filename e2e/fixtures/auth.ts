import path from "node:path";
import { type BrowserContext, test as base, type Page } from "@playwright/test";

// 로그인 QA 계정은 여기에 하드코딩하지 않는다 — 로컬 QA 계정 자격증명은 팀
// 메모리(계정 발급 이력·회전 여부 포함)에 기록되어 있으니 그쪽을 확인할 것.
// 이 픽스처는 그 값을 환경변수로만 받는다.
const E2E_STUDENT_EMAIL = process.env.E2E_STUDENT_EMAIL;
const E2E_STUDENT_PASSWORD = process.env.E2E_STUDENT_PASSWORD;

const STORAGE_STATE_PATH = path.join(
  process.cwd(),
  "test-results",
  ".auth",
  "student.json",
);

// 러너 프로세스당 한 번만 로그인해 storageState를 재사용한다(테스트마다 새로
// 로그인하면 느리고, 세션 정책상 dev는 다중 로그인 허용이라 충돌도 없다 —
// [[session-policy-dev-vs-prod]]). 병렬 워커 사이 경쟁을 피하려고 모듈 스코프
// 캐시 Promise로 한 번만 계산한다.
let storageStatePromise: Promise<string> | undefined;

async function createStorageState(page: Page): Promise<string> {
  if (!E2E_STUDENT_EMAIL || !E2E_STUDENT_PASSWORD) {
    throw new Error(
      "E2E_STUDENT_EMAIL / E2E_STUDENT_PASSWORD 환경변수가 없다. 로컬 QA 학생 계정으로 채워서 실행할 것.",
    );
  }

  await page.goto("/login");
  await page.locator("#login-email").fill(E2E_STUDENT_EMAIL);
  await page.locator("#login-password").fill(E2E_STUDENT_PASSWORD);
  await page.getByRole("button", { name: "로그인" }).click();
  // 로그인 성공 시 /login을 벗어난다 — 목적지는 계정 종류(학생/학부모)에 따라
  // 갈리므로 특정 경로를 기다리지 않고 URL 전환만 확인한다.
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));

  await page.context().storageState({ path: STORAGE_STATE_PATH });
  return STORAGE_STATE_PATH;
}

// Playwright 공식 test.extend<TestFixtures, WorkerFixtures> 패턴 그대로다 —
// 테스트 스코프 픽스처를 추가하지 않으므로 첫 제네릭은 빈 객체. `Record<string, never>`로
// 바꾸면 인덱스 시그니처가 WorkerFixtures의 authStorageStatePath 키와 충돌해 타입 에러가
// 난다 — `{}`가 맞다.
// biome-ignore lint/complexity/noBannedTypes: playwright 공식 시그니처, object/Record로 바꾸면 타입 충돌
export const test = base.extend<{}, { authStorageStatePath: string }>({
  authStorageStatePath: [
    async ({ browser }, use) => {
      storageStatePromise ??= (async () => {
        const context: BrowserContext = await browser.newContext();
        const page = await context.newPage();
        try {
          return await createStorageState(page);
        } finally {
          await context.close();
        }
      })();
      await use(await storageStatePromise);
    },
    { scope: "worker" },
  ],
});

export { expect } from "@playwright/test";
