// 목표관리 앱 사이드바 내비 정의 — 4그룹 10항목.
// docs/figma-goal/00-INDEX.md §8-2 #1: 시안 프레임마다 `학습 순위` 항목이 있거나(#22·#23·#28~#32)
// 없어서(#24·#30·#33·#35·#37~#42, 다수) 정본을 10항목으로 확정하고 `학습 순위`는 제외한다
// (사용자 확정, 2026-08-10). 단 대시보드 우측 레일의 '오늘의 학습 순위' 카드는 별개 유지 대상.
//
// 뱃지(중요일정 3 / 오늘의 공부 기록 미기록 / 열공 타이머 진행중)는 항목마다 소스가 다르므로
// 정적 값이 아니라 `getBadge(navBadgeData)` 함수로 선언한다. 호출 측(GoalSidebar)이 목업/실데이터를
// 조합한 `navBadgeData` 객체를 넘기고, 반환값이 falsy면 뱃지를 렌더하지 않는다.
type NavBadgeData = {
  timerRunning?: boolean;
  dailyRecordDone?: boolean;
  scheduleCount?: number;
};

export const GOAL_NAV_GROUPS = [
  {
    group: "홈",
    items: [
      { label: "대시보드", to: "/app/goal" },
      { label: "내 목표 대학", to: "/app/goal/target-university" },
      {
        label: "열공 타이머",
        to: "/app/goal/timer",
        getBadge: (d?: NavBadgeData) => (d?.timerRunning ? "진행중" : null),
      },
    ],
  },
  {
    group: "기록",
    items: [
      {
        label: "오늘의 공부 기록",
        to: "/app/goal/daily-record",
        getBadge: (d?: NavBadgeData) => (d?.dailyRecordDone ? null : "미기록"),
      },
      { label: "주간 학습 계획표", to: "/app/goal/weekly-plan" },
      { label: "나의 노력", to: "/app/goal/efforts" },
    ],
  },
  {
    group: "분석",
    items: [
      { label: "성장 리포트", to: "/app/goal/reports/growth" },
      { label: "성적 관리", to: "/app/goal/grades" },
      { label: "학습방향 리포트", to: "/app/goal/reports/direction" },
    ],
  },
  {
    group: "일정",
    items: [
      {
        label: "중요일정",
        to: "/app/goal/schedules",
        getBadge: (d?: NavBadgeData) =>
          d?.scheduleCount ? String(d.scheduleCount) : null,
      },
    ],
  },
];

// 사이드바 하단 유틸 링크(그룹 밖, 활성 하이라이트 대상 아님).
export const GOAL_NAV_FOOTER = {
  label: "내 정보 수정",
  to: "/app/goal/profile",
};
