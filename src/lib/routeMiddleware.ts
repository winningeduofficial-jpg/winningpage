import type { MiddlewareFunction } from "react-router";
import { redirect } from "react-router";
import { fetchEntitlement } from "./entitlement";
import { isOnboardingDone } from "./goalOnboarding";
import { supabase } from "./supabase";

// 라우트 미들웨어(future.v8_middleware) 이관본 — 기존 ProtectedRoute.jsx /
// ProtectedAdmin.jsx / RequireGoalAccess.jsx(+ RequireEntitlement.jsx의
// standalone 경로)가 하던 "판정(redirect 여부)"만 담당한다. middleware는 UI를
// 그릴 수 없으므로 로딩 스켈레톤은 라우트의 HydrateFallback, "다시 시도" 화면은
// ErrorBoundary(+ useRevalidator)로 분리했다 — 실제 컴포넌트는
// src/components/routeGuards/RouteGuardUi.tsx.
//
// ⚠️ /app/performance/*(수행평가, SessionProvider 기반 RequireEntitlement)는
// 이번 전환 대상이 아니다 — 그 경로는 셸의 사이드바・배너와 판정을 공유해야 해서
// RequireEntitlement.jsx 컴포넌트를 그대로 둔다. 여기 goal 전용 미들웨어는
// RequireEntitlement의 "프로바이더 밖" 분기(useStandaloneEntitlement)만 복제한 것이다.

function currentPathWithQuery(request: Request) {
  const url = new URL(request.url);
  // Request.url은 해시가 제거된 값이다(stripHashFromPath) — 100% 클라이언트
  // 전용 SPA라 window.location.hash로 보충한다.
  return `${url.pathname}${url.search}${window.location.hash}`;
}

function loginRedirect(request: Request) {
  return redirect(
    `/login?redirect=${encodeURIComponent(currentPathWithQuery(request))}`,
  );
}

/** 판정 불가(check-failed) 마커 — ErrorBoundary가 잡아 그 자리에서 재시도 UI를 그린다. */
export class RouteCheckFailedError extends Error {
  reason: "entitlement" | "onboarding";

  constructor(reason: "entitlement" | "onboarding") {
    super(`route-check-failed:${reason}`);
    this.name = "RouteCheckFailedError";
    this.reason = reason;
  }
}

/** 로그인은 했으나 관리자 권한이 없음 — ErrorBoundary가 잡아 안내 카드를 그린다. */
export class AdminForbiddenError extends Error {
  constructor() {
    super("admin-forbidden");
    this.name = "AdminForbiddenError";
  }
}

// 1) /checkout — 로그인 여부만 확인(ProtectedRoute.jsx 이관).
export const requireAuthMiddleware: MiddlewareFunction = async ({
  request,
}) => {
  const { data: sessionData } = await supabase.auth.getSession();

  if (!sessionData.session?.user) {
    throw loginRedirect(request);
  }
};

// 2) /admin, /demo, /demo/:demoKey — role=admin 확인(ProtectedAdmin.jsx 이관).
export const requireAdminMiddleware: MiddlewareFunction = async ({
  request,
}) => {
  if (import.meta.env.DEV && import.meta.env.VITE_ADMIN_BYPASS === "true") {
    return;
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData.session?.user;

  if (!user) {
    throw loginRedirect(request);
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (error || profile?.role !== "admin") {
    throw new AdminForbiddenError();
  }
};

// 3) /app/goal/* — 로그인 + 이용권('goal') 확인(RequireGoalAccess.jsx의 1・2단계,
// 즉 RequireEntitlement의 standalone 분기 이관). 두 라우트 그룹(온보딩 그룹 +
// GoalAppLayout 대시보드 그룹) 모두에 건다 — 원본과 동일하게 온보딩 경로도
// 로그인・이용권 판정은 적용받는다.
export const requireGoalAccessMiddleware: MiddlewareFunction = async ({
  request,
}) => {
  const { data: sessionData } = await supabase.auth.getSession();

  if (!sessionData.session?.user) {
    throw loginRedirect(request);
  }

  const { allowed } = await fetchEntitlement("goal");

  if (allowed === true) return;

  if (allowed === false) {
    const redirectPath = currentPathWithQuery(request);
    throw redirect(
      `/pricing?service=goal&redirect=${encodeURIComponent(redirectPath)}`,
    );
  }

  // allowed === null(판정 불가) — 결제 페이지로 단정해 보내지 않고 그 자리에 머문다.
  throw new RouteCheckFailedError("entitlement");
};

// 4) /app/goal/* 대시보드(GoalAppLayout) 그룹 전용 — 온보딩 완료 여부
// (RequireGoalAccess.jsx의 GoalOnboardingGate, 3단계 이관).
//
// ⚠️ 무한 리다이렉트 방지: 원본은 "지금 온보딩 경로에 있으면 판정을 건너뛴다"는
// 런타임 pathname 체크를 코드 안에 뒀다(GoalOnboardingGate 상단 주석). middleware
// 전환에서는 이 미들웨어 자체를 온보딩 라우트 그룹에는 달지 않는 구조로 옮겼다 —
// 온보딩 그룹은 애초에 이 미들웨어를 안 거치므로 "자기 자신으로 리다이렉트"가
// 구조적으로 발생할 수 없다(런타임 체크가 필요 없어짐). 최종 판정 결과(누가
// 어디로 가는지)는 원본과 동일하다 — App.jsx의 라우트 배선 주석 참고.
export const requireGoalOnboardingDoneMiddleware: MiddlewareFunction =
  async () => {
    const onboardingDone = await isOnboardingDone();

    if (onboardingDone === true) return;

    if (onboardingDone === false) {
      throw redirect("/app/goal/onboarding/step-1");
    }

    // null(판정 불가) — 온보딩으로도, 대시보드로도 보내지 않고 그 자리에 머문다.
    throw new RouteCheckFailedError("onboarding");
  };
