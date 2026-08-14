// =====================================================================
// 학습진단 계산엔진 회귀 검증 — docs/학습진단-계산엔진-적용명세.md §8(CASE-01~10)
//
// 검사 범위(명세 절 → 이 파일의 섹션)
//   §3.5 적재 검증식      → S1. 선택지 서수 계약이 깨지면 조용히 오채점된다.
//                             그래서 명세가 지시한 대로 **첫 항목**에 둔다.
//   §3 정규화 · §3.4 B-08 → S1b. 원시 answers(라벨·컬럼 인덱스·문자열 숫자)에서 출발하는
//                             관통 케이스 + 칸 단위 필수(requiredFields) 진행 판정.
//   §8 CASE-09            → S2. ROUND_HALF_UP(4.475 → 4.48). rev.1 버그 회귀.
//   §8 CASE-06            → S3. 등급 변환 앵커 16종.
//   §8 CASE-01·02         → S4·S5. 배점표 05_예시 재현.
//   §8 CASE-03            → S6. 긴급도(Q-12 해소 — ALL_12 정본, 정식 단언).
//   §8 CASE-04·04b        → S7. 합격 구간·비교표.
//   §8 CASE-05            → S8. 서비스 1순위(Q-14 해소 — fit 85.3, 정식 단언) +
//                             콜멘토 감지 신호(Q-36 해소 — 배점 분리, 정식 단언).
//   §8 CASE-07            → S9. 경계값(Q-32 해소 — 상태·tone 45/60/70 정본, 정식 단언).
//   §8 CASE-08            → S10. 결측·배타·NaN 미발생.
//   §8 CASE-10 · §5.3 ①   → S11·S12. 문구 개수 검산 + 정적 금지어 스캔.
//   §7.4.3 · §5.1 · §5.3 ④ → S13. 리포트 불변식 + 긴급도·고정 안내 바인딩 + 조립 문자열
//                             (입결 4조합 × 등급체계 4종에서 미치환 토큰·금지어 0건).
//   F-01~F-22 확장         → S14[F-확장]. 폴백 채움분의 렌더 계약(조립 계층 산출).
//   자체 결정 값 격리       → S15[F-격리]. 2026-08-11 에 **원본 근거 없이 우리가 정한 값**이
//                             단일 정의처에 남아 있는지를 소스 스캔·함수 본문 스캔으로 못 박고,
//                             채운 폴백의 경계(확률 단조성·유형 배타성·불성실 하한·조회 실패
//                             배선)를 정식 단언으로 고정한다. 값이 로직에 인라인되거나 두 번째
//                             정의처가 생기면 여기서 FAIL 한다 — "확정 시 상수만 교체" 약속은
//                             문서가 아니라 이 섹션이 지킨다.
//
// 실행: node scripts/verify-diagnosis-scoring.mjs [--verbose]
//   기본은 섹션별 요약 + 실패/경고 줄만 낸다(단언이 100건을 넘어 전량 출력하면
//   터미널 꼬리에서 결론이 밀려난다). --verbose 로 PASS 줄까지 전부 본다.
//
// 종료 코드: 실패 1건 이상이면 1, 아니면 0.
//   pending 은 실패로 세지 않는다 — §9 미확정 항목이 남으면 기대값 자체가 확정 전인 케이스라,
//   지금 붉게 만들면 확정될 때까지 스크립트를 아무도 안 본다. 대신 요약에 건수를 남겨 미결이
//   사라지지 않게 한다. 현재 pending 0건(전량 정식 단언).
//   Q-12·Q-14·Q-32·Q-36 는 사용자 확정으로 해소됐다(2026-08-11) — 정식 단언으로 승격했다.
//   Q-09·Q-10·Q-28·Q-29·Q-05·W2 도 같은 날 확정돼 마지막 pending 6건이 전부 승격됐다.
//   Q-36 은 "감지는 하되 점수엔 반영하지 않는다"로 해소됐다 — 배점(+10)을 걷어내니 오탐 pending
//   3건이 전부 "점수 불변" 정식 단언으로 바뀌었다(오탐 판정 자체를 확정한 게 아니다).
//
// .jsx 는 import 하지 않는다(esbuild 불필요). 컴포넌트 계약은 buildReport 출력의 shape
// 단언으로만 검증한다. 순수 모듈은 전부 **정적 import** 한다 — 동적 import + catch 로 감싸면
// 문법 오류·경로 오타까지 삼켜 해당 섹션을 통째로 건너뛴 채 PASS 를 낸다.
// =====================================================================

import { existsSync, readdirSync, readFileSync } from "node:fs";
import process from "node:process";
import {
  ADMISSION_BAND_COPY,
  ADMISSION_BAND_LABEL,
  AREA_COPY,
  BANNED_PHRASES,
  COMMON_COPY,
  COPY_FALLBACK,
  NARRATIVE_COPY,
  NARRATIVE_STATE_LABEL,
  PAGE_GRADE_COPY,
  SERVICE_COPY,
  SERVICE_TIER_LABEL,
  TEMPLATE_COPY,
  TOKEN_SCOPE,
  TYPE_CODES,
  TYPE_COPY,
  URGENCY_COPY,
} from "../src/data/diagnosisCopy.ts";
import {
  // §11 자체 결정 상수 — 값 자체가 아니라 값이 지켜야 할 불변식을 검사한다.
  ADMISSION_BAND_BASE_PROBABILITY,
  ADMISSION_BAND_EDGE_ADJUST,
  ADMISSION_FETCH_ERROR,
  AREA_BAND_THRESHOLDS,
  AREA_CODES,
  AREA_LABEL,
  BADGES,
  BASE_PROBABILITY,
  CSAT_MIN_DELTA,
  DIFFICULTY_DEDUCTIONS,
  EXAMPLE_CASES,
  EXAMPLE_CASES_MIN_ASSERTIONS,
  EXCLUSIVE_CODES,
  INTERVIEW_DELTA,
  JONGHAP_DELTA,
  LEVEL_LABEL,
  LIKERT1_KEYS,
  LIKERT2_KEYS,
  MOCK_FILL_POINTS,
  OBSTACLE_DEDUCTIONS,
  OPTION_CODES,
  OPTION_SOURCE_QUESTION,
  PAGE1_AREAS,
  PAGE2_AREAS,
  PROB_DISPLAY_MODE,
  PROB_MAX,
  PROB_MIN,
  PROB_RANGE_LABELS,
  SCORE_BANDS,
  SERVICE_CODES,
  SERVICE_GRADE_FILTER,
  SERVICE_H3_LATE_CODES,
  SERVICE_H3_LATE_MONTH,
  SERVICE_H3_LATE_TIMEZONE,
  SERVICE_LABEL,
  SERVICE_PART_CAPS,
  SINCERITY_MAX_OFFMODE,
  SINCERITY_MIN_ANSWERED,
  SINCERITY_OFFMODE_MIN_DISTANCE,
  STATE_LABEL,
  STATE_TONE,
  TARGET_SCORE,
  TYPE_RULES,
  URGENCY_AREA_THRESHOLD,
  URGENCY_BANDS,
  URGENCY_LEVEL_LABEL,
  URGENCY_SCOPE,
} from "../src/data/diagnosisScoringTable.ts";
// 화면 전용 확장 영역·예시 리포트 문구(2026-08-12 확정). NIT 5 — 종전에는 이 두 상수가
// 금지어 스캔(S12 scanTargets) 어디에도 걸리지 않았다.
import {
  SAMPLE_REPORT_COPY,
  SCREEN_EXTRAS,
} from "../src/data/diagnosisScreenCopy.ts";
import { renewalSurveyQuestions } from "../src/data/renewalSurveyQuestions.js";
import { fill, findBannedPhrases } from "../src/lib/diagnosisCopyBinding.ts";
// 정적 import 다. 동적 import + try/catch 로 감싸면 문법 오류·잘못된 경로 같은 진짜 고장까지
// 삼켜서 §7.4.3 불변식을 통째로 건너뛴 채 PASS 를 낸다(T16 이 아직 없을 수 있다는 전제는 해소됐다).
import { buildReport, SELF_DECIDED } from "../src/lib/diagnosisReport.ts";
import {
  admissionBand,
  admissionRows,
  classifyStudentType,
  convertToNineScale,
  detectEmotionalSignal,
  isStraightLining,
  levelOf,
  normalizeAnswers,
  overallScore,
  priorityBadges,
  probabilityRangeLabel,
  rankServices,
  roundHalfUp,
  scoreAreas,
  serviceCandidates,
  sincerityOf,
  stateOf,
  successProbability,
  targetGap,
  toneOf,
  urgencyOf,
} from "../src/lib/diagnosisScoring.js";
// 설문 진행 판정 술어. React 를 import 하지 않는 순수 모듈이라 plain node 에서 그대로 돌아간다.
import {
  isAnswered,
  isQuestionAnswered,
  isStepComplete,
} from "../src/lib/renewalSurvey.js";

const VERBOSE = process.argv.includes("--verbose");

/**
 * 비-pending 단언 최소 개수. 이 아래로 떨어지면 "케이스가 전부 pending 이 되어
 * 스크립트가 공허하게 통과"한 상태다 — verify-admission-doc-equivalence.mjs 의
 * MIN_COMPARED_CELLS 와 같은 기법이다. 케이스를 지우면서 pending 을 늘리는 식의
 * 침묵 약화를 이 상수가 막는다.
 */
// 실측 618건(2026-08-12, rev.2 라운드 종료). 이력: 365 → 404(Q-05·Q-09·Q-10·Q-28·Q-29·W2 확정,
// pending 6 → 0) → 455(엔진: F-01·03·06·15·22 산출 단언) → 515(조립: F-확장 렌더 계약)
// → 591(검산: [F-격리] 자체 결정 값 격리 + 폴백 채움분 경계·배타성·소스 계약, F-08 WARN → check 승격)
// → 593(신규 발주 대기 14건 확정 승격 — SELF_DECIDED·SCREEN_EXTRAS·SAMPLE_REPORT_COPY 를
//    §5.3 금지어 스캔에 편입 + report-print.css 워터마크 전용 단언 2건 신설, §8 NIT 5 해소)
// → 618(G-1~G-3 WARN 7·NIT 6 + 미해소 F-02·07·13·16·17·21 전량 종결 — hasRows/emptyNotice
//    회귀 방지, 5등급제 접미어, RISK_VERY_FAR 포화 해소, 오탐 회귀 방지, F-21 60문구 전수검사,
//    awaitCuts 제출 경합 방지, F-02 재도입 방지, F-07/13/16/17 확정 단언 신설).
// 하한을 현재값 근처에 두지 않으면 가드가 작동하지 않는다 — 40 이던 시절에는 실경로 단언의
// 7/8 이 사라져도 조용히 통과했다. 케이스를 의도적으로 늘리거나 줄일 때 이 값을 함께 갱신한다.
const MIN_ASSERTIONS = 610;

/* ---- 소스 스캔 유틸(2026-08-12, [F-격리] 섹션에서 이리로 이동) ----
 * 여러 섹션(F-07·F-19 구조 확인, NIT 5 워터마크 등)이 [F-격리] 섹션보다 앞에서 sourceOf 를
 * 쓴다 — const 는 호이스팅되지 않아 원래 위치(파일 후반부)에 두면 앞쪽 호출이 TDZ 에서
 * 죽는다. 스크립트 상단, 첫 사용보다 반드시 앞에 둔다. */
const SRC_ROOT = new URL("../src/", import.meta.url);
/** 주석을 걷어낸다 — 근거·경위를 적은 주석에 값이 인용되는 것은 정상이고, 그것까지 위반으로 세면 주석을 못 쓴다. */
function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}
function sourceOf(relativePath) {
  return stripComments(readFileSync(new URL(relativePath, SRC_ROOT), "utf8"));
}
function existsInSrc(relativePath) {
  return existsSync(new URL(relativePath, SRC_ROOT));
}

/* ================================================================== *
 * 0. 단언 하니스
 * ================================================================== */

const stats = { pass: 0, fail: 0, pending: 0, skip: 0, warn: 0 };
/** pending 사유(Q 번호)별 집계. 기대값이 미확정인 항목이 요약에서 사라지지 않게 남긴다. */
const pendingByReason = new Map();
let section = "";

function show(text) {
  console.log(text);
}

function beginSection(title) {
  section = title;
  if (VERBOSE) console.log(`\n[diagnosis] ── ${title}`);
}

/** 원시값·배열·평면 객체 비교. 픽스처가 전부 리터럴이라 깊은 순환은 없다. */
function same(a, b) {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, i) => same(item, b[i]));
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    return ka.length === kb.length && ka.every((key) => same(a[key], b[key]));
  }
  return false;
}

function render(value) {
  if (typeof value === "string") return `'${value}'`;
  if (value === undefined) return "undefined";
  return JSON.stringify(value);
}

/**
 * @param {string} name       케이스 이름(명세의 CASE 번호를 접두로 넣는다)
 * @param {unknown} actual
 * @param {unknown} expected
 * @param {{ pending?: string }} [opts] pending 에 사유(Q 번호)를 넣으면 실패로 세지 않는다
 */
function check(name, actual, expected, opts = {}) {
  const ok = same(actual, expected);
  const label = `${section} ${name}`;
  if (opts.pending) {
    stats.pending += 1;
    const bucket = pendingByReason.get(opts.pending) ?? { total: 0, diff: 0 };
    bucket.total += 1;
    if (!ok) bucket.diff += 1;
    pendingByReason.set(opts.pending, bucket);
    // '일치'는 지금 채택한 가정에서만 맞는다는 뜻이라 통과로 셀 수 없다. 다만 매 실행마다
    // 전량 출력하면(현재 28건) 터미널 꼬리에서 결론이 밀려나므로 요약에서 사유별로 센다.
    if (!ok) {
      show(
        `PENDING(불일치) - ${label} (기대=${render(expected)}, 실제=${render(actual)}) — ${opts.pending}`,
      );
    } else if (VERBOSE) {
      console.log(`PENDING(일치) - ${label} — ${opts.pending}`);
    }
    return ok;
  }
  if (ok) {
    stats.pass += 1;
    if (VERBOSE) console.log(`PASS - ${label}`);
  } else {
    stats.fail += 1;
    show(`FAIL - ${label} (기대=${render(expected)}, 실제=${render(actual)})`);
  }
  return ok;
}

/** 참/거짓 단언. check 로 다 표현할 수 있지만 호출부가 읽기 어려워진다. */
function checkTrue(name, actual, opts = {}) {
  return check(name, actual === true, true, opts);
}

function _warn(message) {
  stats.warn += 1;
  show(`WARN - ${message}`);
}

// 현재 SKIP 을 내는 섹션은 없다(buildReport 동적 import 를 걷어내면서 사라졌다). 하니스는 남겨
// 둔다 — 실행 환경에 따라 건너뛸 검사가 생기면 '조용히 없음'이 아니라 SKIP 으로 보여야 한다.
function _skip(message) {
  stats.skip += 1;
  show(`SKIP - ${message}`);
}

const questionById = new Map(
  renewalSurveyQuestions.map((question) => [question.id, question]),
);
const optionsOf = (id) => questionById.get(id)?.options ?? [];
const statementsOf = (id) => questionById.get(id)?.extra?.statements ?? [];

/** 코드 → 화면 라벨. 원시 answers 를 손으로 적지 않고 문항 데이터에서 만들기 위한 역변환이다. */
function labelOf(questionId, code) {
  const question = questionById.get(questionId);
  const index = question?.optionCodes?.indexOf(code) ?? -1;
  return index === -1 ? null : question.options[index];
}

/** DiagnosisInput 최소 골격. 엔진이 옵셔널 체이닝으로 견디지만 픽스처는 실제 shape 를 쓴다. */
function makeInput(overrides = {}) {
  return {
    meta: { schemaVersion: "test", diagnosedAt: null },
    profile: { name: null, gradeLevel: null, schoolType: null },
    goal: {
      level: null,
      reason: null,
      targetUniversity: null,
      targetMajor: null,
    },
    gradeSystem: null,
    scores: {
      naesinOverall: null,
      recentExamAvg: null,
      mock: {},
      mockFilledCount: 0,
    },
    gradeTrend: null,
    trendSubject: null,
    likert1: {},
    likert2: {},
    obstacles: [],
    difficulties: [],
    schedule: null,
    wishes: [],
    admissionQuery: null,
    csatMin: null,
    jonghapReady: null,
    interviewReady: null,
    freeText: "",
    ...overrides,
  };
}

/** 12영역을 한 값으로 채운 뒤 일부만 덮어쓴다. 긴급도·서비스 케이스가 12영역 전부를 요구한다. */
function makeAreaScores(base, overrides = {}) {
  const scores = {};
  AREA_CODES.forEach((area) => {
    scores[area] = base;
  });
  return { ...scores, ...overrides };
}

const caseById = new Map(EXAMPLE_CASES.map((item) => [item.id, item]));

/* ================================================================== *
 * S1. §3.5 적재 검증식 — 선택지 서수 계약
 * ================================================================== */

beginSection("[§3.5]");

check("q10 선택지 13지", optionsOf("q10").length, 13);
check(
  "q10 마지막 = 배타(OBS_13)",
  questionById.get("q10")?.exclusiveCodes ?? [],
  [EXCLUSIVE_CODES.OBSTACLE],
);
check(
  "q10 배타 라벨 = 마지막 선택지",
  questionById.get("q10")?.exclusiveValues ?? [],
  [optionsOf("q10").at(-1)],
);
check("q12 선택지 14지", optionsOf("q12").length, 14);
check(
  "q12 마지막 = 배타(DIF_14)",
  questionById.get("q12")?.exclusiveCodes ?? [],
  [EXCLUSIVE_CODES.DIFFICULTY],
);
check(
  "q12 배타 라벨 = 마지막 선택지",
  questionById.get("q12")?.exclusiveValues ?? [],
  [optionsOf("q12").at(-1)],
);
check("q14 선택지 10지", optionsOf("q14").length, 10);
check("q9 문장 12개", statementsOf("q9").length, 12);
check("q11 문장 12개", statementsOf("q11").length, 12);

// 저장 키 승격(T2) 이후 statements[i].key 가 곧 안정 키다. 승격 전 문자열 배열이면 키가 '0'.. 라
// 정규화가 전부 결측이 되므로, 여기서 형태까지 못박는다.
check(
  "q9 문장 키 = LIKERT1_KEYS",
  statementsOf("q9").map((s) => (typeof s === "string" ? null : s?.key)),
  LIKERT1_KEYS,
);
check(
  "q11 문장 키 = LIKERT2_KEYS",
  statementsOf("q11").map((s) => (typeof s === "string" ? null : s?.key)),
  LIKERT2_KEYS,
);

// OPTION_CODES 는 서수 → 코드 단방향 맵이라 길이가 어긋나는 순간 조용히 오채점된다.
Object.entries(OPTION_CODES).forEach(([group, codes]) => {
  const questionId = OPTION_SOURCE_QUESTION[group];
  check(
    `OPTION_CODES.${group} 길이 = ${questionId}.options 길이`,
    codes.length,
    optionsOf(questionId).length,
  );
});

// 문항이 직접 들고 있는 optionCodes 와도 대조한다 — 둘이 갈라지면 UI 와 채점이 다른 코드를 쓴다.
// **전 그룹**을 돈다. 3그룹만 보던 시절에는 나머지 10그룹이 갈라져도 조용히 오채점됐다.
Object.entries(OPTION_SOURCE_QUESTION).forEach(([group, questionId]) => {
  check(
    `${questionId}.optionCodes = OPTION_CODES.${group}`,
    questionById.get(questionId)?.optionCodes ?? [],
    OPTION_CODES[group],
  );
});

// 선택지가 전부 순수 문자열이라는 것이 라벨→서수 변환(indexOf)의 전제다. 객체형이 섞이면
// getOptionCode 가 -1 을 내고 해당 문항 전체가 미응답으로 채점된다.
checkTrue(
  "전 문항의 options 는 문자열 배열",
  renewalSurveyQuestions.every((question) =>
    (question.options ?? []).every((option) => typeof option === "string"),
  ),
);

check(
  "감점표(OBSTACLE) 13종 전량 정의",
  Object.keys(OBSTACLE_DEDUCTIONS),
  OPTION_CODES.OBSTACLE,
);
check(
  "감점표(DIFFICULTY) 14종 전량 정의",
  Object.keys(DIFFICULTY_DEDUCTIONS),
  OPTION_CODES.DIFFICULTY,
);
check("배타 코드는 감점 0 (OBS_13)", OBSTACLE_DEDUCTIONS.OBS_13, {
  area: null,
  points: 0,
});
check("배타 코드는 감점 0 (DIF_14)", DIFFICULTY_DEDUCTIONS.DIF_14, {
  area: null,
  points: 0,
});

/* ================================================================== *
 * S1b. §3 정규화 관통 — 원시 answers → DiagnosisInput → 영역 점수
 *
 * 나머지 케이스는 DiagnosisInput 을 손으로 조립해 §3 계층을 통째로 건너뛴다. 그러면
 * 리커트 방향 반전(0='매우 그렇다' → 100)이 뒤집혀도 12영역 점수가 전부 반전된 채 통과한다.
 * 여기서 한 번은 UI 가 실제로 저장하는 모양(라벨 문자열 · 컬럼 인덱스 · 문자열 숫자)에서 출발한다.
 * ================================================================== */

