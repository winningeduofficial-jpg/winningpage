import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export interface Order {
  id: string;
  status: string;
  approval_status: string;
  order_name: string;
  list_amount: number;
  discount_amount: number;
  amount: number;
  student_profile_id: string | null;
}

export interface OrderItem {
  id: string;
  name: string;
  list_price: number;
  price: number;
  quantity: number;
  product_id: string;
  service_key: string;
}

export interface ApprovedOrder {
  order_id: string;
  amount: number;
  skipped_coupon_ids?: string[];
}

// 결제 요청 주문 + 상품 목록 조회. 재개 모드(수락은 끝났고 결제만 남은 상태)면
// approvedOrder를 DB 행에서 미리 채워, handlePay가 fn_respond_enrollment를
// 다시 부르지 않고 곧장 토스로 넘어가게 한다.
export function useEnrollmentOrder(orderId: string) {
  const [order, setOrder] = useState<Order | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  // 'not_found' | 'not_actionable' — 어느 쪽이든 화면은 OrderNotActionable 로 수렴한다.
  const [orderError, setOrderError] = useState<
    "not_found" | "not_actionable" | null
  >(null);
  const [orderLoading, setOrderLoading] = useState(true);
  // fn_respond_enrollment 성공 응답을 캐시한다 — 승인은 즉시 서버에서 확정되므로
  // (approval_status='approved', 쿠폰 귀속 insert 까지 끝남) 이후 토스 결제창만
  // 실패/재시도해도 RPC 를 다시 부르지 않는다(재호출 시 enrollment_not_pending 로 죽는다).
  const [approvedOrder, setApprovedOrder] = useState<ApprovedOrder | null>(
    null,
  );

  useEffect(() => {
    let alive = true;
    (async () => {
      setOrderLoading(true);
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id, status, approval_status, order_name, list_amount, discount_amount, amount, student_profile_id",
        )
        .eq("id", orderId)
        .maybeSingle();
      if (!alive) return;

      if (error || !data) {
        if (error) console.warn("결제 요청 조회 실패:", error.message);
        setOrderError("not_found");
        setOrderLoading(false);
        return;
      }

      // 진입 게이트 — 결제 전(status='pending') 주문만 받는다. 승인축은 두 값을
      // 모두 통과시킨다.
      //   requested = 아직 수락 전. 수락 + 쿠폰 선택 + 결제를 여기서 다 한다.
      //   approved  = 수락(fn_respond_enrollment)까지 끝났는데 토스 결제창만 닫힌
      //               상태 → **재개 모드**. 2026-08-13 이전에는 이 값이 게이트에
      //               걸려 not_actionable 로 막혔고, 그래서 학부모가 수락 후
      //               결제창을 닫으면 그 주문을 되살릴 방법이 아예 없었다
      //               (docs/mypage-payment-handoff.md 작업 2).
      if (
        data.status !== "pending" ||
        !["requested", "approved"].includes(data.approval_status)
      ) {
        setOrder(data);
        setOrderError("not_actionable");
        setOrderLoading(false);
        return;
      }

      const { data: items, error: itemsError } = await supabase
        .from("order_items")
        .select(
          "id, name, list_price, price, quantity, product_id, service_key",
        )
        .eq("order_id", orderId);
      if (!alive) return;

      if (itemsError) {
        console.warn("주문 상품 조회 실패:", itemsError.message);
        setOrderError("not_found");
        setOrderLoading(false);
        return;
      }

      // 재개 모드 — 수락이 이미 끝났으므로 fn_respond_enrollment 를 다시 부르면
      // 안 된다(재호출은 enrollment_not_pending 으로 죽는다, 위 approvedOrder 주석).
      // handlePay 가 그 RPC 를 건너뛰고 곧장 토스를 부르도록, 승인 결과와 같은
      // 모양을 DB 행에서 만들어 미리 채운다. 금액은 쿠폰 귀속까지 반영된 확정값
      // (orders.amount)이라 여기서 다시 계산하지 않는다.
      if (data.approval_status === "approved") {
        setApprovedOrder({ order_id: data.id, amount: data.amount });
      }

      setOrder(data);
      setOrderItems(items || []);
      setOrderError(null);
      setOrderLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [orderId]);

  // 재개 모드(수락 완료 + 결제만 남음). 쿠폰은 수락 시점에 이미 귀속됐고
  // orders.amount 가 그 결과라, 다시 고르게 하면 화면 금액과 실제 청구액이
  // 갈라진다 — 조회도 하지 않고 UI 도 감춘다.
  const isResume = order?.approval_status === "approved";

  return {
    order,
    orderItems,
    orderError,
    orderLoading,
    isResume,
    approvedOrder,
    setApprovedOrder,
  };
}
