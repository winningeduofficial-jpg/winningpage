import { describe, expect, it } from "vitest";
import { buildTodayHeadline } from "./Dashboard";

// QA 행304 — "오늘의 조언"에 "오늘 달성률 N% (목표 대비)"가 없었다. 규칙 기반 문구
// 확장 회귀 테스트(LLM 아님).
describe("buildTodayHeadline", () => {
  it("기록이 없으면(studyHours<=0) 목표 시간을 안내하고 달성률은 붙이지 않는다", () => {
    expect(buildTodayHeadline(3, 0)).toBe(
      "아직 오늘의 학습 기록이 없어요. 오늘 목표는 3시간이에요.",
    );
  });

  it("기록도 목표도 없으면 시작을 권한다", () => {
    expect(buildTodayHeadline(0, 0)).toBe(
      "아직 오늘의 학습 기록이 없어요. 오늘부터 시작해볼까요?",
    );
  });

  it("목표 시간이 미설정(0)이면 기록이 있어도 달성률을 계산하지 않는다", () => {
    expect(buildTodayHeadline(0, 2)).toBe(
      "오늘 목표를 지켰어요! 이 페이스를 이어가 봐요.",
    );
  });

  it("목표 대비 진행 중이면 달성률과 남은 시간을 함께 보여준다", () => {
    // 1시간/2시간 = 50%
    expect(buildTodayHeadline(2, 1)).toBe(
      "오늘 달성률 50% (목표 대비) · 오늘 목표까지 1시간 남았어요.",
    );
  });

  it("목표를 달성했으면 달성률 100%와 함께 축하 문구를 보여준다", () => {
    expect(buildTodayHeadline(2, 2)).toBe(
      "오늘 달성률 100% (목표 대비) · 오늘 목표를 지켰어요! 이 페이스를 이어가 봐요.",
    );
  });

  it("목표를 초과 달성해도 달성률은 100%로 클램프한다", () => {
    expect(buildTodayHeadline(2, 3)).toBe(
      "오늘 달성률 100% (목표 대비) · 오늘 목표를 지켰어요! 이 페이스를 이어가 봐요.",
    );
  });
});
