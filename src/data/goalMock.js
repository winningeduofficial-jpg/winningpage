// 목표관리 학생 앱(goal-app-shell) 목업 데이터 — docs/figma-goal/00-INDEX.md 44프레임 "카피 전문" 절 기준.
// 화면 단위가 아니라 도메인 단위로 구성해 대시보드·서브페이지가 그대로 가져다 쓸 수 있게 한다.
// 스키마·API는 이번 범위가 아니므로 전부 정적 상수다(Supabase 연동 없음).
//
// ⚠︎ 시안 더미 불일치 통일: 사이드바 인사말 등에 등장하는 학생명이 프레임마다 `김주원`/`김형준`으로
// 갈리는데(00-INDEX.md §8-2 #10), 이 파일은 `김주원`으로 통일한다.

// 학생 프로필 — 사이드바 사용자 블록, 페이지 헤더 인사말 등에서 공용으로 쓴다.
export const mockStudent = {
  name: '김주원',
  grade: '고2',
  schoolType: '특목고'
};

// 이상/최소 목표 대학 — 대시보드(#20/#22/#23) + 내 목표 대학(#24) 공용, part-04~08에 7회
// 일관 등장하는 계열이 정본이다. `서울대학교 경영대학` / `고려대학교 경영대학` + 24.82%·20.07%·
// 27.72%·42.39% 조합은 이 화면의 더미가 아니라 「성장 리포트」 '합격 가능성 변화' 카드 전용
// 더미다 — 혼동 방지를 위해 아래 `mockAdmissionChance`로 분리했다(2026-08-10 정정).
export const mockTargetUniversities = {
  upper: {
    label: '이상목표대학',
    university: '서울대학교',
    department: '경영학과',
    susiRate: 20, // 수시 합격률 %
    jeongsiRate: 18 // 정시 합격률 %
  },
  lower: {
    label: '최소목표대학',
    university: '건국대학교',
    department: '경영학과',
    susiRate: 62, // 수시 합격률 %
    jeongsiRate: 48 // 정시 합격률 %
  },
  // 「내 목표 대학」 페이지 하단 "목표까지 남은 격차" 3행(part-08 #24 카피 전문).
  gapToTarget: [
    {
      label: '내신 등급',
      description: '현재 3.24등급 → 목표 2.71등급',
      remaining: '0.53등급 부족'
    },
    {
      label: '모의고사',
      description: '현재 78.4 백분위 → 목표 92.0 백분위',
      remaining: '13.6 부족'
    },
    {
      label: '학습 시간',
      description: '현재 3.2시간/일 → 목표 6.5시간/일',
      remaining: '3.3시간 부족'
    }
  ]
};

// 「성장 리포트」 '합격 가능성 변화' 카드 전용 더미(part-11 §271~278, part-15 §163~169).
// 대시보드(mockTargetUniversities)와는 대학명·수치가 다른 별도 시안 계열이므로 절대 섞지 말 것.
// ⚠︎ 시안 자체 결함: 채움 폭이 4행 모두 80px 고정이라 확률값과 무관 — 구현 시 값 기준 비례로.
// 결함5 대응: `delta`는 문자열(`▲ 0.42%`)이 아니라 `{ direction, value }` 구조다 — AdmissionChanceCard가
// 글리프(▲/▼)를 문자열에서 파싱하지 않고 direction으로 바로 분기하도록 스키마를 바꿨다. 시안에는
// 상승(▲)만 있어(part-11 §353) 전부 `direction: 'up'`이다.
export const mockAdmissionChance = {
  upper: {
    university: '서울대학교 경영대학',
    susi: { delta: { direction: 'up', value: '0.42%' }, rate: 24.82 },
    jeongsi: { delta: { direction: 'up', value: '0.37%' }, rate: 20.07 }
  },
  lower: {
    university: '고려대학교 경영대학',
    susi: { delta: { direction: 'up', value: '0.41%' }, rate: 27.72 },
    jeongsi: { delta: { direction: 'up', value: '0.28%' }, rate: 42.39 }
  }
};

