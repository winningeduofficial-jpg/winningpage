import { WEEKDAY_OPTIONS } from "@/components/goal/onboarding/onboardingOptions";
import QuestionCard from "@/components/goal/onboarding/QuestionCard";
import SliderRow from "@/components/goal/onboarding/SliderRow";
import WizardActions from "@/components/goal/onboarding/WizardActions";
import { useGoalOnboarding } from "@/context/GoalOnboardingContext";

// 6단계 — docs/figma-goal/part-03.md #8(빈값) / #9(입력 후). 요일별 자습 시간.
// "다음"은 요일 중 하나라도 0h 초과일 때 활성화된다(part-03 #9 상태/인터랙션 근거).
type Step6StudyHoursProps = {
  goPrev: () => void;
  goNext: () => void;
};

export default function Step6StudyHours({
  goPrev,
  goNext,
}: Step6StudyHoursProps) {
  const { studyHours, setStudyHour } = useGoalOnboarding();
  // studyHours는 WEEKDAY_OPTIONS로부터 빌드되어 모든 key가 항상 존재한다.
  const canProceed = WEEKDAY_OPTIONS.some(({ key }) => studyHours[key]! > 0);

  return (
    <>
      <QuestionCard
        step="6"
        label="자습 시간 입력"
        title="매일 혼자 공부하는 시간을 요일별로 입력해주세요."
        description="지금의 실제 학습량을 기준으로 목표 학습 시간을 계산합니다."
      >
        <div className="flex flex-col gap-6">
          {WEEKDAY_OPTIONS.map(({ key, label }) => (
            <SliderRow
              key={key}
              label={label}
              value={studyHours[key]!}
              onChange={(value) => setStudyHour(key, value)}
            />
          ))}
        </div>
      </QuestionCard>

      <WizardActions
        onPrev={goPrev}
        onNext={goNext}
        nextDisabled={!canProceed}
      />
    </>
  );
}
