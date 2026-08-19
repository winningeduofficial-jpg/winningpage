import GradeNumberField from "@/components/goal/onboarding/GradeNumberField";
import NoneCheckbox from "@/components/goal/onboarding/NoneCheckbox";
import QuestionCard from "@/components/goal/onboarding/QuestionCard";
import WizardActions from "@/components/goal/onboarding/WizardActions";
import { useGoalOnboarding } from "@/context/GoalOnboardingContext";
import {
  MOCK_EXAM_ROUNDS,
  MOCK_EXAM_SUBJECTS,
} from "@/data/goalOnboardingMock";

function isValidGrade(raw: string) {
  const num = Number(raw);
  return raw !== "" && Number.isFinite(num) && num >= 1 && num <= 9;
}

// GoalOnboardingContext.tsx가 export하지 않는 로컬 타입이라 여기서만 그대로 재선언한다
// (updateMockExam의 partial 인자 타입과 구조가 같아야 캐스트가 의미를 갖는다).
type MockExamRound = { none: boolean } & Record<string, string>;

function emptySubjects(): Record<string, string> {
  return Object.fromEntries(
    MOCK_EXAM_SUBJECTS.map((subject) => [subject.key, ""]),
  );
}

type Step5MockExamProps = {
  goPrev: () => void;
  goNext: () => void;
};

// 5단계 — docs/figma-goal/part-03.md #7. 모의고사 4회차(3/6/9/10월) × 5과목(국/수/영/탐구1/2)
// 등급. 회차별 "없음" 체크 시 해당 회차 5과목 입력을 모두 비우고 완료 처리한다(추정).
export default function Step5MockExam({ goPrev, goNext }: Step5MockExamProps) {
  const { mockExam, updateMockExam } = useGoalOnboarding();
  // 전 회차 "없음"은 이미 정상 경로다(서버가 currentMogo=0으로 두고 정시 확률만 0으로 접는다).
  // 입력·검증은 그대로 두고, 확률이 0으로 뜨는 이유를 미리 알려 오해를 막는 안내문만 붙인다.
  //
  // 문구 주의: "계산에서 제외"가 아니라 "0%에서 시작"이다. 정시 컷이 있는 목표대학이면
  // base_*_jungsi 가 null 이 아니라 0 으로 저장되고(api/goal/intake.js) rate 도 정상값이라
  // jungsiAvailable=true(goalRepo.js:364, 컷 존재 여부만 본다) → 대시보드가 "데이터 준비 중"이
  // 아니라 0%에서 자라는 정시 게이지를 그린다. 제외된다고 말하면 화면과 어긋난다.
  // mockExam은 MOCK_EXAM_ROUNDS/MOCK_EXAM_SUBJECTS로부터 빌드되어 모든 key가 항상 존재한다.
  const allNone = MOCK_EXAM_ROUNDS.every(({ key }) => mockExam[key]!.none);
  const canProceed = MOCK_EXAM_ROUNDS.every(({ key }) => {
    const round = mockExam[key]!;
    return (
      round.none ||
      MOCK_EXAM_SUBJECTS.every(({ key: subjectKey }) =>
        isValidGrade(round[subjectKey]!),
      )
    );
  });

  return (
    <>
      <QuestionCard
        step="5"
        label="성적 입력"
        title="마지막으로 본 모의고사 등급을 입력해 주세요."
        description={
          '목표 대학과의 격차를 계산하는 기준 데이터입니다. 아직 시험을 보지 않았다면 "없음"을 선택하세요.'
        }
      >
        <div className="flex flex-col gap-10">
          {MOCK_EXAM_ROUNDS.map(({ key: roundKey, label: roundLabel }) => {
            // mockExam은 MOCK_EXAM_ROUNDS로부터 빌드되어 모든 key가 항상 존재한다.
            const round = mockExam[roundKey]!;
            return (
              <div key={roundKey}>
                <p className="mb-3 text-[0.9375rem] font-semibold text-ink-strong">
                  {roundLabel}
                </p>
                <div className="flex flex-wrap gap-4">
                  {MOCK_EXAM_SUBJECTS.map(
                    ({ key: subjectKey, label: subjectLabel }) => (
                      <GradeNumberField
                        key={subjectKey}
                        label={subjectLabel}
                        value={round[subjectKey]!}
                        disabled={round.none}
                        width="6.25rem"
                        placeholder="1~9"
                        onChange={(event) =>
                          updateMockExam(roundKey, {
                            [subjectKey]: event.target.value,
                          })
                        }
                      />
                    ),
                  )}
                </div>
                <NoneCheckbox
                  checked={round.none}
                  onChange={(event) =>
                    updateMockExam(
                      roundKey,
                      // GoalOnboardingContext.tsx의 MockExamRound = {none:boolean} & Record<string,string>
                      // 교차 타입은 Partial<MockExamRound>가 "none" 필드까지 string 인덱스 시그니처
                      // 제약에 묶어버려(boolean이 string에 배정 불가) 정상적인 부분 갱신 객체가 구조적으로
                      // 거부된다 — 컨텍스트 타입은 동결 대상이라 여기서만 단언한다.
                      {
                        none: event.target.checked,
                        ...(event.target.checked ? emptySubjects() : {}),
                      } as Partial<MockExamRound>,
                    )
                  }
                />
              </div>
            );
          })}
        </div>

        {allNone && (
          <p className="mt-8 rounded-xl bg-surface-03 px-5 py-4 text-[0.875rem] leading-normal text-ink-sub">
            모의고사 성적이 없어 정시 합격 확률은 0%에서 시작합니다. 지금은
            내신(수시) 기준으로 계산하고, 모의고사를 보고 성적을 입력하면 정시가
            반영돼요.
          </p>
        )}
      </QuestionCard>

      <WizardActions
        onPrev={goPrev}
        onNext={goNext}
        nextDisabled={!canProceed}
      />
    </>
  );
}
