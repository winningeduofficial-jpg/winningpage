import { describe, expect, it } from "vitest";
import { parseReportId } from "./alimtalkLinkRoutes";

// reportId 변수값 파서 회귀 테스트(QA 시트 행210) — 구 형식(기간키만)과 신 형식
// (기간키.학생profile id)을 둘 다 받아야 한다. 발신 파이프라인이 바뀌어도 이미
// 발송된 과거 알림톡(구 형식)의 링크는 계속 유효해야 하기 때문이다.
describe("parseReportId", () => {
  it("빈 값은 둘 다 undefined로 접는다", () => {
    expect(parseReportId(undefined)).toEqual({
      at: undefined,
      studentProfileId: undefined,
    });
    expect(parseReportId("")).toEqual({
      at: undefined,
      studentProfileId: undefined,
    });
  });

  it("구 형식(주간, '.' 없음)은 전체를 at으로 본다", () => {
    expect(parseReportId("2026-08-17")).toEqual({
      at: "2026-08-17",
      studentProfileId: undefined,
    });
  });

  it("구 형식(월간, '.' 없음)은 전체를 at으로 본다", () => {
    expect(parseReportId("2026-08")).toEqual({
      at: "2026-08",
      studentProfileId: undefined,
    });
  });

  it("신 형식(주간.학생id)은 첫 '.'로 나눈다", () => {
    expect(
      parseReportId("2026-08-17.3f2a9c1e-aaaa-bbbb-cccc-000000000000"),
    ).toEqual({
      at: "2026-08-17",
      studentProfileId: "3f2a9c1e-aaaa-bbbb-cccc-000000000000",
    });
  });

  it("신 형식(월간.학생id)은 첫 '.'로 나눈다", () => {
    expect(parseReportId("2026-08.3f2a9c1e-uuid")).toEqual({
      at: "2026-08",
      studentProfileId: "3f2a9c1e-uuid",
    });
  });

  it("'.'로 시작하면 at은 undefined, studentProfileId만 남는다", () => {
    expect(parseReportId(".3f2a9c1e-uuid")).toEqual({
      at: undefined,
      studentProfileId: "3f2a9c1e-uuid",
    });
  });

  it("'.'로 끝나면 studentProfileId는 undefined, at만 남는다", () => {
    expect(parseReportId("2026-08-17.")).toEqual({
      at: "2026-08-17",
      studentProfileId: undefined,
    });
  });

  it("'.' 하나뿐이면 둘 다 undefined", () => {
    expect(parseReportId(".")).toEqual({
      at: undefined,
      studentProfileId: undefined,
    });
  });

  it("쓰레기값(공백·특수문자)도 첫 '.' 기준으로 그대로 나눈다", () => {
    expect(parseReportId("garbage value")).toEqual({
      at: "garbage value",
      studentProfileId: undefined,
    });
    expect(parseReportId("a.b.c")).toEqual({
      at: "a",
      studentProfileId: "b.c",
    });
  });
});
