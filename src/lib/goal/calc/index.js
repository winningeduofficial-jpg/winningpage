// 목표관리 계산 엔진 배럴.
//
// 외부 앱(target)에서 이식한 순수 계산 함수 전량의 단일 진입점이다.
// 소비자는 개별 모듈이 아니라 이 파일에서 import 한다.
//
//   import { calcNaesinProb, calcJeongsiProb } from '@/lib/goal/calc/index.js';
//
// 모듈 구성
//   primitives.js  — 반올림/클램프, 학교 컷 구분, 잔여 회차, 내신(수시) 확률, 중·초 페널티
//   jeongsi.js     — 정시 백분위 밴드·노력량·확률, 백분위 칩, 영어 감점, 종합 백분위
//   bonus.js       — 일별 증분율(rate) 산출 + 하루치 증분(게이지) 계산
//   schedule.js    — 주간 학습시간 목표, 가용시간, 대학·학과 배율표
//   virtualDate.js — 가상 날짜 · 요일 인덱스 · 주차 경계
//
// 이식 원칙과 원본 병리 목록은 docs/figma-goal/calc-port-status.md 참고.
//
// 이름 충돌: 5개 모듈의 public export 43개(9+9+8+7+10) 사이에 중복 이름은 없다.
// 다만 일부 헬퍼가 모듈마다 사본으로 존재한다(아래 "사본 헬퍼" 주석 참고).

// ── bonus ───────────────────────────────────────────────────────────────
export {
  ACHIEVEMENT_MULTIPLIER,
  calcStudentBonusRates,
  calculateDailyBonus,
  FOCUS_MULTIPLIER,
  getAchievementRateMultiplier,
  TASK_BONUS_MULTIPLIER,
  TASK_MOCK_EXAM,
  TASK_NAESIN,
} from "./bonus.js";
// ── bonusV2 ─────────────────────────────────────────────────────────────
// 일별 기록 수식 v2(신시안 "오늘의 공부 기록" #26 전용, 원본 파리티 밖 — 자세한
// 배경은 bonusV2.js 헤더 참고). bonus.js(v1)와 이름이 겹치지 않아 같은 배럴에서
// 공존한다. getAchievementRateMultiplier/TASK_NAESIN/TASK_MOCK_EXAM/
// TASK_BONUS_MULTIPLIER 는 bonus.js 판이 정본이며 bonusV2.js 가 그대로 재사용한다
// (위 bonus export 절 참고 — 사본을 만들지 않는다).
export { CONDITION_MULTIPLIER, calculateDailyBonusV2 } from "./bonusV2.js";
// ── jeongsi ─────────────────────────────────────────────────────────────
export {
  calcJeongsiBaseProb,
  calcJeongsiCompositeFE,
  calcJeongsiProb,
  GRADE_PERCENTILE,
  getEnglishPenaltyFE,
  getPercentileBands,
  getPercentileChips,
  getTimeFactorPercentile,
  getWeightedEffortAmount,
} from "./jeongsi.js";
// ── pipeline ────────────────────────────────────────────────────────────
// 위 5개 모듈의 순수 함수를 원본 호출 순서대로 엮은 통합 조립 층. 새 계산 로직은 없다 —
// 원본(target/components/IntakeForm.tsx, target/api/student.mjs, target/App.tsx)의 배선만
// 재현한다. 이름 충돌 없음(위 43개 export 와 겹치는 이름이 없다).
//
// getConversionTypeForStudent/isMiddleStudent/isElementaryStudent/isPreHighStudent 는
// 성격상 primitives.js 소관이지만(학교급/학년 판정), 그 모듈이 골든 픽스처로 동결돼 있어
// pipeline.js 에 임시로 둔다 — 승격 검토 대상(pipeline.js 상단 주석 참고).
export {
  applyDailyRecord,
  buildInitialStudentState,
  getConversionTypeForStudent,
  isElementaryStudent,
  isMiddleStudent,
  isPreHighStudent,
} from "./pipeline.js";
// ── primitives ──────────────────────────────────────────────────────────
// round1 / round4 / clampProb / toNum 은 primitives 판을 정본으로 노출한다.
// jeongsi.js(round1/clampProb), schedule.js(toNum/round1), bonus.js(round4Server/
// round4Client)에도 같은 이름의 비공개 사본이 있으나 전부 export 하지 않는다.
// 특히 bonus 의 round4 는 원본에 server/client 두 벌이 있고 NaN 처리가 다르므로
// 절대 primitives.round4 로 통합하지 말 것 (calc-port-status.md 병리 목록 참고).
export {
  applyPreHighGradePenalty,
  calcNaesinProb,
  clampProb,
  getRemainingMogo,
  getRemainingNaesin,
  getSchoolCutType,
  round1,
  round4,
  toNum,
} from "./primitives.js";
// ── schedule ────────────────────────────────────────────────────────────
// calcAvailableHoursApprox 만 원본에 없는 우리 앱 전용 근사 어댑터다.
export {
  calcAvailableHours,
  calcAvailableHoursApprox,
  calculateWeekSchedule,
  getEffectiveScheduleTarget,
  getStudyMultiplier,
  sumWeeklySchedule,
  VIRTUAL_DAY_NAMES,
} from "./schedule.js";
// ── virtualDate ─────────────────────────────────────────────────────────
// schedule.js 안에도 toYMD/kstYMD/getDayIndexFromYMDServer/addDaysYMD 사본이
// 있지만 export 하지 않는다. 외부에서 쓸 때는 이 배럴(=virtualDate 판)을 쓸 것.
// getRecordDateFromActualStart/getRegularWeekIndexFromSundayCount 는 @deprecated —
// goal_daily_records 가 실제 달력 모델(diffDaysYMD)로 전환했다(virtualDate.js 참고).
export {
  addDaysYMD,
  diffDaysYMD,
  getDayIndexFromYMDServer,
  getFirstSundayYMD,
  getMondayYMD,
  getRecordDateFromActualStart,
  getRegularWeekIndexFromSundayCount,
  getWeeklyReportRange,
  isMiniStartDay,
  kstYMD,
  toYMD,
} from "./virtualDate.js";
