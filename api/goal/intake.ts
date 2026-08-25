// POST /api/goal/intake
// Authorization: Bearer <access_token>
//
// 목표관리 온보딩(7단계 위저드) 1건을 저장하고, 확률 4종 · 일별 증분율 4종 ·
// 요일별 목표 학습시간을 산출해 학생 마스터 행을 만든다.
//
// 요청 바디는 GoalOnboardingContext state 를 그대로 받는다
// (GoalOnboardingContext.jsx:58-69 — 클라이언트가 이미 sessionStorage 에 이 모양으로 갖고 있다).
// 계약 전문은 docs/figma-goal/goal-schema-design.md §9-3.
//
// ── 원본(외부 target 앱)과 다르게 가는 지점 ────────────────────────────────
//  1. 원본은 전 API 가 무인증이고 `code` 문자열만 알면 타인 데이터를 쓸 수 있었다.
//     여기서는 profile_id 가 오직 auth.getUser(token).user.id 에서만 나온다.
//  2. 원본은 확률·주간목표를 **브라우저**가 계산해 보내고 서버가 그대로 저장했다
//     (IntakeForm.tsx:1172-1284 → student.mjs:2405-2533). 여기서는 클라이언트가
//     확률에 영향을 주는 값을 하나도 보내지 않는다 — 전부 이 파일이 서버에서
//     src/lib/goal/calc/ 를 호출해 만든다.
//  3. CORS 헤더를 붙이지 않는다. Authorization 은 CORS-safelisted 헤더가 아니라
//     크로스오리진 요청은 preflight 를 유발하고 OPTIONS 는 405 로 떨어진다 —
//     이것이 기본 방어선이다(§9-1).
//  4. "성적 없음" 특례(원본 naesinNone/mogoNone, IntakeForm.tsx:1176-1181)는 세 군데가
//     원본과 다르다. (a) 원본이 받는 0~100 원점수 대신 1~9 등급을 받는다 —
//     grade_conversions 변환표가 없고 우리는 전 구간이 단일 등급 스케일이다.
//     (b) 고2·고3 모의고사 "가상 3회차 입력"은 포팅하지 않았다 — 전 회차 없음이
//     이미 정상 경로라 막히지 않는다(정시 확률만 0). (c) 고1 치환 경로의
//     remainingMogo 를 보정한다(원본 결함 회피 — 아래 오버라이드 주석 참고).
//     학습성향 설문 6문항도 포팅하지 않았다 — 원본 서버에서 참조 0건이라 확률에
//     영향이 없다.
//
// 계산 모듈은 동결돼 있다(203개 테스트). 여기서 재구현하지 않고 import 만 한다.
// 특히 요일별 목표는 calculateWeekSchedule 을 그대로 호출한다 — 자습시간
// 오버라이드 규칙을 이 파일에 베껴 쓰면 두 벌이 갈린다(buildWeeklySchedule 주석 참고).

import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  buildInitialStudentState,
  calcAvailableHoursApprox,
  calcJeongsiCompositeFE,
  calculateWeekSchedule,
  GRADE_PERCENTILE,
  getRemainingMogo,
  getSchoolCutType,
  kstYMD,
  round1,
} from "../../src/lib/goal/calc/index.js";
import type { CutsInput } from "../../src/lib/goal/calc/pipeline.js";

import {
  appendProbabilityLog,
  buildStudentPayload,
  fetchProfileName,
  fetchStudentRow,
  fetchStudentStateRow,
  fetchTargetCuts,
  narrowGoalSession,
  openGoalSession,
  PAID_MESSAGE,
  upsertStudentRow,
} from "../_lib/goalRepo.js";
import { sendError } from "../_lib/httpResponse.js";

export const config = { runtime: "nodejs" };

// ---------------------------------------------------------------------------
// 온보딩 코드값 → 계산 모듈 리터럴 (§7-4)
//
// getSchoolCutType(primitives.js:43-47)은 정확히 '특목,자사,영재고' 또는 '특목고'
// 두 리터럴만 special 로 판정한다. '특목・자사고'(온보딩 라벨)나 'special'(코드값)을
// 그대로 저장하면 특목고 학생이 조용히 일반고 컷으로 계산된다.
// calcStudentBonusRates(bonus.js:113-122)의 학년 오프셋도 '고1'/'고2' 리터럴 비교다.
// ---------------------------------------------------------------------------

const SCHOOL_TYPE_MAP = {
  general: "일반고",
  special: "특목고", // 미결 Q6 — '특목,자사,영재고' 와 둘 다 special 로 판정된다
};

// 중학교·초등학교는 grade_conversions 변환표가 필요해 아직 지원하지 않는다(§7-5, 미결 Q7).
const UNSUPPORTED_SCHOOL_TYPES = ["middle", "elementary"];

const GRADE_MAP = {
  g1: "고1",
  g2: "고2",
  g3: "고3",
};

// 라벨이 getRemainingNaesin 표의 키(primitives.js:59-72)와 글자 단위로 일치해야 한다.
const NAESIN_ROUNDS = [
  { key: "s1mid", label: "1학기 중간" },
  { key: "s1final", label: "1학기 기말" },
  { key: "s2mid", label: "2학기 중간" },
  { key: "s2final", label: "2학기 기말" },
];

// 라벨이 getRemainingMogo 표의 키(primitives.js:88-103)와 일치해야 한다.
// ⚠️ 고3 전용 '5모'·'7모' 는 우리 온보딩에 없어 고3 remain_mogo 가 실제보다
// 최대 2 크게 나온다(미결 Q9 — 계산 모듈 동결 + 시안에 없어 그대로 둔다).
const MOCK_ROUNDS = [
  { key: "mar", label: "3모" },
  { key: "jun", label: "6모" },
  { key: "sep", label: "9모" },
  { key: "oct", label: "10모" },
];

const MOCK_SUBJECTS = ["kor", "math", "eng", "tam1", "tam2"];

