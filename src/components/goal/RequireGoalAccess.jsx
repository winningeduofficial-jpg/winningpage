import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { hasEntitlement } from '../../lib/entitlement';
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

export default function RequireGoalAccess() {
  const location = useLocation();

  // 'loading' | 'no-session' | 'no-entitlement' | 'check-failed' | 'ok'
  // 1・2단계는 비동기(세션 조회·/api/check-service-access 호출)라 로딩 상태가 필요하다.
  // 깜빡임 방지를 위해 판정이 끝나기 전까지는 절대 자식을 렌더하지 않는다(아래 loading
  // 분기가 유일한 렌더).
  const [status, setStatus] = useState('loading');
  // evaluate()를 다시 돌리기 위한 트리거. "재시도" 버튼이 이 값을 바꿔 useEffect를 재실행한다.
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    let alive = true;

    async function evaluate() {
      setStatus('loading');

      // 1) 로그인 판정
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData?.session?.user;

      if (!alive) return;

      if (!user) {
        setStatus('no-session');
        return;
      }

      // 2) 이용권 판정 — hasEntitlement는 true/false 외에 null(판정 불가: 서버 호출
      // 실패·네트워크 오류 등)도 반환할 수 있다(src/lib/entitlement.js 계약 참고).
      // false(서버가 명시적으로 "미결제"라고 답함)와 null(서버에 물어보지 못함)을 반드시
      // 구분해야 한다 — null을 false처럼 처리해 /pricing으로 보내면, 서버가 일시적으로
      // 죽었을 뿐인 결제 완료 사용자가 결제 페이지로 튕기는 최악의 오탐이 발생한다.
      // 그래서 null은 별도 상태('check-failed')로 두고 그 자리에 머무르며 재시도를
      // 제공한다. 리다이렉트는 false(명시적 미보유)일 때만 한다.
      const entitled = await hasEntitlement('goal');

      if (!alive) return;

      if (entitled === true) {
        setStatus('ok');
        return;
      }

      if (entitled === false) {
        setStatus('no-entitlement');
        return;
      }

      setStatus('check-failed');
    }

    evaluate();

    return () => {
      alive = false;
    };
  }, [retryToken]);

  if (status === 'loading') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white text-[#0D1B2A]">
        <div className="rounded-2xl border border-[#0D1B2A]/10 bg-white px-6 py-4 text-sm font-extrabold shadow-[0_18px_45px_rgba(13,27,42,0.10)]">
          이용 가능 여부 확인 중...
        </div>
      </main>
    );
  }

  if (status === 'no-session') {
    const redirectPath = currentPathWithQuery(location);
    return <Navigate to={`/login?redirect=${encodeURIComponent(redirectPath)}`} replace />;
  }

  if (status === 'no-entitlement') {
    const redirectPath = currentPathWithQuery(location);
    return (
      <Navigate
        to={`/pricing?service=goal&redirect=${encodeURIComponent(redirectPath)}`}
        replace
      />
    );
  }

  if (status === 'check-failed') {
    // 이용권 판정 불가(서버 호출 실패 등). /pricing으로 보내지 않고 이 화면에 머무른다 —
    // 결제를 마친 사용자가 일시적 오류로 결제 페이지에 튕기는 상황을 막기 위해서다.
    return (
      <main className="flex min-h-screen items-center justify-center bg-white px-6 text-[#0D1B2A]">
        <div className="flex max-w-sm flex-col items-center gap-3 rounded-2xl border border-[#0D1B2A]/10 bg-white px-6 py-8 text-center shadow-[0_18px_45px_rgba(13,27,42,0.10)]">
          <p className="text-sm font-extrabold">이용 가능 여부를 확인하지 못했습니다.</p>
          <p className="text-xs text-[#0D1B2A]/60">
            네트워크 상태를 확인한 뒤 다시 시도해 주세요. 이미 결제하셨다면 곧 다시
            확인됩니다.
          </p>
          <button
            type="button"
            onClick={() => setRetryToken((v) => v + 1)}
            className="mt-2 rounded-full bg-[#0D1B2A] px-5 py-2 text-xs font-extrabold text-white"
          >
            다시 시도
          </button>
        </div>
      </main>
    );
  }

  // status === 'ok' — 1・2단계 통과. 3) 온보딩 완료 판정(온보딩 경로 자체는 건너뜀).
  const isOnOnboardingRoute = location.pathname.startsWith(ONBOARDING_PATH_PREFIX);

  if (!isOnOnboardingRoute && !isOnboardingDone()) {
    return <Navigate to="/app/goal/onboarding/step-1" replace />;
  }

  // 4) 대시보드 랜딩(또는 온보딩 페이지) — 실제 자식 라우트 렌더.
  return <Outlet />;
}
