// 목표관리(/app/goal) 서버 라우트가 공유하는 DB 접근 · 응답 조립 계층.
//
// 이 파일에는 계산 로직이 하나도 없다. 확률·rate·목표시간은 전부
// src/lib/goal/calc/ 의 동결된 순수 함수가 만들고(203개 테스트로 고정),
// 여기서는 그 결과를 DB 컬럼에 옮기고 다시 API 응답 모양으로 되돌리는
// 매핑만 한다.
//
// 스키마 정본: sql/55_goal_management.sql (dev DB 적용 완료 — 운영은 아직 미적용)
// 설계 근거:   docs/figma-goal/goal-schema-design.md §5(DDL) / §7(매핑표) / §9(API 계약)
//
// 세 가지 규약을 여기서 강제한다.
//   1) 소유자 판정은 언제나 세션 토큰에서 얻은 profileId 로만 한다.
//      service_role 클라이언트는 RLS 를 통째로 우회하므로(supabaseAdmin.js:7-8)
//      이 스코프가 유일한 방어선이다. 클라이언트가 보낸 어떤 id 도 쓰지 않는다.
//   2) 현재확률은 저장하지 않는다. 뷰 goal_student_state 가 매번
//      clamp(0,100, base + Σdelta) 로 재계산한다 — 캐시 컬럼을 두면 원본과
//      값이 갈린다(설계 문서 §4 "결정적 근거").
//   3) 응답 필드명은 카멜 케이스다. DB 스네이크를 그대로 노출하지 않는다(§9-2).

import { createSupabaseAdmin } from './supabaseAdmin.js';
import { SERVICE_CONFIGS, clean, getBearerToken, hasPaidServiceAccess } from './serviceAccess.js';
import { kstYMD } from '../../src/lib/goal/calc/index.js';

// ---------------------------------------------------------------------------
// 테이블 · 공통 상수
// ---------------------------------------------------------------------------

export const TABLE_STUDENTS = 'goal_students';
export const TABLE_STATE_VIEW = 'goal_student_state';
export const TABLE_PROBABILITY_LOGS = 'goal_probability_logs';
export const TABLE_UNIVERSITY_CUTS = 'goal_university_cuts';
export const TABLE_TIMER_SESSIONS = 'goal_timer_sessions';
export const TABLE_SUBJECT_TARGETS = 'goal_subject_targets';

// 과목 코드 5종. sql/75_goal_plan_tasks.sql·77_goal_timer_sessions.sql·
// 78_goal_subject_targets.sql이 공유하는 CHECK 도메인과 글자 단위로 같다.
export const TIMER_SUBJECTS = ['korean', 'math', 'english', 'science', 'etc'];

export const SUBJECT_CODE_TO_LABEL = {
  korean: '국어',
  math: '수학',
  english: '영어',
  science: '탐구',
  etc: '기타'
};
export const SUBJECT_LABEL_TO_CODE = Object.fromEntries(
  Object.entries(SUBJECT_CODE_TO_LABEL).map(([code, label]) => [label, code])
);

// create-service-ticket.js:71-73 과 글자 단위로 같은 문구를 쓴다.
export const PAID_MESSAGE = '유료결제이후 이용해주세요!';
export const LOGIN_MESSAGE = '로그인이 필요합니다.';

// 컷 4종의 논리 이름. 422 응답의 missing 배열과 GET 응답의 missingCuts 에 그대로 실린다.
export const CUT_KEYS = ['idealNaesin', 'idealJungsi', 'minNaesin', 'minJungsi'];

// ---------------------------------------------------------------------------
// 값 변환 헬퍼
// ---------------------------------------------------------------------------

/**
 * DB numeric 컬럼 → JS number. null/undefined 는 null 그대로 둔다.
 * PostgREST 는 numeric 을 JSON 숫자로 직렬화하지만, 드라이버·버전에 따라
 * 문자열로 넘어오는 경우를 대비해 한 겹 감싼다. 0 과 null 을 절대 섞지 않는다 —
 * base_* 의 null 은 "확률 미산출"이라는 의미이고 0 과 구분돼야 한다(§5 말미).
 */
