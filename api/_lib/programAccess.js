// 결제 확정 시 이용 권한(program_access)을 부여/회수하는 공용 모듈.
//
// 왜 별도 파일인가
//   부여 지점이 두 곳이다. 카드·간편결제는 api/confirm-payment.js 가 승인 직후
//   주문을 paid 로 확정할 때, 가상계좌는 api/toss-webhook.js 가 입금을 확인해
//   waiting_deposit → paid 로 전이할 때다. 같은 로직을 두 벌 두면 한쪽만
//   고쳐지는 사고가 나므로 여기로 모은다(api/_lib/supabaseAdmin.js 주석의
//   "신규 파일부터는 여기로 모은다" 방침).
//
// 부여만 있으면 손실이 난다 — 회수도 여기 둔다
//   즉시 입장은 "돈이 들어오면 즉시 열린다"는 뜻이고, 그 대칭인 "돈을 돌려주면
//   즉시 닫힌다"가 없으면 전액 환불받은 사용자가 무기한 이용한다. 판정부
//   (api/create-service-ticket.js)는 payment_status·access_status 만 보고
//   orders.status 를 보지 않으므로, 주문을 canceled 로 바꾸는 것만으로는 입장이
//   막히지 않는다. 그래서 revokeProgramAccessForOrder 를 같은 모듈에 둔다.
//
// 누가 무엇을 샀는지는 order_items 에서 읽는다
//   api/create-order.js:146-156 이 결제 시점에 product_id·service_key·name 을
//   모두 기록하므로, order_id 하나로 구매 상품군(service_key)을 복원할 수 있다.
//   orders 에는 상품 정보가 없다(order_name 문자열뿐).
//
// 정본 컬럼 = program_access.id
//   PK 는 (id, program_key) 이고 id 만 NOT NULL 이다(sql/00_base_schema.sql:
//   818-838). FK 도 id → profiles(id) 뿐이고(:1042), 유일한 RLS 정책
//   program_access_select_own 이 auth.uid() = id (:2056)다. 즉 "사용자"의 정본은
//   id 다. profile_id·user_id 는 FK 없는 비정규화 컬럼이지만 부분 unique
//   인덱스(:1092)가 걸려 있고 기존 리더(api/create-service-ticket.js:98 이
//   id/user_id/profile_id 3개를 순회한다)가 어느 컬럼이든 찾으므로, 정합을 위해
//   같은 uuid 를 세 컬럼에 함께 넣는다.
//   profiles.id = auth.users.id (:1040) 이고 orders.user_id 도 auth.users.id
//   (sql/10_pricing_orders.sql:47)라 조인 없이 orders.user_id 를 그대로 쓴다.
//
// 만료(기간)는 채우지 않는다 — 근거가 없다
//   products 에 개월·회차 컬럼이 없고(sql/10_pricing_orders.sql:9-24),
//   program_access 의 기간 컬럼은 두 쌍(access_started_at/access_expires_at,
//   starts_at/expires_at)이 중복 존재하는데 어느 쪽도 읽는 코드가 없어 정본을
//   코드로 판정할 수 없다. 상품명 문자열로 개월을 추측하면(예: '[3개월 6회
//   이용권]') 어드민이 문구를 고치는 순간 만료일이 틀어진다
//   (sql/52_pricing_susi_restore.sql 이 susi-30 라벨을 '12개월 30회'→'3회'로
//   정정한 선례). 그래서 "시작 시각"만 두 쌍에 함께 기록하고 만료는 비워 둔다.
//   → 만료 정책·회차 차감은 미확정 항목이다.

function clean(value) {
  return String(value ?? '').trim();
}

// products.service_key → program_access.program_key
//
// 코드가 근거를 갖는 매핑만 넣는다. api/create-service-ticket.js:7-22 의
// SERVICE_CONFIGS 가 아는 서비스는 suhaeng·goal 2건뿐이고(goal 은 program_keys
// ['goal','target'] 를 순회하므로 'goal' 만 부여하면 판정에 걸린다), 프런트
// src/lib/paidServiceAccess.js:5 도 같은 2건만 입장시킨다.
// susi·mentor·diagnose 는 program_key 도 입장할 앱(target_url)도 없어서 여기
// 넣으면 존재하지 않는 programs 행을 참조해 FK 위반이 된다 → 매핑에서 제외하고
// skipped 로 보고한다.
export const SERVICE_KEY_TO_PROGRAM_KEY = {
  goal: 'goal',
  suhaeng: 'suhaeng'
};

