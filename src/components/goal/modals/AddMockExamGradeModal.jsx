import { useId, useState } from "react";
import { goalModalOptions } from "../../../data/goalMock";
import AppModal from "../AppModal";
import ModalField from "../ModalField";

// 모의고사 성적 추가 모달 — docs/figma-goal/part-08.md #22 (530×574 = 33.125rem × 35.875rem,
// 높이는 주석용). 트리거: MockExamCard("+ 성적 추가").
const ROUND_OPTIONS = goalModalOptions.mockExamRounds.map((label) => ({
  value: label,
  label,
}));

// part-08 §177: 시안의 백분위 입력값(82/74/88/76)은 연회색으로 렌더돼 실제 입력값이 아니라
// placeholder로 판단된다(추정). 그대로 placeholder 예시값으로만 재사용하고 실제 상태는 빈 값으로 시작.
const SUBJECTS = [
  { key: "korean", label: "국어", placeholder: "82" },
  { key: "math", label: "수학", placeholder: "74" },
  { key: "english", label: "영어", placeholder: "88" },
  { key: "science", label: "탐구", placeholder: "76" },
];

// 과목별 백분위 행 — ModalField(라벨 위/컨트롤 아래)와 달리 시안(#22)은 "국어 82 백분위"처럼
// 라벨-입력-접미가 한 줄에 나란히 놓인다. 레이아웃이 달라 ModalField를 재사용하지 않고 로컬
// 서브컴포넌트로 둔다.
function PercentileField({ label, value, onChange, placeholder }) {
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
          min={0}
          max={100}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          className="h-[2.4375rem] w-full rounded-lg border border-[#E3E3E3] bg-white px-[0.875rem] pr-14 text-[0.875rem] text-ink placeholder:text-ink-sub focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <span className="pointer-events-none absolute right-[0.875rem] top-1/2 -translate-y-1/2 text-[0.8125rem] text-ink-sub">
          백분위
        </span>
      </div>
    </div>
  );
}

// onSubmit: async (entry) => {ok:boolean, detail?:string} — entry = {term, examDate, subjects}.
// 실제 API 호출(addGoalGrade)은 호출부(Grades.jsx / MockExamCard.jsx)가 맡는다.
export default function AddMockExamGradeModal({ open, onClose, onSubmit }) {
  const [round, setRound] = useState(ROUND_OPTIONS[0].value);
  const [examDate, setExamDate] = useState("");
  const [scores, setScores] = useState({
    korean: "",
    math: "",
    english: "",
    science: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const canSubmit =
    !submitting &&
    examDate.trim().length > 0 &&
    SUBJECTS.every(({ key }) => scores[key].toString().trim().length > 0);

  function resetForm() {
    setRound(ROUND_OPTIONS[0].value);
    setExamDate("");
    setScores({ korean: "", math: "", english: "", science: "" });
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
    const result = await onSubmit({ term: round, examDate, subjects: scores });
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
      title="모의고사 성적 추가"
      subtitle="회차별 백분위를 입력하면 목표와의 격차가 다시 계산돼요"
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
          label="회차"
          variant="select"
          value={round}
          onChange={(event) => setRound(event.target.value)}
          options={ROUND_OPTIONS}
        />
        <ModalField
          label="응시일"
          variant="date"
          value={examDate}
          onChange={(event) => setExamDate(event.target.value)}
          required
        />
      </div>

      <div>
        <p className="mb-[1.6875rem] text-[0.875rem] font-semibold leading-[1.4] text-ink-strong">
          과목별 백분위<span className="ml-1 text-error">*</span>
        </p>
        <div className="flex flex-col gap-3">
          {SUBJECTS.map(({ key, label, placeholder }) => (
            <PercentileField
              key={key}
              label={label}
              placeholder={placeholder}
              value={scores[key]}
              onChange={(event) =>
                setScores((prev) => ({ ...prev, [key]: event.target.value }))
              }
            />
          ))}
        </div>
      </div>

      <p className="rounded-lg bg-goal-insight-info px-3 py-2 text-[0.8125rem] leading-[1.5] text-ink">
        {/* 원문 카피(4022:5216)는 "학업 성취도 변화 추이와 합격률 예측에 반영"이지만, 이번 범위는
            기록·표시만 한다(팀장 지시 — 합격률 재계산·그래프 반영 없음). 구현되지 않은 기능을
            약속하는 문구를 그대로 두면 사용자를 오도하므로 실제 동작에 맞게 정정한다. */}
        💡 입력한 백분위는 회차별 성적 표에 기록되어 목표와의 격차를 계산하는 데
        쓰입니다.
      </p>
    </AppModal>
  );
}
