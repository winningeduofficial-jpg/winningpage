import { useEffect, useState } from 'react';
import AppModal from '../AppModal';
import ModalField from '../ModalField';
import SegmentedChipGroup from '../SegmentedChipGroup';
import { goalModalOptions } from '../../../data/goalMock';

// 문제집 추가 모달 — docs/figma-goal/part-11.md #31 (530×468 = 33.125rem × 29.25rem).
// 트리거: 「나의 노력」 과목 카드 `+ 문제집 추가`(과목 프리셀렉트) / 헤더 `+ 과목 추가하기`(프리셀렉트 없음).
// 과목 칩 5종(국어/수학/영어/탐구/기타)은 AddTaskModal의 과목 옵션과 동일 집합이라
// goalModalOptions.taskSubjects를 그대로 재사용한다(part-11 §243 "#28 모달의 과목 칩 5종과 동일").
const SUBJECT_OPTIONS = goalModalOptions.taskSubjects.map((label) => ({ value: label, label }));

// 시안(#31) 실측 표시값 — 현재/전체 페이지 기본값(part-11 §117).
const DEFAULT_CURRENT_PAGE = '0';
const DEFAULT_TOTAL_PAGE = '240';

export default function AddWorkbookModal({ open, onClose, initialSubject = null }) {
  const [subject, setSubject] = useState(initialSubject);
  const [title, setTitle] = useState('');
  const [currentPage, setCurrentPage] = useState(DEFAULT_CURRENT_PAGE);
  const [totalPage, setTotalPage] = useState(DEFAULT_TOTAL_PAGE);

  // 과목 카드별 "+ 문제집 추가"로 열릴 때마다 해당 과목을 프리셀렉트한다(추정, part-11 §120
  // "카드의 + 문제집 추가 클릭 → 해당 과목이 프리셀렉트된 모달 오픈").
  useEffect(() => {
    if (open) setSubject(initialSubject);
  }, [open, initialSubject]);

  const canSubmit = Boolean(subject) && title.trim().length > 0;

  function resetForm() {
    setSubject(initialSubject);
    setTitle('');
    setCurrentPage(DEFAULT_CURRENT_PAGE);
    setTotalPage(DEFAULT_TOTAL_PAGE);
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  function handleSubmit() {
    if (!canSubmit) return;
    // 목업 스텁 — 실제 저장/API 연동 금지(확정 사항 §1). 콘솔 로그 + 모달 닫기만 수행.
    console.log('[AddWorkbookModal] submit', { subject, title, currentPage, totalPage });
    handleClose();
  }

  return (
    <AppModal
      open={open}
      onClose={handleClose}
      title="문제집 추가"
      subtitle="공부 중인 책을 등록하면 진도율이 쌓여요"
      cancelLabel="취소"
      onCancel={handleClose}
      submitLabel="문제집 추가하기"
      onSubmit={handleSubmit}
      submitDisabled={!canSubmit}
    >
      <div>
        <p className="mb-[1.6875rem] text-[0.875rem] font-semibold leading-[1.4] text-ink-strong">
          과목<span className="ml-1 text-error">*</span>
        </p>
        <SegmentedChipGroup ariaLabel="과목" options={SUBJECT_OPTIONS} value={subject} onChange={setSubject} />
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
