/**
 * 무료진단 설문(리뉴얼) 파생 데이터 · 순수 술어 모음.
 *
 * renewalSurveyQuestions 는 정적 import 라 렌더마다 재계산할 이유가 없다.
 * 셸 / 스텝 페이지 / preview 가 각자 useMemo 를 갖는 중복을 원천 차단하기 위해
 * 모듈 최상위 상수로 승격한다.
 */
// 확장자 .js 명시 — verify 스크립트가 이 모듈(진행 판정 술어)을 plain node ESM 으로 직접 import 한다.
// node 는 Vite 와 달리 확장자 생략을 해석하지 못해 ERR_MODULE_NOT_FOUND 로 죽는다.
import { renewalSurveyQuestions } from '../data/renewalSurveyQuestions.js';

export const SURVEY_TOTAL_STEPS = 5;
export const SURVEY_FIRST_STEP_PATH = '/learning-diagnosis/survey/1';
export const SURVEY_REPORT_PATH = '/learning-diagnosis/report';

export function getStepPath(step) {
  return `/learning-diagnosis/survey/${step}`;
}

export const surveyMainQuestions = renewalSurveyQuestions
  .filter((question) => question.number != null)
  .sort((a, b) => a.number - b.number);

export const surveyEmbeddedByParent = renewalSurveyQuestions
  .filter((question) => question.extra?.embeddedIn)
  .reduce((map, question) => {
    const parentId = question.extra.embeddedIn;
    if (!map[parentId]) map[parentId] = [];
    map[parentId].push(question);
    return map;
  }, {});

export function getStepQuestions(step) {
  return surveyMainQuestions.filter((question) => question.page === step);
}

// 다음 스텝 이후에 남아 있는 문항 수(응답 무관). 1→14, 2→11, 3→9, 4→5, 5→0
// (q5·q7 삭제로 17문항 · 분포 3/3/2/4/5 가 되면서 스텝1 값만 16 → 14 로 바뀌었다.)
export function getRemainingAfterStep(step) {
  return surveyMainQuestions.filter((question) => question.page > step).length;
}

/**
 * 진행(다음 스텝 이동) 요건에 들어가는 문항.
 * - 중첩 문항(number:null / extra.embeddedIn)은 surveyMainQuestions 단계에서 이미 제외된다.
 * - `optional: true` 로 표시된 선택입력 문항(q19 주관식)은 화면에는 나오지만 요건에서 뺀다.
 */
export function getStepRequiredQuestions(step) {
  return getStepQuestions(step).filter((question) => question.optional !== true);
}

export function getStepUnansweredCount(step, answers) {
  return getStepRequiredQuestions(step).filter(
    (question) => !isQuestionAnswered(question, answers?.[question.id])
  ).length;
}

export function isStepComplete(step, answers) {
  return getStepUnansweredCount(step, answers) === 0;
}

// '1'~'5' 만 통과. '01' · '1.0' · '1abc' · ' 1' 전부 거부.
export function parseStepParam(raw) {
  return /^[1-5]$/.test(raw ?? '') ? Number(raw) : null;
}

/**
 * 문항 단위 응답 판정 (§3.4 B-08).
 *
 * `isAnswered(type, value)` 는 grade-grid 를 그룹 단위로만 본다 — 모의고사 '국어' 한 칸만 채워도
 * true 라, 내신 전체 평균을 비운 채 스텝 2를 통과해 리포트까지 도달하는 경로가 열려 있었다
 * (naesinOverall = null → gpa '미입력' + 입결 표 0행). 문항이 `requiredFields` 를 선언하면
 * 그 칸들이 **전부** 채워졌을 때만 응답으로 친다.
 *
 * 진행 판정에는 반드시 이 함수를 쓴다. isAnswered 는 문항 메타를 못 보는 하위 술어라
 * 직접 부르면 requiredFields 선언이 조용히 무시된다.
 */
export function isQuestionAnswered(question, value) {
  if (!isAnswered(question?.type, value)) return false;
  // Q-10 확정(2026-08-11) — 리커트는 12문장 전부 응답해야 통과한다(진행 게이트, 분모 산식은 무변경).
  // extra.statements 가 문장 키의 정본이라 개수를 여기서 재선언하지 않고 그대로 참조한다.
  if (question?.type === 'likert')
    return Object.keys(value ?? {}).length >= (question.extra?.statements?.length ?? 0);
  const required = question?.requiredFields;
  if (!Array.isArray(required) || required.length === 0) return true;
  return required.every((key) => value?.[key] !== '' && value?.[key] != null);
}

export function isAnswered(type, value) {
  if (value == null) return false;
  if (type === 'checkbox-row') return Array.isArray(value) && value.length > 0;
  if (type === 'likert') return typeof value === 'object' && Object.keys(value).length > 0;
  if (type === 'grade-grid') {
    return (
      typeof value === 'object' &&
      Object.values(value).some((field) => field !== '' && field != null)
    );
  }
  if (type === 'cascade') {
    return typeof value === 'object' && Boolean(value.university);
  }
  return typeof value === 'string' && value.trim().length > 0;
}
