/**
 * 학습진단 채점 엔진 — 순수 함수 모듈.
 *
 * 정본: docs/학습진단-계산엔진-적용명세.md §3(응답 스키마) · §4(계산식 전량).
 *
 * 세 가지 계약을 지킨다.
 * 1) **문구 모듈을 import 하지 않는다.** §4.6 의사코드는 TEMPLATE_COPY/fill 을 직접 부르지만
 *    그대로 옮기면 엔진 → 문구 역의존이 생겨 §5.3 ①(문구 정적 검사)과 엔진 회귀가 한 덩어리로
 *    엉킨다. 엔진은 코드·수치만 내고 문자열 조립은 diagnosisReport 가 맡는다.
 * 2) **반올림은 딱 두 지점**(§4 서두 B-02) — 영역 점수 정수 1회, 종합 점수 소수1 1회.
 *    그 외 중간값(scalePart 26.25, fit, areaPart)은 반올림하지 않는다.
 * 3) **NaN 을 내지 않는다.** 모든 상수 조회는 `POINTS[code] ?? 0` 폴백을 거친다. NaN 은 영역 →
 *    종합 → 뱃지 → gap → 긴급도까지 그대로 전파돼 리포트 전체를 무너뜨린다(§4.2.2).
 *
 * 부수효과가 없다 — 시계도 읽지 않는다(diagnosedAt 은 호출부가 넣는다). React 미의존.
 */
import {
  AREA_CODES,
  PAGE1_AREAS,
  PAGE2_AREAS,
  AREA_LABEL,
  AREA_SCALE_MAP,
  AREA_BASE,
  AREA_AUX_SOURCE,
  OBSTACLE_DEDUCTIONS,
  DIFFICULTY_DEDUCTIONS,
  GOAL_LEVEL_POINTS,
  GOAL_REASON_POINTS,
  TREND_POINTS,
  MOCK_FILL_POINTS,
  SCHEDULE_POINTS,
  OPTION_SOURCE_QUESTION,
  LIKERT1_KEYS,
  LIKERT2_KEYS,
  SCHEMA_VERSION,
  SCORE_BANDS,
  AREA_BAND_THRESHOLDS,
  STATE_TONE,
  BADGES,
  TARGET_SCORE,
  SERVICE_CODES,
  SERVICE_LABEL,
  SERVICE_RULES,
  SERVICE_BANDS,
  SERVICE_PART_CAPS,
  SERVICE_GRADE_FILTER,
  SERVICE_RANK2_MIN_FIT,
  SERVICE_RANK2_MAX_DIFF,
  CALL_MENTOR_KEYWORDS,
  URGENCY_BANDS,
  URGENCY_AREA_THRESHOLD,
  URGENCY_SCOPE,
  ADMISSION_MARGIN,
  ADMISSION_ROW_KEYS,
  ADMISSION_MASTER_KEYS,
  ADMISSION_SPECIAL_SCHOOL_TYPES,
  BASE_PROBABILITY,
  PROB_MIN,
  PROB_MAX,
  CSAT_MIN_DELTA,
  JONGHAP_DELTA,
  INTERVIEW_DELTA
} from '../data/diagnosisScoringTable.js';
import {
  clamp,
  fiveScaleToNine,
  isUsableNumber,
  middleAvgToNine,
  roundHalfUp
} from '../data/diagnosisGradeScale.js';
import { getOptionCode, renewalSurveyQuestions } from '../data/renewalSurveyQuestions.js';

/* ================================================================== *
 * 0. 공통 유틸
 * ================================================================== */

/**
 * ROUND_HALF_UP (§4 서두 · B-01 정본 구현 · CASE-09) 재수출.
 * 구현은 의존 그래프의 리프인 diagnosisGradeScale.js 한 곳에만 있다 — 등급 변환표 룩업과
 * 채점이 같은 반올림을 쓰므로 사본을 두면 B-01 회귀 수정이 한쪽에만 반영된다.
 * §6.2 가 엔진 공개 API 로 지정한 이름이라 여기서 그대로 내보낸다.
 */
export { roundHalfUp };

