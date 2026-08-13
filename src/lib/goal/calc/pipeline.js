// 온보딩 → 확률/게이지 통합 파이프라인.
//
// calc/ 아래 5개 모듈(primitives/jeongsi/bonus/schedule/virtualDate)은 순수 함수 낱개만
// 이식돼 있다. 이 파일은 그 함수들을 원본(target)의 실제 호출 순서대로 엮어서, 온보딩 1건이
// 확률 4종·rate 4종·목표 학습시간까지 만들어내는 과정을 재현한다. 새 계산 로직은 없다 —
// 여기 있는 건 전부 "누가 무엇을 몇 번째로 호출하는가"의 배선이다.
//
// ── 원본 호출 순서 (읽은 그대로, 추측 없음) ────────────────────────────────
//
// [클라이언트] target/components/IntakeForm.tsx:1172-1284 (handleSubmit)
//   1. effectiveCurrentScore / effectiveGrade 결정 (고1+내신없음 특례. 이 파일은 관여하지 않음 —
//      호출자가 이미 해소한 currentScore/grade 를 넘겨야 한다)
//   2. effectiveCurrentMogo = calcJeongsiCompositeFE(form.mogoScores)         (1182)
//   3. weeklySchedule = calculateWeekSchedule()                              (1184, 내부에서 getStudyMultiplier·calcAvailableHours 사용)
//   4. payload 조립 후 POST { action:'saveStudentInfo', currentScore, currentMogo, weeklySchedule, ... }
//   5. 응답으로 받은 data.master.{ideal_susi,ideal_jungsi,min_susi,min_jungsi} 를 그대로 표시(재계산 없음)
//
// [서버] target/api/student.mjs:2405-2533 (action === 'saveStudentInfo')
//   1. { weekIdeal, weekMin } = sumWeeklySchedule(weeklySchedule)             (2416)
//   2. schoolCutType = getSchoolCutType(schoolType)                          (2420)
//   3. currentScore, currentMogo ← payload 그대로 (전처리 없음, toNum 만)     (2427-2428)
//   4. convertedGradeRaw = lookupConvertedGrade(schoolType, grade, currentScore)  (2430, DB grade_conversions)
//   5. convertedGrade = applyPreHighGradePenalty(schoolType, grade, convertedGradeRaw) (2432-2436)
//   6. [idealNaesinCut, idealJungsiCut, minNaesinCut, minJungsiCut] = getUnivCut(...) × 4 (2441-2446, DB universities, 병렬)
//   7. remainNaesin = isPreHighStudent(...) ? 0 : getRemainingNaesin(grade, lastNaesin, data.remainingNaesin) (2448-2450)
//   8. remainMogo = getRemainingMogo(grade, lastMogo, data.remainingMogo)    (2452)
//   9. idealSusi = calcNaesinProb(convertedGrade, idealNaesinCut, remainNaesin, 10)  (2454)
//      minSusi   = calcNaesinProb(convertedGrade, minNaesinCut,   remainNaesin, 10)  (2455)
//      idealJungsi = currentMogo>0 ? calcJeongsiProb(currentMogo, idealJungsiCut, remainMogo, 14) : 0 (2457-2459)
//      minJungsi   = currentMogo>0 ? calcJeongsiProb(currentMogo, minJungsiCut,   remainMogo, 14) : 0 (2461-2463)
//   10. bonusRates = calcStudentBonusRates(grade, idealSusi, idealJungsi, minSusi, minJungsi)  (2465-2471)
//       → 이 rate 는 여기서 **딱 한 번만** 계산되어 student 행에 저장된다. 이후 매일 제출 때
//         재계산되지 않는다(전체 저장소에 calcStudentBonusRates 호출부가 이 한 곳뿐임을 확인함).
//   11. row 에 ideal_susi/ideal_jungsi/min_susi/min_jungsi(확률 base값), *_bonus(rate),
//       week_ideal/week_min 을 함께 upsert. → **확률과 목표시간은 같은 트랜잭션에서 함께
//       저장될 뿐, 서로 입력이 아니다(독립 계산). 코드 상 순서는 week_ideal/week_min 계산이
//       먼저(2416)지만 확률 계산(2454-2463)과 데이터 의존은 없다.**
//
// 클라이언트/서버 경계: 정시 종합 백분위(calcJeongsiCompositeFE)와 주간 목표(calculateWeekSchedule)는
// 클라이언트가 계산해서 보내고, 서버는 그 값을 검증 없이 그대로 쓴다. 확률 4종·rate 4종·
// 변환등급·컷 조회는 전부 서버 전용이다(클라이언트는 결과만 받아 표시).
//
// [일별 게이지] target/App.tsx:1620-1631 (handleSaveStudy, 클라이언트)
//   bonuses = calculateDailyBonus(achievement, focus,
//     student.idealSusiBonus, student.idealJungsiBonus, student.minSusiBonus, student.minJungsiBonus,
//     tasks, studyHours, todaySchedule.ideal, todaySchedule.min)
//   → 서버(student.mjs:2609-2747, action==='saveStudy')는 이 값을 study_records 행에 그대로
//     저장할 뿐 재계산하지 않는다(2662-2667). 즉 **일별 증분은 클라이언트가 계산해 서버는 신뢰한다.**
//
// [현재 확률 = 기준값 + 누적 증분, 매 조회 시점에 재계산]
//   student.mjs:1034-1037 (updateProbabilityLog), 1413-1426, 1667-1680 에서 공통으로:
//     현재확률 = Math.min(100, Math.max(0, student.ideal_susi(base) + Σ study_records.ideal_susi_bonus))
//   round1 을 거치지 않는 순수 min/max 클램프다. student.ideal_susi 자체(=base)는 온보딩 이후
//   절대 갱신되지 않는다 — "현재 확률"은 저장된 값이 아니라 매번 base+누적을 다시 더해 구한다.
//   이 시스템의 핵심 설계가 여기서 나온다: **확률은 성적 함수가 아니라 매일 채우는 게이지다.**
//
// ── 우리에게 없는 데이터 (지어내지 않고 입력으로 노출) ──────────────────────
//   1. 목표 대학 컷(universities.avg_cut) — input.cuts = { idealNaesin, idealJungsi, minNaesin, minJungsi }
//   2. 변환등급표(grade_conversions) — 고1/고2/중학생/초등학생은 input.convertedGrade 로 직접 주입.
//      (단 고3은 conversionType 이 원본에서부터 빈 문자열이라 DB 조회 자체가 없다 — 원점수를
//      그대로 등급으로 쓴다. student.mjs:646-651 참고. 이 경로는 주입 없이도 동작한다.)
// 이 두 데이터가 확보되기 전까지 파이프라인은 (고3이 아닌 학년에 한해) 주입 없이 동작하지 않는다.

