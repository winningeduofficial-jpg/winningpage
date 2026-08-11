import { Navigate, Outlet, useLocation } from 'react-router-dom';
import RequireEntitlement from '../RequireEntitlement';
import { isOnboardingDone } from '../../lib/goalOnboarding';

// 목표관리 진입 가드 체인(사용자 확정 플로우) — /app/goal/* 전체(대시보드 셸 +
// 온보딩 7단계)를 감싼다. App.jsx에서 두 곳에 각각 <Route element={<RequireGoalAccess />}>로
// 씌운다: ①SiteLayout 안 온보딩 라우트 그룹, ②GoalAppLayout(사이드바 셸) 라우트 그룹.
// 두 그룹은 물리적으로 다른 레이아웃(SiteLayout vs GoalAppLayout)을 쓰므로 라우트 트리상
// 별개 서브트리다 — 이 컴포넌트는 그 경계에서 매번 새로 mount되므로, 대시보드 ↔ 온보딩을
// 오갈 때마다 세션·이용권 판정이 자연히 다시 실행된다(별도 상태 동기화 불필요).
//
//   1) 로그인 판정        — 세션 없음 → /login?redirect=<현재 경로>
//   2) 이용권 판정        — 미보유   → /pricing?service=goal&redirect=<현재 경로>
//   3) 온보딩 완료 판정   — 미완료   → /app/goal/onboarding/step-1
//   4) 전부 통과          → 자식(대시보드 또는 온보딩 페이지) 렌더
//
// **1・2단계는 공용 <RequireEntitlement>로 이관했다(2026-08-11).** 수행평가 셸이
// 같은 4상태 판정을 필요로 해서, 서비스 키를 받는 형태로 일반화한 뒤 이 컴포넌트가
// 그것을 호출하도록 바꿨다. 상태 정의·리다이렉트 목적지·`null`(판정 불가) 처리 규칙은
// 전부 그쪽 파일(`src/components/RequireEntitlement.jsx`)에 있고 동작은 이전과 같다.
// 3단계(온보딩)는 목표관리 고유 규칙이라 여기 남는다.
//
// ⚠️ 무한 리다이렉트 방지: 3단계는 "지금 온보딩 경로에 있는가"를 먼저 확인해 그 경우
// 검사 자체를 건너뛴다. 온보딩 경로에서도 3단계를 그대로 적용하면
// /app/goal/onboarding/step-1 진입 시 "온보딩 미완료 → /app/goal/onboarding/step-1로
// 리다이렉트"가 자기 자신을 가리켜 무한 루프가 된다. 1・2단계(로그인·이용권)는 온보딩
// 경로에서도 그대로 적용한다 — 온보딩도 로그인・결제 이후 화면이기 때문.
//
// ⚠️ 결제 복귀 배선 한계(이번 범위 밖, 손대지 않음): 2단계에서 /pricing?redirect=...로
// 보내지만, Pricing.jsx가 redirect 쿼리를 읽지 않고 로그인 필요 시 `/login?redirect=/checkout`을
// 하드코딩하며(Pricing.jsx:60), Checkout.jsx도 redirect를 토스 successUrl에 실어 보내지
// 않는다(성공 후 PaymentSuccess.jsx는 항상 /mypage로 이동 — PaymentSuccess.jsx:172).
// 즉 결제를 마친 사용자가 원래 있던 /app/goal/* 경로로 자동 복귀하지 못하고, 지금은
// 수동으로 다시 그 경로에 들어와야 이 가드를 통과한다. 이 복귀 배선은 별도 작업이다.
const ONBOARDING_PATH_PREFIX = '/app/goal/onboarding';

function currentPathWithQuery(location) {
  return `${location.pathname}${location.search}${location.hash}`;
}

// 3단계 — 1・2단계를 통과했을 때만 렌더된다(RequireEntitlement가 children을
// ok 상태에서만 렌더한다).
function GoalOnboardingGate() {
  const location = useLocation();
  const isOnOnboardingRoute = location.pathname.startsWith(ONBOARDING_PATH_PREFIX);

  if (!isOnOnboardingRoute && !isOnboardingDone()) {
    return <Navigate to="/app/goal/onboarding/step-1" replace />;
  }

  // 4) 대시보드 랜딩(또는 온보딩 페이지) — 실제 자식 라우트 렌더.
  return <Outlet />;
}

export default function RequireGoalAccess() {
  return (
    <RequireEntitlement
      serviceKey="goal"
      forbiddenTo={(location) =>
        `/pricing?service=goal&redirect=${encodeURIComponent(currentPathWithQuery(location))}`
      }
      forbiddenNotice="목표관리 서비스는 유료 이용권을 결제하신 뒤 이용할 수 있습니다."
    >
      <GoalOnboardingGate />
    </RequireEntitlement>
  );
}