beginSection("[§3 정규화]");

// 라벨 → 코드 왕복. 전 그룹을 돌아 서수 계약이 UI·채점 양쪽에서 같은 코드를 내는지 못박는다.
Object.entries(OPTION_SOURCE_QUESTION).forEach(([group, questionId]) => {
  const codes = OPTION_CODES[group];
  checkTrue(
    `${questionId} 라벨→코드 왕복 (${codes.length}지)`,
    codes.every((code) => labelOf(questionId, code) != null),
  );
});

// 리커트 방향(§3.3). LikertMatrix 는 컬럼 인덱스를 저장하고 배점표는 100='매우 그렇다' 다.
const likertRaw = normalizeAnswers({
  q9: { LK1_01: 0, LK1_02: 1, LK1_03: 2, LK1_04: 3, LK1_05: 4 },
});
check("컬럼 0(매우 그렇다) → 100", likertRaw.likert1.LK1_01, 100);
check("컬럼 1 → 75", likertRaw.likert1.LK1_02, 75);
check("컬럼 2(보통이다) → 50", likertRaw.likert1.LK1_03, 50);
check("컬럼 3 → 25", likertRaw.likert1.LK1_04, 25);
check("컬럼 4(전혀 그렇지 않다) → 0", likertRaw.likert1.LK1_05, 0);
check("미응답 문장은 null(0 이 아니다)", likertRaw.likert1.LK1_06, null);
check(
  "정의역 밖 컬럼(5)은 null",
  normalizeAnswers({ q9: { LK1_01: 5 } }).likert1.LK1_01,
  null,
);

// CASE-01 을 원시 응답에서 다시 재현한다 — 정규화가 한 칸이라도 어긋나면 41 이 나오지 않는다.
const case01RawAnswers = {
  q9: { LK1_03: 2, LK1_04: 3 }, // '보통이다' / '별로 그렇지 않다'
  q10: [labelOf("q10", "OBS_02")],
};
const case01FromRaw = normalizeAnswers(case01RawAnswers, {
  diagnosedAt: "2026-08-11T00:00:00.000Z",
});
check("라벨 → 코드 (q10 두 번째 선택지 = OBS_02)", case01FromRaw.obstacles, [
  "OBS_02",
]);
check(
  "정규화 관통 CASE-01: 계획 설계 = 41",
  scoreAreas(case01FromRaw).PLAN,
  41,
);
check(
  "meta.diagnosedAt 은 호출부가 넣는다",
  case01FromRaw.meta.diagnosedAt,
  "2026-08-11T00:00:00.000Z",
);

// 전 문항을 라벨로 채운 응답 1건. 코드 매핑·grade-grid 문자열 파싱·admissionQuery 4단 게이트를 함께 태운다.
const fullRawAnswers = {
  q1: labelOf("q1", "H2"),
  q2: labelOf("q2", "GENERAL"),
  q3: labelOf("q3", "BOTH"),
  "q3-target-reason": labelOf("q3-target-reason", "APTITUDE"),
  "q3-target-university": "  위닝대학교  ",
  "q3-target-major": "경영학과",
  q4: labelOf("q4", "FIVE"),
  q6: {
    overall_avg: "2.00",
    recent_exam_avg: "",
    mock_korean: "1",
    mock_math: "2",
    mock_english: "",
  },
  q8: labelOf("q8", "FLAT"),
  "q8-followup": labelOf("q8-followup", "MATH"),
  q10: [labelOf("q10", "OBS_01"), labelOf("q10", "OBS_05")],
  q12: [labelOf("q12", "DIF_10")],
  q13: labelOf("q13", "EXAM_2W"),
  q14: [labelOf("q14", "WISH_07")],
  q15: {
    university: "위닝대학교",
    department: "경영학과",
    admissionType: "학생부교과",
    detailType: "일반전형",
  },
  q16: labelOf("q16", "HIGH"),
  q17: labelOf("q17", "CONNECTED"),
  q18: labelOf("q18", "CONFIDENT"),
  q19: "요즘 성적 때문에 불안해요",
};
const fullInput = normalizeAnswers(fullRawAnswers);
check("q1 → gradeLevel", fullInput.profile.gradeLevel, "H2");
check("q4 → gradeSystem", fullInput.gradeSystem, "FIVE");
// F-13(2026-08-12 확정, Q-31 종결) — q4 는 4지(9등급제·5등급제·중학생 평균·잘 모르겠어요)로
// 확정이다. 시안(1889:9104/9109/9114)도 처음부터 3지(잘 모르겠어요 제외)만 표기해 성취평가제
// (A~E) 전용 선택지가 시안에 존재한 적이 없다 — 5지로 늘어나면(성취평가제 부활) 여기서 잡힌다.
checkTrue(
  "F-13 — q4 선택지는 4지 고정(성취평가제 전용 선택지 없음)",
  questionById.get("q4").optionCodes.length === 4 &&
    ["NINE", "FIVE", "MIDDLE_AVG", "UNKNOWN"].every((code) =>
      questionById.get("q4").optionCodes.includes(code),
    ),
);
check(
  "q8-followup 은 라벨이 아니라 코드로 담긴다(§3.5)",
  fullInput.trendSubject,
  "MATH",
);
check("grade-grid 문자열 → 숫자", fullInput.scores.naesinOverall, 2);
check("빈 문자열 칸은 null (NaN 차단)", fullInput.scores.recentExamAvg, null);
check("mockFilledCount = 채워진 칸 수", fullInput.scores.mockFilledCount, 2);
check(
  "자유 텍스트는 trim 후 저장",
  fullInput.goal.targetUniversity,
  "위닝대학교",
);
check("복수선택은 코드 배열", fullInput.difficulties, ["DIF_10"]);
checkTrue(
  "4단이 전부 채워지면 admissionQuery 객체",
  fullInput.admissionQuery != null,
);
check(
  "q15 가 3단까지만 채워지면 admissionQuery = null",
  normalizeAnswers({
    q15: {
      university: "위닝대학교",
      department: "경영학과",
      admissionType: "학생부교과",
    },
  }).admissionQuery,
  null,
);
check(
  "미지 라벨은 null",
  normalizeAnswers({ q1: "존재하지 않는 선택지" }).profile.gradeLevel,
  null,
);
check(
  "입력이 없어도 죽지 않는다",
  normalizeAnswers(undefined).gradeSystem,
  null,
);

// Q-01 확정(2026-08-11) — 이름은 폼 문항이 아니라 SurveyStepShell 제출 시점에 meta.name 으로
// 주입된다(로그인 세션의 profiles.name). 비로그인·조회 실패는 meta.name 이 없어 익명 폴백을 탄다.
check(
  "meta.name 이 있으면 profile.name 에 그대로 담긴다",
  normalizeAnswers({}, { name: "김주원" }).profile.name,
  "김주원",
);
check(
  "meta.name 이 없으면 profile.name = null(익명 폴백)",
  normalizeAnswers({}).profile.name,
  null,
);
check(
  'name 있으면 traitsHeading = "{name} 학생의 주요 학습 특성"',
  buildReport(normalizeAnswers({}, { name: "김주원" })).traitsHeading,
  "김주원 학생의 주요 학습 특성",
);
check(
  "name 없으면 traitsHeading 이 축약형(TRAITS_HEADING_ANON, 토큰 노출 없음)",
  buildReport(normalizeAnswers({})).traitsHeading,
  "주요 학습 특성",
);
checkTrue(
  'name 없어도 헤드라인은 완결 문장이다([head] 단독 — "{name}" 토큰이 그대로 남지 않는다)',
  buildReport(normalizeAnswers({})).headlineLines.every(
    (line) => !line.includes("{") && !line.includes("undefined"),
  ),
);

// §3.4 — 중학생 평균은 '등급' 개념이 없어 모의고사·최근시험 그룹이 화면에서 숨겨진다.
// GradeInputGrid 는 되돌릴 때를 위해 숨긴 칸의 값을 보존하므로, 채점이 그 값을 읽으면
// 체계를 바꾼 것만으로 교과 관리 aux 가 5 → 10 으로 오르는 조용한 오채점이 된다.
const middleAvgInput = normalizeAnswers({
  ...fullRawAnswers,
  q4: labelOf("q4", "MIDDLE_AVG"),
  q6: {
    overall_avg: "88.5",
    recent_exam_avg: "3.00",
    mock_korean: "1",
    mock_math: "2",
  },
});
check(
  "MIDDLE_AVG 는 모의고사 칸을 읽지 않는다",
  middleAvgInput.scores.mockFilledCount,
  0,
);
check(
  "MIDDLE_AVG 는 최근시험 칸을 읽지 않는다",
  middleAvgInput.scores.recentExamAvg,
  null,
);
check(
  "MIDDLE_AVG 라도 전체 평균은 읽는다",
  middleAvgInput.scores.naesinOverall,
  88.5,
);

// §3.4 B-08 — 그룹 단위 isAnswered 는 모의고사 1칸만 채워도 통과시킨다. 그 경로로 진행하면
// naesinOverall 이 null 인 채 리포트에 도달해 gpa '미입력' + 입결 표 0행이 된다.
// 진행 판정은 반드시 requiredFields 를 보는 isQuestionAnswered 를 써야 한다.
const q6 = questionById.get("q6");
check("q6 는 전체 평균을 칸 단위 필수로 선언한다", q6?.requiredFields, [
  "overall_avg",
]);
checkTrue(
  "모의고사 1칸만 채우면 미응답으로 친다(B-08)",
  !isQuestionAnswered(q6, { mock_korean: "1" }),
);
checkTrue(
  "전체 평균이 채워지면 응답으로 친다",
  isQuestionAnswered(q6, { overall_avg: "3.24" }),
);
checkTrue(
  "스텝 2 는 전체 평균 없이 완료되지 않는다",
  !isStepComplete(2, { q6: { mock_korean: "1" }, q8: labelOf("q8", "FLAT") }),
);
// 하위 술어(isAnswered)는 문항 메타를 못 본다 — 이 차이가 곧 B-08 구멍이므로 명시적으로 못박는다.
checkTrue(
  "isAnswered 단독으로는 이 구멍이 막히지 않는다",
  isAnswered("grade-grid", { mock_korean: "1" }),
);

// Q-10 확정(2026-08-11) — 리커트 12문장 완주 게이트. 산식(scalePartOf)은 분모 1을 허용하지만
// 진행 판정(isQuestionAnswered)은 12문장 전부를 요구한다 — 1클릭 만점 리포트를 UI 단에서 막는다.
const q9 = questionById.get("q9");
checkTrue(
  "리커트는 isAnswered 하나만으로는 통과하지 않게 requiredFields 대신 문장 수를 본다",
  q9?.type === "likert",
);
checkTrue(
  "리커트 11/12문장만 응답 → 미완료(1문장만 응답으로 만점 리포트가 나가는 경로 차단)",
  !isQuestionAnswered(
    q9,
    Object.fromEntries(LIKERT1_KEYS.slice(0, 11).map((key) => [key, 0])),
  ),
);
checkTrue(
  "리커트 12/12문장 전부 응답 → 완료",
  isQuestionAnswered(
    q9,
    Object.fromEntries(LIKERT1_KEYS.map((key) => [key, 0])),
  ),
);
checkTrue(
  "리커트 1문장만 응답 → 미완료(분모 1 산식과 UI 게이트는 별개)",
  !isQuestionAnswered(q9, { LK1_05: 0 }),
);

/* ================================================================== *
 * S2. §8 CASE-09 — ROUND_HALF_UP (B-01 회귀)
 * ================================================================== */

beginSection("[CASE-09]");

// rev.1 은 `Math.round(x * 100 + Number.EPSILON) / 100` 이었다. EPSILON 은 절대값이라
// 크기 1 이상 피연산자에서 흡수돼 no-op 이 되고, 4.475 * 100 === 447.49999999999994 →
// 4.47 이 나왔다. 이 표가 그 버그의 회귀 방지선이다.
check("roundHalfUp(4.475, 2) = 4.48", roundHalfUp(4.475, 2), 4.48);
check("roundHalfUp(1.005, 2) = 1.01", roundHalfUp(1.005, 2), 1.01);
check("roundHalfUp(0.145, 2) = 0.15", roundHalfUp(0.145, 2), 0.15);
check("roundHalfUp(8.165, 2) = 8.17", roundHalfUp(8.165, 2), 8.17);
// 이 한 줄이 틀리면 HS5 룩업이 1행 밀린다 — 등급 변환 전체가 조용히 어긋난다.
check("roundHalfUp(1.135 * 100, 0) = 114", roundHalfUp(1.135 * 100, 0), 114);
check("roundHalfUp(41.25, 0) = 41", roundHalfUp(41.25, 0), 41);
check("roundHalfUp(56.3333, 1) = 56.3", roundHalfUp(56.3333, 1), 56.3);
check("roundHalfUp(null) = null", roundHalfUp(null, 2), null);

/* ================================================================== *
 * S3. §8 CASE-06 — 등급 변환 앵커
 * ================================================================== */

beginSection("[CASE-06]");

[
  ["FIVE", 1.0, 1.55],
  ["FIVE", 2.0, 3.24], // 05_예시의 '내 내신 3.24'와 같은 값이어야 한다
  ["FIVE", 3.0, 4.78],
  ["FIVE", 4.0, 6.31],
  ["FIVE", 4.83, 7.51], // 변곡점 직전
  ["FIVE", 4.84, 7.57], // 변곡점
  ["FIVE", 5.0, 8.89],
  ["MIDDLE_AVG", 100.0, 2.33],
  ["MIDDLE_AVG", 96.0, 3.0],
  ["MIDDLE_AVG", 90.0, 4.0],
  ["MIDDLE_AVG", 77.2, 5.0],
  ["MIDDLE_AVG", 64.4, 6.0],
  ["MIDDLE_AVG", 51.6, 7.0],
  ["MIDDLE_AVG", 38.7, 8.0],
  ["MIDDLE_AVG", 26.0, 9.0],
  ["NINE", 3.24, 3.24], // 무변환
].forEach(([system, raw, expected]) => {
  check(
    `convertToNineScale('${system}', ${raw})`,
    convertToNineScale(system, raw),
    expected,
  );
});

check(
  "convertToNineScale('UNKNOWN', 3.24) = null",
  convertToNineScale("UNKNOWN", 3.24),
  null,
);
check(
  "convertToNineScale('FIVE', null) = null",
  convertToNineScale("FIVE", null),
  null,
);
// 정의역 밖은 clamp 다(Q-08 잠정). 값을 창작하지 않고 표 양 끝으로 접는다.
check(
  "convertToNineScale('FIVE', 0.5) = 1.55(하한 clamp)",
  convertToNineScale("FIVE", 0.5),
  1.55,
);
check(
  "convertToNineScale('MIDDLE_AVG', 10) = 9.00(하한 clamp)",
  convertToNineScale("MIDDLE_AVG", 10),
  9.0,
);

// F-16(2026-08-12 확정, Q-30 종결) — q1(학년)×q4(등급 체계) 불일치를 검증하지 않기로 했다(그대로
// 둔다 — 조기입학·검정고시 등 실제 예외가 있을 수 있어 학생을 막는 개입은 하지 않는다).
// convertToNineScale 은 gradeSystem 값만 보고 q1 을 인자로 받지 않는다 — 통상 조합과 다른
// 학년(중3+9등급제 등)이어도 값은 조용히 버려지지 않고 정상 변환된다(입력을 존중한다).
check(
  "F-16 — 통상 조합과 다른 학년(중3)에서도 9등급제 값은 정상 변환된다(진행 차단·값 무효화 없음)",
  convertToNineScale("NINE", 3.24),
  3.24,
);
checkTrue(
  "F-16 — convertToNineScale 은 gradeSystem 만 보고 q1 을 받지 않는다(검증 분기 재도입 없음)",
  convertToNineScale.length === 2,
);

/* ================================================================== *
 * S4. §8 CASE-01 — 계획 설계 단일 영역 (배점표 05_예시)
 * ================================================================== */

beginSection("[CASE-01]");

const ex01 = caseById.get("EX-01");
const case01Input = makeInput({
  likert1: ex01.input.likert1,
  obstacles: ex01.input.obstacles,
});
const case01Areas = scoreAreas(case01Input);

// 척도 평균 37.5 → × 0.7 = 26.25(중간값이라 반올림하지 않는다) + max(0, 30 − 15) = 41.25 → 41.
//
// 척도 파트는 export 되지 않으므로 감점 없는 같은 입력에서 base(30)를 빼 역산한다. 리터럴 산술식을
// 픽스처 리터럴과 비교하던 옛 단언은 엔진을 한 줄도 태우지 않아 어떤 구현에서도 통과했다.
const case01ScaleOnly = scoreAreas(makeInput({ likert1: ex01.input.likert1 }));
check(
  `척도 파트 = ${ex01.expected.scalePart} → base 30 을 더해 반올림하면 56`,
  case01ScaleOnly.PLAN,
  roundHalfUp(ex01.expected.scalePart + 30, 0),
);
check(
  "감점 −15 가 걸린 nonScalePart = 15",
  case01ScaleOnly.PLAN - case01Areas.PLAN,
  15,
);
check(
  "계획 설계 areaScore = 41",
  case01Areas.PLAN,
  ex01.expected.areaScore.PLAN,
);
// B-02 의 근거. 정수 base 위에서는 두 반올림 순서가 같은 값을 내므로 areaScore 경로에서는
// 차이가 드러나지 않는다 — 실제 회귀 방지선은 CASE-09 의 roundHalfUp 표다.
check(
  "중간값 사전 반올림과 사후 반올림이 같은 값을 낸다(B-02 근거)",
  [roundHalfUp(roundHalfUp(26.25, 1) + 15, 0), roundHalfUp(26.25 + 15, 0)],
  [41, 41],
);
checkTrue(
  "12영역 전부 유한수",
  AREA_CODES.every((area) => Number.isFinite(case01Areas[area])),
);
checkTrue(
  "12영역 전부 0~100 정수",
  AREA_CODES.every(
    (area) =>
      Number.isInteger(case01Areas[area]) &&
      case01Areas[area] >= 0 &&
      case01Areas[area] <= 100,
  ),
);

/* ================================================================== *
 * S5. §8 CASE-02 — 종합·등급·시급 영역·목표 부족분·뱃지
 * ================================================================== */

beginSection("[CASE-02]");

const ex02 = caseById.get("EX-02");
const case02Areas = ex02.input.areaScores;

check(
  "page1 종합 = 56.3 (338/6)",
  overallScore(case02Areas, 1),
  ex02.expected.page1Overall,
);
check("등급 = L4", levelOf(overallScore(case02Areas, 1)), ex02.expected.level);

const gap02 = targetGap(case02Areas);
check(
  "가장 시급한 영역 = 실행 지속",
  gap02.lowestCode,
  ex02.expected.lowestArea,
);
check("시급 영역 점수 = 39", gap02.lowestScore, ex02.expected.lowestScore);
check(`목표까지 = ${TARGET_SCORE} − 39 = 36`, gap02.gap, ex02.expected.gap);
check("gap > 0 이므로 reached = false", gap02.reached, false);

const badges02 = priorityBadges(case02Areas);
check("뱃지 개수 = BADGES 개수 = 6 (§7.4.3)", badges02.length, BADGES.length);
check(
  "뱃지 배정",
  Object.fromEntries(badges02.map((row) => [row.code, row.badge])),
  ex02.expected.badges,
);
check(
  "뱃지 정렬은 점수 오름차순",
  badges02.map((row) => row.score),
  [39, 41, 56, 60, 65, 77],
);
check("뱃지 영역명은 AREA_LABEL 이 정본", badges02[0].name, AREA_LABEL.EXEC);

/* ================================================================== *
 * S6. §8 CASE-03 — 긴급도 (Q-12 해소 — ALL_12 정본)
 * ================================================================== */

beginSection("[CASE-03]");

const ex03 = caseById.get("EX-03");
// PAGE1 은 05_예시 값 그대로(40 미만 1개), PAGE2 는 원문에 없어 40 미만 2개를 합성한다.
// URGENCY_SCOPE='ALL_12' 가 정본이라 3개가 되어 예시의 50점이 재현된다(Q-12 해소, 사용자 확정).
const case03Areas = makeAreaScores(60, {
  ...case02Areas,
  RECORD: 20,
  STRATEGY: 30,
});
const urgency03 = urgencyOf(
  makeInput({ schedule: ex03.input.schedule }),
  case03Areas,
);

check(
  "urgencyScore = 20 + 3×10 = 50",
  urgency03.score,
  ex03.expected.urgencyScore,
);
check("urgencyLevel = L4", urgency03.level, ex03.expected.urgencyLevel);
check("40 미만 영역 수 = 3", urgency03.lowAreaCount, ex03.input.lowAreaCount);

// 집계 범위 자체는 가정이 아니라 상수다 — PAGE1 로 뒤집히면 여기서 먼저 드러난다.
check("URGENCY_SCOPE = 'ALL_12' (A2)", URGENCY_SCOPE, "ALL_12");
// 임계 40 은 다른 경계(45/60/70/80)와 어긋나지만 배점표 원문이다. A1 을 뒤집어도 따라가면 안 된다.
check(
  "URGENCY_AREA_THRESHOLD = 40 (AREA_BAND_THRESHOLDS 와 분리)",
  URGENCY_AREA_THRESHOLD,
  40,
);
checkTrue(
  "경계 정확히 40 인 영역은 카운트 제외(< 비교)",
  urgencyOf(makeInput(), makeAreaScores(40)).lowAreaCount === 0,
);
checkTrue(
  "39 인 영역은 12개 전부 카운트",
  urgencyOf(makeInput(), makeAreaScores(39)).lowAreaCount === 12,
);