import {
  getSchoolCutType,
  getRemainingNaesin,
  getRemainingMogo,
  calcNaesinProb,
  applyPreHighGradePenalty,
} from "./primitives.js";

import { calcJeongsiProb, calcJeongsiCompositeFE } from "./jeongsi.js";

import { calcStudentBonusRates, calculateDailyBonus } from "./bonus.js";

import {
  VIRTUAL_DAY_NAMES,
  sumWeeklySchedule,
  calculateWeekSchedule,
} from "./schedule.js";

// ── 이식 누락 보충: student.mjs 의 네 판정 헬퍼 ─────────────────────────────
// 5개 calc 모듈에는 없었다(원본에서도 순수 함수이지만 지금까지 아무도 이식하지 않았다).
// 조립에 필수라 여기서 원본 그대로 옮긴다.
//
// NOTE: 이 4개는 성격상 primitives.js 소관이다(학교급/학년 판정이라는 점에서
// getSchoolCutType 과 같은 부류). 다만 primitives.js 는 이미 골든 픽스처 테스트로
// 동결돼 있어(기존 5개 모듈은 이번 작업 범위에서 건드리지 않기로 함) 여기 pipeline.js
// 로컬에 두고 export 한다 — **승격 검토 대상**. 다음에 손댈 사람은 primitives.js 로
// 옮기고 배럴(index.js) export 를 그쪽으로 옮기는 걸 고려할 것.

