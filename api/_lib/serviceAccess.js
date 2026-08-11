// 이용권(유료 서비스 접근) 판정 — 서버가 유일한 정본이다.
//
// 판정에 쓰는 소스는 두 곳이다: program_access(사실은 DB 함수
// public.fn_program_access_state 경유, sql/64 10)절 — 아래 checkProgramAccessTable
// 참고), enrollments(오프라인 수강, sql/61_offline_enrollment_consolidation.sql).
// orders는 보지 않는다 — orders는 결제 시도/완료 기록이고, "지금 서비스를
// 쓸 수 있는가"는 위 두 소스로만 정해진다. 클라이언트가 orders를 직접 조회해
// 이 규칙을 다시 구현하면(과거 한 차례 그랬다) 서버와 반드시 어긋난다 —
// orders만 있고 program_access/enrollments가 없는 사용자, 혹은 그 반대인
// 사용자가 생기면 양쪽 판정이 갈린다. 그래서 판정 로직은 여기 한 곳에만
// 두고, api/create-service-ticket.js(SSO 티켓 발급), api/check-service-access.js
// (클라이언트 조회용, 읽기 전용), api/_lib/goalRepo.js(목표관리 서버 라우트의
// 세션 게이트)가 함께 쓴다.
//
// target_url·SSO_SECRET·티켓 서명처럼 "티켓 발급" 전용 로직은 여기 없다.
// 그건 api/create-service-ticket.js에 남아 있다 — 접근 판정과는 관심사가
// 다르다(check-service-access.js는 target_url/SSO_SECRET을 아예 요구하지
// 않는다).

export const SERVICE_CONFIGS = {
  suhaeng: {
    service_key: 'suhaeng',
    service_name: 'AI 수행평가 서비스',
    target_url: process.env.SUHAENG_SERVICE_URL,
    payment_keywords: ['수행', '수행평가', 'AI 수행평가', '세특팅'],
    program_keys: ['suhaeng']
  },
  goal: {
    service_key: 'goal',
    service_name: '목표관리 서비스',
    target_url: process.env.GOAL_SERVICE_URL || process.env.TARGET_SERVICE_URL,
    payment_keywords: ['목표', '목표관리', '목표 관리', '학습관리', '학습 관리'],
    // program_keys 는 fn_program_access_state 에 넘길 후보다. 예전엔
    // ['goal', 'target'] 두 값을 다 받아줬다 — products.service_key='goal'
    // 이 program_key로도 그대로 쓰이던 시절의 흔적인데, DB 에 관계가 없어
    // dev 가 실제로 'goal' 로 어긋나 있었다(sql/54_program_access_grant.sql
    // "goal → target 전환" 절). 지금은 sql/60_product_program_relation.sql
    // 이 products.program_key 로 이 관계를 못박아 grantProgramAccessForOrder
    // (api/_lib/programAccess.js)가 goal 상품 결제 시 항상 program_key=
    // 'target' 으로만 쓴다 — 'goal' 로 쓰는 코드 경로가 이제 하나도 없다.
    // 운영 DB(ucjlcvqvinspmrasvsug) 확인상 program_access.program_key=
    // 'goal' 인 행도 이미 없었다(target 2건만 실재, sql/54 동일 절) — 이
    // 관용을 좁혀도 기존 사용자의 앱 진입이 끊기지 않는다(2026-08-11).
    program_keys: ['target']
  }
};

export function clean(value) {
  return String(value || '').trim();
}

function normalizeStatus(value) {
  return clean(value).toLowerCase().replace(/\s/g, '');
}

