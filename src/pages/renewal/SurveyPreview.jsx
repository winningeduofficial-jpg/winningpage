import { useNavigate, useOutletContext } from 'react-router-dom';
import QuestionCardList from '../../components/renewal/survey/QuestionCardList';
import SurveyProgress from '../../components/renewal/survey/SurveyProgress';
import { useUnansweredNavigation } from '../../hooks/useUnansweredNavigation';
import { SURVEY_REPORT_PATH, isAnswered, surveyMainQuestions } from '../../lib/renewalSurvey';

/**
 * 19문항 롱스크롤 QA 화면. /free-diagnosis/survey/preview 로 강등 보존한다(SPEC B12).
 * 셸(SurveyStepShell)의 자식 라우트이므로 <main>/타이틀 블록은 셸이 소유하고
 * 답변 상태도 스텝 페이지와 공유한다 — preview↔스텝 왕복 시 답변이 유지된다.
 *
 * 하단 CTA는 스텝 페이지와 같은 사양을 따른다(19문항 전체 기준) — 미완료는
 * "모든 항목에 응답해주세요" + 첫 미응답으로 스크롤/하이라이트, 완료는 리포트로 이동.
 */
export default function SurveyPreview() {
  const { answers, setAnswer } = useOutletContext();
  const navigate = useNavigate();

  // 선택입력(optional) 문항은 잔여 카운트에서 제외 — 스텝 페이지의 완료 판정과 같은 기준이다.
  const requiredQuestions = surveyMainQuestions.filter((question) => question.optional !== true);
  const answeredCount = requiredQuestions.filter((question) =>
    isAnswered(question.type, answers[question.id])
  ).length;
  const complete = answeredCount === requiredQuestions.length;

  const { highlightedId, announcement, scrollToFirstUnanswered } = useUnansweredNavigation(
    requiredQuestions,
    answers
  );

  return (
    <>
      <QuestionCardList
        questions={surveyMainQuestions}
        answers={answers}
        onAnswer={setAnswer}
        highlightedId={highlightedId}
      />
      <SurveyProgress
        complete={complete}
        label={complete ? '진단 결과 보기' : '모든 항목에 응답해주세요'}
        onClick={complete ? () => navigate(SURVEY_REPORT_PATH) : scrollToFirstUnanswered}
      />
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </>
  );
}
