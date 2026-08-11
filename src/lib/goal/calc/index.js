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

// ── primitives ──────────────────────────────────────────────────────────
// round1 / round4 / clampProb / toNum 은 primitives 판을 정본으로 노출한다.
// jeongsi.js(round1/clampProb), schedule.js(toNum/round1), bonus.js(round4Server/
// round4Client)에도 같은 이름의 비공개 사본이 있으나 전부 export 하지 않는다.
// 특히 bonus 의 round4 는 원본에 server/client 두 벌이 있고 NaN 처리가 다르므로
// 절대 primitives.round4 로 통합하지 말 것 (calc-port-status.md 병리 목록 참고).
export {
  toNum,
  round1,
  round4,
  clampProb,
  getSchoolCutType,
  getRemainingNaesin,
  getRemainingMogo,
  calcNaesinProb,
  applyPreHighGradePenalty,
} from './primitives.js';

// ── jeongsi ─────────────────────────────────────────────────────────────
export {
  GRADE_PERCENTILE,
  getPercentileBands,
  getWeightedEffortAmount,
  calcJeongsiBaseProb,
  getTimeFactorPercentile,
  calcJeongsiProb,
  getPercentileChips,
  getEnglishPenaltyFE,
  calcJeongsiCompositeFE,
} from './jeongsi.js';

// ── bonus ───────────────────────────────────────────────────────────────
export {
  ACHIEVEMENT_MULTIPLIER,
  FOCUS_MULTIPLIER,
  TASK_BONUS_MULTIPLIER,
  TASK_NAESIN,
  TASK_MOCK_EXAM,
  calcStudentBonusRates,
  getAchievementRateMultiplier,
  calculateDailyBonus,
} from './bonus.js';

// ── schedule ────────────────────────────────────────────────────────────
// calcAvailableHoursApprox 만 원본에 없는 우리 앱 전용 근사 어댑터다.
export {
  VIRTUAL_DAY_NAMES,
  sumWeeklySchedule,
  getEffectiveScheduleTarget,
  getStudyMultiplier,
  calcAvailableHours,
  calculateWeekSchedule,
  calcAvailableHoursApprox,
} from './schedule.js';

// ── virtualDate ─────────────────────────────────────────────────────────
// schedule.js 안에도 toYMD/kstYMD/getDayIndexFromYMDServer/addDaysYMD 사본이
// 있지만 export 하지 않는다. 외부에서 쓸 때는 이 배럴(=virtualDate 판)을 쓸 것.
export {
  toYMD,
  kstYMD,
  getRecordDateFromActualStart,
  getDayIndexFromYMDServer,
  addDaysYMD,
  getMondayYMD,
  getFirstSundayYMD,
  isMiniStartDay,
  getWeeklyReportRange,
  getRegularWeekIndexFromSundayCount,
} from './virtualDate.js';
