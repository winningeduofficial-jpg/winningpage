import tsParser from "@typescript-eslint/parser";
import reactHooks from "eslint-plugin-react-hooks";

// React Compiler 규칙 검증 전용 — Biome이 이미 포맷/기본 린트를 담당하므로 이 설정은
// eslint-plugin-react-hooks(react-compiler 규칙 포함) 하나만 스코프로 좁힌다.
// @typescript-eslint/parser는 규칙 플러그인이 아니라 TS/TSX 구문을 읽기 위한 파서 의존성이다.
export default [
  {
    files: ["src/**/*.{js,jsx,ts,tsx}"],
    ...reactHooks.configs["recommended-latest"][0],
    languageOptions: {
      ...reactHooks.configs["recommended-latest"][0].languageOptions,
      parser: tsParser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
  },
];
