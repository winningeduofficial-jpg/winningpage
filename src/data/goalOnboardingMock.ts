// 목표관리 온보딩(7단계 위저드) 목업 데이터 — docs/figma-goal/part-01.md~part-04.md 카피 기준.
// 서버 저장 없음(작업 지시 §확정 사항 4) — 전부 클라이언트 목업이며 API·Supabase 연동은
// 이번 범위 밖이다.

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

// 데이터 소스 미확정(part-01 구현 노트: "대입모집요강 데이터셋과 연동 가능성 있음, 확인 필요") —
// 여기서는 정적 목업 배열 + 클라이언트 substring 필터만 구현한다. 실 서비스에서는 원격 검색 +
// 디바운스가 필요하다(part-02 #4 구현 노트). "울산" 검색 시 3개 자동완성이 뜨는 시안 재현을 위해
// 울산 계열 대학 3곳을 포함한다.
export const UNIVERSITY_OPTIONS = [
  {
    name: "서울대학교",
    departments: [
      "경영학과",
      "경제학과",
      "컴퓨터공학부",
      "전기정보공학부",
      "의예과",
    ],
  },
  {
    name: "연세대학교",
    departments: ["경영학과", "심리학과", "전기전자공학부", "언더우드학부"],
  },
  {
    name: "고려대학교",
    departments: ["경영학과", "정치외교학과", "컴퓨터학과", "의과대학"],
  },
  {
    name: "성균관대학교",
    departments: ["글로벌경영학과", "소프트웨어학과", "전자전기공학부"],
  },
  {
    name: "한양대학교",
    departments: ["건축학부", "컴퓨터소프트웨어학부", "경영학부"],
  },
  {
    name: "중앙대학교",
    departments: ["경영학과", "소프트웨어학부", "심리학과"],
  },
  { name: "경희대학교", departments: ["한의예과", "경영학과", "컴퓨터공학과"] },
  { name: "건국대학교", departments: ["경영학과", "컴퓨터공학부", "수의예과"] },
  { name: "울산대학교", departments: ["의예과", "기계공학부", "경영학부"] },
  {
    name: "울산과학기술원",
    departments: ["전기전자공학과", "컴퓨터공학과", "화학공학과"],
  },
  {
    name: "울산과학대학교",
    departments: ["간호학과", "기계공학과", "경영학과"],
  },
];

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

// #10 카피 그대로 — 기상・취침은 시각(time-of-day), 학교체류・학원과외는 지속시간(duration)이라
// 단위가 "시"와 "시간"으로 다르다(part-04 구현 노트).
export const DAILY_SCHEDULE_FIELDS = [
  {
    key: "wakeUpHour",
    label: "기상 시간",
    unit: "시",
    min: 0,
    max: 23,
    defaultValue: 7,
  },
  {
    key: "sleepHour",
    label: "취침 시간",
    unit: "시",
    min: 0,
    max: 24,
    defaultValue: 24,
  },
  {
    key: "schoolStayHours",
    label: "학교 체류",
    unit: "시간",
    min: 0,
    max: 24,
    defaultValue: 8,
  },
  {
    key: "academyHours",
    label: "학원・과외",
    unit: "시간",
    min: 0,
    max: 24,
    defaultValue: 2,
  },
];