// enrollments(오프라인 수강) 경로 전용 상태 판정.
//
// program_access 경로는 2026-08-12 부터 이 문자열 판정을 쓰지 않는다 —
// sql/64 10)절 public.fn_program_access_state 가 payment_status·access_status·
// 기간 만료를 한 곳에서 판정한다(아래 checkProgramAccessTable 참고). 여기 남은
// 판정은 enrollments.payment_status 하나뿐인데, 그 컬럼은 어드민이 한국어로
// 자유 입력하는 값이라 CHECK 어휘로 좁힐 수 없어 부분일치 판정이 계속 필요하다.
//
// 부정 상태를 먼저 끊는다 — 판정이 includes(부분일치)라서 그냥 두면
// 'unpaid'.includes('paid') 가 true 가 되어 미납이 결제완료로 통과하고,
// 한글도 '완납예정'.includes('완납'), '결제완료취소'.includes('결제완료'),
// '이용중지'.includes('이용중') 처럼 부정 상태가 긍정으로 잘못 읽힌다.
//
// 2026-08-12 service-access-unify 작업 중 이 목록이 영문 5개 + 한글 4개로
// 좁아져 있던 걸 발견했다(#59 PR 병합 충돌 해소 때 create-service-ticket.js
// 를 인라인화하면서 원래 16개짜리 한글 부정 신호 목록이 실수로 줄었다).
// 원 설계 의도(git show origin/dev:api/_lib/serviceAccess.js 의
// NEGATIVE_STATUS_SIGNALS, dev@eba4c2d 기준)로 복원한다 — 게이트는
// fail-closed 여야 하고, enrollments.payment_status 는 어드민 자유 입력이라
// 부정 신호를 넓게 잡아야 '완납예정'·'이용중지' 같은 함정을 막는다.
//
// '대기'도 그대로 유지한다. enrollments.payment_status 는 orders.status 와
// 별개인 오프라인 수기 입력 축이라 '입금대기'류 표기가 실제로 들어올 수
// 있는데, 대기 상태는 결제완료가 아니므로 거부가 맞는 판정이다(기본값이
// 결제완료로 읽히면 안 된다는 게 원래 의도이기도 하다).
export const DENIED_PAYMENT_STATUSES = [
  'unpaid',
  'refunded',
  'refund',
  'cancelled',
  'canceled',
  '미납',
  '미결제',
  '환불',
  '취소',
  '만료',
  '중지',
  '정지',
  '대기',
  '보류',
  '해지',
  '실패',
  '거절',
  '반려',
  '예정',
  '비활성',
  '비정상'
];

export function isPaidStatus(value) {
  const status = normalizeStatus(value);
  if (DENIED_PAYMENT_STATUSES.some((item) => status.includes(item))) return false;
  return [
    'paid',
    'active',
    '완납',
    '납부완료',
    '결제완료',
    '결제완료됨',
    '결제완료/이용중',
    '이용중'
  ].some((item) => status.includes(item));
}

