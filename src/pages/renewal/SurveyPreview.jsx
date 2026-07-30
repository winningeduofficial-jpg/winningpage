import { useOutletContext } from 'react-router-dom';
import QuestionCardList from '../../components/renewal/survey/QuestionCardList';
import SurveyProgress from '../../components/renewal/survey/SurveyProgress';
import { isAnswered, surveyMainQuestions } from '../../lib/renewalSurvey';

/**
 * 19문항 롱스크롤 QA 화면. /free-diagnosis/survey/preview 로 강등 보존한다(SPEC B12).
 * 셸(SurveyStepShell)의 자식 라우트이므로 <main>/타이틀 블록은 셸이 소유하고
 * 답변 상태도 스텝 페이지와 공유한다 — preview↔스텝 왕복 시 답변이 유지된다.
 */
export default function SurveyPreview() {
  const { answers, setAnswer } = useOutletContext();

  const answeredCount = surveyMainQuestions.filter((question) =>
    isAnswered(question.type, answers[question.id])
  ).length;
  const remaining = Math.max(surveyMainQuestions.length - answeredCount, 0);

  return (
    <>
      <QuestionCardList
        questions={surveyMainQuestions}
        answers={answers}
        onAnswer={setAnswer}
      />
      <SurveyProgress remaining={remaining} disabled={remaining > 0} />
    </>
  );
}
