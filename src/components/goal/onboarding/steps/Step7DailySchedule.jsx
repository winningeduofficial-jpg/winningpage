import QuestionCard from "../QuestionCard";
import StepperRow from "../StepperRow";
import WizardActions from "../WizardActions";
import { DAILY_SCHEDULE_FIELDS } from "../../../../data/goalOnboardingMock";
import { useGoalOnboarding } from "../../../../context/GoalOnboardingContext";

// 7단계(마지막) — docs/figma-goal/part-04.md #10. 기상・취침・학교체류・학원과외 시간.
// 시안상 두 버튼 모두 항상 활성(비활성/에러 표현 없음) — 기본값이 이미 채워져 있어 별도
// 검증 없이 "다음"을 누르면 온보딩이 완료된다. "다음" 클릭은 Onboarding.jsx의
// onFinish(계산 로딩 오버레이 → 대시보드 이동)로 연결된다.
export default function Step7DailySchedule({ goPrev, onFinish }) {
  const { dailySchedule, setDailyScheduleField } = useGoalOnboarding();

  return (
    <>
      <QuestionCard
        step="7"
        label="자습 시간 입력"
        title="하루 일정을 알려주세요."
        description="기상・취침・등교・학원 시간을 빼고 실제로 쓸 수 있는 시간을 계산합니다."
      >
        <div className="flex flex-col gap-[3.25rem]">
          {DAILY_SCHEDULE_FIELDS.map((field) => (
            <StepperRow
              key={field.key}
              label={field.label}
              unit={field.unit}
              min={field.min}
              max={field.max}
              value={dailySchedule[field.key]}
              onChange={(value) => setDailyScheduleField(field.key, value)}
            />
          ))}
        </div>
      </QuestionCard>

      <WizardActions onPrev={goPrev} onNext={onFinish} nextDisabled={false} />
    </>
  );
}