/** 평균. 빈 배열이면 null(0 이 아니다 — 0 과 '자료 없음'은 다른 값이다). */
function meanOf(values) {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/* ================================================================== *
 * 1. 응답 정규화 (§3)
 * ================================================================== */

/**
 * 라벨 → 선택지 서수 → 코드 2단 변환 (§3.5). 미지 라벨·미응답은 null.
 *
 * answers 는 OptionGroup 이 저장한 **라벨 문자열**이다. "라벨을 키로 쓰지 마라"(§3.5)를 지키면서
 * 이를 잇는 유일한 방법이 UI 가 렌더한 것과 같은 배열에서 서수를 얻는 것이라, 이 의존은 의도적이다
 * — 라벨 오탈자를 고치면 UI 와 채점에 동시에 반영된다. 대신 서수 계약이 깨지면 조용히 오채점되므로
 * §3.5 적재 검증식(q10=13지 / q12=14지 / q14=10지 / q9=q11=12문장)을 verify 스크립트 첫 항목에 둔다.
 *
 * 변환표를 여기서 다시 만들지 않고 문항이 들고 있는 optionCodes 를 getOptionCode 로 조회한다 —
 * OPTION_CODES 로 사본을 만들면 같은 계약이 두 소스가 되어 한쪽만 고쳐져도 조용히 오채점된다.
 * OPTION_CODES 는 감점표 키 계약과 적재 검증식의 기준으로만 남는다.
 */
function codeOf(group, value) {
  return getOptionCode(OPTION_SOURCE_QUESTION[group], value);
}

/** 복수선택. 미지 라벨은 조용히 버리고 중복은 접는다 — 감점 이중 계상을 막는다. */
function codesOf(group, values) {
  if (!Array.isArray(values)) return [];
  const seen = new Set();
  values.forEach((value) => {
    const code = codeOf(group, value);
    if (code != null) seen.add(code);
  });
  return [...seen];
}

/**
 * 리커트 방향 반전 (§3.3). UI 는 0='매우 그렇다', 배점표는 100='매우 그렇다'.
 * normalizeAnswers 내부 전용이다 — export 하면 엔진 입력이 점수인지 인덱스인지 계약이 모순된다(§6.2).
 */
function likertScore(columnIndex) {
  if (!Number.isInteger(columnIndex) || columnIndex < 0 || columnIndex > 4) return null;
  return 100 - 25 * columnIndex;
}

/**
 * 미응답 문장은 null 로 둔다 — 0 으로 채우면 '전혀 그렇지 않다'와 구분되지 않는다(§3.3).
 * LikertMatrix 는 statement.key 를 그대로 저장 키로 쓰고 q9·q11 의 statements 는 전부
 * {key,text} 로 승격돼 있으므로(적재 검증식이 못박는다) 저장 키 = 안정 키다.
 */
function normalizeLikert(raw, stableKeys) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const result = {};
  stableKeys.forEach((stableKey) => {
    result[stableKey] = likertScore(source[stableKey]);
  });
  return result;
}

/**
 * grade-grid 칸 → 그 칸을 숨기는 등급 체계 목록(§3.4 group.hiddenWhenGradeSystem).
 *
 * 표를 여기 복사하지 않고 문항 데이터에서 파생시킨다 — GradeInputGrid 가 숨기는 칸과 채점이
 * 무시하는 칸이 같아야 하는데, 사본을 두면 한쪽만 고쳐진다.
 */
const GRADE_FIELD_HIDDEN_SYSTEMS = new Map(
  renewalSurveyQuestions
    .flatMap((question) => question.extra?.groups ?? [])
    .flatMap((group) =>
      (group.fields ?? []).map((field) => [field.key, group.hiddenWhenGradeSystem ?? []])
    )
);

/**
 * grade-grid 는 값을 문자열로 저장한다. '' → null, 비수치 → null (NaN 차단).
 *
 * 등급 체계에서 숨겨지는 칸은 값이 남아 있어도 읽지 않는다. GradeInputGrid 는 체계를 바꿔도
 * 숨긴 그룹의 입력값을 **의도적으로 보존**하고(되돌릴 때 재입력을 없애기 위해) 그 근거로
 * "채점 계층이 등급 체계에 맞지 않는 칸을 무시한다"를 든다. 그 약속을 지키지 않으면 9등급제로
 * 모의고사를 채운 뒤 '중학생 평균'으로 바꿨을 때, 화면에서는 칸이 사라졌는데 교과 관리 aux 만
 * 5 → 10 으로 오르는 조용한 오채점이 된다.
 */
