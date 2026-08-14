import {
  type Grade,
  type SchoolType,
  useGoalOnboarding,
} from "../../../../context/GoalOnboardingContext";
import {
  HIGH_SCHOOL_GRADE_OPTIONS,
  SCHOOL_TYPE_OPTIONS,
} from "../../../../data/goalOnboardingMock";
import QuestionCard from "../QuestionCard";
import RadioChip from "../RadioChip";
import WizardActions from "../WizardActions";

// 1단계 — docs/figma-goal/part-01.md #1(학교 유형) + #2(선택 시 같은 화면에 누적 노출되는
// 1-2 학년 카드). 별도 스텝이 아니라 하나의 스텝 안에서 카드가 조건부로 추가된다.
//
// 일반고・특목자사고 경로만 구현한다(작업 지시 §확정 사항 2). 중학교・초등학교를 고르면 분기
// 시안이 없으므로 "준비 중" 안내로 막고 다음 단계로 진행시키지 않는다 — "다음"은 영구 비활성.
type Step1SchoolProps = {
  goNext: () => void;
};

export default function Step1School({ goNext }: Step1SchoolProps) {
  const { schoolType, grade, setSchoolType, setGrade } = useGoalOnboarding();

  const isHighSchoolPath = schoolType === "general" || schoolType === "special";
  const isBlockedPath = schoolType === "middle" || schoolType === "elementary";
  const canProceed = isHighSchoolPath && !!grade;

  return (
    <>
      <QuestionCard
        step="1"
        label="학교정보"
        title="현재 어떤 학교에 재학 중인가요?"
        description="선택한 학교 유형에 따라 이후 단계 수와 성적 입력 방식, 합격 가능성 산출 기준이 달라집니다."
      >
        <div
          role="radiogroup"
          aria-label="학교 유형"
          className="flex flex-wrap gap-[0.75rem]"
        >
          {SCHOOL_TYPE_OPTIONS.map((option) => (
            <RadioChip
              key={option.value}
              label={option.label}
              selected={schoolType === option.value}
              // SCHOOL_TYPE_OPTIONS의 value는 SchoolType 리터럴 값만 담는 고정 목록이다.
              onClick={() => setSchoolType(option.value as SchoolType)}
            />
          ))}
        </div>
      </QuestionCard>

      {isHighSchoolPath && (
        <QuestionCard
          step="1-2"
          label="학교정보"
          title="현재 학년을 선택해 주세요."
        >
          <div
            role="radiogroup"
            aria-label="학년"
            className="flex flex-wrap gap-[0.75rem]"
          >
            {HIGH_SCHOOL_GRADE_OPTIONS.map((option) => (
              <RadioChip
                key={option.value}
                label={option.label}
                selected={grade === option.value}
                // HIGH_SCHOOL_GRADE_OPTIONS의 value는 Grade 리터럴 값만 담는 고정 목록이다.
                onClick={() => setGrade(option.value as Grade)}
              />
            ))}
          </div>
        </QuestionCard>
      )}

      {isBlockedPath && (
        <QuestionCard step="1-2" label="학교정보" title="아직 준비 중이에요">
          <p className="text-[0.875rem] leading-[1.6] text-ink-sub">
            중학교・초등학교는 학년 수와 성적 입력 방식이 달라 아직 지원하지
            않아요. 일반고 또는 특목・자사고를 선택하면 계속 진행할 수 있어요.
          </p>
        </QuestionCard>
      )}

      {/* 1단계는 "이전"이 없다(작업 지시 셸 규격: "1단계는 다음 단독(중앙)") */}
      <WizardActions onNext={goNext} nextDisabled={!canProceed} />
    </>
  );
}
