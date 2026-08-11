/**
 * 설문 응답 → DiagnosisInput 영속화 (§7.4.2 — 설문과 리포트를 잇는 유일한 경로).
 *
 * 저장 주체(설문 셸의 제출 핸들러)와 읽기 주체(리포트 페이지)가 다른 파일이라 키·직렬화 규칙을
 * 한 모듈에 모은다. **정의처는 여기 하나뿐이다.**
 *
 * diagnosisReport.js 가 아니라 별도 모듈인 이유: 설문 번들이 제출 한 번을 위해 문구집(50KB)과
 * 리포트 인쇄 CSS 까지 끌고 오게 된다. 여기는 채점 엔진(normalizeAnswers)만 의존한다.
 *
 * React 를 import 하지 않는다. window 접근은 전부 try/catch 로 감싼다 —
 * 프라이빗 모드·용량 초과에서 sessionStorage 가 던지면 제출 버튼이 통째로 죽는다.
 */
import { normalizeAnswers } from './diagnosisScoring.js';
import { SCHEMA_VERSION } from '../data/diagnosisScoringTable.js';

/** sessionStorage 키. 새로고침·직접 URL 진입에서도 같은 리포트가 나오게 하는 유일한 근거다. */
export const DIAGNOSIS_INPUT_STORAGE_KEY = 'winning.freeDiagnosis.input';

/**
 * 원시 answers → DiagnosisInput 로 정규화해 저장하고 그 값을 돌려준다.
 *
 * 라우터 state 로도 함께 넘기기 위해 반환값을 쓴다 — state 만으로는 새로고침에서 사라지고,
 * sessionStorage 만으로는 프라이빗 모드에서 사라진다. 두 경로를 모두 채워야 실사용에서 안 끊긴다.
 *
 * @param {Record<string, any>} answers 설문 셸이 들고 있는 원시 응답
 * @param {{ name?: string|null, admissionCuts?: object|null, admissionMeta?: object|null }} [options]
 *   name 은 로그인 학생 이름(Q-01, 익명이면 undefined/null). admissionCuts/admissionMeta 는 B-1 —
 *   스텝5 캐스케이드가 이미 조회해 둔 입결 컷이다(리포트 페이지가 다시 조회하지 않도록 여기 싣는다).
 *   둘 다 DiagnosisInput 스펙(§3) 밖의 필드라 normalizeAnswers 결과에 얹지 않고 저장 payload에만
 *   sibling 으로 붙인다 — buildReport(input, ctx) 호출부(FreeDiagnosisReport)가 ctx 를 여기서 꺼낸다.
 * @returns {object} 저장된 payload (저장 실패와 무관하게 항상 유효한 객체)
 */
export function submitDiagnosisAnswers(answers, options = {}) {
  const { name = null, admissionCuts = null, admissionMeta = null } = options;
  // 시각은 여기서 찍는다 — 엔진은 순수 함수라 시계를 읽지 않는다(같은 입력이 매번 같은 리포트를 내야 한다).
  const input = normalizeAnswers(answers, { diagnosedAt: new Date().toISOString(), name });
  const payload = admissionCuts || admissionMeta ? { ...input, admissionCuts, admissionMeta } : input;
  saveDiagnosisInput(payload);
  return payload;
}

/** 저장. 실패해도 던지지 않는다 — 라우터 state 경로가 살아 있어 리포트는 그대로 렌더된다. */
export function saveDiagnosisInput(input) {
  try {
    window.sessionStorage.setItem(DIAGNOSIS_INPUT_STORAGE_KEY, JSON.stringify(input));
    return true;
  } catch {
    return false;
  }
}

/**
 * 라우터 state → sessionStorage 순으로 DiagnosisInput 을 읽는다.
 *
 * 스키마 버전이 다른 페이로드는 복원하지 않고 버린다 — 리커트 저장 키 승격(서수 → LK1_nn)과
 * q5·q7 삭제가 겹쳐 있어 구 버전 응답을 그대로 채점하면 전 영역이 결측으로 조용히 오채점된다.
 *
 * @param {any} [locationState] useLocation().state
 * @returns {object|null} 검증을 통과한 DiagnosisInput, 없으면 null
 */
export function loadDiagnosisInput(locationState) {
  const fromRouter = locationState?.diagnosisInput;
  if (fromRouter?.meta?.schemaVersion === SCHEMA_VERSION) return fromRouter;

  try {
    const raw = window.sessionStorage.getItem(DIAGNOSIS_INPUT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.meta?.schemaVersion === SCHEMA_VERSION ? parsed : null;
  } catch {
    // 프라이빗 모드·손상된 JSON — 폴백 경로로 떨어뜨린다. 리포트를 흰 화면으로 만들지 않는다.
    return null;
  }
}
