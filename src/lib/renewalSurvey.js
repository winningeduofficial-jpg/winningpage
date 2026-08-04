/**
 * 무료진단 설문(리뉴얼) 파생 데이터 · 순수 술어 모음.
 *
 * renewalSurveyQuestions 는 정적 import 라 렌더마다 재계산할 이유가 없다.
 * 셸 / 스텝 페이지 / preview 가 각자 useMemo 를 갖는 중복을 원천 차단하기 위해
 * 모듈 최상위 상수로 승격한다.
 */
import { renewalSurveyQuestions } from '../data/renewalSurveyQuestions';

export const SURVEY_TOTAL_STEPS = 5;
export const SURVEY_FIRST_STEP_PATH = '/free-diagnosis/survey/1';
export const SURVEY_REPORT_PATH = '/free-diagnosis/report';

export function getStepPath(step) {
  return `/free-diagnosis/survey/${step}`;
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

// 다음 스텝 이후에 남아 있는 문항 수(응답 무관). 1→16, 2→11, 3→9, 4→5, 5→0
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
    (question) => !isAnswered(question.type, answers?.[question.id])
  ).length;
}

export function isStepComplete(step, answers) {
  return getStepUnansweredCount(step, answers) === 0;
}

// '1'~'5' 만 통과. '01' · '1.0' · '1abc' · ' 1' 전부 거부.
export function parseStepParam(raw) {
  return /^[1-5]$/.test(raw ?? '') ? Number(raw) : null;
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
