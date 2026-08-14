import type { ChangeEvent } from "react";
import { useId, useState } from "react";
import AppModal from "../AppModal";
import ModalField from "../ModalField";

// 내신 성적 추가 모달(#36, 530×537 = 33.125rem×33.5625rem) — #35 내신 표의 `+ 회차 추가` 트리거.
// `AddMockExamGradeModal`(part-08 #22, 모의고사 표 전용)과 동일한 셸 패턴(회차/응시일 2열 +
// 과목별 입력 리스트)을 따르되 필드 구성이 다르다: 회차 셀렉트 대신 `학기` 텍스트, 응시일 대신
// `입력일`, 백분위 대신 등급(1~9, 소수 1자리).
const SUBJECTS = [
  { key: "korean", label: "국어" },
  { key: "math", label: "수학" },
  { key: "english", label: "영어" },
  { key: "science", label: "탐구" },
];

function todayDateValue() {
  return new Date().toISOString().slice(0, 10);
}

// 등급 입력 행 — ModalField의 라벨-위/컨트롤-아래 레이아웃과 달리 시안(#36)은 "국어 [입력] 등급"
// 한 줄 구성이라 AddMockExamGradeModal의 PercentileField와 같은 이유로 로컬 서브컴포넌트로 둔다.
type GradeFieldProps = {
  label: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
};

function GradeField({ label, value, onChange }: GradeFieldProps) {
  const fieldId = useId();
  return (
    <div className="flex items-center gap-3">
      <label
        htmlFor={fieldId}
        className="w-[3.5rem] shrink-0 text-[0.875rem] font-semibold leading-[1.4] text-ink-strong"
      >
        {label}
      </label>
      <div className="relative flex-1">
        <input
          id={fieldId}
          type="number"
          min={1}
          max={9}
          step={0.1}
          value={value}
          onChange={onChange}
          placeholder="3.2"
          className="h-[2.4375rem] w-full rounded-lg border border-[#E3E3E3] bg-white px-[0.875rem] pr-14 text-right text-[0.875rem] text-ink placeholder:text-ink-sub focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <span className="pointer-events-none absolute right-[0.875rem] top-1/2 -translate-y-1/2 text-[0.8125rem] text-ink-sub">
          등급
        </span>
      </div>
    </div>
  );
}

type NaesinEntry = {
  term: string;
  enteredAt: string;
  subjects: Record<string, string>;
};

type AddNaesinGradeModalProps = {
  open: boolean;
  onClose: () => void;
  onSubmit: (entry: NaesinEntry) => Promise<{ ok: boolean; detail?: string }>;
};

// onSubmit: async (entry) => {ok:boolean, detail?:string} — entry = {term, enteredAt, subjects}.
// 실제 API 호출(addGoalGrade)은 호출부(Grades.jsx / NaesinCard.jsx)가 맡는다 — 이 모달은
// 입력 UI와 폼 상태만 소유한다(house 패턴, AddMockExamGradeModal과 동일).
export default function AddNaesinGradeModal({
  open,
  onClose,
  onSubmit,
}: AddNaesinGradeModalProps) {
  const [semester, setSemester] = useState("");
  const [enteredAt, setEnteredAt] = useState(todayDateValue());
  const [grades, setGrades] = useState<Record<string, string>>({
    korean: "",
    math: "",
    english: "",
    science: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const canSubmit =
    !submitting &&
    semester.trim().length > 0 &&
    enteredAt.trim().length > 0 &&
    // SUBJECTS의 key는 grades 초기값에 항상 존재하는 고정 필드다.
    SUBJECTS.every(({ key }) => grades[key]!.toString().trim().length > 0);

  function resetForm() {
    setSemester("");
    setEnteredAt(todayDateValue());
    setGrades({ korean: "", math: "", english: "", science: "" });
    setError("");
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError("");
    const result = await onSubmit({
      term: semester.trim(),
      enteredAt,
      subjects: grades,
    });
    setSubmitting(false);

    if (!result?.ok) {
      setError(result?.detail || "저장에 실패했습니다. 다시 시도해 주세요.");
      return;
    }
    handleClose();
  }

  return (
    <AppModal
      open={open}
      onClose={handleClose}
      title="내신 성적 추가"
      subtitle="학기별 과목 등급을 입력하면 평균이 자동 환산돼요"
      cancelLabel="취소"
      onCancel={handleClose}
      submitLabel={submitting ? "저장 중…" : "성적 저장하기"}
      onSubmit={handleSubmit}
      submitDisabled={!canSubmit}
    >
      {error && (
        <p className="rounded-lg bg-[#FCE4E4] px-3 py-2 text-[0.8125rem] leading-[1.5] text-[#D14343]">
          {error}
        </p>
      )}

      <div className="grid grid-cols-2 gap-[0.5rem]">
        <ModalField
          label="학기"
          value={semester}
          onChange={(event) => setSemester(event.target.value)}
          placeholder="예) 고2 2학기 중간"
          required
        />
        <ModalField
          label="입력일"
          variant="date"
          value={enteredAt}
          onChange={(event) => setEnteredAt(event.target.value)}
          required
        />
      </div>

      <div>
        <p className="mb-[1.6875rem] text-[0.875rem] font-semibold leading-[1.4] text-ink-strong">
          과목별 등급<span className="ml-1 text-error">*</span>
        </p>
        <div className="flex flex-col gap-3">
          {SUBJECTS.map(({ key, label }) => (
            <GradeField
              key={key}
              label={label}
              value={grades[key]!}
              onChange={(event) =>
                setGrades((prev) => ({ ...prev, [key]: event.target.value }))
              }
            />
          ))}
        </div>
      </div>
    </AppModal>
  );
}