// ---------------------------------------------------------------------------
// "성적 없음" 특례의 잔여 회차 오버라이드 표
//
// 원본 getNaesinNoneRemaining / getMogoNoneRemaining(IntakeForm.tsx:514-523)을 옮긴 것.
// 의미는 "작년 마지막 시험까지는 본 것으로 친다"이고, 값은 그 산술적 등가물이다 —
//   내신(총 10회, getRemainingNaesin 표 primitives.js:59-72):
//     고1 → 직전 고교 시험이 아예 없음                → 10 - 0 = 10 (전량)
//     고2 → 직전이 '고1_2학기 기말'(순번 4)  → 10 - 4 = 6
//     고3 → 직전이 '고2_2학기 기말'(순번 8)  → 10 - 8 = 2
//   모의(총 14회, getRemainingMogo 표 primitives.js:88-103):
//     고1 → 직전 고교 모의고사가 아예 없음              → 14 - 0 = 14 (전량)
//     고2 → 직전이 '고1_10모'(순번 4)        → 14 - 4 = 10
//     고3 → 직전이 '고2_10모'(순번 8)        → 14 - 8 = 6
//
// 고1 항목은 원본에 없었다(IntakeForm.tsx:1268-1269 grade!=='고1' 가드) — 원본 서버가
// isPreHighStudent 이면 remainNaesin 을 조건 분기로 무조건 0 덮어써서 고1 오버라이드가
// 애초에 무의미했기 때문이다(원본 내부 비대칭, calc/DIVERGENCE.md #1). 우리는 그 가드를
// pipeline.js:219-222 에서 "오버라이드가 없을 때만" 으로 좁혀 세 학년 모두 오버라이드가
// 실제로 적용되게 했다(사용자 승인) — 그래서 여기 표도 고1 을 채운다.
const NAESIN_NONE_REMAINING = { 고1: 10, 고2: 6, 고3: 2 };
const MOGO_NONE_REMAINING = { 고1: 14, 고2: 10, 고3: 6 };

// onboardingOptions.js:64-72 WEEKDAY_OPTIONS ↔ VIRTUAL_DAY_NAMES(schedule.js:18-26).
// 원본 DAYS_CONFIG 와 동일하게 월~금만 등교일이다.
const WEEKDAYS = [
  { short: "mon", long: "monday", hasSchool: true },
  { short: "tue", long: "tuesday", hasSchool: true },
  { short: "wed", long: "wednesday", hasSchool: true },
  { short: "thu", long: "thursday", hasSchool: true },
  { short: "fri", long: "friday", hasSchool: true },
  { short: "sat", long: "saturday", hasSchool: false },
  { short: "sun", long: "sunday", hasSchool: false },
];

// onboardingOptions.js:76-81 DAILY_SCHEDULE_FIELDS 의 min/max 와 글자 단위로 같다.
const DAILY_SCHEDULE_LIMITS = {
  wakeUpHour: { min: 0, max: 23 },
  sleepHour: { min: 0, max: 24 },
  schoolStayHours: { min: 0, max: 24 },
  academyHours: { min: 0, max: 24 },
};

const NAME_MAX_LENGTH = 100;
const STUDY_HOURS_MAX = 24;

// ---------------------------------------------------------------------------
// 입력 검증 — 클라이언트 값을 하나도 믿지 않는다
// ---------------------------------------------------------------------------

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * 숫자로 해석해도 되는 원시값인가.
 *
 * ⚠ 이 가드가 없으면 검증기(Number 기반)와 저장·소비(clean → 문자열)의 정의역이
 *   갈린다. Number(true) = 1 이라 boolean 이 검증을 통과하는데 clean(true) = "true"
 *   라 이후 Number("true") = NaN 이 되고, 그 NaN 이 두 갈래로 샌다.
 *     (a) 모의고사: gradeToPercentile 이 GRADE_PERCENTILE[NaN] → undefined 를 읽어
 *         TypeError → intake 최상위 catch → 500. 설계된 400 이 아니다.
 *     (b) 내신:     round1 이 NaN 을 0 으로 접어 current_score 가 0 이 되고
 *         (컬럼 주석은 1~9 등급이라고 명시한다), applyPreHighGradePenalty 의
 *         clamp(1, 9)가 이를 **1등급(최상위)** 으로 올린다 — 아래 "전 회차 없음"
 *         거절(NAESIN_ROUNDS.every)이 막으려는 바로 그 경로가 재개통된다.
 *   객체·배열·boolean·null 을 원천 차단하고, 통과한 값은 normalizeGrade 로
 *   숫자에서 되짚어 만든 문자열만 쓴다(clean 을 쓰지 않는다).
 */
function isNumericInput(raw: unknown) {
  return typeof raw === "number" || typeof raw === "string";
}

// Step4Naesin.jsx:8-11 / Step5MockExam.jsx:8-11 의 isValidGrade 와 동일한 규칙.
// (빈 문자열·공백은 Number('') = 0 이라 아래 범위 검사에서 걸린다.)
function isValidGrade(raw: unknown) {
  if (!isNumericInput(raw)) return false;
  const num = Number(raw);
  return Number.isFinite(num) && num >= 1 && num <= 9;
}

/**
 * isValidGrade 를 통과한 값 → 정규화된 숫자 문자열.
 * clean() 을 쓰면 검증(Number)과 저장(String)의 정의역이 갈리므로 쓰지 않는다.
 * 여기서 한 번 숫자로 접어 두면 이후 소비 지점이 전부 같은 값을 본다 —
 * deriveNaesin 의 Number(), gradeToPercentile 의 Number(),
 * calcJeongsiCompositeFE 의 parseFloat(s.eng)(jeongsi.js:205).
 */
function normalizeGrade(raw: unknown) {
  return String(Number(raw));
}

function isValidHours(raw: unknown, max: number) {
  if (!isNumericInput(raw)) return false;
  const num = Number(raw);
  return Number.isFinite(num) && num >= 0 && num <= max;
}

