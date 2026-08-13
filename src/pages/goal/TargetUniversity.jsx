import GoalPageHeader from "../../components/goal/GoalPageHeader";
import TargetUniversityCard from "../../components/goal/study/TargetUniversityCard";
import GapToTargetCard from "../../components/goal/study/GapToTargetCard";
import { mockTargetUniversities } from "../../data/goalMock";

// 내 목표 대학(#24) — 이상/최소 목표 대학 2카드(680×348) + 목표까지 남은 격차 3행.
// 대학명·합격률은 대시보드 계열이 정본이라 src/data/goalMock.js의 `mockTargetUniversities`를
// 그대로 쓴다(읽기만 — goalMock.js는 다른 배치와 공유하는 파일이라 수정 금지). `mockAdmissionChance`는
// 성장 리포트 전용 별도 계열이라 여기서 쓰지 않는다.
//
// 편집 UI 미정의: 서브카피가 "목표를 바꾸면 격차 분석과 학습 시간이 다시 계산돼요"라 편집 진입점이
// 필요해 보이지만 시안(#24)에는 편집 버튼·모달이 전혀 없다(part-08 §331 "별도 확정 필요").
// 이번 구현은 읽기 전용으로 처리한다.
export default function TargetUniversity() {
  const { upper, lower, gapToTarget } = mockTargetUniversities;

  return (
    <>
      <GoalPageHeader
        title="내 목표 대학"
        subcopy="이상 목표와 최소 목표를 이원으로 관리합니다. 목표를 바꾸면 격차 분석과 학습 시간이 다시 계산돼요."
      />
      <div className="max-w-goal-content flex flex-col gap-5 px-[3rem] pb-24">
        <div className="grid grid-cols-2 gap-5">
          <TargetUniversityCard
            label={upper.label}
            university={upper.university}
            department={upper.department}
            susiRate={upper.susiRate}
            jeongsiRate={upper.jeongsiRate}
          />
          <TargetUniversityCard
            label={lower.label}
            university={lower.university}
            department={lower.department}
            susiRate={lower.susiRate}
            jeongsiRate={lower.jeongsiRate}
          />
        </div>
        <GapToTargetCard rows={gapToTarget} />
      </div>
    </>
  );
}
