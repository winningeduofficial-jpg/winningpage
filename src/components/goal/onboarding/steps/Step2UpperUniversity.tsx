import QuestionCard from "@/components/goal/onboarding/QuestionCard";
import UniversitySelect from "@/components/goal/onboarding/UniversitySelect";
import WizardActions from "@/components/goal/onboarding/WizardActions";
import { useGoalOnboarding } from "@/context/GoalOnboardingContext";

// 2단계 — docs/figma-goal/part-01.md #3 + part-02.md #4. 상한(이상) 목표 대학.
type Step2UpperUniversityProps = {
  goPrev: () => void;
  goNext: () => void;
};

export default function Step2UpperUniversity({
  goPrev,
  goNext,
}: Step2UpperUniversityProps) {
  const { upperUniversity, setUpperUniversity } = useGoalOnboarding();
  const canProceed =
    !!upperUniversity.university && !!upperUniversity.department;

  return (
    <>
      <QuestionCard
        step="2"
        label="상한 대학교 입력"
        title="도전해보고 싶은 가장 높은 대학교는 무엇인가요?"
        description={
          '학습량 산출의 상한선이자, "이상 목표" 진행률의 기준이 됩니다'
        }
      >
        <UniversitySelect
          target="upper"
          value={upperUniversity}
          onChange={setUpperUniversity}
        />
        <p className="mt-3 text-[0.875rem] text-ink-sub">
          대학명과 과를 선택하셔야 다음 단계로 넘어갈 수 있습니다.
        </p>
      </QuestionCard>

      <WizardActions
        onPrev={goPrev}
        onNext={goNext}
        nextDisabled={!canProceed}
      />
    </>
  );
}
