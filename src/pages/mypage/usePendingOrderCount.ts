import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import type { SessionUser } from "./useMyPageProfile";

// 결제 대기 주문 건수 — orders 조회는 paid/waiting_deposit 만 읽으므로
// pending 은 여기서 따로 센다(탭 배지 전용, 목록은 ParentPaymentsTab 이 읽는다).
export function usePendingOrderCount(
  user: SessionUser | null,
  isParent: boolean,
) {
  const [pendingOrderCount, setPendingOrderCount] = useState(0);

  useEffect(() => {
    if (!user || !isParent) return undefined;
    let alive = true;

    (async () => {
      const { count } = await supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("parent_profile_id", user.id)
        .eq("status", "pending")
        .in("approval_status", ["requested", "approved"]);
      if (alive) setPendingOrderCount(count || 0);
    })();

    return () => {
      alive = false;
    };
  }, [user, isParent]);

  return pendingOrderCount;
}