// 오늘의 목표 카드(대시보드) — 순공 시간·달성률·내일 계획 제시(part-06/07 카피 전문).
export const mockDailyGoal = {
  dateLabel: '2026.08.01 토요일 기준',
  studyHours: 3.5, // 오늘 순공 시간
  quickAddOptions: [0.5, 1, 2], // + 30분 / + 1시간 / + 2시간 퀵칩(시간 단위)
  upperGoalRate: 54, // 이상 목표 학습 시간 달성률 %
  lowerGoalRate: 78, // 최소 목표 학습 시간 달성률 %
  tomorrowPlan: [
    { subject: '수학', unit: '미적분', duration: '2시간 30분' },
    { subject: '국어', unit: '문학', duration: '1시간 30분' },
    { subject: '영어', unit: '독해', duration: '1시간' },
    { subject: '탐구', unit: '지구과학', duration: '2시간 30분' }
  ]
};

// "오늘 기록 없음" 상태(#12 계열 — 순공 시간 0.0, 달성률 0%). 대시보드 기본 렌더는 #20(채워짐)을
// 쓰지만, TodayGoalCard의 "기록 저장"(미기록) ↔ "기록 수정"(기록됨) 분기를 확인하려면
// mockDailyGoal 대신 이 객체를 넘기면 된다. tomorrowPlan은 #12에도 동일 카피가 있어 재사용.
export const mockDailyGoalEmpty = {
  ...mockDailyGoal,
  studyHours: 0,
  upperGoalRate: 0,
  lowerGoalRate: 0
};

// 요일별 자습 계획 — 「주간 학습 계획표」(#29 채움 상태, part-10 카피 전문). 일요일만 빈 컬럼.
export const mockWeeklyPlan = [
  {
    day: '월요일',
    date: 27,
    tasks: [
      { subject: '수학', title: '새 과제' },
      { subject: '영어', title: '문제집 20문제 풀기' },
      { subject: '탐구', title: '새 과제' },
      { subject: '국어', title: '문제집 20문제 풀기' }
    ]
  },
  {
    day: '화요일',
    date: 28,
    tasks: [
      { subject: '수학', title: '새 과제' },
      { subject: '영어', title: '문제집 20문제 풀기' },
      { subject: '탐구', title: '새 과제' },
      { subject: '국어', title: '문제집 20문제 풀기' }
    ]
  },
  {
    day: '수요일',
    date: 29,
    tasks: [
      { subject: '수학', title: '새 과제' },
      { subject: '영어', title: '문제집 20문제 풀기' }
    ]
  },
  {
    day: '목요일',
    date: 30,
    tasks: [
      { subject: '영어', title: '문제집 20문제 풀기' },
      { subject: '탐구', title: '새 과제' },
      { subject: '국어', title: '문제집 20문제 풀기' }
    ]
  },
  {
    day: '금요일',
    date: 31,
    tasks: [
      { subject: '영어', title: '문제집 20문제 풀기' },
      { subject: '탐구', title: '새 과제' },
      { subject: '국어', title: '문제집 20문제 풀기' }
    ]
  },
  {
    day: '토요일',
    date: 1,
    tasks: [
      { subject: '수학', title: '새 과제' },
      { subject: '영어', title: '문제집 20문제 풀기' }
    ]
  },
  {
    day: '일요일',
    date: 2,
    tasks: [] // 빈 컬럼 — `+ 추가`만 노출
  }
];

// 대시보드 우측 레일 "토요일 나의 학습 계획하기" 카드 전용 체크리스트(part-07 #20 카피 전문).
// 「주간 학습 계획표」(mockWeeklyPlan)와는 별개 데이터 — 그쪽은 요일별 과제 카드, 이쪽은 오늘
// 하루치 체크리스트(순번 + 완료/미달성/미처리 상태)다. 상태 3종이 한 화면에 공존하는 것이
// #20 실측 그대로다(1행·2행 완료 / 3행 미달성 / 4행 미처리).
export const mockTodayPlan = [
  { id: 1, text: '수학 미적분 3단원 문제 32개', status: 'done' },
  { id: 2, text: '국어 문학 기출 2회분', status: 'done' },
  { id: 3, text: '영어 단어 300개 복습', status: 'fail' },
  { id: 4, text: '수학 미적분 3단원 문제 32개', status: 'pending' }
];

