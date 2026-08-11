import { useState } from 'react';
import AppModal from '../AppModal';
import ModalField from '../ModalField';
import SegmentedChipGroup from '../SegmentedChipGroup';
import { goalModalOptions } from '../../../data/goalMock';

// 과제 추가 모달 — docs/figma-goal/part-06.md #16 (530×468 = 33.125rem × 29.25rem, 높이는 주석용).
// 트리거: StudyPlanRail("+")·주간 학습 계획표 컬럼 "+ 추가"(이번 범위는 StudyPlanRail만).
const SUBJECT_OPTIONS = goalModalOptions.taskSubjects.map((label) => ({ value: label, label }));
const DURATION_OPTIONS = goalModalOptions.taskDurations.map((label) => ({ value: label, label }));
const SCHEDULE_OPTIONS = goalModalOptions.taskSchedules.map((label) => ({ value: label, label }));

// 시안(#16) 실측 표시값 — 옵션 목록엔 없던 값이라도 셀렉트 기본값으로 그대로 채택.
const DEFAULT_DURATION = '1시간 30분';
const DEFAULT_SCHEDULE = '이번 주만';

// Date#getDay() 인덱스(0=일요일 ~ 6=토요일) 순 요일명 — WeekdayPlanBoard의 DAY_KEY와 동일 표기.
const WEEKDAY_NAMES = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];

function getTodayLabel() {
  return WEEKDAY_NAMES[new Date().getDay()];
}

// day prop 미지정 호출부(StudyPlanRail 등 대시보드 트리거)는 오늘 요일을 기본값으로 쓴다.
export default function AddTaskModal({ open, onClose, day = getTodayLabel() }) {
  // 시안은 "수학" 칩이 이미 선택된 상태로 그려져 있지만, 그건 스크린샷용 데모 상태다.
  // 확정 사항 §4(필수값 미입력 시 저장 버튼 disabled)를 실제로 보여주려면 빈 상태로 시작해야 한다.
  const [subject, setSubject] = useState(null);
  const [taskText, setTaskText] = useState('');
  const [duration, setDuration] = useState(DEFAULT_DURATION);
  const [schedule, setSchedule] = useState(DEFAULT_SCHEDULE);

  const canSubmit = Boolean(subject) && taskText.trim().length > 0;

  function resetForm() {
    setSubject(null);
    setTaskText('');
    setDuration(DEFAULT_DURATION);
    setSchedule(DEFAULT_SCHEDULE);
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  function handleSubmit() {
    if (!canSubmit) return;
    // 목업 스텁 — 실제 저장/API 연동 금지(확정 사항 §1). 콘솔 로그 + 모달 닫기만 수행.
    console.log('[AddTaskModal] submit', { subject, taskText, duration, schedule });
    handleClose();
  }

  return (
    <AppModal
      open={open}
      onClose={handleClose}
      title="과제 추가"
      subtitle={`${day} 학습 계획에 추가할 과제를 입력하세요`}
      cancelLabel="취소"
      onCancel={handleClose}
      submitLabel="과제 추가하기"
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
        label="할 일"
        variant="text"
        value={taskText}
        onChange={(event) => setTaskText(event.target.value)}
        placeholder="예) 미적분 3단원 문제 30개"
        required
      />

      <div className="grid grid-cols-2 gap-[0.5rem]">
        <ModalField
          label="예상 소요 시간"
          variant="select"
          value={duration}
          onChange={(event) => setDuration(event.target.value)}
          options={DURATION_OPTIONS}
        />
        <ModalField
          label="일정"
          variant="select"
          value={schedule}
          onChange={(event) => setSchedule(event.target.value)}
          options={SCHEDULE_OPTIONS}
        />
      </div>
    </AppModal>
  );
}
