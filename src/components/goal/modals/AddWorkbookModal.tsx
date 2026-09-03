import { useEffect, useState } from "react";
import AppModal from "@/components/goal/AppModal";
import ModalField from "@/components/goal/ModalField";
import SegmentedChipGroup from "@/components/goal/SegmentedChipGroup";
import {
  getSubjectLabel,
  resolveSubjectId,
  WORKBOOK_SUBJECT_IDS,
} from "@/components/goal/subjectTokens";

// 문제집 등록 모달 — docs/figma-goal/part-11.md #31 (530×468 = 33.125rem × 29.25rem).
// 트리거: 「나의 노력」 과목 카드 `+ 문제집 추가`(과목 프리셀렉트) / 헤더
// `+ 과목 추가하기`(프리셀렉트 없음). 신규 등록 전용이다 — 진도 수정(제목/현재·전체
// 페이지)과 삭제는 EffortWorkbookRow의 인라인 입력/× 버튼으로 이동했다(Figma
// 4026:6046 재구현, 팀장 지시: "기존 AddWorkbookModal은 추가에만 사용, 편집 모드
// 코드는 제거").
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

// 시안(#31) 실측 표시값 — 현재/전체 페이지 기본값(part-11 §117).
const DEFAULT_CURRENT_PAGE = "0";
const DEFAULT_TOTAL_PAGE = "240";

type AddWorkbookModalSubmitPayload = {
  subject: string;
  title: string;
  currentPage: number;
  totalPage: number;
};

type AddWorkbookModalProps = {
  open: boolean;
  onClose: () => void;
  initialSubject?: string | null;
  onSubmit: (payload: AddWorkbookModalSubmitPayload) => Promise<boolean>;
};

export default function AddWorkbookModal({
  open,
  onClose,
  initialSubject = null,
  onSubmit,
}: AddWorkbookModalProps) {
  const [subject, setSubject] = useState(initialSubject);
  const [title, setTitle] = useState("");
  const [currentPage, setCurrentPage] = useState(DEFAULT_CURRENT_PAGE);
  const [totalPage, setTotalPage] = useState(DEFAULT_TOTAL_PAGE);
  const [submitting, setSubmitting] = useState(false);

  // 열릴 때마다 프리셀렉트 과목만 남기고 나머지 필드는 초기화한다(추정, part-11 §120
  // "카드의 + 문제집 추가 클릭 → 해당 과목이 프리셀렉트된 모달 오픈").
  useEffect(() => {
    if (!open) return;
    setSubject(initialSubject);
    setTitle("");
    setCurrentPage(DEFAULT_CURRENT_PAGE);
    setTotalPage(DEFAULT_TOTAL_PAGE);
  }, [open, initialSubject]);

  // 현재 페이지가 전체 페이지를 넘으면 등록 불가(사용자 확정 2026-09-02).
  const totalPageValue = Number(totalPage) || 0;
  const currentPageValue = Number(currentPage) || 0;
  const pageRangeInvalid =
    totalPageValue <= 0 || currentPageValue > totalPageValue;
  const canSubmit =
    Boolean(subject) &&
    title.trim().length > 0 &&
    !pageRangeInvalid &&
    !submitting;

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
      title="문제집 추가"
      subtitle="공부 중인 책을 등록하면 진도율이 쌓여요"
      cancelLabel="취소"
      onCancel={handleClose}
      submitLabel={submitting ? "저장 중…" : "문제집 추가하기"}
      onSubmit={handleSubmit}
      submitDisabled={!canSubmit}
    >
      <div>
        <p className="mb-6.75 text-[0.875rem] font-semibold leading-[1.4] text-ink-strong">
          과목<span className="ml-1 text-error">*</span>
        </p>
        <SegmentedChipGroup
          ariaLabel="과목"
          options={SUBJECT_OPTIONS}
          value={subject ?? ""}
          onChange={setSubject}
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
      <p className="text-[0.75rem] leading-[1.4] text-ink-sub">
        전체 페이지는 등록 후 수정할 수 없어요.
      </p>
      {pageRangeInvalid && (
        <p className="text-[0.75rem] leading-[1.4] text-error">
          현재 페이지는 전체 페이지(1 이상)를 넘을 수 없어요.
        </p>
      )}
    </AppModal>
  );
}
