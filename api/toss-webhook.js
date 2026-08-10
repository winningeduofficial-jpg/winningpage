// Vercel 서버리스 함수: 토스페이먼츠 웹훅 수신
//
// 왜 필요한가
//   가상계좌는 결제창을 통과한 시점에 돈이 들어온 게 아니다. 승인 API가
//   성공해도 상태는 WAITING_FOR_DEPOSIT 이고, 실제 입금은 며칠 뒤에 일어날 수
//   있다. 그 순간을 브라우저는 알 수 없으므로 토스가 서버로 쏘는 웹훅만이
//   유일한 통보 경로다. 이 라우트가 없으면 입금된 주문이 영구히
//   waiting_deposit 으로 남는다.
//
// 페이로드를 믿지 않는다
//   이 엔드포인트는 인증 없이 열려 있어야 한다(토스가 호출하므로). 그래서
//   본문의 status 를 그대로 DB에 반영하면 누구나 주문을 결제완료로 바꿀 수
//   있다. 따라서 본문에서는 orderId 만 꺼내 쓰고, 실제 상태는 시크릿 키로
//   토스 결제 조회 API를 다시 호출해서 얻는다. 레거시 가상계좌 웹훅이 보내는
//   secret 값은 승인 응답(orders.raw.secret)과 대조해 추가로 걸러낸다.
//
// 지원하는 두 가지 본문 형태
//   1) 레거시 가상계좌 웹훅 : { orderId, status, secret, transactionKey, createdAt }
//   2) PAYMENT_STATUS_CHANGED : { eventType, createdAt, data: { orderId, status, ... } }
//
// 필요 환경변수 (confirm-payment.js 와 동일)
//   TOSS_SECRET_KEY
//   WINNING_SUPABASE_URL / WINNING_SUPABASE_SERVICE_ROLE_KEY
//
// 배포 후 토스 개발자센터 > 웹훅에 이 URL(/api/toss-webhook)을 등록하는 것은
// 콘솔 작업이라 코드로 처리하지 않는다.

import { createSupabaseAdmin, getEnv } from './_lib/supabaseAdmin.js';
import {
  grantProgramAccessForOrder,
  revokeProgramAccessForOrder
} from './_lib/programAccess.js';

const TOSS_PAYMENT_BY_ORDER_URL = 'https://api.tosspayments.com/v1/payments/orders';

function clean(value) {
  return String(value || '').trim();
}

// 토스 결제 status → orders.status
// 허용값은 pending | paid | waiting_deposit | failed | canceled (sql/10_pricing_orders.sql)
function mapStatus(tossStatus) {
  switch (clean(tossStatus)) {
    case 'DONE':
      return 'paid';
    case 'WAITING_FOR_DEPOSIT':
      return 'waiting_deposit';
    case 'CANCELED':
    case 'PARTIAL_CANCELED':
    case 'EXPIRED':
      return 'canceled';
    case 'ABORTED':
      return 'failed';
    default:
      return '';
  }
}

// 부수효과(권한 부여·회수)가 붙은 상태. 이 상태로 오는 웹훅은 orders 상태가
// 이미 같더라도 조기 종료하지 않는다 — 부수효과가 1회차에 실패했을 때 재전송이
// 유일한 복구 수단이고, 부여(upsert)·회수(update)는 모두 멱등이다.
const SIDE_EFFECT_STATUSES = new Set(['paid', 'canceled']);

