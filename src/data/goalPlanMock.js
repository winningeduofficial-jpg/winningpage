// 목표관리 앱 — 주간 학습 계획표 / 나의 노력 / 중요일정 3화면 전용 목업.
// docs/figma-goal/00-INDEX.md·part-09~11·part-14 기준. src/data/goalMock.js는 읽기 전용이라
// 이미 존재하는 항목(mockWeeklyPlan #29, mockSchedules #41, goalModalOptions)은 그대로 import해
// 재사용하고, 이 파일에는 goalMock.js에 없는 신규 목업(나의 노력 + 빈 주간 계획표)만 둔다.
import { mockWeeklyPlan } from './goalMock';

// 주간 학습 계획표 완전 빈 상태(#27, part-09.md) — mockWeeklyPlan(#29 채움 상태, goalMock.js)과
// 같은 요일/날짜 라벨을 쓰되 tasks를 전부 비웠다. WeeklyPlan.jsx 기본 렌더는 다른 *_Empty 목업들과
// 같은 컨벤션으로 mockWeeklyPlan(채움)을 쓰고, 이 상수는 #27 빈 상태를 확인할 때 교체해서 쓴다.
export const mockWeeklyPlanEmpty = mockWeeklyPlan.map(({ day, date }) => ({ day, date, tasks: [] }));

// 나의 노력 — 국·수·영·탐 4장 책장 카드(part-11.md #32 카피 전문 그대로).
// ⚠︎ part-11 §183 실측: 채움 상태(#32)에서도 상단 뱃지·카드 모두 "완독 0권"이다. 등록(공부 중인
// 책)과 완독(다 읽은 책)은 서로 다른 카운터이며, 이 시안엔 등록만 있고 완독은 0인 중간 상태만
// 존재한다 — books 배열 길이 = 등록 권수, completed = 완독 권수(시안 그대로 전부 0).
export const mockEfforts = {
  totalCompleted: 0,
  subjects: [
    { subject: '국어', completed: 0, books: ['새 교재', '수능특강'] },
    { subject: '수학', completed: 0, books: ['새 교재', '수능특강', '새 교재', '수능특강'] },
    { subject: '영어', completed: 0, books: ['새 교재', '수능특강'] },
    { subject: '탐구', completed: 0, books: ['새 교재', '수능특강'] }
  ]
};

// 나의 노력 전면 빈 상태(#30, part-10.md) — 4과목 전부 등록 0권. mockEfforts와 동일 컨벤션으로
// Efforts.jsx 기본 렌더는 채움(mockEfforts)을 쓰고, 이 상수는 #30 빈 상태를 확인할 때 교체해서 쓴다.
export const mockEffortsEmpty = {
  totalCompleted: 0,
  subjects: mockEfforts.subjects.map(({ subject }) => ({ subject, completed: 0, books: [] }))
};
