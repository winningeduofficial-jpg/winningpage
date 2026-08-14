// 세션 진행 상태 → 사이드바 5스텝 상태 배열. docs/수행평가-상세-명세.md §3.3(진행단계
// 상태 머신, 노드별 활성 스텝 표가 정본).
//
// ⚠️ **이 함수는 순수 매핑일 뿐이다.** off-by-one 교정 규율(§13 격차표 #1)은 이 함수
//    안에 없다 — 호출부(현재는 PerformanceChatPage)가 `activeStep`을 넘길 때 지켜야
//    하는 규율이다:
//    외부 앱은 비동기 생성을 **시작하는 시점**에 다음 스텝을 이미 켜는 결함이 있었다
//    (예: 주제 추천 요청을 보내자마자 STEP4가 켜짐 — 아직 아무것도 완료되지 않았는데
//    다음 스텝이 진행 중이라고 표시). 이 앱은 **완료 후에만** 다음 스텝으로 올린다.
//    단, §3.3 노드별 활성 스텝 표가 어떤 로딩 화면 자체를 이미 다음 스텝으로 명시하는
//    경우(예: 주제 확정 → 설계 리포트 생성 로딩 = STEP4 활성)는 표가 정본이다 — 그
//    로딩은 "다음 스텝을 미리 켠 것"이 아니라 "그 로딩 자체가 다음 스텝의 일부"이기
//    때문이다(설계 리포트 생성은 STEP4 자신의 작업이지 STEP5의 선행 작업이 아니다).
//    호출부는 매 사례를 표와 대조해 activeStep을 산출해야 한다 — 이 함수는 그 결과를
//    받아 그대로 매핑만 한다.

/**
 * @param {object} [params]
 * @param {number[]} [params.completedSteps] 완료된 스텝 번호들 (1~5). 범위 밖 값은 무시된다.
 * @param {number|null} [params.activeStep] 현재 진행 중 스텝 (1~5) 또는 null(활성 없음 — 저장
 *   리포트 화면처럼 §3.3이 「활성 스텝 0개」로 규정한 정상 입력이다, 예외가 아니다).
 * @returns {Array<'done'|'current'|'todo'>} 길이 5.
 */
export function deriveStepStates({
  completedSteps = [],
  activeStep = null,
} = {}) {
  const completedSet = new Set(
    (completedSteps || []).filter(
      (step) => Number.isInteger(step) && step >= 1 && step <= 5,
    ),
  );

  return Array.from({ length: 5 }, (_, index) => {
    const step = index + 1;
    // current가 done보다 우선한다 — 완료했던 스텝을 재방문해 다시 작업 중이면 current다.
    if (step === activeStep) return "current";
    if (completedSet.has(step)) return "done";
    return "todo";
  });
}