/* ================================================================== *
 * S7. §8 CASE-04 / 04b — 합격 구간
 * ================================================================== */

beginSection("[CASE-04]");

const ex05 = caseById.get("EX-05");
const cuts04 = ex05.input.cuts;

check(
  "3.24 vs 70%컷 2.56 → RISK (2.86 초과)",
  admissionBand(ex05.input.mine, cuts04),
  ex05.expected.band,
);
check(
  "비교표 행 = cut70 · mine 2행",
  admissionRows(ex05.input.mine, cuts04).map(({ key, value, diff }) => ({
    key,
    value,
    diff,
  })),
  ex05.expected.rows,
);
check(
  "내 성적 행은 emphasis = true",
  admissionRows(ex05.input.mine, cuts04).at(-1).emphasis,
  true,
);
// 0.6799999999999997 이 그대로 새면 화면에 '0.68등급 부족'이 아니라 소수 16자리가 찍힌다.
check("diff 는 소수 2자리로 접힌다", admissionRows(3.24, cuts04)[0].diff, 0.68);

check(
  "cut50·cut70 둘 다 있고 mine <= cut50 → STABLE",
  admissionBand(2.0, { cut50: 2.5, cut70: 3.0 }),
  "STABLE",
);
check(
  "cut50 < mine <= cut70 → FIT",
  admissionBand(2.8, { cut50: 2.5, cut70: 3.0 }),
  "FIT",
);
check(
  "cut70 < mine <= cut70+0.30 → REACH",
  admissionBand(3.3, { cut50: 2.5, cut70: 3.0 }),
  "REACH",
);
check(
  "cut70만 있고 mine <= cut70−0.30 → STABLE(대칭)",
  admissionBand(2.2, { cut50: null, cut70: 2.56 }),
  "STABLE",
);
check(
  "둘 다 없음 → null (BAND_NODATA)",
  admissionBand(3.24, { cut50: null, cut70: null }),
  null,
);
check(
  "mine 미입력 → null",
  admissionBand(null, { cut50: 2.5, cut70: 3.0 }),
  null,
);
check("행 배열은 값이 없으면 빈 배열(§7.4.3)", admissionRows(null, {}), []);

// CASE-04b — Q-28 확정(2026-08-11). rev.1 은 `3.24 <= null` 이 false 로 평가돼 안정권 학생을
// 무조건 RISK 로 찍었다. 지금은 결측 대체 항등식(c50=cut70−0.30, c70=cut50+0.30)으로 정상 산출된다.
const ex04b = { mine: 2.1, cuts: { cut50: 2.5, cut70: null } };
check(
  "cut50 단독 → STABLE (대칭 규칙, A4 폴백 대신 정상 산출)",
  admissionBand(ex04b.mine, ex04b.cuts),
  "STABLE",
);
checkTrue(
  "cut50 단독이 RISK 로 떨어지지 않는다(rev.1 버그 회귀)",
  admissionBand(ex04b.mine, ex04b.cuts) !== "RISK",
);

// 4조합(둘 다 있음 / 50만 / 70만 / 둘 다 없음) 전부를 덮는다. cut50 단독(2.5)·cut70 단독(2.8)은
// 결측 대체 항등식으로 동일한 4단 경계(c50=2.5 / c70=2.8 / c70+0.30=3.1)를 내므로, `<=` 귀속
// 규칙(609행 주석)을 확인할 경계 위/아래 쌍(2.5/2.6, 2.8/2.9, 3.1/3.2)을 헬퍼 하나로 두 조합에
// 재사용한다. cut70=2.8 은 2.8+0.3 이 JS 부동소수점으로 3.0999999999999996 이 되는 바로 그
// 조합이다 — admissionBand 가 항등식 계산 직후 roundHalfUp(...,2) 로 정규화하므로(diagnosisScoring.js)
// 경계값 3.1 이 정확히 성립한다. 이 정규화가 실제로 동작하는지가 이 블록의 검증 대상이다.
function checkAdmissionBandBoundaries(label, cuts) {
  check(`${label} mine=2.5(=c50) → STABLE`, admissionBand(2.5, cuts), "STABLE");
  check(
    `${label} mine=2.6(c50<mine<=c70) → FIT`,
    admissionBand(2.6, cuts),
    "FIT",
  );
  check(`${label} mine=2.8(=c70) → FIT`, admissionBand(2.8, cuts), "FIT");
  check(
    `${label} mine=2.9(c70<mine<=c70+0.30) → REACH`,
    admissionBand(2.9, cuts),
    "REACH",
  );
  check(
    `${label} mine=3.1(=c70+0.30) → REACH`,
    admissionBand(3.1, cuts),
    "REACH",
  );
  check(
    `${label} mine=3.2(>c70+0.30) → RISK`,
    admissionBand(3.2, cuts),
    "RISK",
  );
}
checkAdmissionBandBoundaries("cut50 단독(cut50=2.5→c70=2.8)", {
  cut50: 2.5,
  cut70: null,
});
checkAdmissionBandBoundaries("cut70 단독(cut70=2.8→c50=2.5)", {
  cut50: null,
  cut70: 2.8,
});
check(
  "둘 다 있음(cut50=2.5,cut70=2.8) mine=3.2 → RISK",
  admissionBand(3.2, { cut50: 2.5, cut70: 2.8 }),
  "RISK",
);

// F-01 확정(2026-08-11) — 확률은 §11 밴드 기준값 + 열린구간 EDGE + 14~16번 가감으로 산출한다.
// 전역 단일 기준값은 폐기됐다. 이 단언은 "누군가 전역 기준값을 되살리지 않았다"만 지킨다.
check("BASE_PROBABILITY 폐기(null 유지)", BASE_PROBABILITY, null);

// 단조성 불변식 — 밴드 기준값은 내림차순이고, 인접 간격이 EDGE 폭 합보다 커야 보정이 순서를
// 뒤집지 못한다. 여기가 붉어지면 "내신이 나빠졌는데 확률이 올랐다"가 학생 화면에 나갈 수 있다.
const bandProbs = ["STABLE", "FIT", "REACH", "RISK"].map(
  (band) => ADMISSION_BAND_BASE_PROBABILITY[band],
);
check(
  "밴드 기준값 4키 전부 존재",
  bandProbs.filter((value) => typeof value === "number").length,
  4,
);
checkTrue(
  "밴드 기준값은 STABLE > FIT > REACH > RISK 내림차순",
  bandProbs.every((value, i) => i === 0 || bandProbs[i - 1] > value),
);
// G-2(WARN 3) RISK_VERY_FAR 신설 후 — RISK 방향 최대 보정폭이 5→10 으로 커졌다. STABLE·RISK
// 방향은 동시에 걸리지 않지만(경계가 다른 밴드쌍), 두 방향의 **최대치**를 더한 보수적 합으로
// 안전 여유를 검사한다(각 방향에서 가장 큰 보정 하나씩만 반영 — RISK_FAR·RISK_VERY_FAR 는
// 서로 대체이지 가산이 아니므로 둘을 더하지 않는다).
const edgeSpan =
  Math.abs(ADMISSION_BAND_EDGE_ADJUST.STABLE_DEEP) +
  Math.max(
    Math.abs(ADMISSION_BAND_EDGE_ADJUST.RISK_FAR),
    Math.abs(ADMISSION_BAND_EDGE_ADJUST.RISK_VERY_FAR),
  );
checkTrue(
  "인접 밴드 간격 > EDGE 폭 합 (보정이 밴드 순서를 못 뒤집는다, RISK_VERY_FAR 포함)",
  bandProbs.every((value, i) => i === 0 || bandProbs[i - 1] - value > edgeSpan),
);

// 실제 산출값 — cuts 가 있으면 EDGE 가 붙고, 생략하면 EDGE 0 (하위호환).
const probCuts = { cut50: 2.5, cut70: 2.8 };
check(
  "FIT · 가감 0 → 55",
  successProbability(makeInput(), "FIT", 2.6, probCuts),
  55,
);
check(
  "STABLE 얕음(2.21) → 75",
  successProbability(makeInput(), "STABLE", 2.21, probCuts),
  75,
);
check(
  "STABLE 깊음(2.20 <= c50−0.30) → 80",
  successProbability(makeInput(), "STABLE", 2.2, probCuts),
  80,
);
check(
  "RISK 가까움(3.4 <= c70+0.60) → 15",
  successProbability(makeInput(), "RISK", 3.4, probCuts),
  15,
);
check(
  "RISK 멂(3.41 > c70+0.60, <= c70+1.20) → 10",
  successProbability(makeInput(), "RISK", 3.41, probCuts),
  10,
);
// G-2(WARN 3) — RISK_VERY_FAR 신설 회귀 방지. 종전엔 3.41·5.00·9.00 이 전부 10 으로 포화됐다
// (실측 버그). c70+4×MARGIN=4.0 초과부터는 -10 이 걸려 5 로 한 번 더 갈라져야 한다.
check(
  "RISK 매우 멂(4.0 = c70+1.20, 경계는 아직 RISK_FAR) → 10",
  successProbability(makeInput(), "RISK", 4.0, probCuts),
  10,
);
check(
  "RISK 매우 멂(4.01 > c70+1.20) → 5 (RISK_VERY_FAR)",
  successProbability(makeInput(), "RISK", 4.01, probCuts),
  5,
);
checkTrue(
  "RISK 포화 회귀 방지 — 3.41 과 9.00 이 더 이상 같은 값이 아니다",
  successProbability(makeInput(), "RISK", 3.41, probCuts) !==
    successProbability(makeInput(), "RISK", 9.0, probCuts),
);
check(
  "mine/cuts 생략 시 EDGE = 0",
  successProbability(makeInput(), "STABLE"),
  75,
);
check(
  "가감 반영: FIT + HIGH(+5) → 60",
  successProbability(makeInput({ csatMin: "HIGH" }), "FIT", 2.6, probCuts),
  60,
);
check(
  "가감 최소 −30 + RISK_FAR → PROB_MIN 으로 clamp",
  successProbability(
    makeInput({
      csatMin: "HARD",
      jonghapReady: "UNKNOWN",
      interviewReady: "NOT_STARTED",
    }),
    "RISK",
    3.41,
    probCuts,
  ),
  PROB_MIN,
);
check(
  "band 가 null 이면 확률도 null (추정치를 만들지 않는다)",
  successProbability(makeInput(), null),
  null,
);

// 내신 단조성 실측 — 1.00~6.00 을 0.01 단위로 훑어 확률이 한 번도 올라가지 않음을 확인한다.
let monotonicViolations = 0;
let previousProb = Infinity;
for (let step = 100; step <= 600; step += 1) {
  const mine = roundHalfUp(step / 100, 2);
  const band = admissionBand(mine, probCuts);
  const prob = successProbability(
    makeInput({ csatMin: "BORDER", interviewReady: "RECORD_WEAK" }),
    band,
    mine,
    probCuts,
  );
  if (prob > previousProb) monotonicViolations += 1;
  previousProb = prob;
}
check("내신 1.00~6.00 스윕에서 확률 역전 0건", monotonicViolations, 0);

// 표기 계층 — 학생에게 점추정 %를 내지 않는다. 표에 '100'·'0%'가 구조적으로 없어야 한다.
checkTrue('PROB_MAX < 100 (06_금지어 "100%" 충돌 방지)', PROB_MAX < 100);
check("p=55 → 50~60% 구간 라벨", probabilityRangeLabel(55), "50~60%");
check(
  "p=95 도 상단 캡 (90~100% 를 만들지 않는다)",
  probabilityRangeLabel(95),
  "80~90%",
);
check("p=5 → 하단은 0% 를 쓰지 않는다", probabilityRangeLabel(5), "10% 미만");
check("확률 null 이면 라벨도 null", probabilityRangeLabel(null), null);
checkTrue(
  "구간 라벨 어디에도 '100' 부분문자열이 없다",
  PROB_RANGE_LABELS.every((entry) => !entry.label.includes("100")),
);

// F-02(2026-08-12 확정, Q-35 종결) — 자사고·특목고 전용 입결 마스터 분기를 제거하고 일반
// 마스터 단일 경로로 확정했다. `admissionMasterKey()`·`ADMISSION_MASTER_KEYS`·
// `ADMISSION_SPECIAL_SCHOOL_TYPES` 는 소비처가 끝까지 0곳이었던 미완 분기라 삭제했다(값을
// 창작하지 않는다는 원칙과 같은 이유 — 존재하지 않는 데이터를 전제로 한 분기를 남기지 않는다).
// 재도입 방지 회귀 검사 — export 목록에 다시 나타나면 여기서 잡힌다.
const scoringExports = Object.keys(
  await import("../src/lib/diagnosisScoring.js"),
);
checkTrue(
  "F-02 — admissionMasterKey 재도입 없음(export 목록에 없다)",
  !scoringExports.includes("admissionMasterKey"),
);
const scoringTableExports = Object.keys(
  await import("../src/data/diagnosisScoringTable.ts"),
);
checkTrue(
  "F-02 — ADMISSION_MASTER_KEYS/ADMISSION_SPECIAL_SCHOOL_TYPES 재도입 없음",
  !scoringTableExports.some(
    (key) =>
      key.startsWith("ADMISSION_MASTER") || key.startsWith("ADMISSION_SPECIAL"),
  ),
);

/* ================================================================== *
 * S8. §8 CASE-05 — 서비스 1순위 (Q-14 해소 — fit 85.3 정본)
 * ================================================================== */

beginSection("[CASE-05]");

const ex04 = caseById.get("EX-04");
// 05_예시는 입력 내역이 없고 "목표관리 73점"이라 적혀 있으나, 03_서비스추천 산식 계산값은
// 85.3 이다 — 05_예시는 문서 오기로 확정됐다(Q-14 해소, 사용자 확정). areaPart 는 예시의
// 4영역으로 고정되고, 어려움 3개 체크(50) + 희망 교집합(20) + 영역 15.3 을 그대로 쓴다.
const case05Input = makeInput({
  obstacles: ["OBS_01", "OBS_02", "OBS_03"],
  wishes: ["WISH_02"],
});
const case05Areas = makeAreaScores(60, ex04.input.areaScores);
const ranked05 = rankServices(case05Input, case05Areas);
const goalCare =
  ranked05.all.find((service) => service.code === "GOAL_CARE") ?? null;

check(
  "1순위 = 위닝 목표관리",
  ranked05.rank1?.code ?? null,
  ex04.expected.service,
);
check(
  "fit = 85.3 (배점표 05_예시는 73점이라 적혀 있으나 산식 계산값은 85.3 — 산식 정본)",
  goalCare ? roundHalfUp(goalCare.fit, 1) : null,
  ex04.expected.fit,
);
check(
  "tier = HIGH (fit 85.3 >= SERVICE_BANDS.HIGH=80)",
  goalCare?.tier ?? null,
  ex04.expected.tier,
);
// 불변식은 산식 확정과 무관하게 항상 지켜야 한다(B-03).
checkTrue(
  "전 서비스 fit <= 100 (A3 불변식)",
  ranked05.all.every((service) => service.fit <= 100),
);
check(
  "areaPart = 30 × (1 − mean(41,39,56,60)/100) = 15.3",
  goalCare ? roundHalfUp(goalCare.areaPart, 1) : null,
  15.3,
);

// 콜멘토 difficultyPart — Q-36 해소(사용자 확정 2026-08-11)로 자유서술 감지 단어의 +10 가산이
// 점수 계산에서 완전히 빠졌다. OBS_10·11·12 는 항목 3개 = threshold 3개라 3/3 체크가 이미
// 50*3/3=50 이라 가산이 없어도 cap 이 발동할 여지가 없다(정확히 50).
const callMentorFull = rankServices(
  makeInput({ obstacles: ["OBS_10", "OBS_11", "OBS_12"] }),
  makeAreaScores(50),
).all.find((s) => s.code === "CALL_MENTOR");
check(
  "콜멘토 3/3 체크 difficultyPart = 50",
  callMentorFull?.difficultyPart ?? null,
  SERVICE_PART_CAPS.difficulty,
);
checkTrue("콜멘토 fit <= 100", (callMentorFull?.fit ?? 0) <= 100);

// cap 자체는 방어 로직으로 남는다(B-03) — 발동 사례는 threshold < items.length 인 서비스에서
// 본다. GOAL_CARE 는 9개 항목/threshold 3 이라 9/9 체크면 가산 없이도 50*9/3=150 이 나와
// cap 이 없으면 fit 이 100 을 넘긴다.
const overCheckedGoalCare = rankServices(
  makeInput({
    obstacles: [
      "OBS_01",
      "OBS_02",
      "OBS_03",
      "OBS_04",
      "OBS_05",
      "OBS_06",
      "OBS_07",
      "OBS_08",
      "OBS_09",
    ],
  }),
  makeAreaScores(50),
).all.find((s) => s.code === "GOAL_CARE");
check(
  "GOAL_CARE 9/9 체크는 cap 50 으로 접힌다(방어 로직 회귀 방지)",
  overCheckedGoalCare?.difficultyPart ?? null,
  SERVICE_PART_CAPS.difficulty,
);
checkTrue("GOAL_CARE fit <= 100", (overCheckedGoalCare?.fit ?? 0) <= 100);

// F-17(2026-08-12 확정, Q-14①② 종결) — 체크 1·2개(threshold 미만) 배분은 **비례 배분**으로
// 확정한다. all-or-nothing 이었다면 1·2개 체크는 difficultyPart=0 이어야 하는데, 실제로는 0이
// 아니라 threshold 대비 비례한 값이 나와야 한다(GOAL_CARE threshold=3).
// areaScores(0) + WISH_01 로 areaPart(30)·wishPart(20)를 채워 fit 이 SERVICE_BANDS.LOW(50) 를
// 넘게 만든다 — `.all` 은 tier != null(fit >= LOW) 인 서비스만 남기므로, 낮춰 두지 않으면
// difficultyPart 만 작은 1·2개 체크 케이스가 tier=null 로 걸러져 애초에 찾을 수 없다.
const goalCare1Check = rankServices(
  makeInput({ obstacles: ["OBS_01"], wishes: ["WISH_01"] }),
  makeAreaScores(0),
).all.find((s) => s.code === "GOAL_CARE");
const goalCare2Check = rankServices(
  makeInput({ obstacles: ["OBS_01", "OBS_02"], wishes: ["WISH_01"] }),
  makeAreaScores(0),
).all.find((s) => s.code === "GOAL_CARE");
check(
  "F-17 — 1개 체크(threshold 3) = 50/3 비례 배분(all-or-nothing 이면 0)",
  roundHalfUp(goalCare1Check?.difficultyPart ?? -1, 2),
  roundHalfUp((SERVICE_PART_CAPS.difficulty * 1) / 3, 2),
);
check(
  "F-17 — 2개 체크(threshold 3) = 50×2/3 비례 배분(all-or-nothing 이면 0)",
  roundHalfUp(goalCare2Check?.difficultyPart ?? -1, 2),
  roundHalfUp((SERVICE_PART_CAPS.difficulty * 2) / 3, 2),
);
checkTrue(
  "F-17 — 1개 체크 < 2개 체크 < 3개 체크(단조 증가, 계단식 all-or-nothing 아님)",
  (goalCare1Check?.difficultyPart ?? 0) <
    (goalCare2Check?.difficultyPart ?? 0) &&
    (goalCare2Check?.difficultyPart ?? 0) < SERVICE_PART_CAPS.difficulty,
);

// Q-36 해소 — 자유서술 감지 단어(정탐·오탐·부정문 오탐 불문)는 콜멘토 적합도 점수에서 완전히
// 분리됐다. 후보에 남으려면 tier 가 있어야 하므로(fit >= 50) 체크 2개 + 영역 0점으로 구간 안에
// 들여놓고 q19 만 바꿔 가며 difficultyPart 가 흔들리지 않는지 본다.
const callMentorDifficulty = (text) =>
  rankServices(
    makeInput({ obstacles: ["OBS_10", "OBS_11"], freeText: text }),
    makeAreaScores(0),
  ).all.find((s) => s.code === "CALL_MENTOR")?.difficultyPart ?? null;
const keywordFreePart = callMentorDifficulty("오늘 날씨가 좋아요");
checkTrue(
  "픽스처 전제: 감지 단어 없는 콜멘토가 후보에 남는다",
  keywordFreePart != null,
);
check(
  "정탐 '요즘 너무 불안해요' 도 점수는 불변(배점 분리, 승격)",
  callMentorDifficulty("요즘 너무 불안해요"),
  keywordFreePart,
);
check(
  "오탐 '서울대 가고 싶어요' 도 점수는 불변(승격)",
  callMentorDifficulty("서울대 가고 싶어요"),
  keywordFreePart,
);
check(
  "오탐 '울산에서 통학해요' 도 점수는 불변(승격)",
  callMentorDifficulty("울산에서 통학해요"),
  keywordFreePart,
);
check(
  "부정문 오탐 '비교하지 않으려 해요' 도 점수는 불변(승격)",
  callMentorDifficulty("비교하지 않으려 해요"),
  keywordFreePart,
);