export function num(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** date/timestamptz 컬럼 → 'YYYY-MM-DD'. null 은 null. */
export function ymd(value) {
  if (!value) return null;
  return String(value).slice(0, 10);
}

// ---------------------------------------------------------------------------
// 인증 · 이용권 게이트
// ---------------------------------------------------------------------------

/**
 * 세션 검증 + 이용권 판정을 한 번에 수행한다.
 *
 * 원본 외부 앱은 admin 액션 2개를 뺀 전 API 가 무인증이고 `code` 문자열만 알면
 * 타인 데이터를 읽고 썼다. 우리는 그 경로를 아예 만들지 않는다 —
 * profile_id 는 오직 auth.getUser(token).user.id 에서만 나온다
 * (check-service-access.js:45-52 와 동일한 절차, profiles 는 조회하지 않는다).
 *
 * 미결제 처리는 호출자가 정한다 — 쓰기형은 403, 조회형은 200 {allowed:false}
 * 이기 때문이다(§9-1). 여기서는 판정 결과만 돌려준다.
 *
 * @returns {{error?: {status:number, body:object}, supabaseAdmin?:object,
 *            profileId?:string, allowed?:boolean}}
 */
export async function openGoalSession(req) {
  const token = getBearerToken(req);
  if (!token) {
    return { error: { status: 401, body: { detail: LOGIN_MESSAGE } } };
  }

  const supabaseAdmin = createSupabaseAdmin();
  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);

  if (userError || !userData?.user?.id) {
    return { error: { status: 401, body: { detail: LOGIN_MESSAGE } } };
  }

  const profileId = userData.user.id;
  // hasPaidServiceAccess는 { allowed, reason } 을 돌려준다(api/_lib/serviceAccess.js
  // 참고) — 이 함수의 반환 계약(allowed:boolean, 위 JSDoc)을 지키기 위해 여기서
  // 뽑아 쓴다. 객체를 그대로 내려보내면 호출부의 `if (!allowed)` 가 항상
  // false가 되어(객체는 always-truthy) 결제 게이트가 통째로 뚫린다.
  const { allowed } = await hasPaidServiceAccess(supabaseAdmin, profileId, SERVICE_CONFIGS.goal);

  return { supabaseAdmin, profileId, allowed };
}

// ---------------------------------------------------------------------------
// 조회
// ---------------------------------------------------------------------------

