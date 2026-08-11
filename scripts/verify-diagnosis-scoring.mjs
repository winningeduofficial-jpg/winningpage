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

import process from 'node:process';

import {
  roundHalfUp,
  normalizeAnswers,
  convertToNineScale,
  scoreAreas,
  overallScore,
  levelOf,
  stateOf,
  toneOf,
  priorityBadges,
  targetGap,
  urgencyOf,
  rankServices,
  detectEmotionalSignal,
  classifyStudentType,
  admissionMasterKey,
  admissionBand,
  admissionRows,
  successProbability
} from '../src/lib/diagnosisScoring.js';
import { findBannedPhrases, fill } from '../src/lib/diagnosisCopyBinding.js';
// 정적 import 다. 동적 import + try/catch 로 감싸면 문법 오류·잘못된 경로 같은 진짜 고장까지
// 삼켜서 §7.4.3 불변식을 통째로 건너뛴 채 PASS 를 낸다(T16 이 아직 없을 수 있다는 전제는 해소됐다).
import { buildReport } from '../src/lib/diagnosisReport.js';
import {
  AREA_CODES,
  PAGE1_AREAS,
  PAGE2_AREAS,
  AREA_LABEL,
  OPTION_CODES,
  OPTION_SOURCE_QUESTION,
  LIKERT1_KEYS,
  LIKERT2_KEYS,
  EXCLUSIVE_CODES,
  OBSTACLE_DEDUCTIONS,
  DIFFICULTY_DEDUCTIONS,
  MOCK_FILL_POINTS,
  SERVICE_CODES,
  SERVICE_LABEL,
  SERVICE_PART_CAPS,
  SCORE_BANDS,
  AREA_BAND_THRESHOLDS,
  STATE_LABEL,
  STATE_TONE,
  BADGES,
  LEVEL_LABEL,
  TARGET_SCORE,
  URGENCY_SCOPE,
  URGENCY_AREA_THRESHOLD,
  BASE_PROBABILITY,
  PROB_MAX,
  EXAMPLE_CASES,
  EXAMPLE_CASES_MIN_ASSERTIONS
} from '../src/data/diagnosisScoringTable.js';
import {
  TYPE_CODES,
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
  TOKEN_SCOPE,
  BANNED_PHRASES,
  COPY_FALLBACK
} from '../src/data/diagnosisCopy.js';
import { renewalSurveyQuestions } from '../src/data/renewalSurveyQuestions.js';
// 설문 진행 판정 술어. React 를 import 하지 않는 순수 모듈이라 plain node 에서 그대로 돌아간다.
import { isAnswered, isQuestionAnswered, isStepComplete } from '../src/lib/renewalSurvey.js';

const VERBOSE = process.argv.includes('--verbose');

/**
 * 비-pending 단언 최소 개수. 이 아래로 떨어지면 "케이스가 전부 pending 이 되어
 * 스크립트가 공허하게 통과"한 상태다 — verify-admission-doc-equivalence.mjs 의
 * MIN_COMPARED_CELLS 와 같은 기법이다. 케이스를 지우면서 pending 을 늘리는 식의
 * 침묵 약화를 이 상수가 막는다.
 */
// 실측 404건(2026-08-11, Q-09·Q-10·Q-28·Q-29·Q-05·W2 확정으로 마지막 pending 6건이 정식
// 단언으로 승격 + Q-05 픽스처·Q-28 4조합 경계·Q-29 report 통합 검증·Q-10 게이트 회귀 신설로
// 365 → 404, pending 6 → 0). 하한을 현재값 근처에 두지 않으면 가드가 작동하지 않는다 —
// 40 이던 시절에는 실경로 단언의 7/8 이 사라져도 조용히 통과했다.
// 케이스를 의도적으로 늘리거나 줄일 때 이 값을 함께 갱신한다.
const MIN_ASSERTIONS = 400;

/* ================================================================== *
 * 0. 단언 하니스
 * ================================================================== */

const stats = { pass: 0, fail: 0, pending: 0, skip: 0, warn: 0 };
/** pending 사유(Q 번호)별 집계. 기대값이 미확정인 항목이 요약에서 사라지지 않게 남긴다. */
const pendingByReason = new Map();
let section = '';

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
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    return ka.length === kb.length && ka.every((key) => same(a[key], b[key]));
  }
  return false;
}