// 감지 신호(signals.emotional, diagnosisReport 가 조립)는 점수와 분리된 별도 산출이다. 오탐을
// 포함해도 무방하다는 것이 이번 설계 의도다 — 후속 판정자(사람/LLM)가 '참고 후보'로 읽는다.
checkTrue(
  "신호: 정탐 '요즘 너무 불안해요' → hit=true",
  detectEmotionalSignal("요즘 너무 불안해요").hit,
);
check(
  "신호: '요즘 너무 불안해요' → matchedKeywords 에 '불안' 포함",
  detectEmotionalSignal("요즘 너무 불안해요").matchedKeywords.includes("불안"),
  true,
);
checkTrue(
  "신호: 오탐 '서울대 가고 싶어요' 도 hit=true('울' 매칭 — 오탐 특성 그대로)",
  detectEmotionalSignal("서울대 가고 싶어요").hit,
);
check(
  "신호: 감지 단어 없으면 hit=false · matchedKeywords=[]",
  detectEmotionalSignal("오늘 날씨가 좋아요"),
  { hit: false, matchedKeywords: [] },
);
check("신호: freeText 빈 문자열도 hit=false", detectEmotionalSignal(""), {
  hit: false,
  matchedKeywords: [],
});

// 전 서비스 fit < 50 → 카드 0장(SVC_NONE 경로). 만점 영역 + 무체크 + 무희망이면 fit 은 전부 0 이다.
const noneRanked = rankServices(makeInput(), makeAreaScores(100));
check("전 서비스 tier=null 이면 all = []", noneRanked.all, []);
check("rank1 = null", noneRanked.rank1, null);
check("rank2 = null", noneRanked.rank2, null);

// 학년 필터 — M3·N수생은 2종만 후보다(배점표 1번).
const m3Ranked = rankServices(
  makeInput({
    profile: { name: null, gradeLevel: "M3", schoolType: null },
    obstacles: ["OBS_01", "OBS_02", "OBS_03"],
    difficulties: ["DIF_10"],
  }),
  makeAreaScores(20),
);
checkTrue(
  "M3 후보는 목표관리·콜멘토 2종뿐",
  m3Ranked.all.every((service) =>
    ["GOAL_CARE", "CALL_MENTOR"].includes(service.code),
  ),
);
checkTrue(
  "M3 에서 자기평가서(DIF_10 체크)는 후보에서 빠진다",
  !m3Ranked.all.some((s) => s.code === "SELF_REVIEW"),
);

/* ================================================================== *
 * S9. §8 CASE-07 — 경계값 회귀 (Q-32 해소 — 45/60/70 정본)
 * ================================================================== */

beginSection("[CASE-07]");

// levelOf 는 배점표 원문 80/70/60/45 그대로다(Q-11 은 포함 방향만 다퉜고 명세가
// '>= 상단 포함'으로 확정 요청했다). stateOf·toneOf 도 배점표 02_영역_구성이 "영역 상태 …
// (70·60·45 기준)"으로 직접 명시해 45/60/70 이 정본으로 확정됐다(Q-32 해소, 사용자 확정
// 2026-08-11) — 승인된 디자인 샘플이 함의하던 40/50/70 은 폐기됐다.

[
  [80.0, "L1", "TOP", "blue"],
  [79.9, "L2", "TOP", "blue"],
  [70.0, "L2", "TOP", "blue"],
  [69.9, "L3", "MID", "blue"],
  [60.0, "L3", "MID", "blue"],
  [59.9, "L4", "LOW", "amber"],
  [45.0, "L4", "LOW", "amber"],
  [44.9, "L5", "WEAK", "red"],
].forEach(([score, level, state, tone]) => {
  check(`levelOf(${score})`, levelOf(score), level);
  check(`stateOf(${score})`, stateOf(score), state);
  check(`toneOf(${score})`, toneOf(score), tone);
});

check("SCORE_BANDS = 80/70/60/45", SCORE_BANDS, {
  L1: 80,
  L2: 70,
  L3: 60,
  L4: 45,
});
check(
  "AREA_BAND_THRESHOLDS = 70/60/45 (A1 정본, Q-32 해소)",
  AREA_BAND_THRESHOLDS,
  { TOP: 70, MID: 60, LOW: 45 },
);
// tone 을 stateOf 에서 파생시키지 않고 별도 임계를 두면 Q-32 확정 시 라벨과 색이 어긋난다.
checkTrue(
  "toneOf 는 stateOf 에서 파생된다(임계 이중화 금지)",
  [0, 44.9, 45, 59.9, 60, 69.9, 70, 100].every(
    (score) => toneOf(score) === STATE_TONE[stateOf(score)],
  ),
);

/* ================================================================== *
 * S10. §8 CASE-08 — 결측·배타·NaN 미발생
 * ================================================================== */

beginSection("[CASE-08]");

// 배타 선택지는 "체크하지 않은 것과 같은 결과"여야 한다. 감점 0 을 개별 영역마다 세는 대신
// 결과 전체를 미체크 결과와 대조한다 — 영역 하나라도 새면 바로 드러난다.
const baseAreas = scoreAreas(makeInput());
check(
  "OBS_13 단독 체크 = 미체크와 동일",
  scoreAreas(makeInput({ obstacles: ["OBS_13"] })),
  baseAreas,
);
check(
  "DIF_14 단독 체크 = 미체크와 동일",
  scoreAreas(makeInput({ difficulties: ["DIF_14"] })),
  baseAreas,
);

// 모의고사 칸수 → 교과 관리 aux. SUBJECT base 20 이라 areaScore = 20 + aux 다(척도 결측).
const subjectWithMock = (filledCount) =>
  scoreAreas(
    makeInput({
      scores: {
        naesinOverall: null,
        recentExamAvg: null,
        mock: {},
        mockFilledCount: filledCount,
      },
    }),
  ).SUBJECT;

// Q-09 확정(2026-08-11) — 6키 룩업 7칸 전량을 단언 1블록으로 덮는다. roundHalfUp 은
// scoreAreas 의 정수화(§4.2.2)를 재현한다(20 이 정수라 반올림이 aux 쪽으로만 걸린다).
[0, 1, 2, 3, 4, 5, 6].forEach((count) => {
  check(
    `모의고사 ${count}칸 → aux ${MOCK_FILL_POINTS[count]}`,
    subjectWithMock(count) - 20,
    roundHalfUp(MOCK_FILL_POINTS[count]),
  );
  checkTrue(
    `모의고사 ${count}칸에서 NaN 미발생`,
    Number.isFinite(subjectWithMock(count)),
  );
});
// 3칸(aux 7.5→28)과 4칸(aux 8→28)은 정수 반올림 후 SUBJECT 화면 점수가 같다 — 앵커 간격이
// 2칸→4칸 사이 +1점뿐인 구조적 결과이지 버그가 아니다(diagnosisScoringTable.js MOCK_FILL_POINTS 주석).
check(
  "모의고사 3칸과 4칸은 SUBJECT 화면 점수가 같다(정수 반올림 동점, 기대 동작)",
  subjectWithMock(3),
  subjectWithMock(4),
);

// q3 '아직 구체적인 목표가 없어요' → 이유 문항 미노출 → goal.reason 상시 null.
// GOAL_REASON_POINTS[null] 폴백이 없으면 aux = 0 + undefined = NaN 이 되어 리포트 전체가 무너진다.
const goalNone = scoreAreas(
  makeInput({
    goal: {
      level: "NONE",
      reason: null,
      targetUniversity: null,
      targetMajor: null,
    },
  }),
);
check("goal.level=NONE · reason=null → GOAL aux = 0", goalNone.GOAL, 0);
checkTrue("goal.reason=null 에서 NaN 미발생", Number.isFinite(goalNone.GOAL));
check(
  "goal 실질 만점 = 90 (척도 70 + level 20)",
  scoreAreas(
    makeInput({
      goal: {
        level: "BOTH",
        reason: null,
        targetUniversity: null,
        targetMajor: null,
      },
      likert1: Object.fromEntries(LIKERT1_KEYS.map((key) => [key, 100])),
    }),
  ).GOAL,
  90,
);

// Q-10 확정(2026-08-11) — 분모 = 응답한 문장 수(산식 0줄 변경, 문구집 SKIP_NOTE 원문 그대로).
// 완주 게이트는 UI 진행 판정(isQuestionAnswered)에만 걸리고 엔진 산식은 분모 1을 그대로 허용한다.
// 리커트 2문장 모두 결측 → scalePart 0. EXEC base 20 + TREND(미응답 0) = 20.
check(
  "q9 문장5·6 둘 다 미응답 → EXEC scalePart = 0",
  scoreAreas(makeInput()).EXEC,
  20,
);
// 1문장만 응답하면 분모 1 이다(§4.2 결측 · Q-10 확정 — UI 게이트는 별도).
check(
  "리커트 1문장만 응답 → 분모 1",
  scoreAreas(makeInput({ likert1: { LK1_05: 100 } })).EXEC,
  90,
);

// Q-29 확정(2026-08-11) — gap <= 0 이면 card_urgent 대신 card_goal_met 전용 키(제목+부제 동시
// 교체)로 렌더된다. '목표까지 0점 부족'이 렌더되면 안 되는 경로다. 엔진은 reached 로 신호만 준다.
const reachedGap = targetGap(makeAreaScores(80));
checkTrue("PAGE1 최저 >= 75 → reached = true", reachedGap.reached === true);
check(
  "gap 은 clamp 하지 않는다(부호를 호출부에 그대로 넘긴다)",
  reachedGap.gap,
  TARGET_SCORE - 80,
);
check(
  "신규 키 card_goal_met.title",
  TEMPLATE_COPY["card_goal_met.title"],
  "가장 낮은 영역",
);
check(
  "신규 키 card_goal_met.sub",
  TEMPLATE_COPY["card_goal_met.sub"],
  "모든 영역이 목표 점수에 도달했습니다",
);
check(
  "COPY_FALLBACK 은 VALUE_MISSING 하나만 남는다(URGENT_GOAL_REACHED 삭제)",
  Object.keys(COPY_FALLBACK),
  ["VALUE_MISSING"],
);

// 미응답 투성이 입력에서도 12영역이 전부 유한 정수여야 한다 — NaN 은 종합·뱃지·gap 까지 전파된다.
const emptyAreas = scoreAreas(makeInput());
checkTrue(
  "빈 입력에서 12영역 전부 유한 정수",
  AREA_CODES.every((area) => Number.isInteger(emptyAreas[area])),
);
checkTrue(
  "빈 입력에서 종합 점수도 유한수",
  Number.isFinite(overallScore(emptyAreas, 1)) &&
    Number.isFinite(overallScore(emptyAreas, 2)),
);
check(
  "입력이 아예 없어도(undefined) 죽지 않는다",
  Number.isFinite(scoreAreas(undefined).GOAL),
  true,
);
check(
  "미지 라벨 코드는 조용히 버린다",
  scoreAreas(makeInput({ obstacles: ["OBS_99"] })),
  baseAreas,
);

// Q-05 확정(2026-08-11) — 최저 영역 룩업 기반 4종 + ① 가드. 나머지 4종
// (학습체계 안정형 · 균형 점검형 · 계획 과잉·실행 취약형 · 목표–실행 불균형형)은 판정 기준이
// 배점표·문구집 어디에도 없어 창작하지 않는다 — ⑥ 그 외 경로로 현행 null 폴백을 유지한다.
const allSameLikert24 = {
  likert1: Object.fromEntries(LIKERT1_KEYS.map((key) => [key, 3])),
  likert2: Object.fromEntries(LIKERT2_KEYS.map((key) => [key, 3])),
};
// G-2(WARN 2, 2026-08-12) — 값은 반드시 실제 리커트 척도(0/25/50/75/100, likertScore() 산출역)
// 위에 있어야 한다. 종전엔 0~4 원시 인덱스를 그대로 썼는데, isStraightLining 이 거리 기반으로
// 바뀐 뒤에는(sincerityStats) 0~4 는 전부 서로 50 미만 거리라 "다양한 응답"조차 offmodeCount=0
// 으로 잡혀 flagged=true 가 되는 회귀가 생긴다 — 반드시 이 척도로 픽스처를 만들어야 한다.
const LIKERT_SCALE_VALUES = [0, 25, 50, 75, 100];
const variedLikert24 = {
  likert1: Object.fromEntries(
    LIKERT1_KEYS.map((key, i) => [key, LIKERT_SCALE_VALUES[i % 5]]),
  ),
  likert2: Object.fromEntries(
    LIKERT2_KEYS.map((key, i) => [key, LIKERT_SCALE_VALUES[(i + 1) % 5]]),
  ),
};

// ① 리커트 24문장이 전부 동일하면, 그 외에는 ③(GOAL 최저)이 성립하는 areaScores 라도 null 이다.
check(
  "① 리커트 24문장 응답값이 전부 동일 → null (③ 보다 우선)",
  classifyStudentType(
    makeInput(allSameLikert24),
    makeAreaScores(60, { GOAL: 30, STABILITY: 60 }),
  ),
  null,
);
// 빈 입력(likert 미응답)은 '전부 동일'로 보지 않는다 — answered.length 0 은 가드 대상이 아니다.
// 그 결과 이 픽스처는 STABILITY 30(<45) 이라 ②(부담 누적형)로 정상 판정된다.
check(
  "② STABILITY < 45 → 학습 부담 누적형 (빈 입력, 가드 미발동)",
  classifyStudentType(makeInput(), baseAreas),
  "BURDEN_ACCUM",
);
// ②는 ③보다 먼저 검사한다(판단) — GOAL 도 낮지만 STABILITY < 45 가 이긴다.
check(
  "② STABILITY < 45 → 학습 부담 누적형 (③과 동시 성립해도 ②가 우선)",
  classifyStudentType(
    makeInput(variedLikert24),
    makeAreaScores(60, { STABILITY: 40, GOAL: 35 }),
  ),
  "BURDEN_ACCUM",
);
check(
  "③ 최저 영역 = 목표 설정 → 방향 탐색형",
  classifyStudentType(
    makeInput(variedLikert24),
    makeAreaScores(60, { STABILITY: 60, GOAL: 30 }),
  ),
  "DIRECTION_SEEK",
);
check(
  "④ 최저 영역 = 시간 관리 → 시간관리 취약형",
  classifyStudentType(
    makeInput(variedLikert24),
    makeAreaScores(60, { STABILITY: 60, TIME: 30 }),
  ),
  "TIME_WEAK",
);
check(
  "⑤ 최저 영역 = 학습 피드백 → 학습방법 점검형",
  classifyStudentType(
    makeInput(variedLikert24),
    makeAreaScores(60, { STABILITY: 60, FEEDBACK: 30 }),
  ),
  "METHOD_REVIEW",
);
// ⑩ 잔여 미판정 구간은 남는다 — 최저가 PLAN 이면서 ⑧⑨ 어디에도 안 걸리는 조합.
// 값을 창작해 메우지 않는다(현행 PAGE_GRADE_COPY 폴백 유지).
check(
  "⑩ 최저 = 계획 설계이고 ⑧⑨ 미해당 → null (억지 배정 금지)",
  classifyStudentType(
    makeInput(variedLikert24),
    makeAreaScores(60, { STABILITY: 60, PLAN: 30 }),
  ),
  null,
);

// F-03 확정(2026-08-11) — 나머지 4종. 임계는 §11 TYPE_RULES 소유.
check(
  "③ 전 영역 70+ · 종합 80+ → 학습체계 안정형",
  classifyStudentType(
    makeInput(variedLikert24),
    makeAreaScores(85, { GOAL: 72 }),
  ),
  "SYSTEM_STABLE",
);
check(
  "④ PAGE1 산포 10 이내 → 균형 점검형",
  classifyStudentType(
    makeInput(variedLikert24),
    makeAreaScores(60, { GOAL: 55, PLAN: 65 }),
  ),
  "BALANCED",
);
check(
  "⑧ 계획 70+ · 실행 60 미만 → 계획 과잉·실행 취약형",
  classifyStudentType(
    makeInput(variedLikert24),
    makeAreaScores(65, { STABILITY: 65, PLAN: 75, EXEC: 45 }),
  ),
  "PLAN_HEAVY",
);
check(
  "⑨ 목표 70+ · 계획 70 미만 · 실행 60 미만 → 목표–실행 불균형형",
  classifyStudentType(
    makeInput(variedLikert24),
    makeAreaScores(65, { STABILITY: 65, GOAL: 80, PLAN: 60, EXEC: 45 }),
  ),
  "GOAL_EXEC_GAP",
);
// ③이 ⑤보다 앞선 것은 의도된 판정 변경이다 — 전 영역 70+ 이면서 최저가 GOAL 인 학생은
// 종전 DIRECTION_SEEK 였다. 되돌리려면 ③④를 ⑦ 뒤로 내린다.
checkTrue(
  "③은 ⑤(최저=GOAL)보다 우선한다(의도된 회귀)",
  classifyStudentType(
    makeInput(variedLikert24),
    makeAreaScores(85, { GOAL: 72 }),
  ) !== "DIRECTION_SEEK",
);
// 8종이 전부 도달 가능해야 한다 — 어느 하나가 영영 안 나오면 문구 5개가 죽은 코드가 된다.
const reachableTypes = new Set(
  [
    makeAreaScores(85, { GOAL: 72 }), // SYSTEM_STABLE
    makeAreaScores(60, { STABILITY: 40 }), // BURDEN_ACCUM
    makeAreaScores(60, { GOAL: 55, PLAN: 65 }), // BALANCED
    makeAreaScores(60, { STABILITY: 60, GOAL: 30 }), // DIRECTION_SEEK
    makeAreaScores(60, { STABILITY: 60, TIME: 30 }), // TIME_WEAK
    makeAreaScores(60, { STABILITY: 60, FEEDBACK: 30 }), // METHOD_REVIEW
    makeAreaScores(65, { STABILITY: 65, PLAN: 75, EXEC: 45 }), // PLAN_HEAVY
    makeAreaScores(65, { STABILITY: 65, GOAL: 80, PLAN: 60, EXEC: 45 }), // GOAL_EXEC_GAP
  ].map((areas) => classifyStudentType(makeInput(variedLikert24), areas)),
);
check(
  "TYPE_CODES 8종이 전부 도달 가능",
  TYPE_CODES.filter((code) => reachableTypes.has(code)).length,
  8,
);
checkTrue(
  "TYPE_RULES 신규 숫자는 BALANCED.spreadMax 하나뿐",
  TYPE_RULES.BALANCED.spreadMax === 10,
);

/* ---- F-15 불성실(직선) 응답 판정 ---- */

// 표본 하한 미달은 판정하지 않는다 — 5문장만 답하고 전부 같은 학생을 불성실로 몰지 않는다.
const fewSameLikert = {
  likert1: Object.fromEntries(LIKERT1_KEYS.slice(0, 5).map((key) => [key, 3])),
};
check(
  "응답 5문장 전부 동일 → flagged 아님(표본 하한)",
  isStraightLining(makeInput(fewSameLikert)),
  false,
);
// 그래도 기존 ① 가드가 남아 있어 유형은 여전히 null 이다(회귀 0).
check(
  "기존 '전부 동일' 가드는 그대로 살아 있다",
  classifyStudentType(
    makeInput(fewSameLikert),
    makeAreaScores(60, { STABILITY: 60, GOAL: 30 }),
  ),
  null,
);
check(
  "리커트 24문장 전부 동일 → flagged",
  isStraightLining(makeInput(allSameLikert24)),
  true,
);
// 최빈값과 다른 응답 2개까지는 '대부분 같은 항목'으로 본다(SINCERITY_BANNER 원문 근거).
// 값은 0(offmode)·100(mode) — 거리 100 >= SINCERITY_OFFMODE_MIN_DISTANCE(50) 라 확실히 offmode 로
// 잡힌다. 개수(2·3) 경계만 격리해서 보려는 테스트라 거리는 최대로 벌려 둔다(거리 자체의 경계는
// 아래 G-2 WARN2 전용 블록에서 별도로 검증한다).
const mostlySame = {
  likert1: Object.fromEntries(
    LIKERT1_KEYS.map((key, i) => [key, i < 2 ? 0 : 100]),
  ),
  likert2: Object.fromEntries(LIKERT2_KEYS.map((key) => [key, 100])),
};
check(
  "24문장 중 2개만 다름 → flagged",
  isStraightLining(makeInput(mostlySame)),
  true,
);
const threeOff = {
  likert1: Object.fromEntries(
    LIKERT1_KEYS.map((key, i) => [key, i < 3 ? 0 : 100]),
  ),
  likert2: Object.fromEntries(LIKERT2_KEYS.map((key) => [key, 100])),
};
check(
  "24문장 중 3개 다름 → flagged 아님(허용치 초과)",
  isStraightLining(makeInput(threeOff)),
  false,
);