/** Authorization: Bearer <token> 헤더에서 토큰만 뽑는다. */
export function getBearerToken(req) {
  return clean(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
}

// 입장 판정. 정본은 DB 함수 하나다 — sql/64 10)절
// public.fn_program_access_state(profile_id, program_keys[]).
//
// 왜 SQL 함수로 옮겼는가 (감사 결과 M1)
//   예전 이 함수는 payment_status·access_status 두 컬럼만 읽었다. 즉 **기간
//   만료를 집행하는 코드가 이 저장소에 하나도 없었다** — 1개월권을 산 사람이
//   3년 뒤에도 들어갔다. 만료 판정은 "저장된 만료값 < now()" 라는 시각 비교라
//   DB 에서 하는 것이 맞고(자동 만료 cron 이 없어 판정 시점 계산이 유일한
//   집행 수단이다), 같은 계산을 배포된 소비 함수
//   (public.consume_performance_credit)도 하고 있어 식이 갈리면 게이트와 차감이
//   서로 다른 진실을 갖는다.
//
// 왜 3컬럼(id/user_id/profile_id) 순회를 없앴는가 (M15)
//   sql/64 4)절 program_access_identity_equality_check 가 세 컬럼의 등호를
//   강제하므로 id 단일 조회가 3컬럼 OR 와 **동치임이 제약으로 증명된다.**
//   그리고 PK 가 (id, program_key) 라 program_key 당 최대 1행이다 — 예전
//   구현의 .maybeSingle() 이 다행에서 PGRST116 을 내고 그 에러를
//   `if (error) continue` 가 삼켜 정상 결제자가 로그 0줄로 403 을 맞던 경로가
//   구조적으로 사라진다.
//
// 회차는 여기서 보지 않는다
//   게이트는 기간만 본다. 회차 차감·소진 판정은 소비 지점(배포된
//   consume_performance_credit)이 한다 — "회차 0 + 기간 유효" 상태의 입장
//   허용 여부는 확정 정책에 없는 미결 항목이라, 게이트를 기간 전용으로 두어
//   현행 동작을 바꾸지 않는다.
export async function checkProgramAccessTable(supabaseAdmin, userId, config) {
  const { data, error } = await supabaseAdmin.rpc('fn_program_access_state', {
    p_profile_id: userId,
    p_program_keys: config.program_keys
  });

  if (error) {
    // 에러를 삼키지 않는다. 예전 `if (error) continue` 는 판정 실패를 "권한
    // 없음"과 구별하지 않아, 결제자가 로그 한 줄 없이 403 을 맞았다. 로그를
    // 남기고 fail-closed 한다 — 판정할 수 없으면 열지 않는다(돈이 걸린 판단은
    // 되돌릴 수 있는 쪽으로).
    console.error('fn_program_access_state 호출 실패:', config.service_key, userId, error);
    return { allowed: false, reason: null };
  }

  const rows = Array.isArray(data) ? data : [];
  if (rows.some((row) => row.allowed === true)) return { allowed: true, reason: null };

  // 거부 사유를 남긴다. 만료(period_expired)와 미결제(not_paid)는 사용자에게
  // 다른 상태다 — 만료면 EXPIRED_MESSAGE, 그 외(미결제 등)는 PAID_MESSAGE 로
  // 호출부(handler)가 갈라 응답한다.
  for (const row of rows) {
    console.warn(
      'program_access denied:',
      config.service_key,
      row.program_key,
      row.reason,
      row.expires_at ?? 'unlimited'
    );
  }
  const expired = rows.some((row) => row.reason === 'period_expired');
  return { allowed: false, reason: expired ? 'period_expired' : null };
}

export async function checkEnrollmentPayment(supabaseAdmin, userId, config) {
  // sql/61_offline_enrollment_consolidation.sql — 예전엔 admin_enrollments 를
  // 조회했는데, 어드민이 실제로 수강생을 등록하는 테이블(src/pages/Admin.jsx
  // 'enrollments' config)과 달라 정상 등록한 오프라인 수강생이 앱에 절대
  // 못 들어가는 구조였다. 판정에 쓰는 7개 컬럼(id/profile_id/category_name/
  // program_name/class_name/payment_status/application_status)은 두 테이블에
  // 이름이 전부 동일해 컬럼명 치환 없이 테이블만 바꿨다(판정 로직은 그대로).
  const { data, error } = await supabaseAdmin
    .from('enrollments')
    .select('id, profile_id, category_name, program_name, class_name, payment_status, application_status')
    .eq('profile_id', userId)
    .limit(100);

  if (error) {
    throw error;
  }

  return (data || []).some((row) => {
    const nameText = [row.category_name, row.program_name, row.class_name]
      .map((value) => clean(value))
      .join(' ');

    const serviceMatched = config.payment_keywords.some((keyword) => nameText.includes(keyword));
    return serviceMatched && isPaidStatus(row.payment_status);
  });
}

// ---------------------------------------------------------------------------
// 로컬 QA 전용 이용권 게이트 우회 (DEV_BYPASS_ENTITLEMENT)
// ---------------------------------------------------------------------------
// 클라이언트의 VITE_FAKE_ENTITLEMENT(src/lib/entitlement.js)는 진입 가드만
// 통과시킬 뿐 서버는 전혀 모른다 — api/performance/* 8곳이 그대로
// hasPaidServiceAccess()로 403을 낸다. 이 함수는 그 서버 쪽 우회다.
//
// ⚠️ 안전장치 3중, 전부 필수:
//   ① process.env.VERCEL_ENV === 'production' → 무조건 거부.
//      Vercel이 배포 시 주입하는 값이라 앱 코드가 위조할 수 없다.
//   ② process.env.NODE_ENV === 'production' → 무조건 거부.
//   ③ 위 둘을 통과해도 DEV_BYPASS_ENTITLEMENT가 정확히 'true' 문자열일
//      때만 활성. VITE_ 접두어를 쓰지 않는다 — Vite가 그 접두어를 클라이언트
//      번들에 심는데, 이 값은 서버 전용이라 번들에 들어가면 의미가 뒤집힌다.
// 우회가 실제로 발동하면 매 호출마다 console.warn으로 남긴다 — 지금 우회
// 중이라는 사실이 로그에서 즉시 보여야 한다.
//
// ⚠️ **범위: 수행평가 전용이 아니다.** 이 플래그는 hasPaidServiceAccess()의 최상단에
//    걸려 있어 SERVICE_CONFIGS의 **모든 서비스**(suhaeng뿐 아니라 goal/target 등)와
//    이 함수를 쓰는 모든 라우트(create-service-ticket·check-service-access 포함)의
//    유료 판정을 함께 우회한다. 도입 맥락은 수행평가 로컬 QA였지만 효력은 전역이다 —
//    로컬에서 켜 두면 목표관리 SSO 티켓도 미결제 계정에서 발급된다.
//    범위를 좁혀야 하면 우회 발동을 config.service_key === 'suhaeng'으로 한정하면 된다.
export function isDevEntitlementBypassEnabled() {
  if (process.env.VERCEL_ENV === 'production') return false;
  if (process.env.NODE_ENV === 'production') return false;
  return process.env.DEV_BYPASS_ENTITLEMENT === 'true';
}

// 우회가 발동했을 때 consume_performance_credit RPC까지 통과시키기 위해
// program_access 행을 만든다. 그 RPC는 행이 없으면 no_entitlement를
// 돌려주지만, 행만 있고 meta.quota_total이 없으면 무제한으로 폴백한다
// (sql/54_performance_app.sql (4) 단계 4, "P15 전 임시 동작" 경고 로그와 함께).
// 그래서 meta는 절대 채우지 않는다 — quota_total을 설정하면 오히려
// 소진 취급될 수 있다.
//
// ⚠️ 이미 행이 있으면 손대지 않는다(실결제 데이터를 덮어쓰면 안 된다).
//    삽입 실패는 치명적이지 않다 — 실패해도 진입 우회(반환값 true) 자체는
//    유지하고 로그만 남긴다. 이 함수는 isDevEntitlementBypassEnabled()가
//    true인 경로에서만 호출된다 — 그 자체가 이미 3중 안전장치를 통과한
//    뒤이므로 여기서 다시 검사하지 않는다.
export async function ensureDevProgramAccessRow(supabaseAdmin, userId, config) {
  try {
    const programKey = config.program_keys[0];

    const { data: existing, error: selectError } = await supabaseAdmin
      .from('program_access')
      .select('id')
      .in('program_key', config.program_keys)
      .or(`id.eq.${userId},profile_id.eq.${userId},user_id.eq.${userId}`)
      .limit(1)
      .maybeSingle();

    if (selectError) {
      console.warn(
        `[serviceAccess] DEV_BYPASS_ENTITLEMENT: program_access 조회 실패(무시, 우회는 유지) — ${selectError.message}`
      );
      return;
    }

    if (existing) return; // 기존 행(실결제 포함) 보존 — 덮어쓰지 않는다.

    const { error: insertError } = await supabaseAdmin.from('program_access').insert({
      id: userId,
      program_key: programKey,
      payment_status: 'paid',
      access_status: 'active',
      memo: '[DEV_BYPASS_ENTITLEMENT] 로컬 QA 우회로 자동 생성된 행. meta.quota_total 미설정 → 차감 RPC가 무제한으로 폴백.'
    });

    if (insertError) {
      console.warn(
        `[serviceAccess] DEV_BYPASS_ENTITLEMENT: program_access 자동 생성 실패(무시, 우회는 유지) — ${insertError.message}`
      );
      return;
    }

    console.warn(
      `[serviceAccess] DEV_BYPASS_ENTITLEMENT: program_access 행 자동 생성 (user=${userId}, program_key=${programKey})`
    );
  } catch (error) {
    console.warn('[serviceAccess] DEV_BYPASS_ENTITLEMENT: program_access 자동 생성 중 예외(무시, 우회는 유지)', error);
  }
}

export async function hasPaidServiceAccess(supabaseAdmin, userId, config) {
  if (isDevEntitlementBypassEnabled()) {
    console.warn(
      `[serviceAccess] ⚠️ DEV_BYPASS_ENTITLEMENT 활성 — '${config.service_key}' 이용권 판정을 우회합니다 (user=${userId}). ` +
        'VERCEL_ENV/NODE_ENV가 production이면 이 경로는 절대 타지 않습니다.'
    );
    await ensureDevProgramAccessRow(supabaseAdmin, userId, config);
    return true;
  }

  const byProgramAccess = await checkProgramAccessTable(supabaseAdmin, userId, config);
  if (byProgramAccess.allowed) return { allowed: true, reason: null };

  // ⚠ 이 경로는 기간 만료를 집행하지 않는다. enrollments(오프라인 수강)에는
  //    기간 컬럼이 0개라 만료 개념 자체가 없어서, 이 OR 분기로 들어온 사용자는
  //    영구 입장이 성립한다. dev 실측 0행이라 현재 미발현이지만 구조적 구멍이다.
  //    오프라인 수강의 기간 정책은 미결 항목이며 이번 범위 밖이다
  //    (sql/64 파일 말미 "남겨 둔 것" 참고).
  const byEnrollment = await checkEnrollmentPayment(supabaseAdmin, userId, config);
  if (byEnrollment) return { allowed: true, reason: null };

  // program_access 쪽 판정이 만료였다면 enrollments 는 그 사유를 뒤집지 못한다
  // (enrollments 는 애초에 만료 개념이 없다) — program_access 의 reason 을 그대로 쓴다.
  return { allowed: false, reason: byProgramAccess.reason };
}

// ---------------------------------------------------------------------------
// 회차(quota) 스냅샷 — 안내용 읽기 전용
// ---------------------------------------------------------------------------
// 이 아래 두 함수는 **판정(allowed)에 관여하지 않는다.** 이용권 보유 여부는
// 위의 hasPaidServiceAccess()가 그대로 정본이고, 여기서 읽는 것은 화면에
// "남은 횟수 N회"를 표시하기 위한 부가 정보다.
//
// ⚠️ 실제 차감·차단 권위는 여기가 아니라 `public.consume_performance_credit`
//    RPC(부여 원장 `program_access_grants` 기반, checkout-renewal 브랜치가
//    sql/64~66에서 재작성)다. 그 RPC는 프로필 단위 advisory lock 을 잡은 뒤
//    살아있는 부여(`revoked_at is null and (expires_at is null or expires_at
//    > now())`)를 `for update`로 잠그고, 원장 INSERT 성공 시에만 소비를 기록한다.
//    이 함수는 잠그지 않고 `public.fn_program_access_grants_summary` RPC로
//    다시 계산된 값을 읽기만 하므로, 반환한 잔여 회차는 읽은 순간의 값일
//    뿐이며 다른 탭·기기가 동시에 차감하면 즉시 낡는다(TOCTOU).
//    클라이언트는 이 값을 안내에만 쓰고, 차단 여부는 차감 RPC를 감싼
//    api/performance/* 응답(409 QUOTA_EXHAUSTED)으로 판단해야 한다
//    (명세서 §2.2 「클라이언트 판정은 항상 안내용」, §9.3).
//
// ⚠️ `program_access.meta`의 `quota_total`/`quota_used` 키는 물리적으로
//    삭제됐다(checkout-renewal). 거기 남아 있던 값은 만료된 부여 회차까지
//    합산한 틀린 값이라 더 이상 읽지 않는다. `access_expires_at`/`expires_at`
//    컬럼도 표시·호환 전용 미러로 강등됐으므로(컬럼 코멘트 「정본 아님」)
//    회차·만료 판정에는 쓰지 않는다 — 대신 `fn_program_access_grants_summary`가
//    `program_access_grants` 원장에서 매번 다시 계산한 값을 쓴다.

/**
 * 이용권 행 1건을 찾는다. 컬럼 우선순위(id → profile_id → user_id)는
 * checkProgramAccessTable() 및 consume_performance_credit RPC와 동일하게
 * 맞춘다 — 서로 다른 행을 잡으면 표시값과 차감 대상이 어긋난다.
 *
 * 정렬 1순위는 **행의 유효성(statusRank)** 이다. 한 회원에게 stale한 행과
 * 살아 있는 행이 함께 있을 수 있기 때문이다 — 예: 환불된 옛 행
 * (`payment_status='refunded'`)이 남은 채 어드민 경로로 재결제한 사용자.
 * 유효성을 보지 않으면 그 사용자는 셸에서 엉뚱한 program_key/만료 미러를
 * 보게 된다.
 *
 * 이 함수가 반환하는 행 자체에는 더 이상 회차 정보(meta.quota_total 등)가
 * 없다 — 여기서 얻는 것은 표시용 program_key·plan_label(meta)·상태값뿐이고,
 * 실제 회차는 readQuotaSnapshot()이 이 행의 program_key로
 * fn_program_access_grants_summary RPC를 불러 별도로 얻는다.
 *
 * 여러 program_key(goal은 ['goal','target'])를 가진 서비스는 앞선 키에
 * 매칭된 행을 우선한다(SERVICE_CONFIGS의 배열 순서가 곧 우선순위다).
 *
 * @returns {Promise<object|null>} program_access 행 또는 null
 */
export async function findProgramAccessRow(supabaseAdmin, userId, config) {
  const { data, error } = await supabaseAdmin
    .from('program_access')
    .select(
      'id, program_key, profile_id, user_id, payment_status, access_status, meta, access_expires_at, expires_at, updated_at, created_at'
    )
    .in('program_key', config.program_keys)
    .or(`id.eq.${userId},profile_id.eq.${userId},user_id.eq.${userId}`)
    .limit(20);

  if (error || !data?.length) return null;

  // 유효한 행(0)을 만료·환불·정지된 행(1)보다 앞에 둔다. 판정 기준은 진입
  // 게이트(checkProgramAccessTable)와 같은 isPaidStatus/isActiveStatus에
  // 기간 만료를 더한 것이다 — 게이트가 통과시킨 행이 여기서 뒤로 밀리지
  // 않도록 같은 술어를 쓴다.
  const statusRank = (row) => {
    const endsAt = row.access_expires_at || row.expires_at || null;
    const expired = endsAt ? new Date(endsAt).getTime() <= Date.now() : false;
    return isPaidStatus(row.payment_status) && isActiveStatus(row.access_status) && !expired ? 0 : 1;
  };
  const columnRank = (row) => {
    if (row.id === userId) return 0;
    if (row.profile_id === userId) return 1;
    return 2;
  };
  const keyRank = (row) => {
    const index = config.program_keys.indexOf(row.program_key);
    return index === -1 ? config.program_keys.length : index;
  };
  const freshness = (row) => new Date(row.updated_at || row.created_at || 0).getTime();

  const sorted = [...data].sort(
    (a, b) =>
      statusRank(a) - statusRank(b) ||
      keyRank(a) - keyRank(b) ||
      columnRank(a) - columnRank(b) ||
      freshness(b) - freshness(a)
  );

  return sorted[0] || null;
}

/** meta 값이 정수 문자열/숫자일 때만 정수로 읽는다. 아니면 fallback. */
function readIntOrNull(value, fallback = null) {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value === 'string' && /^-?[0-9]+$/.test(value.trim())) return parseInt(value, 10);
  return fallback;
}