function gridNumber(raw, fieldKey, gradeSystem) {
  if (raw == null || raw === '') return null;
  if (GRADE_FIELD_HIDDEN_SYSTEMS.get(fieldKey)?.includes(gradeSystem)) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function textOrNull(raw) {
  return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : null;
}

/**
 * 원시 answers(라벨 문자열 맵) → DiagnosisInput (§3.1~§3.5).
 *
 * 미응답 필드는 null 이다(0 으로 채우지 않는다). 범위 검증은 하지 않는다 — §3.4 의 입력 검증은
 * UI 소관이고, §4.1 의 clamp 는 정의역 밖 값이 여기까지 왔을 때 발동하는 방어 규칙이라 역할이
 * 다르다. 여기서 미리 잘라내면 clamp 가 정상 경로에서 영영 발동하지 않는다.
 *
 * @param {Record<string, any>} answers SurveyStepShell 이 들고 있는 원시 응답
 * @param {{ diagnosedAt?: string|null, name?: string|null }} [meta]
 * @returns {object} DiagnosisInput
 */
export function normalizeAnswers(answers, meta = {}) {
  const source = answers && typeof answers === 'object' ? answers : {};
  const grid = source.q6 && typeof source.q6 === 'object' ? source.q6 : {};
  const gradeSystem = codeOf('Q4_SYSTEM', source.q4);

  const mock = {
    korean: gridNumber(grid.mock_korean, 'mock_korean', gradeSystem),
    math: gridNumber(grid.mock_math, 'mock_math', gradeSystem),
    english: gridNumber(grid.mock_english, 'mock_english', gradeSystem),
    social: gridNumber(grid.mock_social, 'mock_social', gradeSystem),
    science: gridNumber(grid.mock_science, 'mock_science', gradeSystem),
    history: gridNumber(grid.mock_korean_history, 'mock_korean_history', gradeSystem)
  };

  const cascade = source.q15 && typeof source.q15 === 'object' ? source.q15 : null;
  const admissionQuery =
    cascade &&
    cascade.university &&
    cascade.department &&
    cascade.admissionType &&
    cascade.detailType
      ? {
          university: cascade.university,
          department: cascade.department,
          admissionType: cascade.admissionType,
          detailType: cascade.detailType
        }
      : null; // 4단이 전부 채워졌을 때만 객체다(§3.2)

  return {
    meta: {
      schemaVersion: SCHEMA_VERSION,
      // 시계를 읽지 않는다 — 제출 핸들러가 넣는다. 엔진이 Date.now() 를 부르면 순수성이 깨지고
      // 같은 입력이 매번 다른 리포트를 낸다(스냅샷 회귀 불가).
      diagnosedAt: meta.diagnosedAt ?? null
    },
    profile: {
      // TODO(Q-01): 이름을 수집하는 문항이 없다. 상시 null 이며 폴백은 §5.2 소관이다.
      name: meta.name ?? null,
      gradeLevel: codeOf('Q1_GRADE_LEVEL', source.q1),
      schoolType: codeOf('Q2_SCHOOL_TYPE', source.q2)
    },
    goal: {
      level: codeOf('Q3_LEVEL', source.q3),
      // q3 에서 '아직 구체적인 목표가 없어요'를 고르면 이유 문항이 노출되지 않아 상시 null 이다(§4.2.2).
      reason: codeOf('Q3_REASON', source['q3-target-reason']),
      targetUniversity: textOrNull(source['q3-target-university']),
      targetMajor: textOrNull(source['q3-target-major'])
    },
    gradeSystem,
    scores: {
      naesinOverall: gridNumber(grid.overall_avg, 'overall_avg', gradeSystem),
      recentExamAvg: gridNumber(grid.recent_exam_avg, 'recent_exam_avg', gradeSystem),
      mock,
      mockFilledCount: Object.values(mock).filter((value) => value != null).length
    },
    gradeTrend: codeOf('Q8_TREND', source.q8),
    // 점수에는 쓰이지 않지만 코드로 담는다 — 이 값은 sessionStorage 로 영속화되므로 라벨 원문을
    // 넣으면 문항 1자 수정에 과거 응답이 미지 값이 된다(§3.5). TODO(Q-17): 축약 라벨 매핑은 미확정.
    trendSubject: codeOf('Q8_FOLLOWUP', source['q8-followup']),
    likert1: normalizeLikert(source.q9, LIKERT1_KEYS),
    likert2: normalizeLikert(source.q11, LIKERT2_KEYS),
    obstacles: codesOf('OBSTACLE', source.q10),
    difficulties: codesOf('DIFFICULTY', source.q12),
    schedule: codeOf('SCHEDULE', source.q13),
    wishes: codesOf('WISH', source.q14),
    admissionQuery,
    csatMin: codeOf('Q16', source.q16),
    jonghapReady: codeOf('Q17', source.q17),
    interviewReady: codeOf('Q18', source.q18),
    freeText: typeof source.q19 === 'string' ? source.q19 : ''
  };
}

/* ================================================================== *
 * 2. 등급 변환 (§4.1)
 * ================================================================== */

/**
 * 등급 체계 간 정규화 → 9등급 스케일 (§4.1 · CASE-06).
 *
 * 이 값은 §4.6 입결 비교 **전용**이다. 배점표 4번 주석("점수에는 반영되지 않습니다")대로
 * 12영역 점수·양 페이지 종합점수에는 절대 영향을 주지 않는다.
 *
 * @param {'NINE'|'FIVE'|'MIDDLE_AVG'|'UNKNOWN'|null} gradeSystem
 * @param {number|null} raw
 * @returns {number|null} 소수 2자리 또는 null(= 입결 섹션 전체 생략)
 */
export function convertToNineScale(gradeSystem, raw) {
  if (!isUsableNumber(raw)) return null;
  switch (gradeSystem) {
    case 'NINE':
      return roundHalfUp(raw, 2); // 환산 없이 그대로
    case 'FIVE':
      return fiveScaleToNine(raw);
    case 'MIDDLE_AVG':
      return middleAvgToNine(raw);
    default:
      // UNKNOWN · 미응답(null) · q1×q4 불일치(Q-30)로 체계를 신뢰할 수 없는 경우.
      return null;
  }
}

/* ================================================================== *
 * 3. 문항 → 영역 점수 (§4.2)
 * ================================================================== */

/** 모의고사 입력 칸수 → 교과 관리 aux 조회 (§4.2.2 · Q-09 확정, 6키 전부 룩업). */
function mockFillPoints(filledCount) {
  const count = Number.isInteger(filledCount) ? clamp(filledCount, 0, 6) : 0;
  return MOCK_FILL_POINTS[count] ?? 0;
}

/**
 * 영역별 보조 가산 aux (§4.2.1 표의 '보조 가산' 열).
 * 분기 근거는 AREA_AUX_SOURCE 데이터가 갖고 있다 — if 를 코드에 흩으면 표와 어긋나도 드러나지 않는다.
 */
function auxOf(area, input) {
  switch (AREA_AUX_SOURCE[area]) {
    case 'GOAL_POINTS':
      // goal.reason == null 은 상시 경로다. ?? 0 이 없으면 aux = 20 + undefined = NaN 이 된다.
      return (GOAL_LEVEL_POINTS[input.goal?.level] ?? 0) + (GOAL_REASON_POINTS[input.goal?.reason] ?? 0);
    case 'TREND':
      // 실치역 {2,3,5,8,10} — 6지 전부 2점 이상이라 '미응답 0' 경로가 없다(§4.2.1).
      return TREND_POINTS[input.gradeTrend] ?? 0;
    case 'MOCK_FILL':
      return mockFillPoints(input.scores?.mockFilledCount);
    default:
      return 0;
  }
}

/** 척도 70점 파트. 2문장 중 응답한 것만으로 평균(분모 1 허용), 둘 다 결측이면 0 (§4.2 결측 · Q-10). */
function scalePartOf(area, likert) {
  const answered = (AREA_SCALE_MAP[area] ?? [])
    .map((key) => likert[key])
    .filter((value) => isUsableNumber(value));
  const mean = meanOf(answered);
  return mean == null ? 0 : mean * 0.7;
}

/** 체크 감점 합. 배타값(OBS_13 / DIF_14)은 area:null · points:0 이라 자연히 0 이다. */
function deductionOf(area, input) {
  let total = 0;
  (input.obstacles ?? []).forEach((code) => {
    const rule = OBSTACLE_DEDUCTIONS[code];
    if (rule?.area === area) total += rule.points ?? 0;
  });
  (input.difficulties ?? []).forEach((code) => {
    const rule = DIFFICULTY_DEDUCTIONS[code];
    if (rule?.area === area) total += rule.points ?? 0;
  });
  return total;
}

/**
 * 12영역 점수 (§4.2 · §4.2.1 · §4.2.2 · CASE-01 · CASE-08).
 *
 *   areaScore = roundHalfUp(clamp(scalePart + max(0, base + Σ감점) + aux, 0, 100), 0)
 *
 * `max(0, …)` 는 base 부분에만 씌운다 — 감점 합이 base 를 넘는 영역이 4곳 있는데(FEEDBACK −21,
 * PERFORM/INQUIRY/STRATEGY −31) aux 까지 함께 접으면 성적 흐름·모의고사 가산이 사라진다(§4.2.1).
 *
 * @param {object} input DiagnosisInput
 * @returns {Record<string, number>} 12영역 0~100 정수
 */
export function scoreAreas(input) {
  const likert = { ...(input?.likert1 ?? {}), ...(input?.likert2 ?? {}) };
  const safeInput = input ?? {};
  const result = {};
  AREA_CODES.forEach((area) => {
    const scalePart = scalePartOf(area, likert);
    const basePart = Math.max(0, (AREA_BASE[area] ?? 0) + deductionOf(area, safeInput));
    const raw = scalePart + basePart + auxOf(area, safeInput);
    // 이 단계가 §4 서두가 허용한 두 반올림 지점 중 첫 번째다. §4.3·§4.4·§4.5 는 전부 이 정수를 받는다.
    result[area] = roundHalfUp(clamp(raw, 0, 100), 0);
  });
  return result;
}

/* ================================================================== *
 * 4. 영역 → 종합 · 구간 판정 (§4.3 · §4.4)
 * ================================================================== */

function areasOfPage(page) {
  return page === 2 ? PAGE2_AREAS : PAGE1_AREAS;
}

function scoreOf(areaScores, area) {
  const value = areaScores?.[area];
  return isUsableNumber(value) ? value : 0;
}

/**
 * 페이지 종합 준비도 (§4.3 · CASE-02).
 * 분모는 항상 6 이다 — 유효 영역 수로 줄이지 않는다(§4.3 결측, Q-10 정합 선택).
 *
 * @param {Record<string, number>} areaScores
 * @param {1|2} page
 * @returns {number} 소수 1자리
 */
export function overallScore(areaScores, page) {
  const areas = areasOfPage(page);
  const total = areas.reduce((sum, area) => sum + scoreOf(areaScores, area), 0);
  // 두 번째이자 마지막 반올림 지점(§4 서두 B-02).
  return roundHalfUp(total / areas.length, 1);
}

/** 5단계 등급 (§4.4 A · CASE-07). 경계는 상단 포함(>=)으로 통일 — 원문은 '80+'만 명시(Q-11). */
export function levelOf(score) {
  const value = isUsableNumber(score) ? score : 0;
  if (value >= SCORE_BANDS.L1) return 'L1';
  if (value >= SCORE_BANDS.L2) return 'L2';
  if (value >= SCORE_BANDS.L3) return 'L3';
  if (value >= SCORE_BANDS.L4) return 'L4';
  return 'L5';
}

/** 영역 4상태 (§4.4 B · Q-32). 화면 라벨은 STATE_LABEL[page][state] 로 분리돼 있다. */
export function stateOf(score) {
  const value = isUsableNumber(score) ? score : 0;
  if (value >= AREA_BAND_THRESHOLDS.TOP) return 'TOP';
  if (value >= AREA_BAND_THRESHOLDS.MID) return 'MID';
  if (value >= AREA_BAND_THRESHOLDS.LOW) return 'LOW';
  return 'WEAK';
}

/**
 * 컴포넌트 tone 3색 (§7.3 · Q-32).
 * stateOf 에서 파생시킨다 — 별도 임계를 두면 Q-32 확정 시 라벨과 색이 어긋난다.
 */
export function toneOf(score) {
  return STATE_TONE[stateOf(score)] ?? 'blue';
}

/**
 * 점수 오름차순 정렬. 동점이면 §4.2.1 영역 고정 순서(= 배열 인덱스)로 가른다.
 * diagnosisReport 도 traits·readiness 정렬에 이 함수를 쓴다 — 규칙을 두 벌로 두면 뱃지(엔진 정렬)와
 * 특성 카드(리포트 정렬)가 동점 구간에서 어긋난다.
 */
export function sortByScoreAsc(areas, areaScores) {
  return [...areas].sort((a, b) => {
    const diff = scoreOf(areaScores, a) - scoreOf(areaScores, b);
    return diff !== 0 ? diff : areas.indexOf(a) - areas.indexOf(b);
  });
}

/**
 * 우선순위 뱃지 (§4.4 C · §7.4.3).
 * 대상은 PAGE1 6영역뿐이다 — PAGE2 에는 부여하지 않는다(readiness.areas 는 뱃지 키가 없다).
 *
 * @returns {Array<{code: string, name: string, score: number, badge: string}>} 정확히 6개
 */
export function priorityBadges(areaScores) {
  return sortByScoreAsc(PAGE1_AREAS, areaScores).map((area, index) => ({
    code: area,
    name: AREA_LABEL[area],
    score: scoreOf(areaScores, area),
    badge: BADGES[index]
  }));
}

/**
 * 목표 점수 부족분 (§4.4 D · CASE-02 · Q-29).
 * gap <= 0 이면 reached=true — 호출부가 '목표까지 0점 부족'을 렌더하지 않도록 분기한다.
 */
export function targetGap(areaScores) {
  const [lowest] = sortByScoreAsc(PAGE1_AREAS, areaScores);
  const lowestScore = scoreOf(areaScores, lowest);
  const gap = TARGET_SCORE - lowestScore;
  return {
    lowestCode: lowest,
    lowestName: AREA_LABEL[lowest],
    lowestScore,
    gap,
    reached: gap <= 0
  };
}

/**
 * 긴급도 (§4.4 E · CASE-03 · Q-12).
 *
 * 임계 40 은 다른 모든 경계(45/60/70/80)와 어긋나는 유일한 값이지만 원문 그대로다 —
 * AREA_BAND_THRESHOLDS(A1)를 뒤집어도 40 은 따라가면 안 된다.
 */
export function urgencyOf(input, areaScores) {
  const scopeAreas = URGENCY_SCOPE === 'PAGE1' ? PAGE1_AREAS : AREA_CODES;
  const lowAreaCount = scopeAreas.filter(
    (area) => scoreOf(areaScores, area) < URGENCY_AREA_THRESHOLD
  ).length;
  const score = (SCHEDULE_POINTS[input?.schedule] ?? 0) + 10 * lowAreaCount;
  const level =
    score >= URGENCY_BANDS.L4 ? 'L4' : score >= URGENCY_BANDS.L3 ? 'L3' : score >= URGENCY_BANDS.L2 ? 'L2' : 'L1';
  return { score, level, lowAreaCount };
}

/* ================================================================== *
 * 5. 서비스 추천 (§4.5)
 * ================================================================== */

/**
 * q19 자유서술 정서 신호 감지 (§4.5 원문 17번 · Q-36 해소로 배점과 분리, 사용자 확정 2026-08-11).
 *
 * 점수 계산에는 더 이상 쓰이지 않는다 — rankServices 는 이 함수를 호출하지 않는다. 오탐 특성을
 * 그대로 남긴다(부분 문자열 포함 매칭). '울' 한 글자가 '서울대'·'울산'에, '비교'·'혼자' 가
 * 부정문('비교하지 않으려 해요'·'혼자 있는 시간이 좋아요')에 걸린다. 이 신호는 그 자체로 결론이
 * 아니다 — 후속 판정자(사람 또는 LLM)가 "참고 후보"로만 읽어야 하는 신호다. 오탐이 섞인 채로
 * 학생 본인에게 노출하면 문구집 06_금지어의 진단·낙인 경계에 걸릴 수 있어, 이 값을 소비하는
 * diagnosisReport 는 저장·전달 전용으로만 싣고 렌더하지 않는다.
 *
 * @param {string} freeText DiagnosisInput.freeText(q19)
 * @returns {{ hit: boolean, matchedKeywords: string[] }}
 */
export function detectEmotionalSignal(freeText) {
  if (typeof freeText !== 'string' || freeText.length === 0) return { hit: false, matchedKeywords: [] };
  const matchedKeywords = CALL_MENTOR_KEYWORDS.filter((keyword) => freeText.includes(keyword));
  return { hit: matchedKeywords.length > 0, matchedKeywords };
}

/**
 * 서비스 적합도 순위 (§4.5 · CASE-05 · Q-13 · Q-14 · Q-36 해소).
 *
 *   fit = min(50, 50×체크수/threshold) + (희망 교집합 ? 20 : 0) + 30 × (1 − mean(linkedAreas)/100)
 *
 * 콜멘토 자유서술 감지 단어 가산(+10)은 이 식에서 빠졌다(Q-36 해소, 사용자 확정 2026-08-11) —
 * 부분 문자열 매칭이 부정문·긍정 맥락·미탐을 구분하지 못하는데, 추천 구간 경계(80/65/50)를
 * 한 칸 넘겨 1순위 서비스를 바꿀 수 있는 건 근거 대비 과한 권한이라는 판단이다. 감지 자체는
 * detectEmotionalSignal() 로 분리해 별도 신호로만 낸다 — 실제 배점은 후속 작업(LLM 분류·어드민
 * 수동 배점) 몫이다.
 *
 * cap(min 50)은 여전히 방어 로직으로 남는다(B-03) — threshold < items.length 인 서비스(예:
 * GOAL_CARE 9개 항목/threshold 3)는 가산 없이도 체크수 비례식만으로 50을 넘을 수 있다
 * (9/3×50=150). fit <= 100 불변식의 근거이므로 cap 을 안쪽이 아니라 바깥에 씌운다.
 */
export function rankServices(input, areaScores) {
  const safeInput = input ?? {};
  const checked = new Set([...(safeInput.obstacles ?? []), ...(safeInput.difficulties ?? [])]);
  const wishes = new Set(safeInput.wishes ?? []);
  const candidates = SERVICE_GRADE_FILTER[safeInput.profile?.gradeLevel] ?? SERVICE_CODES;

  const all = candidates
    .map((code) => {
      const rule = SERVICE_RULES[code];
      if (!rule) return null;

      const checkedCount = rule.items.filter((item) => checked.has(item)).length;
      const difficultyPart = Math.min(
        SERVICE_PART_CAPS.difficulty,
        (SERVICE_PART_CAPS.difficulty * checkedCount) / rule.threshold
      );
      const wishPart = rule.wishOptions.some((wish) => wishes.has(wish)) ? SERVICE_PART_CAPS.wish : 0;
      const linkedMean = meanOf(rule.linkedAreas.map((area) => scoreOf(areaScores, area))) ?? 0;
      // 영역 점수가 0~100 정수라 areaPart 는 자연히 0~30 이지만, 상한을 명시해 불변식을 코드로 남긴다.
      const areaPart = clamp(SERVICE_PART_CAPS.area * (1 - linkedMean / 100), 0, SERVICE_PART_CAPS.area);
      // 반올림하지 않는다 — tier 판정은 원값으로 한다(§4.5 경계값). 표시용 반올림은 리포트 계층 몫.
      const fit = difficultyPart + wishPart + areaPart;
      const tier = fit >= SERVICE_BANDS.HIGH ? 'HIGH' : fit >= SERVICE_BANDS.MID ? 'MID' : fit >= SERVICE_BANDS.LOW ? 'LOW' : null;
      const lowestLinkedArea = sortByScoreAsc(rule.linkedAreas, areaScores)[0];

      return {
        code,
        name: SERVICE_LABEL[code],
        fit,
        tier,
        difficultyPart,
        wishPart,
        areaPart,
        lowestLinkedAreaName: AREA_LABEL[lowestLinkedArea] ?? null
      };
    })
    .filter((service) => service != null && service.tier != null)
    // 동점 타이브레이커는 SERVICE_CODES 표 순서 고정(§4.5 결측).
    .sort((a, b) => (b.fit - a.fit) || (SERVICE_CODES.indexOf(a.code) - SERVICE_CODES.indexOf(b.code)));

  const rank1 = all[0] ?? null;
  const second = all[1] ?? null;
  const rank2 =
    rank1 && second && second.fit >= SERVICE_RANK2_MIN_FIT && rank1.fit - second.fit <= SERVICE_RANK2_MAX_DIFF
      ? second
      : null;

  return { rank1, rank2, all };
}

/* ================================================================== *
 * 6. 학생 유형 (§6.2 B-14)
 * ================================================================== */

/**
 * 8종 학생 유형 판정 (Q-05 확정, 2026-08-11).
 *
 * 8단 결정트리는 폐기됐다 — 배점표·문구집 어디에도 판정 기준이 없어 나머지 4종
 * (학습체계 안정형 · 균형 점검형 · 계획 과잉·실행 취약형 · 목표–실행 불균형형)을 창작할 근거가 없다.
 * 최저 영역 룩업 기반 4종만 최초 매치로 구현하고, 그 외 조합은 값을 창작하지 않고 null 을 낸다
 * (null 폴백 조립은 buildReport 가 소유 — 헤드라인 = PAGE_GRADE_COPY, 먼저 할 일 3 = 최저 3영역
 * need.improve). 8종 판정 기준은 문구집 작성자에게 조회 대기 중이며(D2), 나오면 나머지 4종을 채운다.
 *
 * 최초 매치 순서:
 *   ① 리커트 24문장(7·9번) 응답값이 전부 동일 → null. Q-16(불성실 응답)의 최소 안전판이다.
 *   ② STABILITY < 45 → 학습 부담 누적형. 임계 45 는 배점표 영역 상태 취약 기준(§4.2.1) 그대로다.
 *      ②가 ③~⑤(축 취약)보다 앞서는 것은 판단이다 — 부담 신호를 축 취약보다 우선한다.
 *   ③ 최저 영역 = GOAL(목표 설정) → 방향 탐색형
 *   ④ 최저 영역 = TIME(시간 관리) → 시간관리 취약형
 *   ⑤ 최저 영역 = FEEDBACK(학습 피드백) → 학습방법 점검형
 *   ⑥ 그 외(최저 영역이 PLAN·EXEC·STABILITY) → null (현행 폴백 유지)
 * 동점 타이브레이커는 신규 규칙을 만들지 않고 sortByScoreAsc 의 기존 area 고정 순서를 그대로 쓴다.
 * 창작 상수 0개.
 */
export function classifyStudentType(input, areaScores) {
  const likert = { ...(input?.likert1 ?? {}), ...(input?.likert2 ?? {}) };
  const answered = Object.values(likert).filter((value) => isUsableNumber(value));
  if (answered.length > 0 && answered.every((value) => value === answered[0])) return null;

  if (scoreOf(areaScores, 'STABILITY') < 45) return 'BURDEN_ACCUM';

  const [lowest] = sortByScoreAsc(PAGE1_AREAS, areaScores);
  if (lowest === 'GOAL') return 'DIRECTION_SEEK';
  if (lowest === 'TIME') return 'TIME_WEAK';
  if (lowest === 'FEEDBACK') return 'METHOD_REVIEW';
  return null;
}

/* ================================================================== *
 * 7. 합격 가능성 (§4.6)
 * ================================================================== */

/**
 * 입결 마스터 키 (§4.6 · Q-35).
 * TODO(Q-35): 별도 마스터의 데이터 출처·조회 규칙이 원문에 없다. 키만 산출하고 실제 조회는
 * 일반 마스터 단일 경로로 간다(A6).
 */
export function admissionMasterKey(schoolType) {
  return ADMISSION_SPECIAL_SCHOOL_TYPES.includes(schoolType)
    ? ADMISSION_MASTER_KEYS.SPECIAL
    : ADMISSION_MASTER_KEYS.GENERAL;
}

/**
 * 합격 구간 (§4.6 · CASE-04 · CASE-04b · Q-28).
 * mine 이 컷과 정확히 같으면 상위 구간으로 귀속한다(`<=`).
 *
 * Q-28 확정(2026-08-11) — 배점표 04는 '70%컷만 있을 때' 열의 안정 경계를 `70%컷 − 0.30`
 * 으로 정의하며 이는 `cut50 ≡ cut70 − 0.30` 의 대입이다. 이 결측 대체 항등식(및 그 역
 * `cut70 ≡ cut50 + 0.30`)을 그대로 반영해 4단 사다리 1벌로 통합한다. 둘 다 결측일 때만
 * null(BAND_NODATA) — 그 외에는 cut50 단독도 정상 산출된다.
 *
 * @returns {'STABLE'|'FIT'|'REACH'|'RISK'|null} null 은 BAND_NODATA 노출 신호다
 */
export function admissionBand(mine, cuts) {
  if (!isUsableNumber(mine)) return null;
  const cut50 = isUsableNumber(cuts?.cut50) ? cuts.cut50 : null;
  const cut70 = isUsableNumber(cuts?.cut70) ? cuts.cut70 : null;
  if (cut50 == null && cut70 == null) return null;

  // 컷은 DB numeric(4,2) 라 .8 류 끝자리가 흔하고, JS 부동소수점 덧뺄셈은 정확하지 않다
  // (2.8 + 0.3 === 3.0999999999999996). 항등식 대입 직후 소수 2자리로 정규화해 경계에
  // 정확히 걸친 학생이 부동소수점 오차로 잘못된 밴드를 받지 않게 한다. roundHalfUp 재사용
  // — 새 반올림 헬퍼를 두지 않는다(모듈 서두 계약 2).
  const c50 = roundHalfUp(cut50 ?? cut70 - ADMISSION_MARGIN, 2);
  const c70 = roundHalfUp(cut70 ?? cut50 + ADMISSION_MARGIN, 2);
  const reach = roundHalfUp(c70 + ADMISSION_MARGIN, 2);
  if (mine <= c50) return 'STABLE';
  if (mine <= c70) return 'FIT';
  return mine <= reach ? 'REACH' : 'RISK';
}

/**
 * 입결 비교표 행 (§4.6 · §7.2 admission.rows).
 *
 * 라벨·'0.68등급 부족' 문자열은 만들지 않는다 — 엔진이 TEMPLATE_COPY 를 참조하면 문구 계층에
 * 역의존한다(모듈 서두 계약 1). 여기서는 key/value/diff 구조만 내고 문자열화는 diagnosisReport 가 한다.
 *
 * @returns {Array<{key: string, value: number, diff: number|null, emphasis: boolean}>} 값이 null 인 행 제외, 최대 4행
 */
export function admissionRows(mine, cuts) {
  const values = {
    cut50: cuts?.cut50,
    cut70: cuts?.cut70,
    avg: cuts?.finalAvg,
    mine
  };
  const mineValue = isUsableNumber(mine) ? roundHalfUp(mine, 2) : null;

  return ADMISSION_ROW_KEYS.filter((key) => isUsableNumber(values[key])).map((key) => {
    const value = roundHalfUp(values[key], 2);
    return {
      key,
      value,
      // 내 성적 행은 기준점이라 차이가 없다. mine 이 없으면 비교 자체가 성립하지 않는다.
      diff: key === 'mine' || mineValue == null ? null : roundHalfUp(mineValue - value, 2),
      emphasis: key === 'mine'
    };
  });
}

/**
 * 합격 확률 (§4.6 · §5.3 · Q-03 · Q-04).
 *
 * TODO(Q-03): BASE_PROBABILITY 가 미확정(null)이라 현재는 항상 null 을 반환한다. 확정되면 상수
 * 한 줄 교체로 활성화된다. 상한 PROB_MAX 는 반드시 100 미만이어야 한다 — 100 이 되는 순간 렌더
 * 문자열이 '합격 가능성 예측 100%'가 되어 06_금지어 '결과 단정'의 "100%"와 문자 그대로 일치한다.
 */
export function successProbability(input, band) {
  // 구간을 못 낸 상태(입결 미조회·자료 없음)에서는 확률의 기준 자체가 없다 → '자료 없음'으로 떨어뜨린다.
  if (BASE_PROBABILITY == null || band == null) return null;
  const delta =
    (CSAT_MIN_DELTA[input?.csatMin] ?? 0) +
    (JONGHAP_DELTA[input?.jonghapReady] ?? 0) +
    (INTERVIEW_DELTA[input?.interviewReady] ?? 0);
  return clamp(BASE_PROBABILITY + delta, PROB_MIN, PROB_MAX);
}
