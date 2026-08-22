// 환불 완료 처리(api/complete-refund.ts)의 순수 로직만 검증한다.
//
// 핸들러 전체(supabase 호출·토스 fetch)는 외부 I/O에 묶여 있어 여기서 돌리기
// 어렵다 — zoom-webhook.test.ts와 같은 방침으로, 분리 가능한 순수 함수(기취소
// 판정·취소 요청 바디 구성·Idempotency-Key·가상계좌 판정)만 로컬에서 검증한다.

import { describe, expect, test } from "vitest";
import {
  buildCancelRequestBody,
  buildIdempotencyKey,
  findMatchingCancel,
  isVirtualAccountPayment,
  normalizeAccountNumber,
} from "./complete-refund.js";

describe("isVirtualAccountPayment", () => {
  test("raw.virtualAccount가 있으면 true", () => {
    expect(
      isVirtualAccountPayment({ virtualAccount: { accountNumber: "123" } }),
    ).toBe(true);
  });

  test("raw.virtualAccount 키가 없으면 false(카드 결제)", () => {
    expect(isVirtualAccountPayment({ card: { approveNo: "1" } })).toBe(false);
  });

  test("raw.virtualAccount가 명시적 null이어도 false", () => {
    expect(isVirtualAccountPayment({ virtualAccount: null })).toBe(false);
  });

  test("raw 자체가 없으면 false", () => {
    expect(isVirtualAccountPayment(null)).toBe(false);
    expect(isVirtualAccountPayment(undefined)).toBe(false);
  });
});

describe("findMatchingCancel", () => {
  test("금액이 일치하는 취소를 찾는다", () => {
    const cancels = [{ cancelAmount: 5000 }, { cancelAmount: 10000 }];
    expect(findMatchingCancel(cancels, 10000)).toEqual({
      cancelAmount: 10000,
    });
  });

  test("일치하는 금액이 없으면 null", () => {
    const cancels = [{ cancelAmount: 5000 }];
    expect(findMatchingCancel(cancels, 10000)).toBeNull();
  });

  test("cancels가 배열이 아니거나 없으면 null(신규 취소 필요 신호)", () => {
    expect(findMatchingCancel(null, 10000)).toBeNull();
    expect(findMatchingCancel(undefined, 10000)).toBeNull();
  });

  test("문자열 금액도 숫자로 비교한다(토스 응답 타입 방어)", () => {
    const cancels = [{ cancelAmount: "10000" as unknown as number }];
    expect(findMatchingCancel(cancels, 10000)).toEqual(cancels[0]);
  });
});

describe("normalizeAccountNumber", () => {
  test("숫자만 남긴다(하이픈 제거)", () => {
    expect(normalizeAccountNumber("110-1234-5678")).toBe("11012345678");
  });

  test("공백·문자도 제거한다", () => {
    expect(normalizeAccountNumber("110 1234 5678번")).toBe("11012345678");
  });

  test("토스 제약(최대 20자)을 넘으면 잘라낸다", () => {
    expect(normalizeAccountNumber("1".repeat(30))).toBe("1".repeat(20));
    expect(normalizeAccountNumber("1".repeat(30)).length).toBe(20);
  });

  test("숫자가 하나도 없으면(하이픈만 등) 빈 문자열", () => {
    expect(normalizeAccountNumber("----")).toBe("");
  });

  test("null/undefined는 빈 문자열", () => {
    expect(normalizeAccountNumber(null)).toBe("");
    expect(normalizeAccountNumber(undefined)).toBe("");
  });
});

describe("buildCancelRequestBody", () => {
  test("카드 결제는 refundReceiveAccount를 넣지 않는다", () => {
    const body = buildCancelRequestBody({
      cancelReason: "단순 변심",
      cancelAmount: 10000,
      isVirtualAccount: false,
      refundBank: "88",
      refundAccount: "110-1234-5678",
      refundHolder: "홍길동",
    });
    expect(body).toEqual({ cancelReason: "단순 변심", cancelAmount: 10000 });
  });

  test("가상계좌 + 계좌 3필드가 모두 있으면 refundReceiveAccount를 채운다(계좌번호는 숫자만 정규화)", () => {
    const body = buildCancelRequestBody({
      cancelReason: "단순 변심",
      cancelAmount: 10000,
      isVirtualAccount: true,
      refundBank: "88",
      refundAccount: "110-1234-5678",
      refundHolder: "홍길동",
    });
    // 토스 결제취소 API 제약(숫자만, 최대 20자) — 하이픈이 저장돼 있어도
    // 여기서 방어적으로 한 번 더 걸러낸다(이중 안전망).
    expect(body.refundReceiveAccount).toEqual({
      bank: "88",
      accountNumber: "11012345678",
      holderName: "홍길동",
    });
  });

  test("가상계좌인데 계좌 3필드 중 하나라도 비면 refundReceiveAccount를 넣지 않는다(값을 지어내지 않는다)", () => {
    const body = buildCancelRequestBody({
      cancelReason: "단순 변심",
      cancelAmount: 10000,
      isVirtualAccount: true,
      refundBank: "88",
      refundAccount: "",
      refundHolder: "홍길동",
    });
    expect(body.refundReceiveAccount).toBeUndefined();
  });

  test("계좌번호가 하이픈만 있는 등 숫자가 하나도 없으면 빈 값으로 취급해 refundReceiveAccount를 넣지 않는다", () => {
    const body = buildCancelRequestBody({
      cancelReason: "단순 변심",
      cancelAmount: 10000,
      isVirtualAccount: true,
      refundBank: "88",
      refundAccount: "----",
      refundHolder: "홍길동",
    });
    expect(body.refundReceiveAccount).toBeUndefined();
  });

  test("가상계좌인데 계좌 필드가 전부 없어도 나머지 필드는 그대로 담는다", () => {
    const body = buildCancelRequestBody({
      cancelReason: "단순 변심",
      cancelAmount: 10000,
      isVirtualAccount: true,
    });
    expect(body).toEqual({ cancelReason: "단순 변심", cancelAmount: 10000 });
  });
});

describe("buildIdempotencyKey", () => {
  test("refund_request id 기반 고정 키를 만든다(재클릭·재시도가 같은 키를 낸다)", () => {
    expect(buildIdempotencyKey(42)).toBe("refund-request-42");
    expect(buildIdempotencyKey("42")).toBe("refund-request-42");
    expect(buildIdempotencyKey(42)).toBe(buildIdempotencyKey(42));
  });
});
