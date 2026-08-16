import { type ComponentProps, useEffect, useMemo } from "react";
import {
  Navigate,
  useNavigate,
  useOutletContext,
  useParams,
} from "react-router";
import type { CascadeLevel } from "../../components/renewal/survey/CascadingSelect";
import QuestionCardList from "../../components/renewal/survey/QuestionCardList";
import SurveyProgress from "../../components/renewal/survey/SurveyProgress";
import { useUnansweredNavigation } from "../../hooks/useUnansweredNavigation";
// sql/72(2026-08-13) — 문항 문구 어드민 오버라이드. 셸이 fetch 해 outlet context 로 내려준 값을
// 화면에 실제 보여줄 questions 배열에만 입힌다(요건 판정용 requiredQuestions 는 구조만 보므로 무관).
import { applySurveyCopyOverrides } from "../../lib/diagnosisSurveyCopyOverrides";
import {
  getRemainingAfterStep,
  getStepPath,
  getStepQuestions,
  getStepRequiredQuestions,
  isStepComplete,
  parseStepParam,
  SURVEY_FIRST_STEP_PATH,
  SURVEY_REPORT_PATH,
  SURVEY_TOTAL_STEPS,
} from "../../lib/renewalSurvey";

/**
 * 설문 한 스텝. 셸(SurveyStepShell)의 자식 라우트이므로 <main>/타이틀 블록은 셸이 소유하고,
 * 여기서는 fragment 로 **카드 스택 + 하단 배너 2형제**만 반환한다.
 * 래퍼 div 를 추가하면 셸의 gap-[3.75rem] 리듬이 무너진다.
 * (하단 배너는 "이전" 링크와 한 블록으로 묶여 있지만 형제 수는 그대로 2개다.)
 *
 * 하단 CTA(사용자 확정 사양, 2026-08-03):
 * - 미완료: "모든 항목에 응답해주세요" — 클릭해도 다음 스텝으로 넘어가지 않고
 *   첫 미응답 문항으로 스크롤 + 하이라이트한다(useUnansweredNavigation).
 * - 완료: "N개 문항이 남았어요"(N = getRemainingAfterStep, 이 스텝 이후 남는 전체 문항 수) —
 *   마지막 스텝은 "진단 결과 보기". 클릭하면 다음 스텝(또는 리포트)으로 이동한다.
 */
type SurveyOutletContext = {
  answers: Record<string, unknown>;
  setAnswer: (questionId: string, value: unknown) => void;
  submitDiagnosis: () => Promise<unknown>;
  cascadeLevels?: CascadeLevel[];
  // applySurveyCopyOverrides가 요구하는 실제 형태로 좁힌다(런타임 값은 항상 문자열 오버라이드).
  surveyCopyOverrides?: Map<string, string> | null;
};

export default function SurveyStepPage() {
  const { step: rawStep } = useParams(); // 훅은 early return 앞에 전부 호출
  const {
    answers,
    setAnswer,
    submitDiagnosis,
    cascadeLevels,
    surveyCopyOverrides,
  } = useOutletContext<SurveyOutletContext>();
  const navigate = useNavigate();

  const step = parseStepParam(rawStep);
  const safeStep = step ?? 1;
  const requiredQuestions = useMemo(
    () => getStepRequiredQuestions(safeStep),
    [safeStep],
  );
  const stepQuestions = useMemo(
    () =>
      applySurveyCopyOverrides(getStepQuestions(safeStep), surveyCopyOverrides),
    [safeStep, surveyCopyOverrides],
  );
  const { highlightedId, announcement, scrollToFirstUnanswered } =
    useUnansweredNavigation(requiredQuestions, answers);

  // 스텝 전환은 같은 스크롤 컨테이너 안에서 일어난다 — 긴 카드 스택 하단에서 이동하면
  // 다음 스텝도 하단부터 보이므로 최상단으로 되돌린다.
  useEffect(() => {
    if (step !== null) window.scrollTo({ top: 0, behavior: "auto" });
  }, [step]);

  if (step === null) return <Navigate to={SURVEY_FIRST_STEP_PATH} replace />;

  const isLastStep = step === SURVEY_TOTAL_STEPS;
  // 화면에 보이는 필수 문항(선택입력·중첩 문항 제외)을 전부 답해야 다음으로 넘어간다.
  const stepComplete = isStepComplete(step, answers);

  const label = (() => {
    if (!stepComplete) return "모든 항목에 응답해주세요";
    if (isLastStep) return "진단 결과 보기";
    return `${getRemainingAfterStep(step)}개 문항이 남았어요`;
  })();

  // 마지막 스텝의 CTA 가 채점 파이프라인의 진입점이다(§7.4.2). 정규화·저장은 answers 를 소유한
  // 셸(submitDiagnosis)이 하고, 여기서는 그 결과를 라우터 state 로도 넘긴다 —
  // state 만이면 새로고침에서, sessionStorage 만이면 프라이빗 모드에서 각각 끊긴다.
  // submitDiagnosis 는 Q-01(로그인 이름 조회)때문에 비동기다 — 클릭→이동 사이에 조회 1회가 낀다.
  const goToReport = async () => {
    const diagnosisInput = await submitDiagnosis();
    navigate(SURVEY_REPORT_PATH, { state: { diagnosisInput } });
  };

  const handleClick = (() => {
    if (!stepComplete) return scrollToFirstUnanswered;
    if (isLastStep) return goToReport;
    return () => navigate(getStepPath(step + 1));
  })();

  return (
    <>
      {/* lib/renewalSurvey.ts의 SurveyQuestion과 QuestionCardList 지역 SurveyQuestion은
          구조는 같지만 별개 타입 선언이라 이름은 같아도 서로 무관 판정된다 — 범위 밖 두 파일을
          건드리지 않고 QuestionCardList 실제 prop 타입으로 단언한다(FreeDiagnosisReport.tsx와
          동일 관행: ComponentProps<typeof X>["prop"]). */}
      <QuestionCardList
        questions={
          stepQuestions as ComponentProps<typeof QuestionCardList>["questions"]
        }
        answers={answers}
        onAnswer={setAnswer}
        highlightedId={highlightedId}
        cascadeLevels={cascadeLevels}
      />

      <div className="flex w-full flex-col items-start gap-4">
        <SurveyProgress
          complete={stepComplete}
          label={label}
          onClick={handleClick}
        />
        {/* role="status" 배너를 없앤 만큼, 미완료 클릭 시 이동 상황을 스크린리더에 알린다. */}
        <p aria-live="polite" className="sr-only">
          {announcement}
        </p>

        {step > 1 && (
          <button
            type="button"
            onClick={() => navigate(getStepPath(step - 1))}
            className="rounded text-base font-medium leading-5 text-[#808080] underline underline-offset-4 transition-colors duration-150 hover:text-[#525252] focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            이전 단계로
          </button>
        )}
      </div>
    </>
  );
}
