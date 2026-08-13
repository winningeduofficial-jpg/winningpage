import { useState } from "react";
import AppModal from "../AppModal";
import ModalField from "../ModalField";
import SegmentedChipGroup from "../SegmentedChipGroup";
import { goalModalOptions } from "../../../data/goalMock";

// 중요일정 등록 모달 — docs/figma-goal/part-07.md #19 (530×574 = 33.125rem × 35.875rem, 대시보드
// 진입 버전). 624px 버전(#40/#42, 중요일정 목록 페이지 전용, AddScheduleFullModal.jsx)이 정본이다.
//
// ⚠ 미사용(중요일정 D 백엔드 배선 UoW, 2026-08-13) — ScheduleRail("+")은 더 이상 이 모달을
// 열지 않고 /app/goal/schedules(정본 등록 모달)로 이동한다. 이 폼의 `range`(반복 범위, RANGE_OPTIONS)
// 필드가 goal_schedules 테이블(sql/74_goal_schedules.sql)에 대응 컬럼이 없어, 그대로 실 API에
// 연결하면 사용자가 고른 값을 서버가 조용히 버려야 한다 — 스키마가 그 필드를 받을 방법이 생기기
// 전까지는 컴포넌트를 지우지 않고 미사용 상태로만 남겨 둔다(트리거가 없어 현재 어디서도 렌더되지 않는다).
const SCHEDULE_TYPE_OPTIONS = goalModalOptions.scheduleTypes.map((label) => ({
  value: label,
  label,
}));
const RANGE_OPTIONS = goalModalOptions.scheduleRanges.map((label) => ({
  value: label,
  label,
}));

// 시안(#19)은 "마감일" 셀렉트에 더미값 "1시간 30분"이 들어 있는데, part-07 구현 노트가 이를
// "날짜 필드 값으로 맞지 않는 시안 더미 오류"로 지목하고 마감일은 날짜 피커여야 한다고 명시한다.
// 그 지시에 따라 마감일은 ModalField의 date 변형으로 구현한다.
const DEFAULT_RANGE = "이번 주만"; // 시안(#19) 실측 표시값

export default function AddScheduleModal({ open, onClose }) {
  const [scheduleType, setScheduleType] = useState(null);
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [range, setRange] = useState(DEFAULT_RANGE);
  const [memo, setMemo] = useState("");

  const canSubmit =
    Boolean(scheduleType) &&
    title.trim().length > 0 &&
    dueDate.trim().length > 0;

  function resetForm() {
    setScheduleType(null);
    setTitle("");
    setDueDate("");
    setRange(DEFAULT_RANGE);
    setMemo("");
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  function handleSubmit() {
    if (!canSubmit) return;
    // 목업 스텁 — 실제 저장/API 연동 금지(확정 사항 §1). 콘솔 로그 + 모달 닫기만 수행.
    console.log("[AddScheduleModal] submit", {
      scheduleType,
      title,
      dueDate,
      range,
      memo,
    });
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
      submitLabel="일정 등록하기"
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

      <div className="grid grid-cols-2 gap-[0.5rem]">
        <ModalField
          label="마감일"
          variant="date"
          value={dueDate}
          onChange={(event) => setDueDate(event.target.value)}
          required
        />
        <ModalField
          label="일정"
          variant="select"
          value={range}
          onChange={(event) => setRange(event.target.value)}
          options={RANGE_OPTIONS}
        />
      </div>

      <ModalField
        label="메모 (선택)"
        variant="text"
        value={memo}
        onChange={(event) => setMemo(event.target.value)}
        placeholder="예) 발표 자료 포함, 조사 범위 등 메모를 남겨두세요"
      />
    </AppModal>
  );
}
