// POST /api/performance/session
// Authorization: Bearer <supabase access token>
//
// 명세서 §8.6 엔드포인트 표 계약:
//   { action:'create'|'resume', basicInfo? }
//   → 201 { session, quotaRemaining }
//   → 403 { error:{code:'NO_ENTITLEMENT', ...} }
//   → 409 { error:{code:'UNCHARGED_SESSION_EXISTS', ...}, sessionId }  (§9.3)
//
// ── 이 파일이 다루는 것 (STEP1 폼 제출 = 세션 생성)
//    §5.5 BasicInfoForm 제출 한 번이 곧 세션 생성 한 번이다. `basicInfo`가 실려 오면
//    5필수 필드(학년·학기·교과군·과목·희망 진로)를 전부 검증하고 한 트랜잭션처럼
//    (단일 insert) 채워 넣는다 — 부분 필드로 세션을 만들지 않는다.
//
// ── school_type 신뢰 경계 (Q61-ⓔ)
//    요청 바디에서 school_type을 **읽지 않는다.** 클라이언트가 그 키를 보내더라도
//    이 핸들러는 애초에 `basicInfo` 중 정해진 6개 키만 꺼내 쓰므로 무시된다.
//    서버가 `profiles.school_type`을 조회해 세션 시점 스냅샷으로만 채운다.
//
// ── 미차감 세션 동시 1개 제한 (§9.3, §8.6 이 엔드포인트 자체의 문서화된 실패 코드)
//    `performance_credit_ledger`에 행이 없는(=아직 회차를 소비하지 않은) 세션은
//    프로필당 최대 1개다. `action:'create'`가 그 상태에서 또 만들려 하면
//    `409 UNCHARGED_SESSION_EXISTS{sessionId}`로 막는다. 이 판정은 §8.6 엔드포인트
//    표가 **이 엔드포인트 자신의 실패 코드**로 이미 명시했으므로 P6(이 파일) 범위다 —
//    반면 `consume_performance_credit` RPC를 통한 실제 차감 배선(주제 추천 성공 시)은
//    P8/P15 몫이고 이 파일은 건드리지 않는다. 여기서 하는 일은 차감이 아니라
//    "차감 전 세션이 이미 있는가"를 확인하는 존재 조회뿐이다.
//
//    `action:'resume'`는 그 유일한 미차감 세션을 이어받는다 — 별도 sessionId를
//    받지 않는다(프로필당 최대 1개이므로 서버가 스스로 찾을 수 있다). `basicInfo`가
//    함께 오면 그 세션의 STEP1 값을 갱신한다(폼을 다시 제출한 경우). 미차감 세션이
//    아예 없는데 resume을 부르면 `404 NO_UNCHARGED_SESSION`을 돌려준다 — §8.6이
//    이 경우의 코드를 명시하지 않아 다른 엔드포인트의 404 관례를 그대로 따른 판단이다.
//
// ── current_step / completed_steps
//    STEP1 제출 성공 = STEP1 완료이므로 `completed_steps`에 1을 더하고
//    `current_step`을 2로 올린다(§8.3 컬럼 정의, 5단계 상한은 스키마 체크 제약이 보장).
//    `basicInfo` 없이 만드는 빈 draft(§8.6 `basicInfo?`가 선택인 이유 — 다른 진입
//    경로가 먼저 빈 세션을 잡아둘 수 있다는 계약)는 1/빈 배열 그대로 둔다. resume에서
//    기존 진행이 이미 2보다 앞서 있으면 되돌리지 않는다(뒤로 가지 않는다).
//
// ── 회차는 차감하지 않는다 (§9.3 "세션 생성 | 없음")
//    quotaRemaining은 안내용 스냅샷으로만 응답에 싣는다.

import { createSupabaseAdmin } from '../_lib/supabaseAdmin.js';
import {
  SERVICE_CONFIGS,
  findProgramAccessRow,
  getBearerToken,
  hasPaidServiceAccess,
  readQuotaSnapshot
} from '../_lib/serviceAccess.js';

const SERVICE_KEY = 'suhaeng';

// 미차감 후보로 볼 상태. completed/archived는 이미 끝났거나 사용자가 치운 세션이라
// "진행 중 미차감"의 대상이 아니다(bootstrap.js RESUMABLE_STATUSES와 같은 축).
const UNCHARGED_CANDIDATE_STATUSES = ['draft', 'in_progress'];

const REQUIRED_BASIC_INFO_FIELDS = ['gradeLabel', 'semester', 'subjectGroup', 'subject', 'careerGoal'];

const SESSION_COLUMNS = [
  'id',
  'status',
  'current_step',
  'completed_steps',
  'grade_label',
  'semester',
  'school_type',
  'subject_group',
  'subject',
  'career_goal',
  'previous_topic',
  'created_at',
  'updated_at'
].join(',');

