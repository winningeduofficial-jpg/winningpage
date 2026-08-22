// 학습 계획(주간 계획표 WeeklyPlan.jsx + 대시보드 StudyPlanRail.jsx) 공용 순수
// 유틸리티 — 날짜·기간 계산과 모달 라벨 ↔ 값 변환. API 호출은 goalApi.js가,
// 서버 검증·저장은 api/goal/plan-tasks.js·api/_lib/goalRepo.js가 담당한다.
//
// 날짜 계산은 실제 달력 기준이다(kstYMD/getMondayYMD/addDaysYMD, src/lib/goal/calc)
// — goal_daily_records의 "가상 날짜"(actual_start_date + record_index)와 무관한
// 별개 개념이라 그 모듈은 쓰지 않는다.

import { addDaysYMD, getMondayYMD, kstYMD } from "./goal/calc/index.js";

// 호출부(StudyPlanRail.jsx 등)가 "오늘" YMD가 필요할 때 calc 배럴을 따로 또 import하지
// 않도록 그대로 재노출한다 — 이 파일이 이미 같은 심볼을 쓰고 있어 재노출 비용이 없다.
export { kstYMD };

// WeekdayPlanBoard.jsx DAY_KEY와 같은 순서(월~일). WeekdayPlanBoard가 그대로
// 소비할 수 있도록 그 컴포넌트의 day 라벨과 글자 단위로 같아야 한다.
export const WEEKDAY_LABELS = [
  "월요일",
  "화요일",
  "수요일",
  "목요일",
  "금요일",
  "토요일",
  "일요일",
];
// WeekdayPlanBoard.jsx의 내부 DAY_KEY 값과 같은 순서·표기(mon~sun).
const WEEKDAY_SHORT_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

/**
 * 표시할 주(월~일)의 실제 날짜 7개(YYYY-MM-DD)를 돌려준다.
 * weekOffset=0은 이번 주, -1/+1은 지난/다음 주(주 이동 화살표용).
 */
export function getWeekDates(weekOffset = 0, now = new Date()): string[] {
  const thisMonday = getMondayYMD(kstYMD(now), now);
  const monday =
    weekOffset === 0 ? thisMonday : addDaysYMD(thisMonday, weekOffset * 7, now);
  return Array.from({ length: 7 }, (_, i) => addDaysYMD(monday, i, now));
}

/** weekDates(getWeekDates 반환값) 안에 오늘이 있으면 그 요일의 short key, 없으면 null. */
export function getTodayShortKeyInWeek(weekDates: string[], now = new Date()) {
  const idx = weekDates.indexOf(kstYMD(now));
  // weekDates는 7일치, WEEKDAY_SHORT_KEYS도 7개 고정이라 idx(-1 아닌 경우)는 항상 유효하다.
  return idx === -1 ? null : WEEKDAY_SHORT_KEYS[idx]!;
}

/**
 * 오늘의 한글 요일 라벨("월요일"~"일요일", KST 기준). 대시보드 레일
 * "OO요일 나의 학습 계획하기" 헤딩용 — AddTaskModal.getTodayLabel()(로컬 브라우저 시간대
 * 기준 Date#getDay())과 별개다. 이쪽은 kstYMD/getWeekDates와 타임존 기준을 맞춰야
 * "이번 주" 판정(getTodayShortKeyInWeek)과 화면에 보이는 요일 라벨이 항상 같은 날을
 * 가리키게 하기 위해 Intl로 KST를 명시한다.
 */
export function getTodayWeekdayLabel(now = new Date()) {
  return new Intl.DateTimeFormat("ko-KR", {
    weekday: "long",
    timeZone: "Asia/Seoul",
  }).format(now);
}

/** GoalPageHeader meta 라벨. 예: "2026.07.27 – 08.02" (WeeklyPlan.jsx 기존 정적 문구와 동일 포맷). */
export function formatWeekRangeLabel(weekDates: string[]) {
  // weekDates는 항상 getWeekDates()가 만든 7일치 배열이라 첫/끝 원소가 항상 존재한다.
  const [start, end] = [weekDates[0]!, weekDates[weekDates.length - 1]!];
  const [sy, sm, sd] = start.split("-");
  const [, em, ed] = end.split("-");
  return `${sy}.${sm}.${sd} – ${em}.${ed}`;
}

/** 'YYYY-MM-DD' → 'YYYY.MM.DD' 점 구분 표기. */
function formatDotDate(ymd: string) {
  const [y, m, d] = ymd.split("-");
  return `${y}.${m}.${d}`;
}

/**
 * 대시보드 헤더 날짜 라벨 — "YYYY.MM.DD 요일 기준"(요일 전체 표기, 예: "2026.08.20 목요일 기준").
 * KST 기준으로 오늘을 읽는다(getTodayWeekdayLabel과 동일 타임존).
 */
export function formatTodayDateLabel(now = new Date()) {
  return `${formatDotDate(kstYMD(now))} ${getTodayWeekdayLabel(now)} 기준`;
}

/**
 * GoalPageHeader meta 라벨 — "YYYY.MM.DD (요일)"(요일 축약, 예: "2026.08.20 (목)").
 * DailyRecord.jsx "오늘의 공부 기록" 헤더 전용.
 */
export function formatTodayDateMeta(now = new Date()) {
  const short = new Intl.DateTimeFormat("ko-KR", {
    weekday: "short",
    timeZone: "Asia/Seoul",
  }).format(now);
  return `${formatDotDate(kstYMD(now))} (${short})`;
}

/**
 * AddTaskModal "예상 소요 시간" 셀렉트 라벨(TASK_DURATIONS,
 * src/components/goal/goalFormOptions.ts — "30분"·"1시간"·"1시간 30분" 등) → 분.
 * "N시간"·"M분" 부분 문자열을 각각 찾아 더하는 방식이라 6개 옵션 전부와
 * 향후 라벨 추가에도 별도 표 없이 대응한다.
 */
export function durationLabelToMinutes(label?: string | null) {
  if (!label) return 0;
  const hourMatch = String(label).match(/(\d+)\s*시간/);
  const minuteMatch = String(label).match(/(\d+)\s*분/);
  const hours = hourMatch ? Number(hourMatch[1]) : 0;
  const minutes = minuteMatch ? Number(minuteMatch[1]) : 0;
  return hours * 60 + minutes;
}