// 위 체크리스트의 빈 상태(#13/#15 계열 — 오늘 등록된 계획이 없을 때). 대시보드 기본 렌더에는
// 쓰지 않지만, StudyPlanRail(dashboard/StudyPlanRail.jsx)의 `hasTasks` empty 분기를 확인하려면
// Dashboard.jsx의 `<StudyPlanRail tasks={mockTodayPlan} />`를 이 배열로 바꿔 끼우면 된다.
export const mockTodayPlanEmpty = [];

// 중요일정 3건(D-1 / D-7 / D-19) — 「중요일정」 목록·대시보드 레일 공용(part-13/14 카피 전문).
export const mockSchedules = [
  { dday: 'D-1', title: '한국사 수행평가 제출', meta: '8월 2일 · 발표 자료 포함' },
  { dday: 'D-7', title: '생명과학 세특 보고서', meta: '8월 8일 · 탐구 결과 정리' },
  { dday: 'D-19', title: '2학기 중간고사 시작', meta: '8월 20일 · 6과목' }
];

// 내신·모의고사 회차별 성적 — 「성적 관리」 표 2종 + 상단 KPI 게이지(part-12 #35 카피 전문).
export const mockGrades = {
  naesin: {
    title: '내신・회차별 등급',
    kpi: {
      round: '고2-1 기말',
      value: 3.24,
      unit: '등급',
      delta: 0.29, // ▲ 배지 — 등급은 낮을수록 좋으나 시안 그대로 상승(개선) 표기
      targetLabel: '최소 목표 2.71 등급',
      remaining: 0.53
    },
    rows: [
      { term: '고1-1 중간', korean: 4.0, math: 4.0, english: 4.0, science: 4.0, average: 4.03 },
      { term: '고1-1 기말', korean: 3.8, math: 3.8, english: 3.8, science: 3.8, average: 3.8, delta: 0.23 },
      { term: '고1-2 중간', korean: 3.5, math: 3.5, english: 3.5, science: 3.5, average: 3.53, delta: 0.27 },
      { term: '고2-1 기말', korean: 3.2, math: 3.2, english: 3.2, science: 3.2, average: 3.24, delta: 0.29 }
    ]
  },
  mock: {
    title: '모의고사・회차별 백분위',
    kpi: {
      round: '고2 6월',
      value: 78.4,
      unit: '백분위',
      delta: 2.6,
      targetLabel: '이상 목표 92.0',
      remaining: 13.6
    },
    rows: [
      { term: '고1-2 11월', korean: 76, math: 71, english: 80, science: 72, average: 74.6 },
      { term: '고2 3월', korean: 78, math: 72, english: 82, science: 73, average: 75.8, delta: 1.2 },
      { term: '고2 6월', korean: 81, math: 74, english: 85, science: 76, average: 78.4, delta: 2.6 }
    ]
  }
};

// 오늘의 학습 순위 6행 — 대시보드 우측 레일 카드(part-08 #22 카피 전문). isSelf=true 행이 본인(주황 강조).
export const mockRanking = [
  { rank: 1, name: '홍O동', hours: 11.5, isSelf: false },
  { rank: 2, name: '하O서', hours: 10.5, isSelf: false },
  { rank: 3, name: '이O진', hours: 8.5, isSelf: false },
  { rank: 4, name: '이O박', hours: 6, isSelf: false },
  { rank: 5, name: '김주원', hours: 3.5, isSelf: true },
  { rank: 6, name: '박O원', hours: 2, isSelf: false }
];

