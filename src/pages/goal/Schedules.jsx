import { useState } from 'react';
import GoalPageHeader from '../../components/goal/GoalPageHeader';
import GoalEmptyState from '../../components/goal/GoalEmptyState';
import ScheduleListCard from '../../components/goal/plan/ScheduleListCard';
import AddScheduleFullModal from '../../components/goal/modals/AddScheduleFullModal';
import { mockSchedules } from '../../data/goalMock';

// 중요일정(#41 목록 정본 / #40 등록 모달 정본, 530×624) — docs/figma-goal/part-14.md.
// mockSchedules(goalMock.js)가 #41 카피 전문과 1:1 동일해 그대로 재사용한다(신규 목업 불필요).
export default function Schedules() {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null); // null=신규 등록, 값 있으면 수정 프리필

  const hasSchedules = Array.isArray(mockSchedules) && mockSchedules.length > 0;

  function openCreate() {
    setEditing(null);
    setModalOpen(true);
  }

  function openEdit(schedule) {
    // 시안엔 수정 모달 상태가 없다(part-14 §164 "수정용 시안 없음, 추정") — 동일 등록 모달을
    // 값이 채워진 상태로 재사용한다는 문서 추정을 그대로 구현한다. 다만 카드의 `meta`가
    // "8월 2일 · 발표 자료 포함" 같은 조합 표시 문자열이라 <input type="date"> 값으로 역파싱할
    // 근거가 없어 마감일은 프리필하지 않는다. // 미확정
    setEditing({ scheduleType: null, title: schedule.title, dueDate: '', memo: schedule.meta });
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditing(null);
  }

  return (
    <>
      <GoalPageHeader
        title="중요일정"
        subcopy="시험·수행평가·제출 마감을 등록하면 D-day로 알려드려요."
        actions={
          <button
            type="button"
            onClick={openCreate}
            className="h-[2.4375rem] rounded-lg bg-[#2E2A26] px-4 text-[0.875rem] font-semibold text-white transition-colors hover:opacity-90"
          >
            일정 등록
          </button>
        }
      />

      <div className="max-w-goal-content px-[3rem] pb-24">
        {/* 카드 리스트는 시안 실측 폭 1116px(69.75rem)을 그대로 따른다 — 헤더는 앱 표준
            1340px(GoalPageHeader 기본값)을 유지하고, 이 리스트만 지시받은 폭으로 좁힌다
            (00-INDEX.md가 여러 화면에서 "1340으로 통일 권장"이라 문서 스스로 밝힌 방식). */}
        {hasSchedules ? (
          <ul className="flex max-w-[69.75rem] flex-col gap-[1.25rem]">
            {mockSchedules.map((schedule) => (
              <li key={schedule.title}>
                <ScheduleListCard schedule={schedule} onEdit={() => openEdit(schedule)} />
              </li>
            ))}
          </ul>
        ) : (
          // 빈 상태(0건) 시안이 없다(part-14 §231) — GoalEmptyState로 근사 구현. // (추정)
          <GoalEmptyState message="+ 버튼을 눌러 중요일정을 등록하세요" onAdd={openCreate} />
        )}
      </div>

      <AddScheduleFullModal open={modalOpen} onClose={closeModal} initial={editing} />
    </>
  );
}
