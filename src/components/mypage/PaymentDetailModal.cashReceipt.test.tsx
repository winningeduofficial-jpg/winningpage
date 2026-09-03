// PaymentDetailModal의 "현금영수증 보기" 버튼(QA 시트 행310) 노출 조건 회귀
// 테스트. order_items에 product_id를 주지 않아 useBundleCompositionMap의
// supabase 조회가 트리거되지 않는다(빈 productIds → key="" → early return,
// bundleComposition.ts 참고) — 별도 모킹 없이 렌더 가능하다.

import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PaymentDetailModal from "./PaymentDetailModal";

const BASE_ORDER = {
  id: "order_1",
  amount: 10000,
  paid_at: "2026-09-01T00:00:00.000Z",
};

describe("PaymentDetailModal 현금영수증 보기 버튼", () => {
  it("cash_receipt.receiptUrl이 있으면 버튼을 보여준다", () => {
    render(
      <PaymentDetailModal
        open
        order={{
          ...BASE_ORDER,
          cash_receipt: { receiptUrl: "https://example.com/receipt/1" },
        }}
        status="paid"
        onClose={() => {}}
      />,
    );
    expect(
      screen.getByRole("button", { name: "현금영수증 보기" }),
    ).toBeInTheDocument();
  });

  it("receiptUrl이 없으면(미발급) 버튼을 렌더하지 않는다", () => {
    render(
      <PaymentDetailModal
        open
        order={{ ...BASE_ORDER, cash_receipt: null }}
        status="paid"
        onClose={() => {}}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "현금영수증 보기" }),
    ).not.toBeInTheDocument();
  });

  it("학생 화면(asStudent)에서는 receiptUrl이 있어도 버튼을 렌더하지 않는다", () => {
    render(
      <PaymentDetailModal
        open
        order={{
          ...BASE_ORDER,
          cash_receipt: { receiptUrl: "https://example.com/receipt/1" },
        }}
        status="paid"
        asStudent
        onClose={() => {}}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "현금영수증 보기" }),
    ).not.toBeInTheDocument();
  });
});
