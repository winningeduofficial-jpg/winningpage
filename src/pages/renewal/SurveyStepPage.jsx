import { Navigate, useOutletContext, useParams } from 'react-router-dom';
import QuestionCardList from '../../components/renewal/survey/QuestionCardList';
import SurveyProgress from '../../components/renewal/survey/SurveyProgress';
import {
  SURVEY_FIRST_STEP_PATH,
  SURVEY_TOTAL_STEPS,
  getRemainingAfterStep,
  getStepQuestions,
  parseStepParam
} from '../../lib/renewalSurvey';

/**
 * 설문 한 스텝. 셸(SurveyStepShell)의 자식 라우트이므로 <main>/타이틀 블록은 셸이 소유하고,
 * 여기서는 fragment 로 **카드 스택 + 하단 배너 2형제**만 반환한다.
 * 래퍼 div 를 추가하면 셸의 gap-[3.75rem] 리듬이 무너진다.
 */
export default function SurveyStepPage() {
  const { step: rawStep } = useParams(); // 훅은 early return 앞에 전부 호출
  const { answers, setAnswer } = useOutletContext();

  const step = parseStepParam(rawStep);
  if (step === null) return <Navigate to={SURVEY_FIRST_STEP_PATH} replace />;

  const isLastStep = step === SURVEY_TOTAL_STEPS;

  return (
    <>
      <QuestionCardList
        questions={getStepQuestions(step)}
        answers={answers}
        onAnswer={setAnswer}
      />
      {isLastStep ? (
        // 제출 CTA — 활성 마크업까지만. onClick 을 붙이지 않는다(결과 리포트 미정).
        <SurveyProgress disabled={false} />
      ) : (
        <SurveyProgress remaining={getRemainingAfterStep(step)} disabled />
      )}
    </>
  );
}
