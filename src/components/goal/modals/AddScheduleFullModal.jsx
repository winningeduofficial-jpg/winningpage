import { useEffect, useState } from 'react';
import AppModal from '../AppModal';
import ModalField from '../ModalField';
import SegmentedChipGroup from '../SegmentedChipGroup';
import { goalModalOptions } from '../../../data/goalMock';

// 중요일정 등록 모달(624px 버전) — docs/figma-goal/part-14.md #40 (530×624 = 33.125rem × 39rem,
// **모달 정본** — 화면별 지침 §3 확정 사항). 대시보드 진입용 AddScheduleModal(#19, 530×574,
// modals/AddScheduleModal.jsx — 읽기 전용, 정본 아님)과는 별개 파일이다.
//
// #40은 #19와 필드 구성이 다르다: "일정" 반복 범위 select가 없고(총 4필드: 종류/이름/마감일/메모),
// 메모가 textarea(461×101, part-14 §77)로 더 크다. 마감일도 #19처럼 다른 필드와 2열로 짝짓지
// 않고 168px(10.5rem) 단독 행이다(part-14 §74 "609 마감일 라벨 → 641 날짜입력 168×39" 사이에
// 다른 필드 좌표가 없음).
//
// 공통 부분(과목 칩 그룹 등) 추출을 검토했으나 AddScheduleModal.jsx는 읽기 전용 파일이라
// 리팩터링 대상에서 뺐고, 신규 공용 파일을 만들면 파일 소유권 규칙(modals/ 신규 2파일만 허용)을
// 벗어나 폼 로직을 이 파일 안에 그대로 둔다(작업 보고 "판단이 필요했던 지점" 참고).
//
// 트리거: 중요일정 목록 페이지(Schedules.jsx) 우상단 `일정 등록`(신규) / 카드별 `수정`(값 프리필,
// initial prop — 수정용 시안은 없어 동일 모달 재사용을 추정한 구현, part-14 §164).
const SCHEDULE_TYPE_OPTIONS = goalModalOptions.scheduleTypes.map((label) => ({ value: label, label }));

const EMPTY_FORM = { scheduleType: null, title: '', dueDate: '', memo: '' };

export default function AddScheduleFullModal({ open, onClose, initial = null }) {
  const [scheduleType, setScheduleType] = useState(initial?.scheduleType ?? EMPTY_FORM.scheduleType);
  const [title, setTitle] = useState(initial?.title ?? EMPTY_FORM.title);
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? EMPTY_FORM.dueDate);
  const [memo, setMemo] = useState(initial?.memo ?? EMPTY_FORM.memo);

  // 이 모달은 Schedules.jsx에 상시 마운트돼 `initial`이 최초 null → 값 있는 객체로 나중에 바뀔 수
  // 있다. useState 초기화자는 마운트 시 1회만 실행되므로 그 갱신을 반영하려면 `open`이 true로 바뀔
  // 때마다 폼을 다시 채워야 한다(AddWorkbookModal.jsx의 동일 패턴 준용).
  useEffect(() => {
    if (open) {
      setScheduleType(initial?.scheduleType ?? EMPTY_FORM.scheduleType);
      setTitle(initial?.title ?? EMPTY_FORM.title);
      setDueDate(initial?.dueDate ?? EMPTY_FORM.dueDate);
      setMemo(initial?.memo ?? EMPTY_FORM.memo);
    }
  }, [open, initial]);

  const canSubmit = Boolean(scheduleType) && title.trim().length > 0 && dueDate.trim().length > 0;

  function resetForm() {
    setScheduleType(initial?.scheduleType ?? EMPTY_FORM.scheduleType);
    setTitle(initial?.title ?? EMPTY_FORM.title);
    setDueDate(initial?.dueDate ?? EMPTY_FORM.dueDate);
    setMemo(initial?.memo ?? EMPTY_FORM.memo);
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  function handleSubmit() {
    if (!canSubmit) return;
    // 목업 스텁 — 실제 저장/API 연동 금지(확정 사항 §1). 콘솔 로그 + 모달 닫기만 수행.
    console.log('[AddScheduleFullModal] submit', { scheduleType, title, dueDate, memo });
    handleClose();
  }

  return (
    <AppModal
      open={open}
      onClose={handleClose}
      title="중요일정 등록"
      subtitle="등록하면 D-day와 알림으로 챙겨드려요"
      cancelLabel="취소"
      onCancel={handleClose}
      submitLabel="일정 저장하기"
      onSubmit={handleSubmit}
      submitDisabled={!canSubmit}
    >
      <div>
        <p className="mb-[1.6875rem] text-[0.875rem] font-semibold leading-[1.4] text-ink-strong">
          일정 종류<span className="ml-1 text-error">*</span>
        </p>
        <SegmentedChipGroup
          ariaLabel="일정 종류"
          options={SCHEDULE_TYPE_OPTIONS}
          value={scheduleType}
          onChange={setScheduleType}
        />
      </div>

      <ModalField
        label="일정 이름"
        variant="text"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="예) 한국사 수행평가 제출"
        required
      />

      {/* 시안(#40)은 마감일이 다른 필드와 짝을 이루지 않는 168px 단독 행이다 — #19(마감일+일정
          2열)와의 차이. */}
      <div className="w-[10.5rem]">
        <ModalField
          label="마감일"
          variant="date"
          value={dueDate}
          onChange={(event) => setDueDate(event.target.value)}
          required
        />
      </div>

      {/* 메모는 textarea(461×101) — ModalField가 text/number/select/date 4변형만 지원해
          여기서는 직접 구현한다(ModalField와 시각 스펙 동일하게 맞춤). */}
      <div>
        <label className="mb-[1.6875rem] block text-[0.875rem] font-semibold leading-[1.4] text-ink-strong">
          메모 (선택)
        </label>
        <textarea
          value={memo}
          onChange={(event) => setMemo(event.target.value)}
          placeholder="예) 발표 자료 포함, 조사 범위 등 메모를 남겨두세요"
          rows={4}
          className="h-[6.3125rem] w-full resize-none rounded-lg border border-[#E3E3E3] bg-white px-[0.875rem] py-[0.625rem] text-[0.875rem] text-ink placeholder:text-ink-sub focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </div>
    </AppModal>
  );
}