export function mapServiceKeyToProgramKey(serviceKey) {
  return SERVICE_KEY_TO_PROGRAM_KEY[clean(serviceKey)] || '';
}

// 회수된 행의 payment_status. CHECK 값(unpaid|pending|paid|refunded|cancelled)
// 중 "돈을 돌려줬다" = refunded, "돈이 들어온 적 없이 종결" = cancelled 다.
const REVOKED_PAYMENT_STATUSES = ['refunded', 'cancelled'];

// 주문 하나에서 "무엇을 샀는지"를 복원한다. 부여·회수가 같은 대상 집합을 봐야
// 하므로(회수가 부여보다 좁으면 권한이 남는다) 매핑 로직을 여기 한 곳에 둔다.
async function readOrderPrograms(supabaseAdmin, orderId) {
  const { data: items, error } = await supabaseAdmin
    .from('order_items')
    .select('product_id, service_key, name, price, quantity')
    .eq('order_id', orderId);

  if (error) throw error;

  const serviceKeys = [];
  const skipped = [];
  // 같은 program_key 를 가리키는 라인이 여러 개면(예: 목표관리 1개월 + 3개월
  // 동시 구매) 결제 금액만 합산한다. 기간 합산은 근거가 없어 하지 않는다.
  const paidAmountByProgram = new Map();

  for (const item of items || []) {
    const serviceKey = clean(item.service_key);
    if (serviceKey && !serviceKeys.includes(serviceKey)) {
      serviceKeys.push(serviceKey);
    }

    const programKey = mapServiceKeyToProgramKey(serviceKey);
    if (!programKey) {
      skipped.push({
        service_key: serviceKey || null,
        product_id: clean(item.product_id) || null,
        reason: 'no_program_key_mapping'
      });
      continue;
    }

    const lineAmount = Number(item.price || 0) * Number(item.quantity || 1);
    const prev = paidAmountByProgram.get(programKey) || 0;
    paidAmountByProgram.set(programKey, prev + (Number.isFinite(lineAmount) ? lineAmount : 0));
  }

  return { count: (items || []).length, serviceKeys, skipped, paidAmountByProgram };
}

/**
 * 주문 하나에 대해 이용 권한을 부여한다. **호출자가 "돈이 들어왔다"를 확인한
 * 뒤에만** 부를 것(가상계좌 waiting_deposit 에서는 부르면 안 된다).
 *
 * 절대 throw 하지 않는다. 결제 승인은 이미 났으므로 부여 실패가 승인 흐름을
 * 되돌리면 안 되고, 대신 결과 객체로 실패 사실을 돌려준다(호출자가 로그 +
 * 응답에 노출).
 *
 * @param {object} options
 * @param {boolean} [options.restoreRevoked=false]
 *        회수된 행(payment_status refunded|cancelled)까지 되살릴지. **새 결제가
 *        방금 승인된 경로에서만 true** 다(재구매는 되살아나야 한다). 멱등 재응답·
 *        웹훅 재전송 같은 "재시도" 경로는 false — 그 경로는 새 돈이 들어온 근거가
 *        없으므로 환불 회수를 되돌릴 권한이 없다. 부여는 복구용이지 제재 해제용이
 *        아니다.
 *        access_status='suspended'(운영자 제재)는 어느 경로에서도 덮지 않는다 —
 *        해제는 운영자의 판단이고, 결제로 자동 해제되면 제재가 무력화된다.
 *
 * @returns {{ok:boolean, granted:string[], serviceKeys:string[],
 *            skipped:{service_key:?string,product_id:?string,reason:string}[],
 *            error:?string}}
 *          ok=true 는 "부여 시도가 에러 없이 끝났다"는 뜻이다. 매핑되는 상품이
 *          없으면 ok=true + granted=[] + skipped 에 이유가 담긴다.
 */
