import { useEffect, useState } from 'react';
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
import GoalCard from '../../components/goal/GoalCard';
import {
  mockAdvice,
  mockTodayPlan,
  mockRanking,
  mockAchievementChart,
  mockDailyGoalEmpty
} from '../../data/goalMock';
import { fetchGoalSchedules, fetchGoalStudent } from '../../lib/goalApi';
import { formatScheduleDday, formatScheduleMeta } from '../../lib/goal/scheduleDday';
import { kstYMD } from '../../lib/goal/calc/index.js';

// ---------------------------------------------------------------------------
// GET /api/goal/student → 4개 실데이터 카드(TargetUniversityRail/MockExamCard/
// NaesinCard/TodayGoalCard) prop 매핑. api/_lib/goalRepo.js buildStudentPayload()
// 반환 shape을 기준으로 한다(임무 지시 "서버 계약" 절 그대로, 코드로 재확인 완료).
//
// 확률 스케일 확인: src/lib/goal/calc/pipeline.test.js가 idealSusi===100(포화)을
// 검증하므로 probs.* 는 0~100 스케일이다 — TargetUniversityRail의 susiRate/jeongsiRate
// (GoalProgressBar max=100, `{value}%`로 직접 렌더)와 스케일이 이미 일치해 변환은
// "반올림"뿐이다(소수점 노출 방지, 표시 목적).
// ---------------------------------------------------------------------------

/** null-safe 반올림 — 확률 필드는 num()이 null을 낼 수 있어(§goalRepo.js num()) 0으로 접는다. */
function pctRound(value) {
  return Math.round(value ?? 0);
}

function mapTargetUniversities(student) {
  // jungsiAvailable(goalRepo.js buildStudentPayload, §7-1-A)은 정시 컷 쌍(상한·하한)이
  // 둘 다 있을 때만 true다 — 이상/최소 목표대학에 공통으로 적용되는 단일 플래그다.
  // false면 calcJeongsiProb 쪽 파이프라인이 이미 0을 낸다(pipeline.js:227-228)지만,
  // 그 0은 "가망 없음"이 아니라 "정시 컷 미확보"다. TargetUniversityRail의 RateRow가
  // 이 플래그로 값 자리를 "미산출"로 바꿔 실제 0%와 구분한다(이번 UoW가 메운 지점).
  const { jungsiAvailable } = student;
  return {
    upper: {
      label: '이상목표대학',
      university: student.targets.ideal.university,
      department: student.targets.ideal.department,
      susiRate: pctRound(student.probs.idealSusi),
      jeongsiRate: pctRound(student.probs.idealJungsi),
      jungsiAvailable
    },
    lower: {
      label: '최소목표대학',
      university: student.targets.min.university,
      department: student.targets.min.department,
      susiRate: pctRound(student.probs.minSusi),
      jeongsiRate: pctRound(student.probs.minJungsi),
      jungsiAvailable
    }
  };
}

function mapMockExam(student) {
  const { lastMogoExam, currentMogo } = student.scores;
  return {
    // lastMogoExam 라벨은 api/goal/intake.js MOCK_ROUNDS와 동일('3모'/'6모'/'9모'/'10모').
    round: lastMogoExam ? `${lastMogoExam} 모의고사` : '모의고사 기록 없음',
    // 모의고사 카드는 D-day 소스가 없다(회차 일정 테이블 자체가 미생성 — 중요일정과 달리
    // 실데이터 전환 대상이 아니다) — undefined로 두면 GoalDdayBadge가 빈 뱃지를 렌더한다
    // (React는 undefined 자식을 그리지 않는다). 가짜 날짜를 지어내지 않기 위한 선택.
    dday: undefined,
    metricLabel: '현재 종합 백분위',
    metricValue: currentMogo != null ? currentMogo : '기록 없음',
    // AI 조언 생성 로직은 이식 대상이 아니다(docs/figma-goal/calc-port-status.md §9.2,
    // AdviceCard와 동일 사유) — 실데이터인 척 숫자를 만들어 넣지 않고 준비 중 문구로 둔다.
    advice: '학습 조언은 준비 중입니다.'
  };
}

