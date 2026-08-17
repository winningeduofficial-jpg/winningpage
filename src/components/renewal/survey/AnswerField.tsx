import CascadingSelect, { type CascadeLevel } from "./CascadingSelect";
import ConditionalTextInput from "./ConditionalTextInput";
import GradeInputGrid, {
  type GradeGroup,
  type GradeInputRule,
} from "./GradeInputGrid";
import LikertMatrix from "./LikertMatrix";
import OptionGroup from "./OptionGroup";

type SurveyQuestion = {
  id: string;
  type?: string;
  options?: Array<string | { value?: string; label: string }>;
  maxSelect?: number;
  exclusiveValues?: string[];
  multiline?: boolean;
  extra?: {
    statements?: Array<
      string | { key?: string; id?: string; text?: string; label?: string }
    >;
    scale?: string[];
    groups?: GradeGroup[];
    levels?: CascadeLevel[];
    placeholder?: string;
  };
  [key: string]: unknown;
};

type AnswerFieldProps = {
  question: SurveyQuestion;
  value?: unknown;
  // exactOptionalPropertyTypes 대응 — 호출부(QuestionCardList)가 옵셔널 필드를 그대로 넘긴다.
  constraint?: GradeInputRule | undefined;
  highlighted?: boolean;
  cascadeLevels?: CascadeLevel[] | undefined;
  onChange?: (value: unknown) => void;
};

/**
 * 시안상 hug 폭 칩 wrap 으로 배치되는 문항.
 * 데이터의 `type` 은 `radio-row` / `checkbox-row` 지만 시안(1889:10745 · 10784 · 10829 · 9866)은
 * 전폭 행이 아니라 내용 기준 hug 칩이다. 데이터 대신 렌더 계층에서 시안을 따른다.
 * → 명세 §10 T18 에서 type 을 `radio-chip` / `checkbox-chip` 으로 분리하면 이 상수는 제거한다.
 */
const CHIP_LAYOUT_QUESTION_IDS = new Set(["q13", "q14", "q16", "q17", "q18"]);

// `constraint` 는 형제 문항 응답에서 파생된 입력 규격(§3.4)이다. 현재는 grade-grid 만 소비하지만
// 다른 타입으로 확장될 수 있어 시그니처에 단일 prop 으로 열어 둔다(QuestionCardList 가 유일한 생산자).
// `highlighted` 는 QuestionCard 의 카드 단위 하이라이트와 동일 신호다(Q-10) — likert 만 소비해
// 문장 단위 미응답 표시를 켠다.
// `cascadeLevels` 는 cascade 타입(q15) 전용이다(B-1 확정) — SurveyStepShell 의 useAdmissionCascade
// 가 채운 options/loading/error 를 담은 level 배열이며, QuestionCardList 가 유일한 생산자다.
// 문항 데이터의 `question.extra.levels`(라벨/플레이스홀더만 있는 정적 배열)를 안전망으로 남긴다 —
// 훅이 아직 값을 못 낸 첫 렌더나 향후 다른 렌더 경로에서 undefined 로 넘어와도 빈 배열 대신
// 라벨은 보이는 상태로 떨어진다.
export default function AnswerField({
  question,
  value,
  constraint,
  highlighted = false,
  cascadeLevels,
  onChange,
}: AnswerFieldProps) {
  const chipLayout = CHIP_LAYOUT_QUESTION_IDS.has(question.id);

  // exactOptionalPropertyTypes 대응 — 하위 컴포넌트(대상 파일 범위 밖 포함)를 건드리지 않고,
  // 값이 undefined인 optional prop은 조건부 스프레드로 키 자체를 생략한다(동작 동일).
  switch (question.type) {
    case "radio-row":
    case "radio-chip":
      return (
        <OptionGroup
          variant={
            question.type === "radio-chip" || chipLayout ? "chip" : "row"
          }
          {...(question.options !== undefined
            ? { options: question.options }
            : {})}
          value={(value as string | null) ?? null}
          {...(onChange !== undefined ? { onChange } : {})}
        />
      );
    case "checkbox-row":
      return (
        <OptionGroup
          variant={chipLayout ? "chip" : "row"}
          multiple
          {...(question.maxSelect !== undefined
            ? { maxSelect: question.maxSelect }
            : {})}
          {...(question.exclusiveValues !== undefined
            ? { exclusiveValues: question.exclusiveValues }
            : {})}
          {...(question.options !== undefined
            ? { options: question.options }
            : {})}
          value={(value as string[]) ?? []}
          {...(onChange !== undefined ? { onChange } : {})}
        />
      );
    case "likert":
      return (
        <LikertMatrix
          {...(question.extra?.statements !== undefined
            ? { statements: question.extra.statements }
            : {})}
          {...(question.extra?.scale !== undefined
            ? { scale: question.extra.scale }
            : {})}
          value={(value as Record<string, number>) ?? {}}
          highlighted={highlighted}
          {...(onChange !== undefined ? { onChange } : {})}
        />
      );
    case "grade-grid":
      return (
        <GradeInputGrid
          {...(question.extra?.groups !== undefined
            ? { groups: question.extra.groups }
            : {})}
          {...(constraint !== undefined ? { constraint } : {})}
          value={(value as Record<string, string>) ?? {}}
          {...(onChange !== undefined ? { onChange } : {})}
        />
      );
    case "cascade": {
      // 별도 변수로 고정해야 아래 조건부 스프레드에서 undefined가 좁혀진다(반복 평가 시 좁혀지지 않음).
      const resolvedCascadeLevels = cascadeLevels ?? question.extra?.levels;
      return (
        <CascadingSelect
          {...(resolvedCascadeLevels !== undefined
            ? { levels: resolvedCascadeLevels }
            : {})}
          value={(value as Record<string, string>) ?? {}}
          {...(onChange !== undefined ? { onChange } : {})}
        />
      );
    }
    case "text":
      return (
        <ConditionalTextInput
          {...(question.extra?.placeholder !== undefined
            ? { placeholder: question.extra.placeholder }
            : {})}
          multiline={Boolean(question.multiline)}
          value={(value as string) ?? ""}
          {...(onChange !== undefined ? { onChange } : {})}
        />
      );
    default:
      return null;
  }
}