/**
 * program_access 행 + `public.fn_program_access_grants_summary` RPC에서
 * 회차·플랜 정보를 뽑는다.
 *
 * 정본은 더 이상 `program_access.meta`가 아니라 `program_access_grants`
 * 원장이다(checkout-renewal). 그 원장을 매번 다시 집계해 주는 것이
 * `fn_program_access_grants_summary(p_profile_id, p_program_key)`이고,
 * 실제 확인한 반환 컬럼은 다음과 같다(2026-08-12, dev DB 직접 조회):
 *
 *   live_count        int   — revoked_at is null 이고 만료되지 않은(expires_at
 *                             is null or > now()) 부여 개수
 *   quota_total       int|null — 위 살아있는 부여들의 granted_sessions 합.
 *                             그중 하나라도 granted_sessions가 null(=회차
 *                             무제한)이면 전체가 null. **살아있는 부여가
 *                             하나도 없어도(live_count=0) SQL 집계 특성상
 *                             null로 나온다** — 이 null은 "무제한"이 아니라
 *                             "정보 없음/소진"이므로 live_count로 갈라야 한다.
 *   quota_used        int   — 살아있는 부여에 걸린 원장(performance_credit_
 *                             ledger) 소비량 합. never null(coalesce(...,0)).
 *   expires_at         ts|null — revoked_at is null인 **모든**(만료된 것 포함)
 *                             부여 중 하나라도 expires_at이 null(=기간 무기한)
 *                             이면 전체 null, 아니면 그 중 최댓값.
 *   unlimited_period   bool  — 위와 같은 집합에서 expires_at is null이 하나라도
 *                             있으면 true. **quota_total 계산과 모수(母數)가
 *                             다르다** — 이쪽은 만료된 부여도 포함한다.
 *   unlimited_sessions bool  — quota_total과 같은 모수(살아있는 부여만)에서
 *                             granted_sessions is null이 하나라도 있으면 true.
 *                             live_count=0이면 항상 false(coalesce 기본값).
 *
 * `quota_remaining`은 이 함수가 반환하지 않는다 — 여기서
 * `max(quota_total - quota_used, 0)`으로 직접 계산한다.
 *
 * 표시용 quotaTotal 산출 규칙(unlimited_sessions와 quota_total=null의
 * 모호성을 없애기 위해 live_count로 명시적으로 가른다):
 *   unlimited_sessions === true  →  null(무제한 표시)
 *   live_count === 0             →  0(살아있는 부여가 없다 = 소진/미보유 표시)
 *   그 외                        →  quota_total 그대로(양수)
 *
 * planEndsAt은 `access_expires_at`/`expires_at` 미러(표시·호환 전용, 정본
 * 아님) 대신 summary의 `expires_at`을 쓴다 — unlimited_period가 true인 경우
 * 이미 함수 안에서 null로 떨어지므로 별도 분기가 필요 없다.
 *
 * ⚠️ RPC 실패(함수 부재 포함 — checkout-renewal이 아직 push 전 브랜치라
 *    운영/다른 개발자 DB에는 없을 수 있다)는 **throw하지 않는다.** 이 값은
 *    판정 권위가 아니라 안내 표시용이라, 실패는 "정보 없음"(전부 null)으로
 *    흡수하고 경고 로그만 남긴다 — 여기서 던지면 표시용 정보 하나 때문에
 *    라우트 전체가 죽는다.
 *
 * planLabel은 여전히 program_access.meta.plan_label 계열에서 읽는다(원장에는
 * 상품명 개념이 없다) — 채워주는 파이프라인이 없으면 null이 정상값이다.
 *
 * @param {object} supabaseAdmin - service-role Supabase 클라이언트
 * @param {string} userId - RPC의 p_profile_id로 그대로 넘기는 값. 호출부가
 *   hasPaidServiceAccess/consume_performance_credit에 넘기는 것과 동일한
 *   auth user id다(program_access_grants.profile_id가 이 값을 직접 참조).
 * @param {object|null} row - findProgramAccessRow()가 찾은 program_access 행.
 *   null이면 이용권 행 자체가 없다는 뜻이라 RPC를 부르지 않고 즉시
 *   "정보 없음"을 반환한다(기존 계약과 동일).
 */
