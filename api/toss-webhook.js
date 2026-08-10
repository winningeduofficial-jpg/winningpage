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
      .select('id, status, raw')
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
    if (nextStatus === order.status) {
      return res.status(200).json({ ok: true, unchanged: true, status: nextStatus });
    }

    const patch = {
      status: nextStatus,
      method: payment.method ?? null,
      raw: payment,
    };
    // paid_at 은 "입금이 확인된 시각"이다. 입금 완료가 아닌 전이에서는 건드리지 않는다.
    if (nextStatus === 'paid') {
      patch.paid_at = payment.approvedAt ?? new Date().toISOString();
    }

    const { error: updateError } = await supabaseAdmin
      .from('orders')
      .update(patch)
      .eq('id', orderId);

    if (updateError) throw updateError;

    return res.status(200).json({ ok: true, status: nextStatus });
  } catch (err) {
    console.error('toss-webhook error:', err);
    // 5xx 를 주면 토스가 재시도하므로 일시 장애는 자동 복구된다.
    return res.status(500).json({ error: String(err?.message ?? err) });
  }
}
