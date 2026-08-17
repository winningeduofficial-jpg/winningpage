import { useEffect } from "react";
import { useLocation, useSearchParams } from "react-router";

// 쿼리스트링(?tab=)으로 활성 탭을 결정한다. 구 /mypage#refund 진입 호환 —
// 결제/환불 내역이 있는 payments 탭으로 매핑한다.
export function useMyPageTab(tabs: { key: string }[], loading: boolean) {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  const requestedTab = searchParams.get("tab");
  const activeTab = tabs.some((tab) => tab.key === requestedTab)
    ? // tabs.some이 true면 requestedTab은 실제 tab.key(string)와 일치했다는 뜻이라
      // null일 수 없다.
      requestedTab!
    : // STUDENT_TABS/PARENT_TABS는 고정된 비어있지 않은 배열이라 tabs[0]은 항상 존재한다.
      tabs[0]!.key;

  useEffect(() => {
    if (loading || location.hash !== "#refund" || searchParams.get("tab"))
      return;
    const next = new URLSearchParams(searchParams);
    next.set("tab", "payments");
    setSearchParams(next, { replace: true });
  }, [loading, location.hash, searchParams, setSearchParams]);

  return activeTab;
}
