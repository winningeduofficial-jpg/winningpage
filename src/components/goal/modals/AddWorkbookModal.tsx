import { useEffect, useState } from "react";
import AppModal from "@/components/goal/AppModal";
import ModalField from "@/components/goal/ModalField";
import SegmentedChipGroup from "@/components/goal/SegmentedChipGroup";
import {
  getSubjectLabel,
  resolveSubjectId,
  WORKBOOK_SUBJECT_IDS,
} from "@/components/goal/subjectTokens";

// 문제집 추가/수정 모달 — docs/figma-goal/part-11.md #31 (530×468 = 33.125rem × 29.25rem).
// 트리거: 「나의 노력」 과목 카드 `+ 문제집 추가`(과목 프리셀렉트, 신규) / 헤더 `+ 과목 추가하기`
// (프리셀렉트 없음, 신규) / 등록된 문제집 목록 행 클릭(수정 — 진도 갱신 동선이 시안에 별도로
// 없어 이 모달을 재사용한다, api/goal/workbooks.js PUT 배선 시 재량 판단).
//
// 과목 칩 — goal_workbooks_subject_check가 5종(korean/math/english/science/etc)으로
// 고정돼 있어(QA B9로 8종까지 넓어진 goal_plan_tasks 등 다른 3테이블과 다르다,
// subjectTokens.ts WORKBOOK_SUBJECT_IDS 주석 참고) 반드시 그 5종만 골라야 한다.
// 예전엔 AddTaskModal과 같은 TASK_SUBJECTS(goalFormOptions.ts)를 재사용했는데, 그 상수가
// QA B9로 8종(사회/한국사/제2외국어 추가)까지 넓어지면서 6~8번째 칩을 고르면 서버가 400을
// 돌려주는 잠재 결함이 됐다 — 여기서는 goal_workbooks 전용 5종만 쓴다.
const SUBJECT_OPTIONS = WORKBOOK_SUBJECT_IDS.map((id) => {
  const label = getSubjectLabel(id);
  return { value: label, label };
});

// 과목 id(korean 등) → 이 모달이 쓰는 한글 라벨. subjectTokens.js는 라벨→id 방향만 제공해
// 역방향은 여기서 SUBJECT_OPTIONS로부터 만든다.
const SUBJECT_LABEL_BY_ID = Object.fromEntries(
  SUBJECT_OPTIONS.map(({ value }) => [resolveSubjectId(value), value]),
);

// 시안(#31) 실측 표시값 — 현재/전체 페이지 기본값(part-11 §117).
const DEFAULT_CURRENT_PAGE = "0";
const DEFAULT_TOTAL_PAGE = "240";

type EditingWorkbook = {
  id: number | string;
  subject: string;
  title: string;
  // goalApi.ts의 GoalWorkbook과 동일하게 null 가능 — 아래 프리필 로직이 이미 `?? 0`으로
  // 방어하고 있어 실제로는 null-safe였다(타입만 실데이터에 맞춘다).
  totalPages: number | null;
  currentPage: number | null;
};

type AddWorkbookModalSubmitPayload = {
  id?: number | string;
  subject: string;
  title: string;
  currentPage: number;
  totalPage: number;
};

type AddWorkbookModalProps = {
  open: boolean;
  onClose: () => void;
  initialSubject?: string | null;
  editingWorkbook?: EditingWorkbook | null;
  onSubmit: (payload: AddWorkbookModalSubmitPayload) => Promise<boolean>;
  // 수정 모드에서만 노출한다(QA 행321) — 없으면 삭제 UI 자체를 그리지 않는다
  // (AddScheduleFullModal의 onDeleted 콜백 패턴과 동일하게 caller가 목록 갱신을 책임진다).
  onDelete?: (id: number | string) => Promise<boolean>;
};

