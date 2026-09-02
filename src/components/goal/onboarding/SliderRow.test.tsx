import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import SliderRow from "./SliderRow";

// QA 행290 — 0.1시간 단위 조정 + 숫자 직접 입력 회귀 테스트.
describe("SliderRow", () => {
  it("슬라이더 step이 기본값 0.1이다", () => {
    render(<SliderRow label="월요일" value={2} onChange={() => {}} />);
    const slider = screen.getByRole("slider", {
      name: "월요일 자습 시간",
    }) as HTMLInputElement;
    expect(slider.step).toBe("0.1");
  });

  it("숫자 입력란이 있고 값을 그대로 보여준다(type=number, step 0.1)", () => {
    render(<SliderRow label="화요일" value={1.5} onChange={() => {}} />);
    const numberInput = screen.getByRole("spinbutton", {
      name: "화요일 자습 시간(시간 직접 입력)",
    }) as HTMLInputElement;
    expect(numberInput.type).toBe("number");
    expect(numberInput.step).toBe("0.1");
    expect(numberInput.min).toBe("0");
    expect(numberInput.max).toBe("12");
    expect(numberInput.value).toBe("1.5");
  });

  it("숫자 입력에 0.1 단위 값을 넣으면 그대로 onChange된다", () => {
    const onChange = vi.fn();
    render(<SliderRow label="수요일" value={2} onChange={onChange} />);
    const numberInput = screen.getByRole("spinbutton", {
      name: "수요일 자습 시간(시간 직접 입력)",
    });
    fireEvent.change(numberInput, { target: { value: "3.4" } });
    expect(onChange).toHaveBeenCalledWith(3.4);
  });

  it("+ 버튼을 누르면 0.1 증가하고 소수 둘째 자리로 반올림된다(부동소수점 오차 방지)", () => {
    const onChange = vi.fn();
    render(<SliderRow label="목요일" value={0.2} onChange={onChange} />);
    const increaseButton = screen.getByRole("button", {
      name: "목요일 자습 시간 늘리기",
    });
    fireEvent.click(increaseButton);
    // 0.2 + 0.1은 부동소수점으로 0.30000000000000004가 될 수 있다 — round2로 정리돼야 한다.
    expect(onChange).toHaveBeenCalledWith(0.3);
  });

  it("- 버튼은 min 아래로 내려가지 않는다", () => {
    const onChange = vi.fn();
    render(<SliderRow label="금요일" value={0} onChange={onChange} />);
    const decreaseButton = screen.getByRole("button", {
      name: "금요일 자습 시간 줄이기",
    });
    fireEvent.click(decreaseButton);
    expect(onChange).toHaveBeenCalledWith(0);
  });

  it("숫자 입력값이 max를 넘으면 max로 clamp된다", () => {
    const onChange = vi.fn();
    render(<SliderRow label="토요일" value={10} onChange={onChange} />);
    const numberInput = screen.getByRole("spinbutton", {
      name: "토요일 자습 시간(시간 직접 입력)",
    });
    fireEvent.change(numberInput, { target: { value: "99" } });
    expect(onChange).toHaveBeenCalledWith(12);
  });
});
