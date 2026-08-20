import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { SessionUser } from "./useMyPageProfile";

// 결제 대기 주문 건수 — orders 조회는 paid/waiting_deposit 만 읽으므로
// pending 은 여기서 따로 센다(탭 배지 전용, 목록은 ParentPaymentsTab 이 읽는다).
// reload 는 결제 요청 반려 등 pending 건수가 바뀌는 액션 후 배지를 맞출 때 쓴다.
export function usePendingOrderCount(
  user: SessionUser | null,
  isParent: boolean,
) {
  const [pendingOrderCount, setPendingOrderCount] = useState(0);

  // 동시/연속 reload 경합 가드 — 마지막에 시작한 호출의 응답만 반영한다.
  const generationRef = useRef(0);

  const reload = useCallback(async () => {
    if (!user || !isParent) return;
    const generation = ++generationRef.current;

    const { count } = await supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("parent_profile_id", user.id)
      .eq("status", "pending")
      .in("approval_status", ["requested", "approved"]);
    if (generation !== generationRef.current) return;
    setPendingOrderCount(count || 0);
  }, [user, isParent]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { pendingOrderCount, reload };
}
