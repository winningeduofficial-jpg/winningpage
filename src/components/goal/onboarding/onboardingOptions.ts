// 목표관리 온보딩(7단계 위저드) 폼 옵션·카피 정본 — docs/figma-goal/part-01.md~part-04.md
// 카피 기준. 과거 src/data/goalOnboardingMock.ts 에서 이관(2026-08-20, FF 응집도 —
// 사용처 옆 배치).

// #1 카피 그대로. 중학교・초등학교는 §확정 사항 2에 따라 "준비 중" 안내로 막고 진행시키지 않는다.
export const SCHOOL_TYPE_OPTIONS = [
  { value: "general", label: "일반고" },
  { value: "special", label: "특목・자사고" },
  { value: "middle", label: "중학교" },
  { value: "elementary", label: "초등학교" },
];

// #2 카피(고1~고3) — 일반고/특목・자사고 공통. 중/초등 학년 옵션은 분기 시안이 없어 정의하지 않는다.
export const HIGH_SCHOOL_GRADE_OPTIONS = [
  { value: "g1", label: "고등학교 1학년" },
  { value: "g2", label: "고등학교 2학년" },
  { value: "g3", label: "고등학교 3학년" },
];

// UNIVERSITY_OPTIONS(대학 11곳 고정 목업)는 삭제됐다 — UniversitySelect.tsx가
// src/lib/goal/universitySearch.ts로 goal_university_cuts를 직접 검색한다
// (mock 삭제 후속 UoW, 2026-08-20).

// #6 카피 그대로.
export const NAESIN_EXAMS = [
  { key: "s1mid", label: "1학기 중간" },
  { key: "s1final", label: "1학기 기말" },
  { key: "s2mid", label: "2학기 중간" },
  { key: "s2final", label: "2학기 기말" },
];

// #7 카피 그대로.
export const MOCK_EXAM_ROUNDS = [
  { key: "mar", label: "3월 모의고사" },
  { key: "jun", label: "6월 모의고사" },
  { key: "sep", label: "9월 모의고사" },
  { key: "oct", label: "10월 모의고사" },
];

export const MOCK_EXAM_SUBJECTS = [
  { key: "kor", label: "국어 등급" },
  { key: "math", label: "수학 등급" },
  { key: "eng", label: "영어 등급" },
  { key: "tam1", label: "탐구1" },
  { key: "tam2", label: "탐구2" },
];

// #9 시안 오타 정정(작업 지시 §확정 사항 7): 7번째 요일 라벨이 "토요일"로 중복돼 있던 것을
// "일요일"로 교정했다.
export const WEEKDAY_OPTIONS = [
  { key: "mon", label: "월요일" },
  { key: "tue", label: "화요일" },
  { key: "wed", label: "수요일" },
  { key: "thu", label: "목요일" },
  { key: "fri", label: "금요일" },
  { key: "sat", label: "토요일" },
  { key: "sun", label: "일요일" },
];

// #10 요일별 하루 일정 — QA 행293(schedule.js `calcAvailableHours` 원본 계약 이식,
// 2026-09-02). 이전 단일 세트 4필드(DAILY_SCHEDULE_FIELDS, 근사 어댑터 전용)는 삭제됐다
// (마지막 형태는 git 이력 참고). 기상・취침은 시각(0.5h 스텝), 학교체류・학원은 등・하원
// 시각 쌍으로 받는다 — 단위 표기가 필요 없어졌다.
export const WEEK_SCHEDULE_TIME_STEP = 0.5;
export const WEEK_SCHEDULE_WAKE_MAX = 24;
// 취침은 자정을 넘는 값(다음날 새벽)을 24 초과로 표현한다 — 원본 계약(target/components/
// IntakeForm.tsx:1814-1920 "자정 넘김은 24 가산").
export const WEEK_SCHEDULE_SLEEP_MAX = 30;
export const WEEK_SCHEDULE_SCHOOL_TIME_MAX = 30;
export const WEEK_SCHEDULE_ACADEMY_TIME_MAX = 30;
export const WEEK_SCHEDULE_MAX_ACADEMIES = 5;

// 요일별 하루 일정 기본값 — 평일은 등교, 주말은 등교 아님(원본 DAYS_CONFIG와 동일).
export const WEEK_SCHEDULE_DEFAULT_WAKE = 7;
export const WEEK_SCHEDULE_DEFAULT_SLEEP = 24;
export const WEEK_SCHEDULE_DEFAULT_SCHOOL_START = 8.5;
export const WEEK_SCHEDULE_DEFAULT_SCHOOL_END = 16.5;
export const WEEKEND_KEYS = ["sat", "sun"];
