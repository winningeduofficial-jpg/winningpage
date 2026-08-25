// 목표관리 온보딩(설문 7단계, /app/goal/onboarding/step-1~7) 완료 여부 판정.
//
// 2026-08-11: goal_students 테이블이 생겨 서버가 온보딩 완료의 정본이 됐다. 과거엔
// isOnboardingDone()이 localStorage 플래그를 동기로 읽었지만, 이제는
// fetchGoalStudent()(src/lib/goalApi.js)로 서버에 물어보는 비동기 판정으로 바꿨다 —
// src/lib/entitlement.js의 hasEntitlement()와 동일하게 true/false/null 3값 계약을 쓴다.
// RequireGoalAccess.jsx의 3단계 판정도 이 비동기 함수에 맞춰 함께 바뀌었다(로딩 상태 추가).
//
// markOnboardingDone()/resetOnboarding()은 지우지 않았다 — 다른 코드가 참조할 수 있고
// QA 콘솔 유틸로도 쓰인다. 다만 실제 게이트 판정(isOnboardingDone())은 이제 이 값을
// 전혀 읽지 않는다 — localStorage 플래그를 세우거나 지워도 서버 판정 결과는 바뀌지
// 않는다. Onboarding.jsx의 handleFinish()도 더 이상 markOnboardingDone()을 호출하지
// 않는다(서버가 진실이므로 클라이언트 완료 플래그를 세울 이유가 없다).
import { goalStudentQueryOptions, queryClient } from "./queryClient";

const ONBOARDING_DONE_KEY = "winning-goal-onboarding-done-v1";

// 로컬 QA 전용 "온보딩 완료 가정" 플래그.
// 사용법: .env.local에 VITE_FAKE_ONBOARDING_DONE=true 를 추가하고 개발 서버를 재시작한다.
// import.meta.env.DEV를 반드시 함께 검사한다 — 프로덕션 빌드는 항상 DEV=false이므로,
// 이 값이 실수로 환경변수에 들어가도(Vercel 등) 프로덕션 번들에서는 활성화가 절대 불가능하다.
// FAKE_ENTITLEMENT_ENABLED(src/lib/entitlement.js)와 판정 대상이 다르다 — 그건 "결제했다고
// 가정", 이건 "온보딩을 마쳤다고 가정"이다.
const FAKE_ONBOARDING_DONE_ENABLED =
  import.meta.env.DEV === true &&
  import.meta.env.VITE_FAKE_ONBOARDING_DONE === "true";

// 반환값 계약(호출부, 특히 RequireGoalAccess.jsx가 반드시 구분해야 함) —
// hasEntitlement()(src/lib/entitlement.js)와 같은 3값 계약:
//   - FAKE_ONBOARDING_DONE_ENABLED가 켜져 있으면 네트워크 호출 없이 즉시 true.
//   - 서버가 onboarded:true 를 주면 true(완료).
//   - 서버가 onboarded:false 를 주면 false(명시적 미완료) — status:'awaiting_cuts'로
//     제출은 마쳤으나 컷 데이터가 없어 확률이 아직 없는 경우도 여기 포함된다. 이 학생은
//     대시보드를 볼 수 없으므로 온보딩 미완료와 동일하게 취급해 온보딩 경로로 보낸다.
//   - fetchGoalStudent()가 'no-session'/'not-allowed'/'error'를 주면 null(판정 불가).
//     이 함수는 RequireGoalAccess.jsx의 3단계(1・2단계 통과 후)에서만 호출되므로 정상
//     경로에서 no-session/not-allowed가 나오는 건 세션·이용권이 그 사이 끊긴 경쟁
//     상태뿐이다 — 여기서 "미완료"로 단정해 온보딩으로 보내면, 실제로는 로그인이
//     끊기거나 이용권을 잃은 사용자를 엉뚱한 화면(온보딩)으로 보내는 오탐이 된다.
//     그 판정은 1・2단계의 책임이므로 이 함수는 세 경우 모두 null로 접어 호출부가
//     재시도 UI로 연결하게 한다(false로 단정하지 않는다).
// GET /api/goal/student 조회는 queryClient(entitlementQueryOptions와 같은 계열,
// src/lib/queryClient.ts)의 ensureQueryData를 거친다 — requireGoalOnboardingDoneMiddleware와
// Dashboard.tsx가 같은 ['goal','student'] 캐시를 공유해야 goal 진입 시 이 엔드포인트가
// 한 번만 불린다(명세 B-2 §5·§7). fetchGoalStudent() 자체의 discriminated union
// 계약(예외를 던지지 않음)은 그대로다 — queryClient는 그 결과를 캐싱만 한다.
export async function isOnboardingDone() {
  if (FAKE_ONBOARDING_DONE_ENABLED) return true;

  const result = await queryClient.ensureQueryData(goalStudentQueryOptions());

  if (result.kind === "onboarded") return true;
  if (result.kind === "not-onboarded" || result.kind === "awaiting-cuts")
    return false;

  // 'no-session' | 'not-allowed' | 'error' — 전부 판정 불가.
  return null;
}

export function markOnboardingDone() {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(ONBOARDING_DONE_KEY, "true");
  } catch (error) {
    console.error("[goalOnboarding] localStorage 쓰기 오류:", error);
  }
}

// QA용 초기화 — 온보딩 가드를 반복 확인할 때 콘솔에서 호출.
export function resetOnboarding() {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.removeItem(ONBOARDING_DONE_KEY);
  } catch (error) {
    console.error("[goalOnboarding] localStorage 삭제 오류:", error);
  }
}
