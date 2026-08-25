import { useEffect, useState } from "react";
import { apiFetch, getAuthHeader } from "@/lib/apiFetch";
import { clearCart } from "@/lib/cart";
import { queryClient } from "@/lib/queryClient";

export interface CardInfo {
  cardType?: string;
  issuerCode?: string;
  number?: string;
  installmentPlanMonths?: number;
  approveNo?: string;
}

export interface VirtualAccountInfo {
  customerName?: string;
  dueDate?: string;
  bank?: string;
  bankCode?: string;
  accountNumber?: string;
  // 결제 시점에 구매자가 미리 입력한 환불계좌(토스 결제위젯이 요청하도록
  // 설정한 경우에만 온다 — src/pages/checkout/ParentCheckout.tsx의 현재
  // virtualAccount 옵션(cashReceipt/validHours)은 이걸 요청하지 않으므로
  // 실제로는 거의 항상 비어 있다). 있으면 환불계좌 입력 폼(RefundRequestModal/
  // RefundApprovalModal)이 프리필에 쓴다 — 값을 지어내지 않고 실제로 있을 때만.
  refundReceiveAccount?: {
    bank?: string;
    accountNumber?: string;
    holderName?: string;
  };
}

export interface EasyPayInfo {
  provider?: string;
}

interface AccessResult {
  ok?: boolean;
  granted?: string[];
  skipped?: string[];
  error?: string;
}

export interface PaymentInfo {
  orderId?: string;
  card?: CardInfo;
  virtualAccount?: VirtualAccountInfo;
  easyPay?: EasyPayInfo;
  method?: string;
  approvedAt?: string;
  requestedAt?: string;
  totalAmount?: number;
  vat?: number;
  status?: string;
  access?: AccessResult;
}

// missing_params 는 error 와 분리한다 — 파라미터 없는 재방문(예: 가상계좌
// 구매자가 계좌번호를 다시 보려고 히스토리로 돌아오는 경우)은 실패가 아니라
// 정상적인 재방문이라 빨간 에러 취급을 하면 안 된다.
export type PaymentConfirmationStatus =
  | "confirming"
  | "done"
  | "error"
  | "missing_params";

/**
 * 토스 결제 승인을 서버(api/confirm-payment)에 확정 요청하고 결과를 반환한다.
 * 승인 성공 시 장바구니를 비우는 부수효과도 여기서 함께 처리한다.
 */
export function usePaymentConfirmation({
  paymentKey,
  orderId,
  amount,
}: {
  paymentKey: string | null;
  orderId: string | null;
  amount: string | null;
}) {
  const [status, setStatus] = useState<PaymentConfirmationStatus>("confirming");
  const [errorMsg, setErrorMsg] = useState("");
  const [payment, setPayment] = useState<PaymentInfo | null>(null); // 승인 응답(토스 raw)

  useEffect(() => {
    if (!paymentKey || !orderId || !amount) {
      setStatus("missing_params");
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const authHeader = await getAuthHeader();

        const res = await apiFetch("/api/confirm-payment", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...authHeader,
          },
          body: JSON.stringify({ paymentKey, orderId, amount }),
        });

        let result: PaymentInfo & { error?: string } = {};
        try {
          result = await res.json();
        } catch {
          result = {};
        }

        if (cancelled) return;

        if (!res.ok || result?.error) {
          setStatus("error");
          setErrorMsg(result?.error ?? "결제 승인에 실패했습니다.");
        } else {
          setPayment(result);
          setStatus("done");
          clearCart();
          // 결제 직후 이용권 상태가 바뀌었으므로(예: goal 미보유 → 보유), 캐시된
          // entitlement(staleTime 5분, queryClient.ts)를 즉시 무효화한다 — 그대로
          // 두면 방금 결제한 사용자가 최대 5분간 "이용권 없음" 판정을 그대로 받을
          // 수 있다. serviceKey별로 나누지 않고 'entitlement' 전체를 무효화한다 —
          // 이 응답(access.granted)이 어떤 서비스에 권한을 부여했는지는 알지만,
          // 결제 완료 시점의 무효화 비용은 낮고 실수로 한 서비스를 빠뜨릴 위험이
          // 더 크다.
          queryClient.invalidateQueries({ queryKey: ["entitlement"] });
        }
      } catch (err) {
        if (cancelled) return;
        setStatus("error");
        setErrorMsg(String(err?.message ?? err));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [paymentKey, orderId, amount]);

  return { status, errorMsg, payment };
}