// student.mjs:646-651 — 학년/학교급별 변환등급표 종류. 빈 문자열이면 변환 자체가 없다(고3 등).
export function getConversionTypeForStudent(schoolType, grade) {
  if (schoolType === "초등학교") return "elementary";
  if (schoolType === "중학교" || grade === "중3") return "middleschool";
  if (grade === "고1" || grade === "고2") return "5grade";
  return "";
}

// student.mjs:679-686
export function isMiddleStudent(schoolType, grade) {
  return (
    schoolType === "중학교" ||
    grade === "중1" ||
    grade === "중2" ||
    grade === "중3"
  );
}

// student.mjs:688-698
export function isElementaryStudent(schoolType, grade) {
  return (
    schoolType === "초등학교" ||
    grade === "초1" ||
    grade === "초2" ||
    grade === "초3" ||
    grade === "초4" ||
    grade === "초5" ||
    grade === "초6"
  );
}

// student.mjs:700-702
export function isPreHighStudent(schoolType, grade) {
  return (
    isMiddleStudent(schoolType, grade) || isElementaryStudent(schoolType, grade)
  );
}

/**
 * 온보딩 입력 1건 → 확률 4종 · rate 4종 · 목표 학습시간 · 중간 산출물을 만든다.
 * 원본 호출 순서: 파일 상단 주석 참고. student.mjs:2405-2533 을 그대로 배선했다.
 *
 * @param {object} input
 * @param {string} input.schoolType 학교 유형(예: '일반고', '특목고')
 * @param {string} input.grade 학년(예: '고3')
 * @param {number} input.currentScore 내신 원점수/평균등급. 이미 해소된 값이어야 한다
 *   (IntakeForm.tsx:1176-1179 의 "고1+내신없음→중3 점수로 대체" 특례는 이 함수의 책임이 아니다 —
 *   호출자가 미리 해소해서 넘겨라).
 * @param {object|null} [input.mogoScores] calcJeongsiCompositeFE 에 넘길 모의고사 원본 회차별 점수.
 *   currentMogo 를 직접 주면 이 값은 무시된다.
 * @param {number|null} [input.currentMogo] 정시 종합 백분위를 이미 계산해 뒀다면 직접 주입.
 * @param {string} [input.lastNaesin] 마지막으로 본 내신 시험 라벨(예: '1학기 중간').
 * @param {string} [input.lastMogo] 마지막으로 본 모의고사 라벨(예: '6모').
 * @param {number|null} [input.remainingNaesin] getRemainingNaesin fallback 오버라이드.
 * @param {number|null} [input.remainingMogo] getRemainingMogo fallback 오버라이드.
 * @param {{idealNaesin:number, idealJungsi:number, minNaesin:number, minJungsi:number}} input.cuts
 *   목표 대학 컷 4종. universities 테이블이 없으므로 반드시 주입해야 한다.
 * @param {number|null} [input.convertedGrade] grade_conversions 변환등급 결과를 이미 알고 있다면 주입.
 *   고3처럼 conversionType 이 없는 학년에는 불필요하다(원점수를 그대로 쓴다).
 * @param {object|null} [input.weeklySchedule] 요일별 {ideal,min} 을 이미 계산해 뒀다면 직접 주입.
 * @param {object|null} [input.scheduleForm] calculateWeekSchedule 에 넘길 원본 계약 형태의 폼
 *   ({idealUniv,idealDept,minUniv,minDept,weekSchedule,selfStudyHours}). weeklySchedule 이 없을 때 사용.
 * @param {Date} [input.now] calcStudentBonusRates 의 D-day 계산 기준 시각(테스트 주입용).
 * @returns {object} 파생 상태 전체
 */