export async function grantProgramAccessForOrder(
  supabaseAdmin,
  { orderId, userId, paidAt, restoreRevoked = false } = {}
) {
  const result = { ok: false, granted: [], serviceKeys: [], skipped: [], error: null };

  if (!supabaseAdmin) {
    // confirm-payment.js 의 createSupabaseAdmin() 은 env 누락 시 null 을 주고도
    // 결제 승인을 계속 진행한다. 그 상태를 조용히 넘기지 않고 드러낸다.
    result.error = 'supabase_admin_unavailable';
    return result;
  }
  if (!clean(orderId)) {
    result.error = 'missing_order_id';
    return result;
  }

  const accessId = clean(userId);
  if (!accessId) {
    // 비회원 결제(api/create-order.js:115-122)는 orders.user_id 가 null 이라
    // 권한을 줄 대상이 없다. 운영자 수동 처리 대상.
    result.error = 'order_has_no_user';
    return result;
  }

  try {
    const { count, serviceKeys, skipped, paidAmountByProgram } = await readOrderPrograms(
      supabaseAdmin,
      orderId
    );
    result.serviceKeys = serviceKeys;
    result.skipped = skipped;

    if (count === 0) {
      result.error = 'no_order_items';
      return result;
    }

    if (paidAmountByProgram.size === 0) {
      // 부여할 게 없다(입장 가능한 앱이 없는 상품만 산 경우). 에러는 아니다.
      result.ok = true;
      return result;
    }

    // 제재·회수된 행을 자동 부여가 되살리지 못하게 먼저 현재 상태를 읽는다.
    // upsert 는 지정한 컬럼을 무조건 덮으므로(아래 onConflict) 이 select 없이는
    // 인증 없는 재시도 한 번으로 suspended·refunded 가 paid/active 로 복원된다.
    const { data: existingRows, error: existingError } = await supabaseAdmin
      .from('program_access')
      .select('program_key, payment_status, access_status')
      .eq('id', accessId)
      .in('program_key', [...paidAmountByProgram.keys()]);

    if (existingError) throw existingError;

    const existingByKey = new Map((existingRows || []).map((row) => [row.program_key, row]));

    for (const programKey of [...paidAmountByProgram.keys()]) {
      const existing = existingByKey.get(programKey);
      if (!existing) continue;

      if (clean(existing.access_status) === 'suspended') {
        result.skipped.push({
          service_key: null,
          product_id: null,
          program_key: programKey,
          reason: 'suspended_by_admin'
        });
        paidAmountByProgram.delete(programKey);
        continue;
      }

      if (!restoreRevoked && REVOKED_PAYMENT_STATUSES.includes(clean(existing.payment_status))) {
        result.skipped.push({
          service_key: null,
          product_id: null,
          program_key: programKey,
          reason: 'revoked_not_restored'
        });
        paidAmountByProgram.delete(programKey);
      }
      // inactive·expired 는 보호하지 않는다 — 운영자가 결제 전에 미리 만들어 둔
      // unpaid/inactive 행일 수 있고, 회수는 payment_status 를 함께 바꾸므로
      // (revokeProgramAccessForOrder) 위 검사만으로 회수 행이 걸러진다.
    }

    if (paidAmountByProgram.size === 0) {
      // 살아 있는 대상이 전부 보호 상태였다. 부여 시도는 정상 종료다(운영자 판단
      // 대상이므로 결제 흐름을 실패로 만들지 않고 skipped 로만 알린다).
      result.ok = true;
      return result;
    }

    // 즉시 입장이므로 이용 시작 = 입금 확인 시각(orders.paid_at)이다.
    const startedAt = clean(paidAt) || new Date().toISOString();
    const now = new Date().toISOString();

    const rows = [...paidAmountByProgram.entries()].map(([programKey, paidAmount]) => ({
      id: accessId,
      program_key: programKey,
      payment_status: 'paid', // CHECK: unpaid|pending|paid|refunded|cancelled
      access_status: 'active', // CHECK: inactive|active|expired|suspended
      paid_amount: paidAmount,
      paid_at: startedAt,
      // 기간 컬럼 두 쌍 중 어느 쪽이 정본인지 판정 불가 → 시작 시각은 양쪽에
      // 같이 쓴다. 만료(access_expires_at / expires_at)는 건드리지 않는다.
      access_started_at: startedAt,
      starts_at: startedAt,
      profile_id: accessId,
      user_id: accessId,
      // program_access 에 updated_at 트리거가 없어(sql/00_base_schema.sql 에
      // 해당 트리거 없음) 직접 찍는다.
      updated_at: now
    }));

    // onConflict 는 PK 그대로 (id, program_key). 같은 서비스를 재구매하면 이
    // 행을 덮어쓴다 — "연장"이 아니다(만료 정책 미확정과 함께 남은 항목).
    // 멱등하므로 성공 페이지 새로고침·웹훅 재시도로 여러 번 불려도 안전하다.
    // 단 "무조건 덮어쓴다"가 위험한 두 상태(suspended / 회수됨)는 위에서 이미
    // 대상에서 빠졌다 — 여기 도달한 행은 덮어써도 되는 행이다.
    const { data: upserted, error: upsertError } = await supabaseAdmin
      .from('program_access')
      .upsert(rows, { onConflict: 'id,program_key' })
      .select('program_key');

    if (upsertError) throw upsertError;

    result.granted = (upserted || []).map((row) => row.program_key);
    result.ok = true;
    return result;
  } catch (err) {
    result.error = String(err?.message ?? err);
    return result;
  }
}

