import type { MiddlewareFunction } from "react-router";
import { redirect } from "react-router";
import { ADMIN_SECTION_KEYS } from "@/pages/admin/adminSectionKeys";
import {
  canAccessSection,
  fetchAdminPermissions,
  fetchIsSuperAdmin,
} from "./adminPermissions";
import { isOnboardingDone } from "./goalOnboarding";
import { entitlementQueryOptions, queryClient } from "./queryClient";
import { getCached, setCached } from "./routeMiddlewareCache";
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

/**
 * /admin/<키> 에서 섹션 키를 뽑는다. /admin 자체와 /demo 계열은 null 이다
 * (전자는 index 라우트가 기본 섹션으로 보내고, 후자는 섹션 개념이 없다).
 */
function adminSectionKeyFromUrl(request: Request): string | null {
  const { pathname } = new URL(request.url);
  const match = pathname.match(/^\/admin\/([^/]+)/);
  return match?.[1] ?? null;
}

/**
 * 메뉴별 권한 확인 — 사이드바에서 숨기는 것과 **같은 규칙**을 URL 직접 입력에도 건다.
 *
 * 접근 불가일 때 곧장 막지 않고, 들어갈 수 있는 첫 메뉴로 보낸다.
 *   기본 섹션(popups)은 ADMIN_DEFAULT_SECTION_KEY 로 고정돼 있어서, 그 메뉴 권한이
 *   없는 관리자는 /admin 에 들어오자마자 막힌다 — 자기가 볼 수 있는 화면이 있는데도
 *   문 앞에서 튕기는 셈이다. 그래서 한 번은 갈 곳을 찾아준다.
 *   볼 수 있는 메뉴가 하나도 없을 때만 AdminForbiddenError 를 던진다.
 *
 * 순서는 ADMIN_SECTION_KEYS 를 따른다 — MENU_GROUPS 와 같은 그룹 순서라 사이드바
 * 맨 위에 가까운 것이 먼저 잡힌다. MENU_GROUPS 자체를 쓰지 않는 이유는 그게
 * Admin.tsx(=CONFIGS 전체)에 있어서, 여기서 import 하면 /admin 에 들어가지 않는
 * 사용자의 초기 번들에까지 그 무게가 얹히기 때문이다(adminSectionKeys.ts 상단 주석).
 */
async function assertAdminSectionAccess(request: Request, userId: string) {
  const sectionKey = adminSectionKeyFromUrl(request);
  if (!sectionKey) return;

  const [permissions, isSuperAdmin] = await Promise.all([
    fetchAdminPermissions(userId),
    fetchIsSuperAdmin(userId),
  ]);

  if (canAccessSection(permissions, isSuperAdmin, sectionKey)) return;

  const fallback = ADMIN_SECTION_KEYS.find((key) =>
    canAccessSection(permissions, isSuperAdmin, key),
  );

  if (fallback && fallback !== sectionKey) {
    throw redirect(`/admin/${fallback}`);
  }

  throw new AdminForbiddenError();
}

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

  const cachedRole = getCached<string | null>(user.id, "admin-role");

  if (cachedRole !== undefined) {
    if (cachedRole !== "admin") {
      throw new AdminForbiddenError();
    }
    return assertAdminSectionAccess(request, user.id);
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    throw new AdminForbiddenError();
  }

  const role = profile?.role ?? null;

  if (role === "admin") {
    setCached(user.id, "admin-role", role);
    return assertAdminSectionAccess(request, user.id);
  }

  // 초대받은 관리자의 첫 진입 — 안전망이다.
  //
  // ⚠️ 예전에는 여기가 **유일한** 통로였다. 초대 링크가 /admin 으로 돌아왔기
  //   때문인데, /admin 에는 비밀번호를 정하는 화면이 없어서 링크를 눌러도 아무것도
  //   못 했다. 그래서 도착지를 /login/reset-password 로 옮겼고(api/admin/invite-member),
  //   활성화도 그쪽에서 부른다(ResetPassword.tsx). 여기는 그 호출이 실패했거나
  //   예전 방식으로 들어온 사람을 위해 남겨둔다.
  //
  // 초대 시점의
  // profiles.role 은 아직 'user' 라(초대는 admin_members 에 invited 행만 만든다)
  // 위 검사에서 그대로 막힌다. 막히면 활성화를 호출할 기회가 영영 없다 —
  // 닭과 달걀이다.
  //
  // 그래서 role 검사에 걸린 사람에 한해 활성화를 한 번 시도한다.
  // fn_activate_admin_member 는 **자기 행이 invited 일 때만** active 로 바꾸고
  // (role_id 는 건드리지 않는다), 해당 행이 없으면 아무것도 하지 않는다.
  // 즉 관리자가 아닌 사람이 /admin 을 찔러봐야 권한이 생기지 않는다.
  //
  // active 가 되면 admin_members_sync_role 트리거가 profiles.role 을 'admin' 으로
  // 올린다(20260822000014) — 기존 RLS 수백 곳이 여전히 is_admin() 을 쓰므로 그
  // 축까지 올라가야 화면이 실제로 데이터를 읽는다.
  const { data: activated, error: activateError } = await supabase.rpc(
    "fn_activate_admin_member",
  );

  if (!activateError && activated?.status === "active") {
    setCached(user.id, "admin-role", "admin");
    return assertAdminSectionAccess(request, user.id);
  }

  setCached(user.id, "admin-role", role);
  throw new AdminForbiddenError();
};

// 3) /app/goal/* — 로그인 + 이용권('goal') 확인(RequireGoalAccess.jsx의 1・2단계,
// 즉 RequireEntitlement의 standalone 분기 이관). 두 라우트 그룹(온보딩 그룹 +
// GoalAppLayout 대시보드 그룹) 모두에 건다 — 원본과 동일하게 온보딩 경로도
// 로그인・이용권 판정은 적용받는다.
//
// 이용권 판정 캐시는 routeMiddlewareCache(TTL 15초, userId별)가 아니라
// queryClient(entitlementQueryOptions, staleTime 5분)가 맡는다 — Dashboard.tsx가
// 소비하는 useQuery(['entitlement','goal'])와 같은 키를 공유해야 "이 미들웨어가
// 이미 물어본 값"을 화면이 다시 조회하지 않는다(명세 B-2 §5). ensureQueryData는
// 캐시가 fresh하면 네트워크를 타지 않고, 없거나 stale이면 조회 후 캐싱한다.
export const requireGoalAccessMiddleware: MiddlewareFunction = async ({
  request,
}) => {
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData.session?.user;

  if (!user) {
    throw loginRedirect(request);
  }

  const entitlement = await queryClient.ensureQueryData(
    entitlementQueryOptions("goal"),
  );
  const allowed = entitlement.allowed;

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
// 온보딩 완료 판정 캐시도 routeMiddlewareCache가 아니라 queryClient가 맡는다 —
// isOnboardingDone()(goalOnboarding.ts)이 내부에서 goalStudentQueryOptions()를
// ensureQueryData로 조회하므로, 이 미들웨어와 Dashboard.tsx의 useQuery(['goal','student'])가
// 같은 캐시를 공유한다(명세 B-2 §5·§7 — goal 진입 시 GET /api/goal/student 1회 수렴).
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