export function buildInitialStudentState(input) {
  const {
    schoolType,
    grade,
    currentScore,
    mogoScores = null,
    currentMogo: currentMogoOverride = null,
    lastNaesin = "",
    lastMogo = "",
    remainingNaesin = null,
    remainingMogo = null,
    cuts,
    convertedGrade: convertedGradeOverride = null,
    weeklySchedule: weeklyScheduleInput = null,
    scheduleForm = null,
    now = new Date(),
  } = input;

  if (!cuts) {
    throw new Error(
      "[pipeline] input.cuts 가 필요합니다 — universities 테이블(목표 대학 컷)이 확보되지 않았다. " +
        "input.cuts = { idealNaesin, idealJungsi, minNaesin, minJungsi } 형태로 주입하라.",
    );
  }

  // 1) 클라이언트: 정시 종합 백분위. IntakeForm.tsx:1180-1182
  const currentMogo =
    currentMogoOverride != null
      ? currentMogoOverride
      : mogoScores
        ? calcJeongsiCompositeFE(mogoScores)
        : 0;

  // 2) 클라이언트: 주간 목표 학습시간. IntakeForm.tsx:1184 → student.mjs:2416
  const weeklySchedule =
    weeklyScheduleInput ??
    (scheduleForm ? calculateWeekSchedule(scheduleForm) : null);
  if (!weeklySchedule) {
    throw new Error(
      "[pipeline] input.weeklySchedule 또는 input.scheduleForm 중 하나가 필요합니다.",
    );
  }
  const { weekIdeal, weekMin } = sumWeeklySchedule(weeklySchedule);

  // 3) 서버: 학교 컷 구분. student.mjs:2420
  const schoolCutType = getSchoolCutType(schoolType);

  // 4) 서버: 변환등급. student.mjs:2430-2436 (lookupConvertedGrade + applyPreHighGradePenalty)
  const conversionType = getConversionTypeForStudent(schoolType, grade);
  // student.mjs:655 — DB 조회 전에 항상 이 반올림을 거친다.
  const roundedScore = Math.round((Number(currentScore) || 0) * 10) / 10;

  let convertedGradeRaw;
  if (!conversionType) {
    // 원본: conversionType 이 없으면(고3 등) DB 조회 자체를 안 하고 원점수를 그대로 쓴다.
    convertedGradeRaw = roundedScore;
  } else if (convertedGradeOverride != null) {
    convertedGradeRaw = convertedGradeOverride;
  } else {
    throw new Error(
      `[pipeline] 미지원: grade=${grade}(schoolType=${schoolType})는 grade_conversions ` +
        `변환등급표(conversionType='${conversionType}')가 필요하다. input.convertedGrade 로 직접 주입하라.`,
    );
  }
  const convertedGrade = applyPreHighGradePenalty(
    schoolType,
    grade,
    convertedGradeRaw,
  );

  // 5) 서버: 잔여 시험 회차. student.mjs:2448-2452
  //
  // 원본은 isPreHighStudent 이면 remainNaesin 을 무조건 0 으로 덮어써서, 호출자가
  // remainingNaesin 오버라이드를 넘겨도 조용히 버려진다 — 이 파일 위쪽 getRemainingNaesin
  // 의 계약("fallback 이 주어지면 최우선으로 쓴다", primitives.js:50)과 정면으로
  // 모순된다. 그 결과 내신을 하나도 안 본 고1 학생이 remainNaesin=0 을 받는데,
  // calcNaesinProb(primitives.js:130-132)은 remainExams<=0 이면 시간 할인 계수를 건너뛰고
  // 원값을 낸다("성적 확정" 의미) — 불확실성이 가장 큰 학생이 확정 취급을 받아 실제로
  // 내신을 본 학생보다 더 높은 확률을 받는 결함으로 이어진다. 원본 고2·고3 은 이 문제가
  // 없다(IntakeForm.tsx:514-518 getNaesinNoneRemaining 이 직접 값을 계산해 넘기고, 학년
  // 가드가 고1만 막는다) — 고1만 조건 분기에 걸려 있던 원본 내부의 비대칭이다.
  // 여기서는 명시적 오버라이드가 있을 때만 그 값을 존중하도록 가드를 좁혀 이 비대칭을
  // 없앤다(사용자 승인). 오버라이드를 안 주는 기존 호출자는 동작이 완전히 같다 —
  // 원본과의 의도적 이탈이다. 근거·영향 범위는 calc/DIVERGENCE.md #1 참고.
  const remainNaesin =
    isPreHighStudent(schoolType, grade) && remainingNaesin == null
      ? 0
      : getRemainingNaesin(grade, lastNaesin, remainingNaesin);
  // remainMogo 에는 isPreHighStudent 가드가 없다 — getRemainingMogo 가 이미 오버라이드를
  // 그대로 존중하므로(위 remainNaesin 같은 모순이 없다) 손대지 않는다.
  const remainMogo = getRemainingMogo(grade, lastMogo, remainingMogo);

  // 6) 서버: 확률 4종. student.mjs:2454-2463
  const idealSusi = calcNaesinProb(
    convertedGrade,
    cuts.idealNaesin,
    remainNaesin,
    10,
  );
  const minSusi = calcNaesinProb(
    convertedGrade,
    cuts.minNaesin,
    remainNaesin,
    10,
  );
  const idealJungsi =
    currentMogo > 0
      ? calcJeongsiProb(currentMogo, cuts.idealJungsi, remainMogo, 14)
      : 0;
  const minJungsi =
    currentMogo > 0
      ? calcJeongsiProb(currentMogo, cuts.minJungsi, remainMogo, 14)
      : 0;

  // 7) 서버: 일별 증분율(rate) 4종 — 여기서 딱 한 번 계산되고 이후 고정된다. student.mjs:2465-2471
  const rates = calcStudentBonusRates(
    grade,
    idealSusi,
    idealJungsi,
    minSusi,
    minJungsi,
    now,
  );

  return {
    schoolType,
    grade,
    schoolCutType,

    currentScore: roundedScore,
    currentMogo,
    convertedGradeRaw,
    convertedGrade,

    cuts,
    remainNaesin,
    remainMogo,

    weeklySchedule,
    weekIdeal,
    weekMin,

    // "현재" 확률. 최초 상태에서는 누적 증분이 0이므로 기준값과 같다.
    idealSusi,
    idealJungsi,
    minSusi,
    minJungsi,

    rates,
    // 기준값(base) — student.ideal_susi 등, applyDailyRecord 에서 절대 변하지 않는다.
    baseProbs: { idealSusi, idealJungsi, minSusi, minJungsi },
    // 누적 증분 — study_records 전체 합, applyDailyRecord 가 매번 여기에 더한다.
    cumulativeBonus: { idealSusi: 0, idealJungsi: 0, minSusi: 0, minJungsi: 0 },
  };
}