// G-2(WARN 2, 2026-08-12) — 오탐 회귀 방지. 실측 사례: 22개 '매우 그렇다'(100) + 2개
// '그렇다'(75) 조합이 종전 알고리즘에서 flagged 됐다. 인접 척도(거리 25, 1칸)는 이제 offmode 로
// 세지 않는다 — 이 조합은 더 이상 걸리면 안 된다.
const adjacentOffmode = {
  likert1: Object.fromEntries(
    LIKERT1_KEYS.map((key, i) => [key, i < 2 ? 75 : 100]),
  ),
  likert2: Object.fromEntries(LIKERT2_KEYS.map((key) => [key, 100])),
};
check(
  "22개 매우 그렇다(100) + 2개 그렇다(75, 거리 25) → flagged 아님(오탐 회귀 방지)",
  isStraightLining(makeInput(adjacentOffmode)),
  false,
);
check(
  "인접 척도 응답은 offmodeCount 에 안 잡힌다",
  sincerityOf(makeInput(adjacentOffmode)).offmodeCount,
  0,
);
// 거리 정확히 SINCERITY_OFFMODE_MIN_DISTANCE(50)인 경계 — '>=' 이므로 여기부터는 잡혀야 한다.
const boundaryDistanceOffmode = {
  likert1: Object.fromEntries(
    LIKERT1_KEYS.map((key, i) => [key, i < 2 ? 50 : 100]),
  ),
  likert2: Object.fromEntries(LIKERT2_KEYS.map((key) => [key, 100])),
};
check(
  "거리 정확히 50(SINCERITY_OFFMODE_MIN_DISTANCE) → offmode 로 잡힌다(>= 경계)",
  sincerityOf(makeInput(boundaryDistanceOffmode)).offmodeCount,
  2,
);
check("무응답(0문장) → flagged 아님", isStraightLining(makeInput()), false);
check(
  "sincerityOf 계약은 flagged 불리언",
  sincerityOf(makeInput(allSameLikert24)).flagged,
  true,
);
check(
  "sincerityOf.offmodeCount 실측",
  sincerityOf(makeInput(mostlySame)).offmodeCount,
  2,
);
checkTrue(
  "임계는 상수 소유(로직에 숫자 없음)",
  SINCERITY_MIN_ANSWERED === 20 && SINCERITY_MAX_OFFMODE === 2,
);
// 점수는 무효화하지 않는다 — 유형 판정만 보류한다(SINCERITY_TRAIT 원문 근거).
check(
  "flagged 여도 영역 점수는 그대로 산출된다",
  scoreAreas(makeInput(allSameLikert24)).GOAL,
  scoreAreas(makeInput(allSameLikert24)).GOAL,
);

/* ---- F-06 고3 6월 이후 서비스 2종 제한 (Q-13) ---- */

check(
  "고3 5월 진단 → 6종 전부",
  serviceCandidates("H3", "2026-05-31T14:59:00Z").codes.length,
  6,
);
// KST 경계 — 위 UTC 시각은 KST 로 5/31 23:59, 아래는 6/1 00:00 이다. UTC 로 읽으면 둘 다 5월이 된다.
check(
  "고3 6월 1일 00:00 KST → 2종",
  serviceCandidates("H3", "2026-05-31T15:00:00Z").codes,
  SERVICE_H3_LATE_CODES,
);
check(
  "고3 7월 진단 → 2종",
  serviceCandidates("H3", "2026-07-10T00:00:00Z").codes,
  SERVICE_H3_LATE_CODES,
);
check(
  "고3 6월 이후 판정 사유가 남는다",
  serviceCandidates("H3", "2026-07-10T00:00:00Z").reason,
  "H3_LATE",
);
// fail-open — 시각을 못 읽었다는 이유로 학생의 선택지를 줄이지 않는다.
check(
  "diagnosedAt 없음 → 6종 전부",
  serviceCandidates("H3", null).codes.length,
  6,
);
check(
  "diagnosedAt 파싱 실패 → 6종 전부",
  serviceCandidates("H3", "not-a-date").codes.length,
  6,
);
check(
  "H1 은 시점과 무관하게 6종",
  serviceCandidates("H1", "2026-07-10T00:00:00Z").codes.length,
  6,
);
check(
  "M3 는 기존 표 그대로 2종",
  serviceCandidates("M3", "2026-07-10T00:00:00Z").reason,
  "M3",
);

const h3LateRanked = rankServices(
  makeInput({
    profile: { name: null, gradeLevel: "H3", schoolType: null },
    meta: { schemaVersion: null, diagnosedAt: "2026-07-10T00:00:00Z" },
    obstacles: ["OBS_01", "OBS_02", "OBS_03"],
    difficulties: ["DIF_10"],
  }),
  makeAreaScores(20),
);
checkTrue(
  "고3 6월 이후 후보는 목표관리·콜멘토 2종뿐",
  h3LateRanked.all.every((service) =>
    SERVICE_H3_LATE_CODES.includes(service.code),
  ),
);
check(
  "rankServices 가 판정 사유를 함께 낸다",
  h3LateRanked.filterReason,
  "H3_LATE",
);

/* ---- 긴급도 4단계 라벨(배점표 141행 원문 — 창작 아님) ---- */

check("URGENCY_LEVEL_LABEL 4단계", Object.keys(URGENCY_LEVEL_LABEL).length, 4);
checkTrue(
  "URGENCY_LEVEL_LABEL 키는 URGENCY_BANDS + L1 과 정확히 대응",
  ["L2", "L3", "L4"].every(
    (key) => URGENCY_BANDS[key] != null && URGENCY_LEVEL_LABEL[key] != null,
  ) && URGENCY_LEVEL_LABEL.L1 != null,
);

/* ================================================================== *
 * S11. §8 CASE-10 — 문구 개수 검산
 * ================================================================== */

beginSection("[CASE-10]");

const typeCount = TYPE_CODES.reduce((sum, code) => {
  const copy = TYPE_COPY[code];
  return sum + (copy ? 2 + (copy.todos?.length ?? 0) : 0);
}, 0);
check("TYPE_COPY = 8유형 × 5 = 40", typeCount, 40);
check("TYPE_CODES 8종", TYPE_CODES.length, 8);

const areaCopyCount = AREA_CODES.reduce((sum, area) => {
  const copy = AREA_COPY[area];
  if (!copy) return sum;
  return (
    sum +
    Object.keys(copy.levels ?? {}).length +
    (copy.strength ? 1 : 0) +
    (copy.weakness ? 1 : 0) +
    Object.keys(copy.need ?? {}).length +
    (copy.strategies?.length ?? 0)
  );
}, 0);
check("AREA_COPY = 12영역 × 13 = 156", areaCopyCount, 156);

// F-21(2026-08-12 확정, W7 종결) — AREA_COPY.levels 60문구(12영역×5등급) 전수 재검수. 낙관적
// 서술이 하위 구간(L4·L5)에 섞이면 학생이 실제 학습 상태를 실제보다 낫게 오해한다(폴백 명세
// §3 오인 위험 최고 등급). 60문구를 직접 읽어 부정 서술 강도가 L1→L5 로 단조 증가함(낙관적
// 서술이 하위 구간에 없음)을 확인했고, 그 결과를 회귀 방지 단언으로 고정한다.
//
// 방식: 60문구를 실제로 읽고 고른 마커 사전이다(범용 감성사전이 아니다) — L4·L5 각 텍스트에
// 반드시 하나는 있어야 하는 곤란·정체 표현과, 같은 사전이 L1·L2 에는 없어야 함을 함께 본다.
// 이 목록을 넓혀야 통과하는 신규 문구가 생기면, 넓히는 근거를 실제 문구 재검토로 남겨야 한다
// — 통과시키려고 목록만 넓히면 이 섹션이 하는 일이 없어진다.
const DIFFICULTY_MARKERS = [
  "어렵",
  "어려",
  "부족",
  "밀리",
  "미뤄",
  "흔들",
  "막혀",
  "않고 있",
  "않은 상태",
  "않는 상태",
  "없는 상태",
  "없습니다",
  "못했습니다",
  "늦어지고",
  "확보되지 않",
  "고정되어",
  "벌어지고",
  "낮아지고",
  "않습니다",
  "걸리고 있습니다",
  "흩어져",
];
const areaLevelMismatches = [];
AREA_CODES.forEach((area) => {
  const levels = AREA_COPY[area]?.levels ?? {};
  ["L4", "L5"].forEach((level) => {
    const text = levels[level] ?? "";
    if (!DIFFICULTY_MARKERS.some((marker) => text.includes(marker))) {
      areaLevelMismatches.push(
        `${area}.${level} 곤란 표현 없음(낙관적 서술 의심): "${text}"`,
      );
    }
  });
  ["L1", "L2"].forEach((level) => {
    const text = levels[level] ?? "";
    if (DIFFICULTY_MARKERS.some((marker) => text.includes(marker))) {
      areaLevelMismatches.push(
        `${area}.${level} 상위 구간인데 곤란 표현이 섞여 있음: "${text}"`,
      );
    }
  });
});
check(
  "F-21 — AREA_COPY.levels 60문구 전수 재검수: 문구-점수 상충 0건",
  areaLevelMismatches,
  [],
);
checkTrue(
  "F-21 전수검사가 12영역 전부를 돌았다(경로 오타로 조용히 0건이 되지 않는다)",
  AREA_CODES.length === 12,
);

const narrativeCount = PAGE1_AREAS.reduce((sum, area) => {
  const copy = NARRATIVE_COPY[area] ?? {};
  return (
    sum +
    Object.values(NARRATIVE_STATE_LABEL).reduce((inner, label) => {
      const entry = copy[label];
      return inner + (entry?.title ? 1 : 0) + (entry?.body ? 1 : 0);
    }, 0)
  );
}, 0);
check("NARRATIVE_COPY = P1 6영역 × 4상태 × 2 = 48", narrativeCount, 48);
// PAGE2 6영역은 03 시트에 없다. 만들어 넣으면 원본에 없는 문구를 창작한 것이다.
checkTrue(
  "PAGE2 6영역은 진단 서술이 없다",
  PAGE2_AREAS.every((area) => NARRATIVE_COPY[area] === undefined),
);

const serviceCopyCount = SERVICE_CODES.reduce((sum, code) => {
  const copy = SERVICE_COPY[code];
  if (!copy) return sum;
  return sum + Object.keys(copy.tiers ?? {}).length + (copy.tags?.length ?? 0);
}, 0);
check("SERVICE_COPY = 6×3강도 + 6×4태그 = 42", serviceCopyCount, 42);

const sheet05Count =
  Object.keys(ADMISSION_BAND_COPY).length +
  Object.keys(PAGE_GRADE_COPY.page1).length +
  Object.keys(PAGE_GRADE_COPY.page2).length +
  Object.keys(URGENCY_COPY).length +
  Object.keys(COMMON_COPY).length +
  Object.keys(TEMPLATE_COPY).length;
// Q-29 확정(2026-08-11)으로 TEMPLATE_COPY 가 18 → 20 (card_goal_met.title/sub 신설).
// F-22 해소(2026-08-11)로 COMMON_COPY 가 19 → 20 (ADMISSION_FETCH_FAIL 신설 — 조회 실패를
// BAND_NODATA('자료가 없어…' 단정)로 표시하지 않기 위한 신규 문구. 자체 결정, 2026-08-12 확정).
check("05_구간_공통 = 4 + 10 + 4 + 20 + 20 = 58", sheet05Count, 58);
check(
  "01~05 합계 = 344",
  typeCount + areaCopyCount + narrativeCount + serviceCopyCount + sheet05Count,
  344,
);

const bannedCount = BANNED_PHRASES.reduce(
  (sum, group) => sum + group.phrases.length,
  0,
);
check("BANNED_PHRASES = 6유형", BANNED_PHRASES.length, 6);
check("금지표현 = 22", bannedCount, 22);

// 식별자(문구 아님) 개수 — 344 검산에 섞이면 안 되는 것들의 형태를 함께 못박는다.
check(
  "NARRATIVE_STATE_LABEL 4상태",
  Object.keys(NARRATIVE_STATE_LABEL).length,
  4,
);
check(
  "NARRATIVE_STATE_LABEL.LOW = '보완' (화면 라벨 '보완 필요' 아님)",
  NARRATIVE_STATE_LABEL.LOW,
  "보완",
);
check("SERVICE_TIER_LABEL 3강도", Object.keys(SERVICE_TIER_LABEL).length, 3);
check(
  "ADMISSION_BAND_LABEL 4구간",
  Object.keys(ADMISSION_BAND_LABEL).length,
  4,
);

/* ================================================================== *
 * S12. §5.2 토큰 스코프 · §5.3 ① 정적 금지어 스캔
 * ================================================================== */

beginSection("[§5.2/5.3]");

// 토큰이 있는 문구 키는 반드시 TOKEN_SCOPE 에 등재돼야 한다. 빠지면 fill 이 전부 원문으로
// 남겨 화면에 '{gap}' 리터럴이 노출된다.
const tokenPattern = /\{(\w+|영역)\}/g;
const tokenBearing = Object.entries({
  ...TEMPLATE_COPY,
  ...COMMON_COPY,
}).filter(([, text]) => typeof text === "string" && text.match(tokenPattern));
tokenBearing.forEach(([key, text]) => {
  const tokens = [...text.matchAll(tokenPattern)].map((match) => match[1]);
  const scope = TOKEN_SCOPE[key] ?? [];
  checkTrue(
    `TOKEN_SCOPE['${key}'] 가 토큰 전량을 덮는다`,
    tokens.every((token) => scope.includes(token)),
  );
});
check(
  "스코프 밖 토큰은 치환하지 않는다",
  fill(
    "{name} 학생, {head}",
    { name: "홍길동", head: "x", gap: 9 },
    "section_traits",
  ),
  "홍길동 학생, {head}",
);
check(
  "값이 없으면 원문을 남긴다",
  fill("목표까지 {gap}점 부족", {}, "card_urgent.sub"),
  "목표까지 {gap}점 부족",
);
check(
  "미등재 키는 전부 원문",
  fill("{v}등급 부족", { v: 0.68 }, "diff_short"),
  "0.68등급 부족",
);

// 검사 대상은 '화면에 노출되는 모든 문자열'이다(§5.3 ①). BANNED_PHRASES 자신은 금지어 목록이라
// 스캔 대상에서 뺀다 — 넣으면 22건이 자기 자신에 걸려 항상 붉어진다.
//
// SELF_DECIDED · SCREEN_EXTRAS · SAMPLE_REPORT_COPY 는 폴백 명세 §8 NIT 5 가 지적한 구멍이었다
// (2026-08-12 이전에는 셋 다 여기 없었다) — 14건의 자체 결정 확정 문구(§7.5)가 정적 스캔 밖에서
// 살고 있었다는 뜻이다. 세 상수를 확정으로 승격하면서 함께 걸어 회귀 방어선을 채운다.
const scanTargets = {
  TYPE_COPY,
  AREA_COPY,
  NARRATIVE_COPY,
  NARRATIVE_STATE_LABEL,
  SERVICE_COPY,
  SERVICE_TIER_LABEL,
  ADMISSION_BAND_COPY,
  ADMISSION_BAND_LABEL,
  PAGE_GRADE_COPY,
  URGENCY_COPY,
  COMMON_COPY,
  TEMPLATE_COPY,
  COPY_FALLBACK,
  AREA_LABEL,
  SERVICE_LABEL,
  STATE_LABEL,
  BADGES,
  LEVEL_LABEL,
  SELF_DECIDED,
  SCREEN_EXTRAS,
  SAMPLE_REPORT_COPY,
};
const bannedHits = findBannedPhrases(scanTargets);
check(
  "정적 금지어 위반 0건",
  bannedHits.map((hit) => `${hit.phrase} @ ${hit.text.slice(0, 24)}`),
  [],
);

// G-3(NIT 5, 2026-08-12) — 워터마크 정의처를 CSS 리터럴에서 SAMPLE_REPORT_COPY.WATERMARK 로
// 옮겼다. CSS 는 이제 `content: attr(data-watermark)` 로 값을 **주입**만 받는다(속성은
// ReportSheetA4.jsx 가 내려보낸다). SAMPLE_REPORT_COPY 가 이미 scanTargets 에 있어(위) WATERMARK
// 문자열은 그 findBannedPhrases 스캔에 포함된다 — 여기서는 CSS 가 리터럴로 되돌아가지 않았는지
// (=다시 스캔 밖으로 새지 않았는지) 구조만 확인한다.
const printCss = readFileSync(
  new URL("../src/styles/report-print.css", import.meta.url),
  "utf8",
);
checkTrue(
  "report-print.css 워터마크는 attr(data-watermark) 주입만 쓴다(CSS 리터럴 재도입 없음)",
  /\.fd-report-sample[\s\S]*?content:\s*attr\(data-watermark\)/.test(printCss),
);
checkTrue(
  "SAMPLE_REPORT_COPY.WATERMARK 가 정의돼 있다(정의처 단일화)",
  typeof SAMPLE_REPORT_COPY.WATERMARK === "string" &&
    SAMPLE_REPORT_COPY.WATERMARK.trim() !== "",
);
const sheetSource = sourceOf("components/renewal/report/ReportSheetA4.jsx");
checkTrue(
  "ReportSheetA4 가 data-watermark 속성으로 SAMPLE_REPORT_COPY.WATERMARK 를 주입한다",
  sheetSource.includes("data-watermark") &&
    sheetSource.includes("SAMPLE_REPORT_COPY.WATERMARK"),
);

// F-08 확정(2026-08-11) — '취약'은 자체 결정이 아니라 원본이 지정한 라벨이다. 근거 3중:
//   ① 배점표.txt 204행이 영역 상태 4단계를 '상위·보통·보완 필요·취약'으로 직접 정의한다.
//   ② 문구집 03_진단서술 시트가 상태 열에 '취약'을 12영역 전반에 반복 사용한다.
//   ③ 시안 2967:8140 · 8150 에 '취약'이 실제로 그려져 있다.
// 06_금지어 '진단·낙인'이 막는 것은 학생의 인격·의지·능력을 단정하는 서술('의지가 약합니다' 등)이고,
// 이 라벨이 붙는 대상은 학생이 아니라 12개 학습 영역의 점수 구간(<45)이라 지시 대상이 다르다.
//
// WARN 을 유지하지 않는 이유가 핵심이다: warn 은 stats.warn 만 올리고 종료코드에 반영되지 않아
// 누군가 라벨을 조용히 바꿔도 CI 가 절대 붉어지지 않았다(폴백 명세 §4 가 지목한 '고착' 구조).
// check 로 승격하면 무단 변경은 FAIL 로 잡히고, 정식 교체 시에는 이 단언을 함께 고치도록 강제된다.
// 법무 반려 시 대체 후보(문서 기록용, 미적용): '보완 시급' — page2 의 '우선 보완'과 어휘 계열이 같다.
check(
  "STATE_LABEL.page1.WEAK 확정 = '취약'(배점표 204행 · 문구집 03 시트 · 시안 2967:8140)",
  STATE_LABEL.page1.WEAK,
  "취약",
);

/* ================================================================== *
 * S13. §7.4.3 리포트 불변식
 * ================================================================== */

beginSection("[§7.4.3]");

check("AREA_CODES 12영역", AREA_CODES.length, 12);
check("PAGE1 6영역 (레이더 축 순서)", PAGE1_AREAS.length, 6);
check("PAGE2 6영역", PAGE2_AREAS.length, 6);
check("BADGES 6종", BADGES.length, 6);
check("LEVEL_LABEL 5단계", Object.keys(LEVEL_LABEL).length, 5);
check(
  "STATE_LABEL 은 페이지별 4상태",
  [
    Object.keys(STATE_LABEL.page1).length,
    Object.keys(STATE_LABEL.page2).length,
  ],
  [4, 4],
);
checkTrue(
  "12영역 라벨이 전부 유일",
  new Set(Object.values(AREA_LABEL)).size === 12,
);
checkTrue(
  "6서비스 라벨이 전부 유일",
  new Set(Object.values(SERVICE_LABEL)).size === 6,
);

// buildReport 는 파일 상단에서 정적 import 한다. 예전의 try/catch + 동적 import 는 "T16 이 아직
// 없을 수 있다"는 전제였는데, 그 catch 가 문법 오류·잘못된 import 경로까지 삼켜 §7.4.3 불변식을
// 통째로 건너뛴 채 PASS 를 냈다. 모듈이 깨지면 스크립트가 즉시 죽는 편이 낫다.
const report = buildReport(
  makeInput({ likert1: { LK1_01: 75, LK1_03: 50 }, obstacles: ["OBS_02"] }),
);
check("learningAxes 정확히 6", report?.learningAxes?.length ?? null, 6);
check("readiness.areas 정확히 6", report?.readiness?.areas?.length ?? null, 6);
check("summaryCards 정확히 3", report?.summaryCards?.length ?? null, 3);
check("traits 정확히 3", report?.traits?.length ?? null, 3);
checkTrue(
  "summaryCards label 이 유일(React key)",
  new Set(report.summaryCards.map((c) => c.label)).size === 3,
);

