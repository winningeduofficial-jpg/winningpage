// 목표관리 온보딩(설문 7단계, /app/goal/onboarding/step-1~7) 완료 여부 판정.
//
// TODO(goal-app-shell): 지금은 온보딩 데이터 스키마 자체가 없다(목업 우선 단계 —
// docs/figma-goal 기준 온보딩 화면만 확정, 저장 테이블 미정). 그래서 완료 여부를
// localStorage 플래그로만 판정한다. 실제 온보딩 응답을 저장할 DB 테이블(예:
// goal_onboarding_responses 등, profile_id 기준)이 생기면 이 모듈의 판정 소스를
// localStorage → 서버 조회로 교체해야 한다. 그때 RequireGoalAccess.jsx의 3단계 판정도
// 비동기 서버 조회로 바뀌어야 한다(지금은 동기 localStorage라 로딩 상태 없이 즉시 판정됨).
const ONBOARDING_DONE_KEY = 'winning-goal-onboarding-done-v1';

// 로컬 QA 전용 "온보딩 완료 가정" 플래그.
// 사용법: .env.local에 VITE_FAKE_ONBOARDING_DONE=true 를 추가하고 개발 서버를 재시작한다.
// import.meta.env.DEV를 반드시 함께 검사한다 — 프로덕션 빌드는 항상 DEV=false이므로,
// 이 값이 실수로 환경변수에 들어가도(Vercel 등) 프로덕션 번들에서는 활성화가 절대 불가능하다.
// FAKE_ENTITLEMENT_ENABLED(src/lib/entitlement.js)와 판정 대상이 다르다 — 그건 "결제했다고
// 가정", 이건 "온보딩을 마쳤다고 가정"이다.
export const FAKE_ONBOARDING_DONE_ENABLED =
  import.meta.env.DEV === true && import.meta.env.VITE_FAKE_ONBOARDING_DONE === 'true';

export function isOnboardingDone() {
  if (FAKE_ONBOARDING_DONE_ENABLED) return true;

  if (typeof window === 'undefined') return false;

  try {
    return window.localStorage.getItem(ONBOARDING_DONE_KEY) === 'true';
  } catch (error) {
    // 프라이빗 브라우징 등으로 localStorage 접근이 막히면 "미완료"로 보수적으로 판정한다.
    console.error('[goalOnboarding] localStorage 읽기 오류:', error);
    return false;
  }
}

export function markOnboardingDone() {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(ONBOARDING_DONE_KEY, 'true');
  } catch (error) {
    console.error('[goalOnboarding] localStorage 쓰기 오류:', error);
  }
}

// QA용 초기화 — 온보딩 가드를 반복 확인할 때 콘솔에서 호출.
export function resetOnboarding() {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.removeItem(ONBOARDING_DONE_KEY);
  } catch (error) {
    console.error('[goalOnboarding] localStorage 삭제 오류:', error);
  }
}
