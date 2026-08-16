// 중요일정 D-day · 카드 meta 문자열 포맷터 — 실제 캘린더 날짜 기준(계산 엔진의
// 가상 날짜 모델과 무관하다. calc/ 는 확률 파이프라인 전용으로 동결돼 있어 이 파일은
// calc/ 밖에 둔다). kstYMD만 재사용해 "오늘"의 시간대 처리를 calc/virtualDate.js와
// 일치시킨다.
import { kstYMD } from "./calc/index.js";

/**
 * 'YYYY-MM-DD' 마감일 → GoalDdayBadge용 D-day 문자열.
 * 오늘(KST) 기준. 당일은 'D-day', 지난 일정은 'D+N'.
 */
export function formatScheduleDday(dueDate: string, now = new Date()) {
  const today = kstYMD(now);
  const diffDays = Math.round(
    (new Date(`${dueDate}T00:00:00Z`).getTime() -
      new Date(`${today}T00:00:00Z`).getTime()) /
      86400000,
  );

  if (diffDays === 0) return "D-day";
  if (diffDays > 0) return `D-${diffDays}`;
  return `D+${Math.abs(diffDays)}`;
}

/** 'YYYY-MM-DD' → '8월 2일'(시안 카피 포맷). */
function formatScheduleDateLabel(dueDate: string) {
  const [, month, day] = String(dueDate).split("-").map(Number);
  return `${month}월 ${day}일`;
}

/** 카드 meta 문자열 = 날짜 + (있으면) 메모. 메모가 없으면 날짜만. */
export function formatScheduleMeta(dueDate: string, memo?: string | null) {
  const dateLabel = formatScheduleDateLabel(dueDate);
  return memo ? `${dateLabel} · ${memo}` : dateLabel;
}
