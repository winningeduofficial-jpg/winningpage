import { useEffect, useState } from "react";
import { clearCart } from "../lib/cart";
import { supabase } from "../lib/supabase";

interface CardInfo {
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
}

interface EasyPayInfo {
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
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData?.session?.access_token;

        const res = await fetch("/api/confirm-payment", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
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
