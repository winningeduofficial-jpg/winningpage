import { useState } from "react";
import AppModal from "@/components/goal/AppModal";
import ModalField from "@/components/goal/ModalField";
import SegmentedChipGroup from "@/components/goal/SegmentedChipGroup";
import { goalModalOptions } from "@/data/goalMock";

// 과제 추가 모달 — docs/figma-goal/part-06.md #16 (530×468 = 33.125rem × 29.25rem, 높이는 주석용).
// 트리거: StudyPlanRail("+")·주간 학습 계획표 컬럼 "+ 추가".
//
// 실 저장은 호출부의 onSubmit이 담당한다(이 컴포넌트는 폼 상태·검증만 소유) — 호출부마다
// "일정(오늘만/이번 주만/매주 반복)"을 몇 개의 plan_date로 펼칠지가 다르기 때문이다
// (StudyPlanRail은 항상 오늘 기준, WeeklyPlan은 화살표로 이동한 임의의 주 기준 —
// src/lib/goalPlanUtils.js). onSubmit 미지정 시 콘솔 로그로 물러난다(단계 E 이전 호출부 보호).
const SUBJECT_OPTIONS = goalModalOptions.taskSubjects.map((label) => ({
  value: label,
  label,
}));
const DURATION_OPTIONS = goalModalOptions.taskDurations.map((label) => ({
  value: label,
  label,
}));
const SCHEDULE_OPTIONS = goalModalOptions.taskSchedules.map((label) => ({
  value: label,
  label,
}));

// 시안(#16) 실측 표시값 — 옵션 목록엔 없던 값이라도 셀렉트 기본값으로 그대로 채택.
const DEFAULT_DURATION = "1시간 30분";
const DEFAULT_SCHEDULE = "이번 주만";

// Date#getDay() 인덱스(0=일요일 ~ 6=토요일) 순 요일명 — WeekdayPlanBoard의 DAY_KEY와 동일 표기.
const WEEKDAY_NAMES = [
  "일요일",
  "월요일",
  "화요일",
  "수요일",
  "목요일",
  "금요일",
  "토요일",
];

function getTodayLabel() {
  return WEEKDAY_NAMES[new Date().getDay()];
}

type AddTaskModalSubmitPayload = {
  subject: string | null;
  taskText: string;
  duration: string;
  schedule: string;
};

type AddTaskModalProps = {
  open: boolean;
  onClose: () => void;
  day?: string;
  onSubmit?: (payload: AddTaskModalSubmitPayload) => void | Promise<void>;
};

// day prop 미지정 호출부(StudyPlanRail 등 대시보드 트리거)는 오늘 요일을 기본값으로 쓴다.
// onSubmit({ subject, taskText, duration, schedule })는 async여도 된다 — 완료될 때까지
// 버튼을 disabled로 막아 이중 제출을 막는다. reject하면 폼을 유지한 채(닫지 않고) 콘솔에만
// 에러를 남긴다 — 네트워크 실패로 입력을 날리지 않기 위해서다.
export default function AddTaskModal({
  open,
  onClose,
  day = getTodayLabel(),
  onSubmit,
}: AddTaskModalProps) {
  // 시안은 "수학" 칩이 이미 선택된 상태로 그려져 있지만, 그건 스크린샷용 데모 상태다.
  // 확정 사항 §4(필수값 미입력 시 저장 버튼 disabled)를 실제로 보여주려면 빈 상태로 시작해야 한다.
  const [subject, setSubject] = useState<string | null>(null);
  const [taskText, setTaskText] = useState("");
  const [duration, setDuration] = useState(DEFAULT_DURATION);
  const [schedule, setSchedule] = useState(DEFAULT_SCHEDULE);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit =
    Boolean(subject) && taskText.trim().length > 0 && !submitting;

  function resetForm() {
    setSubject(null);
    setTaskText("");
    setDuration(DEFAULT_DURATION);
    setSchedule(DEFAULT_SCHEDULE);
    setSubmitting(false);
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  async function handleSubmit() {
    if (!canSubmit) return;

    if (!onSubmit) {
      // onSubmit 미지정 호출부 방어선 — 정상 경로에선 도달하지 않는다(모든 호출부가 배선 완료).
      console.log("[AddTaskModal] submit (no onSubmit handler)", {
        subject,
        taskText,
        duration,
        schedule,
      });
      handleClose();
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({ subject, taskText, duration, schedule });
      handleClose();
    } catch (error) {
      console.error("[AddTaskModal] onSubmit 실패:", error);
      setSubmitting(false);
    }
  }

  return (
    <AppModal
      open={open}
      onClose={handleClose}
      title="과제 추가"
      subtitle={`${day} 학습 계획에 추가할 과제를 입력하세요`}
      cancelLabel="취소"
      onCancel={handleClose}
      submitLabel={submitting ? "추가하는 중…" : "과제 추가하기"}
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
        label="할 일"
        variant="text"
        value={taskText}
        onChange={(event) => setTaskText(event.target.value)}
        placeholder="예) 미적분 3단원 문제 30개"
        required
      />

      <div className="grid grid-cols-2 gap-2">
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
