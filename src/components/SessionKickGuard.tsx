// 다른 기기 로그인으로 인한 킥(강제 세션 종료) 감지 + 안내 다이얼로그.
//
// 배치 위치: App.tsx의 RootLayout(모든 라우트의 공통 조상 — SiteLayout 안팎,
// goalApp/performanceApp 셸, admin, standalone 전부를 포함) 안에 항상 마운트한다.
// "전 계정(어드민 포함)"이 대상이라는 요구를 만족하려면 특정 라우트 그룹 안이
// 아니라 이 위치여야 한다 — 어드민도 같은 supabase.auth 세션을 쓰고 판정만
// resolveAdmin이 얹힐 뿐이라(adminSession.ts), AuthProvider의 userId가 그대로
// 어드민 계정도 포괄한다.
//
// 동작 두 갈래(같은 컴포넌트가 둘 다 맡는다 — location.replace가 전체 리로드라
// 마운트가 곧 "이 로드에서 처음 실행되는 시점"이기 때문에 자연스럽게 하나로
// 묶인다):
//   1) 감지 → 킥 확정 시 signOut(scope:'local') → sessionStorage 플래그 세팅 →
//      location.replace('/')로 완전 리로드.
//   2) 리로드 후 새 마운트 시 플래그를 읽어 다이얼로그를 띄우고 플래그를 지운다
//      (한 번만 보여준다 — 그 뒤 새로고침에서는 다시 뜨지 않아야 한다).
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import ConfirmModal from "@/components/checkout/ConfirmModal";
import { useAuth } from "@/context/AuthProvider";
import { sessionCheckQueryOptions } from "@/lib/queryClient";
import { supabase } from "@/lib/supabase";

// 리로드를 관통해 "방금 킥당해서 이리로 왔다"를 전달하는 유일한 수단이다(React
// state는 location.replace로 사라진다). 세션 단위(sessionStorage)로 둬서 다른
// 탭에는 절대 새지 않는다 — 탭별 독립 동작 요구사항(각 탭이 자기 focus 시점에
// 각자 감지·각자 안내).
const KICKED_FLAG_KEY = "kicked-by-other-device";

export default function SessionKickGuard() {
  const { userId } = useAuth();
  const [showKickedDialog, setShowKickedDialog] = useState(false);

  const { data: sessionState } = useQuery(sessionCheckQueryOptions(userId));

  // 킥 확정 → signOut → 메인 이동. 이 effect 안에서 다이얼로그를 직접 띄우지
  // 않는다 — location.replace 직후 이 컴포넌트 인스턴스 자체가 사라지므로,
  // "리로드 후 플래그를 읽어 띄우는" 두 번째 effect가 유일한 표시 경로다(같은
  // 탭이 리로드 없이 다이얼로그만 보는 경로는 없다 — 배정 메시지의 플로우 그대로).
  useEffect(() => {
    if (sessionState !== "kicked") return;

    sessionStorage.setItem(KICKED_FLAG_KEY, "1");
    supabase.auth.signOut({ scope: "local" }).finally(() => {
      window.location.replace("/");
    });
  }, [sessionState]);

  // 마운트 1회 — 리로드 직후에만 플래그를 소비한다(읽는 즉시 제거해 다음
  // 새로고침·재방문에서는 다시 뜨지 않게 한다).
  useEffect(() => {
    if (sessionStorage.getItem(KICKED_FLAG_KEY) !== "1") return;
    sessionStorage.removeItem(KICKED_FLAG_KEY);
    setShowKickedDialog(true);
  }, []);

  if (!showKickedDialog) return null;

  // ConfirmModal은 "마운트 자체가 열림"인 관례(open prop 없음, checkout/
  // ConfirmModal.tsx 헤더 주석)라 조건부 렌더로 표시를 제어한다. 단일 [확인]
  // 버튼(onConfirm 생략 시 onClose와 동일 동작)·ESC/오버레이 닫기는 Base UI
  // Dialog가 내장 제공한다(role="dialog"도 자동 배선).
  return (
    <ConfirmModal
      title="다른 기기에서 로그인되었습니다"
      onClose={() => setShowKickedDialog(false)}
    >
      동일 계정으로 다른 기기에서 로그인되어 이 기기에서는 로그아웃되었습니다.
      본인이 아닌 경우 비밀번호를 변경해 주세요.
    </ConfirmModal>
  );
}
