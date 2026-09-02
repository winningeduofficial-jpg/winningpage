// 계획↔문제집 연결(QA 행286-B) 필드 검증 — workbookId/pageFrom/pageTo의 "형태"만
// 검증한다(소유자·total_pages 확인은 DB 조회가 필요해 handler 몫, 여기선 다루지
// 않는다). workbooks.pages.test.ts와 동일하게 handler 밖으로 뽑은 순수 검증
// 함수를 직접 부른다.
import { expect, test } from "vitest";
import {
  validateWeeklyRepeatWithWorkbook,
  validateWorkbookLinkFields,
} from "./plan-tasks.js";

test("세 필드가 전부 없으면 손대지 않음(value undefined)", () => {
  const result = validateWorkbookLinkFields({ title: "문제 풀기" });
  expect(result.error).toBeUndefined();
  expect(result.value).toBeUndefined();
});

test("workbookId만 있으면 페이지 없이 연결만 반영한다", () => {
  const result = validateWorkbookLinkFields({ workbookId: 7 });
  expect(result.value).toEqual({
    workbook_id: 7,
    page_from: null,
    page_to: null,
  });
});

test("workbookId + pageFrom + pageTo가 모두 있으면 그대로 담는다", () => {
  const result = validateWorkbookLinkFields({
    workbookId: 7,
    pageFrom: 10,
    pageTo: 20,
  });
  expect(result.value).toEqual({ workbook_id: 7, page_from: 10, page_to: 20 });
});

test("pageFrom > pageTo면 400", () => {
  const result = validateWorkbookLinkFields({
    workbookId: 7,
    pageFrom: 30,
    pageTo: 20,
  });
  expect(result.error?.status).toBe(400);
  expect(result.error?.body.detail).toContain("시작 페이지는 끝 페이지보다");
});

test("pageFrom만 있고 pageTo가 없으면 400", () => {
  const result = validateWorkbookLinkFields({ workbookId: 7, pageFrom: 10 });
  expect(result.error?.status).toBe(400);
  expect(result.error?.body.detail).toContain("시작과 끝을 함께");
});

test("workbookId 없이 pageFrom/pageTo만 있으면 400", () => {
  const result = validateWorkbookLinkFields({ pageFrom: 10, pageTo: 20 });
  expect(result.error?.status).toBe(400);
  expect(result.error?.body.detail).toContain("문제집을 선택해야");
});

test("workbookId:null은 연결 해제로 처리한다", () => {
  const result = validateWorkbookLinkFields({ workbookId: null });
  expect(result.value).toEqual({
    workbook_id: null,
    page_from: null,
    page_to: null,
  });
});

test("workbookId:null과 페이지 범위를 함께 보내면 400", () => {
  const result = validateWorkbookLinkFields({
    workbookId: null,
    pageFrom: 10,
    pageTo: 20,
  });
  expect(result.error?.status).toBe(400);
  expect(result.error?.body.detail).toContain("연결을 해제할 때는");
});

test("workbookId가 정수가 아니면 400", () => {
  const result = validateWorkbookLinkFields({ workbookId: "abc" });
  expect(result.error?.status).toBe(400);
  expect(result.error?.body.detail).toContain("문제집 id가 올바르지");
});

test("pageFrom/pageTo가 1 미만이면 400", () => {
  const result = validateWorkbookLinkFields({
    workbookId: 7,
    pageFrom: 0,
    pageTo: 10,
  });
  expect(result.error?.status).toBe(400);
});

test("weeklyRepeat와 workbook_id가 함께 있으면 400", () => {
  const error = validateWeeklyRepeatWithWorkbook(
    { weeklyRepeat: true },
    { workbook_id: 7, page_from: null, page_to: null },
  );
  expect(error?.status).toBe(400);
  expect(error?.body.detail).toContain("매주 반복으로 만들 수 없습니다");
});

test("weeklyRepeat가 있어도 문제집 연결이 없으면 통과한다", () => {
  const error = validateWeeklyRepeatWithWorkbook(
    { weeklyRepeat: true },
    undefined,
  );
  expect(error).toBeNull();
});

test("문제집이 연결돼 있어도 weeklyRepeat가 없으면 통과한다(이번 주만은 허용)", () => {
  const error = validateWeeklyRepeatWithWorkbook(
    {},
    { workbook_id: 7, page_from: 10, page_to: 20 },
  );
  expect(error).toBeNull();
});