/**
 * 하루치 학습 기록 1건을 게이지에 반영한다. 상태를 변이시키지 않고 새 상태를 반환한다.
 * 원본 호출 순서: App.tsx:1620-1631(calculateDailyBonus) → student.mjs:1034-1037(클램프).
 *
 * @param {object} state buildInitialStudentState 또는 이전 applyDailyRecord 의 반환값.
 * @param {object} record
 * @param {string} record.achievement 성취도 키(full/high/mid/low/none)
 * @param {string} record.focus 집중도 키(excellent/good/normal/low/veryLow)
 * @param {string[]} [record.tasks] 오늘 한 학습 유형 태그(예: '내신 과목', '기출/모의고사')
 * @param {number} record.studyHours 실제 학습 시간
 * @param {number|null} [record.virtualDayIndex] 0(월)~6(일). idealHours/minHours 를
 *   직접 주지 않으면 state.weeklySchedule 에서 이 인덱스로 오늘 목표를 찾는다.
 * @param {number|null} [record.idealHours] 오늘 이상 목표 시간을 직접 주입(일요일 보충 로직처럼
 *   weeklySchedule 만으로 못 구하는 경우용 — 원본의 getSundayRemainingScheduleFromRecords 는
 *   이 5개 calc 모듈 범위 밖이라 이식하지 않았다. 호출자가 미리 구해서 넘겨야 한다).
 * @param {number|null} [record.minHours] 오늘 최소 목표 시간 직접 주입.
 *
 * ⚠️ 일요일 구멍: 원본은 그 주에 못 채운 자습시간을 일요일에 몰아주는 별도 계산
 * (`getSundayRemainingScheduleFromRecords`, App.tsx)이 있는데 이 파이프라인은 이식하지
 * 않았다. `record.virtualDayIndex === 6`(일요일)이고 `idealHours`/`minHours` 를 직접
 * 주입하지 않으면, `state.weeklySchedule.sunday` 가 없는 한 `{ideal:0, min:0}` 으로
 * 폴백한다. 이때 **`studyHours === 0` 이면 무감점(zeroBonus, bonus.js:200-202)이지만,
 * `studyHours > 0` 이면 "목표 0 이하는 달성률 100% 로 간주"하는 원본 규칙(bonus.js:224-226)
 * 때문에 오히려 그날치 rate 전액을 정상적으로(성취도·집중도 배수만 적용해) 받는다.**
 * 즉 일요일 목표를 안 채워주면 "목표 없음"이 "이미 다 채움"과 동일하게 취급된다 —
 * 일요일 보충을 정확히 재현하려면 반드시 `record.idealHours`/`record.minHours` 를 호출자가
 * 구해서 넘겨야 한다.
 * @returns {object} 새 상태(원본 state 는 변형하지 않는다)
 */
