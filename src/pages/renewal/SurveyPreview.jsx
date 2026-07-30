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

/**
 * 시안상 hug 폭 칩 wrap 으로 배치되는 문항.
 * 데이터의 `type` 은 `radio-row` / `checkbox-row` 지만 시안(1889:10745 · 10784 · 10829 · 9866)은
 * 전폭 행이 아니라 내용 기준 hug 칩이다. `renewalSurveyQuestions.js` 는 이번 범위 밖이라
 * 데이터 대신 렌더 계층에서 시안을 따른다.
 * → 후속 태스크에서 type 을 `radio-chip` / `checkbox-chip` 으로 분리하면 이 상수는 제거한다.
 */
const CHIP_LAYOUT_QUESTION_IDS = new Set(['q13', 'q14', 'q16', 'q17', 'q18']);

function isAnswered(type, value) {
  if (value == null) return false;
  if (type === 'checkbox-row') return Array.isArray(value) && value.length > 0;
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
  const chipLayout = CHIP_LAYOUT_QUESTION_IDS.has(question.id);

  switch (question.type) {
    case 'radio-row':
    case 'radio-chip':
      return (
        <OptionGroup
          variant={question.type === 'radio-chip' || chipLayout ? 'chip' : 'row'}
          options={question.options}
          value={value ?? null}
          onChange={onChange}
        />
      );
    case 'checkbox-row':
      return (
        <OptionGroup
          variant={chipLayout ? 'chip' : 'row'}
          multiple
          maxSelect={question.maxSelect}
          exclusiveValues={question.exclusiveValues}
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
          multiline={Boolean(question.multiline)}
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
        multiline={Boolean(question.multiline)}
        value={value ?? ''}
        onChange={onChange}
      />
    );
  }

  return (
    <div className="flex w-full flex-col items-start gap-3">
      <p className="text-base font-medium leading-5 text-[#525252]">{question.title}</p>
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

      {/* 상단 패딩은 <main> 의 헤더 오프셋이 단독으로 소유한다 → section 은 하단만. */}
      <section className="w-full pb-16 sm:pb-20 lg:pb-[7.5rem]">
        <div className="mx-auto w-full max-w-content px-5 sm:px-8">
          {/* 컬럼 스택 gap 60 — 타이틀 블록 / 카드 스택 / 하단 배너가 형제로 이 갭을 공유한다. */}
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

            {/* 카드 스택 gap 40 */}
            <div className="flex w-full flex-col items-start gap-10">
              {mainQuestions.map((question) => {
                const value = answers[question.id];
                const children = embeddedByParent[question.id] || [];
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
                  >
                    <AnswerField
                      question={question}
                      value={value}
                      onChange={(nextValue) => handleAnswer(question.id, nextValue)}
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
                            onChange={(nextValue) => handleAnswer(embedded.id, nextValue)}
                          />
                        ))}
                      </div>
                    )}
                  </QuestionCard>
                );
              })}
            </div>

            <SurveyProgress remaining={remaining} disabled={!allAnswered} />
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