// unwrapped {status, body}를 돌려준다 — 호출부가 항상 `return { error: fail(...) }`
// 형태의 object literal로 감싸야 TS가 형제 프로퍼티를 undefined로 자동 추론해
// validated.error / validated.input 접근이 좁혀진다(순수 타입 추론 편의, 런타임
// JSON 응답 바이트는 이전과 동일 — { error: { status, body: { detail } } }).
function fail(detail: string) {
  return { status: 400, body: { detail } };
}

function validateTarget(value: unknown, label: string) {
  if (!isPlainObject(value))
    return { error: fail(`${label} 정보가 올바르지 않습니다.`) };

  const university = clean(value.university);
  const department = clean(value.department);

  if (!university) return { error: fail(`${label} 대학을 선택해 주세요.`) };
  if (
    university.length > NAME_MAX_LENGTH ||
    department.length > NAME_MAX_LENGTH
  ) {
    return { error: fail(`${label} 대학·학과 이름이 너무 깁니다.`) };
  }

  return { value: { university, department } };
}

/** 요청 바디 전체를 화이트리스트로 검증하고 정규화한다. */
function validateIntakeBody(body: unknown) {
  if (!isPlainObject(body))
    return { error: fail("요청 본문이 올바르지 않습니다.") };

  // ── 학교 유형 · 학년 ──────────────────────────────────────────────────
  const schoolType = clean(body.schoolType);

  if (UNSUPPORTED_SCHOOL_TYPES.includes(schoolType)) {
    return {
      error: {
        status: 501,
        body: {
          detail: "중학교·초등학교 목표관리는 아직 준비 중입니다.",
          reason: "grade_unsupported",
        },
      },
    };
  }

  if (!SCHOOL_TYPE_MAP[schoolType])
    return { error: fail("학교 유형을 선택해 주세요.") };

  const grade = clean(body.grade);
  if (!GRADE_MAP[grade]) return { error: fail("학년을 선택해 주세요.") };

  // ── 목표 대학 ────────────────────────────────────────────────────────
  const idealTarget = validateTarget(body.upperUniversity, "이상 목표");
  if (idealTarget.error) return { error: idealTarget.error };

  const minTarget = validateTarget(body.lowerUniversity, "최소 목표");
  if (minTarget.error) return { error: minTarget.error };

  // ── 내신 ─────────────────────────────────────────────────────────────
  if (!isPlainObject(body.naesin))
    return { error: fail("내신 성적이 올바르지 않습니다.") };

  const naesin: Record<string, { value: string; none: boolean }> = {};
  for (const { key, label } of NAESIN_ROUNDS) {
    const entry = body.naesin[key];
    if (!isPlainObject(entry))
      return { error: fail(`내신 ${label} 입력이 누락되었습니다.`) };

    if (entry.none === true) {
      naesin[key] = { value: "", none: true };
      continue;
    }

    if (!isValidGrade(entry.value)) {
      return { error: fail(`내신 ${label} 등급은 1~9 사이여야 합니다.`) };
    }
    naesin[key] = { value: normalizeGrade(entry.value), none: false };
  }

  // ── 내신 "전 회차 없음" 특례 ─────────────────────────────────────────
  //
  // 전 회차가 '없음'이면 평균을 낼 회차가 없어 currentScore 가 0 이 되는데,
  // applyPreHighGradePenalty 가 이를 [1, 9] 로 클램프해(primitives.js:169)
  // **1등급(최상위)** 으로 접어버린다 — 성적 미입력이 조용히 최고 확률로 둔갑한다.
  // 예전에는 이 구멍을 막으려고 여기서 400 으로 거절했고, 그 결과 내신이 아직
  // 하나도 없는 고1 3월 학생은 온보딩 자체를 진행할 수 없었다.
  //
  // 이제는 원본과 같이 "이전 단계까지의 내신 평균 등급"을 받아 그 자리를 메운다
  // (원본 effectiveCurrentScore, IntakeForm.tsx:1176-1179). 값이 있으니 0 클램프
  // 경로는 애초에 성립하지 않는다.
  //
  // ⚠ 원본과 의도적으로 다른 점: 원본은 0~100 **원점수**(midScoreForNaesin,
  //   IntakeForm.tsx:1425-1436)를 받아 서버가 grade_conversions('middleschool')
  //   표로 등급 환산한다(student.mjs:646-677). 우리 dev DB 에는 그 표가 없고,
  //   우리 온보딩은 전 구간이 1~9 등급 단일 스케일이다(sql/55 current_score
  //   컬럼 코멘트가 이 원칙을 명문화한다). 0~100 을 그대로 넘기면 위의 clamp(1,9)가
  //   87.5 점을 9등급(최하위)으로 접는다. 그래서 여기서는 **1~9 등급**으로 받고,
  //   기존 isValidGrade / normalizeGrade 를 그대로 재사용한다
  //   (boolean·객체 차단 사유는 isNumericInput 주석 참고).
  //
  // 섹션 단위 "없음"을 새 전역 플래그로 받지 않고 4회차 상태에서 파생하는 이유:
  // 전역 플래그를 두면 "플래그 OFF인데 4회차 전부 none" 같은 모순 상태가 생기고
  // 검증기가 그 모순까지 판정해야 한다. 파생이면 판정이 단 하나다.
  // biome-ignore lint/style/noNonNullAssertion: naesin은 바로 위 루프에서 NAESIN_ROUNDS 전체 키를 채웠으므로 항상 존재한다.
  const naesinAllNone = NAESIN_ROUNDS.every(({ key }) => naesin[key]!.none);
  let priorNaesinGrade = "";

  if (naesinAllNone) {
    if (!isValidGrade(body.priorNaesinGrade)) {
      return {
        error: fail(
          "내신 성적이 없다면 이전까지의 내신 평균 등급을 1~9 사이로 입력해 주세요.",
        ),
      };
    }
    priorNaesinGrade = normalizeGrade(body.priorNaesinGrade);
  }
  // 4회차 전부 none 이 아니면 body.priorNaesinGrade 는 통째로 무시한다(저장도 안 한다) —
  // 화면에 보이지 않는 값이 조용히 계산이나 저장에 섞이지 않게 한다.

  // ── 모의고사 ─────────────────────────────────────────────────────────
  if (!isPlainObject(body.mockExam))
    return { error: fail("모의고사 성적이 올바르지 않습니다.") };

  const mockExam: Record<string, Record<string, unknown>> = {};
  for (const { key, label } of MOCK_ROUNDS) {
    const entry = body.mockExam[key];
    if (!isPlainObject(entry))
      return { error: fail(`모의고사 ${label} 입력이 누락되었습니다.`) };

    if (entry.none === true) {
      mockExam[key] = { none: true };
      continue;
    }

    // Step5MockExam.jsx:21-24 와 동일하게 5과목 전부를 요구한다.
    const round: Record<string, unknown> = { none: false };
    for (const subject of MOCK_SUBJECTS) {
      if (!isValidGrade(entry[subject])) {
        return {
          error: fail(
            `모의고사 ${label} 등급은 5과목 모두 1~9 사이여야 합니다.`,
          ),
        };
      }
      round[subject] = normalizeGrade(entry[subject]);
    }
    mockExam[key] = round;
  }

  // 모의고사 전 회차 '없음'. 내신과 달리 추가 입력을 받지 않는다 — 이미 정상 경로다
  // (currentMogo = 0 → 정시 확률 2종 0, buildMogoScores 주석 참고).
  // 잔여 회차 오버라이드에만 쓴다(아래 §remaining 오버라이드).
  // biome-ignore lint/style/noNonNullAssertion: mockExam은 바로 위 루프에서 MOCK_ROUNDS 전체 키를 채웠으므로 항상 존재한다.
  const mockAllNone = MOCK_ROUNDS.every(({ key }) => mockExam[key]!.none);

  // ── 자습 시간 · 하루 일과 ────────────────────────────────────────────
  if (!isPlainObject(body.studyHours))
    return { error: fail("요일별 자습 시간이 올바르지 않습니다.") };

  const studyHours: Record<string, number> = {};
  for (const { short } of WEEKDAYS) {
    if (!isValidHours(body.studyHours[short], STUDY_HOURS_MAX)) {
      return { error: fail("요일별 자습 시간은 0~24 사이여야 합니다.") };
    }
    studyHours[short] = Number(body.studyHours[short]);
  }

  if (!isPlainObject(body.dailySchedule))
    return { error: fail("하루 일과가 올바르지 않습니다.") };

  const dailySchedule: Record<string, number> = {};
  for (const [field, limit] of Object.entries(DAILY_SCHEDULE_LIMITS)) {
    const raw = body.dailySchedule[field];
    const value = Number(raw);
    // isNumericInput 가드 사유는 isValidGrade 와 같다 — boolean·객체가 Number 로
    // 조용히 0/1 이 되는 경로를 열어 두지 않는다.
    if (
      !isNumericInput(raw) ||
      !Number.isFinite(value) ||
      value < limit.min ||
      value > limit.max
    ) {
      return {
        error: fail(
          `하루 일과 값이 허용 범위(${limit.min}~${limit.max})를 벗어났습니다.`,
        ),
      };
    }
    dailySchedule[field] = value;
  }

  return {
    input: {
      schoolType,
      grade,
      ideal: idealTarget.value,
      min: minTarget.value,
      naesin,
      naesinAllNone,
      priorNaesinGrade,
      mockExam,
      mockAllNone,
      studyHours,
      dailySchedule,
    },
  };
}