export async function readQuotaSnapshot(supabaseAdmin, userId, row) {
  if (!row) {
    // 이용권 행이 없다(= admin_enrollments 경로로만 통과했거나 미보유).
    // 회차 개념이 붙을 자리가 없으므로 전부 null = "정보 없음"이다.
    // null을 0으로 내리면 무제한 사용자가 소진으로 보인다.
    return { quotaTotal: null, quotaUsed: null, quotaRemaining: null, planEndsAt: null, planLabel: null };
  }

  const meta = row.meta && typeof row.meta === 'object' ? row.meta : {};
  const planLabelRaw = meta.plan_label ?? meta.planLabel ?? meta.plan_name ?? null;
  const planLabel = clean(planLabelRaw) || null;

  try {
    const { data, error } = await supabaseAdmin.rpc('fn_program_access_grants_summary', {
      p_profile_id: userId,
      p_program_key: row.program_key
    });

    if (error) throw error;

    const summary = Array.isArray(data) ? data[0] : data;
    if (!summary) {
      return { quotaTotal: null, quotaUsed: null, quotaRemaining: null, planEndsAt: null, planLabel };
    }

    const liveCount = readIntOrNull(summary.live_count, 0) ?? 0;
    const unlimitedSessions = summary.unlimited_sessions === true;

    let quotaTotal;
    if (unlimitedSessions) {
      quotaTotal = null;
    } else if (liveCount === 0) {
      quotaTotal = 0; // 살아있는 부여가 없다 — "정보 없음"이 아니라 "소진/미보유"다.
    } else {
      quotaTotal = readIntOrNull(summary.quota_total, 0);
      if (quotaTotal < 0) quotaTotal = 0;
    }

    let quotaUsed = readIntOrNull(summary.quota_used, 0);
    if (quotaUsed === null || quotaUsed < 0) quotaUsed = 0;

    const quotaRemaining = quotaTotal === null ? null : Math.max(quotaTotal - quotaUsed, 0);

    return {
      quotaTotal,
      quotaUsed,
      quotaRemaining,
      planEndsAt: summary.expires_at || null,
      planLabel
    };
  } catch (error) {
    console.warn(
      `[serviceAccess] fn_program_access_grants_summary 호출 실패 — 회차 표시를 "정보 없음"으로 흡수합니다` +
        `(판정에는 영향 없음. program_key=${row.program_key}, user=${userId})`,
      error?.message || error
    );
    return { quotaTotal: null, quotaUsed: null, quotaRemaining: null, planEndsAt: null, planLabel };
  }
}
