import { type ComponentProps, useMemo } from "react";
import { useNavigate, useOutletContext } from "react-router";
import type { CascadeLevel } from "@/components/renewal/survey/CascadingSelect";
import QuestionCardList from "@/components/renewal/survey/QuestionCardList";
import SurveyProgress from "@/components/renewal/survey/SurveyProgress";
import { useUnansweredNavigation } from "@/hooks/useUnansweredNavigation";
// sql/72(2026-08-13) — 문항 문구 어드민 오버라이드. SurveyStepPage 와 같은 계약.
import { applySurveyCopyOverrides } from "@/lib/diagnosisSurveyCopyOverrides";
import {
  isQuestionAnswered,
  SURVEY_REPORT_PATH,
  surveyMainQuestions,
} from "@/lib/renewalSurvey";

/**
 * 17문항 롱스크롤 QA 화면. /learning-diagnosis/survey/preview 로 강등 보존한다(SPEC B12).
 * 셸(SurveyStepShell)의 자식 라우트이므로 <main>/타이틀 블록은 셸이 소유하고
 * 답변 상태도 스텝 페이지와 공유한다 — preview↔스텝 왕복 시 답변이 유지된다.
 *
 * 하단 CTA는 스텝 페이지와 같은 사양을 따른다(17문항 전체 기준) — 미완료는
 * "모든 항목에 응답해주세요" + 첫 미응답으로 스크롤/하이라이트, 완료는 채점 후 리포트로 이동.
 */
type SurveyOutletContext = {
  answers: Record<string, unknown>;
  setAnswer: (questionId: string, value: unknown) => void;
  submitDiagnosis: () => Promise<unknown>;
  cascadeLevels?: CascadeLevel[];
  // applySurveyCopyOverrides가 요구하는 실제 형태로 좁힌다(런타임 값은 항상 문자열 오버라이드).
  surveyCopyOverrides?: Map<string, string> | null;
};

export default function SurveyPreview() {
  const {
    answers,
    setAnswer,
    submitDiagnosis,
    cascadeLevels,
    surveyCopyOverrides,
  } = useOutletContext<SurveyOutletContext>();
  const navigate = useNavigate();
  const previewQuestions = useMemo(
    () => applySurveyCopyOverrides(surveyMainQuestions, surveyCopyOverrides),
    [surveyCopyOverrides],
  );

  // 선택입력(optional) 문항은 잔여 카운트에서 제외 — 스텝 페이지의 완료 판정과 같은 기준이다.
  const requiredQuestions = surveyMainQuestions.filter(
    (question) => question.optional !== true,
  );
  const answeredCount = requiredQuestions.filter((question) =>
    isQuestionAnswered(question, answers[question.id]),
  ).length;
  const complete = answeredCount === requiredQuestions.length;

  // 스텝 페이지 마지막 CTA 와 같은 제출 경로를 탄다(§7.4.2 — 채점 진입점은 이 두 곳뿐이다).
  // submitDiagnosis 는 Q-01(로그인 이름 조회)때문에 비동기다.
  const goToReport = async () => {
    const diagnosisInput = await submitDiagnosis();
    // null = 게이팅이 막았다 — 셸이 이미 안내 후 /pricing으로 보냈다(SurveyStepPage와 동일 계약).
    if (!diagnosisInput) return;
    navigate(SURVEY_REPORT_PATH, { state: { diagnosisInput } });
  };

  const { highlightedId, announcement, scrollToFirstUnanswered } =
    useUnansweredNavigation(requiredQuestions, answers);

  return (
    <>
      {/* lib/renewalSurvey.ts의 SurveyQuestion과 QuestionCardList 지역 SurveyQuestion은
          구조는 같지만 별개 타입 선언이라 서로 무관 판정된다 — 범위 밖 파일을 건드리지 않고
          QuestionCardList 실제 prop 타입으로 단언한다(FreeDiagnosisReport.tsx와 동일 관행). */}
      <QuestionCardList
        questions={
          previewQuestions as ComponentProps<
            typeof QuestionCardList
          >["questions"]
        }
        answers={answers}
        onAnswer={setAnswer}
        highlightedId={highlightedId}
        cascadeLevels={cascadeLevels}
      />
      <SurveyProgress
        complete={complete}
        label={complete ? "진단 결과 보기" : "모든 항목에 응답해주세요"}
        onClick={complete ? goToReport : scrollToFirstUnanswered}
      />
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </>
  );
}