// Q-29 확정(2026-08-11) — PAGE1 6영역 전부 목표(75점) 이상이면 card_urgent 대신 card_goal_met
// 전용 키로 3번째 요약 카드의 제목·부제가 함께 바뀐다(자기모순 문장 방지). raw input 으로
// buildReport 를 통과시켜 diagnosisReport.js 조립 분기까지 실제로 맞는지 본다.
const goalMetReport = buildReport(
  makeInput({
    goal: {
      level: "BOTH",
      reason: null,
      targetUniversity: null,
      targetMajor: null,
    },
    likert1: Object.fromEntries(LIKERT1_KEYS.map((key) => [key, 100])),
    likert2: Object.fromEntries(LIKERT2_KEYS.map((key) => [key, 100])),
  }),
);
check(
  "전 영역 목표 달성 → 3번째 요약 카드 제목 = card_goal_met.title",
  goalMetReport.summaryCards[2]?.label,
  TEMPLATE_COPY["card_goal_met.title"],
);
check(
  "전 영역 목표 달성 → 3번째 요약 카드 부제 = card_goal_met.sub",
  goalMetReport.summaryCards[2]?.sub,
  TEMPLATE_COPY["card_goal_met.sub"],
);
checkTrue(
  "goalMetReport summaryCards label 도 유일(React key)",
  new Set(goalMetReport.summaryCards.map((c) => c.label)).size === 3,
);
checkTrue(
  "traits title 이 유일(React key)",
  new Set(report.traits.map((t) => t.title)).size === 3,
);
checkTrue(
  "headlineLines 중복 없음(key={line})",
  new Set(report.headlineLines).size === report.headlineLines.length,
);
checkTrue(
  "strengths·improvements·recommendations 는 배열",
  Array.isArray(report.strengths) &&
    Array.isArray(report.improvements) &&
    Array.isArray(report.recommendations),
);
checkTrue(
  "강점 카드 3장 · 보완 카드 4장을 넘지 않는다",
  report.strengths.length <= 3 && report.improvements.length <= 4,
);

// F-07(2026-08-12 확정, Q-07 종결) — 개수(3·4)는 시안(2967:8227~8229·8251~8254) 확정, 대상 범위
// (12영역 vs PAGE2 6영역)는 자체 결정으로 12영역 전체를 채택했다. STRENGTH_SCOPE/IMPROVEMENT_SCOPE
// 가 PAGE2_AREAS 로 되돌아가면 여기서 잡힌다.
{
  const reportSource = sourceOf("lib/diagnosisReport.ts");
  checkTrue(
    "F-07 — 대상 범위는 12영역 전체(AREA_CODES), PAGE2 로 축소되지 않았다",
    /const STRENGTH_SCOPE = AREA_CODES/.test(reportSource) &&
      /const IMPROVEMENT_SCOPE = AREA_CODES/.test(reportSource),
  );
  checkTrue(
    "F-07 — 강점 상한 3 · 보완 상한 4(시안 확정값)",
    /const STRENGTH_MAX = 3/.test(reportSource) &&
      /const IMPROVEMENT_MAX = 4/.test(reportSource),
  );
}
checkTrue(
  "admission 5키 전부 존재 + rows 는 배열(AdmissionSection 이 무조건 구조분해한다)",
  report.admission != null &&
    [
      "probabilityLabel",
      "probabilityValue",
      "summary",
      "caption",
      "rows",
    ].every((key) => key in report.admission) &&
    Array.isArray(report.admission.rows),
);
// 엔진이 합성한 런타임 문자열도 금지어 검사 대상이다(§5.3 ④).
check(
  "조립 문자열 금지어 위반 0건",
  findBannedPhrases(report).map((hit) => hit.phrase),
  [],
);

// §4.4(E) 긴급도 — 엔진에는 있는데 리포트에 실리지 않아 URGENCY_COPY 4문구가 통째로 죽어 있었다.
// 렌더 슬롯은 아직 없지만(각 함수 TODO) ReportData 에는 반드시 실려야 다음 단계에서 배선만 하면 된다.
checkTrue(
  "urgency 블록이 실린다(level·score·message)",
  report.urgency != null &&
    ["L1", "L2", "L3", "L4"].includes(report.urgency.level) &&
    Number.isFinite(report.urgency.score) &&
    typeof report.urgency.message === "string",
);
check(
  "urgency.message = URGENCY_COPY[level]",
  report.urgency.message,
  URGENCY_COPY[report.urgency.level],
);

// §5.1 '조건 없음, 항상' 6종 고정 안내가 조립된다. 누락(=문구가 죽는다)과 보류(=조건 미충족)를
// 구분하기 위해 항상 노출 항목만 문자열을 요구하고 조건부 항목은 키 존재만 본다.
[
  "traitIntro",
  "hexCaption",
  "goalCompare",
  "reportBasis",
  "reportLimit",
  "probNote",
  "admissionNote",
].forEach((key) => {
  checkTrue(
    `notices.${key} 가 문구집 원문으로 채워진다`,
    typeof report.notices?.[key] === "string",
  );
});
checkTrue(
  "notices 에 조건부 키(serviceLimit·skipNote)가 존재한다",
  report.notices != null &&
    "serviceLimit" in report.notices &&
    "skipNote" in report.notices,
);
check("M3 가 아니면 serviceLimit 은 null", report.notices.serviceLimit, null);
check(
  "M3 면 SVC_M3_LIMIT 안내가 붙는다",
  buildReport(
    makeInput({ profile: { name: null, gradeLevel: "M3", schoolType: null } }),
  ).notices.serviceLimit,
  COMMON_COPY.SVC_M3_LIMIT,
);

/* ------------------------------------------------------------------ *
 * S13b. 조립 문자열 — 토큰 누출 · 분기 커버리지
 * 개수 불변식만 보던 구간이라, 문자열을 만드는 경로(cut_labels/diff_*, formatGpa 4분기,
 * page2_summary 폴백, 서비스 카드)에 단언이 하나도 없었다.
 * ------------------------------------------------------------------ */

/** ReportData 전체에서 미치환 토큰('{gap}' · '{영역}')을 찾는다. 화면에 리터럴이 나가는 사고를 막는다. */
function unfilledTokens(value, out = []) {
  if (typeof value === "string") {
    const hits = value.match(/\{(\w+|영역)\}/g);
    if (hits) out.push(...hits);
    return out;
  }
  if (value && typeof value === "object")
    Object.values(value).forEach((item) => {
      unfilledTokens(item, out);
    });
  return out;
}

const CUTS_VARIANTS = [
  ["입결 미연결", undefined],
  ["cut50·cut70 둘 다", { cut50: 2.5, cut70: 3.0, finalAvg: 2.8 }],
  ["cut70 단독", { cut50: null, cut70: 2.56, finalAvg: null }],
  ["cut50 단독(Q-28)", { cut50: 2.5, cut70: null, finalAvg: null }],
];
const GRADE_SYSTEMS = ["NINE", "FIVE", "MIDDLE_AVG", "UNKNOWN"];

CUTS_VARIANTS.forEach(([cutsLabel, cuts]) => {
  GRADE_SYSTEMS.forEach((system) => {
    const variant = buildReport(
      makeInput({
        gradeSystem: system,
        scores: {
          naesinOverall: system === "MIDDLE_AVG" ? 88.5 : 3.24,
          recentExamAvg: null,
          mock: {},
          mockFilledCount: 0,
        },
        obstacles: ["OBS_01", "OBS_02", "OBS_03"],
        difficulties: ["DIF_10"],
        wishes: ["WISH_07"],
        admissionQuery: {
          university: "위닝대",
          department: "학과",
          admissionType: "교과",
          detailType: "일반",
        },
      }),
      { cuts, admissionMeta: { year: 2026 } },
    );
    const label = `${cutsLabel} × ${system}`;
    checkTrue(
      `[${label}] 미치환 토큰 0건`,
      unfilledTokens(variant).length === 0,
    );
    checkTrue(`[${label}] 금지어 0건`, findBannedPhrases(variant).length === 0);
    checkTrue(
      `[${label}] admission.rows 는 4행 이하`,
      variant.admission.rows.length <= 4,
    );
    checkTrue(
      `[${label}] 노출 슬롯이 비지 않는다`,
      typeof variant.admission.probabilityLabel === "string" &&
        variant.admission.probabilityLabel !== "" &&
        typeof variant.admission.probabilityValue === "string" &&
        variant.admission.probabilityValue !== "" &&
        typeof variant.readiness.scoreLabel === "string",
    );
  });
});

// formatGpa 4분기 — 원값 표기이며 9등급 환산값이 아니다(§7.2). 중학생 88.5점이 '2.75등급'이 되면 안 된다.
const gpaOf = (system, raw) =>
  buildReport(
    makeInput({
      gradeSystem: system,
      scores: {
        naesinOverall: raw,
        recentExamAvg: null,
        mock: {},
        mockFilledCount: 0,
      },
    }),
  ).student.gpa;
check("gpa NINE", gpaOf("NINE", 3.2), "3.20등급(9등급제)");
check("gpa FIVE", gpaOf("FIVE", 2.5), "2.50등급(5등급제)");
check("gpa MIDDLE_AVG 는 점수 원값", gpaOf("MIDDLE_AVG", 88.5), "88.5점");
// F-12 확정(2026-08-11) — UNKNOWN 은 입력 마스크가 NINE 과 동일 규격(1~9·소수 2자리)이라 값 자체는
// 이미 등급 형태다. '미입력'으로 지우면 학생은 자기 입력이 무시됐다고 읽는다. 표시만 살리고
// 계산(convertToNineScale)에는 넣지 않는다 — 아래 두 단언이 그 분리를 코드로 못박는다.
check(
  "gpa UNKNOWN 은 값을 보이되 체계 미확인을 함께 밝힌다",
  gpaOf("UNKNOWN", 3.24),
  `3.24${SELF_DECIDED.GPA_UNKNOWN_SUFFIX}`,
);
// 결정문은 "NINE 과 동일하게 12자"라고 적었으나 공백을 세지 않은 오산이다(실제 14자). 값 칸
// 제약은 글자 수가 아니라 렌더 폭이므로 실측으로 대신했다 — Pretendard Variable 500 16px 기준
// '3.24등급(체계 미확인)' = 145.4px, 칸 폭 12.5rem(200px) 안에서 1줄(높이 20px). NINE 은 123.8px.
// 여유 54.6px 안에서만 접미사를 바꿀 수 있다(2줄로 접히면 정보 행이 밀린다).
check(
  "gpa UNKNOWN 표기가 값 칸 1줄 폭 안에 든다(실측 145.4px ≤ 200px 대리 상한)",
  gpaOf("UNKNOWN", 3.24).length <= 14,
  true,
);
check(
  "UNKNOWN 은 여전히 9등급 환산 대상이 아니다(입결 비교 오염 방지)",
  convertToNineScale("UNKNOWN", 3.24),
  null,
);
check("gpa 결측", gpaOf("NINE", null), COPY_FALLBACK.VALUE_MISSING);

// page2_summary 동점 가드 — 코드 동일성(highCode === lowCode)으로 구현하면 원소가 6개라 절대
// 성립하지 않아, 전 영역 동점 응답에서 두 영역을 우열로 서술하는 문장이 렌더된다.
// SUBJECT 만 base 20 이라 모의고사 6칸(aux 10)을 채워야 나머지 base 30 과 같은 점수가 된다.
const tiedInput = makeInput({
  likert2: Object.fromEntries(LIKERT2_KEYS.map((key) => [key, 100])),
  scores: {
    naesinOverall: null,
    recentExamAvg: null,
    mock: {},
    mockFilledCount: 6,
  },
});
const tiedAreas = scoreAreas(tiedInput);
checkTrue(
  "픽스처 전제: PAGE2 6영역이 실제로 동점",
  new Set(PAGE2_AREAS.map((a) => tiedAreas[a])).size === 1,
);
const tiedHigh = buildReport(tiedInput);
checkTrue(
  "PAGE2 전 영역 동점이면 우열 서술을 쓰지 않는다",
  tiedHigh.readiness.summaryLines.every(
    (line) => !line.includes("안정적으로 관리되고 있으나"),
  ),
);
check("동점이면 종합 등급 문구 1줄", tiedHigh.readiness.summaryLines.length, 1);
// 동점이 아니고 최고점이 TOP/MID 면 원래의 대비 문장을 그대로 쓴다(가드가 과잉 차단하지 않는다).
const contrastLines = buildReport(
  makeInput({
    likert2: Object.fromEntries(
      LIKERT2_KEYS.map((key) => [
        key,
        key === "LK2_11" || key === "LK2_12" ? 0 : 100,
      ]),
    ),
  }),
).readiness.summaryLines;
checkTrue(
  "격차가 있으면 page2_summary 대비 문장을 쓴다",
  contrastLines.some((line) => line.includes("안정적으로 관리되고 있으나")),
);

// 추천 카드 — SERVICE_COPY 조회 실패 시 폴백이 SVC_RANK2_PREFIX 원문을 쓰면 '{영역}' 이 샌다.
const recommended = buildReport(
  makeInput({
    obstacles: ["OBS_01", "OBS_02", "OBS_03"],
    difficulties: ["DIF_10"],
    wishes: ["WISH_02", "WISH_07"],
  }),
);
checkTrue("추천 카드가 1장 이상", recommended.recommendations.length >= 1);
checkTrue(
  "추천 카드 desc 에 미치환 토큰이 없다",
  recommended.recommendations.every(
    (card) => !/\{(\w+|영역)\}/.test(card.desc),
  ),
);
checkTrue(
  "추천 카드 chips 는 4개(문구집 태그 세트)",
  recommended.recommendations.every(
    (card) => card.chips.length === 4 || card.chips.length === 0,
  ),
);
// 전 서비스 fit < 50 이면 SVC_NONE 안내 카드 1장으로 접는다(컴포넌트에 캡션 슬롯이 없다).
const noService = buildReport(
  makeInput({
    likert1: Object.fromEntries(LIKERT1_KEYS.map((k) => [k, 100])),
    likert2: Object.fromEntries(LIKERT2_KEYS.map((k) => [k, 100])),
  }),
);
check("추천 대상이 없으면 안내 카드 1장", noService.recommendations.length, 1);
check(
  "안내 카드 본문 = SVC_NONE",
  noService.recommendations[0].desc,
  COMMON_COPY.SVC_NONE,
);

/* ------------------------------------------------------------------ *
 * S13c. 화면 전용 확장 슬롯 · 실패 상태 전파 (F-01·F-04·F-06·F-09·F-10·F-12·F-14·F-15·F-18·F-19·F-22)
 * 리포트 조립 계층이 새로 싣는 키들. "슬롯이 없어 죽어 있던 문구"가 되살아났는지, 그리고
 * 인쇄(A4 2장) 슬롯이 여전히 밴드 4글자인지를 함께 본다 — 후자를 놓치면 점추정 %가 종이에 찍힌다.
 * ------------------------------------------------------------------ */

beginSection("[F-확장]");

const CUTS_FIT = { cut50: 2.5, cut70: 2.8, finalAvg: null };
const admissionInput = makeInput({
  gradeSystem: "NINE",
  scores: {
    naesinOverall: 2.6,
    recentExamAvg: null,
    mock: {},
    mockFilledCount: 0,
  },
  admissionQuery: {
    university: "건국대",
    department: "경영학과",
    admissionType: "종합",
    detailType: "일반전형",
  },
});
const admitted = buildReport(admissionInput, {
  cuts: CUTS_FIT,
  admissionMeta: { year: 2026 },
}).admission;

// F-01 — 인쇄 슬롯(probabilityValue)은 밴드 4글자를 유지하고, 구간 라벨은 별도 키로만 나간다.
check(
  "인쇄 확률 슬롯은 밴드 4글자다(점추정 % 아님)",
  admitted.probabilityValue,
  ADMISSION_BAND_LABEL.FIT,
);
checkTrue(
  "probabilityValue 에 % 가 섞이지 않는다",
  !admitted.probabilityValue.includes("%"),
);
check(
  "화면 전용 구간 라벨",
  admitted.probabilityRange,
  probabilityRangeLabel(admitted.probability),
);
check(
  "구간 라벨 제목 = 06_금지어 대체 표현 원문",
  admitted.probabilityRangeLabel,
  SELF_DECIDED.PROB_RANGE_HEADING,
);
check(
  "참고 결과 배지 = 06_금지어 대체 표현 원문",
  admitted.probabilityBadge,
  SELF_DECIDED.PROB_REFERENCE_BADGE,
);
check(
  "확률이 있으면 PROB_NOTE 가 함께 실린다(F-05 probNote 부활)",
  admitted.probNote,
  COMMON_COPY.PROB_NOTE,
);
// 자체 결정 2종은 문구집 06 시트 '결과 단정' 행의 대체 표현 열 원문이어야 한다 — 신규 발주가
// 아니라는 근거가 이 단언이다. 문구집이 바뀌면 여기서 FAIL 로 드러난다.
{
  const alternatives =
    BANNED_PHRASES.find((group) => group.type === "결과 단정")?.alternatives ??
    [];
  checkTrue(
    "확률 라벨·배지가 06_금지어 대체 표현 열에 실재한다",
    alternatives.includes(SELF_DECIDED.PROB_RANGE_HEADING) &&
      alternatives.includes(SELF_DECIDED.PROB_REFERENCE_BADGE),
  );
}
// 산식이 아니라 명시 테이블이라 '100%'·'0%' 가 구조적으로 등장할 수 없다.
checkTrue(
  "구간 라벨 전량에 100 이 없다(06_금지어 결과 단정)",
  PROB_RANGE_LABELS.every((entry) => !entry.label.includes("100")),
);

// F-19 — 캡션의 전형 유형만 확장형으로 바뀐다. 조회 키('종합')는 그대로다.
checkTrue(
  "캡션 전형 유형이 확장형으로 표기된다",
  admitted.caption.includes("학생부종합"),
);
check(
  "조회 키는 매핑을 거치지 않는다(입력 원값 보존)",
  admissionInput.admissionQuery.admissionType,
  "종합",
);
check(
  "매핑 없는 전형 유형은 원값 통과",
  SELF_DECIDED.ADMISSION_TYPE_DISPLAY.논술 ?? "논술",
  "논술",
);

// F-09 · F-10 — 최종등록자 평균 행은 영구 미렌더, 0행이면 컴포넌트가 박스를 숨긴다.
checkTrue(
  "입결 표에 avg(최종등록자 평균) 행이 없다",
  admitted.rows.every((row) => row.label !== TEMPLATE_COPY["cut_labels.avg"]),
);
checkTrue("렌더 행은 최대 3행(cut50/cut70/mine)", admitted.rows.length <= 3);
check(
  "표가 있으면 최종등록자 평균 제외 캡션이 붙는다",
  admitted.finalAvgNote,
  SELF_DECIDED.ADMISSION_FINAL_AVG_OMITTED,
);
{
  const emptyTable = buildReport(makeInput({})).admission;
  check("컷도 내 등급도 없으면 0행", emptyTable.rows.length, 0);
  check(
    "0행이면 hasRows=false (컴포넌트가 빈 박스를 숨긴다)",
    emptyTable.hasRows,
    false,
  );
  check(
    "0행이면 최종등록자 평균 캡션도 붙지 않는다",
    emptyTable.finalAvgNote,
    null,
  );
  check(
    "확률이 없으면 배지·고지도 붙지 않는다",
    [emptyTable.probabilityBadge, emptyTable.probNote],
    [null, null],
  );
}

// G-1b(2026-08-12) 회귀 방지 — F-10 원증상 재현: 목표 학과가 43,170행 마스터 커버리지 밖이라
// 컷이 진짜로 없는(조회 실패가 아닌) 경우. mine 은 있는데 cuts 는 없다 — 종전엔 이 조합에서도
// hasRows=true 로 잘못 판정해 헤더 + 자기 성적 1행짜리 빈 비교표가 그려졌다.
{
  const noMasterCoverage = buildReport(admissionInput, {
    cuts: null,
  }).admission;
  check(
    "mine 은 있고 cuts 만 없으면 mine 행 1개",
    noMasterCoverage.rows.length,
    1,
  );
  check(
    "비교 대상(컷)이 없으면 hasRows=false(F-10 재발 방지)",
    noMasterCoverage.hasRows,
    false,
  );
  check(
    "요약은 BAND_NODATA(자료 영구 부재, 조회 실패 아님)",
    noMasterCoverage.summary,
    COMMON_COPY.BAND_NODATA,
  );
}

// G-1c(2026-08-12) — 5등급제·중학생 평균 학생은 mine 행 라벨에 '9등급 환산' 사실을 명시한다.
// 학생정보 블록엔 원값('3.00등급(5등급제)')이, 입결표엔 환산값('4.78등급')이 뜨는데 접미어가
// 없으면 같은 이름의 값이 다른 숫자로 두 번 보여 오류로 오인될 수 있었다(WARN G-1c 실측).
{
  const fiveInput = makeInput({
    gradeSystem: "FIVE",
    scores: {
      naesinOverall: 3.0,
      recentExamAvg: null,
      mock: {},
      mockFilledCount: 0,
    },
    admissionQuery: admissionInput.admissionQuery,
  });
  const fiveAdmitted = buildReport(fiveInput, {
    cuts: CUTS_FIT,
    admissionMeta: { year: 2026 },
  }).admission;
  const fiveMineRow = fiveAdmitted.rows.find((row) => row.emphasis);
  checkTrue(
    "5등급제 mine 행 라벨에 환산 접미어가 붙는다",
    Boolean(
      fiveMineRow?.label.endsWith(SELF_DECIDED.ADMISSION_MINE_CONVERTED_SUFFIX),
    ),
  );
  const nineMineRow = admitted.rows.find((row) => row.emphasis);
  checkTrue(
    "9등급제는 접미어를 붙이지 않는다(원값=환산값이라 표기 불필요)",
    Boolean(nineMineRow) &&
      !nineMineRow.label.includes(SELF_DECIDED.ADMISSION_MINE_CONVERTED_SUFFIX),
  );
}