export function applyDailyRecord(state, record) {
  const {
    achievement,
    focus,
    tasks = [],
    studyHours,
    virtualDayIndex = null,
    idealHours: idealHoursInput = null,
    minHours: minHoursInput = null,
  } = record;

  let idealHours = idealHoursInput;
  let minHours = minHoursInput;

  if (idealHours == null || minHours == null) {
    if (virtualDayIndex == null) {
      throw new Error(
        "[pipeline] record.virtualDayIndex 또는 record.idealHours/minHours 직접 주입 중 하나가 필요합니다.",
      );
    }
    const dayName = VIRTUAL_DAY_NAMES[virtualDayIndex];
    const daySchedule = state.weeklySchedule[dayName] || { ideal: 0, min: 0 };
    if (idealHours == null) idealHours = daySchedule.ideal;
    if (minHours == null) minHours = daySchedule.min;
  }

  // App.tsx:1620-1631
  const bonuses = calculateDailyBonus(
    achievement,
    focus,
    state.rates.idealSusiBonus,
    state.rates.idealJungsiBonus,
    state.rates.minSusiBonus,
    state.rates.minJungsiBonus,
    tasks,
    studyHours,
    idealHours,
    minHours,
  );

  const cumulativeBonus = {
    idealSusi: state.cumulativeBonus.idealSusi + bonuses.idealSusiBonus,
    idealJungsi: state.cumulativeBonus.idealJungsi + bonuses.idealJungsiBonus,
    minSusi: state.cumulativeBonus.minSusi + bonuses.minSusiBonus,
    minJungsi: state.cumulativeBonus.minJungsi + bonuses.minJungsiBonus,
  };

  // student.mjs:1034-1037 — round1 을 거치지 않는 순수 min/max 클램프.
  const clamp = (base, delta) => Math.min(100, Math.max(0, base + delta));

  return {
    ...state,
    cumulativeBonus,
    idealSusi: clamp(state.baseProbs.idealSusi, cumulativeBonus.idealSusi),
    idealJungsi: clamp(
      state.baseProbs.idealJungsi,
      cumulativeBonus.idealJungsi,
    ),
    minSusi: clamp(state.baseProbs.minSusi, cumulativeBonus.minSusi),
    minJungsi: clamp(state.baseProbs.minJungsi, cumulativeBonus.minJungsi),
    lastBonuses: bonuses,
  };
}
