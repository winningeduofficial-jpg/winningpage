import QuestionCard from './QuestionCard';
import AnswerField from './AnswerField';
import EmbeddedField from './EmbeddedField';
import { surveyEmbeddedByParent } from '../../../lib/renewalSurvey';

/**
 * 카드 스택 gap 40. 스텝 페이지는 getStepQuestions(step) 결과를,
 * preview 는 19문항 전부를 넘긴다 — 렌더 코드는 한 벌뿐이다.
 *
 * `highlightedId`는 하단 CTA의 "미완료" 클릭으로 스크롤된 첫 미응답 문항 id
 * (useUnansweredNavigation) — 해당 카드에만 일시 하이라이트를 켠다.
 */
export default function QuestionCardList({ questions, answers, onAnswer, highlightedId }) {
  return (
    <div className="flex w-full flex-col items-start gap-10">
      {questions.map((question) => {
        const value = answers[question.id];
        const children = surveyEmbeddedByParent[question.id] || [];
        const selectedCount = Array.isArray(value) ? value.length : 0;

        return (
          <QuestionCard
            key={question.id}
            number={question.number}
            category={question.category}
            title={question.title}
            helper={question.helper}
            maxSelect={question.maxSelect}
            selectedCount={selectedCount}
            questionId={question.id}
            highlighted={question.id === highlightedId}
          >
            <AnswerField
              question={question}
              value={value}
              onChange={(nextValue) => onAnswer(question.id, nextValue)}
            />

            {/* 1차 스펙은 무분기 — 하위 블록은 부모 응답 여부와 무관하게 항상 노출한다.
                시안 1889:8893 선택지 컨테이너와 같은 컬럼 · gap 12 · 구분선 없음. */}
            {children.length > 0 && (
              <div className="flex w-full flex-col items-start gap-3">
                {children.map((embedded) => (
                  <EmbeddedField
                    key={embedded.id}
                    question={embedded}
                    value={answers[embedded.id]}
                    onChange={(nextValue) => onAnswer(embedded.id, nextValue)}
                  />
                ))}
              </div>
            )}
          </QuestionCard>
        );
      })}
    </div>
  );
}
