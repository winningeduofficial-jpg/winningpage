// 「위닝 생기부 DB」 메뉴 제거의 회귀 테스트 (QA 230).
//
// 배경: 생기부(학교생활기록부) 원문 보관이 2026-07-29부터 불법이라는 위닝측
// 지적으로 메뉴를 통째로 내렸다. 기능 개선이 아니라 **법률 요구**라, 되살아나면
// 화면 하나가 늘어나는 정도가 아니라 규제 위반이 된다.
//
// 이 메뉴는 한 군데가 아니라 네 군데에 흩어져 있었다 — 라우트 목록·사이드바·
// CONFIGS·권한 마스터(DB). 하나라도 남으면 증상이 제각각이다:
//   - adminSectionKeys 만 남으면 URL 직접 입력으로 들어가진다.
//   - Admin.tsx 만 남으면 사이드바에 뜨는데 눌러도 빈 화면이다.
//   - admin_resources 만 남으면 권한 화면에 화면 없는 유령 항목이 뜬다.
// 그래서 "키 문자열이 어디에도 살아 있지 않다"를 통째로 잠근다.

import fs from "node:fs";
import path from "node:path";
import { expect, test } from "vitest";

import { ADMIN_SECTION_KEYS } from "./adminSectionKeys";

const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");
const KEY = "winningStudentRecordDb";
const LABEL = "위닝 생기부 DB";

const read = (rel: string) =>
  fs.readFileSync(path.join(REPO_ROOT, rel), "utf8");

test("ADMIN_SECTION_KEYS 에 없다 — 라우트가 생기지 않는다", () => {
  expect(ADMIN_SECTION_KEYS).not.toContain(KEY);
});

test("사이드바(Admin.tsx)·CONFIGS(configs/winning.ts) 어디에도 키와 라벨이 없다", () => {
  for (const rel of [
    "src/pages/Admin.tsx",
    "src/pages/admin/configs/winning.ts",
  ]) {
    const src = read(rel);
    expect(src, `${rel} 에 ${KEY} 가 남아 있다`).not.toContain(KEY);
    expect(src, `${rel} 에 "${LABEL}" 라벨이 남아 있다`).not.toContain(LABEL);
  }
});

// 마이그레이션은 누적이라 과거 파일(20260822000010·20260823000002)에는 이 키를
// insert 하는 줄이 그대로 남아 있다 — 지울 수 없고 지워서도 안 된다. 대신 이 키를
// 언급하는 **마지막** 마이그레이션이 delete 여야 한다. 누군가 뒤에 다시 시드하면
// 파일명 정렬상 그 파일이 마지막이 되므로 여기서 걸린다.
test("이 키를 언급하는 마지막 마이그레이션은 admin_resources 에서 지우는 쪽이다", () => {
  const dir = path.join(REPO_ROOT, "supabase/migrations");
  const mentioning = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .filter((f) => fs.readFileSync(path.join(dir, f), "utf8").includes(KEY));

  expect(
    mentioning.length,
    "키를 언급하는 마이그레이션이 하나도 없다",
  ).toBeGreaterThan(0);

  const last = mentioning.at(-1) as string;
  const sql = fs.readFileSync(path.join(dir, last), "utf8");
  const statements = sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");

  expect(statements, `${last} 에 delete 문이 없다`).toMatch(
    /delete\s+from\s+public\.admin_resources[\s\S]*?winningStudentRecordDb/i,
  );
  expect(statements, `${last} 이 키를 다시 시드한다`).not.toMatch(
    /insert\s+into\s+public\.admin_resources/i,
  );
});
