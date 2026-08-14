// 요일 색 공용 상수 — WeekdayPlanBoard.jsx 전용이던 로컬 상수를 분리(코드 검수 NIT §6,
// SubjectChip.jsx의 미사용 `tone="weekday"` 분기 제거와 짝). 저장소에서 요일 색을 쓰는 곳이
// WeekdayPlanBoard 하나뿐이지만, 여기 모아둬 subjectTokens.js와 같은 위치에서 관리한다.

// 배경 1단계 — tailwind.config.js `goal.weekday.*`.
export const WEEKDAY_BG_CLASS = {
  mon: "bg-goal-weekday-mon",
  tue: "bg-goal-weekday-tue",
  wed: "bg-goal-weekday-wed",
  thu: "bg-goal-weekday-thu",
  fri: "bg-goal-weekday-fri",
  sat: "bg-goal-weekday-sat",
  sun: "bg-goal-weekday-sun",
};

// 과제 카드 좌측 4px 액센트 색 — tailwind.config.js `goal.weekday.*`는 배경 1단계뿐이고 액센트
// 2단계는 미정의다(00-INDEX.md §6-3 "신규 정의 필요 토큰 #1: 요일 색 7종 × 2단계"). 근사 진한
// 톤을 로컬 상수로 둔다 — (추정, 디자이너 확인 전까지 임시).
export const WEEKDAY_ACCENT = {
  mon: "#F0A8C4",
  tue: "#F3B48A",
  wed: "#E8D477",
  thu: "#8FCBA0",
  fri: "#93B8EE",
  sat: "#B7B7B7",
  sun: "#B7B7B7",
};
