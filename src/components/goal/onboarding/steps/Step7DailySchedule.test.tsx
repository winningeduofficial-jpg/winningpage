import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GoalOnboardingProvider } from "@/context/GoalOnboardingContext";
import Step7DailySchedule from "./Step7DailySchedule";

// QA 행293 — 요일별 하루 일정(탭 전환·요일 복사·실시간 계산) 회귀 테스트.
// 실시간 계산은 schedule.ts calcAvailableHours를 그대로 재사용하므로(Step7DailySchedule.tsx
// 참고), 여기서는 "UI 조작이 올바른 컨텍스트 상태 변화를 일으키는지"만 검증하고 계산식
// 자체의 골든 픽스처는 schedule.test.ts 소관으로 둔다.
//
// 기본값(GoalOnboardingContext.tsx buildDefaultDaySchedule): wake=7, sleep=24,
// 평일 hasSchool=true・schoolStart=8.5・schoolEnd=16.5, 주말 hasSchool=false, 학원 0건.
// 기본 가용시간 = (24-7)-1.5-(16.5-8.5)+(8.5-7) = 9h(평일) / (24-7)-1.5 = 15.5h(주말).

function renderStep7() {
  const goPrev = vi.fn();
  const onFinish = vi.fn();
  render(
    <GoalOnboardingProvider>
      <Step7DailySchedule goPrev={goPrev} onFinish={onFinish} />
    </GoalOnboardingProvider>,
  );
  return { goPrev, onFinish };
}

describe("Step7DailySchedule", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("기본값(평일 등교)으로 월요일 탭이 가용 자습시간 9h를 보여준다", () => {
    renderStep7();
    expect(screen.getByText(/가용 자습시간 9h/)).toBeInTheDocument();
  });

  it("요일 탭을 전환하면 해당 요일 값으로 다시 계산된다(토요일은 기본 미등교)", () => {
    renderStep7();
    fireEvent.click(screen.getByRole("tab", { name: "토요일" }));
    expect(screen.getByText(/가용 자습시간 15\.5h/)).toBeInTheDocument();
  });

  it("학원을 추가하면 실시간 가용시간이 줄어든다(학원 2h + 이동 0.5h)", () => {
    renderStep7();
    fireEvent.click(screen.getByRole("button", { name: "학원 추가" }));
    // 기본 학원 슬롯(17~19)이 2h, 이동시간 ACADEMY_COMMUTE_HOURS(0.5h) 포함 2.5h 차감
    // → 9 - 2.5 = 6.5h.
    expect(screen.getByText(/가용 자습시간 6\.5h/)).toBeInTheDocument();
  });

  it("학원을 삭제하면 가용시간이 원래대로 돌아온다", () => {
    renderStep7();
    fireEvent.click(screen.getByRole("button", { name: "학원 추가" }));
    fireEvent.click(screen.getByRole("button", { name: "학원 1 삭제" }));
    expect(screen.getByText(/가용 자습시간 9h/)).toBeInTheDocument();
  });

  it("등교 토글을 끄면 등・하교 입력이 사라지고 가용시간이 늘어난다", () => {
    renderStep7();
    fireEvent.click(screen.getByRole("switch", { name: "학교 가는 날" }));
    expect(screen.queryByLabelText("등교 시각")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("하교 시각")).not.toBeInTheDocument();
    expect(screen.getByText(/가용 자습시간 15\.5h/)).toBeInTheDocument();
  });

  it("기상 시각을 바꾸면 실시간 계산에 반영된다", () => {
    renderStep7();
    const wakeInput = screen.getByLabelText("기상 시각");
    fireEvent.change(wakeInput, { target: { value: "8" } });
    // (24-8)-1.5=14.5, -(16.5-8.5)=6.5, +(8.5-8)=7
    expect(screen.getByText(/가용 자습시간 7h/)).toBeInTheDocument();
  });

  it('"다른 요일 일정 가져오기"로 값을 복사하면 대상 요일에 그대로 반영된다', () => {
    renderStep7();
    // 월요일에 학원 1건 추가 → 6.5h
    fireEvent.click(screen.getByRole("button", { name: "학원 추가" }));
    expect(screen.getByText(/가용 자습시간 6\.5h/)).toBeInTheDocument();

    // 화요일로 이동 — 기본값(학원 없음)이라 9h
    fireEvent.click(screen.getByRole("tab", { name: "화요일" }));
    expect(screen.getByText(/가용 자습시간 9h/)).toBeInTheDocument();

    // 월요일 일정을 화요일로 복사
    fireEvent.change(screen.getByLabelText("다른 요일 일정 가져오기"), {
      target: { value: "mon" },
    });
    expect(screen.getByText(/가용 자습시간 6\.5h/)).toBeInTheDocument();
  });

  it("학원이 5건이면 추가 버튼이 사라진다(상한)", () => {
    renderStep7();
    const addButton = screen.getByRole("button", { name: "학원 추가" });
    for (let i = 0; i < 5; i += 1) {
      fireEvent.click(screen.getByRole("button", { name: "학원 추가" }));
    }
    expect(addButton).not.toBeInTheDocument();
    expect(screen.getAllByLabelText(/학원 등원 \d/)).toHaveLength(5);
  });

  it('"다음" 버튼은 항상 활성 상태이고 클릭하면 onFinish를 호출한다', () => {
    const { onFinish } = renderStep7();
    const nextButton = screen.getByRole("button", { name: "다음" });
    expect(nextButton).not.toBeDisabled();
    fireEvent.click(nextButton);
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('"이전" 버튼을 클릭하면 goPrev를 호출한다', () => {
    const { goPrev } = renderStep7();
    fireEvent.click(screen.getByRole("button", { name: "이전" }));
    expect(goPrev).toHaveBeenCalledTimes(1);
  });
});