// ---------------------------------------------------------------------------
// 파생값 — 전부 동결된 계산 모듈에 위임한다
// ---------------------------------------------------------------------------

/**
 * 내신: none 이 아닌 회차의 등급 평균과 마지막 회차 라벨.
 *
 * 전 회차 none 이면 taken 이 빈 배열이라 아래 본문이
 * taken[taken.length - 1].label 에서 TypeError 를 던지고(최상위 catch → 500)
 * 평균도 0/0 = NaN 이 된다. 그래서 그 경우를 **먼저** 갈라낸다:
 * priorNaesinGrade(이전 단계까지의 평균 등급)로 점수를 대체하고 라벨은 '' 로 둔다.
 *
 * 라벨을 '' 로 두면 getRemainingNaesin 표가 미매칭이라 남은 회차가 0 이 되는데
 * (primitives.js:76), 그 자리는 호출부가 remainingNaesin 오버라이드로 메운다.
 * 가짜 라벨('2학기 기말' 등)을 지어내지 않는 이유는 그 값이 last_naesin_exam 으로
 * 그대로 저장돼 "보지도 않은 시험을 본 것"으로 기록되기 때문이다.
 */
function deriveNaesin(naesin, { naesinAllNone, priorNaesinGrade }) {
  if (naesinAllNone) {
    return {
      currentScore: round1(Number(priorNaesinGrade)),
      lastNaesinExam: "",
    };
  }

  const taken = NAESIN_ROUNDS.filter(({ key }) => !naesin[key].none);
  const sum = taken.reduce(
    (acc, { key }) => acc + Number(naesin[key].value),
    0,
  );

  return {
    currentScore: round1(sum / taken.length),
    // biome-ignore lint/style/noNonNullAssertion: naesinAllNone이 false인 이 분기에서는 taken에 최소 1개 회차가 있다.
    lastNaesinExam: taken[taken.length - 1]!.label,
  };
}

/**
 * 등급 1~9 → 백분위. GRADE_PERCENTILE 밴드의 중앙값을 쓴다 —
 * 원본 칩 UI 의 "(안정)" 라벨이 붙는 값과 같다(getPercentileChips, jeongsi.js:162).
 *
 * GRADE_PERCENTILE(jeongsi.js:138-148)의 키는 정수 1~9 뿐인데 온보딩 검증은
 * 소수 등급(2.5 등)도 통과시키므로, 밴드 조회 전에 반올림 후 [1,9] 로 클램프한다.
 * (영어는 이 환산을 타지 않는다 — 아래 buildMogoScores 참고.)
 */
