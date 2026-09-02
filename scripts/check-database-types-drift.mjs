// =====================================================================
// src/types/database.types.ts drift 검사 — CI(rehearse-migrations)에서
// supabase/ 변경이 있는 PR마다 마이그레이션을 전부 재생한 로컬 DB로부터
// 타입을 새로 뽑아, 커밋된 database.types.ts와 스키마가 실제로 같은지
// 확인한다. 마이그레이션 PR이 `npm run gen:types` 재생성을 빼먹으면
// 타입과 DB가 어긋난 채로 머지되는 사고를 막는다.
//
//   node scripts/check-database-types-drift.mjs <committed.ts> <generated.ts>
//
// <generated.ts>는 `supabase gen types typescript --local --schema public`
// 원본(포맷 전) 그대로 넘긴다 — 이 스크립트가 biome로 포맷까지 맞춘 뒤 비교한다.
//
// 정규화 항목(둘 다 "같은 스키마"를 가리켜도 문자 그대로는 다른 부분들)
// -----------------------------------------------------------------
//   1. 선두 "// 자동 생성 ..." 주석 — gen:types 스크립트가 커밋본에만 붙인다.
//   2. __InternalSupabase 블록(PostgrestVersion) — 원격(gen:types, 커밋본)에는
//      있고 --local 생성본에는 없다. CLI/DB 버전에 따라 값도 달라질 수 있어
//      애초에 스키마 drift 신호가 아니다.
//   3. 포맷 — 커밋본은 biome format을 거쳤다(gen:types 마지막 단계). --local
//      생성본은 안 거치므로 이 스크립트가 동일하게 포맷한다(공정 비교).
//   4. 끝 개행 — trimEnd 후 개행 1개로 통일.
// =====================================================================

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [, , committedPath, generatedPath] = process.argv;

if (!committedPath || !generatedPath) {
  console.error(
    "사용법: node scripts/check-database-types-drift.mjs <committed.ts> <generated.ts>",
  );
  process.exit(1);
}

function stripLeadingAutoGenComment(content) {
  return content.replace(/^\/\/ 자동 생성[^\n]*\n/, "");
}

function stripInternalSupabaseBlock(content) {
  // 선행 주석 줄(있으면) + __InternalSupabase: { ... }; 블록 전체를 제거한다.
  // 정확한 들여쓰기·주석 유무·PostgrestVersion 값에 기대지 않는다.
  return content.replace(
    /[ \t]*(?:\/\/[^\n]*\n[ \t]*)*__InternalSupabase:\s*\{[\s\S]*?\n[ \t]*\};\n/,
    "",
  );
}

function normalize(content) {
  let result = content.replace(/\r\n/g, "\n");
  result = stripLeadingAutoGenComment(result);
  result = stripInternalSupabaseBlock(result);
  return `${result.trimEnd()}\n`;
}

function formatWithBiome(content, referenceFilePath) {
  return execFileSync(
    "npx",
    ["biome", "format", `--stdin-file-path=${referenceFilePath}`],
    { input: content, encoding: "utf8" },
  );
}

const committedRaw = readFileSync(committedPath, "utf8");
const generatedRaw = readFileSync(generatedPath, "utf8");

// 생성본은 gen:types와 동일하게 committedPath를 참조 경로로 삼아 biome.json의
// javascript.formatter 설정(큰따옴표·세미콜론 등)을 그대로 적용받는다.
const generatedFormatted = formatWithBiome(generatedRaw, committedPath);

const committedNormalized = normalize(committedRaw);
const generatedNormalized = normalize(generatedFormatted);

if (committedNormalized === generatedNormalized) {
  console.log(`일치 — ${committedPath} 가 재생된 스키마와 같음 (drift 없음).`);
  process.exit(0);
}

const tmpDir = mkdtempSync(join(tmpdir(), "db-types-drift-"));
const committedTmp = join(tmpDir, "committed.normalized.ts");
const generatedTmp = join(tmpDir, "generated.normalized.ts");
writeFileSync(committedTmp, committedNormalized);
writeFileSync(generatedTmp, generatedNormalized);

let diffOutput = "";
try {
  diffOutput = execFileSync("diff", ["-u", committedTmp, generatedTmp], {
    encoding: "utf8",
  });
} catch (error) {
  // diff는 차이가 있으면 exit 1로 죽는다 — stdout에 unified diff가 담겨 있다.
  diffOutput = typeof error.stdout === "string" ? error.stdout : String(error);
}

const diffLines = diffOutput.split("\n").slice(0, 40).join("\n");

console.error(
  `drift 발견 — ${committedPath} 가 현재 스키마(마이그레이션 재생 결과)와 다름.\n` +
    "커밋된 database.types.ts를 이 PR의 마이그레이션 기준으로 재생성해서 함께 커밋하세요:\n" +
    "  npm run gen:types\n" +
    "(gen:types는 dev 원격 프로젝트를 대상으로 한다 — 이 PR의 마이그레이션이 dev에 " +
    "먼저 반영돼 있어야 재생성 결과가 이 CI 판정과 일치한다.)\n" +
    `\n--- ${committedPath} (정규화)\n+++ 재생된 스키마 (정규화)\n` +
    `${diffLines}\n`,
);
process.exit(1);
