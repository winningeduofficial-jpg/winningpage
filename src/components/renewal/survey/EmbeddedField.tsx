import AnswerField from "./AnswerField";
import ConditionalTextInput from "./ConditionalTextInput";

type EmbeddedQuestion = {
  type?: string;
  title?: string;
  multiline?: boolean;
  extra?: { placeholder?: string };
};

type EmbeddedFieldProps = {
  question: EmbeddedQuestion;
  value?: unknown;
  onChange?: (value: unknown) => void;
};

export default function EmbeddedField({
  question,
  value,
  onChange,
}: EmbeddedFieldProps) {
  // 조건부 중첩 문항: 별도 번호 카드 없이 부모 QuestionCard 안에서 라벨 + 입력만 노출.
  if (question.type === "text") {
    return (
      <ConditionalTextInput
        label={question.title}
        placeholder={question.extra?.placeholder}
        multiline={Boolean(question.multiline)}
        value={typeof value === "string" ? value : ""}
        onChange={onChange}
      />
    );
  }

  return (
    <div className="flex w-full flex-col items-start gap-3">
      <p className="text-base font-medium leading-5 text-[#525252]">
        {question.title}
      </p>
      <AnswerField
        question={question}
        value={value}
        onChange={onChange}
        cascadeLevels={undefined}
        constraint={undefined}
      />
    </div>
  );
}
