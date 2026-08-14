import { useEffect, useState } from "react";
import { goalModalOptions } from "../../../data/goalMock";
import AppModal from "../AppModal";
import ModalField from "../ModalField";
import SegmentedChipGroup from "../SegmentedChipGroup";
import { resolveSubjectId } from "../subjectTokens";

// 문제집 추가/수정 모달 — docs/figma-goal/part-11.md #31 (530×468 = 33.125rem × 29.25rem).
// 트리거: 「나의 노력」 과목 카드 `+ 문제집 추가`(과목 프리셀렉트, 신규) / 헤더 `+ 과목 추가하기`
// (프리셀렉트 없음, 신규) / 등록된 문제집 칩 클릭(수정 — 진도 갱신 동선이 시안에 별도로 없어 이
// 모달을 재사용한다, api/goal/workbooks.js PUT 배선 시 재량 판단).
// 과목 칩 5종(국어/수학/영어/탐구/기타)은 AddTaskModal의 과목 옵션과 동일 집합이라
// goalModalOptions.taskSubjects를 그대로 재사용한다(part-11 §243 "#28 모달의 과목 칩 5종과 동일").
const SUBJECT_OPTIONS = goalModalOptions.taskSubjects.map((label) => ({
  value: label,
  label,
}));

// 과목 id(korean 등) → 이 모달이 쓰는 한글 라벨. subjectTokens.js는 라벨→id 방향만 제공해
// 역방향은 여기서 SUBJECT_OPTIONS로부터 만든다.
const SUBJECT_LABEL_BY_ID = Object.fromEntries(
  SUBJECT_OPTIONS.map(({ value }) => [resolveSubjectId(value), value]),
);

// 시안(#31) 실측 표시값 — 현재/전체 페이지 기본값(part-11 §117).
const DEFAULT_CURRENT_PAGE = "0";
const DEFAULT_TOTAL_PAGE = "240";

// editingWorkbook: { id, subject(id), title, totalPages, currentPage } | null.
// null이면 신규 등록, 값이 있으면 그 문제집의 진도 수정(과목은 바꿀 수 없다 —
// api/goal/workbooks.js validateUpdateBody 주석 참고).
export default function AddWorkbookModal({
  open,
  onClose,
  initialSubject = null,
  editingWorkbook = null,
  onSubmit,
}) {
  const isEditing = Boolean(editingWorkbook);

  const [subject, setSubject] = useState(initialSubject);
  const [title, setTitle] = useState("");
  const [currentPage, setCurrentPage] = useState(DEFAULT_CURRENT_PAGE);
  const [totalPage, setTotalPage] = useState(DEFAULT_TOTAL_PAGE);
  const [submitting, setSubmitting] = useState(false);

  // 열릴 때마다 모드에 맞춰 폼을 채운다 — 신규는 프리셀렉트 과목만(추정, part-11 §120
  // "카드의 + 문제집 추가 클릭 → 해당 과목이 프리셀렉트된 모달 오픈"), 수정은 기존 값 전체.
  useEffect(() => {
    if (!open) return;
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
    if (submitting) return;
    resetForm();
    onClose();
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const ok = await onSubmit({
        id: editingWorkbook?.id,
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

  return (
    <AppModal
      open={open}
      onClose={handleClose}
      title={isEditing ? "문제집 수정" : "문제집 추가"}
      subtitle="공부 중인 책을 등록하면 진도율이 쌓여요"
      cancelLabel="취소"
      onCancel={handleClose}
      submitLabel={isEditing ? "수정하기" : "문제집 추가하기"}
      onSubmit={handleSubmit}
      submitDisabled={!canSubmit}
    >
      <div>
        <p className="mb-[1.6875rem] text-[0.875rem] font-semibold leading-[1.4] text-ink-strong">
          과목<span className="ml-1 text-error">*</span>
        </p>
        {/* 수정 모드에서는 과목을 바꿀 수 없다(PUT이 subject를 받지 않는다, 위 컴포넌트
            주석 참고) — 칩을 눌러도 선택이 바뀌지 않게 onChange를 no-op으로 둔다. */}
        <SegmentedChipGroup
          ariaLabel="과목"
          options={SUBJECT_OPTIONS}
          value={subject}
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

      <div className="grid grid-cols-2 gap-[0.5rem]">
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
    </AppModal>
  );
}
