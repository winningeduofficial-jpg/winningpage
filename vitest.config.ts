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
      // 전역 주입 대신 명시적 import(test/expect/describe from "vitest")를 쓴다 —
      // 이 저장소의 다른 곳들도 암묵적 전역에 의존하지 않는 관례를 따른다.
      globals: false,
      setupFiles: [
        fileURLToPath(new URL("./vitest.setup.ts", import.meta.url)),
      ],
      css: false,
      coverage: {
        provider: "v8",
        reporter: ["text", "html"],
      },
    },
  }),
);
