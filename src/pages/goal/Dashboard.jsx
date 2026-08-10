import DashboardPageHeader from '../../components/goal/dashboard/DashboardPageHeader';
import TodayGoalCard from '../../components/goal/dashboard/TodayGoalCard';
import AdviceCard from '../../components/goal/dashboard/AdviceCard';
import TomorrowPlanCard from '../../components/goal/dashboard/TomorrowPlanCard';
import MockExamCard from '../../components/goal/dashboard/MockExamCard';
import NaesinCard from '../../components/goal/dashboard/NaesinCard';
import AchievementChart from '../../components/goal/dashboard/AchievementChart';
import TargetUniversityRail from '../../components/goal/dashboard/TargetUniversityRail';
import StudyPlanRail from '../../components/goal/dashboard/StudyPlanRail';
import ScheduleRail from '../../components/goal/dashboard/ScheduleRail';
import RankingRail from '../../components/goal/dashboard/RankingRail';
import {
  mockDailyGoal,
  mockAdvice,
  mockTargetUniversities,
  mockTodayPlan,
  mockSchedules,
  mockRanking,
  mockAchievementChart
} from '../../data/goalMock';

// 목표관리 대시보드(#20 정본) 본문 — docs/figma-goal/00-INDEX.md §3 G2 / §5-4 / §6-3.
//
// 3존 레이아웃: 사이드바(GoalAppLayout 담당) │ 메인 1076px(67.25rem) │ 우측 레일 372px(23.25rem).
// 페이지 헤더(뱃지+날짜 기준+헤딩, `DashboardPageHeader`)는 메인+레일 2열 그리드의 1행에
// 메인 컬럼(col 1)만 차지하도록 배치한다(part-07 #20 세로 흐름표 — 뱃지/헤딩은 x=372~1065,
// 레일까지 가로지르지 않음). 메인 콘텐츠와 레일은 2행에 나란히 배치돼 같은 행 시작선을 공유하므로
// 우측 레일 첫 카드(y=272)가 메인 컬럼 첫 카드(오늘의 목표, y=271)와 자연스럽게 같은 높이에서
// 시작한다 — 헤더 높이만큼의 하드코딩 오프셋(구 pt-[10.6875rem]) 없이 grid row-gap만으로 해결.
// 1행→2행 간격(4.875rem = 78px)은 헤더 하단(y193)~메인 첫 카드(y271) 실측 간격 그대로다.
// 메인 세로 스택: 헤더 → 오늘의 목표 → 오늘의 조언/내일 계획 제시(2열) → 모의고사/내신(2열) →
// 학업 성취도 변화 추이. 우측 레일: 이상/최소 목표대학 → 학습 계획 → 중요일정 → 학습 순위, 전부
// flex column + gap(카드 세로 간격 20px = 1.25rem)으로 쌓아 가변 높이 카드를 절대 좌표 없이
// 수용한다(학습 계획 194↔342, 중요일정 194↔278).
//
// 조언 유형("일일 분석 조언" ↔ "AI 입시 분석 조언") 상태 축은 `DashboardPageHeader`의
// `adviceType` prop으로 옮겼다(part-06 #17/#18 뱃지 변형). 기본 렌더는 "오늘 기록 있음"(#20) ·
// adviceType="ai" · "차트 데이터 있음"(#15) 상태다. 다른 두 축(#12 미기록, #13 빈 차트)을
// 확인하려면 goalMock.js의 `mockDailyGoalEmpty`, `mockAchievementChartEmpty`로 아래 props만
// 바꿔 끼우면 된다 — 각 위젯이 데이터 유무로 상태를 스스로 분기하므로 컴포넌트 코드는 수정할
// 필요가 없다.
export default function Dashboard() {
  const advice = mockAdvice.ai;

  // 좌우 패딩(px-[3rem], 양쪽 합 6rem)을 바깥 래퍼로 옮긴다 — 기존엔 패딩이 max-w-goal-dashboard와
  // 같은 요소에 있어 그리드가 쓸 수 있는 가용 폭이 93rem - 6rem = 87rem으로 줄었는데, 자식 그리드는
  // `grid-cols-[67.25rem_23.25rem] gap-x-[2.5rem]` = 93rem 고정이라 6rem이 컨테이너를 넘쳤다
  // (결함2). 이제 max-w-goal-dashboard는 패딩의 영향을 받지 않는 안쪽 컨테이너에 붙어 93rem을
  // 온전히 쓴다. `max-w-goal-dashboard` 토큰 값(93rem) 자체는 그대로 둔다.
  return (
    <div className="px-[3rem] pb-24 pt-[6.25rem]">
      <div className="max-w-goal-dashboard">
        <div className="grid grid-cols-[67.25rem_23.25rem] gap-x-[2.5rem] gap-y-[4.875rem]">
          <DashboardPageHeader
            adviceType="ai"
            dateLabel={mockDailyGoal.dateLabel}
            headline={advice.headline}
            className="col-start-1 row-start-1"
          />

          <div className="col-start-1 row-start-2 flex min-w-0 flex-col gap-[1.25rem]">
            <TodayGoalCard data={mockDailyGoal} />

            <div className="flex gap-[1rem]">
              <div className="w-[33.125rem]">
                <AdviceCard data={advice} />
              </div>
              <div className="w-[33.125rem]">
                <TomorrowPlanCard plan={mockDailyGoal.tomorrowPlan} />
              </div>
            </div>

            <div className="flex gap-[1rem]">
              <div className="w-[33.125rem]">
                <MockExamCard data={mockAdvice.mockExam} />
              </div>
              <div className="w-[33.125rem]">
                <NaesinCard data={mockAdvice.naesin} />
              </div>
            </div>

            <AchievementChart data={mockAchievementChart} />
          </div>

          <div className="col-start-2 row-start-2 flex min-w-0 flex-col gap-[1.25rem]">
            <TargetUniversityRail data={mockTargetUniversities} />
            <StudyPlanRail tasks={mockTodayPlan} />
            <ScheduleRail schedules={mockSchedules} />
            <RankingRail ranking={mockRanking} />
          </div>
        </div>
      </div>
    </div>
  );
}
