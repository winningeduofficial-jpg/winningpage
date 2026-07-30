import OptionGroup from './OptionGroup';
import ConditionalTextInput from './ConditionalTextInput';
import LikertMatrix from './LikertMatrix';
import GradeInputGrid from './GradeInputGrid';
import CascadingSelect from './CascadingSelect';

/**
 * 시안상 hug 폭 칩 wrap 으로 배치되는 문항.
 * 데이터의 `type` 은 `radio-row` / `checkbox-row` 지만 시안(1889:10745 · 10784 · 10829 · 9866)은
 * 전폭 행이 아니라 내용 기준 hug 칩이다. `renewalSurveyQuestions.js` 는 이번 범위 밖이라
 * 데이터 대신 렌더 계층에서 시안을 따른다.
 * → 후속 태스크에서 type 을 `radio-chip` / `checkbox-chip` 으로 분리하면 이 상수는 제거한다.
 */
const CHIP_LAYOUT_QUESTION_IDS = new Set(['q13', 'q14', 'q16', 'q17', 'q18']);

export default function AnswerField({ question, value, onChange }) {
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
