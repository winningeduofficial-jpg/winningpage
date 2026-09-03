import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ScrollArea } from "./scroll-area";

describe("ScrollArea", () => {
  it("renders its children inside the overlay scrollbar container", () => {
    render(
      <ScrollArea data-testid="scroll-area">
        <p>스크롤 영역 콘텐츠</p>
      </ScrollArea>,
    );

    expect(screen.getByText("스크롤 영역 콘텐츠")).toBeInTheDocument();
    expect(screen.getByTestId("scroll-area")).toHaveAttribute(
      "data-slot",
      "scroll-area",
    );
  });
});
