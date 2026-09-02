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
              step={0.1}
            />
          ))}
        </div>

        {/* QA 행290 — 산정식 안내. 표시 시간(h)이 실제로는 "총 공부시간(분) ÷ 60"을
            소수 둘째 자리까지 반올림한 값이라는 것을 밝힌다(round2, SliderRow.tsx). */}
        <p className="mt-4 text-[0.8125rem] leading-[1.4] text-ink-sub">
          입력한 시간은 총 공부시간(분) ÷ 60, 소수 둘째 자리 반올림으로
          계산돼요.
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