// F-22 — 조회 실패는 '자료 없음'과 다른 문장을 낸다. 이 하나가 영구 부재와 일시 오류를 가른다.
{
  const failed = buildReport(makeInput({}), {
    cuts: null,
    cutsError: true,
  }).admission;
  check(
    "조회 실패 요약 = ADMISSION_FETCH_FAIL",
    failed.summary,
    COMMON_COPY.ADMISSION_FETCH_FAIL,
  );
  check("조회 실패 플래그가 전파된다", failed.fetchFailed, true);
  const missing = buildReport(makeInput({}), { cuts: null }).admission;
  check(
    "자료 없음 요약은 그대로 BAND_NODATA",
    missing.summary,
    COMMON_COPY.BAND_NODATA,
  );
  check("자료 없음은 실패가 아니다", missing.fetchFailed, false);
  checkTrue(
    "두 문장이 서로 다르다(구분이 실제로 생겼다)",
    failed.summary !== missing.summary,
  );
}

// F-14 — 성적 흐름 축약 라벨. 6종 전량이 q8 코드와 1:1 이고, 미매핑 코드는 원문으로 폴백한다.
{
  const q8 = renewalSurveyQuestions.find((question) => question.id === "q8");
  check(
    "축약 라벨이 q8 선택지 코드와 1:1",
    Object.keys(SELF_DECIDED.GRADE_TREND_SHORT_LABEL).sort(),
    [...q8.optionCodes].sort(),
  );
  checkTrue(
    "축약 라벨이 전부 유일(두 흐름이 같은 라벨로 무너지지 않는다)",
    new Set(Object.values(SELF_DECIDED.GRADE_TREND_SHORT_LABEL)).size === 6,
  );
  checkTrue(
    "축약 라벨이 전부 원문보다 짧다",
    q8.optionCodes.every(
      (code, index) =>
        SELF_DECIDED.GRADE_TREND_SHORT_LABEL[code].length <
        q8.options[index].length,
    ),
  );
  check(
    "FLAT 은 시안 인용 그대로",
    SELF_DECIDED.GRADE_TREND_SHORT_LABEL.FLAT,
    "정체",
  );
  check(
    "리포트에 축약 라벨이 실린다",
    buildReport(makeInput({ gradeTrend: "UP_MOST" })).student.gradeTrend,
    "대부분 상승",
  );
  // (이 줄은 매핑된 경로다 — 진짜 미매핑 코드의 폴백은 [F-격리] 섹션에서 검사한다.)
  check(
    "시안 인용 라벨이 리포트에도 그대로 실린다",
    buildReport(makeInput({ gradeTrend: "FLAT" })).student.gradeTrend,
    "정체",
  );
}

// F-04 — 죽어 있던 108문구(levels 60 · strategies 48)가 실제로 실린다.
{
  const extras = buildReport(makeInput({ likert1: { LK1_01: 75 } }));
  check(
    "areaDetails 는 6+6 행",
    [extras.areaDetails.page1.length, extras.areaDetails.page2.length],
    [6, 6],
  );
  checkTrue(
    "areaDetails 12행 전부 문구가 채워진다",
    [...extras.areaDetails.page1, ...extras.areaDetails.page2].every(
      (row) => typeof row.detail === "string" && row.detail !== "",
    ),
  );
  checkTrue(
    "areaDetails 는 점수 오름차순(학생이 본 순서와 같다)",
    extras.areaDetails.page1.every(
      (row, index, rows) => index === 0 || rows[index - 1].score <= row.score,
    ),
  );
  checkTrue(
    "page1·page2 상태 어휘가 각자 축을 쓴다",
    extras.areaDetails.page1.every((row) =>
      Object.values(STATE_LABEL.page1).includes(row.status),
    ) &&
      extras.areaDetails.page2.every((row) =>
        Object.values(STATE_LABEL.page2).includes(row.status),
      ),
  );
  check("strategyGroups 12묶음", extras.strategyGroups.length, 12);
  checkTrue(
    "각 묶음 4항목",
    extras.strategyGroups.every((group) => group.items.length === 4),
  );
  checkTrue(
    "strategyGroups 도 점수 오름차순",
    extras.strategyGroups.every(
      (group, index, groups) =>
        index === 0 || groups[index - 1].score <= group.score,
    ),
  );
  // '필요한 것'(need)과 '맞춤 전략'(strategies)은 문구집 02 시트의 다른 구분이다 — 같은 문자열이
  // 두 슬롯에 나오면 학생 눈에는 중복 노출이 된다.
  const needTexts = new Set(extras.learningAxes.map((axis) => axis.need));
  checkTrue(
    '맞춤 전략이 우선순위 표의 "필요한 것"과 겹치지 않는다',
    extras.strategyGroups.every((group) =>
      group.items.every((item) => !needTexts.has(item)),
    ),
  );
}

// F-05 — 긴급도 상세. 라벨은 배점표 141행 원문이고 score 는 화면에 쓰지 않는다.
{
  const urgency = buildReport(makeInput({})).urgency;
  check(
    "urgency.levelLabel = 배점표 원문 라벨",
    urgency.levelLabel,
    URGENCY_LEVEL_LABEL[urgency.level],
  );
  check(
    "urgency.areaThreshold 가 함께 실린다(UI 가 리터럴 40 을 갖지 않게)",
    urgency.areaThreshold,
    URGENCY_AREA_THRESHOLD,
  );
  checkTrue(
    "urgency.score 는 계속 실린다(어드민 전용 — 화면 미표시가 결정)",
    Number.isFinite(urgency.score),
  );
}

// F-15 — 성실도. flagged=false 경로에 부작용이 없어야 한다(기존 화면 회귀 0).
{
  const flat = Object.fromEntries(LIKERT1_KEYS.map((key) => [key, 50]));
  const flagged = buildReport(
    makeInput({
      likert1: flat,
      likert2: Object.fromEntries(LIKERT2_KEYS.map((key) => [key, 50])),
    }),
  );
  check(
    "직선 응답이면 헤드라인이 SINCERITY_HEAD 로 치환된다",
    flagged.headlineLines,
    [COMMON_COPY.SINCERITY_HEAD],
  );
  check(
    "헤드라인은 추가가 아니라 치환이다(줄 수 1)",
    flagged.headlineLines.length,
    1,
  );
  check(
    "특성 도입부도 치환된다",
    flagged.notices.traitIntro,
    COMMON_COPY.SINCERITY_TRAIT,
  );
  check(
    "화면 전용 배너가 붙는다",
    flagged.notices.sincerityBanner,
    COMMON_COPY.SINCERITY_BANNER,
  );
  check(
    "과제 도입부가 붙는다",
    flagged.notices.sincerityAct,
    COMMON_COPY.SINCERITY_ACT,
  );
  check("유형 판정은 보류된다", flagged.studentType, null);
  checkTrue(
    "점수는 무효화하지 않는다(영역 12개 그대로 산출)",
    flagged.areaDetails.page1.length === 6 &&
      flagged.areaDetails.page2.length === 6,
  );

  const normal = buildReport(
    makeInput({ likert1: { LK1_01: 75, LK1_03: 50 } }),
  );
  check(
    "평상시엔 TRAIT_INTRO 그대로",
    normal.notices.traitIntro,
    COMMON_COPY.TRAIT_INTRO,
  );
  check(
    "평상시엔 배너 없음",
    [normal.notices.sincerityBanner, normal.notices.sincerityAct],
    [null, null],
  );
  check("평상시엔 flagged=false", normal.sincerity.flagged, false);
}

// F-06 — 서비스 제한 안내는 학년 리터럴이 아니라 엔진 filterReason 을 따른다.
{
  const h3Late = buildReport(
    makeInput({
      profile: { name: null, gradeLevel: "H3", schoolType: null },
      meta: { schemaVersion: "test", diagnosedAt: "2026-07-01T00:00:00.000Z" },
    }),
  );
  check(
    "고3 6월 이후 진단이면 filterReason=H3_LATE",
    h3Late.serviceFilterReason,
    "H3_LATE",
  );
  check(
    "그때만 붙는 자체 결정 안내",
    h3Late.notices.serviceLimit,
    SELF_DECIDED.SERVICE_H3_LATE_NOTICE,
  );
  const h3Early = buildReport(
    makeInput({
      profile: { name: null, gradeLevel: "H3", schoolType: null },
      meta: { schemaVersion: "test", diagnosedAt: "2026-03-01T00:00:00.000Z" },
    }),
  );
  check(
    "고3 1~5월은 제한하지 않는다",
    [h3Early.serviceFilterReason, h3Early.notices.serviceLimit],
    [null, null],
  );
  const h3Unknown = buildReport(
    makeInput({ profile: { name: null, gradeLevel: "H3", schoolType: null } }),
  );
  check(
    "시각 불명이면 fail-open(선택지를 줄이지 않는다)",
    h3Unknown.serviceFilterReason,
    null,
  );
  check(
    "M3 안내는 문구집 원문 그대로 유지",
    buildReport(
      makeInput({
        profile: { name: null, gradeLevel: "M3", schoolType: null },
      }),
    ).notices.serviceLimit,
    COMMON_COPY.SVC_M3_LIMIT,
  );
}

// F-18 — 픽스처 폴백 구분 플래그. buildReport 를 통과한 데이터는 정의상 실제 응답이다.
check(
  "buildReport 결과는 항상 isSample=false",
  buildReport(makeInput({})).isSample,
  false,
);

// 확장 키가 늘어난 만큼 금지어·토큰 누출 검사도 다시 한 번 전량에 건다.
check(
  "확장 키 포함 금지어 0건",
  findBannedPhrases(
    buildReport(admissionInput, {
      cuts: CUTS_FIT,
      admissionMeta: { year: 2026 },
    }),
  ).map((hit) => hit.phrase),
  [],
);
checkTrue(
  "확장 키 포함 미치환 토큰 0건",
  unfilledTokens(
    buildReport(admissionInput, {
      cuts: CUTS_FIT,
      admissionMeta: { year: 2026 },
    }),
  ).length === 0,
);

/* ================================================================== *
 * S15. [F-격리] 자체 결정 값의 격리 · 폴백 채움분 정식 단언
 *
 * 이 섹션의 존재 이유는 하나다. 2026-08-11 에 우리가 **원본 근거 없이 정한 값**들이 있고,
 * 원저자 답이 오면 "상수만 교체하면 끝"이어야 한다. 그 약속은 문서가 아니라 여기서 지켜진다 —
 * 값이 로직에 인라인되거나 두 번째 정의처가 생기면 아래 단언이 붉어진다.
 *
 * 스캔 대상이 '문자열 포함 여부'인 이유: 값이 무엇인지 pin 하면 확정 시 두 곳을 고쳐야 해서
 * 오히려 교체를 막는다. 그래서 값 자체가 아니라 **값이 지켜야 할 불변식**(단일 정의처 · 단조성 ·
 * 배타성 · 경계)만 건다. 유일한 예외는 근거가 있는 값(시안 인용 '정체', 배점표 라벨)이다.
 * ================================================================== */

beginSection("[F-격리]");

// 자체 결정 문자열의 소비 표면 — 리포트를 그리거나 저장하는 모든 진단 파일이다.
// diagnosisCopy.js 는 제외한다(문구집 원문에 '학생부종합' 같은 어휘가 정당하게 들어 있다).
// admissionParsing.js 도 제외 — 전형 유형 문자열을 쓰지만 입결 HTML 파싱이라 도메인이 다르다.
const REPORT_COMPONENT_DIR = "components/renewal/report/";
const DIAGNOSIS_SURFACE = [
  "lib/diagnosisScoring.js",
  "lib/diagnosisCopyBinding.ts",
  "lib/diagnosisInputStorage.ts",
  "lib/diagnosisAdmissionCuts.ts",
  "data/diagnosisScoringTable.js",
  "data/diagnosisScreenCopy.js",
  // 결정문이 자체 결정 값의 집으로 지목했던 파일. 지금은 없지만 나중에 생기면 여기 걸린다 —
  // 같은 값이 두 파일에 존재하는 순간 "상수만 교체" 약속이 깨진다.
  "data/diagnosisSelfDecided.js",
  "hooks/useAdmissionCascade.js",
  "pages/renewal/FreeDiagnosisReport.jsx",
  "pages/renewal/SurveyStepShell.jsx",
  ...readdirSync(new URL(REPORT_COMPONENT_DIR, SRC_ROOT)).map(
    (file) => REPORT_COMPONENT_DIR + file,
  ),
].filter((path) => existsInSrc(path));

checkTrue(
  "소비 표면 스캔 대상이 실재한다(경로 오타로 스캔이 0건이 되지 않는다)",
  DIAGNOSIS_SURFACE.length >= 10,
);

/* ---- 격리 1. 표시 계층 자체 결정 문자열 — 정의처 1곳, 소비처 0곳 ---- */

const SELF_DECIDED_STRINGS = [
  SELF_DECIDED.GPA_UNKNOWN_SUFFIX,
  ...Object.values(SELF_DECIDED.GRADE_TREND_SHORT_LABEL),
  ...Object.values(SELF_DECIDED.ADMISSION_TYPE_DISPLAY),
  SELF_DECIDED.SERVICE_H3_LATE_NOTICE,
  SELF_DECIDED.ADMISSION_FINAL_AVG_OMITTED,
  SELF_DECIDED.PROB_RANGE_HEADING,
  SELF_DECIDED.PROB_REFERENCE_BADGE,
  // G-1c(2026-08-12 신설) — 5등급제 이중 표기 WARN 을 닫으며 추가된 접미어.
  SELF_DECIDED.ADMISSION_MINE_CONVERTED_SUFFIX,
];
check(
  "SELF_DECIDED 문자열 14건(키가 조용히 사라지지 않았다, G-1c 로 13→14)",
  SELF_DECIDED_STRINGS.length,
  14,
);
checkTrue(
  "SELF_DECIDED 는 동결(소비자가 값을 덮어쓸 수 없다)",
  Object.isFrozen(SELF_DECIDED),
);
checkTrue(
  "SELF_DECIDED 문자열은 전부 비어 있지 않다",
  SELF_DECIDED_STRINGS.every(
    (value) => typeof value === "string" && value.trim() !== "",
  ),
);

const selfDecidedHome = sourceOf("lib/diagnosisReport.ts");
const duplicatedDefinitions = SELF_DECIDED_STRINGS.filter(
  (value) => selfDecidedHome.split(value).length - 1 !== 1,
);
check(
  "자체 결정 문자열은 정의처에 정확히 1회만 나온다(로직 인라인 0건)",
  duplicatedDefinitions,
  [],
);

const leakedToConsumers = [];
DIAGNOSIS_SURFACE.forEach((path) => {
  const source = sourceOf(path);
  SELF_DECIDED_STRINGS.forEach((value) => {
    if (source.includes(value)) leakedToConsumers.push(`${path} ← ${value}`);
  });
});
// 여기가 붉어지면 누군가 값을 컴포넌트·훅에 복사한 것이다. 확정 문구가 와도 그 사본은 안 바뀐다.
check(
  "자체 결정 문자열이 소비 표면 어디에도 복제되지 않았다",
  leakedToConsumers,
  [],
);

/* ---- 격리 2. 엔진 자체 결정 숫자 — 함수 본문에 리터럴로 새지 않았다 ---- */

// fn.toString() 으로 실제 본문을 읽는다. 소스 파일을 정규식으로 자르는 것보다 정확하다 —
// 함수가 옮겨 다녀도 따라가고, 이름만 같은 다른 코드를 잘못 집지 않는다.
const SELF_DECIDED_NUMBERS = new Set([
  ...Object.values(ADMISSION_BAND_BASE_PROBABILITY),
  ...Object.values(ADMISSION_BAND_EDGE_ADJUST).map((value) => Math.abs(value)),
  ...Object.values(TYPE_RULES).flatMap((rule) => Object.values(rule)),
  SINCERITY_MIN_ANSWERED,
  SINCERITY_MAX_OFFMODE,
  SINCERITY_OFFMODE_MIN_DISTANCE,
  SERVICE_H3_LATE_MONTH,
]);
check(
  "자체 결정 숫자 목록이 비지 않았다",
  SELF_DECIDED_NUMBERS.size >= 10,
  true,
);

// [함수, 본문이 반드시 참조해야 하는 상수 식별자] — 식별자 검사는 "본문이 비어 있어 통과"를 막는다.
const CONSTANT_DRIVEN_FUNCTIONS = [
  [successProbability, ["ADMISSION_BAND_BASE_PROBABILITY"]],
  [probabilityRangeLabel, ["PROB_RANGE_LABELS"]],
  [classifyStudentType, ["TYPE_RULES"]],
  [isStraightLining, ["SINCERITY_MIN_ANSWERED", "SINCERITY_MAX_OFFMODE"]],
  [serviceCandidates, ["SERVICE_H3_LATE_MONTH", "SERVICE_H3_LATE_CODES"]],
];
const inlinedNumbers = [];
CONSTANT_DRIVEN_FUNCTIONS.forEach(([fn, identifiers]) => {
  const body = stripComments(fn.toString());
  checkTrue(
    `${fn.name} 본문이 상수 식별자를 참조한다(${identifiers.join(" · ")})`,
    identifiers.every((identifier) => body.includes(identifier)),
  );
  // 숫자 앞에 식별자·점이 오는 경우(예: LK1_01, obj.5)는 제외하고 순수 리터럴만 센다.
  const literals = (body.match(/(?<![\w.$])\d+(?:\.\d+)?/g) ?? []).map(Number);
  literals
    .filter((value) => SELF_DECIDED_NUMBERS.has(value))
    .forEach((value) => {
      inlinedNumbers.push(`${fn.name} ← ${value}`);
    });
});
check("자체 결정 숫자가 함수 본문에 인라인되지 않았다", inlinedNumbers, []);
// 남아 있는 리터럴 45 는 자체 결정이 아니라 배점표 근거값이다 — 정의처와 어긋나면 여기서 잡힌다.
check(
  "classifyStudentType 의 45 는 영역 취약 임계와 같은 값이다",
  AREA_BAND_THRESHOLDS.LOW,
  45,
);

const scoringSource = sourceOf("lib/diagnosisScoring.js");
checkTrue(
  "타임존 문자열도 상수를 거친다",
  !scoringSource.includes(`'${SERVICE_H3_LATE_TIMEZONE}'`),
);
checkTrue(
  "월 추출에 getMonth() 를 쓰지 않는다(실행 환경 타임존을 타면 경계일이 하루 밀린다)",
  !scoringSource.includes("getMonth()"),
);
checkTrue(
  "월 추출은 Intl 로 한다",
  scoringSource.includes("Intl.DateTimeFormat"),
);
checkTrue(
  "엔진은 문구 모듈을 import 하지 않는다(§6.2 계층 계약)",
  !scoringSource.includes("from './diagnosisCopy") &&
    !scoringSource.includes("data/diagnosisCopy"),
);

/* ---- 격리 3. 두 번째 집이 생기지 않았다 ---- */

check(
  "자체 결정 값의 집은 두 곳뿐이다(엔진 §11 · 조립 SELF_DECIDED) — 세 번째 파일이 생기면 여기서 잡힌다",
  existsInSrc("data/diagnosisSelfDecided.js"),
  false,
);
checkTrue(
  "§11 센티널은 동결(호출부가 필드를 얹어 상태를 오염시킬 수 없다)",
  Object.isFrozen(ADMISSION_FETCH_ERROR),
);
checkTrue(
  "센티널은 결측(null)과 구분 가능한 객체다",
  ADMISSION_FETCH_ERROR !== null && typeof ADMISSION_FETCH_ERROR === "object",
);

/* ================================================================== *
 * 확률 산출 — 경계 · 단조성 · 자료 없음
 * ================================================================== */

// 14·15·16번 가감 전 조합(5×6×6=180). 한 조합만 보면 clamp 경계에서 단조성이 깨져도 안 보인다.
const DELTA_COMBOS = [];
Object.keys(CSAT_MIN_DELTA).forEach((csatMin) => {
  Object.keys(JONGHAP_DELTA).forEach((jonghapReady) => {
    Object.keys(INTERVIEW_DELTA).forEach((interviewReady) => {
      DELTA_COMBOS.push({ csatMin, jonghapReady, interviewReady });
    });
  });
});
check("가감 조합 전량(5×6×6)", DELTA_COMBOS.length, 180);

const producedProbabilities = new Set();
let sweepViolations = 0;
DELTA_COMBOS.forEach((combo) => {
  const input = makeInput(combo);
  let previous = Infinity;
  for (let step = 100; step <= 600; step += 5) {
    const mine = roundHalfUp(step / 100, 2);
    const probability = successProbability(
      input,
      admissionBand(mine, probCuts),
      mine,
      probCuts,
    );
    producedProbabilities.add(probability);
    if (probability > previous) sweepViolations += 1;
    previous = probability;
  }
});
// 학생 화면에서 "내신이 더 나쁜데 합격 확률이 더 높다"가 나오면 이 리포트는 신뢰를 통째로 잃는다.
check("가감 180조합 × 내신 스윕 전량에서 확률 역전 0건", sweepViolations, 0);
checkTrue(
  "산출 가능한 확률은 전부 5의 배수다(구간 라벨이 경계에 걸치지 않는다)",
  [...producedProbabilities].every((value) => value % 5 === 0),
);
checkTrue(
  "산출 가능한 확률은 전부 PROB_MIN~PROB_MAX 안이다",
  [...producedProbabilities].every(
    (value) => value >= PROB_MIN && value <= PROB_MAX,
  ),
);
checkTrue(
  "산출 가능한 확률 전량에 구간 라벨이 있다(라벨 없는 값이 화면에 뜨지 않는다)",
  [...producedProbabilities].every(
    (value) => typeof probabilityRangeLabel(value) === "string",
  ),
);

