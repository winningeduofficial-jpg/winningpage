import QuestionCard from '../QuestionCard';
import GradeNumberField from '../GradeNumberField';
import NoneCheckbox from '../NoneCheckbox';
import WizardActions from '../WizardActions';
import { MOCK_EXAM_ROUNDS, MOCK_EXAM_SUBJECTS } from '../../../../data/goalOnboardingMock';
import { useGoalOnboarding } from '../../../../context/GoalOnboardingContext';

function isValidGrade(raw) {
  const num = Number(raw);
  return raw !== '' && Number.isFinite(num) && num >= 1 && num <= 9;
}

function emptySubjects() {
  return Object.fromEntries(MOCK_EXAM_SUBJECTS.map((subject) => [subject.key, '']));
}

// 5단계 — docs/figma-goal/part-03.md #7. 모의고사 4회차(3/6/9/10월) × 5과목(국/수/영/탐구1/2)
// 등급. 회차별 "없음" 체크 시 해당 회차 5과목 입력을 모두 비우고 완료 처리한다(추정).
export default function Step5MockExam({ goPrev, goNext }) {
  const { mockExam, updateMockExam } = useGoalOnboarding();
  const canProceed = MOCK_EXAM_ROUNDS.every(({ key }) => {
    const round = mockExam[key];
    return round.none || MOCK_EXAM_SUBJECTS.every(({ key: subjectKey }) => isValidGrade(round[subjectKey]));
  });

  return (
    <>
      <QuestionCard
        step="5"
        label="성적 입력"
        title="마지막으로 본 모의고사 등급을 입력해 주세요."
        description={'목표 대학과의 격차를 계산하는 기준 데이터입니다. 아직 시험을 보지 않았다면 "없음"을 선택하세요.'}
      >
        <div className="flex flex-col gap-[2.5rem]">
          {MOCK_EXAM_ROUNDS.map(({ key: roundKey, label: roundLabel }) => {
            const round = mockExam[roundKey];
            return (
              <div key={roundKey}>
                <p className="mb-[0.75rem] text-[0.9375rem] font-semibold text-ink-strong">{roundLabel}</p>
                <div className="flex flex-wrap gap-[1rem]">
                  {MOCK_EXAM_SUBJECTS.map(({ key: subjectKey, label: subjectLabel }) => (
                    <GradeNumberField
                      key={subjectKey}
                      label={subjectLabel}
                      value={round[subjectKey]}
                      disabled={round.none}
                      width="6.25rem"
                      placeholder="1~9"
                      onChange={(event) => updateMockExam(roundKey, { [subjectKey]: event.target.value })}
                    />
                  ))}
                </div>
                <NoneCheckbox
                  checked={round.none}
                  onChange={(event) =>
                    updateMockExam(roundKey, {
                      none: event.target.checked,
                      ...(event.target.checked ? emptySubjects() : {})
                    })
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