// editingWorkbook: { id, subject(id), title, totalPages, currentPage } | null.
// null이면 신규 등록, 값이 있으면 그 문제집의 진도 수정(과목은 바꿀 수 없다 —
// api/goal/workbooks.js validateUpdateBody 주석 참고).
export default function AddWorkbookModal({
  open,
  onClose,
  initialSubject = null,
  editingWorkbook = null,
  onSubmit,
  onDelete,
}: AddWorkbookModalProps) {
  const isEditing = Boolean(editingWorkbook);

  const [subject, setSubject] = useState(initialSubject);
  const [title, setTitle] = useState("");
  const [currentPage, setCurrentPage] = useState(DEFAULT_CURRENT_PAGE);
  const [totalPage, setTotalPage] = useState(DEFAULT_TOTAL_PAGE);
  const [submitting, setSubmitting] = useState(false);
  // 인라인 2단계 삭제 확인 — CouponAdmin.tsx의 voidingId 패턴 준용(오조작 방지에
  // window.confirm 대신 같은 자리에서 확인/취소 버튼으로 전환).
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // 열릴 때마다 모드에 맞춰 폼을 채운다 — 신규는 프리셀렉트 과목만(추정, part-11 §120
  // "카드의 + 문제집 추가 클릭 → 해당 과목이 프리셀렉트된 모달 오픈"), 수정은 기존 값 전체.
  useEffect(() => {
    if (!open) return;
    setConfirmingDelete(false);
    if (editingWorkbook) {
      setSubject(
        SUBJECT_LABEL_BY_ID[editingWorkbook.subject] ?? initialSubject,
      );
      setTitle(editingWorkbook.title ?? "");
      setCurrentPage(String(editingWorkbook.currentPage ?? 0));
      setTotalPage(String(editingWorkbook.totalPages ?? DEFAULT_TOTAL_PAGE));
    } else {
      setSubject(initialSubject);
      setTitle("");
      setCurrentPage(DEFAULT_CURRENT_PAGE);
      setTotalPage(DEFAULT_TOTAL_PAGE);
    }
  }, [open, initialSubject, editingWorkbook]);

  const canSubmit = Boolean(subject) && title.trim().length > 0 && !submitting;

  function resetForm() {
    setSubject(initialSubject);
    setTitle("");
    setCurrentPage(DEFAULT_CURRENT_PAGE);
    setTotalPage(DEFAULT_TOTAL_PAGE);
  }

  function handleClose() {
    if (submitting || deleting) return;
    resetForm();
    setConfirmingDelete(false);
    onClose();
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const ok = await onSubmit({
        // exactOptionalPropertyTypes: id는 optional 필드라 명시적 undefined 값을 허용하지
        // 않는다 — editingWorkbook이 있을 때만 키를 넘긴다(없을 때 키 생략은 undefined 값과
        // 동일하게 처리된다).
        ...(editingWorkbook ? { id: editingWorkbook.id } : {}),
        subject: resolveSubjectId(subject),
        title: title.trim(),
        currentPage: Number(currentPage) || 0,
        totalPage: Number(totalPage) || 0,
      });
      if (ok !== false) {
        resetForm();
        onClose();
      }
    } finally {
      setSubmitting(false);
    }
  }

  // 1단계: "문제집 삭제" 클릭 → confirmingDelete=true(같은 자리에 확인/취소로 전환).
  // 2단계: "삭제" 재클릭에서만 실제 DELETE를 보낸다.
  async function handleConfirmDelete() {
    if (!editingWorkbook || !onDelete || deleting) return;
    setDeleting(true);
    try {
      const ok = await onDelete(editingWorkbook.id);
      if (ok !== false) {
        resetForm();
        setConfirmingDelete(false);
        onClose();
      }
    } finally {
      setDeleting(false);
    }
  }

  return (
    <AppModal
      open={open}
      onClose={handleClose}
      title={isEditing ? "문제집 수정" : "문제집 추가"}
      subtitle="공부 중인 책을 등록하면 진도율이 쌓여요"
      cancelLabel="취소"
      onCancel={handleClose}
      submitLabel={
        submitting ? "저장 중…" : isEditing ? "수정하기" : "문제집 추가하기"
      }
      onSubmit={handleSubmit}
      submitDisabled={!canSubmit || deleting}
    >
      <div>
        <p className="mb-6.75 text-[0.875rem] font-semibold leading-[1.4] text-ink-strong">
          과목<span className="ml-1 text-error">*</span>
        </p>
        {/* 수정 모드에서는 과목을 바꿀 수 없다(PUT이 subject를 받지 않는다, 위 컴포넌트
            주석 참고) — 칩을 눌러도 선택이 바뀌지 않게 onChange를 no-op으로 둔다. */}
        <SegmentedChipGroup
          ariaLabel="과목"
          options={SUBJECT_OPTIONS}
          value={subject ?? ""}
          onChange={isEditing ? () => {} : setSubject}
        />
      </div>

      <ModalField
        label="문제집 이름"
        variant="text"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="예) 수능특강 독서"
        required
      />

      <div className="grid grid-cols-2 gap-2">
        <ModalField
          label="현재 페이지"
          variant="number"
          value={currentPage}
          onChange={(event) => setCurrentPage(event.target.value)}
        />
        <ModalField
          label="전체 페이지"
          variant="number"
          value={totalPage}
          onChange={(event) => setTotalPage(event.target.value)}
        />
      </div>

      {/* 삭제 — 수정 모드 + onDelete가 있을 때만(QA 행321). 인라인 2단계 확인:
          1클릭 "문제집 삭제" → 같은 자리에서 "정말 삭제할까요? 삭제/취소"로 전환. */}
      {isEditing && onDelete && (
        <div className="flex justify-end">
          {confirmingDelete ? (
            <div className="flex items-center gap-2">
              <span className="text-[0.8125rem] leading-[1.4] text-ink-sub">
                정말 삭제할까요?
              </span>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={deleting}
                className="text-[0.8125rem] font-semibold text-error transition-opacity hover:opacity-80 disabled:opacity-50"
              >
                {deleting ? "삭제 중…" : "삭제"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                disabled={deleting}
                className="text-[0.8125rem] font-medium text-ink-sub transition-colors hover:text-ink-strong disabled:opacity-50"
              >
                취소
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="text-[0.8125rem] font-medium text-error transition-opacity hover:opacity-80"
            >
              문제집 삭제
            </button>
          )}
        </div>
      )}
    </AppModal>
  );
}
