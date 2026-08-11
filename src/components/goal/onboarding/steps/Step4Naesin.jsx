import QuestionCard from '../QuestionCard';
import GradeNumberField from '../GradeNumberField';
import NoneCheckbox from '../NoneCheckbox';
import WizardActions from '../WizardActions';
import { NAESIN_EXAMS } from '../../../../data/goalOnboardingMock';
import { useGoalOnboarding } from '../../../../context/GoalOnboardingContext';

function isValidGrade(raw) {
  const num = Number(raw);
  return raw !== '' && Number.isFinite(num) && num >= 1 && num <= 9;
}

// 4단계 — docs/figma-goal/part-02.md #6. 내신 4개 시험(1/2학기 중간・기말) 평균 등급.
// "다음" 활성 조건은 시안에 명시가 없어(part-02 #6 상태/인터랙션 "추정") 4개 시험 모두
// 값이 채워졌거나 "없음"으로 확정된 경우로 구현한다.
//
// 시안은 좌측 정렬 단일 컬럼(303px)이라 카드 우측이 크게 비지만, 구현 재량으로 2열 그리드
// 배치한다(part-02 #6 구현 노트: "2열 배치 등 재량 조정 가능").
export default function Step4Naesin({ goPrev, goNext }) {
  const { naesin, updateNaesin } = useGoalOnboarding();
  const canProceed = NAESIN_EXAMS.every(({ key }) => {
    const exam = naesin[key];
    return exam.none || isValidGrade(exam.value);
  });

  return (
    <>
      <QuestionCard
        step="4"
        label="성적 입력"
        title="마지막으로 본 내신 평균 등급을 입력해 주세요."
        description={'목표 대학과의 격차를 계산하는 기준 데이터입니다. 아직 시험을 보지 않았다면 "없음"을 선택하세요.'}
      >
        <div className="grid grid-cols-2 gap-x-[2.5rem] gap-y-[2.5rem]">
          {NAESIN_EXAMS.map(({ key, label }) => {
            const exam = naesin[key];
            return (
              <div key={key}>
                <GradeNumberField
                  label={label}
                  value={exam.value}
                  disabled={exam.none}
                  suffix="등급"
                  width="16rem"
                  onChange={(event) => updateNaesin(key, { value: event.target.value })}
                />
                <NoneCheckbox
                  checked={exam.none}
                  onChange={(event) =>
                    updateNaesin(key, { none: event.target.checked, value: event.target.checked ? '' : exam.value })
                  }
                />
              </div>
            );
          })}
        </div>
      </QuestionCard>

      <WizardActions onPrev={goPrev} onNext={goNext} nextDisabled={!canProceed} />
    </>
  );
}
