import { describe, expect, it } from "vitest";
import { buildGoalReportFileName } from "./goalReportFileName";

describe("buildGoalReportFileName", () => {
  it("주간 리포트는 periodLabel의 시작일(YYYY-MM-DD)까지 그대로 붙인다", () => {
    expect(
      buildGoalReportFileName({
        period: "weekly",
        periodLabel: "2026-08-17 ~ 2026-08-23",
      }),
    ).toBe("목표관리_주간리포트_2026-08-17");
  });

  it("월간 리포트는 periodLabel의 연-월(YYYY-MM)만 붙인다", () => {
    expect(
      buildGoalReportFileName({
        period: "monthly",
        periodLabel: "2026-08-01 ~ 2026-08-31",
      }),
    ).toBe("목표관리_월간리포트_2026-08");
  });

  it("periodLabel이 없으면(로딩 중 등) 날짜 조각을 뺀다 — 억지 값을 지어내지 않는다", () => {
    expect(
      buildGoalReportFileName({ period: "weekly", periodLabel: undefined }),
    ).toBe("목표관리_주간리포트");
  });

  it("periodLabel 형식이 예상과 다르면(구분자 없음) 그 조각을 통째로 뺀다", () => {
    expect(
      buildGoalReportFileName({ period: "monthly", periodLabel: "이번 달" }),
    ).toBe("목표관리_월간리포트");
  });
});
