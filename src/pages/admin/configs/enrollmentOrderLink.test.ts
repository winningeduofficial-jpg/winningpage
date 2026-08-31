// 수강 신청 내역 ↔ 주문 연결 회귀 테스트 (QA 272).
//
// 이 배선의 위험은 로직이 아니라 **세 곳이 따로 논다**는 데 있다:
//   마이그레이션이 만든 뷰 / config.listTable(읽기) / config.listOnlyColumns(쓰기 제외).
// 뷰에 파생 컬럼을 하나 더 넣고 listOnlyColumns 에 안 적으면, 목록은 멀쩡히 뜨는데
// **수정 저장만 42703 으로 죽는다** — 편집 폼이 목록 행을 그대로 form 으로 받기
// 때문이다. 화면을 열어보는 것만으로는 안 드러나는 종류의 고장이라 여기서 묶는다.

import fs from "node:fs";
import path from "node:path";
import { expect, test } from "vitest";

import { memberConfigs } from "./member";

const REPO_ROOT = path.resolve(import.meta.dirname, "../../../..");
const MIGRATION =
  "supabase/migrations/20260831053500_enrollments_order_link.sql";

const sql = fs.readFileSync(path.join(REPO_ROOT, MIGRATION), "utf8");

const enrollments = memberConfigs.enrollments as {
  table: string;
  listTable?: string;
  listOnlyColumns?: string[];
  listFilter?: { key: string; allLabel: string };
  columns: { key: string; label: string }[];
  fields: { key: string; label: string }[];
};

/** 뷰에서 `... as alias` 로 새로 만든 컬럼 이름들. 원본 컬럼(e.x)에는 별칭이 없다. */
function derivedViewColumns(): string[] {
  const body = sql.slice(sql.indexOf("create or replace view"));
  return [...body.matchAll(/^\s+\S.*?\sas\s+([a-z_]+),?$/gim)]
    .map((match) => match[1])
    .filter((name): name is string => Boolean(name));
}

test("쓰기는 원본 테이블로, 읽기만 뷰로 간다", () => {
  expect(enrollments.table).toBe("enrollments");
  expect(enrollments.listTable).toBe("admin_enrollment_entries");
});

test("뷰가 만든 파생 컬럼은 전부 listOnlyColumns 에 있다", () => {
  const derived = derivedViewColumns();

  expect(derived.length).toBeGreaterThan(0);
  for (const column of derived) {
    expect(
      enrollments.listOnlyColumns,
      `${column} 이 listOnlyColumns 에 없다 — 수정 저장이 42703 으로 죽는다`,
    ).toContain(column);
  }
});

test("파생 컬럼은 편집 필드로 노출하지 않는다", () => {
  // 주문에서 따라오는 값이라 사람이 고칠 값이 아니고, 고쳐도 저장 때 버려진다.
  const fieldKeys = enrollments.fields.map((field) => field.key);
  for (const column of enrollments.listOnlyColumns || []) {
    expect(fieldKeys, `${column} 이 편집 필드에 있다`).not.toContain(column);
  }
});

test("연결 키(order_id)는 편집 필드에 있고 목록 컬럼에는 없다", () => {
  // 어드민이 손으로 넣어야 채워지는 값이라 폼에는 있어야 하고,
  // 목록은 그 결과(결제방식·승인번호)를 보여주므로 원문 주문번호까지 띄우지 않는다.
  expect(enrollments.fields.map((f) => f.key)).toContain("order_id");
  expect(enrollments.columns.map((c) => c.key)).not.toContain("order_id");
});

test("목록에 QA 272 가 요구한 세 항목이 있다", () => {
  const columnKeys = enrollments.columns.map((column) => column.key);
  expect(columnKeys).toContain("phone");
  expect(columnKeys).toContain("payment_method");
  expect(columnKeys).toContain("approval_no");
});

test("뷰는 security_invoker 로 만든다 (RLS 우회 방지)", () => {
  expect(sql).toMatch(/with \(security_invoker = on\)/i);
});

test("승인번호는 payment_key 로 대체하지 않는다", () => {
  // payment_key 는 결제 토큰이지 승인번호가 아니다. 대사(對査)에 쓰면 틀린 값이
  // 되므로, 카드가 아니면 NULL 인 채로 둔다.
  expect(sql).toContain("'approveNo'");
  expect(sql).not.toMatch(/coalesce\([^)]*approveNo[^)]*payment_key/i);
});

// --- QA 227 상단 서비스 필터 -------------------------------------------------

test("서비스 필터는 종목 컬럼을 보고, 선택지를 하드코딩하지 않는다", () => {
  const filter = enrollments.listFilter;

  expect(filter?.key).toBe("category_name");
  expect(filter?.allLabel).toBeTruthy();
  // options 를 config 에 박아두면 종목이 늘 때 화면만 옛 목록으로 남는다 —
  // 실제 행에서 뽑는 설계라 config 에는 키와 '전체' 라벨만 있어야 한다.
  expect(Object.keys(filter ?? {}).sort()).toEqual(["allLabel", "key"]);
});

test("필터 대상 컬럼은 목록에 실제로 있는 컬럼이다", () => {
  const columnKeys = enrollments.columns.map((column) => column.key);
  expect(columnKeys).toContain(enrollments.listFilter?.key);
});