function render(value) {
  if (typeof value === 'string') return `'${value}'`;
  if (value === undefined) return 'undefined';
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
      show(`PENDING(불일치) - ${label} (기대=${render(expected)}, 실제=${render(actual)}) — ${opts.pending}`);
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

function warn(message) {
  stats.warn += 1;
  show(`WARN - ${message}`);
}

// 현재 SKIP 을 내는 섹션은 없다(buildReport 동적 import 를 걷어내면서 사라졌다). 하니스는 남겨
// 둔다 — 실행 환경에 따라 건너뛸 검사가 생기면 '조용히 없음'이 아니라 SKIP 으로 보여야 한다.
function skip(message) {
  stats.skip += 1;
  show(`SKIP - ${message}`);
}

const questionById = new Map(renewalSurveyQuestions.map((question) => [question.id, question]));
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
    meta: { schemaVersion: 'test', diagnosedAt: null },
    profile: { name: null, gradeLevel: null, schoolType: null },
    goal: { level: null, reason: null, targetUniversity: null, targetMajor: null },
    gradeSystem: null,
    scores: { naesinOverall: null, recentExamAvg: null, mock: {}, mockFilledCount: 0 },
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
    freeText: '',
    ...overrides
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

beginSection('[§3.5]');

check('q10 선택지 13지', optionsOf('q10').length, 13);
check('q10 마지막 = 배타(OBS_13)', questionById.get('q10')?.exclusiveCodes ?? [], [EXCLUSIVE_CODES.OBSTACLE]);
check(
  'q10 배타 라벨 = 마지막 선택지',
  questionById.get('q10')?.exclusiveValues ?? [],
  [optionsOf('q10').at(-1)]
);
check('q12 선택지 14지', optionsOf('q12').length, 14);
check('q12 마지막 = 배타(DIF_14)', questionById.get('q12')?.exclusiveCodes ?? [], [EXCLUSIVE_CODES.DIFFICULTY]);
check(
  'q12 배타 라벨 = 마지막 선택지',
  questionById.get('q12')?.exclusiveValues ?? [],
  [optionsOf('q12').at(-1)]
);
check('q14 선택지 10지', optionsOf('q14').length, 10);
check('q9 문장 12개', statementsOf('q9').length, 12);
check('q11 문장 12개', statementsOf('q11').length, 12);

// 저장 키 승격(T2) 이후 statements[i].key 가 곧 안정 키다. 승격 전 문자열 배열이면 키가 '0'.. 라
// 정규화가 전부 결측이 되므로, 여기서 형태까지 못박는다.
check(
  'q9 문장 키 = LIKERT1_KEYS',
  statementsOf('q9').map((s) => (typeof s === 'string' ? null : s?.key)),
  LIKERT1_KEYS
);
check(
  'q11 문장 키 = LIKERT2_KEYS',
  statementsOf('q11').map((s) => (typeof s === 'string' ? null : s?.key)),
  LIKERT2_KEYS
);

// OPTION_CODES 는 서수 → 코드 단방향 맵이라 길이가 어긋나는 순간 조용히 오채점된다.
Object.entries(OPTION_CODES).forEach(([group, codes]) => {
  const questionId = OPTION_SOURCE_QUESTION[group];
  check(`OPTION_CODES.${group} 길이 = ${questionId}.options 길이`, codes.length, optionsOf(questionId).length);
});

// 문항이 직접 들고 있는 optionCodes 와도 대조한다 — 둘이 갈라지면 UI 와 채점이 다른 코드를 쓴다.
// **전 그룹**을 돈다. 3그룹만 보던 시절에는 나머지 10그룹이 갈라져도 조용히 오채점됐다.
Object.entries(OPTION_SOURCE_QUESTION).forEach(([group, questionId]) => {
  check(
    `${questionId}.optionCodes = OPTION_CODES.${group}`,
    questionById.get(questionId)?.optionCodes ?? [],
    OPTION_CODES[group]
  );
});

// 선택지가 전부 순수 문자열이라는 것이 라벨→서수 변환(indexOf)의 전제다. 객체형이 섞이면
// getOptionCode 가 -1 을 내고 해당 문항 전체가 미응답으로 채점된다.
checkTrue(
  '전 문항의 options 는 문자열 배열',
  renewalSurveyQuestions.every((question) =>
    (question.options ?? []).every((option) => typeof option === 'string')
  )
);

check('감점표(OBSTACLE) 13종 전량 정의', Object.keys(OBSTACLE_DEDUCTIONS), OPTION_CODES.OBSTACLE);
check('감점표(DIFFICULTY) 14종 전량 정의', Object.keys(DIFFICULTY_DEDUCTIONS), OPTION_CODES.DIFFICULTY);
check('배타 코드는 감점 0 (OBS_13)', OBSTACLE_DEDUCTIONS.OBS_13, { area: null, points: 0 });
check('배타 코드는 감점 0 (DIF_14)', DIFFICULTY_DEDUCTIONS.DIF_14, { area: null, points: 0 });

/* ================================================================== *
 * S1b. §3 정규화 관통 — 원시 answers → DiagnosisInput → 영역 점수
 *
 * 나머지 케이스는 DiagnosisInput 을 손으로 조립해 §3 계층을 통째로 건너뛴다. 그러면
 * 리커트 방향 반전(0='매우 그렇다' → 100)이 뒤집혀도 12영역 점수가 전부 반전된 채 통과한다.
 * 여기서 한 번은 UI 가 실제로 저장하는 모양(라벨 문자열 · 컬럼 인덱스 · 문자열 숫자)에서 출발한다.
 * ================================================================== */

beginSection('[§3 정규화]');

// 라벨 → 코드 왕복. 전 그룹을 돌아 서수 계약이 UI·채점 양쪽에서 같은 코드를 내는지 못박는다.
Object.entries(OPTION_SOURCE_QUESTION).forEach(([group, questionId]) => {
  const codes = OPTION_CODES[group];
  checkTrue(
    `${questionId} 라벨→코드 왕복 (${codes.length}지)`,
    codes.every((code) => labelOf(questionId, code) != null)
  );
});

// 리커트 방향(§3.3). LikertMatrix 는 컬럼 인덱스를 저장하고 배점표는 100='매우 그렇다' 다.
const likertRaw = normalizeAnswers({ q9: { LK1_01: 0, LK1_02: 1, LK1_03: 2, LK1_04: 3, LK1_05: 4 } });
check('컬럼 0(매우 그렇다) → 100', likertRaw.likert1.LK1_01, 100);
check('컬럼 1 → 75', likertRaw.likert1.LK1_02, 75);
check('컬럼 2(보통이다) → 50', likertRaw.likert1.LK1_03, 50);
check('컬럼 3 → 25', likertRaw.likert1.LK1_04, 25);
check('컬럼 4(전혀 그렇지 않다) → 0', likertRaw.likert1.LK1_05, 0);
check('미응답 문장은 null(0 이 아니다)', likertRaw.likert1.LK1_06, null);
check('정의역 밖 컬럼(5)은 null', normalizeAnswers({ q9: { LK1_01: 5 } }).likert1.LK1_01, null);

// CASE-01 을 원시 응답에서 다시 재현한다 — 정규화가 한 칸이라도 어긋나면 41 이 나오지 않는다.
const case01RawAnswers = {
  q9: { LK1_03: 2, LK1_04: 3 }, // '보통이다' / '별로 그렇지 않다'
  q10: [labelOf('q10', 'OBS_02')]
};
const case01FromRaw = normalizeAnswers(case01RawAnswers, { diagnosedAt: '2026-08-11T00:00:00.000Z' });
check('라벨 → 코드 (q10 두 번째 선택지 = OBS_02)', case01FromRaw.obstacles, ['OBS_02']);
check('정규화 관통 CASE-01: 계획 설계 = 41', scoreAreas(case01FromRaw).PLAN, 41);
check('meta.diagnosedAt 은 호출부가 넣는다', case01FromRaw.meta.diagnosedAt, '2026-08-11T00:00:00.000Z');

// 전 문항을 라벨로 채운 응답 1건. 코드 매핑·grade-grid 문자열 파싱·admissionQuery 4단 게이트를 함께 태운다.
const fullRawAnswers = {
  q1: labelOf('q1', 'H2'),
  q2: labelOf('q2', 'GENERAL'),
  q3: labelOf('q3', 'BOTH'),
  'q3-target-reason': labelOf('q3-target-reason', 'APTITUDE'),
  'q3-target-university': '  위닝대학교  ',
  'q3-target-major': '경영학과',
  q4: labelOf('q4', 'FIVE'),
  q6: { overall_avg: '2.00', recent_exam_avg: '', mock_korean: '1', mock_math: '2', mock_english: '' },
  q8: labelOf('q8', 'FLAT'),
  'q8-followup': labelOf('q8-followup', 'MATH'),
  q10: [labelOf('q10', 'OBS_01'), labelOf('q10', 'OBS_05')],
  q12: [labelOf('q12', 'DIF_10')],
  q13: labelOf('q13', 'EXAM_2W'),
  q14: [labelOf('q14', 'WISH_07')],
  q15: { university: '위닝대학교', department: '경영학과', admissionType: '학생부교과', detailType: '일반전형' },
  q16: labelOf('q16', 'HIGH'),
  q17: labelOf('q17', 'CONNECTED'),
  q18: labelOf('q18', 'CONFIDENT'),
  q19: '요즘 성적 때문에 불안해요'
};
const fullInput = normalizeAnswers(fullRawAnswers);
check('q1 → gradeLevel', fullInput.profile.gradeLevel, 'H2');
check('q4 → gradeSystem', fullInput.gradeSystem, 'FIVE');
check('q8-followup 은 라벨이 아니라 코드로 담긴다(§3.5)', fullInput.trendSubject, 'MATH');
check('grade-grid 문자열 → 숫자', fullInput.scores.naesinOverall, 2);
check("빈 문자열 칸은 null (NaN 차단)", fullInput.scores.recentExamAvg, null);
check('mockFilledCount = 채워진 칸 수', fullInput.scores.mockFilledCount, 2);
check('자유 텍스트는 trim 후 저장', fullInput.goal.targetUniversity, '위닝대학교');
check('복수선택은 코드 배열', fullInput.difficulties, ['DIF_10']);
checkTrue('4단이 전부 채워지면 admissionQuery 객체', fullInput.admissionQuery != null);
check(
  'q15 가 3단까지만 채워지면 admissionQuery = null',
  normalizeAnswers({ q15: { university: '위닝대학교', department: '경영학과', admissionType: '학생부교과' } })
    .admissionQuery,
  null
);
check('미지 라벨은 null', normalizeAnswers({ q1: '존재하지 않는 선택지' }).profile.gradeLevel, null);
check('입력이 없어도 죽지 않는다', normalizeAnswers(undefined).gradeSystem, null);

// Q-01 확정(2026-08-11) — 이름은 폼 문항이 아니라 SurveyStepShell 제출 시점에 meta.name 으로
// 주입된다(로그인 세션의 profiles.name). 비로그인·조회 실패는 meta.name 이 없어 익명 폴백을 탄다.
check('meta.name 이 있으면 profile.name 에 그대로 담긴다', normalizeAnswers({}, { name: '김주원' }).profile.name, '김주원');
check('meta.name 이 없으면 profile.name = null(익명 폴백)', normalizeAnswers({}).profile.name, null);
check(
  'name 있으면 traitsHeading = "{name} 학생의 주요 학습 특성"',
  buildReport(normalizeAnswers({}, { name: '김주원' })).traitsHeading,
  '김주원 학생의 주요 학습 특성'
);
check(
  'name 없으면 traitsHeading 이 축약형(TRAITS_HEADING_ANON, 토큰 노출 없음)',
  buildReport(normalizeAnswers({})).traitsHeading,
  '주요 학습 특성'
);
checkTrue(
  'name 없어도 헤드라인은 완결 문장이다([head] 단독 — "{name}" 토큰이 그대로 남지 않는다)',
  buildReport(normalizeAnswers({})).headlineLines.every((line) => !line.includes('{') && !line.includes('undefined'))
);

// §3.4 — 중학생 평균은 '등급' 개념이 없어 모의고사·최근시험 그룹이 화면에서 숨겨진다.
// GradeInputGrid 는 되돌릴 때를 위해 숨긴 칸의 값을 보존하므로, 채점이 그 값을 읽으면
// 체계를 바꾼 것만으로 교과 관리 aux 가 5 → 10 으로 오르는 조용한 오채점이 된다.
const middleAvgInput = normalizeAnswers({
  ...fullRawAnswers,
  q4: labelOf('q4', 'MIDDLE_AVG'),
  q6: { overall_avg: '88.5', recent_exam_avg: '3.00', mock_korean: '1', mock_math: '2' }
});
check('MIDDLE_AVG 는 모의고사 칸을 읽지 않는다', middleAvgInput.scores.mockFilledCount, 0);
check('MIDDLE_AVG 는 최근시험 칸을 읽지 않는다', middleAvgInput.scores.recentExamAvg, null);
check('MIDDLE_AVG 라도 전체 평균은 읽는다', middleAvgInput.scores.naesinOverall, 88.5);

// §3.4 B-08 — 그룹 단위 isAnswered 는 모의고사 1칸만 채워도 통과시킨다. 그 경로로 진행하면
// naesinOverall 이 null 인 채 리포트에 도달해 gpa '미입력' + 입결 표 0행이 된다.
// 진행 판정은 반드시 requiredFields 를 보는 isQuestionAnswered 를 써야 한다.
const q6 = questionById.get('q6');
check('q6 는 전체 평균을 칸 단위 필수로 선언한다', q6?.requiredFields, ['overall_avg']);
checkTrue(
  '모의고사 1칸만 채우면 미응답으로 친다(B-08)',
  !isQuestionAnswered(q6, { mock_korean: '1' })
);
checkTrue('전체 평균이 채워지면 응답으로 친다', isQuestionAnswered(q6, { overall_avg: '3.24' }));
checkTrue(
  '스텝 2 는 전체 평균 없이 완료되지 않는다',
  !isStepComplete(2, { q6: { mock_korean: '1' }, q8: labelOf('q8', 'FLAT') })
);
// 하위 술어(isAnswered)는 문항 메타를 못 본다 — 이 차이가 곧 B-08 구멍이므로 명시적으로 못박는다.
checkTrue(
  'isAnswered 단독으로는 이 구멍이 막히지 않는다',
  isAnswered('grade-grid', { mock_korean: '1' })
);

// Q-10 확정(2026-08-11) — 리커트 12문장 완주 게이트. 산식(scalePartOf)은 분모 1을 허용하지만
// 진행 판정(isQuestionAnswered)은 12문장 전부를 요구한다 — 1클릭 만점 리포트를 UI 단에서 막는다.
const q9 = questionById.get('q9');
checkTrue('리커트는 isAnswered 하나만으로는 통과하지 않게 requiredFields 대신 문장 수를 본다', q9?.type === 'likert');
checkTrue(
  '리커트 11/12문장만 응답 → 미완료(1문장만 응답으로 만점 리포트가 나가는 경로 차단)',
  !isQuestionAnswered(q9, Object.fromEntries(LIKERT1_KEYS.slice(0, 11).map((key) => [key, 0])))
);
checkTrue(
  '리커트 12/12문장 전부 응답 → 완료',
  isQuestionAnswered(q9, Object.fromEntries(LIKERT1_KEYS.map((key) => [key, 0])))
);
checkTrue('리커트 1문장만 응답 → 미완료(분모 1 산식과 UI 게이트는 별개)', !isQuestionAnswered(q9, { LK1_05: 0 }));

/* ================================================================== *
 * S2. §8 CASE-09 — ROUND_HALF_UP (B-01 회귀)
 * ================================================================== */

beginSection('[CASE-09]');

// rev.1 은 `Math.round(x * 100 + Number.EPSILON) / 100` 이었다. EPSILON 은 절대값이라
// 크기 1 이상 피연산자에서 흡수돼 no-op 이 되고, 4.475 * 100 === 447.49999999999994 →
// 4.47 이 나왔다. 이 표가 그 버그의 회귀 방지선이다.
check('roundHalfUp(4.475, 2) = 4.48', roundHalfUp(4.475, 2), 4.48);
check('roundHalfUp(1.005, 2) = 1.01', roundHalfUp(1.005, 2), 1.01);
check('roundHalfUp(0.145, 2) = 0.15', roundHalfUp(0.145, 2), 0.15);
check('roundHalfUp(8.165, 2) = 8.17', roundHalfUp(8.165, 2), 8.17);
// 이 한 줄이 틀리면 HS5 룩업이 1행 밀린다 — 등급 변환 전체가 조용히 어긋난다.
check('roundHalfUp(1.135 * 100, 0) = 114', roundHalfUp(1.135 * 100, 0), 114);
check('roundHalfUp(41.25, 0) = 41', roundHalfUp(41.25, 0), 41);
check('roundHalfUp(56.3333, 1) = 56.3', roundHalfUp(56.3333, 1), 56.3);
check('roundHalfUp(null) = null', roundHalfUp(null, 2), null);

/* ================================================================== *
 * S3. §8 CASE-06 — 등급 변환 앵커
 * ================================================================== */

beginSection('[CASE-06]');

[
  ['FIVE', 1.0, 1.55],
  ['FIVE', 2.0, 3.24], // 05_예시의 '내 내신 3.24'와 같은 값이어야 한다
  ['FIVE', 3.0, 4.78],
  ['FIVE', 4.0, 6.31],
  ['FIVE', 4.83, 7.51], // 변곡점 직전
  ['FIVE', 4.84, 7.57], // 변곡점
  ['FIVE', 5.0, 8.89],
  ['MIDDLE_AVG', 100.0, 2.33],
  ['MIDDLE_AVG', 96.0, 3.0],
  ['MIDDLE_AVG', 90.0, 4.0],
  ['MIDDLE_AVG', 77.2, 5.0],
  ['MIDDLE_AVG', 64.4, 6.0],
  ['MIDDLE_AVG', 51.6, 7.0],
  ['MIDDLE_AVG', 38.7, 8.0],
  ['MIDDLE_AVG', 26.0, 9.0],
  ['NINE', 3.24, 3.24] // 무변환
].forEach(([system, raw, expected]) => {
  check(`convertToNineScale('${system}', ${raw})`, convertToNineScale(system, raw), expected);
});

check("convertToNineScale('UNKNOWN', 3.24) = null", convertToNineScale('UNKNOWN', 3.24), null);
check("convertToNineScale('FIVE', null) = null", convertToNineScale('FIVE', null), null);
// 정의역 밖은 clamp 다(Q-08 잠정). 값을 창작하지 않고 표 양 끝으로 접는다.
check("convertToNineScale('FIVE', 0.5) = 1.55(하한 clamp)", convertToNineScale('FIVE', 0.5), 1.55);
check("convertToNineScale('MIDDLE_AVG', 10) = 9.00(하한 clamp)", convertToNineScale('MIDDLE_AVG', 10), 9.0);

/* ================================================================== *
 * S4. §8 CASE-01 — 계획 설계 단일 영역 (배점표 05_예시)
 * ================================================================== */

beginSection('[CASE-01]');

const ex01 = caseById.get('EX-01');
const case01Input = makeInput({
  likert1: ex01.input.likert1,
  obstacles: ex01.input.obstacles
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
  roundHalfUp(ex01.expected.scalePart + 30, 0)
);
check('감점 −15 가 걸린 nonScalePart = 15', case01ScaleOnly.PLAN - case01Areas.PLAN, 15);
check('계획 설계 areaScore = 41', case01Areas.PLAN, ex01.expected.areaScore.PLAN);
// B-02 의 근거. 정수 base 위에서는 두 반올림 순서가 같은 값을 내므로 areaScore 경로에서는
// 차이가 드러나지 않는다 — 실제 회귀 방지선은 CASE-09 의 roundHalfUp 표다.
check(
  '중간값 사전 반올림과 사후 반올림이 같은 값을 낸다(B-02 근거)',
  [roundHalfUp(roundHalfUp(26.25, 1) + 15, 0), roundHalfUp(26.25 + 15, 0)],
  [41, 41]
);
checkTrue('12영역 전부 유한수', AREA_CODES.every((area) => Number.isFinite(case01Areas[area])));
checkTrue(
  '12영역 전부 0~100 정수',
  AREA_CODES.every((area) => Number.isInteger(case01Areas[area]) && case01Areas[area] >= 0 && case01Areas[area] <= 100)
);

/* ================================================================== *
 * S5. §8 CASE-02 — 종합·등급·시급 영역·목표 부족분·뱃지
 * ================================================================== */

beginSection('[CASE-02]');

const ex02 = caseById.get('EX-02');
const case02Areas = ex02.input.areaScores;

check('page1 종합 = 56.3 (338/6)', overallScore(case02Areas, 1), ex02.expected.page1Overall);
check('등급 = L4', levelOf(overallScore(case02Areas, 1)), ex02.expected.level);

const gap02 = targetGap(case02Areas);
check('가장 시급한 영역 = 실행 지속', gap02.lowestCode, ex02.expected.lowestArea);
check('시급 영역 점수 = 39', gap02.lowestScore, ex02.expected.lowestScore);
check(`목표까지 = ${TARGET_SCORE} − 39 = 36`, gap02.gap, ex02.expected.gap);
check('gap > 0 이므로 reached = false', gap02.reached, false);

const badges02 = priorityBadges(case02Areas);
check('뱃지 개수 = BADGES 개수 = 6 (§7.4.3)', badges02.length, BADGES.length);
check(
  '뱃지 배정',
  Object.fromEntries(badges02.map((row) => [row.code, row.badge])),
  ex02.expected.badges
);
check(
  '뱃지 정렬은 점수 오름차순',
  badges02.map((row) => row.score),
  [39, 41, 56, 60, 65, 77]
);
check('뱃지 영역명은 AREA_LABEL 이 정본', badges02[0].name, AREA_LABEL.EXEC);

/* ================================================================== *
 * S6. §8 CASE-03 — 긴급도 (Q-12 해소 — ALL_12 정본)
 * ================================================================== */

beginSection('[CASE-03]');

const ex03 = caseById.get('EX-03');
// PAGE1 은 05_예시 값 그대로(40 미만 1개), PAGE2 는 원문에 없어 40 미만 2개를 합성한다.
// URGENCY_SCOPE='ALL_12' 가 정본이라 3개가 되어 예시의 50점이 재현된다(Q-12 해소, 사용자 확정).
const case03Areas = makeAreaScores(60, { ...case02Areas, RECORD: 20, STRATEGY: 30 });
const urgency03 = urgencyOf(makeInput({ schedule: ex03.input.schedule }), case03Areas);

check('urgencyScore = 20 + 3×10 = 50', urgency03.score, ex03.expected.urgencyScore);
check('urgencyLevel = L4', urgency03.level, ex03.expected.urgencyLevel);
check('40 미만 영역 수 = 3', urgency03.lowAreaCount, ex03.input.lowAreaCount);

// 집계 범위 자체는 가정이 아니라 상수다 — PAGE1 로 뒤집히면 여기서 먼저 드러난다.
check("URGENCY_SCOPE = 'ALL_12' (A2)", URGENCY_SCOPE, 'ALL_12');
// 임계 40 은 다른 경계(45/60/70/80)와 어긋나지만 배점표 원문이다. A1 을 뒤집어도 따라가면 안 된다.
check('URGENCY_AREA_THRESHOLD = 40 (AREA_BAND_THRESHOLDS 와 분리)', URGENCY_AREA_THRESHOLD, 40);
checkTrue(
  '경계 정확히 40 인 영역은 카운트 제외(< 비교)',
  urgencyOf(makeInput(), makeAreaScores(40)).lowAreaCount === 0
);
checkTrue('39 인 영역은 12개 전부 카운트', urgencyOf(makeInput(), makeAreaScores(39)).lowAreaCount === 12);

/* ================================================================== *
 * S7. §8 CASE-04 / 04b — 합격 구간
 * ================================================================== */

beginSection('[CASE-04]');

const ex05 = caseById.get('EX-05');
const cuts04 = ex05.input.cuts;

check('3.24 vs 70%컷 2.56 → RISK (2.86 초과)', admissionBand(ex05.input.mine, cuts04), ex05.expected.band);
check(
  '비교표 행 = cut70 · mine 2행',
  admissionRows(ex05.input.mine, cuts04).map(({ key, value, diff }) => ({ key, value, diff })),
  ex05.expected.rows
);
check('내 성적 행은 emphasis = true', admissionRows(ex05.input.mine, cuts04).at(-1).emphasis, true);
// 0.6799999999999997 이 그대로 새면 화면에 '0.68등급 부족'이 아니라 소수 16자리가 찍힌다.
check('diff 는 소수 2자리로 접힌다', admissionRows(3.24, cuts04)[0].diff, 0.68);

check('cut50·cut70 둘 다 있고 mine <= cut50 → STABLE', admissionBand(2.0, { cut50: 2.5, cut70: 3.0 }), 'STABLE');
check('cut50 < mine <= cut70 → FIT', admissionBand(2.8, { cut50: 2.5, cut70: 3.0 }), 'FIT');
check('cut70 < mine <= cut70+0.30 → REACH', admissionBand(3.3, { cut50: 2.5, cut70: 3.0 }), 'REACH');
check('cut70만 있고 mine <= cut70−0.30 → STABLE(대칭)', admissionBand(2.2, { cut50: null, cut70: 2.56 }), 'STABLE');
check('둘 다 없음 → null (BAND_NODATA)', admissionBand(3.24, { cut50: null, cut70: null }), null);
check('mine 미입력 → null', admissionBand(null, { cut50: 2.5, cut70: 3.0 }), null);
check('행 배열은 값이 없으면 빈 배열(§7.4.3)', admissionRows(null, {}), []);

// CASE-04b — Q-28 확정(2026-08-11). rev.1 은 `3.24 <= null` 이 false 로 평가돼 안정권 학생을
// 무조건 RISK 로 찍었다. 지금은 결측 대체 항등식(c50=cut70−0.30, c70=cut50+0.30)으로 정상 산출된다.
const ex04b = { mine: 2.1, cuts: { cut50: 2.5, cut70: null } };
check('cut50 단독 → STABLE (대칭 규칙, A4 폴백 대신 정상 산출)', admissionBand(ex04b.mine, ex04b.cuts), 'STABLE');
checkTrue(
  'cut50 단독이 RISK 로 떨어지지 않는다(rev.1 버그 회귀)',
  admissionBand(ex04b.mine, ex04b.cuts) !== 'RISK'
);

// 4조합(둘 다 있음 / 50만 / 70만 / 둘 다 없음) 전부를 덮는다. cut50 단독(2.5)·cut70 단독(2.8)은
// 결측 대체 항등식으로 동일한 4단 경계(c50=2.5 / c70=2.8 / c70+0.30=3.1)를 내므로, `<=` 귀속
// 규칙(609행 주석)을 확인할 경계 위/아래 쌍(2.5/2.6, 2.8/2.9, 3.1/3.2)을 헬퍼 하나로 두 조합에
// 재사용한다. cut70=2.8 은 2.8+0.3 이 JS 부동소수점으로 3.0999999999999996 이 되는 바로 그
// 조합이다 — admissionBand 가 항등식 계산 직후 roundHalfUp(...,2) 로 정규화하므로(diagnosisScoring.js)
// 경계값 3.1 이 정확히 성립한다. 이 정규화가 실제로 동작하는지가 이 블록의 검증 대상이다.
function checkAdmissionBandBoundaries(label, cuts) {
  check(`${label} mine=2.5(=c50) → STABLE`, admissionBand(2.5, cuts), 'STABLE');
  check(`${label} mine=2.6(c50<mine<=c70) → FIT`, admissionBand(2.6, cuts), 'FIT');
  check(`${label} mine=2.8(=c70) → FIT`, admissionBand(2.8, cuts), 'FIT');
  check(`${label} mine=2.9(c70<mine<=c70+0.30) → REACH`, admissionBand(2.9, cuts), 'REACH');
  check(`${label} mine=3.1(=c70+0.30) → REACH`, admissionBand(3.1, cuts), 'REACH');
  check(`${label} mine=3.2(>c70+0.30) → RISK`, admissionBand(3.2, cuts), 'RISK');
}
checkAdmissionBandBoundaries('cut50 단독(cut50=2.5→c70=2.8)', { cut50: 2.5, cut70: null });
checkAdmissionBandBoundaries('cut70 단독(cut70=2.8→c50=2.5)', { cut50: null, cut70: 2.8 });
check('둘 다 있음(cut50=2.5,cut70=2.8) mine=3.2 → RISK', admissionBand(3.2, { cut50: 2.5, cut70: 2.8 }), 'RISK');

// 확률은 Q-03 미확정이라 상시 null 이다 → probabilityValue 는 밴드 4글자 경로로 떨어진다.
check('BASE_PROBABILITY 미확정(null)', BASE_PROBABILITY, null);
check('successProbability 는 항상 null (A7)', successProbability(makeInput({ csatMin: 'HIGH' }), 'FIT'), null);
checkTrue('PROB_MAX < 100 (06_금지어 "100%" 충돌 방지)', PROB_MAX < 100);

check("admissionMasterKey('GENERAL') = GENERAL", admissionMasterKey('GENERAL'), 'GENERAL');
check("admissionMasterKey('AUTONOMOUS') = SPECIAL_TODO (A6)", admissionMasterKey('AUTONOMOUS'), 'SPECIAL_TODO');
check("admissionMasterKey('SPECIAL') = SPECIAL_TODO", admissionMasterKey('SPECIAL'), 'SPECIAL_TODO');

/* ================================================================== *
 * S8. §8 CASE-05 — 서비스 1순위 (Q-14 해소 — fit 85.3 정본)
 * ================================================================== */

beginSection('[CASE-05]');

const ex04 = caseById.get('EX-04');
// 05_예시는 입력 내역이 없고 "목표관리 73점"이라 적혀 있으나, 03_서비스추천 산식 계산값은
// 85.3 이다 — 05_예시는 문서 오기로 확정됐다(Q-14 해소, 사용자 확정). areaPart 는 예시의
// 4영역으로 고정되고, 어려움 3개 체크(50) + 희망 교집합(20) + 영역 15.3 을 그대로 쓴다.
const case05Input = makeInput({
  obstacles: ['OBS_01', 'OBS_02', 'OBS_03'],
  wishes: ['WISH_02']
});
const case05Areas = makeAreaScores(60, ex04.input.areaScores);
const ranked05 = rankServices(case05Input, case05Areas);
const goalCare = ranked05.all.find((service) => service.code === 'GOAL_CARE') ?? null;

check('1순위 = 위닝 목표관리', ranked05.rank1?.code ?? null, ex04.expected.service);
check('fit = 85.3 (배점표 05_예시는 73점이라 적혀 있으나 산식 계산값은 85.3 — 산식 정본)', goalCare ? roundHalfUp(goalCare.fit, 1) : null, ex04.expected.fit);
check('tier = HIGH (fit 85.3 >= SERVICE_BANDS.HIGH=80)', goalCare?.tier ?? null, ex04.expected.tier);
// 불변식은 산식 확정과 무관하게 항상 지켜야 한다(B-03).
checkTrue('전 서비스 fit <= 100 (A3 불변식)', ranked05.all.every((service) => service.fit <= 100));
check(
  'areaPart = 30 × (1 − mean(41,39,56,60)/100) = 15.3',
  goalCare ? roundHalfUp(goalCare.areaPart, 1) : null,
  15.3
);

// 콜멘토 difficultyPart — Q-36 해소(사용자 확정 2026-08-11)로 자유서술 감지 단어의 +10 가산이
// 점수 계산에서 완전히 빠졌다. OBS_10·11·12 는 항목 3개 = threshold 3개라 3/3 체크가 이미
// 50*3/3=50 이라 가산이 없어도 cap 이 발동할 여지가 없다(정확히 50).
const callMentorFull = rankServices(makeInput({ obstacles: ['OBS_10', 'OBS_11', 'OBS_12'] }), makeAreaScores(50))
  .all.find((s) => s.code === 'CALL_MENTOR');
check('콜멘토 3/3 체크 difficultyPart = 50', callMentorFull?.difficultyPart ?? null, SERVICE_PART_CAPS.difficulty);
checkTrue('콜멘토 fit <= 100', (callMentorFull?.fit ?? 0) <= 100);

// cap 자체는 방어 로직으로 남는다(B-03) — 발동 사례는 threshold < items.length 인 서비스에서
// 본다. GOAL_CARE 는 9개 항목/threshold 3 이라 9/9 체크면 가산 없이도 50*9/3=150 이 나와
// cap 이 없으면 fit 이 100 을 넘긴다.
const overCheckedGoalCare = rankServices(
  makeInput({
    obstacles: ['OBS_01', 'OBS_02', 'OBS_03', 'OBS_04', 'OBS_05', 'OBS_06', 'OBS_07', 'OBS_08', 'OBS_09']
  }),
  makeAreaScores(50)
).all.find((s) => s.code === 'GOAL_CARE');
check(
  'GOAL_CARE 9/9 체크는 cap 50 으로 접힌다(방어 로직 회귀 방지)',
  overCheckedGoalCare?.difficultyPart ?? null,
  SERVICE_PART_CAPS.difficulty
);
checkTrue('GOAL_CARE fit <= 100', (overCheckedGoalCare?.fit ?? 0) <= 100);

// Q-36 해소 — 자유서술 감지 단어(정탐·오탐·부정문 오탐 불문)는 콜멘토 적합도 점수에서 완전히
// 분리됐다. 후보에 남으려면 tier 가 있어야 하므로(fit >= 50) 체크 2개 + 영역 0점으로 구간 안에
// 들여놓고 q19 만 바꿔 가며 difficultyPart 가 흔들리지 않는지 본다.
const callMentorDifficulty = (text) =>
  rankServices(makeInput({ obstacles: ['OBS_10', 'OBS_11'], freeText: text }), makeAreaScores(0))
    .all.find((s) => s.code === 'CALL_MENTOR')?.difficultyPart ?? null;
const keywordFreePart = callMentorDifficulty('오늘 날씨가 좋아요');
checkTrue('픽스처 전제: 감지 단어 없는 콜멘토가 후보에 남는다', keywordFreePart != null);
check("정탐 '요즘 너무 불안해요' 도 점수는 불변(배점 분리, 승격)", callMentorDifficulty('요즘 너무 불안해요'), keywordFreePart);
check("오탐 '서울대 가고 싶어요' 도 점수는 불변(승격)", callMentorDifficulty('서울대 가고 싶어요'), keywordFreePart);
check("오탐 '울산에서 통학해요' 도 점수는 불변(승격)", callMentorDifficulty('울산에서 통학해요'), keywordFreePart);
check("부정문 오탐 '비교하지 않으려 해요' 도 점수는 불변(승격)", callMentorDifficulty('비교하지 않으려 해요'), keywordFreePart);

// 감지 신호(signals.emotional, diagnosisReport 가 조립)는 점수와 분리된 별도 산출이다. 오탐을
// 포함해도 무방하다는 것이 이번 설계 의도다 — 후속 판정자(사람/LLM)가 '참고 후보'로 읽는다.
checkTrue("신호: 정탐 '요즘 너무 불안해요' → hit=true", detectEmotionalSignal('요즘 너무 불안해요').hit);
check(
  "신호: '요즘 너무 불안해요' → matchedKeywords 에 '불안' 포함",
  detectEmotionalSignal('요즘 너무 불안해요').matchedKeywords.includes('불안'),
  true
);
checkTrue("신호: 오탐 '서울대 가고 싶어요' 도 hit=true('울' 매칭 — 오탐 특성 그대로)", detectEmotionalSignal('서울대 가고 싶어요').hit);
check(
  '신호: 감지 단어 없으면 hit=false · matchedKeywords=[]',
  detectEmotionalSignal('오늘 날씨가 좋아요'),
  { hit: false, matchedKeywords: [] }
);
check('신호: freeText 빈 문자열도 hit=false', detectEmotionalSignal(''), { hit: false, matchedKeywords: [] });

// 전 서비스 fit < 50 → 카드 0장(SVC_NONE 경로). 만점 영역 + 무체크 + 무희망이면 fit 은 전부 0 이다.
const noneRanked = rankServices(makeInput(), makeAreaScores(100));
check('전 서비스 tier=null 이면 all = []', noneRanked.all, []);
check('rank1 = null', noneRanked.rank1, null);
check('rank2 = null', noneRanked.rank2, null);

// 학년 필터 — M3·N수생은 2종만 후보다(배점표 1번).
const m3Ranked = rankServices(
  makeInput({ profile: { name: null, gradeLevel: 'M3', schoolType: null }, obstacles: ['OBS_01', 'OBS_02', 'OBS_03'], difficulties: ['DIF_10'] }),
  makeAreaScores(20)
);
checkTrue(
  'M3 후보는 목표관리·콜멘토 2종뿐',
  m3Ranked.all.every((service) => ['GOAL_CARE', 'CALL_MENTOR'].includes(service.code))
);
checkTrue('M3 에서 자기평가서(DIF_10 체크)는 후보에서 빠진다', !m3Ranked.all.some((s) => s.code === 'SELF_REVIEW'));

/* ================================================================== *
 * S9. §8 CASE-07 — 경계값 회귀 (Q-32 해소 — 45/60/70 정본)
 * ================================================================== */

beginSection('[CASE-07]');

// levelOf 는 배점표 원문 80/70/60/45 그대로다(Q-11 은 포함 방향만 다퉜고 명세가
// '>= 상단 포함'으로 확정 요청했다). stateOf·toneOf 도 배점표 02_영역_구성이 "영역 상태 …
// (70·60·45 기준)"으로 직접 명시해 45/60/70 이 정본으로 확정됐다(Q-32 해소, 사용자 확정
// 2026-08-11) — 승인된 디자인 샘플이 함의하던 40/50/70 은 폐기됐다.

[
  [80.0, 'L1', 'TOP', 'blue'],
  [79.9, 'L2', 'TOP', 'blue'],
  [70.0, 'L2', 'TOP', 'blue'],
  [69.9, 'L3', 'MID', 'blue'],
  [60.0, 'L3', 'MID', 'blue'],
  [59.9, 'L4', 'LOW', 'amber'],
  [45.0, 'L4', 'LOW', 'amber'],
  [44.9, 'L5', 'WEAK', 'red']
].forEach(([score, level, state, tone]) => {
  check(`levelOf(${score})`, levelOf(score), level);
  check(`stateOf(${score})`, stateOf(score), state);
  check(`toneOf(${score})`, toneOf(score), tone);
});

check('SCORE_BANDS = 80/70/60/45', SCORE_BANDS, { L1: 80, L2: 70, L3: 60, L4: 45 });
check('AREA_BAND_THRESHOLDS = 70/60/45 (A1 정본, Q-32 해소)', AREA_BAND_THRESHOLDS, { TOP: 70, MID: 60, LOW: 45 });
// tone 을 stateOf 에서 파생시키지 않고 별도 임계를 두면 Q-32 확정 시 라벨과 색이 어긋난다.
checkTrue(
  'toneOf 는 stateOf 에서 파생된다(임계 이중화 금지)',
  [0, 44.9, 45, 59.9, 60, 69.9, 70, 100].every((score) => toneOf(score) === STATE_TONE[stateOf(score)])
);

/* ================================================================== *
 * S10. §8 CASE-08 — 결측·배타·NaN 미발생
 * ================================================================== */

beginSection('[CASE-08]');

// 배타 선택지는 "체크하지 않은 것과 같은 결과"여야 한다. 감점 0 을 개별 영역마다 세는 대신
// 결과 전체를 미체크 결과와 대조한다 — 영역 하나라도 새면 바로 드러난다.
const baseAreas = scoreAreas(makeInput());
check('OBS_13 단독 체크 = 미체크와 동일', scoreAreas(makeInput({ obstacles: ['OBS_13'] })), baseAreas);
check('DIF_14 단독 체크 = 미체크와 동일', scoreAreas(makeInput({ difficulties: ['DIF_14'] })), baseAreas);

// 모의고사 칸수 → 교과 관리 aux. SUBJECT base 20 이라 areaScore = 20 + aux 다(척도 결측).
const subjectWithMock = (filledCount) =>
  scoreAreas(
    makeInput({ scores: { naesinOverall: null, recentExamAvg: null, mock: {}, mockFilledCount: filledCount } })
  ).SUBJECT;

// Q-09 확정(2026-08-11) — 6키 룩업 7칸 전량을 단언 1블록으로 덮는다. roundHalfUp 은
// scoreAreas 의 정수화(§4.2.2)를 재현한다(20 이 정수라 반올림이 aux 쪽으로만 걸린다).
[0, 1, 2, 3, 4, 5, 6].forEach((count) => {
  check(`모의고사 ${count}칸 → aux ${MOCK_FILL_POINTS[count]}`, subjectWithMock(count) - 20, roundHalfUp(MOCK_FILL_POINTS[count]));
  checkTrue(`모의고사 ${count}칸에서 NaN 미발생`, Number.isFinite(subjectWithMock(count)));
});
// 3칸(aux 7.5→28)과 4칸(aux 8→28)은 정수 반올림 후 SUBJECT 화면 점수가 같다 — 앵커 간격이
// 2칸→4칸 사이 +1점뿐인 구조적 결과이지 버그가 아니다(diagnosisScoringTable.js MOCK_FILL_POINTS 주석).
check('모의고사 3칸과 4칸은 SUBJECT 화면 점수가 같다(정수 반올림 동점, 기대 동작)', subjectWithMock(3), subjectWithMock(4));

// q3 '아직 구체적인 목표가 없어요' → 이유 문항 미노출 → goal.reason 상시 null.
// GOAL_REASON_POINTS[null] 폴백이 없으면 aux = 0 + undefined = NaN 이 되어 리포트 전체가 무너진다.
const goalNone = scoreAreas(makeInput({ goal: { level: 'NONE', reason: null, targetUniversity: null, targetMajor: null } }));
check('goal.level=NONE · reason=null → GOAL aux = 0', goalNone.GOAL, 0);
checkTrue('goal.reason=null 에서 NaN 미발생', Number.isFinite(goalNone.GOAL));
check(
  'goal 실질 만점 = 90 (척도 70 + level 20)',
  scoreAreas(
    makeInput({
      goal: { level: 'BOTH', reason: null, targetUniversity: null, targetMajor: null },
      likert1: Object.fromEntries(LIKERT1_KEYS.map((key) => [key, 100]))
    })
  ).GOAL,
  90
);

// Q-10 확정(2026-08-11) — 분모 = 응답한 문장 수(산식 0줄 변경, 문구집 SKIP_NOTE 원문 그대로).
// 완주 게이트는 UI 진행 판정(isQuestionAnswered)에만 걸리고 엔진 산식은 분모 1을 그대로 허용한다.
// 리커트 2문장 모두 결측 → scalePart 0. EXEC base 20 + TREND(미응답 0) = 20.
check('q9 문장5·6 둘 다 미응답 → EXEC scalePart = 0', scoreAreas(makeInput()).EXEC, 20);
// 1문장만 응답하면 분모 1 이다(§4.2 결측 · Q-10 확정 — UI 게이트는 별도).
check('리커트 1문장만 응답 → 분모 1', scoreAreas(makeInput({ likert1: { LK1_05: 100 } })).EXEC, 90);

// Q-29 확정(2026-08-11) — gap <= 0 이면 card_urgent 대신 card_goal_met 전용 키(제목+부제 동시
// 교체)로 렌더된다. '목표까지 0점 부족'이 렌더되면 안 되는 경로다. 엔진은 reached 로 신호만 준다.
const reachedGap = targetGap(makeAreaScores(80));
checkTrue('PAGE1 최저 >= 75 → reached = true', reachedGap.reached === true);
check('gap 은 clamp 하지 않는다(부호를 호출부에 그대로 넘긴다)', reachedGap.gap, TARGET_SCORE - 80);
check('신규 키 card_goal_met.title', TEMPLATE_COPY['card_goal_met.title'], '가장 낮은 영역');
check('신규 키 card_goal_met.sub', TEMPLATE_COPY['card_goal_met.sub'], '모든 영역이 목표 점수에 도달했습니다');
check('COPY_FALLBACK 은 VALUE_MISSING 하나만 남는다(URGENT_GOAL_REACHED 삭제)', Object.keys(COPY_FALLBACK), ['VALUE_MISSING']);

// 미응답 투성이 입력에서도 12영역이 전부 유한 정수여야 한다 — NaN 은 종합·뱃지·gap 까지 전파된다.
const emptyAreas = scoreAreas(makeInput());
checkTrue('빈 입력에서 12영역 전부 유한 정수', AREA_CODES.every((area) => Number.isInteger(emptyAreas[area])));
checkTrue('빈 입력에서 종합 점수도 유한수', Number.isFinite(overallScore(emptyAreas, 1)) && Number.isFinite(overallScore(emptyAreas, 2)));
check('입력이 아예 없어도(undefined) 죽지 않는다', Number.isFinite(scoreAreas(undefined).GOAL), true);
check('미지 라벨 코드는 조용히 버린다', scoreAreas(makeInput({ obstacles: ['OBS_99'] })), baseAreas);

// Q-05 확정(2026-08-11) — 최저 영역 룩업 기반 4종 + ① 가드. 나머지 4종
// (학습체계 안정형 · 균형 점검형 · 계획 과잉·실행 취약형 · 목표–실행 불균형형)은 판정 기준이
// 배점표·문구집 어디에도 없어 창작하지 않는다 — ⑥ 그 외 경로로 현행 null 폴백을 유지한다.
const allSameLikert24 = {
  likert1: Object.fromEntries(LIKERT1_KEYS.map((key) => [key, 3])),
  likert2: Object.fromEntries(LIKERT2_KEYS.map((key) => [key, 3]))
};
const variedLikert24 = {
  likert1: Object.fromEntries(LIKERT1_KEYS.map((key, i) => [key, i % 5])),
  likert2: Object.fromEntries(LIKERT2_KEYS.map((key, i) => [key, (i + 1) % 5]))
};

// ① 리커트 24문장이 전부 동일하면, 그 외에는 ③(GOAL 최저)이 성립하는 areaScores 라도 null 이다.
check(
  '① 리커트 24문장 응답값이 전부 동일 → null (③ 보다 우선)',
  classifyStudentType(makeInput(allSameLikert24), makeAreaScores(60, { GOAL: 30, STABILITY: 60 })),
  null
);
// 빈 입력(likert 미응답)은 '전부 동일'로 보지 않는다 — answered.length 0 은 가드 대상이 아니다.
// 그 결과 이 픽스처는 STABILITY 30(<45) 이라 ②(부담 누적형)로 정상 판정된다.
check('② STABILITY < 45 → 학습 부담 누적형 (빈 입력, 가드 미발동)', classifyStudentType(makeInput(), baseAreas), 'BURDEN_ACCUM');
// ②는 ③보다 먼저 검사한다(판단) — GOAL 도 낮지만 STABILITY < 45 가 이긴다.
check(
  '② STABILITY < 45 → 학습 부담 누적형 (③과 동시 성립해도 ②가 우선)',
  classifyStudentType(makeInput(variedLikert24), makeAreaScores(60, { STABILITY: 40, GOAL: 35 })),
  'BURDEN_ACCUM'
);
check(
  '③ 최저 영역 = 목표 설정 → 방향 탐색형',
  classifyStudentType(makeInput(variedLikert24), makeAreaScores(60, { STABILITY: 60, GOAL: 30 })),
  'DIRECTION_SEEK'
);
check(
  '④ 최저 영역 = 시간 관리 → 시간관리 취약형',
  classifyStudentType(makeInput(variedLikert24), makeAreaScores(60, { STABILITY: 60, TIME: 30 })),
  'TIME_WEAK'
);
check(
  '⑤ 최저 영역 = 학습 피드백 → 학습방법 점검형',
  classifyStudentType(makeInput(variedLikert24), makeAreaScores(60, { STABILITY: 60, FEEDBACK: 30 })),
  'METHOD_REVIEW'
);
// ⑥ 최저 영역이 PLAN·EXEC·STABILITY 중 하나면 판정하지 않는다(창작 상수 0개, 현행 null 폴백).
check(
  '⑥ 최저 영역 = 계획 설계 → null (판정 기준 없음, 현행 폴백)',
  classifyStudentType(makeInput(variedLikert24), makeAreaScores(60, { STABILITY: 60, PLAN: 30 })),
  null
);

/* ================================================================== *
 * S11. §8 CASE-10 — 문구 개수 검산
 * ================================================================== */

beginSection('[CASE-10]');

const typeCount = TYPE_CODES.reduce((sum, code) => {
  const copy = TYPE_COPY[code];
  return sum + (copy ? 2 + (copy.todos?.length ?? 0) : 0);
}, 0);
check('TYPE_COPY = 8유형 × 5 = 40', typeCount, 40);
check('TYPE_CODES 8종', TYPE_CODES.length, 8);

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
check('AREA_COPY = 12영역 × 13 = 156', areaCopyCount, 156);

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
check('NARRATIVE_COPY = P1 6영역 × 4상태 × 2 = 48', narrativeCount, 48);
// PAGE2 6영역은 03 시트에 없다. 만들어 넣으면 원본에 없는 문구를 창작한 것이다.
checkTrue('PAGE2 6영역은 진단 서술이 없다', PAGE2_AREAS.every((area) => NARRATIVE_COPY[area] === undefined));

const serviceCopyCount = SERVICE_CODES.reduce((sum, code) => {
  const copy = SERVICE_COPY[code];
  if (!copy) return sum;
  return sum + Object.keys(copy.tiers ?? {}).length + (copy.tags?.length ?? 0);
}, 0);
check('SERVICE_COPY = 6×3강도 + 6×4태그 = 42', serviceCopyCount, 42);

const sheet05Count =
  Object.keys(ADMISSION_BAND_COPY).length +
  Object.keys(PAGE_GRADE_COPY.page1).length +
  Object.keys(PAGE_GRADE_COPY.page2).length +
  Object.keys(URGENCY_COPY).length +
  Object.keys(COMMON_COPY).length +
  Object.keys(TEMPLATE_COPY).length;
// Q-29 확정(2026-08-11)으로 TEMPLATE_COPY 가 18 → 20 (card_goal_met.title/sub 신설).
check('05_구간_공통 = 4 + 10 + 4 + 19 + 20 = 57', sheet05Count, 57);
check('01~05 합계 = 343', typeCount + areaCopyCount + narrativeCount + serviceCopyCount + sheet05Count, 343);

const bannedCount = BANNED_PHRASES.reduce((sum, group) => sum + group.phrases.length, 0);
check('BANNED_PHRASES = 6유형', BANNED_PHRASES.length, 6);
check('금지표현 = 22', bannedCount, 22);

// 식별자(문구 아님) 개수 — 341 검산에 섞이면 안 되는 것들의 형태를 함께 못박는다.
check('NARRATIVE_STATE_LABEL 4상태', Object.keys(NARRATIVE_STATE_LABEL).length, 4);
check("NARRATIVE_STATE_LABEL.LOW = '보완' (화면 라벨 '보완 필요' 아님)", NARRATIVE_STATE_LABEL.LOW, '보완');
check('SERVICE_TIER_LABEL 3강도', Object.keys(SERVICE_TIER_LABEL).length, 3);
check('ADMISSION_BAND_LABEL 4구간', Object.keys(ADMISSION_BAND_LABEL).length, 4);

/* ================================================================== *
 * S12. §5.2 토큰 스코프 · §5.3 ① 정적 금지어 스캔
 * ================================================================== */

beginSection('[§5.2/5.3]');

// 토큰이 있는 문구 키는 반드시 TOKEN_SCOPE 에 등재돼야 한다. 빠지면 fill 이 전부 원문으로
// 남겨 화면에 '{gap}' 리터럴이 노출된다.
const tokenPattern = /\{(\w+|영역)\}/g;
const tokenBearing = Object.entries({ ...TEMPLATE_COPY, ...COMMON_COPY }).filter(([, text]) =>
  typeof text === 'string' && text.match(tokenPattern)
);
tokenBearing.forEach(([key, text]) => {
  const tokens = [...text.matchAll(tokenPattern)].map((match) => match[1]);
  const scope = TOKEN_SCOPE[key] ?? [];
  checkTrue(`TOKEN_SCOPE['${key}'] 가 토큰 전량을 덮는다`, tokens.every((token) => scope.includes(token)));
});
check('스코프 밖 토큰은 치환하지 않는다', fill('{name} 학생, {head}', { name: '홍길동', head: 'x', gap: 9 }, 'section_traits'), '홍길동 학생, {head}');
check('값이 없으면 원문을 남긴다', fill('목표까지 {gap}점 부족', {}, 'card_urgent.sub'), '목표까지 {gap}점 부족');
check('미등재 키는 전부 원문', fill('{v}등급 부족', { v: 0.68 }, 'diff_short'), '0.68등급 부족');

// 검사 대상은 '화면에 노출되는 모든 문자열'이다(§5.3 ①). BANNED_PHRASES 자신은 금지어 목록이라
// 스캔 대상에서 뺀다 — 넣으면 22건이 자기 자신에 걸려 항상 붉어진다.
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
  LEVEL_LABEL
};
const bannedHits = findBannedPhrases(scanTargets);
check('정적 금지어 위반 0건', bannedHits.map((hit) => `${hit.phrase} @ ${hit.text.slice(0, 24)}`), []);

// '취약'(STATE_LABEL.page1.WEAK)은 22표현에 문자 그대로 없어 통과하지만 06 의 '진단·낙인' 유형과
// 경계에 있다(Q-27). 통과시키되 사라지지 않게 경고로 남긴다.
if (STATE_LABEL.page1.WEAK === '취약') {
  warn(`STATE_LABEL.page1.WEAK = '취약' — 06_금지어 '진단·낙인' 유형과 경계선(Q-27 확정 필요)`);
}

/* ================================================================== *
 * S13. §7.4.3 리포트 불변식
 * ================================================================== */

beginSection('[§7.4.3]');

check('AREA_CODES 12영역', AREA_CODES.length, 12);
check('PAGE1 6영역 (레이더 축 순서)', PAGE1_AREAS.length, 6);
check('PAGE2 6영역', PAGE2_AREAS.length, 6);
check('BADGES 6종', BADGES.length, 6);
check('LEVEL_LABEL 5단계', Object.keys(LEVEL_LABEL).length, 5);
check('STATE_LABEL 은 페이지별 4상태', [Object.keys(STATE_LABEL.page1).length, Object.keys(STATE_LABEL.page2).length], [4, 4]);
checkTrue('12영역 라벨이 전부 유일', new Set(Object.values(AREA_LABEL)).size === 12);
checkTrue('6서비스 라벨이 전부 유일', new Set(Object.values(SERVICE_LABEL)).size === 6);

// buildReport 는 파일 상단에서 정적 import 한다. 예전의 try/catch + 동적 import 는 "T16 이 아직
// 없을 수 있다"는 전제였는데, 그 catch 가 문법 오류·잘못된 import 경로까지 삼켜 §7.4.3 불변식을
// 통째로 건너뛴 채 PASS 를 냈다. 모듈이 깨지면 스크립트가 즉시 죽는 편이 낫다.
const report = buildReport(makeInput({ likert1: { LK1_01: 75, LK1_03: 50 }, obstacles: ['OBS_02'] }));
check('learningAxes 정확히 6', report?.learningAxes?.length ?? null, 6);
check('readiness.areas 정확히 6', report?.readiness?.areas?.length ?? null, 6);
check('summaryCards 정확히 3', report?.summaryCards?.length ?? null, 3);
check('traits 정확히 3', report?.traits?.length ?? null, 3);
checkTrue('summaryCards label 이 유일(React key)', new Set(report.summaryCards.map((c) => c.label)).size === 3);

// Q-29 확정(2026-08-11) — PAGE1 6영역 전부 목표(75점) 이상이면 card_urgent 대신 card_goal_met
// 전용 키로 3번째 요약 카드의 제목·부제가 함께 바뀐다(자기모순 문장 방지). raw input 으로
// buildReport 를 통과시켜 diagnosisReport.js 조립 분기까지 실제로 맞는지 본다.
const goalMetReport = buildReport(
  makeInput({
    goal: { level: 'BOTH', reason: null, targetUniversity: null, targetMajor: null },
    likert1: Object.fromEntries(LIKERT1_KEYS.map((key) => [key, 100])),
    likert2: Object.fromEntries(LIKERT2_KEYS.map((key) => [key, 100]))
  })
);
check('전 영역 목표 달성 → 3번째 요약 카드 제목 = card_goal_met.title', goalMetReport.summaryCards[2]?.label, TEMPLATE_COPY['card_goal_met.title']);
check('전 영역 목표 달성 → 3번째 요약 카드 부제 = card_goal_met.sub', goalMetReport.summaryCards[2]?.sub, TEMPLATE_COPY['card_goal_met.sub']);
checkTrue('goalMetReport summaryCards label 도 유일(React key)', new Set(goalMetReport.summaryCards.map((c) => c.label)).size === 3);
checkTrue('traits title 이 유일(React key)', new Set(report.traits.map((t) => t.title)).size === 3);
checkTrue('headlineLines 중복 없음(key={line})', new Set(report.headlineLines).size === report.headlineLines.length);
checkTrue('strengths·improvements·recommendations 는 배열',
  Array.isArray(report.strengths) && Array.isArray(report.improvements) && Array.isArray(report.recommendations));
checkTrue(
  'admission 5키 전부 존재 + rows 는 배열(AdmissionSection 이 무조건 구조분해한다)',
  report.admission != null &&
    ['probabilityLabel', 'probabilityValue', 'summary', 'caption', 'rows'].every((key) => key in report.admission) &&
    Array.isArray(report.admission.rows)
);
// 엔진이 합성한 런타임 문자열도 금지어 검사 대상이다(§5.3 ④).
check('조립 문자열 금지어 위반 0건', findBannedPhrases(report).map((hit) => hit.phrase), []);

// §4.4(E) 긴급도 — 엔진에는 있는데 리포트에 실리지 않아 URGENCY_COPY 4문구가 통째로 죽어 있었다.
// 렌더 슬롯은 아직 없지만(각 함수 TODO) ReportData 에는 반드시 실려야 다음 단계에서 배선만 하면 된다.
checkTrue(
  'urgency 블록이 실린다(level·score·message)',
  report.urgency != null &&
    ['L1', 'L2', 'L3', 'L4'].includes(report.urgency.level) &&
    Number.isFinite(report.urgency.score) &&
    typeof report.urgency.message === 'string'
);
check(
  'urgency.message = URGENCY_COPY[level]',
  report.urgency.message,
  URGENCY_COPY[report.urgency.level]
);

// §5.1 '조건 없음, 항상' 6종 고정 안내가 조립된다. 누락(=문구가 죽는다)과 보류(=조건 미충족)를
// 구분하기 위해 항상 노출 항목만 문자열을 요구하고 조건부 항목은 키 존재만 본다.
['traitIntro', 'hexCaption', 'goalCompare', 'reportBasis', 'reportLimit', 'probNote', 'admissionNote'].forEach(
  (key) => {
    checkTrue(`notices.${key} 가 문구집 원문으로 채워진다`, typeof report.notices?.[key] === 'string');
  }
);
checkTrue('notices 에 조건부 키(serviceLimit·skipNote)가 존재한다',
  report.notices != null && 'serviceLimit' in report.notices && 'skipNote' in report.notices);
check('M3 가 아니면 serviceLimit 은 null', report.notices.serviceLimit, null);
check(
  'M3 면 SVC_M3_LIMIT 안내가 붙는다',
  buildReport(makeInput({ profile: { name: null, gradeLevel: 'M3', schoolType: null } })).notices.serviceLimit,
  COMMON_COPY.SVC_M3_LIMIT
);

/* ------------------------------------------------------------------ *
 * S13b. 조립 문자열 — 토큰 누출 · 분기 커버리지
 * 개수 불변식만 보던 구간이라, 문자열을 만드는 경로(cut_labels/diff_*, formatGpa 4분기,
 * page2_summary 폴백, 서비스 카드)에 단언이 하나도 없었다.
 * ------------------------------------------------------------------ */

/** ReportData 전체에서 미치환 토큰('{gap}' · '{영역}')을 찾는다. 화면에 리터럴이 나가는 사고를 막는다. */
function unfilledTokens(value, out = []) {
  if (typeof value === 'string') {
    const hits = value.match(/\{(\w+|영역)\}/g);
    if (hits) out.push(...hits);
    return out;
  }
  if (value && typeof value === 'object') Object.values(value).forEach((item) => unfilledTokens(item, out));
  return out;
}

const CUTS_VARIANTS = [
  ['입결 미연결', undefined],
  ['cut50·cut70 둘 다', { cut50: 2.5, cut70: 3.0, finalAvg: 2.8 }],
  ['cut70 단독', { cut50: null, cut70: 2.56, finalAvg: null }],
  ['cut50 단독(Q-28)', { cut50: 2.5, cut70: null, finalAvg: null }]
];
const GRADE_SYSTEMS = ['NINE', 'FIVE', 'MIDDLE_AVG', 'UNKNOWN'];

CUTS_VARIANTS.forEach(([cutsLabel, cuts]) => {
  GRADE_SYSTEMS.forEach((system) => {
    const variant = buildReport(
      makeInput({
        gradeSystem: system,
        scores: { naesinOverall: system === 'MIDDLE_AVG' ? 88.5 : 3.24, recentExamAvg: null, mock: {}, mockFilledCount: 0 },
        obstacles: ['OBS_01', 'OBS_02', 'OBS_03'],
        difficulties: ['DIF_10'],
        wishes: ['WISH_07'],
        admissionQuery: { university: '위닝대', department: '학과', admissionType: '교과', detailType: '일반' }
      }),
      { cuts, admissionMeta: { year: 2026 } }
    );
    const label = `${cutsLabel} × ${system}`;
    checkTrue(`[${label}] 미치환 토큰 0건`, unfilledTokens(variant).length === 0);
    checkTrue(`[${label}] 금지어 0건`, findBannedPhrases(variant).length === 0);
    checkTrue(`[${label}] admission.rows 는 4행 이하`, variant.admission.rows.length <= 4);
    checkTrue(
      `[${label}] 노출 슬롯이 비지 않는다`,
      typeof variant.admission.probabilityLabel === 'string' && variant.admission.probabilityLabel !== '' &&
        typeof variant.admission.probabilityValue === 'string' && variant.admission.probabilityValue !== '' &&
        typeof variant.readiness.scoreLabel === 'string'
    );
  });
});

// formatGpa 4분기 — 원값 표기이며 9등급 환산값이 아니다(§7.2). 중학생 88.5점이 '2.75등급'이 되면 안 된다.
const gpaOf = (system, raw) =>
  buildReport(
    makeInput({ gradeSystem: system, scores: { naesinOverall: raw, recentExamAvg: null, mock: {}, mockFilledCount: 0 } })
  ).student.gpa;
check('gpa NINE', gpaOf('NINE', 3.2), '3.20등급(9등급제)');
check('gpa FIVE', gpaOf('FIVE', 2.5), '2.50등급(5등급제)');
check('gpa MIDDLE_AVG 는 점수 원값', gpaOf('MIDDLE_AVG', 88.5), '88.5점');
check('gpa UNKNOWN 은 단위를 붙일 수 없어 미입력', gpaOf('UNKNOWN', 3.2), COPY_FALLBACK.VALUE_MISSING);
check('gpa 결측', gpaOf('NINE', null), COPY_FALLBACK.VALUE_MISSING);

// page2_summary 동점 가드 — 코드 동일성(highCode === lowCode)으로 구현하면 원소가 6개라 절대
// 성립하지 않아, 전 영역 동점 응답에서 두 영역을 우열로 서술하는 문장이 렌더된다.
// SUBJECT 만 base 20 이라 모의고사 6칸(aux 10)을 채워야 나머지 base 30 과 같은 점수가 된다.
const tiedInput = makeInput({
  likert2: Object.fromEntries(LIKERT2_KEYS.map((key) => [key, 100])),
  scores: { naesinOverall: null, recentExamAvg: null, mock: {}, mockFilledCount: 6 }
});
const tiedAreas = scoreAreas(tiedInput);
checkTrue('픽스처 전제: PAGE2 6영역이 실제로 동점', new Set(PAGE2_AREAS.map((a) => tiedAreas[a])).size === 1);
const tiedHigh = buildReport(tiedInput);
checkTrue(
  'PAGE2 전 영역 동점이면 우열 서술을 쓰지 않는다',
  tiedHigh.readiness.summaryLines.every((line) => !line.includes('안정적으로 관리되고 있으나'))
);
check('동점이면 종합 등급 문구 1줄', tiedHigh.readiness.summaryLines.length, 1);
// 동점이 아니고 최고점이 TOP/MID 면 원래의 대비 문장을 그대로 쓴다(가드가 과잉 차단하지 않는다).
const contrastLines = buildReport(
  makeInput({
    likert2: Object.fromEntries(LIKERT2_KEYS.map((key) => [key, key === 'LK2_11' || key === 'LK2_12' ? 0 : 100]))
  })
).readiness.summaryLines;
checkTrue(
  '격차가 있으면 page2_summary 대비 문장을 쓴다',
  contrastLines.some((line) => line.includes('안정적으로 관리되고 있으나'))
);

// 추천 카드 — SERVICE_COPY 조회 실패 시 폴백이 SVC_RANK2_PREFIX 원문을 쓰면 '{영역}' 이 샌다.
const recommended = buildReport(
  makeInput({ obstacles: ['OBS_01', 'OBS_02', 'OBS_03'], difficulties: ['DIF_10'], wishes: ['WISH_02', 'WISH_07'] })
);
checkTrue('추천 카드가 1장 이상', recommended.recommendations.length >= 1);
checkTrue(
  '추천 카드 desc 에 미치환 토큰이 없다',
  recommended.recommendations.every((card) => !/\{(\w+|영역)\}/.test(card.desc))
);
checkTrue(
  '추천 카드 chips 는 4개(문구집 태그 세트)',
  recommended.recommendations.every((card) => card.chips.length === 4 || card.chips.length === 0)
);
// 전 서비스 fit < 50 이면 SVC_NONE 안내 카드 1장으로 접는다(컴포넌트에 캡션 슬롯이 없다).
const noService = buildReport(makeInput({ likert1: Object.fromEntries(LIKERT1_KEYS.map((k) => [k, 100])), likert2: Object.fromEntries(LIKERT2_KEYS.map((k) => [k, 100])) }));
check('추천 대상이 없으면 안내 카드 1장', noService.recommendations.length, 1);
check('안내 카드 본문 = SVC_NONE', noService.recommendations[0].desc, COMMON_COPY.SVC_NONE);

/* ================================================================== *
 * 요약
 * ================================================================== */

// 케이스를 지우면서 pending 만 남기는 침묵 약화를 막는 하한선.
const asserted = stats.pass + stats.fail;
if (asserted < MIN_ASSERTIONS) {
  stats.fail += 1;
  show(
    `FAIL - [메타] 비-pending 단언이 ${asserted}건으로 하한 ${MIN_ASSERTIONS} 미만이다 — 케이스가 사라졌거나 전부 pending 이 됐다`
  );
}
if (EXAMPLE_CASES.filter((item) => !item.pending).length < EXAMPLE_CASES_MIN_ASSERTIONS) {
  stats.fail += 1;
  show(`FAIL - [메타] EXAMPLE_CASES 의 비-pending 픽스처가 ${EXAMPLE_CASES_MIN_ASSERTIONS}건 미만이다`);
}

console.log('\n─────────────────────────────────────────────');
console.log(
  `[diagnosis] 단언 ${stats.pass + stats.fail}건 중 ${stats.pass}건 통과, ${stats.fail}건 실패.`
);
console.log(
  `[diagnosis] pending ${stats.pending}건(§9 미확정 — 종료코드 미반영) · WARN ${stats.warn}건 · SKIP ${stats.skip}건.`
);
[...pendingByReason.entries()]
  .sort((a, b) => a[0].localeCompare(b[0]))
  .forEach(([reason, bucket]) => {
    console.log(
      `[diagnosis]   pending ${String(bucket.total).padStart(2)}건 (현 가정과 불일치 ${bucket.diff}) — ${reason}`
    );
  });
if (stats.pending > 0) {
  console.log('[diagnosis] pending 은 확정 후 §8 기대값을 재작성한다. 전량 출력은 --verbose.');
}
console.log(`[diagnosis] 결과: ${stats.fail ? 'FAIL' : 'PASS'}`);

process.exitCode = stats.fail ? 1 : 0;