function fail(res, status, code, message, extra) {
  return res.status(status).json({ error: { code, message }, ...extra });
}

function toClientSession(row) {
  return {
    id: row.id,
    status: row.status,
    currentStep: row.current_step,
    completedSteps: Array.isArray(row.completed_steps) ? row.completed_steps : [],
    gradeLabel: row.grade_label,
    semester: row.semester,
    schoolType: row.school_type,
    subjectGroup: row.subject_group,
    subject: row.subject,
    careerGoal: row.career_goal,
    previousTopic: row.previous_topic,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

/**
 * `basicInfo`를 검증하고 DB 컬럼명으로 정규화한다. **`school_type`은 여기서 절대
 * 읽지 않는다** — 이 함수가 꺼내는 키는 아래 6개가 전부이며, 그 외 클라이언트가
 * 무엇을 보내든 무시된다(신뢰 경계, Q61-ⓔ).
 */
function normalizeBasicInfo(raw) {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, code: 'INVALID_BASIC_INFO' };
  }

  const clean = {};
  for (const key of ['gradeLabel', 'semester', 'subjectGroup', 'subject', 'careerGoal', 'previousTopic']) {
    const value = raw[key];
    clean[key] = typeof value === 'string' ? value.trim() : '';
  }

  for (const field of REQUIRED_BASIC_INFO_FIELDS) {
    if (!clean[field]) {
      return { ok: false, code: 'MISSING_FIELD', field };
    }
  }

  return {
    ok: true,
    columns: {
      grade_label: clean.gradeLabel,
      semester: clean.semester,
      subject_group: clean.subjectGroup,
      subject: clean.subject,
      career_goal: clean.careerGoal,
      // 프롬프트 기본값 '없음'은 애플리케이션(추천 프롬프트) 레이어의 몫이다(§8.3) —
      // 여기서는 미입력을 있는 그대로 null로 저장한다.
      previous_topic: clean.previousTopic || null
    }
  };
}

/**
 * 이 프로필의 미차감 세션(있다면 정확히 1개)을 찾는다. PostgREST에 anti-join이
 * 없어 후보 세션을 먼저 뽑고 원장에 있는 session_id를 빼는 두 단계로 판정한다
 * (bootstrap.js `latestDraftRow`와 동일한 패턴).
 */
