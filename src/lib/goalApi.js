// GET /api/goal/student · POST /api/goal/intake · /api/goal/plan-tasks(CRUD) 공용 클라이언트.
//
// src/lib/entitlement.js의 hasEntitlement()와 같은 패턴(세션 조회 → 세션 없으면 조기
// 반환 → fetch → 안전한 JSON 파싱 → 상태코드 분기)을 따른다. entitlement.js는 참고만
// 하고 수정하지 않는다 — 이 파일은 그 패턴을 목표관리 API 두 엔드포인트에 맞춰
// 새로 구현한 것이다(공유 코드 추출은 하지 않는다 — 두 파일이 다루는 엔드포인트·응답
// 모양이 달라 무리하게 합치면 오히려 각 파일의 분기 로직이 서로의 사정을 끌어안게 된다).
//
// 두 함수 모두 예외를 던지지 않는다 — 실패도 반환값(discriminated union)으로 표현한다.
// 호출부(goalOnboarding.js, RequireGoalAccess.jsx, Onboarding.jsx, 이후 대시보드)는
// `kind` 필드로 분기한다. 원본 서버 응답에도 `status` 필드가 있어(§goal-schema-design
// row.status: 'active' | 'awaiting_cuts') 이름이 겹치면 혼동되므로, 이 래퍼의 판별자는
// 의도적으로 `status`가 아니라 `kind`로 둔다.

import { supabase } from './supabase';

/**
 * 현재 세션을 조회해 Authorization 헤더를 만든다.
 * 세션이 없으면 null을 반환한다 — 호출부는 이를 즉시 '세션 없음'으로 처리해야 한다.
 */
async function getAuthHeader() {
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData?.session;
  if (!session?.user || !session?.access_token) return null;

  return { Authorization: `Bearer ${session.access_token}` };
}

/** 응답 본문을 안전하게 JSON으로 파싱한다 — 파싱 실패는 빈 객체로 접는다. */
async function parseJsonSafe(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// fetchGoalStudent — GET /api/goal/student
// ---------------------------------------------------------------------------
//
// 반환 계약(discriminated union, `kind` 필드로 분기). 이후 대시보드 배선 단계가 이
// 함수를 그대로 재사용하므로 shape을 안정적으로 유지한다.
//
//   { kind: 'no-session' }
//     — 세션 자체가 없거나(로컬 판정) 서버가 401을 준 경우. 호출부는 /login으로
//       보내거나 로그인 필요 UI를 그린다.
//
//   { kind: 'error' }
//     — 판정 불가: 네트워크 오류, JSON 파싱 실패, 5xx, 405, 예상 밖 상태코드 등.
//       hasEntitlement()의 null과 동일한 의미 — 절대 'not-onboarded'/'not-allowed'로
//       단정해 리다이렉트하지 말 것. 재시도 UI로 연결해야 한다.
//
//   { kind: 'not-allowed' }
//     — 200 {allowed:false}. 이용권 없음.
//
//   { kind: 'not-onboarded' }
//     — 200 {onboarded:false} (status 필드 없음). 온보딩 시도 자체가 없음.
//
//   { kind: 'awaiting-cuts', status, targets, missingCuts }
//     — 200 {onboarded:false, status:'awaiting_cuts', targets, missingCuts}.
//       제출은 완료했으나 목표 대학 컷 데이터가 없어 확률이 아직 산출되지 않음.
//       status는 서버 원문 문자열을 그대로 싣는다('awaiting_cuts').
//
//   { kind: 'onboarded', student }
//     — 200 {onboarded:true, ...}. student는 api/_lib/goalRepo.js의
//       buildStudentPayload() 반환 객체 전체를 그대로 담는다:
//       { onboarded, status, profile:{schoolType,grade,schoolCutType},
//         targets, scores, baseProbs, rates, cumulativeBonus, probs,
//         weeklySchedule, weekIdeal, weekMin, actualStartDate, recordCount,
//         lastRecordDate, jungsiAvailable }
export async function fetchGoalStudent() {
  const authHeader = await getAuthHeader();
  if (!authHeader) return { kind: 'no-session' };

  let response;
  try {
    response = await fetch('/api/goal/student', {
      method: 'GET',
      headers: authHeader
    });
  } catch (error) {
    console.error('[goalApi] GET /api/goal/student 호출 오류:', error);
    return { kind: 'error' };
  }

  if (response.status === 401) return { kind: 'no-session' };

  if (!response.ok) {
    console.error('[goalApi] GET /api/goal/student 실패:', response.status);
    return { kind: 'error' };
  }

  const body = await parseJsonSafe(response);

  if (body?.allowed === false) return { kind: 'not-allowed' };

  if (body?.onboarded === true) {
    return { kind: 'onboarded', student: body };
  }

  if (body?.onboarded === false) {
    if (body.status === 'awaiting_cuts') {
      return {
        kind: 'awaiting-cuts',
        status: body.status,
        targets: body.targets,
        missingCuts: body.missingCuts
      };
    }
    return { kind: 'not-onboarded' };
  }

  // 예상 밖 응답 모양 — 판정 불가로 접는다.
  console.error('[goalApi] GET /api/goal/student 예상 밖 응답 모양:', body);
  return { kind: 'error' };
}

// ---------------------------------------------------------------------------
// submitGoalIntake — POST /api/goal/intake
// ---------------------------------------------------------------------------
//
// 반환 계약(discriminated union, `kind` 필드로 분기):
//
//   { kind: 'no-session' }             — 401. /login으로.
//   { kind: 'not-allowed' }            — 403. /pricing?service=goal로.
//   { kind: 'success', student }       — 200. student = buildStudentPayload() 전체
//                                         (fetchGoalStudent의 kind:'onboarded'.student와 동일 모양).
//   { kind: 'already-onboarded' }      — 409 reason:'already_onboarded'. 성공과 동일하게 취급.
//   { kind: 'cuts-missing', missing }  — 422 reason:'cut_not_found'. 입력은 서버에 이미
//                                         저장됨(status='awaiting_cuts') — 온보딩 화면에 머무르되
//                                         계산 오버레이는 띄우지 않는다.
//   { kind: 'validation-error', detail } — 400. 정상 경로에선 나오지 않아야 하는 방어적 분기.
//   { kind: 'error' }                  — 500 / 네트워크 오류 / 예상 밖 상태코드. 재시도 가능,
//                                         입력을 지우지 않는다.
export async function submitGoalIntake(body) {
  const authHeader = await getAuthHeader();
  if (!authHeader) return { kind: 'no-session' };

  let response;
  try {
    response = await fetch('/api/goal/intake', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader
      },
      body: JSON.stringify(body)
    });
  } catch (error) {
    console.error('[goalApi] POST /api/goal/intake 호출 오류:', error);
    return { kind: 'error' };
  }

  const result = await parseJsonSafe(response);

  if (response.status === 200) {
    return { kind: 'success', student: result?.student };
  }

  if (response.status === 409) return { kind: 'already-onboarded' };

  if (response.status === 422) {
    return { kind: 'cuts-missing', missing: result?.missing };
  }

  if (response.status === 400) {
    return { kind: 'validation-error', detail: result?.detail };
  }

  if (response.status === 401) return { kind: 'no-session' };
  if (response.status === 403) return { kind: 'not-allowed' };

  console.error('[goalApi] POST /api/goal/intake 실패:', response.status, result?.detail);
  return { kind: 'error' };
}