function gradeToPercentile(rawGrade) {
  const numeric = Number(rawGrade);
  // 방어선. validateIntakeBody 가 normalizeGrade 로 정규화하므로 정상 경로에서는
  // 걸리지 않는다. Math.round(NaN) = NaN → Math.max(1, NaN) = NaN 이라 클램프가
  // NaN 을 통과시키고 GRADE_PERCENTILE[NaN] = undefined 를 읽어 TypeError 가 나던
  // 자리다 — 검증기를 통과한 입력으로 엔드포인트를 죽일 수 있었다.
  if (!Number.isFinite(numeric)) {
    throw new Error(
      `[intake] gradeToPercentile: 등급이 숫자가 아니다 (${String(rawGrade)})`,
    );
  }
  const index = Math.min(9, Math.max(1, Math.round(numeric)));
  // biome-ignore lint/style/noNonNullAssertion: index는 항상 1~9로 클램프되고 GRADE_PERCENTILE는 1~9 전부 정의됨
  const band = GRADE_PERCENTILE[index]!;
  return Math.round((band.min + band.max) / 2);
}

/**
 * calcJeongsiCompositeFE(jeongsi.js:195-212)가 요구하는 회차별 객체를 만든다.
 *
 * 주의점 세 가지(전부 원본 동작이며 파리티를 유지해야 한다):
 *  - eng 는 백분위가 아니라 **등급 문자열** 그대로다(getEnglishPenaltyFE 가
 *    소수 등급을 선형보간하므로 반올림하지 않고 원문을 넘긴다).
 *  - 영어는 평균이 아니라 "마지막으로 값이 있는 회차"가 덮어쓴다. 그래서 회차
 *    삽입 순서(mar → jun → sep → oct)가 결과를 바꾼다.
 *  - none 회차는 객체에서 아예 제외한다. 포함하면 미입력 과목 평균 0 이
 *    3분할에 들어가 종합 백분위가 크게 낮아진다(jeongsi.js:207-209).
 *    전 회차가 none 이면 빈 객체 → currentMogo 0 → 정시 확률 2종이 0 이 되는데,
 *    이는 정상 경로다(pipeline.js:227-228).
 */
function buildMogoScores(mockExam) {
  const scores = {};

  for (const { key } of MOCK_ROUNDS) {
    const round = mockExam[key];
    if (round.none) continue;

    scores[key] = {
      kor: { percentile: gradeToPercentile(round.kor) },
      math: { percentile: gradeToPercentile(round.math) },
      eng: round.eng,
      exp1: { percentile: gradeToPercentile(round.tam1) },
      exp2: { percentile: gradeToPercentile(round.tam2) },
    };
  }

  return scores;
}

function deriveMogo(mockExam) {
  const taken = MOCK_ROUNDS.filter(({ key }) => !mockExam[key].none);

  return {
    currentMogo: calcJeongsiCompositeFE(buildMogoScores(mockExam)),
    // biome-ignore lint/style/noNonNullAssertion: 직전 삼항의 length 체크로 존재 보장
    lastMogoExam: taken.length ? taken[taken.length - 1]!.label : "",
  };
}

/**
 * 요일별 목표 학습시간(study_schedule).
 *
 * 우리 온보딩은 공통 스테퍼 4개(기상/취침/학교체류/학원)만 받으므로 원본
 * calcAvailableHours 의 요일별 계약(요일 7개 × 시각·학원 N쌍)을 채울 수 없다.
 * 그래서 가용시간은 우리 앱 전용 근사 어댑터 calcAvailableHoursApprox
 * (schedule.js:409-425)로 구한다.
 *
 * 그 다음 단계(대학 배율 곱 + 학생 자습시간 오버라이드)는 **calculateWeekSchedule
 * 을 그대로 호출해서** 처리한다. 오버라이드 규칙(schedule.js:349-367)을 이 파일에
 * 베껴 쓰면 동결된 계산 모듈과 두 벌이 되어 언젠가 갈린다.
 *
 * 그래서 weekSchedule 에는 "calcAvailableHours 를 통과하면 근사값이 그대로 나오는"
 * 합성 입력을 넣는다:
 *   wake = 0, sleep = 근사값 + 1.5, 등하교 시각 없음, 학원 0건
 *   → calcAvailableHours = (sleep - wake) - 1.5 = 근사값  (schedule.js:282)
 *   (등하교 시각이 없으면 parseFloat(undefined) = NaN 이라 학교 항이 통째로
 *    건너뛰어지고, academies 가 빈 배열이라 학원 항도 없다.)
 *
 * 근사 오차 = 1.5 + (학원 건수 × 1) − 등교전자습시간 (schedule.js:394-398 실측).
 * 이는 이미 계산 모듈에 문서화된 확정 사항이다.
 */
function buildWeeklySchedule({ ideal, min, studyHours, dailySchedule }) {
  const weekSchedule = {};
  const selfStudyHours = {};

  for (const { short, long, hasSchool } of WEEKDAYS) {
    const available = calcAvailableHoursApprox(dailySchedule, hasSchool);
    weekSchedule[long] = { wake: 0, sleep: available + 1.5, academies: [] };
    selfStudyHours[long] = studyHours[short];
  }

  return calculateWeekSchedule({
    idealUniv: ideal.university,
    idealDept: ideal.department,
    minUniv: min.university,
    minDept: min.department,
    weekSchedule,
    selfStudyHours,
  });
}

// ---------------------------------------------------------------------------
// 핸들러
// ---------------------------------------------------------------------------