async function findUnchargedSession(supabaseAdmin, userId) {
  const { data: sessionRows, error: sessionError } = await supabaseAdmin
    .from('performance_sessions')
    .select(SESSION_COLUMNS)
    .eq('profile_id', userId)
    .in('status', UNCHARGED_CANDIDATE_STATUSES)
    .order('updated_at', { ascending: false });

  if (sessionError) throw new Error(`세션 조회 실패: ${sessionError.message}`);

  const rows = sessionRows || [];
  if (!rows.length) return null;

  const ids = rows.map((row) => row.id);
  const { data: ledgerRows, error: ledgerError } = await supabaseAdmin
    .from('performance_credit_ledger')
    .select('session_id')
    .eq('profile_id', userId)
    .in('session_id', ids);

  if (ledgerError) throw new Error(`회차 원장 조회 실패: ${ledgerError.message}`);

  const chargedIds = new Set((ledgerRows || []).map((row) => row.session_id));
  return rows.find((row) => !chargedIds.has(row.id)) || null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return fail(res, 405, 'METHOD_NOT_ALLOWED', 'POST만 허용됩니다.');
  }

  res.setHeader('Cache-Control', 'no-store');

  let supabaseAdmin;
  try {
    supabaseAdmin = createSupabaseAdmin();
  } catch (error) {
    console.error('performance/session 설정 오류:', error);
    return fail(res, 500, 'INTERNAL', '서버 설정이 올바르지 않습니다.');
  }

  try {
    const token = getBearerToken(req);
    if (!token) {
      return fail(res, 401, 'UNAUTHENTICATED', '로그인이 필요합니다.');
    }

    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !userData?.user?.id) {
      return fail(res, 401, 'UNAUTHENTICATED', '로그인이 필요합니다.');
    }

    const userId = userData.user.id;
    const serviceConfig = SERVICE_CONFIGS[SERVICE_KEY];

    // ── 이용권 재판정. §8.6 공통 규약 — 클라이언트 가드 통과 여부를 신뢰하지 않는다.
    const { allowed: hasAccess } = await hasPaidServiceAccess(supabaseAdmin, userId, serviceConfig);
    if (!hasAccess) {
      return fail(res, 403, 'NO_ENTITLEMENT', '유료 이용권을 결제하신 뒤 이용할 수 있습니다.');
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const action = body.action;
    if (action !== 'create' && action !== 'resume') {
      return fail(res, 400, 'INVALID_ACTION', "action은 'create' 또는 'resume'이어야 합니다.");
    }

    let basicInfo = null;
    if (body.basicInfo !== undefined && body.basicInfo !== null) {
      const result = normalizeBasicInfo(body.basicInfo);
      if (!result.ok) {
        if (result.code === 'MISSING_FIELD') {
          return fail(res, 400, 'MISSING_FIELD', `${result.field}은(는) 필수입니다.`, {
            field: result.field
          });
        }
        return fail(res, 400, 'INVALID_BASIC_INFO', 'basicInfo 형식이 올바르지 않습니다.');
      }
      basicInfo = result.columns;
    }

    // ── 회차 스냅샷. 세션 생성/재개는 차감하지 않으므로(§9.3) 안내용으로만 싣는다.
    let quota = await readQuotaSnapshot(supabaseAdmin, userId, null);
    try {
      quota = await readQuotaSnapshot(
        supabaseAdmin,
        userId,
        await findProgramAccessRow(supabaseAdmin, userId, serviceConfig)
      );
    } catch (quotaError) {
      console.error('performance/session quota lookup 실패(무시):', quotaError);
    }

    const unchargedSession = await findUnchargedSession(supabaseAdmin, userId);

    if (action === 'create') {
      // §9.3 「미차감 세션 동시 1개 제한」 — §8.6이 이 엔드포인트 자신의 실패 코드로
      // 문서화했으므로 여기서 막는다(차감 로직 자체는 건드리지 않는다, 파일 상단 주석).
      if (unchargedSession) {
        return fail(
          res,
          409,
          'UNCHARGED_SESSION_EXISTS',
          '이미 진행 중인 미차감 세션이 있습니다. 이어서 진행하거나 폐기한 뒤 다시 시작해 주세요.',
          { sessionId: unchargedSession.id }
        );
      }

      // school_type — 요청 바디를 절대 읽지 않는다. profiles 스냅샷만 신뢰한다(Q61-ⓔ).
      const { data: profileRow, error: profileError } = await supabaseAdmin
        .from('profiles')
        .select('school_type')
        .eq('id', userId)
        .maybeSingle();

      if (profileError) throw new Error(`프로필 조회 실패: ${profileError.message}`);

      const insertRow = {
        profile_id: userId,
        school_type: profileRow?.school_type || null,
        status: basicInfo ? 'in_progress' : 'draft',
        current_step: basicInfo ? 2 : 1,
        completed_steps: basicInfo ? [1] : []
      };
      if (basicInfo) Object.assign(insertRow, basicInfo);

      const { data: created, error: insertError } = await supabaseAdmin
        .from('performance_sessions')
        .insert(insertRow)
        .select(SESSION_COLUMNS)
        .single();

      if (insertError) throw new Error(`세션 생성 실패: ${insertError.message}`);

      return res.status(201).json({
        session: toClientSession(created),
        quotaRemaining: quota.quotaRemaining
      });
    }

    // action === 'resume' — 프로필당 하나뿐인 미차감 세션을 이어받는다(sessionId를
    // 요청에서 받지 않는다, 파일 상단 주석).
    if (!unchargedSession) {
      return fail(res, 404, 'NO_UNCHARGED_SESSION', '이어받을 미차감 세션이 없습니다.');
    }

    let resultRow = unchargedSession;

    if (basicInfo) {
      const completed = new Set(
        Array.isArray(unchargedSession.completed_steps) ? unchargedSession.completed_steps : []
      );
      completed.add(1);

      const patch = {
        ...basicInfo,
        status: unchargedSession.status === 'draft' ? 'in_progress' : unchargedSession.status,
        // 이미 더 앞서 있는 세션을 되돌리지 않는다 — STEP1을 다시 제출해도 최소 2까지만 올린다.
        current_step: Math.max(unchargedSession.current_step || 1, 2),
        completed_steps: Array.from(completed).sort((a, b) => a - b)
      };

      const { data: updated, error: updateError } = await supabaseAdmin
        .from('performance_sessions')
        .update(patch)
        .eq('id', unchargedSession.id)
        .select(SESSION_COLUMNS)
        .single();

      if (updateError) throw new Error(`세션 갱신 실패: ${updateError.message}`);
      resultRow = updated;
    }

    return res.status(201).json({
      session: toClientSession(resultRow),
      quotaRemaining: quota.quotaRemaining
    });
  } catch (error) {
    // 원 예외 메시지를 응답에 싣지 않는다(§8.6 공통 규약 「실패 응답」).
    console.error('performance/session error:', error);
    return fail(res, 500, 'INTERNAL', '세션 처리에 실패했습니다.');
  }
}
