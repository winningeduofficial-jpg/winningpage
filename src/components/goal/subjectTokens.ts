// 과목 색 정본 매핑 헬퍼 — 코드 검수 지적사항 §1/§2.
// tailwind.config.js `goal.subject.*`(배경/칩 전용 파스텔) + `goal.subjectStrong.*`(도트·진행바
// 채움 전용 진한 톤) 두 계층을 이 파일 한 곳에서만 관리한다. 기존에 4곳(goalStudyMock.js
// SUBJECT_DOT_CLASS / TomorrowPlanCard.jsx SUBJECT_TONE / EffortSubjectCard.jsx SUBJECT_COLOR /
// AchievementChart.jsx 로컬 hex)으로 흩어져 서로 다른 색으로 어긋나 있던 매핑을 통합한다.
//
// 과목 id(korean/math/english/science/etc)와 한글명(국어/수학/영어/탐구) 두 키 형태를 모두 받는다.

const SUBJECT_ID_BY_NAME = {
  국어: "korean",
  수학: "math",
  영어: "english",
  탐구: "science",
};

const KNOWN_SUBJECT_IDS = ["korean", "math", "english", "science", "etc"];

// 키(id 또는 한글명)를 과목 id로 정규화한다. 미지정/미매칭은 'etc'로 폴백.
export function resolveSubjectId(key) {
  if (!key) return "etc";
  if (KNOWN_SUBJECT_IDS.includes(key)) return key;
  return SUBJECT_ID_BY_NAME[key] ?? "etc";
}

// id → 한글 라벨. api/_lib/goalRepo.js SUBJECT_CODE_TO_LABEL과 글자 단위로 같다
// (서버 파일은 클라이언트 번들에 끌어올 수 없어 — service_role 키를 물고 있는
// supabaseAdmin.js를 재수출하게 된다 — 여기 별도로 둔다).
export const SUBJECT_LABELS = {
  korean: "국어",
  math: "수학",
  english: "영어",
  science: "탐구",
  etc: "기타",
};

export function getSubjectLabel(key) {
  return SUBJECT_LABELS[resolveSubjectId(key)] ?? SUBJECT_LABELS.etc;
}

// 배경(칩) 전용 파스텔 톤 클래스 — tailwind.config.js `goal.subject.*`.
export function getSubjectBgClass(key) {
  return `bg-goal-subject-${resolveSubjectId(key)}`;
}

// 도트·진행바 채움 전용 진한 톤 클래스 — tailwind.config.js `goal.subjectStrong.*`.
export function getSubjectStrongClass(key) {
  return `bg-goal-subjectStrong-${resolveSubjectId(key)}`;
}

// recharts fill 등 hex 값이 직접 필요한 소비처를 위한 파스텔 매핑.
// tailwind.config.js `goal.subject.*`와 반드시 동기화할 것.
export const SUBJECT_HEX = {
  korean: "#FCE4EC",
  math: "#E3F2FD",
  english: "#FFF8E1",
  science: "#E8F5E9",
  etc: "#F1EDE7",
};
