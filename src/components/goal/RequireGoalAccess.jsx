import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { isOnboardingDone } from "../../lib/goalOnboarding";
import RequireEntitlement from "../RequireEntitlement";

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
// 2026-08-11: 3단계도 goal_students 서버 조회(isOnboardingDone(), src/lib/goalOnboarding.js)로
// 바뀌었다. 과거엔 localStorage 동기 판정이라 렌더 중 즉시 계산했지만, 지금은 서버
// 왕복이 필요해 GoalOnboardingGate 자체가 작은 status state machine
// ('loading'/'no-onboarding'/'onboarding-check-failed'/'ok')을 갖는다 — 더 이상 렌더
// 함수 본문에서 동기로 계산하지 않는다. 1·2단계는 RequireEntitlement가 이미 같은 이유로
// 자체 state machine을 갖고 있으므로 여기서 다시 처리하지 않는다(이중 판정 방지) —
// GoalOnboardingGate는 RequireEntitlement가 ok를 낸 뒤에만 렌더되는 children이다.
//
// ⚠️ 무한 리다이렉트 방지: 3단계는 "지금 온보딩 경로에 있는가"를 먼저 확인해 그 경우
// 검사 자체를 건너뛴다. 온보딩 경로에서도 3단계를 그대로 적용하면
// /app/goal/onboarding/step-1 진입 시 "온보딩 미완료 → /app/goal/onboarding/step-1로
// 리다이렉트"가 자기 자신을 가리켜 무한 루프가 된다. 1・2단계(로그인·이용권)는 온보딩
// 경로에서도 그대로 적용한다 — 온보딩도 로그인・결제 이후 화면이기 때문. 이 조건·순서는
// dev의 원 구현(effect 안으로 들어가기 전)과 동일하게 유지했다.
//
// ⚠️ 결제 복귀 배선 한계(이번 범위 밖, 손대지 않음): 2단계에서 /pricing?redirect=...로
// 보내지만, Pricing.jsx가 redirect 쿼리를 읽지 않고 로그인 필요 시 `/login?redirect=/checkout`을
// 하드코딩하며(Pricing.jsx:60), Checkout.jsx도 redirect를 토스 successUrl에 실어 보내지
// 않는다(성공 후 PaymentSuccess.jsx는 항상 /mypage로 이동 — PaymentSuccess.jsx:172).
// 즉 결제를 마친 사용자가 원래 있던 /app/goal/* 경로로 자동 복귀하지 못하고, 지금은
// 수동으로 다시 그 경로에 들어와야 이 가드를 통과한다. 이 복귀 배선은 별도 작업이다.
const ONBOARDING_PATH_PREFIX = "/app/goal/onboarding";

function currentPathWithQuery(location) {
  return `${location.pathname}${location.search}${location.hash}`;
}

// 3단계 — 1・2단계를 통과했을 때만 렌더된다(RequireEntitlement가 children을
// ok 상태에서만 렌더한다). isOnboardingDone()이 서버 조회 비동기 함수라 이 컴포넌트도
// 자체 status state machine을 갖는다(위 2026-08-11 주석 참고).
function GoalOnboardingGate() {
  const location = useLocation();
  const isOnOnboardingRoute = location.pathname.startsWith(
    ONBOARDING_PATH_PREFIX,
  );

  // 'loading' | 'no-onboarding' | 'onboarding-check-failed' | 'ok'
  const [status, setStatus] = useState("loading");
  // evaluate()를 다시 돌리기 위한 트리거. "재시도" 버튼이 이 값을 바꿔 useEffect를 재실행한다.
  const [retryToken, setRetryToken] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: TODO(useEffectEvent) isOnOnboardingRoute는 마운트 생애주기 동안 값이 안 바뀌어 deps에서 뺐고(위 주석), retryToken은 effect 안에서 읽지 않는 재시도 트리거 전용 값이다.
  useEffect(() => {
    let alive = true;

    async function evaluate() {
      setStatus("loading");

      // ⚠️ 무한 리다이렉트 방지(원래 로직 그대로 유지, 위치만 render → effect):
      // 지금 온보딩 경로에 있으면 이 판정 자체를 건너뛰고 곧장 'ok'로 통과시킨다.
      // 건너뛰지 않으면 /app/goal/onboarding/step-1 진입 시 "온보딩 미완료 →
      // /app/goal/onboarding/step-1로 리다이렉트"가 자기 자신을 가리켜 무한 루프가
      // 된다. isOnOnboardingRoute는 이 컴포넌트의 두 마운트 지점(온보딩 라우트 그룹 /
      // 대시보드 라우트 그룹)이 서로 다른 서브트리라 마운트 생애주기 동안 값이
      // 바뀌지 않는다(상단 주석 참고) — 그래서 useEffect 의존성에 location을 넣지
      // 않아도 안전하다.
      if (isOnOnboardingRoute) {
        if (alive) setStatus("ok");
        return;
      }

      // isOnboardingDone()도 hasEntitlement()와 같은 3값 계약(true/false/null) —
      // false(명시적 미완료)와 null(판정 불가: 세션 경쟁 상태·네트워크 오류 등)을
      // 반드시 구분한다. null을 false처럼 처리해 온보딩으로 리다이렉트하면, 실제로는
      // 세션이 끊기거나 이용권을 잃은 사용자를 엉뚱한 화면으로 보내는 오탐이 된다.
      const onboardingDone = await isOnboardingDone();

      if (!alive) return;

      if (onboardingDone === true) {
        setStatus("ok");
        return;
      }

      if (onboardingDone === false) {
        setStatus("no-onboarding");
        return;
      }

      setStatus("onboarding-check-failed");
    }

    evaluate();

    return () => {
      alive = false;
    };
  }, [retryToken]);

  if (status === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white text-[#0D1B2A]">
        <div className="rounded-2xl border border-[#0D1B2A]/10 bg-white px-6 py-4 text-sm font-extrabold shadow-[0_18px_45px_rgba(13,27,42,0.10)]">
          이용 가능 여부 확인 중...
        </div>
      </main>
    );
  }

  if (status === "no-onboarding") {
    return <Navigate to="/app/goal/onboarding/step-1" replace />;
  }

  if (status === "onboarding-check-failed") {
    // 온보딩 완료 여부 판정 불가(서버 호출 실패 등). 온보딩으로도, 대시보드로도 보내지
    // 않고 이 화면에 머무른다 — 이미 온보딩을 마친 사용자가 일시적 오류로 온보딩
    // 화면에 다시 튕기는 상황을 막기 위해서다(RequireEntitlement의 check-failed와
    // 동일한 이유, 대상만 다르다).
    return (
      <main className="flex min-h-screen items-center justify-center bg-white px-6 text-[#0D1B2A]">
        <div className="flex max-w-sm flex-col items-center gap-3 rounded-2xl border border-[#0D1B2A]/10 bg-white px-6 py-8 text-center shadow-[0_18px_45px_rgba(13,27,42,0.10)]">
          <p className="text-sm font-extrabold">
            온보딩 완료 여부를 확인하지 못했습니다.
          </p>
          <p className="text-xs text-[#0D1B2A]/60">
            네트워크 상태를 확인한 뒤 다시 시도해 주세요. 이미 온보딩을
            마치셨다면 곧 다시 확인됩니다.
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

  // status === 'ok' — 3단계 통과(또는 온보딩 경로라 건너뜀).
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
