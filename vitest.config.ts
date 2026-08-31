import { fileURLToPath } from "node:url";
import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config.js";

// vite.config.js의 resolve.alias("@/") · plugins(react)를 그대로 물려받는다 —
// alias를 두 곳에 따로 유지하면 어긋날 위험이 있어 mergeConfig로 단일 소스를 지킨다.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: "jsdom",
      // supabase 클라이언트 모듈이 로드 시점에 URL/키를 요구한다. 단위 테스트는
      // 네트워크를 쓰지 않으므로(로컬 스택이 꺼져 있어도 전부 통과) .env.local이
      // 없는 CI에서도 모듈 로드가 죽지 않게 더미를 깔아 준다 — 실값이 있으면 그대로 쓴다.
      env: {
        VITE_SUPABASE_URL:
          process.env.VITE_SUPABASE_URL ?? "http://127.0.0.1:54321",
        VITE_SUPABASE_ANON_KEY:
          process.env.VITE_SUPABASE_ANON_KEY ?? "sb_publishable_vitest_dummy",
      },
      // 전역 주입 대신 명시적 import(test/expect/describe from "vitest")를 쓴다 —
      // 이 저장소의 다른 곳들도 암묵적 전역에 의존하지 않는 관례를 따른다.
      globals: false,
      setupFiles: [
        fileURLToPath(new URL("./vitest.setup.ts", import.meta.url)),
      ],
      css: false,
      exclude: [
        "**/node_modules/**",
        // node:test 기반 — 아직 Vitest로 이식되지 않았다(후속 task 10.2 이후 범위).
        // vitest run에 그대로 걸리면 "No test suite found"로 CI가 깨진다.
        "api/_lib/serviceAccess.test.ts",
      ],
      coverage: {
        provider: "v8",
        reporter: ["text", "html"],
      },
    },
  }),
);
