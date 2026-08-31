import GradeNumberField from "@/components/goal/onboarding/GradeNumberField";
import NoneCheckbox from "@/components/goal/onboarding/NoneCheckbox";
import { NAESIN_EXAMS } from "@/components/goal/onboarding/onboardingOptions";
import QuestionCard from "@/components/goal/onboarding/QuestionCard";
import WizardActions from "@/components/goal/onboarding/WizardActions";
import { useGoalOnboarding } from "@/context/GoalOnboardingContext";

function isValidGrade(raw: string) {
  const num = Number(raw);
  return raw !== "" && Number.isFinite(num) && num >= 1 && num <= 9;
}

// 내신 4회차를 "전부 없음"으로 체크했을 때만 노출하는 학년별 문구. 별도 스텝을 만들지 않고
// 이 스텝 안에서 조건부 블록으로 붙이므로(Step1School의 1-2 카드와 같은 관례) 로컬 상수로 둔다.
// 입력값은 원점수(0~100)가 아니라 우리 온보딩 전 구간과 같은 1~9 등급 단일 스케일이다.
const PRIOR_NAESIN_COPY = {
  g1: {
    label: "중학교 내신 평균 등급",
    bannerTitle: "아직 고등학교 내신 성적이 없어요",
    bannerBody:
      "중학교 때 주요과목 평균 등급을 기준으로 합격 확률을 계산합니다.",
  },
  g2: {
    label: "고1까지 내신 평균 등급",
    bannerTitle: "올해 내신 성적이 아직 없어요",
    bannerBody:
      "고1까지의 누적 평균 등급과 남은 내신 횟수를 기준으로 합격 확률을 계산합니다.",
  },
  g3: {
    label: "고2까지 내신 평균 등급",
    bannerTitle: "올해 내신 성적이 아직 없어요",
    bannerBody:
      "고2까지의 누적 평균 등급과 남은 내신 횟수를 기준으로 합격 확률을 계산합니다.",
  },
};

// 4단계 — docs/figma-goal/part-02.md #6. 내신 4개 시험(1/2학기 중간・기말) 평균 등급.
// "다음" 활성 조건은 시안에 명시가 없어(part-02 #6 상태/인터랙션 "추정") 4개 시험 모두
// 값이 채워졌거나 "없음"으로 확정된 경우로 구현한다.
//
// 시안은 좌측 정렬 단일 컬럼(303px)이라 카드 우측이 크게 비지만, 구현 재량으로 2열 그리드
// 배치한다(part-02 #6 구현 노트: "2열 배치 등 재량 조정 가능").
//
// 4회차를 전부 "없음"으로 두면(= 아직 내신 시험을 한 번도 안 본 고1 3월 학생 등) 예전에는
// 서버가 400으로 거절했다. 이제는 "이전 학년까지의 내신 평균 등급" 한 칸을 추가로 받아
// 통과시킨다 — 섹션 전체 '없음'을 나타내는 별도 플래그를 두지 않고 "4회차 전부 none"에서
// 파생하므로("전역 OFF인데 전부 none" 같은 모순 상태가 생기지 않는다) 서버의 기존 거절
// 조건식이 그대로 특례 발동 조건이 된다.
type Step4NaesinProps = {
  goPrev: () => void;
  goNext: () => void;
};

export default function Step4Naesin({ goPrev, goNext }: Step4NaesinProps) {
  const { naesin, updateNaesin, grade, priorNaesinGrade, setPriorNaesinGrade } =
    useGoalOnboarding();

  // naesin은 NAESIN_EXAMS로부터 빌드되어 모든 key가 항상 존재한다.
  const allNone = NAESIN_EXAMS.every(({ key }) => naesin[key]!.none);
  // 4단계는 1단계에서 학년을 고른 뒤에만 진입하므로 grade가 비는 경로는 없으나, 직접 URL
  // 진입 등으로 비었을 때를 대비해 고1 문구를 기본값으로 둔다(방어).
  // 소유 키만 본다 — grade 는 sessionStorage 복구값이 그대로 들어올 수 있어서(buildInitialState의
  // `{...defaults, ...stored}`는 값을 검증하지 않는다) 'constructor' 같은 Object.prototype 키면
  // 대괄호 조회가 truthy한 비-문구 객체를 잡아 `||` 폴백이 발동하지 않고 배너·라벨이 전부
  // 빈칸으로 렌더된다(같은 함정을 calc/bonus.js:107-109가 이미 if-else 사슬로 회피한다).
  const priorCopy =
    grade && Object.hasOwn(PRIOR_NAESIN_COPY, grade)
      ? PRIOR_NAESIN_COPY[grade]
      : PRIOR_NAESIN_COPY.g1;

  const canProceed = allNone
    ? isValidGrade(priorNaesinGrade)
    : NAESIN_EXAMS.every(({ key }) => {
        // naesin은 NAESIN_EXAMS로부터 빌드되어 모든 key가 항상 존재한다.
        const exam = naesin[key]!;
        return exam.none || isValidGrade(exam.value);
      });

  return (
    <>
      <QuestionCard
        step="4"
        label="성적 입력"
        title="마지막으로 본 내신 평균 등급을 입력해 주세요."
        description={
          '목표 대학과의 격차를 계산하는 기준 데이터입니다. 아직 보지 않은 시험은 "없음"을 선택하세요. 4개 모두 없으면 이전 학년 성적으로 계산합니다.'
        }
      >
        <div className="grid grid-cols-2 gap-x-10 gap-y-10">
          {NAESIN_EXAMS.map(({ key, label }) => {
            // naesin은 NAESIN_EXAMS로부터 빌드되어 모든 key가 항상 존재한다.
            const exam = naesin[key]!;
            return (
              <div key={key}>
                <GradeNumberField
                  label={label}
                  value={exam.value}
                  disabled={exam.none}
                  suffix="등급"
                  width="16rem"
                  onChange={(event) =>
                    updateNaesin(key, { value: event.target.value })
                  }
                />
                <NoneCheckbox
                  checked={exam.none}
                  onChange={(event) => {
                    updateNaesin(key, {
                      none: event.target.checked,
                      value: event.target.checked ? "" : exam.value,
                    });
                    // "없음"을 해제하면 더 이상 전 회차 없음이 아니므로 특례 입력을 비운다 —
                    // 남겨두면 다시 전부 체크했을 때 예전 값이 되살아나 사용자가 의식하지 못한
                    // 채 제출된다.
                    if (!event.target.checked) setPriorNaesinGrade("");
                  }}
                />
              </div>
            );
          })}
        </div>

        {allNone && (
          <div className="mt-10">
            <div className="rounded-xl bg-surface-03 px-5 py-4">
              <p className="text-[0.875rem] font-semibold text-accent">
                {priorCopy.bannerTitle}
              </p>
              <p className="mt-1 text-[0.875rem] leading-normal text-ink-sub">
                {priorCopy.bannerBody}
              </p>
            </div>
            <div className="mt-6">
              <GradeNumberField
                label={priorCopy.label}
                value={priorNaesinGrade}
                suffix="등급"
                width="16rem"
                onChange={(event) => setPriorNaesinGrade(event.target.value)}
              />
            </div>
          </div>
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
