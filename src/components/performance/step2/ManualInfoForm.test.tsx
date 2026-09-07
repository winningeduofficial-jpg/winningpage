// STEP2 직접 입력 폼(`ManualInfoForm`) 글자 수 상한 회귀 검증 — QA 시트 행 194.
//
// 프론트·서버가 `GUIDE_FREETEXT_MAX_LENGTH`(api/_lib/performance/guide-freetext.ts)
// 하나를 공유한다. 이 파일은 프론트 쪽만 본다 — 네이티브 `maxLength`가 실제로
// 입력을 막는지, 카운터가 그 상한과 같은 수를 보여주는지.
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { GUIDE_FREETEXT_MAX_LENGTH } from "../../../../api/_lib/performance/guide-freetext.js";
import ManualInfoForm from "./ManualInfoForm";

const FIELD_LABEL = /대략적인 수행평가 정보/;

describe("ManualInfoForm 글자 수 상한", () => {
  test("초기 카운터는 0/상한값을 보여준다", () => {
    render(<ManualInfoForm />);
    expect(
      screen.getByText(`0/${GUIDE_FREETEXT_MAX_LENGTH}`),
    ).toBeInTheDocument();
  });

  test("정확히 상한값(1000자)을 입력하면 값이 그대로 반영된다", () => {
    render(<ManualInfoForm />);
    const textarea = screen.getByLabelText(FIELD_LABEL);
    const exact = "가".repeat(GUIDE_FREETEXT_MAX_LENGTH);

    fireEvent.change(textarea, { target: { value: exact } });

    expect(textarea).toHaveValue(exact);
    expect(
      screen.getByText(
        `${GUIDE_FREETEXT_MAX_LENGTH}/${GUIDE_FREETEXT_MAX_LENGTH}`,
      ),
    ).toBeInTheDocument();
  });

  test("네이티브 maxLength가 상한값으로 걸려 있다(초과 붙여넣기 차단은 브라우저 책임)", () => {
    render(<ManualInfoForm />);
    const textarea = screen.getByLabelText(FIELD_LABEL);

    expect(textarea).toHaveAttribute(
      "maxLength",
      String(GUIDE_FREETEXT_MAX_LENGTH),
    );
  });
});