/**
 * 주문 하나에 대해 이용 권한을 회수한다. 결제가 취소·환불·만료로 종결된 뒤에만
 * 부를 것. 부여와 대칭이며(같은 order_items → program_key 매핑) 절대 throw 하지
 * 않는다.
 *
 * insert 하지 않는다 — 회수는 "이미 있는 권한을 닫는" 동작이다. 부여된 적이
 * 없으면(가상계좌 미입금 EXPIRED, 매핑 없는 상품만 산 주문) update 0행으로
 * 멱등하게 끝난다. 여기서 insert 하면 존재하지 않던 권한 행을 취소 이력으로
 * 만들어 내고, program_key FK(sql/53_program_access_grant.sql) 위반 위험만 늘린다.
 *
 * 판정부가 왜 이 두 컬럼이면 막히는가
 *   api/create-service-ticket.js:111 이 payment_status·access_status 만 본다.
 *   orders.status='canceled' 는 보지 않으므로 주문만 취소해서는 입장이 막히지
 *   않는다. 그래서 두 컬럼을 함께 내린다.
 *
 * @param {object} options
 * @param {string} options.orderId
 * @param {?string} options.userId  주문자(orders.user_id). 없으면 회수 대상 없음.
 * @param {'refunded'|'cancelled'} [options.paymentStatus='refunded']
 *        돈을 돌려준 취소는 refunded, 입금된 적 없이 종결된 건(미입금 만료·승인 전
 *        취소)은 cancelled. CHECK 허용값이다(sql/00_base_schema.sql:836).
 *
 * @returns {{ok:boolean, revoked:string[], serviceKeys:string[],
 *            skipped:{...}[], error:?string}}
 */
export async function revokeProgramAccessForOrder(
  supabaseAdmin,
  { orderId, userId, paymentStatus = 'refunded' } = {}
) {
  const result = { ok: false, revoked: [], serviceKeys: [], skipped: [], error: null };

  if (!supabaseAdmin) {
    result.error = 'supabase_admin_unavailable';
    return result;
  }
  if (!clean(orderId)) {
    result.error = 'missing_order_id';
    return result;
  }

  const accessId = clean(userId);
  if (!accessId) {
    // 비회원 결제는 부여된 적이 없으니 회수할 것도 없다(부여 측 order_has_no_user
    // 와 같은 이유). 에러가 아니라 no-op 이다.
    result.ok = true;
    result.skipped.push({ reason: 'order_has_no_user' });
    return result;
  }

  const nextPaymentStatus = REVOKED_PAYMENT_STATUSES.includes(clean(paymentStatus))
    ? clean(paymentStatus)
    : 'refunded';

  try {
    const { serviceKeys, skipped, paidAmountByProgram } = await readOrderPrograms(
      supabaseAdmin,
      orderId
    );
    result.serviceKeys = serviceKeys;
    result.skipped = skipped;

    const programKeys = [...paidAmountByProgram.keys()];
    if (programKeys.length === 0) {
      // 입장 앱이 없는 상품만 산 주문 → 부여된 권한이 없다.
      result.ok = true;
      return result;
    }

    // 정본 컬럼은 id 다(모듈 상단 주석). 부여 시 profile_id·user_id 에 같은 uuid
    // 를 함께 넣으므로 id 조건 하나로 부여된 행 전체가 잡힌다.
    // access_status 는 suspended 였더라도 inactive 로 내린다 — 둘 다 판정부에서
    // 거부되므로 권한상 손실이 없고, 회수 사실(payment_status)이 더 중요한 이력이다.
    const { data: updated, error: updateError } = await supabaseAdmin
      .from('program_access')
      .update({
        payment_status: nextPaymentStatus,
        access_status: 'inactive', // CHECK: inactive|active|expired|suspended
        updated_at: new Date().toISOString()
      })
      .eq('id', accessId)
      .in('program_key', programKeys)
      .select('program_key');

    if (updateError) throw updateError;

    result.revoked = (updated || []).map((row) => row.program_key);
    result.ok = true;
    return result;
  } catch (err) {
    result.error = String(err?.message ?? err);
    return result;
  }
}
