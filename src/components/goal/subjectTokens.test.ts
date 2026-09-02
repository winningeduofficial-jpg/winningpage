import { describe, expect, test } from "vitest";
import { SUBJECT_IDS } from "../../../api/goal/workbooks";
import {
  getSubjectLabel,
  resolveSubjectId,
  WORKBOOK_SUBJECT_IDS,
} from "./subjectTokens";

// api/goal/workbooks.ts의 서버 화이트리스트(goal_workbooks_subject_check 5종)와
// 클라이언트 WORKBOOK_SUBJECT_IDS가 어긋나면, "나의 노력" 카드가 서버가 거부하는
// 과목(social/history/second_lang)으로 문제집 등록을 시도해 400을 유발한다.
describe("WORKBOOK_SUBJECT_IDS ↔ api/goal/workbooks.ts SUBJECT_IDS parity", () => {
  test("두 배열이 순서까지 완전히 같다", () => {
    expect(WORKBOOK_SUBJECT_IDS).toEqual(SUBJECT_IDS);
  });

  test("8종 타이머 카탈로그의 social/history/second_lang은 포함하지 않는다", () => {
    expect(WORKBOOK_SUBJECT_IDS).not.toContain("social");
    expect(WORKBOOK_SUBJECT_IDS).not.toContain("history");
    expect(WORKBOOK_SUBJECT_IDS).not.toContain("second_lang");
  });

  test("각 id가 resolveSubjectId/getSubjectLabel로 정상 왕복된다", () => {
    for (const id of WORKBOOK_SUBJECT_IDS) {
      expect(resolveSubjectId(getSubjectLabel(id))).toBe(id);
    }
  });
});
