import AnswerField from "./AnswerField";
import ConditionalTextInput from "./ConditionalTextInput";

type EmbeddedQuestion = {
  id: string;
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
      // exactOptionalPropertyTypes 대응 — undefined면 키 자체를 생략(ConditionalTextInput 미수정 범위).
      <ConditionalTextInput
        {...(question.title !== undefined ? { label: question.title } : {})}
        {...(question.extra?.placeholder !== undefined
          ? { placeholder: question.extra.placeholder }
          : {})}
        multiline={Boolean(question.multiline)}
        value={typeof value === "string" ? value : ""}
        {...(onChange !== undefined ? { onChange } : {})}
      />
    );
  }

  return (
    <div className="flex w-full flex-col items-start gap-3">
      <p className="text-base font-medium leading-5 text-ink">
        {question.title}
      </p>
      {/* cascadeLevels/constraint는 이 문항 타입에서 쓰이지 않아 애초에 생략(undefined 전달 대신). */}
      <AnswerField
        question={question}
        value={value}
        {...(onChange !== undefined ? { onChange } : {})}
      />
    </div>
  );
}
