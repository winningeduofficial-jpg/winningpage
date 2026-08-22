// useNavGroups.ts의 normalizeMenuLabel(메뉴 라벨 상시 치환) 회귀 테스트.
//
// 배경(QA 리뷰): DB(page_contents.menu_label)는 운영자 몫이라 직접 고치지 못하는
// 문자열이 두 종류 섞여 들어온다 — '컬럼'(오타, 정본은 '칼럼')과 구 라벨
// '수시정시합격'(신 라벨은 '대입합격'). 이 함수가 실패하면 헤더/푸터 메뉴에
// 오타·구 라벨이 그대로 노출된다. DB·Supabase 없이 순수 문자열 함수만 검증한다.

import { expect, test } from "vitest";
import { normalizeMenuLabel } from "./useNavGroups";

test("구 라벨 '수시정시합격'을 '대입합격'으로 치환한다", () => {
  expect(normalizeMenuLabel("수시정시합격")).toBe("대입합격");
});

test("오타 '컬럼'을 '칼럼'으로 치환한다", () => {
  expect(normalizeMenuLabel("컬럼")).toBe("칼럼");
});

test("메뉴 라벨이 아닌 일반 문자열은 그대로 둔다", () => {
  expect(normalizeMenuLabel("입결정보")).toBe("입결정보");
  expect(normalizeMenuLabel("대입모집요강")).toBe("대입모집요강");
});

test("공백은 trim되고, null/undefined는 빈 문자열이 된다", () => {
  expect(normalizeMenuLabel("  대입합격  ")).toBe("대입합격");
  expect(normalizeMenuLabel(null)).toBe("");
  expect(normalizeMenuLabel(undefined)).toBe("");
});