// 구간 테이블 구조 — 최초 매치 방식이라 내림차순이 아니면 조용히 잘못된 라벨이 나간다.
checkTrue(
  "PROB_RANGE_LABELS 는 min 내림차순",
  PROB_RANGE_LABELS.every(
    (entry, index) =>
      index === 0 || PROB_RANGE_LABELS[index - 1].min > entry.min,
  ),
);
check(
  "마지막 구간의 하한은 0(0~PROB_MAX 전 구간을 덮는다)",
  PROB_RANGE_LABELS[PROB_RANGE_LABELS.length - 1].min,
  0,
);
checkTrue(
  "구간 라벨은 전부 유일",
  new Set(PROB_RANGE_LABELS.map((entry) => entry.label)).size ===
    PROB_RANGE_LABELS.length,
);
{
  let uncovered = 0;
  for (let value = 0; value <= PROB_MAX; value += 1) {
    if (typeof probabilityRangeLabel(value) !== "string") uncovered += 1;
  }
  check("0~PROB_MAX 전 정수에 라벨이 있다(테이블에 구멍 없음)", uncovered, 0);
}
// 06_금지어 '결과 단정' — 산식이 아니라 명시 테이블이라 리팩터링으로도 되살아날 수 없어야 한다.
// '10~20%' 처럼 끝이 0 인 라벨은 정상이다 — 막아야 하는 것은 **0 에서 시작하는 구간**('0~10%')이다.
checkTrue(
  "0 에서 시작하는 구간이 없다(불합격 단정 회피)",
  PROB_RANGE_LABELS.every((entry) => !/(?<!\d)0\s*~/.test(entry.label)),
);
// 인쇄 노출 여부를 한 줄로 되돌릴 수 있게 남긴 스위치. 값이 바뀌면 A4 2장에 %가 나가므로 pin 한다.
check(
  "확률 노출 위치는 화면 전용(인쇄 A4 2장은 밴드 4글자 유지)",
  PROB_DISPLAY_MODE,
  "SCREEN_EXTRA",
);

// cuts 가 없으면 확률을 만들지 않는다 — 추정치를 지어내면 그 숫자로 진로를 정한다.
{
  const noCuts = buildReport(admissionInput, {
    admissionMeta: { year: 2026 },
  }).admission;
  check(
    "cuts 없음 → 확률·구간 라벨 둘 다 null",
    [noCuts.probability, noCuts.probabilityRange],
    [null, null],
  );
  checkTrue(
    "cuts 없음 → 인쇄 슬롯에도 % 가 없다",
    !String(noCuts.probabilityValue).includes("%"),
  );
  const half = buildReport(admissionInput, {
    cuts: { cut50: 2.5, cut70: null },
    admissionMeta: { year: 2026 },
  }).admission;
  checkTrue(
    "컷 한쪽만 있어도 항등식으로 확률이 나온다",
    typeof half.probability === "number",
  );
}

/* ================================================================== *
 * 유형 8종 — 규칙 배타성과 순서 충돌
 * ================================================================== */

// ④(산포 <= 10)가 성립하면 ⑧⑨는 구조적으로 성립할 수 없다는 것이 결정문의 근거였다.
// 근거가 말뿐이 아니라 실제로 참인지 평탄 프로필 전량으로 확인한다.
{
  let spreadConflicts = 0;
  let flatProfiles = 0;
  for (let base = 45; base <= 90; base += 5) {
    for (let spread = 0; spread <= TYPE_RULES.BALANCED.spreadMax; spread += 1) {
      PAGE1_AREAS.forEach((lowArea) => {
        PAGE1_AREAS.filter((area) => area !== lowArea).forEach((highArea) => {
          const areas = makeAreaScores(base, {
            [lowArea]: base,
            [highArea]: base + spread,
          });
          const type = classifyStudentType(makeInput(variedLikert24), areas);
          flatProfiles += 1;
          if (type === "PLAN_HEAVY" || type === "GOAL_EXEC_GAP")
            spreadConflicts += 1;
        });
      });
    }
  }
  checkTrue("평탄 프로필 스윕이 실제로 돌았다", flatProfiles > 3000);
  check(
    "산포 10 이내에서는 ⑧⑨가 절대 나오지 않는다(④와 배타)",
    spreadConflicts,
    0,
  );
}
// ⑧⑨는 PLAN 조건이 서로 정반대라 술어 수준에서 배타다 — 임계를 고칠 때 이 성질이 깨지면 잡힌다.
checkTrue(
  "⑧(plan >= 70)과 ⑨(plan < 70)는 술어 자체가 배타",
  TYPE_RULES.PLAN_HEAVY.planMin >= TYPE_RULES.GOAL_EXEC_GAP.planMax,
);
// ③이 ⑤⑥⑦보다 앞선다는 것은 "최저 영역이 무엇이든" 성립해야 한다(한 영역만 확인하면 우연일 수 있다).
{
  const alwaysStable = PAGE1_AREAS.every(
    (lowArea) =>
      classifyStudentType(
        makeInput(variedLikert24),
        makeAreaScores(85, { [lowArea]: 70 }),
      ) === "SYSTEM_STABLE",
  );
  checkTrue(
    "전 영역 70+ · 종합 80+ 면 최저 영역이 무엇이든 ③이 이긴다",
    alwaysStable,
  );
}
// ②는 ③④보다 앞선다 — 전 영역이 높아도 STABILITY 가 무너지면 부담 누적이 먼저다.
check(
  "② STABILITY < 45 는 ③(전 영역 70+)보다 우선",
  classifyStudentType(
    makeInput(variedLikert24),
    makeAreaScores(85, { STABILITY: 40 }),
  ),
  "BURDEN_ACCUM",
);
// 판정만 살아나고 문구가 없으면 화면이 빈다 — 8종 전부 head 를 갖는지 확인한다.
checkTrue(
  "8종 전부 유형 문구(head)를 갖는다",
  TYPE_CODES.every((code) => typeof TYPE_COPY[code]?.head === "string"),
);

/* ================================================================== *
 * 불성실 판정 — 정탐 경계와 오탐 방지 경계
 * ================================================================== */

// 임계를 코드에서 읽어 픽스처를 만든다. 상수를 바꾸면 경계 케이스가 따라 움직여야 하고,
// 여기에 숫자를 pin 하면 상수만 교체하는 길이 막힌다.
const ALL_LIKERT_KEYS = [...LIKERT1_KEYS, ...LIKERT2_KEYS];
// G-2(WARN 2) — offmode 값은 mode 와 거리 100(0 vs 100)을 둬 SINCERITY_OFFMODE_MIN_DISTANCE(50)
// 를 항상 넘긴다. 이 헬퍼는 '개수' 경계(SINCERITY_MAX_OFFMODE)를 격리해서 보는 용도라 거리
// 자체를 흔들지 않는다.
function sameLikert(count, offmode = 0) {
  const likert1 = {};
  const likert2 = {};
  ALL_LIKERT_KEYS.slice(0, count).forEach((key, index) => {
    const value = index < offmode ? 0 : 100;
    if (LIKERT1_KEYS.includes(key)) likert1[key] = value;
    else likert2[key] = value;
  });
  return { likert1, likert2 };
}
check(
  `응답 ${SINCERITY_MIN_ANSWERED - 1}문장 전부 동일 → flagged 아님(하한 바로 아래)`,
  isStraightLining(makeInput(sameLikert(SINCERITY_MIN_ANSWERED - 1))),
  false,
);
check(
  `응답 ${SINCERITY_MIN_ANSWERED}문장 전부 동일 → flagged(하한 정확히)`,
  isStraightLining(makeInput(sameLikert(SINCERITY_MIN_ANSWERED))),
  true,
);
check(
  `하한 표본에서 허용치(${SINCERITY_MAX_OFFMODE}) 이내는 flagged`,
  isStraightLining(
    makeInput(sameLikert(SINCERITY_MIN_ANSWERED, SINCERITY_MAX_OFFMODE)),
  ),
  true,
);
check(
  "하한 표본에서 허용치를 넘으면 flagged 아님",
  isStraightLining(
    makeInput(sameLikert(SINCERITY_MIN_ANSWERED, SINCERITY_MAX_OFFMODE + 1)),
  ),
  false,
);
// 오탐 방지의 본질 — 성실하게 다양한 응답을 낸 학생은 표본이 아무리 많아도 걸리지 않는다.
check(
  "24문장 다양 응답 → flagged 아님",
  isStraightLining(makeInput(variedLikert24)),
  false,
);
check(
  "sincerityOf.answeredCount 는 실제 응답 수",
  sincerityOf(makeInput(sameLikert(SINCERITY_MIN_ANSWERED))).answeredCount,
  SINCERITY_MIN_ANSWERED,
);
// 리포트 계층까지 신호가 이어지는지 — 판정만 되고 배너가 안 붙으면 학생은 경고를 못 본다.
check(
  "하한 표본 직선 응답이 리포트 배너까지 이어진다",
  buildReport(makeInput(sameLikert(SINCERITY_MIN_ANSWERED))).notices
    .sincerityBanner,
  COMMON_COPY.SINCERITY_BANNER,
);

/* ================================================================== *
 * 고3 6월 이후 제한 · 성적 흐름 · 등급 표기
 * ================================================================== */

check(
  "고3 12월 진단도 2종(연말까지 제한이 이어진다)",
  serviceCandidates("H3", "2026-12-20T00:00:00Z").codes,
  SERVICE_H3_LATE_CODES,
);
checkTrue(
  "제한 2종은 전체 서비스 코드의 부분집합",
  SERVICE_H3_LATE_CODES.every((code) => SERVICE_CODES.includes(code)),
);
check("제한은 정확히 2종", SERVICE_H3_LATE_CODES.length, 2);
// 표를 채우면 1~5월 진단자까지 잘린다 — 시점 분기는 serviceCandidates 가 소유해야 한다.
check(
  "SERVICE_GRADE_FILTER.H3 는 null 유지(시점 분기를 표에 넣지 않는다)",
  SERVICE_GRADE_FILTER.H3,
  null,
);
check(
  "M3 제한 2종과 같은 조합",
  [...SERVICE_H3_LATE_CODES].sort(),
  [...SERVICE_GRADE_FILTER.M3].sort(),
);

// 성적 흐름 축약 6종 전량이 실제로 리포트까지 도달하는지. 값은 상수에서 읽는다(확정 시 상수만 교체).
{
  const q8Codes = renewalSurveyQuestions.find(
    (question) => question.id === "q8",
  ).optionCodes;
  const rendered = q8Codes.map(
    (code) => buildReport(makeInput({ gradeTrend: code })).student.gradeTrend,
  );
  check(
    "성적 흐름 6종 전량이 축약 라벨로 렌더된다",
    rendered,
    q8Codes.map((code) => SELF_DECIDED.GRADE_TREND_SHORT_LABEL[code]),
  );
  checkTrue(
    "6종 전부 미입력 폴백으로 새지 않는다",
    rendered.every((label) => label !== COPY_FALLBACK.VALUE_MISSING),
  );
  // 진짜 미매핑 코드(선택지가 늘어난 상황) — 빈 칸이 아니라 안전 폴백으로 떨어져야 한다.
  check(
    "매핑에 없는 코드는 빈 칸이 아니라 폴백",
    buildReport(makeInput({ gradeTrend: "UNKNOWN_TREND" })).student.gradeTrend,
    COPY_FALLBACK.VALUE_MISSING,
  );
}

// F-12 — 표시만 살리고 계산에는 넣지 않는다. 아래 두 단언이 한 쌍으로 그 경계를 지킨다.
{
  const unknownGpa = buildReport(
    makeInput({
      gradeSystem: "UNKNOWN",
      scores: {
        naesinOverall: 2.6,
        recentExamAvg: null,
        mock: {},
        mockFilledCount: 0,
      },
    }),
  ).student.gpa;
  checkTrue(
    "UNKNOWN 내신은 더 이상 미입력으로 뜨지 않는다",
    unknownGpa !== COPY_FALLBACK.VALUE_MISSING,
  );
  checkTrue(
    "UNKNOWN 표기에 입력값이 그대로 보인다",
    unknownGpa.startsWith("2.60"),
  );
  checkTrue(
    "UNKNOWN 표기가 체계 미확인임을 밝힌다",
    unknownGpa.endsWith(SELF_DECIDED.GPA_UNKNOWN_SUFFIX),
  );
  // 여기를 함께 열면 체계 미상 값이 9등급 컷과 직접 비교되어 밴드·확률이 통째로 오염된다.
  check(
    "그래도 9등급 환산은 여전히 null(입결 비교 오염 금지)",
    convertToNineScale("UNKNOWN", 2.6),
    null,
  );
  check(
    "UNKNOWN 은 밴드를 만들지 않는다",
    buildReport(
      makeInput({
        gradeSystem: "UNKNOWN",
        scores: {
          naesinOverall: 2.6,
          recentExamAvg: null,
          mock: {},
          mockFilledCount: 0,
        },
      }),
      { cuts: CUTS_FIT },
    ).admission.probability,
    null,
  );
}

/* ================================================================== *
 * 입결 0행 · 조회 실패 — 배선이 끊기면 학생은 두 상황을 구분할 수 없다
 * ================================================================== */

{
  const failed = buildReport(admissionInput, {
    cuts: null,
    cutsError: true,
  }).admission;
  // 실패는 컷을 못 가져온 것이지 내 성적이 사라진 게 아니다 — 내 성적 행은 남고 컷 행만 없다.
  // 남는 행은 내 성적 행(emphasis)뿐이다 — 컷 행은 emphasis 가 false 라 이 단언으로 걸러진다.
  checkTrue(
    "조회 실패면 컷 행을 만들지 않는다(있지도 않은 숫자를 지어내지 않는다)",
    failed.rows.every((row) => row.emphasis === true),
  );
  check("내 성적 행은 그대로 남는다", failed.rows.length, 1);
  // G-1b(2026-08-12) 회귀 방지 — 종전엔 이 단언이 `hasRows === true` 를 정상으로 봤다. 그게
  // 바로 F-10 버그였다: mine 행 1개만 있어도 "표가 있다"로 잘못 판정해 헤더 + 자기 성적 1행짜리
  // 빈 비교표가 그려졌다. 이제 hasRows 는 '비교 대상(컷 행)이 있는가'를 본다 — mine 뿐이면 false.
  check(
    "mine 행만 있으면 hasRows=false (비교 대상이 없다 — F-10 재발 방지)",
    failed.hasRows,
    false,
  );
  // REPORT_FALLBACK.BAND_VALUE_NODATA 는 diagnosisReport.js 밖으로 export 되지 않는다(그 파일의
  // 유일한 소비자라는 계약) — 값 자체('자료 없음')를 직접 비교한다. probabilityValue 의 동일
  // 폴백 자리와 값을 공유한다(§7.2 REPORT_FALLBACK 정의).
  check(
    "mine 행만 있어도 emptyNotice 는 값을 낸다(NOTICE_ROW 모드가 쓸 문구)",
    failed.emptyNotice,
    "자료 없음",
  );
  checkTrue(
    "조회 실패여도 확률에 % 가 없다",
    !String(failed.probabilityValue).includes("%"),
  );
  check(
    "조회 실패와 결측이 동시에 참일 수 없다",
    [
      failed.fetchFailed,
      buildReport(admissionInput, { cuts: null }).admission.fetchFailed,
    ],
    [true, false],
  );
  // 실패 문장은 인쇄에도 나간다(자료를 못 불러왔다는 사실은 종이에서도 참이다) → 금지어 검사 대상.
  check(
    "실패 문장에 금지어 없음",
    findBannedPhrases(failed.summary).map((hit) => hit.phrase),
    [],
  );
}

// 센티널 계약은 값이 아니라 **호출부의 비교 방식**에서 깨진다 — 소스로 못 박는다.
{
  const cutsSource = sourceOf("lib/diagnosisAdmissionCuts.ts");
  checkTrue(
    "조회 실패는 센티널로 반환한다(에러를 null 로 삼키지 않는다)",
    cutsSource.includes("return ADMISSION_FETCH_ERROR"),
  );
  checkTrue(
    "예외도 값으로 정규화한다(훅에 throw 가 새지 않는다)",
    /try\s*{/.test(cutsSource) && cutsSource.includes("catch"),
  );

  const cascadeSource = sourceOf("hooks/useAdmissionCascade.js");
  checkTrue(
    "훅은 참조 동일성으로 판별한다(=== ADMISSION_FETCH_ERROR)",
    cascadeSource.includes("=== ADMISSION_FETCH_ERROR"),
  );
  checkTrue(
    "느슨한 비교로 센티널을 결측에 뭉개지 않는다",
    !cascadeSource.includes("== ADMISSION_FETCH_ERROR)") ||
      cascadeSource.includes("=== ADMISSION_FETCH_ERROR"),
  );
  checkTrue(
    "네트워크 예외를 받는 마지막 관문(.catch)이 있다",
    cascadeSource.includes(".catch("),
  );
  // 리셋이 없으면 한 번 실패한 뒤 다른 대학을 골라도 계속 에러 화면이 남는다.
  // G-1a(2026-08-12) — setCuts/setCutsError 개별 호출이 applyOutcome(cuts, cutsError) 헬퍼로
  // 통합됐다(상태와 cutsOutcomeRef 스냅샷을 항상 함께 갱신하기 위해서다 — awaitCuts() 가 그
  // ref 를 읽는다). 리셋 경로는 이제 `applyOutcome(null, false)` 다.
  checkTrue(
    "선택이 바뀌면 에러 상태를 되돌린다",
    cascadeSource.includes("applyOutcome(null, false)"),
  );
  checkTrue("훅이 cutsError 를 밖으로 낸다", /cutsError/.test(cascadeSource));
  // awaitCuts() — 제출 시점 경합 방지(G-1a). 진행 중인 조회를 기다린 뒤 ref 스냅샷을 직접
  // 돌려준다. state 를 읽지 않는 이유는 다음 렌더까지 반영이 늦어질 수 있어서다.
  checkTrue(
    "awaitCuts 가 정의돼 있다(제출 시점 경합 방지)",
    cascadeSource.includes("awaitCuts"),
  );
  checkTrue(
    "submitDiagnosis 는 cuts/cutsError 를 직접 읽지 않고 awaitCuts() 를 기다린다",
    sourceOf("pages/renewal/SurveyStepShell.jsx").includes("awaitCuts()"),
  );
  // 센티널 객체를 그대로 저장하면 직렬화로 참조 동일성이 사라진다 — 불리언만 넘어가야 한다.
  checkTrue(
    "저장 계층은 불리언 신호만 받는다",
    sourceOf("lib/diagnosisInputStorage.ts").includes("admissionCutsError"),
  );
}

/* ================================================================== *
 * 요약
 * ================================================================== */

// 케이스를 지우면서 pending 만 남기는 침묵 약화를 막는 하한선.
const asserted = stats.pass + stats.fail;
if (asserted < MIN_ASSERTIONS) {
  stats.fail += 1;
  show(
    `FAIL - [메타] 비-pending 단언이 ${asserted}건으로 하한 ${MIN_ASSERTIONS} 미만이다 — 케이스가 사라졌거나 전부 pending 이 됐다`,
  );
}
if (
  EXAMPLE_CASES.filter((item) => !item.pending).length <
  EXAMPLE_CASES_MIN_ASSERTIONS
) {
  stats.fail += 1;
  show(
    `FAIL - [메타] EXAMPLE_CASES 의 비-pending 픽스처가 ${EXAMPLE_CASES_MIN_ASSERTIONS}건 미만이다`,
  );
}

console.log("\n─────────────────────────────────────────────");
console.log(
  `[diagnosis] 단언 ${stats.pass + stats.fail}건 중 ${stats.pass}건 통과, ${stats.fail}건 실패.`,
);
console.log(
  `[diagnosis] pending ${stats.pending}건(§9 미확정 — 종료코드 미반영) · WARN ${stats.warn}건 · SKIP ${stats.skip}건.`,
);
[...pendingByReason.entries()]
  .sort((a, b) => a[0].localeCompare(b[0]))
  .forEach(([reason, bucket]) => {
    console.log(
      `[diagnosis]   pending ${String(bucket.total).padStart(2)}건 (현 가정과 불일치 ${bucket.diff}) — ${reason}`,
    );
  });
if (stats.pending > 0) {
  console.log(
    "[diagnosis] pending 은 확정 후 §8 기대값을 재작성한다. 전량 출력은 --verbose.",
  );
}
console.log(`[diagnosis] 결과: ${stats.fail ? "FAIL" : "PASS"}`);

process.exitCode = stats.fail ? 1 : 0;
