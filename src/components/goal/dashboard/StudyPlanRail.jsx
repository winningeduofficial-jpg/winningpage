import { useCallback, useEffect, useState } from "react";
import {
  createGoalPlanTask,
  deleteGoalPlanTask,
  fetchGoalPlanTasks,
  updateGoalPlanTask,
} from "../../../lib/goalApi";
import {
  durationLabelToMinutes,
  getTodayWeekdayLabel,
  getWeekDates,
  kstYMD,
} from "../../../lib/goalPlanUtils";
import GoalCard from "../GoalCard";
import GoalChecklistRow from "../GoalChecklistRow";
import GoalEmptyState from "../GoalEmptyState";
import AddTaskModal from "../modals/AddTaskModal";

// 우측 레일 "OO요일 나의 학습 계획하기" 카드 — 데이터 유무에 따라 194↔342 가변(part-07 §272).
// 절대 좌표 대신 flex column + gap 20px(부모 GoalDashboard 레일 스택)로 쌓는다.
//
// 단계 E(임무 지시) 배선: 이 위젯이 스스로 오늘(GET /api/goal/plan-tasks?from=to=오늘) 과제를
// 소유·조회한다(모달 오픈 상태를 스스로 소유하던 기존 관례를 데이터에도 그대로 확장 — 부모
// Dashboard.jsx를 건드리지 않는다). 체크(✓)는 완료 토글 PUT, ✕는 삭제 DELETE — 둘 다
// 낙관적 갱신 후 실패 시 되돌린다(콘솔 에러 로그 + 재조회로 복구).
export default function StudyPlanRail() {
  const [modalOpen, setModalOpen] = useState(false);
  // null = 로딩 중. 이후 discriminated union('success'|'not-allowed'|'error'|...) 그대로 보관.
  const [result, setResult] = useState(null);
  const today = kstYMD();

  const loadTasks = useCallback(() => {
    fetchGoalPlanTasks({ from: today, to: today }).then(setResult);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const tasks = result?.kind === "success" ? result.tasks : [];
  const hasTasks = tasks.length > 0;

  async function handleCheck(task) {
    const nextDone = !task.done;
    // 낙관적 갱신 — 목록 안의 해당 id만 done을 뒤집는다.
    setResult((prev) =>
      prev?.kind === "success"
        ? {
            ...prev,
            tasks: prev.tasks.map((t) =>
              t.id === task.id ? { ...t, done: nextDone } : t,
            ),
          }
        : prev,
    );

    const updated = await updateGoalPlanTask(task.id, { done: nextDone });
    if (updated.kind !== "success") {
      console.error("[StudyPlanRail] 완료 토글 실패:", updated);
      loadTasks(); // 서버 상태로 복구
    }
  }

  async function handleDelete(task) {
    const snapshot = tasks;
    setResult((prev) =>
      prev?.kind === "success"
        ? { ...prev, tasks: prev.tasks.filter((t) => t.id !== task.id) }
        : prev,
    );

    const deleted = await deleteGoalPlanTask(task.id);
    if (deleted.kind !== "success") {
      console.error("[StudyPlanRail] 삭제 실패:", deleted);
      setResult((prev) =>
        prev?.kind === "success" ? { ...prev, tasks: snapshot } : prev,
      );
    }
  }

  // "일정" 셀렉트 해석은 WeeklyPlan.jsx와 동일하다(판단 기록 — sql/75 헤더 주석 참고):
  // "오늘만"은 오늘 1건, "이번 주만"/"매주 반복"은 이번 주(월~일) 7건.
  async function handleTaskSubmit({ subject, taskText, duration, schedule }) {
    const targetDates = schedule === "오늘만" ? [today] : getWeekDates(0);
    const durationMinutes = durationLabelToMinutes(duration);

    const results = await Promise.all(
      targetDates.map((planDate) =>
        createGoalPlanTask({
          planDate,
          title: taskText,
          subject,
          durationMinutes,
        }),
      ),
    );

    const failed = results.filter((r) => r.kind !== "success");
    if (failed.length > 0) {
      console.error("[StudyPlanRail] 일부 과제 생성 실패:", failed);
    }

    loadTasks();

    if (failed.length === targetDates.length) {
      throw new Error("과제 생성에 실패했습니다.");
    }
  }

  // "오늘 학습 계획 저장하기" — 체크/삭제가 이미 개별 즉시 저장(PUT/DELETE)이라 이 버튼이
  // 다시 저장할 미확정 상태가 없다(임무 지시 판단 위임 절). 최신 서버 상태를 다시 끌어와
  // "저장 확인/새로고침" 역할로 재배정한다(판단 기록).
  function handleRefresh() {
    setResult(null);
    loadTasks();
  }

  return (
    <GoalCard
      tone="mint"
      className="flex flex-col gap-4 px-[1.25rem] py-[1.25rem]"
    >
      <h3 className="text-[1rem] font-bold leading-[1.4] text-ink-strong">
        {getTodayWeekdayLabel()} 나의 학습 계획하기
      </h3>

      {/* not-allowed(미결제)·no-session 등은 이 위젯이 스스로 처리하지 않는다 — RequireGoalAccess가
          대시보드 라우트를 이미 3단계 게이트로 감싸므로(Dashboard.jsx §154 주석과 동일 전제) 정상
          경로에선 도달하지 않는 방어적 분기다. */}
      {result === null ? (
        <p className="py-6 text-center text-[0.8125rem] leading-[1.4] text-ink-sub">
          불러오는 중…
        </p>
      ) : result.kind !== "success" ? (
        <p className="py-6 text-center text-[0.8125rem] leading-[1.4] text-ink-sub">
          불러오지 못했습니다. 새로고침해 주세요.
        </p>
      ) : hasTasks ? (
        <>
          <ul className="flex flex-col gap-2">
            {tasks.map((task, index) => (
              <GoalChecklistRow
                key={task.id}
                index={index + 1}
                text={task.title}
                status={task.done ? "done" : "pending"}
                onCheck={() => handleCheck(task)}
                onDelete={() => handleDelete(task)}
              />
            ))}
          </ul>
          {/* part-06 §279: "+ 버튼을 눌러 과제를 추가하세요"는 행이 있어도 상시 노출되는 안내문 —
              실제 + 버튼 노드는 시안에 없어 텍스트 자체를 클릭 가능한 트리거로 만들었다(추정). */}
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="text-center text-[0.75rem] leading-[1.4] text-ink-sub underline-offset-2 hover:underline"
          >
            + 버튼을 눌러 과제를 추가하세요
          </button>
          <button
            type="button"
            onClick={handleRefresh}
            className="h-[2.375rem] w-full rounded-lg bg-[#4CAF6D] text-[0.875rem] font-semibold leading-[1.4] text-white"
          >
            오늘 학습 계획 저장하기
          </button>
        </>
      ) : (
        <GoalEmptyState
          message="+ 버튼을 눌러 과제를 추가하세요"
          onAdd={() => setModalOpen(true)}
        />
      )}

      <AddTaskModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={handleTaskSubmit}
      />
    </GoalCard>
  );
}
