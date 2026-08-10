// 목표관리 앱 서브페이지 3종(내 목표 대학 #24 · 열공 타이머 #25 · 오늘의 공부 기록 #26) 전용 목업.
// src/data/goalMock.js는 다른 배치 작업과 동시 편집 중이라 절대 수정하지 않는다(파일 소유권 규칙).
// #24는 goalMock.js의 `mockTargetUniversities`를 그대로 import해 쓰고(대시보드 계열이 정본), 여기서는
// #25·#26에 필요한 신규 데이터만 둔다.

// 과목 색 매핑은 src/components/goal/subjectTokens.js로 정본화했다(코드 검수 §1) —
// #25/#26을 포함한 앱 전체가 그 헬퍼를 공유한다. 여기서는 더 이상 로컬 매핑을 두지 않는다.

// 열공 타이머(#25) 4과목 초기 상태 — part-09 §120~123 카피 전문 그대로.
// elapsedSeconds는 시안 표기 시간(00:50:12 등)을 초로 환산한 값. 탐구만 진행 중(running=true).
// 카드 배치 순서(수학→국어→영어→탐구)는 part-09 §60 그리드 좌표(수학 x=384/국어 x=824/영어
// x=384,y=561/탐구 x=824,y=561) 순서를 그대로 따른다.
export const mockSubjectTimers = [
  { id: 'math', label: '수학', targetHours: 2.0, elapsedSeconds: 50 * 60 + 12, running: false },
  { id: 'korean', label: '국어', targetHours: 1.5, elapsedSeconds: 40 * 60 + 12, running: false },
  { id: 'english', label: '영어', targetHours: 1.0, elapsedSeconds: 25 * 60 + 12, running: false },
  { id: 'science', label: '탐구', targetHours: 1.0, elapsedSeconds: 12 * 60 + 12, running: true }
];

// 오늘의 공부 기록(#26) 섹션1 "과목별 순공 시간" — 이 화면은 시안상 전체 빈 상태(part-09 §239)라
// 4과목 전부 0.0h(아직 기록 없음)로 시작한다. #25 열공 타이머에서 종료 시 자동 유입되는 값이라는
// 설계이나(part-09 §241) 이 페이지 자체에는 편집 UI가 없어 값을 바꿀 방법이 없다 — 그대로 읽기 전용.
export const mockStudySubjectTimes = [
  { id: 'math', label: '수학', hours: 0 },
  { id: 'korean', label: '국어', hours: 0 },
  { id: 'english', label: '영어', hours: 0 },
  { id: 'science', label: '탐구', hours: 0 }
];

// 섹션2 "오늘의 컨디션" — 단일 선택. part-09 §180 카피 전문.
export const mockConditionOptions = [
  { value: 'great', emoji: '😆', label: '아주 좋음' },
  { value: 'normal', emoji: '🙂', label: '보통' },
  { value: 'tired', emoji: '😣', label: '피곤함' },
  { value: 'exhausted', emoji: '😫', label: '힘듦' }
];

// 섹션3 "방해 요인" — 다중 선택. `없었음`은 다른 항목과 상호배타(part-09 §247 추정).
// part-09 §230 카피 전문.
export const mockDisturbanceOptions = [
  { value: 'academySchedule', label: '수업 · 학원 일정' },
  { value: 'smartphone', label: '스마트폰' },
  { value: 'fatigue', label: '피로 · 수면 부족' },
  { value: 'distraction', label: '집중 안 됨' },
  { value: 'none', label: '없었음' }
];

// 섹션4 "오늘 완료한 핵심 학습 항목" — 다중 선택. part-09 §232 카피 전문.
export const mockStudyItemOptions = [
  { value: 'concept', label: '개념 학습' },
  { value: 'academyHomework', label: '학원 숙제' },
  { value: 'wrongAnswerReview', label: '오답 정리' },
  { value: 'schoolSubject', label: '내신 과목' },
  { value: 'mockExam', label: '기출/모의고사' },
  { value: 'etc', label: '기타' }
];