function readBody(req: VercelRequest) {
  const body = req.body;
  if (typeof body !== "string") return body;
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return sendError(res, "detail", 405, "Method not allowed");
  }

  try {
    // 1) 게이트 — 405 → 401 → 403 (§9-1)
    const session = await openGoalSession(req);
    if (session.error) {
      return sendError(
        res,
        "detail",
        session.error.status,
        session.error.body.detail as string,
      );
    }

    const { allowed } = session;

    // 쓰기형이므로 미결제는 403 이다(조회형만 200 {allowed:false}).
    if (!allowed) {
      return res.status(403).json({ detail: PAID_MESSAGE });
    }

    const { supabaseAdmin, profileId } = narrowGoalSession(session);

    // 2) 재온보딩 차단 (미결 Q3 기본안)
    //    base_* 를 다시 계산하면 그동안 쌓인 Σdelta 가 옛 base 위에 얹혀 확률이 튄다.
    //    status='awaiting_cuts'(onboarded_at = null) 인 행은 아직 확률이 없으므로
    //    목표 대학을 바꿔 다시 시도할 수 있게 열어 둔다.
    const existing = await fetchStudentRow(supabaseAdmin, profileId);
    if (existing?.onboarded_at) {
      return res.status(409).json({
        detail: "이미 온보딩을 완료했습니다.",
        reason: "already_onboarded",
      });
    }

    // 3) 입력 검증 + 4) 값 매핑
    const validated = validateIntakeBody(readBody(req));
    if (validated.error) {
      return res.status(validated.error.status).json(validated.error.body);
    }

    const input = validated.input;
    const schoolType = SCHOOL_TYPE_MAP[input.schoolType];
    const inputGrade = GRADE_MAP[input.grade]; // 온보딩에서 학생이 실제로 고른 학년

    // 원본 effectiveGrade(IntakeForm.tsx:1176-1179). 고1인데 내신이 하나도 없으면
    // '중3' 으로 계산한다. 엔진 쪽에서 이 리터럴이 정확히 세 가지를 바꾼다:
    //   - getConversionTypeForStudent 가 'middleschool' 을 돌려줘(pipeline.js:93-98)
    //     convertedGrade 주입 경로가 그대로 성립한다(고1이면 '5grade' 라 주입 없이는 throw).
    //   - applyPreHighGradePenalty 가 +0.10 을 얹는다(primitives.js:155).
    //   - isPreHighStudent 는 remainingNaesin 오버라이드가 없을 때만 remainNaesin 을
    //     0 으로 강제한다(pipeline.js:219-222). 아래에서 NAESIN_NONE_REMAINING[고1]=10 을
    //     항상 넘기므로 이 경로는 실제로는 0 이 아니라 10 을 받는다(calc/DIVERGENCE.md #1).
    // 이 '중3' 리터럴은 DB 에는 저장하지 않는다 — 아래 upsert 는 inputGrade 를 쓴다
    // (§9 아래 "저장" 주석 참고). 엔진 호출에만 쓰인다.
    //
    // 와이어의 grade 는 계속 'g1' 이고 치환은 GRADE_MAP 통과 **뒤에** 일어난다 —
    // GRADE_MAP 에 '중3' 을 넣으면 클라이언트가 직접 중3 을 주장할 수 있게 된다.
    // schoolType 은 절대 바꾸지 않는다('일반고'/'특목고' 유지 → school_type CHECK 통과 +
    // 컷 조회 대상도 그대로).
    const isMiddleSubstituted = input.naesinAllNone && inputGrade === "고1";
    const grade = isMiddleSubstituted ? "중3" : inputGrade;

    const schoolCutType = getSchoolCutType(schoolType);

    // 5) 성적 파생
    const { currentScore, lastNaesinExam } = deriveNaesin(input.naesin, input);
    const { currentMogo, lastMogoExam } = deriveMogo(input.mockExam);

    // 6) 목표 대학 컷 4회 조회
    //    파이프라인은 컷 누락을 에러로 알려주지 않는다 — calcNaesinProb 이 이를
    //    확률 0 으로 접어버리기 때문이다(primitives.js:119). 그래서 존재 확인은
    //    반드시 파이프라인 호출 전에 여기서 한다.
    const { cuts, missing } = await fetchTargetCuts(supabaseAdmin, {
      schoolCutType,
      ideal: input.ideal,
      min: input.min,
    });

    // 정시 컷을 외부 수집하지 않기로 확정했다(§9-Q1(b)) — 수시 컷만 필수로
    // 남기고, 정시 컷이 없으면 정시 확률 2종만 null 로 온보딩을 완료시킨다.
    // 계산 엔진은 컷 누락을 이미 확률 0 으로 접어 흡수하므로(pipeline.js:173,
    // 225-228) 이 파일은 "무엇을 null 로 되돌려 쓸지"만 결정하면 된다.
    const hasSusiCuts = cuts.idealNaesin !== null && cuts.minNaesin !== null;
    // 정시는 쌍 단위로만 유효하다 — 상한/하한 중 하나만 있으면 둘 다 버린다.
    // goalRepo.js:364 buildStudentPayload 의 jungsiAvailable 이 이미 이 쌍
    // 단위 정의를 쓰고 있어(대학별 독립 채택 안 함) 그대로 맞춘다.
    const hasJungsiCuts = cuts.idealJungsi !== null && cuts.minJungsi !== null;

    // 7) 요일별 목표 학습시간
    const weeklySchedule = buildWeeklySchedule(input);

    // 8) 파이프라인
    //    컷이 하나라도 없어도 여기서 파이프라인을 부른다 — current_score /
    //    converted_grade / remain_* / week_* 가 정확히 같은 코드 경로에서
    //    나오게 하기 위해서다(재구현 금지). 컷이 없을 때 나오는 확률 0 과
    //    rate 는 아래에서 통째로 버리고 null 을 저장한다.
    // 남은 시험 회차 오버라이드.
    // 엔진은 `${grade}_${lastExam}` 키로 표를 조회하는데(primitives.js:58-103)
    // '없음' 경로는 라벨이 '' 이라 항상 미매칭 → 0 이 된다. 그 자리를 여기서 메운다.
    //
    //  - 내신: 전 회차 없음이면 고1=10 / 고2=6 / 고3=2(원본 getNaesinNoneRemaining 의
    //    산술 등가물 — 고1 은 "작년 마지막 고교 시험"이 아예 없으므로 총량 10 그대로,
    //    고2·고3 은 직전 학년 마지막 시험 순번을 총량에서 뺀 값). 원본은 고1 에서 이
    //    오버라이드가 조건 분기(isPreHighStudent)에 막혀 무의미했다 — remainNaesin 이
    //    무조건 0 으로 덮였다(고2·고3 만 살아있었다, IntakeForm.tsx:1268-1269 grade!=='고1'
    //    가드). pipeline.js:219-222 에서 그 가드를 "오버라이드가 없을 때만" 으로 좁혀
    //    세 학년 모두 오버라이드가 실제로 적용되게 했다(사용자 승인, calc/DIVERGENCE.md #1).
    //    isMiddleSubstituted 여부와 무관하게 넘긴다 — grade 가 '중3' 으로 치환됐어도
    //    엔진은 이제 remainingNaesin != null 이면 그 값을 그대로 쓴다.
    //  - 모의: 전 회차 없음이면 고1=14 / 고2=10 / 고3=6(원본 getMogoNoneRemaining 과 같은
    //    산술 — 고1 은 총량 14 그대로, calc/DIVERGENCE.md #2). currentMogo 가 0 이면
    //    정시 확률은 게이트에서 0 으로 걸리므로(pipeline.js:227-228) 확률에는 영향이
    //    없고, remain_mogo 저장값을 진실되게 만들기 위한 것이다.
    //    (원본은 여기서 가상 3회차를 입력받아 currentMogo > 0 이라 같은 오버라이드가 정시
    //     확률에도 실제로 영향을 준다. 그 UI 를 포팅하지 않은 것이 헤더 4-(b) 의 divergence 다.)
    //  - 모의(치환 경로, 아래 두 분기는 배타적) — mockAllNone 이 먼저 걸린다. 모의를
    //    실제로 본 경우(mockAllNone=false)에만 isMiddleSubstituted 분기로 넘어간다.
    //    고1 + 내신없음 + 모의는 있음이면 grade 만 '중3' 이 되고 lastMogo 는 실제
    //    라벨('10모' 등)이 남는다. 그러면 키가 '중3_10모' 라 표에 없어 remainMogo 가
    //    0 으로 떨어진다 — 모의를 10회나 남긴 학생의 남은 회차가 0 이 된다.
    //    원본에도 있는 결함이고(오버라이드마저 grade !== '고1' 가드에 막혀 안 나간다),
    //    이 경로는 지금까지 400 으로 막혀 있다가 이번에 처음 열리는 문이다.
    //    새로 여는 문 뒤에 알려진 오작동을 두지 않는다 — 치환 **전** 학년으로
    //    같은 엔진 함수를 호출해 값을 만든다(표를 베껴 쓰지 않는다, calc/DIVERGENCE.md #3).
    const remainingNaesin = input.naesinAllNone
      ? (NAESIN_NONE_REMAINING[inputGrade] ?? null)
      : null;

    const remainingMogo = input.mockAllNone
      ? (MOGO_NONE_REMAINING[inputGrade] ?? null)
      : isMiddleSubstituted
        ? getRemainingMogo(inputGrade, lastMogoExam)
        : null;

    const now = new Date();
    // calc/pipeline.ts(다른 배치 소유, 이 작업 범위 밖) buildInitialStudentState의
    // 반환 타입이 실제 리터럴 shape(baseProbs/rates/weeklySchedule 등) 대신 넓은
    // `object`로 추론된다(pipeline.test.ts에도 동일하게 나타나는 기존 결함,
    // 이 작업에서 만들지 않았고 pipeline.ts는 수정하지 않는다) — 이 지점만 any로
    // 받는다.
    // biome-ignore lint/suspicious/noExplicitAny: 위 사유 — calc/pipeline.ts 반환 타입 추론 결함(범위 밖).
    const state: any = buildInitialStudentState({
      schoolType,
      grade,
      currentScore,
      currentMogo,
      lastNaesin: lastNaesinExam,
      lastMogo: lastMogoExam,
      remainingNaesin,
      remainingMogo,
      // TargetCuts(goalRepo.ts)는 컷 누락을 null로 표현하는데 pipeline.ts CutsInput은
      // number만 받는다 — 파이프라인이 누락을 내부에서 0으로 접어 처리한다는 사실은
      // 위 §9-Q1(b)/baseProbsForStorage 주석에 이미 문서화돼 있다. pipeline.ts는
      // 범위 밖이라 타입을 못 바꾸므로 여기서만 캐스팅한다(런타임 동작 변경 없음).
      cuts: cuts as CutsInput,
      // §7-5: 우리 온보딩은 1~9 등급만 받으므로 변환 대상 원점수가 애초에 없다.
      // 고1·고2 는 conversionType 이 '5grade' 라 주입이 없으면 throw 한다.
      convertedGrade: currentScore,
      weeklySchedule,
      now,
    });

    // 컷 쌍(수시/정시) 별 null 오버라이드를 여기서 한 번만 계산해 goal_students
    // 행과 goal_probability_logs 양쪽에 재사용한다. state.baseProbs.idealJungsi
    // 등은 컷이 없을 때 파이프라인이 0 으로 접은 값이지 null 이 아니라서
    // (pipeline.js:225-228), 이 판정 없이 두 곳에 각각 조건을 쓰면 어느 한쪽이
    // 어긋나기 쉽다 — "미산출"과 "0%"가 두 표에서 다른 이야기를 하면 안 된다
    // (goalRepo.js:46-48 num() 의 "0 과 null 을 절대 섞지 않는다" 규칙).
    const baseProbsForStorage = {
      idealSusi: hasSusiCuts ? state.baseProbs.idealSusi : null,
      idealJungsi: hasJungsiCuts ? state.baseProbs.idealJungsi : null,
      minSusi: hasSusiCuts ? state.baseProbs.minSusi : null,
      minJungsi: hasJungsiCuts ? state.baseProbs.minJungsi : null,
    };

    // 9) 저장
    const row = {
      profile_id: profileId,

      school_type: schoolType,
      // '중3' 치환은 엔진 호출 전용이다(위 effectiveGrade 주석 참고) — DB·화면에는
      // 학생이 실제로 고른 학년을 남긴다. goal_students.grade 의 유일한 소비처는
      // goalRepo.js:315 buildStudentPayload 의 profile.grade(표시용)뿐이라 계산에는
      // 영향이 없다(직접 grep 확인). 특례 식별자는 naesin_scores.priorNaesinGrade 로
      // 이미 행에 남아 있다.
      grade: inputGrade,

      ideal_university: input.ideal.university,
      ideal_department: input.ideal.department,
      min_university: input.min.university,
      min_department: input.min.department,

      ideal_naesin_cut: cuts.idealNaesin,
      ideal_jungsi_cut: cuts.idealJungsi,
      min_naesin_cut: cuts.minNaesin,
      min_jungsi_cut: cuts.minJungsi,

      current_score: state.currentScore,
      converted_grade: state.convertedGrade,
      current_mogo: state.currentMogo,

      remain_naesin: state.remainNaesin,
      remain_mogo: state.remainMogo,
      last_naesin_exam: lastNaesinExam,
      last_mogo_exam: lastMogoExam,

      // 전 회차 '없음' 특례일 때만 입력 원본을 한 칸 덧붙인다 — current_score 만
      // 봐서는 그 3.0 이 고교 내신이었는지 이전 단계 평균이었는지 구분할 수 없다.
      // 컬럼 코멘트가 "회차·과목 구성이 흔들려 정규화하지 않는다"고 못 박은 free-form
      // jsonb 라 키 추가에 마이그레이션이 필요 없다. 정상 경로의 저장 shape 은
      // 바이트 단위로 그대로다(회귀 없음).
      naesin_scores: input.naesinAllNone
        ? { ...input.naesin, priorNaesinGrade: input.priorNaesinGrade }
        : input.naesin,
      mock_exam_scores: input.mockExam,

      // 컷이 없으면 확률을 null 로 둔다 — "0%"와 "미산출"은 다른 상태다(§5 말미).
      // 수시/정시는 서로 독립으로 판정한다(§7-1-A) — 정시 컷만 없어도 수시
      // 확률은 그대로 저장한다.
      base_ideal_susi: baseProbsForStorage.idealSusi,
      base_ideal_jungsi: baseProbsForStorage.idealJungsi,
      base_min_susi: baseProbsForStorage.minSusi,
      base_min_jungsi: baseProbsForStorage.minJungsi,

      rate_ideal_susi: hasSusiCuts ? state.rates.idealSusiBonus : null,
      rate_ideal_jungsi: hasJungsiCuts ? state.rates.idealJungsiBonus : null,
      rate_min_susi: hasSusiCuts ? state.rates.minSusiBonus : null,
      rate_min_jungsi: hasJungsiCuts ? state.rates.minJungsiBonus : null,

      study_schedule: state.weeklySchedule,
      week_ideal: state.weekIdeal,
      week_min: state.weekMin,

      // 가상 날짜의 원점은 rate 와 같은 시점이어야 한다(§8 #14). 온보딩 자체가
      // 성립하는 기준은 수시 컷이다 — 정시 컷 누락은 더 이상 온보딩을 막지
      // 않는다(§9-Q1(b)). 수시 컷도 없는 awaiting_cuts 행만 원점을 두지 않는다.
      actual_start_date: hasSusiCuts ? kstYMD(now) : null,
      onboarded_at: hasSusiCuts ? now.toISOString() : null,
      status: hasSusiCuts ? "active" : "awaiting_cuts",
    };

    const savedRow = await upsertStudentRow(supabaseAdmin, row);

    // 10) 컷 누락 — 입력은 버리지 않고 422 로 알린다(§9-3).
    //     정시 컷 누락은 더 이상 422 사유가 아니다 — 수시 컷이 없을 때만 낸다.
    //     fetchTargetCuts/CUT_KEYS(goalRepo.js)는 listMissingCuts(관리자의
    //     "컷 만들기" 버튼) 등 범용 소비처가 있어 고치지 않고, 여기 호출부에서
    //     수시 2종만 걸러 응답한다(§7-1-A 1번).
    if (!hasSusiCuts) {
      const susiMissing = missing.filter(
        (key) => key === "idealNaesin" || key === "minNaesin",
      );
      return res.status(422).json({
        detail: "목표 대학의 합격 기준 데이터가 아직 준비되지 않았습니다.",
        reason: "cut_not_found",
        missing: susiMissing,
      });
    }

    // 11) 확률 스냅샷 — row 에 저장한 것과 같은 null 판정(baseProbsForStorage)을
    //     그대로 넘긴다. state.baseProbs 원값을 직접 넘기면 정시 컷이 없을 때
    //     0 이 들어가 goal_students(null)와 어긋난다.
    await appendProbabilityLog(
      supabaseAdmin,
      profileId,
      baseProbsForStorage,
      "intake",
    );

    // 12) 응답 — GET /api/goal/student 와 완전히 같은 본문을 담는다.
    //     뷰를 다시 읽는 이유는 두 엔드포인트가 같은 조립 경로를 타게 하기 위해서다
    //     (온보딩 직후에는 누적 증분이 0 이라 값은 base 와 같다).
    const [stateRow, profileName] = await Promise.all([
      fetchStudentStateRow(supabaseAdmin, profileId),
      fetchProfileName(supabaseAdmin, profileId),
    ]);

    return res.status(200).json({
      ok: true,
      // historyRows/recentAvgStudyHours는 온보딩 직후라 비어 있거나 무의미하다(확률
      // 스냅샷은 방금 1건 막 쌓였고, 최근 7일 순공시간은 아직 없다) — GET student와
      // 달리 여기서는 계산하지 않고 기본값(빈 배열/null)에 맡긴다. profile.name만
      // GET /api/goal/student와 동일 규약으로 채운다.
      student: buildStudentPayload(
        savedRow,
        stateRow,
        state.schoolCutType,
        [],
        profileName,
      ),
    });
  } catch (error) {
    console.error("goal/intake error:", error);
    return sendError(res, "detail", 500, "처리 중 오류가 발생했습니다.");
  }
}
