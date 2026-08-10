import { useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import OnboardingStepShell from '../../components/goal/onboarding/OnboardingStepShell';
import OnboardingCalculatingOverlay from '../../components/goal/onboarding/OnboardingCalculatingOverlay';
import Step1School from '../../components/goal/onboarding/steps/Step1School';
import Step2UpperUniversity from '../../components/goal/onboarding/steps/Step2UpperUniversity';
import Step3LowerUniversity from '../../components/goal/onboarding/steps/Step3LowerUniversity';
import Step4Naesin from '../../components/goal/onboarding/steps/Step4Naesin';
import Step5MockExam from '../../components/goal/onboarding/steps/Step5MockExam';
import Step6StudyHours from '../../components/goal/onboarding/steps/Step6StudyHours';
import Step7DailySchedule from '../../components/goal/onboarding/steps/Step7DailySchedule';
import { GoalOnboardingProvider, useGoalOnboarding } from '../../context/GoalOnboardingContext';
import { markOnboardingDone } from '../../lib/goalOnboarding';

// 목표관리 온보딩 7단계 위저드 — docs/figma-goal/00-INDEX.md §3 G1 / §4-1.
// 라우트 계약(다른 에이전트가 App.jsx에 배선): `/app/goal/onboarding/:step` → 이 파일.
// step 파라미터는 'step-1' ~ 'step-7'만 유효하고, 범위 밖 값은 1단계로 리다이렉트한다.
// 마케팅 셸(SiteLayout) 안에서 렌더되므로 헤더/푸터는 이 파일이 그리지 않는다 — Header가
// position:fixed(4rem)라 pt-16으로 겹침만 보정한다.
const STEP_ORDER = ['step-1', 'step-2', 'step-3', 'step-4', 'step-5', 'step-6', 'step-7'];

// 계산 로딩 연출 지속 시간(ms) — 시안 #11엔 로딩 시간이 명시돼 있지 않아 임의값(추정).
const CALCULATING_DURATION_MS = 1400;

export default function Onboarding() {
  return (
    <GoalOnboardingProvider>
      <OnboardingWizard />
    </GoalOnboardingProvider>
  );
}

function OnboardingWizard() {
  const { step } = useParams();
  const navigate = useNavigate();
  const [isCalculating, setIsCalculating] = useState(false);
  const {
    schoolType,
    grade,
    upperUniversity,
    lowerUniversity,
    naesin,
    mockExam,
    studyHours,
    dailySchedule
  } = useGoalOnboarding();

  const stepIndex = STEP_ORDER.indexOf(step);

  if (stepIndex === -1) {
    return <Navigate to="/app/goal/onboarding/step-1" replace />;
  }

  const current = stepIndex + 1;
  const total = STEP_ORDER.length;

  function goPrev() {
    if (stepIndex === 0) return;
    navigate(`/app/goal/onboarding/${STEP_ORDER[stepIndex - 1]}`);
  }

  function goNext() {
    if (stepIndex === STEP_ORDER.length - 1) return;
    navigate(`/app/goal/onboarding/${STEP_ORDER[stepIndex + 1]}`);
  }

  // 7단계 "다음" 클릭 = 온보딩 완료. #11(전면 딤)을 "학습량 계산 중" 로딩으로 간주해 잠깐
  // 오버레이를 띄운 뒤 대시보드로 이동한다(작업 지시 §확정 사항 3). 서버 저장은 하지 않으므로
  // 최종 제출은 콘솔 로그 + markOnboardingDone() 완료 표시로 대체한다(작업 지시 §확정 사항 4).
  function handleFinish() {
    setIsCalculating(true);

    window.setTimeout(() => {
      // eslint-disable-next-line no-console
      console.log('[goal-onboarding] 온보딩 입력 완료:', {
        schoolType,
        grade,
        upperUniversity,
        lowerUniversity,
        naesin,
        mockExam,
        studyHours,
        dailySchedule
      });
      markOnboardingDone();
      navigate('/app/goal');
    }, CALCULATING_DURATION_MS);
  }

  return (
    // 페이지 배경(아주 옅은 회청색) — part-01.md:39 "카드만 흰색". 이 div가 SiteLayout(Header
    // fixed / Outlet / SiteFooter) 안에서 헤더~푸터 사이를 채우는 실제 전체 폭 루트라 배경은
    // 여기 둔다(OnboardingStepShell은 콘텐츠 폭 제한용 컨테이너라 배경을 주면 회색 패널이
    // 떠 보인다). 정확한 HEX가 시안에 없어 기존 surface.04(#F5F5F7) 토큰으로 근사한다(추정).
    <div className="min-h-screen bg-surface-04 pt-16">
      <OnboardingStepShell current={current} total={total}>
        {renderStep(step, { goPrev, goNext, onFinish: handleFinish })}
      </OnboardingStepShell>

      {isCalculating && <OnboardingCalculatingOverlay />}
    </div>
  );
}

function renderStep(step, { goPrev, goNext, onFinish }) {
  switch (step) {
    case 'step-1':
      return <Step1School goNext={goNext} />;
    case 'step-2':
      return <Step2UpperUniversity goPrev={goPrev} goNext={goNext} />;
    case 'step-3':
      return <Step3LowerUniversity goPrev={goPrev} goNext={goNext} />;
    case 'step-4':
      return <Step4Naesin goPrev={goPrev} goNext={goNext} />;
    case 'step-5':
      return <Step5MockExam goPrev={goPrev} goNext={goNext} />;
    case 'step-6':
      return <Step6StudyHours goPrev={goPrev} goNext={goNext} />;
    case 'step-7':
      return <Step7DailySchedule goPrev={goPrev} onFinish={onFinish} />;
    default:
      return null;
  }
}
