import { useGoalOnboarding } from "../../../../context/GoalOnboardingContext";
import QuestionCard from "../QuestionCard";
import UniversitySelect from "../UniversitySelect";
import WizardActions from "../WizardActions";

// 3단계 — docs/figma-goal/part-02.md #5. 하한(최소) 목표 대학 — Step2와 동일 컴포넌트를
// target="lower"로 재사용한다.
//
// 시안 오타 정정(작업 지시 §확정 사항 7): 스텝 라벨 "상한 대학교 입력" → "하한 대학교 입력",
// 보조설명 "하햔선" → "하한선".
export default function Step3LowerUniversity({ goPrev, goNext }) {
  const { lowerUniversity, setLowerUniversity } = useGoalOnboarding();
  const canProceed =
    !!lowerUniversity.university && !!lowerUniversity.department;

  return (
    <>
      <QuestionCard
        step="3"
        label="하한 대학교 입력"
        title="반드시 합격하고 싶은 대학교는 무엇인가요?"
        description="이상 목표만으로는 학습량이 비현실적으로 산출되므로, 지켜야 할 하한선을 함께 설정합니다."
      >
        <UniversitySelect
          target="lower"
          value={lowerUniversity}
          onChange={setLowerUniversity}
        />
        <p className="mt-[0.75rem] text-[0.875rem] text-ink-sub">
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