/**
 * 우측 레일 "중요일정 체크하기" 카드용 — 오늘(KST) 이후(오늘 포함) 마감일 중 가장 가까운
 * 3건. 지난 일정은 이 위젯(체크리스트 목적)에서 제외한다 — 전체 이력은
 * Schedules.jsx(/app/goal/schedules)가 담당한다(이번 UoW 판단 지점).
 */
function mapNearestSchedules(schedules, now = new Date()) {
  const today = kstYMD(now);
  return [...(schedules || [])]
    .filter((schedule) => schedule.dueDate >= today)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 3)
    .map((schedule) => ({
      ...schedule,
      dday: formatScheduleDday(schedule.dueDate, now),
      meta: formatScheduleMeta(schedule.dueDate, schedule.memo)
    }));
}

function mapNaesin(student) {
  const { lastNaesinExam, convertedGrade } = student.scores;
  return {
    // NAESIN_ROUNDS 라벨 그대로('1학기 중간'/'1학기 기말'/'2학기 중간'/'2학기 기말').
    round: lastNaesinExam || '내신 기록 없음',
    metricLabel: '현재 내신 평균',
    metricValue: convertedGrade != null ? `${convertedGrade.toFixed(2)} 등급 (9등급 환산)` : '기록 없음',
    advice: '학습 조언은 준비 중입니다.'
  };
}

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

  // fetchGoalStudent() 결과를 discriminated union 그대로 보관한다(재가공하지 않는다 —
  // goalApi.js의 kind 계약을 이 컴포넌트가 다시 해석하는 지점을 하나로 좁혀 둔다).
  // null = 아직 응답 도착 전(로딩 중). RequireGoalAccess가 이미 onboarded:true만
  // 통과시키므로 정상 경로에선 result.kind는 항상 'onboarded'다 — 그 외 kind는
  // 전부 직접 URL 진입·세션 경쟁 상태 같은 방어적 분기다.
  const [result, setResult] = useState(null);

  // ScheduleRail(우측 레일 "중요일정 체크하기") 전용 — student 판정과 무관하게 독립 조회한다.
  // null = 로딩 중. 실패 시 빈 배열로 접는다 — 이 카드는 student처럼 페이지 전체를 막는
  // 필수 데이터가 아니라 조회 실패를 mock으로 되돌리지 않고 그냥 빈 상태로 보여준다.
  const [schedules, setSchedules] = useState(null);

  useEffect(() => {
    let alive = true;
    fetchGoalStudent().then((r) => {
      if (alive) setResult(r);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    fetchGoalSchedules().then((r) => {
      if (!alive) return;
      setSchedules(r.kind === 'success' ? r.schedules : []);
    });
    return () => {
      alive = false;
    };
  }, []);

  // 좌우 패딩(px-[3rem], 양쪽 합 6rem)을 바깥 래퍼로 옮긴다 — 기존엔 패딩이 max-w-goal-dashboard와
  // 같은 요소에 있어 그리드가 쓸 수 있는 가용 폭이 93rem - 6rem = 87rem으로 줄었는데, 자식 그리드는
  // `grid-cols-[67.25rem_23.25rem] gap-x-[2.5rem]` = 93rem 고정이라 6rem이 컨테이너를 넘쳤다
  // (결함2). 이제 max-w-goal-dashboard는 패딩의 영향을 받지 않는 안쪽 컨테이너에 붙어 93rem을
  // 온전히 쓴다. `max-w-goal-dashboard` 토큰 값(93rem) 자체는 그대로 둔다.
  const outerClassName = 'px-[3rem] pb-24 pt-[6.25rem]';

  if (result === null) {
    return (
      <div className={outerClassName}>
        <div className="max-w-goal-dashboard">
          <GoalCard tone="neutral" className="px-[2rem] py-[1.75rem]">
            <p className="text-[0.9375rem] leading-[1.4] text-ink-sub">대시보드를 불러오는 중입니다…</p>
          </GoalCard>
        </div>
      </div>
    );
  }

  // 방어적 분기 — 정상 경로에선 RequireGoalAccess가 이미 걸러 여기 도달하지 않는다
  // (no-session/not-allowed/not-onboarded/awaiting-cuts는 3단계 게이트 대상,
  // error는 hasEntitlement 계열과 동일하게 "판정 불가"다). 크래시 대신 안내만 하고
  // 게이트가 다음 진입 때 다시 판정하도록 둔다 — 여기서 직접 리다이렉트하지 않는다.
  if (result.kind !== 'onboarded') {
    const message =
      result.kind === 'awaiting-cuts'
        ? '합격 기준 데이터를 준비 중입니다. 잠시 후 다시 확인해 주세요.'
        : '대시보드 데이터를 불러오지 못했습니다. 새로고침해 주세요.';
    return (
      <div className={outerClassName}>
        <div className="max-w-goal-dashboard">
          <GoalCard tone="neutral" className="px-[2rem] py-[1.75rem]">
            <p className="text-[0.9375rem] leading-[1.4] text-ink-sub">{message}</p>
          </GoalCard>
        </div>
      </div>
    );
  }

  const { student } = result;
  const targetUniversities = mapTargetUniversities(student);
  const mockExamData = mapMockExam(student);
  const naesinData = mapNaesin(student);

  return (
    <div className={outerClassName}>
      <div className="max-w-goal-dashboard">
        <div className="grid grid-cols-[67.25rem_23.25rem] gap-x-[2.5rem] gap-y-[4.875rem]">
          <DashboardPageHeader
            adviceType="ai"
            dateLabel={mockDailyGoalEmpty.dateLabel}
            headline={advice.headline}
            className="col-start-1 row-start-1"
          />

          <div className="col-start-1 row-start-2 flex min-w-0 flex-col gap-[1.25rem]">
            {/* 오늘의 목표: daily-record 엔드포인트가 없어 "오늘 실제 기록"엔 근거가 없다
                (임무 지시 배경 절). weekIdeal/weekMin(주간 목표 시간)은 student에 실데이터로
                있지만 이 카드는 일 단위 달성률(%)만 그리고 주간 목표 시간을 표시할 슬롯이
                없어 매핑할 자리가 없다 — 컴포넌트를 넓히는 건 이번 범위 밖이라 손대지 않았다.
                mockDailyGoalEmpty(기존 "미기록" 빈 상태, goalMock.js)를 그대로 재사용해
                studyHours/upperGoalRate/lowerGoalRate=0으로 "기록 저장" 빈 상태를 보여준다. */}
            <TodayGoalCard data={mockDailyGoalEmpty} />

            <div className="flex gap-[1rem]">
              <div className="w-[33.125rem]">
                {/* AdviceCard: AI 조언 생성 로직 미이식(docs/figma-goal/calc-port-status.md §9.2) — mock 유지. */}
                <AdviceCard data={advice} />
              </div>
              <div className="w-[33.125rem]">
                {/* TomorrowPlanCard: 내일 학습 계획 산출 로직 미이식 — mock 유지. */}
                <TomorrowPlanCard plan={mockDailyGoalEmpty.tomorrowPlan} />
              </div>
            </div>

            <div className="flex gap-[1rem]">
              <div className="w-[33.125rem]">
                <MockExamCard data={mockExamData} />
              </div>
              <div className="w-[33.125rem]">
                <NaesinCard data={naesinData} />
              </div>
            </div>

            {/* AchievementChart: 회차별 백분위/등급 추이 계산이 미이식 상태라 mock 유지. */}
            <AchievementChart data={mockAchievementChart} />
          </div>

          <div className="col-start-2 row-start-2 flex min-w-0 flex-col gap-[1.25rem]">
            <TargetUniversityRail data={targetUniversities} />
            {/* StudyPlanRail: 오늘 체크리스트를 만들 과제 테이블이 미생성 — mock 유지. */}
            <StudyPlanRail tasks={mockTodayPlan} />
            {/* ScheduleRail: GET /api/goal/schedules 실데이터, 가까운 순 3건(mapNearestSchedules). */}
            <ScheduleRail schedules={mapNearestSchedules(schedules)} />
            {/* RankingRail: 학생 간 순위 집계 로직·테이블이 미생성 — mock 유지. */}
            <RankingRail ranking={mockRanking} />
          </div>
        </div>
      </div>
    </div>
  );
}