// 대시보드 조언 2종(뱃지만 다르고 part-06 #17/#18 시안 원문은 본문까지 동일 문자열 — 시안 결함으로
// 판단) + 모의고사/내신 카드 조언. `daily`는 시안 원문("오늘의 조언" 카드 카피 전문)을 그대로 쓰고,
// `ai`는 뱃지 문구("AI 입시 분석 조언")에 맞춰 입시 데이터 분석 톤으로 새로 작성했다 — 두 유형의
// 카피가 실제로는 어떻게 달라야 하는지 디자인 확정 전이므로 **문구 자체는 미확정**이다.
export const mockAdvice = {
  daily: {
    badge: '일일 분석 조언',
    headline: '김주원 학생, 3시간만 더 하면 오늘 목표를 지킬 수 있어요.',
    // 원문 그대로("없어" 뒤 공백 2칸 — 시안 오타, 그대로 보존)
    body: '아직 학습 기록이 없어  실행 분석은 준비 중입니다. 온보딩 성적 기준으로는 수학·탐구의 격차가 가장 큽니다.'
  },
  ai: {
    badge: 'AI 입시 분석 조언',
    headline: '김주원 학생, 3시간만 더 하면 오늘 목표를 지킬 수 있어요.',
    // (신규 작성, 미확정) — 시안 원문이 daily와 동일해 그대로 쓰면 뱃지만 다른 두 카드가
    // 완전히 같은 문장을 보여주게 된다. 뱃지가 "AI 입시 분석"이므로 입시 격차 관점 문구로 분기.
    body: 'AI가 최근 성적·학습 패턴을 분석했습니다. 현재 페이스로는 이상 목표 합격률 도달까지 시간이 부족하며, 수학·탐구 비중을 높이면 격차를 가장 빠르게 좁힐 수 있습니다.'
  },
  mockExam: {
    label: '모의고사',
    round: '9월 모의고사',
    dday: 'D-63',
    metricLabel: '현재 종합 백분위',
    metricValue: 78.4,
    advice: '이상 목표 합격 백분위 92.0까지 13.6 부족합니다. 수학・탐구에서 격차가 가장 큽니다.'
  },
  naesin: {
    label: '내신',
    round: '내신 관리',
    dday: 'D-63',
    metricLabel: '현재 내신 평균',
    metricValue: '3.24 등급 (9등급 환산)',
    advice: '최소 목표 기준 2.71등급까지 0.53등급 남았습니다. 2학기 중간이 분기점입니다.'
  }
};

// 학업 성취도 변화 추이 — 5회차 × 3과목(국/수/영) 그룹 막대(part-05 #15 실측).
// 도메인: 백분위(0~100). 원본 시안 값은 막대의 "높이 px" 실측치(71~214)가 그대로 목업에 들어가
// 있었다 — 축 라벨이 내신/모의고사 회차인데 값이 백분위·등급 어느 스케일과도 맞지 않는 결함이라
// (결함3) 값 전체를 0~100 백분위로 재작성했다. 과목 간 상대 크기 관계(회차별로 국어가 가장 높고
// 수학이 가장 낮은 등, 원본 픽셀 값의 대소 순서)는 그대로 유지했다.
export const mockAchievementChart = {
  legend: ['국어', '수학', '영어'],
  groups: [
    { label: '고1-1 중간', korean: 82, math: 58, english: 70 },
    { label: '고1-1 기말', korean: 68, math: 62, english: 76 },
    { label: '고1-2 중간', korean: 66, math: 61, english: 80 },
    { label: '고2-1 중간', korean: 74, math: 63, english: 68 },
    { label: '고2-1 기말', korean: 76, math: 72, english: 84 }
  ]
};

// 차트 빈 상태(#13 — 회차 기록이 아직 없을 때, 막대·범례·X축 라벨 전무). 대시보드 기본 렌더는
// #15/#20(채워짐)을 쓰지만, AchievementChart의 empty 분기를 확인하려면 mockAchievementChart
// 대신 이 객체를 넘기면 된다.
export const mockAchievementChartEmpty = {
  legend: ['국어', '수학', '영어'],
  groups: []
};

// 대시보드 진입 모달 3종(과제 추가 #16 / 중요일정 등록 #19 / 모의고사 성적 추가 #22) 공용 옵션값.
// 시안에는 셀렉트 옵션 "목록"이 없고 표시값 1건만 실측돼 있다(예: 예상 소요 시간 "1시간 30분",
// 일정 "이번 주만", 회차 "2026년 9월 모의고사"). 실측 표시값은 그대로 포함하되 목록 구성 자체는
// 통상적인 선택지로 새로 만든 것이라 미확정이다(// 미확정 — part-06/07/08 구현 노트 참고).
export const goalModalOptions = {
  taskSubjects: ['국어', '수학', '영어', '탐구', '기타'],
  taskDurations: ['30분', '1시간', '1시간 30분', '2시간', '2시간 30분', '3시간'],
  taskSchedules: ['오늘만', '이번 주만', '매주 반복'],
  scheduleTypes: ['수행평가', '시험', '제출마감', '기타'],
  scheduleRanges: ['이번 주만', '이번 달만', '상시 표시'],
  mockExamRounds: ['2026년 9월 모의고사', '2026년 6월 모의고사', '2026년 3월 모의고사']
};
