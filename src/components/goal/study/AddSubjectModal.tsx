import { useState } from "react";
import AppModal from "@/components/goal/AppModal";
import { TIMER_SUBJECT_CATALOG } from "@/components/goal/studyRecordOptions";
import {
  getSubjectBgClass,
  getSubjectLabel,
} from "@/components/goal/subjectTokens";

// 열공 타이머(#25) "+ 과목 추가" 모달(QA B9). 설계 확정(옵션 A) — 자유 입력이 아니라
// 카탈로그 8종 중 아직 카드로 노출되지 않은 과목만 칩으로 골라 추가한다. AppModal
// 셸(과제 추가 모달 AddTaskModal과 동일 패턴)을 그대로 재사용한다 — 이 모달은 저장
// 폼이 아니라 "고르면 바로 추가"라 하단 취소/완료 버튼은 둘 다 닫기 역할만 한다.
type AddSubjectModalProps = {
  open: boolean;
  onClose: () => void;
  visibleSubjects: string[];
  onAdd: (subject: string) => Promise<void>;
};

export default function AddSubjectModal({
  open,
  onClose,
  visibleSubjects,
  onAdd,
}: AddSubjectModalProps) {
  const [pendingSubject, setPendingSubject] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const candidates = TIMER_SUBJECT_CATALOG.filter(
    (code) => !visibleSubjects.includes(code),
  );

  function handleClose() {
    setPendingSubject(null);
    setErrorMessage(null);
    onClose();
  }

  async function handlePick(subject: string) {
    if (pendingSubject) return;
    setPendingSubject(subject);
    setErrorMessage(null);
    try {
      await onAdd(subject);
      handleClose();
    } catch (error) {
      console.error("[AddSubjectModal] 과목 추가 실패:", error);
      setErrorMessage("과목을 추가하지 못했어요. 잠시 후 다시 시도해 주세요.");
      setPendingSubject(null);
    }
  }

  return (
    <AppModal
      open={open}
      onClose={handleClose}
      title="과목 추가"
      subtitle="열공 타이머에 표시할 과목을 선택하세요"
      cancelLabel="닫기"
      onCancel={handleClose}
      submitLabel="완료"
      onSubmit={handleClose}
    >
      {errorMessage && (
        <p className="text-[0.8125rem] leading-[1.4] text-error">
          {errorMessage}
        </p>
      )}
      {candidates.length === 0 ? (
        <p className="text-[0.875rem] leading-[1.4] text-ink-sub">
          모든 과목이 이미 추가돼 있어요.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {candidates.map((code) => (
            <button
              key={code}
              type="button"
              disabled={pendingSubject !== null}
              onClick={() => handlePick(code)}
              className={`h-9.75 rounded-lg px-4 text-[0.875rem] font-medium text-ink-strong transition-opacity disabled:cursor-not-allowed disabled:opacity-50 ${getSubjectBgClass(code)}`}
            >
              {pendingSubject === code ? "추가하는 중…" : getSubjectLabel(code)}
            </button>
          ))}
        </div>
      )}
    </AppModal>
  );
}
