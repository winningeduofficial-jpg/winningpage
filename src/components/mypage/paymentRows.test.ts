// getCashReceipt(paymentRows.ts)의 회귀 테스트(QA 시트 행310 — 현금영수증
// 보기 버튼). 폴백 없이 receiptUrl 유무만으로 버튼 노출을 결정하는 규칙이
// 핵심이라, 그 판정 자체를 순수 함수 단위로 고정한다.

import { describe, expect, it } from "vitest";
import { getCashReceipt } from "./paymentRows";

describe("getCashReceipt", () => {
  it("receiptUrl이 있으면 링크 정보를 돌려준다", () => {
    const result = getCashReceipt({
      cash_receipt: {
        type: "소득공제",
        issueNumber: "1234",
        receiptUrl: "https://example.com/receipt/1",
      },
    });
    expect(result).toEqual({
      receiptUrl: "https://example.com/receipt/1",
      type: "소득공제",
      issueNumber: "1234",
    });
  });

  it("receiptUrl이 없으면(발급 전) null이다", () => {
    expect(getCashReceipt({ cash_receipt: { type: "소득공제" } })).toBeNull();
  });

  it("receiptUrl이 빈 문자열이면 null이다", () => {
    expect(getCashReceipt({ cash_receipt: { receiptUrl: "   " } })).toBeNull();
  });

  it("cash_receipt가 null이면 null이다(카드 결제 등)", () => {
    expect(getCashReceipt({ cash_receipt: null })).toBeNull();
  });

  it("cash_receipt가 없으면(필드 자체 부재) null이다", () => {
    expect(getCashReceipt({})).toBeNull();
  });
});
