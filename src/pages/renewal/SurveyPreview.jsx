import { useMemo, useState } from 'react';
import Header from '../../components/Header';
import SiteFooter from '../../components/SiteFooter';
import QuestionCard from '../../components/renewal/survey/QuestionCard';
import OptionGroup from '../../components/renewal/survey/OptionGroup';
import ConditionalTextInput from '../../components/renewal/survey/ConditionalTextInput';
import SurveyProgress from '../../components/renewal/survey/SurveyProgress';
import LikertMatrix from '../../components/renewal/survey/LikertMatrix';
import GradeInputGrid from '../../components/renewal/survey/GradeInputGrid';
import CascadingSelect from '../../components/renewal/survey/CascadingSelect';
import { renewalSurveyQuestions } from '../../data/renewalSurveyQuestions';

function isAnswered(type, value) {
  if (value == null) return false;
  if (type === 'checkbox-row' || type === 'chip-multi')
    return Array.isArray(value) && value.length > 0;
  if (type === 'likert') return typeof value === 'object' && Object.keys(value).length > 0;
  if (type === 'grade-grid') {
    return (
      typeof value === 'object' &&
      Object.values(value).some((field) => field !== '' && field != null)
    );
  }
  if (type === 'cascade') {
    return typeof value === 'object' && Boolean(value.university);
  }
  return typeof value === 'string' && value.trim().length > 0;
}

function AnswerField({ question, value, onChange }) {
  switch (question.type) {
    case 'radio-row':
      return (
        <OptionGroup
          variant="row"
          options={question.options}
          value={value ?? null}
          onChange={onChange}
        />
      );
    case 'radio-chip':
      return (
        <OptionGroup
          variant="chip"
          options={question.options}
          value={value ?? null}
          onChange={onChange}
        />
      );
    case 'checkbox-row':
      return (
        <OptionGroup
          variant="row"
          multiple
          max={question.max}
          options={question.options}
          value={value ?? []}
          onChange={onChange}
        />
      );
    case 'chip-multi':
      return (
        <OptionGroup
          variant="chip"
          multiple
          max={question.max}
          options={question.options}
          value={value ?? []}
          onChange={onChange}
        />
      );
    case 'likert':
      return (
        <LikertMatrix
          statements={question.extra?.statements}
          scale={question.extra?.scale}
          value={value ?? {}}
          onChange={onChange}
        />
      );
    case 'grade-grid':
      return (
        <GradeInputGrid groups={question.extra?.groups} value={value ?? {}} onChange={onChange} />
      );
    case 'cascade':
      return (
        <CascadingSelect levels={question.extra?.levels} value={value ?? {}} onChange={onChange} />
      );
    case 'text':
      return (
        <ConditionalTextInput
          placeholder={question.extra?.placeholder}
          value={value ?? ''}
          onChange={onChange}
        />
      );
    default:
      return null;
  }
}

function EmbeddedField({ question, value, onChange }) {
  // 조건부 중첩 문항: 별도 번호 카드 없이 부모 QuestionCard 안에서 라벨 + 입력만 노출.
  if (question.type === 'text') {
    return (
      <ConditionalTextInput
        label={question.title}
        placeholder={question.extra?.placeholder}
        value={value ?? ''}
        onChange={onChange}
      />
    );
  }

  return (
    <div className="flex w-full flex-col items-start gap-3">
      <p className="text-base font-medium text-[#525252]">{question.title}</p>
      <AnswerField question={question} value={value} onChange={onChange} />
    </div>
  );
}

export default function SurveyPreview() {
  const [answers, setAnswers] = useState({});

  const mainQuestions = useMemo(
    () =>
      renewalSurveyQuestions
        .filter((question) => question.number != null)
        .sort((a, b) => a.number - b.number),
    []
  );

  const embeddedByParent = useMemo(() => {
    const map = {};
    renewalSurveyQuestions
      .filter((question) => question.extra?.embeddedIn)
      .forEach((question) => {
        const parentId = question.extra.embeddedIn;
        if (!map[parentId]) map[parentId] = [];
        map[parentId].push(question);
      });
    return map;
  }, []);

  function handleAnswer(questionId, nextValue) {
    setAnswers((prev) => ({ ...prev, [questionId]: nextValue }));
  }

  const answeredCount = mainQuestions.filter((question) =>
    isAnswered(question.type, answers[question.id])
  ).length;
  const remaining = Math.max(mainQuestions.length - answeredCount, 0);
  const allAnswered = answeredCount >= mainQuestions.length;

  return (
    <main className="min-h-screen w-full bg-[#FBFAFA] pt-[calc(7.5rem-var(--wn-header-h))]">
      <Header />

      <section className="w-full py-16 sm:py-20 lg:py-[7.5rem]">
        <div className="mx-auto w-full max-w-content px-5 sm:px-8">
          <div className="mx-auto flex w-full max-w-content flex-col items-start gap-[3.75rem]">
            <div className="flex w-full max-w-[37.25rem] flex-col items-start gap-5 text-[#525252]">
              <h1 className="break-keep text-[1.75rem] font-bold leading-[1.4] tracking-[-0.02em] sm:text-[2.25rem] lg:text-[2.75rem]">
                무료 진단으로
                <br />
                나에게 딱 맞는 서비스를 추천받아요
              </h1>
              <p className="break-keep text-lg font-normal leading-[1.3] sm:text-2xl">
                19개 문항을 답하면 가장 먼저 필요한 서비스를 추천해 드려요
              </p>
            </div>

            <div className="flex w-full flex-col items-start gap-10">
              {mainQuestions.map((question) => {
                const value = answers[question.id];
                const children = embeddedByParent[question.id] || [];
                const parentAnswered = isAnswered(question.type, value);

                return (
                  <QuestionCard
                    key={question.id}
                    number={question.number}
                    category={question.category}
                    title={question.title}
                    helper={question.helper}
                  >
                    <AnswerField
                      question={question}
                      value={value}
                      onChange={(nextValue) => handleAnswer(question.id, nextValue)}
                    />

                    {parentAnswered && children.length > 0 && (
                      <div className="flex w-full flex-col items-start gap-5 border-t border-[#EDEDED] pt-5">
                        {children.map((embedded) => (
                          <EmbeddedField
                            key={embedded.id}
                            question={embedded}
                            value={answers[embedded.id]}
                            onChange={(nextValue) => handleAnswer(embedded.id, nextValue)}
                          />
                        ))}
                      </div>
                    )}
                  </QuestionCard>
                );
              })}

              <SurveyProgress remaining={remaining} disabled={!allAnswered} />
            </div>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
