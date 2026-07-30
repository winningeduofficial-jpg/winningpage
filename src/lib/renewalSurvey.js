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

// 시안 하단 배너 값. 응답 수와 무관한 정적 파생치다.
// 1→16, 2→11, 3→9, 4→5, 5→0
export function getRemainingAfterStep(step) {
  return surveyMainQuestions.filter((question) => question.page > step).length;
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
