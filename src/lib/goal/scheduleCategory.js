// 목표관리 중요일정 카테고리 코드 ↔ 표시 라벨.
// sql/74_goal_schedules.sql의 category CHECK 값 4종과 순서·의미가 1:1이다
// (AddScheduleFullModal.jsx가 쓰는 goalModalOptions.scheduleTypes 라벨 순서와도 같다).
// API 와이어 계약(api/goal/schedules.js)은 코드값만 주고받는다 — 화면 라벨은 이 모듈이
// 오직 클라이언트에서만 매핑한다(body_condition 등 CHECK가 있는 다른 컬럼과 동일 관례).
export const SCHEDULE_CATEGORIES = [
  { code: 'performance', label: '수행평가' },
  { code: 'exam', label: '시험' },
  { code: 'deadline', label: '제출마감' },
  { code: 'etc', label: '기타' }
];

const CODE_TO_LABEL = Object.fromEntries(SCHEDULE_CATEGORIES.map(({ code, label }) => [code, label]));
const LABEL_TO_CODE = Object.fromEntries(SCHEDULE_CATEGORIES.map(({ code, label }) => [label, code]));

/** 카테고리 코드 → 표시 라벨. 알 수 없는 코드는 '기타'로 접는다. */
export function scheduleCategoryLabel(code) {
  return CODE_TO_LABEL[code] || '기타';
}

/** 표시 라벨 → 카테고리 코드. 알 수 없는 라벨은 null(호출부가 검증 실패로 처리). */
export function scheduleCategoryCode(label) {
  return LABEL_TO_CODE[label] ?? null;
}