/** 학생 마스터 1행. 없으면 null. */
export async function fetchStudentRow(supabaseAdmin, profileId) {
  const { data, error } = await supabaseAdmin
    .from(TABLE_STUDENTS)
    .select('*')
    .eq('profile_id', profileId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

/**
 * 현재확률 뷰 1행. 없으면 null.
 * 뷰는 security_invoker = true 이지만 service_role 은 RLS 를 우회하므로
 * 여기서도 profile_id 스코프가 유일한 소유자 판정이다.
 */
export async function fetchStudentStateRow(supabaseAdmin, profileId) {
  const { data, error } = await supabaseAdmin
    .from(TABLE_STATE_VIEW)
    .select('*')
    .eq('profile_id', profileId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

/**
 * 대학·학과 컷 1건.
 *
 * department 는 널이 아니라 빈 문자열로 매칭한다 — 대학 단위 컷은
 * department_name = '' 로 저장되기 때문이다(§5 goal_university_cuts 주석,
 * 원본 student.mjs:993 `.eq('department', department || '')` 와 같은 규약).
 *
 * 행은 있는데 avg_cut 이 null 이면 "컷 없음"으로 취급한다 — 계산에 쓸 수 없는
 * 값이고, calcNaesinProb 은 이를 확률 0 으로 접어버려(primitives.js:119)
 * 미산출과 구분되지 않기 때문이다.
 *
 * ⚠ 조회는 표시명 3튜플로 한다. 유일성의 정본은 partial UNIQUE
 *   goal_university_cuts_name_key(cut_type, university_name, department_name)
 *   where is_active 다(sql/55_goal_management.sql (4) 인덱스 절) — 조회 술어와
 *   글자 단위로 같다. university_key / department_key 로 조회하지 않는 이유는
 *   온보딩 계약이 표시명만 보내기 때문이다(intake.js validateTarget).
 *
 *   그럼에도 `.order('id').limit(1)` 을 붙인다. 인덱스가 아직 적용되지 않은 DB
 *   (이 sql 은 팀장이 수동 실행한다 — 파일 헤더 5-7행)에서 표시명 중복 2행을
 *   만나면 `.maybeSingle()` 이 PGRST116 을 던지고, 그 예외가 intake.js 최상위
 *   catch 까지 올라가 온보딩 전체가 500 이 된다 — 422 cut_not_found 도 아니고
 *   awaiting_cuts 저장도 못 해 사용자 입력이 통째로 유실된다.
 *   limit(1) 이면 다중행에서도 결정적으로 1건(최소 id)을 골라 그 경로가 사라진다.
 *
 * @returns {number|null}
 */
export async function fetchUniversityCut(supabaseAdmin, cutType, universityName, departmentName) {
  const { data, error } = await supabaseAdmin
    .from(TABLE_UNIVERSITY_CUTS)
    .select('avg_cut')
    .eq('cut_type', cutType)
    .eq('university_name', clean(universityName))
    .eq('department_name', clean(departmentName))
    .eq('is_active', true)
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return num(data?.avg_cut);
}

/**
 * 목표 대학 컷 4종을 한 번에 조회한다.
 *
 * 내신 컷의 cut_type 은 학교 유형에서 나온다(normal|special, getSchoolCutType).
 * 정시 컷은 언제나 'jungsi' 다. 같은 (대학, 학과)가 세 행으로 존재하고 세 행의
 * avg_cut 스케일이 서로 다르다는 점이 이 테이블의 핵심 함정이다(§5 (4) 주석).
 *
 * @returns {{cuts:{idealNaesin:number|null, idealJungsi:number|null,
 *                  minNaesin:number|null, minJungsi:number|null},
 *           missing:string[]}}
 */
export async function fetchTargetCuts(supabaseAdmin, { schoolCutType, ideal, min }) {
  const [idealNaesin, idealJungsi, minNaesin, minJungsi] = await Promise.all([
    fetchUniversityCut(supabaseAdmin, schoolCutType, ideal.university, ideal.department),
    fetchUniversityCut(supabaseAdmin, 'jungsi', ideal.university, ideal.department),
    fetchUniversityCut(supabaseAdmin, schoolCutType, min.university, min.department),
    fetchUniversityCut(supabaseAdmin, 'jungsi', min.university, min.department)
  ]);

  const cuts = { idealNaesin, idealJungsi, minNaesin, minJungsi };
  const missing = CUT_KEYS.filter((key) => cuts[key] === null);

  return { cuts, missing };
}

// ---------------------------------------------------------------------------
// 쓰기
// ---------------------------------------------------------------------------

/** 학생 마스터 upsert(사용자당 1행). 저장된 행을 그대로 돌려준다. */
export async function upsertStudentRow(supabaseAdmin, row) {
  const { data, error } = await supabaseAdmin
    .from(TABLE_STUDENTS)
    .upsert(row, { onConflict: 'profile_id' })
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

/**
 * 확률 스냅샷 append.
 *
 * 원본은 쓰기 액션마다 값 변동 여부와 무관하게 무조건 1행을 쌓아
 * (student.mjs:2601 / 2699 / 3079) 차트에 수평 중복점이 생겼다. 우리는
 * 직전 행과 4값이 전부 같으면 건너뛴다(§8 #15).
 *
 * @param {{idealSusi:number, idealJungsi:number, minSusi:number, minJungsi:number}} probs
 * @param {'intake'|'daily_record'|'score_update'} reason
 * @returns {boolean} 실제로 행을 넣었으면 true
 */
export async function appendProbabilityLog(
  supabaseAdmin,
  profileId,
  probs,
  reason,
  sourceRecordId = null
) {
  const { data: previous, error: readError } = await supabaseAdmin
    .from(TABLE_PROBABILITY_LOGS)
    .select('ideal_susi, ideal_jungsi, min_susi, min_jungsi')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (readError) throw readError;

  if (
    previous &&
    num(previous.ideal_susi) === probs.idealSusi &&
    num(previous.ideal_jungsi) === probs.idealJungsi &&
    num(previous.min_susi) === probs.minSusi &&
    num(previous.min_jungsi) === probs.minJungsi
  ) {
    return false;
  }

  const { error: insertError } = await supabaseAdmin.from(TABLE_PROBABILITY_LOGS).insert({
    profile_id: profileId,
    ideal_susi: probs.idealSusi,
    ideal_jungsi: probs.idealJungsi,
    min_susi: probs.minSusi,
    min_jungsi: probs.minJungsi,
    reason,
    source_record_id: sourceRecordId
  });

  if (insertError) throw insertError;
  return true;
}

// ---------------------------------------------------------------------------
// 응답 조립 (DB 스네이크 → API 카멜)
// ---------------------------------------------------------------------------

/** 저장된 컷 컬럼 기준으로 아직 비어 있는 컷의 논리 이름 목록. */
export function listMissingCuts(row) {
  const stored = {
    idealNaesin: num(row.ideal_naesin_cut),
    idealJungsi: num(row.ideal_jungsi_cut),
    minNaesin: num(row.min_naesin_cut),
    minJungsi: num(row.min_jungsi_cut)
  };
  return CUT_KEYS.filter((key) => stored[key] === null);
}

/** targets 블록. 온보딩 미완료(awaiting_cuts) 응답에도 그대로 실린다. */
export function buildTargets(row) {
  return {
    ideal: {
      university: row.ideal_university || '',
      department: row.ideal_department || '',
      naesinCut: num(row.ideal_naesin_cut),
      jungsiCut: num(row.ideal_jungsi_cut)
    },
    min: {
      university: row.min_university || '',
      department: row.min_department || '',
      naesinCut: num(row.min_naesin_cut),
      jungsiCut: num(row.min_jungsi_cut)
    }
  };
}

/**
 * GET /api/goal/student 의 200 본문(온보딩 완료 학생).
 * POST /api/goal/intake 의 `student` 필드도 완전히 같은 형태다(§9-3).
 *
 * @param {object} row       goal_students 행
 * @param {object} stateRow  goal_student_state 뷰 행
 * @param {string} schoolCutType getSchoolCutType(row.school_type) 결과.
 *   DB 에 저장하지 않고 매번 파생한다(§7-2).
 */
export function buildStudentPayload(row, stateRow, schoolCutType) {
  const state = stateRow || {};

  return {
    onboarded: true,
    status: row.status,
    profile: {
      schoolType: row.school_type,
      grade: row.grade,
      schoolCutType
    },
    targets: buildTargets(row),
    scores: {
      currentScore: num(row.current_score),
      convertedGrade: num(row.converted_grade),
      currentMogo: num(row.current_mogo),
      remainNaesin: num(row.remain_naesin),
      remainMogo: num(row.remain_mogo),
      lastNaesinExam: row.last_naesin_exam || '',
      lastMogoExam: row.last_mogo_exam || ''
    },
    baseProbs: {
      idealSusi: num(row.base_ideal_susi),
      idealJungsi: num(row.base_ideal_jungsi),
      minSusi: num(row.base_min_susi),
      minJungsi: num(row.base_min_jungsi)
    },
    // 파이프라인 반환 키(state.rates.idealSusiBonus)를 그대로 유지한다 —
    // 클라이언트가 state.rates 를 계산 모듈에 되먹일 수 있어야 한다(§7-2).
    rates: {
      idealSusiBonus: num(row.rate_ideal_susi),
      idealJungsiBonus: num(row.rate_ideal_jungsi),
      minSusiBonus: num(row.rate_min_susi),
      minJungsiBonus: num(row.rate_min_jungsi)
    },
    cumulativeBonus: {
      idealSusi: num(state.cum_ideal_susi) ?? 0,
      idealJungsi: num(state.cum_ideal_jungsi) ?? 0,
      minSusi: num(state.cum_min_susi) ?? 0,
      minJungsi: num(state.cum_min_jungsi) ?? 0
    },
    // 저장된 값이 아니라 뷰가 base + Σdelta 로 매번 재계산한 값이다.
    probs: {
      idealSusi: num(state.ideal_susi),
      idealJungsi: num(state.ideal_jungsi),
      minSusi: num(state.min_susi),
      minJungsi: num(state.min_jungsi)
    },
    weeklySchedule: row.study_schedule || {},
    weekIdeal: num(row.week_ideal) ?? 0,
    weekMin: num(row.week_min) ?? 0,
    actualStartDate: ymd(row.actual_start_date),
    recordCount: num(state.record_count) ?? 0,
    lastRecordDate: ymd(state.last_record_date),
    // false 면 UI 는 정시 게이지를 "0%"가 아니라 "데이터 준비 중"으로 그린다.
    // calcJeongsiProb 은 currentMogo <= 0 일 때도 0 을 내므로(pipeline.js:227-228)
    // 이 플래그 없이는 두 상태를 구분할 수 없다(§9-4).
    jungsiAvailable: num(row.ideal_jungsi_cut) !== null && num(row.min_jungsi_cut) !== null
  };
}

/**
 * status='awaiting_cuts' 학생의 200 본문. 확률 필드는 전부 생략한다(§9-4).
 * status 는 리터럴을 박지 않고 행에서 읽는다 — onboarded_at 이 비었는데 상태가
 * awaiting_cuts 가 아닌 행이 생기면 그 사실이 응답에 그대로 드러나야 한다.
 */
export function buildAwaitingCutsPayload(row) {
  return {
    onboarded: false,
    status: row.status,
    targets: buildTargets(row),
    missingCuts: listMissingCuts(row)
  };
}

// ---------------------------------------------------------------------------
// 열공 타이머(#25) — 서버 시각 기반 세션 영속화 + 과목별 목표
//
// 원칙: started_at/ended_at/duration_seconds 는 전부 서버 now() 로만 계산한다.
// 클라이언트가 보낸 시각·초 값은 어디서도 신뢰·저장하지 않는다(sql/77 헤더 배경).
// ---------------------------------------------------------------------------

// 하트비트가 이 시간(ms)보다 오래 끊기면 열린 세션을 서버가 강제 마감한다.
const TIMER_STALE_MS = 5 * 60 * 1000;

/** ended_at - started_at 을 초로, [0, 43200](12시간) 캡 적용해 계산한다. */
function computeTimerDurationSeconds(startedAt, endedAtDate) {
  const seconds = Math.round((endedAtDate.getTime() - new Date(startedAt).getTime()) / 1000);
  return Math.max(0, Math.min(43200, seconds));
}

/** 주어진 KST 날짜(session_date, 'YYYY-MM-DD')의 다음날 00:00(+09:00)을 Date로. */
function nextKstMidnight(sessionDateYmd) {
  const base = new Date(`${sessionDateYmd}T00:00:00+09:00`);
  return new Date(base.getTime() + 24 * 60 * 60 * 1000);
}

/** 학생의 열린(ended_at is null) 세션 1건. 없으면 null. */
async function fetchOpenTimerSession(supabaseAdmin, profileId) {
  const { data, error } = await supabaseAdmin
    .from(TABLE_TIMER_SESSIONS)
    .select('*')
    .eq('profile_id', profileId)
    .is('ended_at', null)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

/** 세션 1건을 지정 시각·사유로 마감한다. duration_seconds 는 서버가 계산한다. */
async function closeTimerSessionRow(supabaseAdmin, row, endedAtDate, endReason) {
  const { data, error } = await supabaseAdmin
    .from(TABLE_TIMER_SESSIONS)
    .update({
      ended_at: endedAtDate.toISOString(),
      duration_seconds: computeTimerDurationSeconds(row.started_at, endedAtDate),
      end_reason: endReason
    })
    .eq('id', row.id)
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

/** 새 세션을 연다. session_date 는 startedAtDate 의 KST 날짜로 서버가 채운다. */
async function insertTimerSession(supabaseAdmin, profileId, subject, startedAtDate) {
  const { data, error } = await supabaseAdmin
    .from(TABLE_TIMER_SESSIONS)
    .insert({
      profile_id: profileId,
      subject,
      session_date: kstYMD(startedAtDate),
      started_at: startedAtDate.toISOString()
    })
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

/**
 * 모든 타이머 진입점(start/stop/heartbeat/GET/setTarget)이 공통으로 먼저 거치는
 * 멱등 정리 2단계.
 *
 *  (a) 자정 분할 — 열린 세션의 session_date 가 오늘(KST)보다 과거면, 날짜
 *      경계마다 그 세션을 다음날 00:00(+09:00)에 'midnight' 마감하고 같은
 *      과목으로 그 시각에 새 세션을 이어 붙인다. 여러 날에 걸쳐 있으면
 *      today 에 닿을 때까지 반복한다.
 *  (b) 스테일 스윕 — (a) 이후 남은 열린 세션의 `now - coalesce(last_heartbeat_at,
 *      started_at)` 이 5분을 넘으면, 그 하트비트/시작 시각으로(=지금이 아니라)
 *      'timeout' 마감한다.
 *
 * @returns 정리 후 남은 열린 세션(없으면 null).
 */
export async function reconcileTimerState(supabaseAdmin, profileId, now = new Date()) {
  let open = await fetchOpenTimerSession(supabaseAdmin, profileId);
  const today = kstYMD(now);

  // 자정을 여러 날 건너뛴 방치 세션도 유한 시간에 끝나도록 상한을 둔다
  // (시계 오류 등으로 session_date 가 미래로 새는 이상 상태에서도 무한루프 방지).
  let guard = 0;
  while (open && open.session_date < today && guard < 400) {
    const midnight = nextKstMidnight(open.session_date);
    await closeTimerSessionRow(supabaseAdmin, open, midnight, 'midnight');
    open = await insertTimerSession(supabaseAdmin, profileId, open.subject, midnight);
    guard += 1;
  }

  if (open) {
    const reference = new Date(open.last_heartbeat_at || open.started_at);
    if (now.getTime() - reference.getTime() > TIMER_STALE_MS) {
      await closeTimerSessionRow(supabaseAdmin, open, reference, 'timeout');
      open = null;
    }
  }

  return open;
}

/**
 * 과목 측정을 시작한다. 열린 세션이 있으면 'switch'로 먼저 마감한다.
 * partial unique index(profile_id) where ended_at is null 위반(23505)은
 * 동시 탭 등으로 그 사이 다른 세션이 열렸다는 뜻이라, 다시 열린 세션을
 * 찾아 마감 후 1회만 재시도한다.
 */
export async function startTimerSession(supabaseAdmin, profileId, subject, now = new Date()) {
  const open = await reconcileTimerState(supabaseAdmin, profileId, now);
  if (open) {
    await closeTimerSessionRow(supabaseAdmin, open, now, 'switch');
  }

  try {
    return await insertTimerSession(supabaseAdmin, profileId, subject, now);
  } catch (error) {
    if (error?.code === '23505') {
      const stillOpen = await fetchOpenTimerSession(supabaseAdmin, profileId);
      if (stillOpen) {
        await closeTimerSessionRow(supabaseAdmin, stillOpen, now, 'switch');
      }
      return await insertTimerSession(supabaseAdmin, profileId, subject, now);
    }
    throw error;
  }
}

/** 열린 세션을 'stop'으로 마감한다. 열린 세션이 없으면 null(멱등, 에러 아님). */
export async function stopTimerSession(supabaseAdmin, profileId, now = new Date()) {
  const open = await reconcileTimerState(supabaseAdmin, profileId, now);
  if (!open) return null;
  return closeTimerSessionRow(supabaseAdmin, open, now, 'stop');
}

/** 열린 세션의 last_heartbeat_at 을 touch 한다. 열린 세션이 없으면 null(무해). */
export async function touchTimerHeartbeat(supabaseAdmin, profileId, now = new Date()) {
  const open = await reconcileTimerState(supabaseAdmin, profileId, now);
  if (!open) return null;

  const { data, error } = await supabaseAdmin
    .from(TABLE_TIMER_SESSIONS)
    .update({ last_heartbeat_at: now.toISOString() })
    .eq('id', open.id)
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

/**
 * GET 응답용 오늘(KST) 요약. reconcile 을 먼저 거친 뒤, 오늘 날짜로 마감된
 * 세션만 과목별로 합산한다 — 진행 중 세션의 경과분은 서버가 더하지 않는다
 * (프론트가 serverNow - startedAt 으로 표시용 라이브 값을 얹는다, 임무 지시
 * 프론트 절 참고).
 */
export async function fetchTimerDaySummary(supabaseAdmin, profileId, now = new Date()) {
  const open = await reconcileTimerState(supabaseAdmin, profileId, now);
  const today = kstYMD(now);

  const { data, error } = await supabaseAdmin
    .from(TABLE_TIMER_SESSIONS)
    .select('subject, duration_seconds')
    .eq('profile_id', profileId)
    .eq('session_date', today)
    .not('ended_at', 'is', null);

  if (error) throw error;

  const bySubject = {};
  for (const row of data || []) {
    bySubject[row.subject] = (bySubject[row.subject] || 0) + (num(row.duration_seconds) ?? 0);
  }

  const subjects = TIMER_SUBJECTS.map((subject) => ({ subject, seconds: bySubject[subject] || 0 }));
  const totalSeconds = subjects.reduce((sum, item) => sum + item.seconds, 0);

  return {
    date: today,
    running: open ? { subject: open.subject, startedAt: open.started_at } : null,
    subjects,
    totalSeconds
  };
}

/** 과목별 목표 시간(설정된 과목만). 미설정 과목은 행 자체가 없다 — 기본값은 프론트 파생. */
export async function fetchSubjectTargets(supabaseAdmin, profileId) {
  const { data, error } = await supabaseAdmin
    .from(TABLE_SUBJECT_TARGETS)
    .select('subject, target_hours')
    .eq('profile_id', profileId);

  if (error) throw error;
  return (data || []).map((row) => ({ subject: row.subject, targetHours: num(row.target_hours) }));
}

/** 과목별 목표 시간 upsert(학생이 타이머 페이지에서 자율 설정). */
export async function upsertSubjectTarget(supabaseAdmin, profileId, subject, targetHours) {
  const { data, error } = await supabaseAdmin
    .from(TABLE_SUBJECT_TARGETS)
    .upsert(
      { profile_id: profileId, subject, target_hours: targetHours },
      { onConflict: 'profile_id,subject' }
    )
    .select('*')
    .single();

  if (error) throw error;
  return { subject: data.subject, targetHours: num(data.target_hours) };
}
