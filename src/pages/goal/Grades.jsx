import { useState } from 'react';
import GoalPageHeader from '../../components/goal/GoalPageHeader';
import GoalGaugeCard from '../../components/goal/report/GoalGaugeCard';
import GoalTable from '../../components/goal/report/GoalTable';
import AddNaesinGradeModal from '../../components/goal/modals/AddNaesinGradeModal';
import AddMockExamGradeModal from '../../components/goal/modals/AddMockExamGradeModal';
import { mockGrades } from '../../data/goalMock';

// 성적 관리(#35) + 내신 성적 추가 모달(#36) — 내신·모의고사 회차별 표 2개 + 상단 목표 격차 KPI
// 게이지 2장. `mockGrades`(goalMock.js, 기존)를 그대로 재사용한다 — 새 목업 파일에 중복 정의하지
// 않는다.
//
// 결함13(part-12 §243): KPI 카드②의 원본 라벨이 `내신`인데 단위는 `백분위`였다 — `모의고사`가
// 맞다(추정). 아래 label="모의고사"로 정정 반영.
//
// 모의고사 표의 `+ 회차 추가`는 기존 `AddMockExamGradeModal`(part-08 #22, dashboard 모달 3종
// 중 1개)을 그대로 재사용한다 — part-12 §309가 "모의고사 표의 + 회차 추가 대응 모달은 이 파트에
// 없다, part-08.md #22에 별도 존재"라고 명시한 바로 그 모달이라 중복 생성하지 않는다.
export default function Grades() {
  const [naesinModalOpen, setNaesinModalOpen] = useState(false);
  const [mockModalOpen, setMockModalOpen] = useState(false);

  return (
    <>
      <GoalPageHeader
        title="성적 관리"
        subcopy="내신과 모의고사를 회차별로 기록하면 목표와의 격차가 자동 계산됩니다."
      />
      <div className="max-w-goal-content flex flex-col gap-8 px-[3rem] pb-24">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <GoalGaugeCard
            label="내신"
            round={mockGrades.naesin.kpi.round}
            value={mockGrades.naesin.kpi.value}
            unit={mockGrades.naesin.kpi.unit}
            delta={mockGrades.naesin.kpi.delta}
            targetLabel={mockGrades.naesin.kpi.targetLabel}
            remaining={mockGrades.naesin.kpi.remaining}
            lowerIsBetter
          />
          <GoalGaugeCard
            label="모의고사" // 결함13 정정 (원본 라벨 '내신' — 추정)
            round={mockGrades.mock.kpi.round}
            value={mockGrades.mock.kpi.value}
            unit={mockGrades.mock.kpi.unit}
            delta={mockGrades.mock.kpi.delta}
            targetLabel={mockGrades.mock.kpi.targetLabel}
            remaining={mockGrades.mock.kpi.remaining}
          />
        </div>

        <GoalTable
          title={mockGrades.naesin.title}
          rows={mockGrades.naesin.rows}
          onAddRound={() => setNaesinModalOpen(true)}
          lowerIsBetter={true}
        />
        <GoalTable
          title={mockGrades.mock.title}
          rows={mockGrades.mock.rows}
          onAddRound={() => setMockModalOpen(true)}
          lowerIsBetter={false}
        />

        {/* 행 수정/삭제 UI는 시안에 없다(part-12 §235) — 이번 범위에서 의도적으로 미구현. */}
      </div>

      <AddNaesinGradeModal open={naesinModalOpen} onClose={() => setNaesinModalOpen(false)} />
      <AddMockExamGradeModal open={mockModalOpen} onClose={() => setMockModalOpen(false)} />
    </>
  );
}