// 부여 실패를 운영자가 볼 수 있는 곳에 남긴다.
//
// 웹훅은 사용자가 보는 화면이 없어서 console.error 만 남기면 실패를 아무도
// 모른다(가상계좌는 며칠 뒤 입금되므로 사용자가 성공 페이지로 돌아오지도
// 않는다). orders 에 별도 컬럼을 만들지 않고 raw(jsonb)에 키를 하나 얹는다 —
// raw 는 토스 응답 보관용이고 이 레포에서 raw 를 읽는 코드는 confirm-payment 의
// 멱등 재응답(raw.status/raw.secret)뿐이라 키 추가가 기존 리더를 깨지 않는다.
// 성공 시에는 이전 실패 흔적을 지운다(같은 주문이 복구됐다는 사실도 정보다).
async function recordGrantOutcome(supabaseAdmin, { orderId, raw, access }) {
  const had = Object.prototype.hasOwnProperty.call(raw || {}, 'access_grant_error');
  if (access.ok && !had) return;

  const nextRaw = { ...(raw || {}) };
  if (access.ok) {
    delete nextRaw.access_grant_error;
    nextRaw.access_grant_recovered_at = new Date().toISOString();
  } else {
    nextRaw.access_grant_error = { error: access.error, at: new Date().toISOString() };
  }

  const { error } = await supabaseAdmin.from('orders').update({ raw: nextRaw }).eq('id', orderId);
  if (error) console.error('orders.raw grant marker update failed:', orderId, error);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = req.body || {};
    // 두 형태 모두 orderId 만 필요하다. 나머지 필드는 신뢰하지 않는다.
    const orderId = clean(body.orderId || body?.data?.orderId);
    const claimedSecret = clean(body.secret || body?.data?.secret);

    if (!orderId) {
      // 재시도해도 결과가 같으므로 200 으로 닫는다(4xx 를 주면 토스가 계속 재시도한다).
      return res.status(200).json({ ignored: true, reason: 'orderId 없음' });
    }

    const secretKey = getEnv('TOSS_SECRET_KEY');
    if (!secretKey) {
      // 설정 누락은 우리 쪽 문제다. 5xx 로 응답해 토스 재시도를 유도한다.
      return res.status(500).json({ error: '서버에 TOSS_SECRET_KEY 가 설정되지 않았습니다.' });
    }

    const supabaseAdmin = createSupabaseAdmin();

    const { data: order, error: selectError } = await supabaseAdmin
      .from('orders')
      // user_id 는 입금 확인 시 이용 권한을 줄 대상이다(즉시 입장).
      // paid_at 은 이미 paid 인 주문에 부여를 재시도할 때 이용 시작 시각으로 쓴다
      // (재시도가 시작일을 오늘로 밀어버리지 않게 한다).
      .select('id, user_id, status, paid_at, raw')
      .eq('id', orderId)
      .maybeSingle();

    if (selectError) throw selectError;
    if (!order) {
      return res.status(200).json({ ignored: true, reason: '주문 없음' });
    }

    // 레거시 가상계좌 웹훅의 secret 대조. 승인 응답에 secret 이 있었던 주문만 검사한다.
    const storedSecret = clean(order.raw?.secret);
    if (storedSecret && claimedSecret && storedSecret !== claimedSecret) {
      return res.status(200).json({ ignored: true, reason: 'secret 불일치' });
    }

    // 상태의 정본은 토스 조회 응답이다.
    const auth = Buffer.from(`${secretKey}:`).toString('base64');
    const tossRes = await fetch(`${TOSS_PAYMENT_BY_ORDER_URL}/${encodeURIComponent(orderId)}`, {
      headers: { Authorization: `Basic ${auth}` },
    });
    const payment = await tossRes.json();

    if (!tossRes.ok) {
      return res.status(502).json({
        error: payment?.message ?? '토스 결제 조회 실패',
        code: payment?.code,
      });
    }

    const nextStatus = mapStatus(payment.status);
    if (!nextStatus) {
      return res.status(200).json({ ignored: true, reason: `미지원 status(${payment.status})` });
    }
    // 상태가 그대로인 웹훅(토스 재전송·수동 재전송)이라도 paid 는 그냥 닫지
    // 않는다. 1회차에서 orders 는 paid 로 올라갔는데 권한 부여만 실패한 경우
    // (programs 시드 미적용 FK 위반, 일시적 DB 오류) 조기 종료하면 복구 수단이
    // 사라진다 — 가상계좌 구매자는 며칠 뒤 입금하므로 성공 URL 로 돌아오지 않고,
    // 그러면 confirm-payment 의 멱등 재시도도 발동하지 않는다. 부여는 멱등
    // upsert 라서 재호출이 안전하므로, 웹훅 재전송을 복구 경로로 쓴다.
    // 취소도 같은 이유로 닫지 않는다 — 회수(update)가 실패한 뒤 오는 재전송이
    // 유일한 복구 수단이다.
    const unchanged = nextStatus === order.status;
    if (unchanged && !SIDE_EFFECT_STATUSES.has(nextStatus)) {
      return res.status(200).json({ ok: true, unchanged: true, status: nextStatus });
    }

    // 이미 paid 인 주문에 재전송이 온 경우 orders 는 다시 쓸 필요가 없다.
    let paidAt = order.paid_at ?? null;
    if (!unchanged) {
      const patch = {
        status: nextStatus,
        method: payment.method ?? null,
        raw: payment,
      };
      // paid_at 은 "입금이 확인된 시각"이다. 입금 완료가 아닌 전이에서는 건드리지 않는다.
      if (nextStatus === 'paid') {
        patch.paid_at = payment.approvedAt ?? new Date().toISOString();
        paidAt = patch.paid_at;
      }

      const { error: updateError } = await supabaseAdmin
        .from('orders')
        .update(patch)
        .eq('id', orderId);

      if (updateError) throw updateError;
    }

    // 즉시 입장(사용자 확정): 가상계좌 입금이 확인된 이 순간이 권한 부여 지점이다.
    // 카드·간편결제 경로(api/confirm-payment.js)와 같은 api/_lib/programAccess.js
    // 를 쓴다 — 부여 규칙이 두 벌로 갈라지지 않게 한다.
    // 부여 실패로 5xx 를 주면 토스가 웹훅을 재시도하지만 그 재시도가 곧 복구
    // 경로이므로(위 unchanged 분기) 200 을 유지하고 실패는 응답 + orders.raw 에
    // 남긴다.
    let access = null;
    if (nextStatus === 'paid') {
      access = await grantProgramAccessForOrder(supabaseAdmin, {
        orderId,
        userId: order.user_id,
        paidAt,
        // 새 입금이 확인된 전이만 회수된 권한을 되살릴 수 있다. 재전송(unchanged)
        // 은 새 돈의 근거가 없는 재시도이므로 환불 회수를 되돌리지 않는다.
        restoreRevoked: !unchanged
      });
      if (!access.ok) {
        console.error('program_access grant failed (webhook):', orderId, access.error);
      }
      // 마커는 DB 에 저장된 raw 를 기준으로 붙였다 떼야 한다. unchanged 경로는
      // 위에서 orders 를 건드리지 않았으므로 저장본(order.raw)이 기준이다.
      await recordGrantOutcome(supabaseAdmin, {
        orderId,
        raw: unchanged ? order.raw : payment,
        access
      });
    }

    // 즉시 입장의 대칭: 결제가 종결(취소·환불·만료)되면 권한도 즉시 닫는다.
    // 주문만 canceled 로 바꿔도 판정부(api/create-service-ticket.js:111)는
    // payment_status·access_status 만 보므로 입장이 계속 성립한다.
    let revoke = null;
    if (nextStatus === 'canceled') {
      // 부분취소(PARTIAL_CANCELED)는 잔액이 남아 있으면 결제가 유효하게 살아 있는
      // 상태다. 토스 응답의 balanceAmount 가 "취소 후 남은 금액"이므로 0보다 크면
      // 회수하지 않는다 — 1회차분만 환불한 구매자의 권한을 통째로 닫으면 안 된다.
      // (부분취소 후 남은 회차·기간을 어떻게 볼지는 만료 정책과 함께 미확정.)
      const balanceAmount = Number(payment.balanceAmount ?? 0);
      if (clean(payment.status) === 'PARTIAL_CANCELED' && balanceAmount > 0) {
        console.warn('partial cancel with balance left — access kept:', orderId, balanceAmount);
        revoke = { ok: true, revoked: [], skipped: [{ reason: 'partial_cancel_balance_left' }] };
      } else {
        // 돈이 실제로 들어왔던 주문의 취소 = 환불(refunded), 입금 전 종결(가상계좌
        // 미입금 만료) = 취소(cancelled). 구분 근거를 orders.status 로 잡으면
        // 재전송 때는 이미 canceled 라서 refunded 가 cancelled 로 뒤집힌다. 그래서
        // 토스 응답에서 판정한다 — 승인된 적이 있으면 approvedAt 이, 취소 이력이
        // 있으면 cancels 배열이 채워진다(EXPIRED 는 둘 다 없다).
        const wasApproved = Boolean(payment.approvedAt) || Array.isArray(payment.cancels);
        revoke = await revokeProgramAccessForOrder(supabaseAdmin, {
          orderId,
          userId: order.user_id,
          paymentStatus: wasApproved ? 'refunded' : 'cancelled'
        });
        if (!revoke.ok) {
          // 여기서 실패하면 돈은 돌려줬는데 권한이 열린 채로 남는다. 5xx 로 응답해
          // 토스 재전송을 유도한다(회수 update 는 멱등이라 재시도가 안전하다).
          console.error('program_access revoke failed (webhook):', orderId, revoke.error);
          return res.status(500).json({ error: 'program_access 회수 실패', revoke });
        }
      }
    }

    return res.status(200).json({
      ok: true,
      status: nextStatus,
      ...(unchanged ? { unchanged: true } : {}),
      ...(access ? { access } : {}),
      ...(revoke ? { revoke } : {})
    });
  } catch (err) {
    console.error('toss-webhook error:', err);
    // 5xx 를 주면 토스가 재시도하므로 일시 장애는 자동 복구된다.
    return res.status(500).json({ error: String(err?.message ?? err) });
  }
}
