import { useId, useState } from 'react';
import AppModal from '../AppModal';
import ModalField from '../ModalField';
import { goalModalOptions } from '../../../data/goalMock';

// 모의고사 성적 추가 모달 — docs/figma-goal/part-08.md #22 (530×574 = 33.125rem × 35.875rem,
// 높이는 주석용). 트리거: MockExamCard("+ 성적 추가").
const ROUND_OPTIONS = goalModalOptions.mockExamRounds.map((label) => ({ value: label, label }));

// part-08 §177: 시안의 백분위 입력값(82/74/88/76)은 연회색으로 렌더돼 실제 입력값이 아니라
// placeholder로 판단된다(추정). 그대로 placeholder 예시값으로만 재사용하고 실제 상태는 빈 값으로 시작.
const SUBJECTS = [
  { key: 'korean', label: '국어', placeholder: '82' },
  { key: 'math', label: '수학', placeholder: '74' },
  { key: 'english', label: '영어', placeholder: '88' },
  { key: 'science', label: '탐구', placeholder: '76' }
];

// 과목별 백분위 행 — ModalField(라벨 위/컨트롤 아래)와 달리 시안(#22)은 "국어 82 백분위"처럼
// 라벨-입력-접미가 한 줄에 나란히 놓인다. 레이아웃이 달라 ModalField를 재사용하지 않고 로컬
// 서브컴포넌트로 둔다.
function PercentileField({ label, value, onChange, placeholder }) {
  const fieldId = useId();
  return (
    <div className="flex items-center gap-3">
      <label htmlFor={fieldId} className="w-[3.5rem] shrink-0 text-[0.875rem] font-semibold leading-[1.4] text-ink-strong">
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

export default function AddMockExamGradeModal({ open, onClose }) {
  const [round, setRound] = useState(ROUND_OPTIONS[0].value);
  const [examDate, setExamDate] = useState('');
  const [scores, setScores] = useState({ korean: '', math: '', english: '', science: '' });

  const canSubmit =
    examDate.trim().length > 0 && SUBJECTS.every(({ key }) => scores[key].toString().trim().length > 0);

  function resetForm() {
    setRound(ROUND_OPTIONS[0].value);
    setExamDate('');
    setScores({ korean: '', math: '', english: '', science: '' });
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  function handleSubmit() {
    if (!canSubmit) return;
    // 목업 스텁 — 실제 저장/API 연동 금지(확정 사항 §1). 콘솔 로그 + 모달 닫기만 수행.
    console.log('[AddMockExamGradeModal] submit', { round, examDate, scores });
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
      submitLabel="성적 저장하기"
      onSubmit={handleSubmit}
      submitDisabled={!canSubmit}
    >
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
              onChange={(event) => setScores((prev) => ({ ...prev, [key]: event.target.value }))}
            />
          ))}
        </div>
      </div>

      <p className="rounded-lg bg-goal-insight-info px-3 py-2 text-[0.8125rem] leading-[1.5] text-ink">
        💡 입력한 백분위는 학업 성취도 변화 추이와 합격률 예측에 반영됩니다.
      </p>
    </AppModal>
  );
}