// ---------------------------------------------------------------------------
// 학습 계획 과제(goal_plan_tasks) — GET/POST/PUT/DELETE /api/goal/plan-tasks
// ---------------------------------------------------------------------------
//
// 네 함수 모두 fetchGoalStudent/submitGoalIntake와 같은 규약(예외를 던지지
// 않고 discriminated union으로 반환, `kind` 필드로 분기)을 따른다.
//
// task shape(camelCase, api/_lib/goalRepo.js buildPlanTaskPayload와 동일):
//   { id, planDate, title, subject, durationMinutes, done, sortOrder }
//   subject는 한글 라벨('국어'/'수학'/'영어'/'탐구'/'기타') — 서버가 DB 코드와
//   왕복 변환하므로 클라이언트는 항상 이 라벨만 다룬다(AddTaskModal 과목 칩과 동일).

/** 공용 요청 실행기 — 인증 헤더 부착 + JSON 직렬화 + 안전 파싱까지 4개 함수가 공유. */
async function requestPlanTasks(method, { query, body } = {}) {
  const authHeader = await getAuthHeader();
  if (!authHeader) return { kind: 'no-session' };

  const qs = query ? `?${new URLSearchParams(query).toString()}` : '';

  let response;
  try {
    response = await fetch(`/api/goal/plan-tasks${qs}`, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...authHeader
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
  } catch (error) {
    console.error(`[goalApi] ${method} /api/goal/plan-tasks 호출 오류:`, error);
    return { kind: 'error' };
  }

  const result = await parseJsonSafe(response);

  if (response.status === 401) return { kind: 'no-session' };
  if (response.status === 403) return { kind: 'not-allowed' };
  if (response.status === 404) return { kind: 'not-found' };
  if (response.status === 400) return { kind: 'validation-error', detail: result?.detail };

  if (!response.ok) {
    console.error(`[goalApi] ${method} /api/goal/plan-tasks 실패:`, response.status, result?.detail);
    return { kind: 'error' };
  }

  return { kind: 'success', body: result };
}

/**
 * 기간(from~to, YYYY-MM-DD, 양끝 포함) 과제 목록.
 *   { kind: 'success', tasks }  — 200 {ok:true, tasks:[...]}.
 *   { kind: 'not-allowed' }     — 200 {allowed:false}. 이용권 없음(조회형 규약).
 *   그 외 kind는 requestPlanTasks 공통 계약(no-session/validation-error/error).
 */
export async function fetchGoalPlanTasks({ from, to }) {
  const result = await requestPlanTasks('GET', { query: { from, to } });
  if (result.kind !== 'success') return result;
  if (result.body?.allowed === false) return { kind: 'not-allowed' };
  return { kind: 'success', tasks: result.body?.tasks || [] };
}

/** 과제 1건 생성. 성공 시 { kind:'success', task }. */
export async function createGoalPlanTask({ planDate, title, subject, durationMinutes }) {
  const result = await requestPlanTasks('POST', { body: { planDate, title, subject, durationMinutes } });
  if (result.kind !== 'success') return result;
  return { kind: 'success', task: result.body?.task };
}

/** 과제 1건 부분 수정(완료 토글 포함). patch에 있는 필드만 반영된다. */
export async function updateGoalPlanTask(id, patch) {
  const result = await requestPlanTasks('PUT', { body: { id, ...patch } });
  if (result.kind !== 'success') return result;
  return { kind: 'success', task: result.body?.task };
}

/** 과제 1건 삭제. */
export async function deleteGoalPlanTask(id) {
  const result = await requestPlanTasks('DELETE', { body: { id } });
  if (result.kind !== 'success') return result;
  return { kind: 'success' };
}
