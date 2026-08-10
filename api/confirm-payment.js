// Vercel 서버리스 함수: 토스페이먼츠 결제 승인
//
// 브라우저(success 페이지)가 paymentKey/orderId/amount 를 보내면,
// 이 함수가 "시크릿 키"로 토스 승인 API를 호출한다.
// 시크릿 키는 절대 프론트에 두지 말고, 여기(서버 환경변수 TOSS_SECRET_KEY)에만 둔다.
//
// 필요 환경변수:
//   TOSS_SECRET_KEY                 (예: test_sk_xxxxxxxx)
//   (선택) 결제-사용자 매핑/저장용 Supabase:
//   WINNING_SUPABASE_URL / SUPABASE_URL / VITE_SUPABASE_URL
//   WINNING_SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SERVICE_ROLE_KEY

import { createClient } from '@supabase/supabase-js';

const TOSS_CONFIRM_URL = 'https://api.tosspayments.com/v1/payments/confirm';

// orders.status 허용값: pending | paid | waiting_deposit | failed | canceled
//
// waiting_deposit 은 가상계좌 전용이다. 가상계좌는 승인 API가 성공해도 그건
// "계좌가 발급됐다"는 뜻일 뿐 돈이 들어온 게 아니다(토스 status =
// WAITING_FOR_DEPOSIT). 예전에는 이 경우에도 paid + paid_at=now() 를 찍어서
// 미입금 주문이 결제완료로 보였다. 실제 입금은 api/toss-webhook.js 가 받아
// paid 로 전이시킨다.
const STATUS_PENDING = 'pending';
const STATUS_PAID = 'paid';
const STATUS_WAITING_DEPOSIT = 'waiting_deposit';
// canceled 는 api/toss-webhook.js 가 기록하는 종결 상태다(CANCELED/PARTIAL_CANCELED/
// EXPIRED). 취소된 주문에 승인 API를 재호출하면 "이미 처리된 결제" 에러가 돌아오고,
// 그 에러를 실패로 기록하면 canceled 이력이 failed 로 덮여 환불 정산에서 취소와
// 승인실패를 구분할 수 없게 된다. 그래서 호출 전에 끊는다.
// failed 는 종결로 취급하지 않는다 — 토스 일시 장애(5xx)로도 찍히므로 재시도로
// 복구될 수 있어야 한다(실패 기록이 pending 만 덮으므로 재시도 자체는 안전하다).
const STATUS_CANCELED = 'canceled';
const STATUS_FAILED = 'failed';

function clean(value) {
  return String(value || '').trim();
}

function getEnv(...keys) {
  for (const key of keys) {
    const value = clean(process.env[key]);
    if (value) return value;
  }
  return '';
}

function getBearerToken(req) {
  return clean(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
}

// 선택: 서비스 롤 키가 있으면 admin 클라이언트 생성. 없으면 null (결제 저장은 생략).
function createSupabaseAdmin() {
  const url = getEnv('WINNING_SUPABASE_URL', 'SUPABASE_URL', 'VITE_SUPABASE_URL');
  const key = getEnv('WINNING_SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return null;

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { paymentKey, orderId, amount } = req.body || {};

    if (!paymentKey || !orderId || !amount) {
      return res.status(400).json({ error: '필수 파라미터 누락(paymentKey/orderId/amount)' });
    }

    const secretKey = getEnv('TOSS_SECRET_KEY');
    if (!secretKey) {
      return res.status(500).json({ error: '서버에 TOSS_SECRET_KEY 가 설정되지 않았습니다.' });
    }

    const supabaseAdmin = createSupabaseAdmin();

    // 서버가 생성한 주문의 금액을 신뢰값으로 사용한다. (클라이언트가 보낸 amount 는 검증용)
    let order = null;
    if (supabaseAdmin) {
      const { data } = await supabaseAdmin
        .from('orders')
        .select('id, amount, status, raw')
        .eq('id', orderId)
        .maybeSingle();
      order = data ?? null;

      if (order) {
        if (order.status === STATUS_PAID || order.status === STATUS_WAITING_DEPOSIT) {
          // 이미 승인된 주문 (성공 페이지 재요청/새로고침 등) → 저장해둔 승인 원본으로 멱등 응답.
          // waiting_deposit 도 여기서 걸러야 한다. 안 그러면 미입금 상태에서 새로고침할 때마다
          // 토스 승인 API를 재호출한다.
          const raw = order.raw || {};
          return res.status(200).json({
            ...raw,
            // raw 에 토스 status(DONE | WAITING_FOR_DEPOSIT)가 들어 있다. raw 가 없는
            // 과거 주문을 위해 주문 상태에서 역산한 값을 폴백으로 둔다.
            status: raw.status ?? (order.status === STATUS_PAID ? 'DONE' : 'WAITING_FOR_DEPOSIT'),
            orderId,
            totalAmount: order.amount,
            alreadyConfirmed: true,
          });
        }
        if (order.status === STATUS_CANCELED) {
          // 취소·만료로 종결된 주문. 성공 URL 재방문(히스토리·북마크)으로 여기까지 올 수
          // 있는데, 승인 API를 다시 부르면 실패가 돌아오는 것 말고는 얻을 게 없다.
          return res.status(409).json({ error: '이미 처리된 결제입니다.', status: order.status });
        }
        if (Number(order.amount) !== Number(amount)) {
          return res.status(400).json({ error: '주문 금액이 일치하지 않습니다.' });
        }
      }
    }

    // 토스 승인 API 호출. 주문이 있으면 DB 금액을, 없으면 요청 금액을 사용한다.
    const confirmAmount = order ? Number(order.amount) : Number(amount);
    const auth = Buffer.from(`${secretKey}:`).toString('base64');
    const tossRes = await fetch(TOSS_CONFIRM_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ paymentKey, orderId, amount: confirmAmount }),
    });

    const data = await tossRes.json();

    if (!tossRes.ok) {
      // 토스가 실패를 반환한 경우 (금액 위변조, 이미 처리된 결제 등) → 주문 실패 기록.
      // 단 아직 승인 전인 주문(pending)만 덮어쓴다. 웹훅이 먼저 canceled/paid 로
      // 올려놓은 주문을 이 경로가 failed 로 지우면 취소 이력과 승인실패가 구분되지
      // 않고, paid_at 이 남은 채 status 만 failed 인 모순 레코드가 생긴다.
      if (supabaseAdmin && order) {
        await supabaseAdmin
          .from('orders')
          .update({ status: STATUS_FAILED })
          .eq('id', orderId)
          .eq('status', STATUS_PENDING);
      }
      return res.status(tossRes.status).json({
        error: data.message ?? '결제 승인 실패',
        code: data.code,
      });
    }

    // 승인 성공 → 주문을 확정한다. 단 가상계좌는 아직 입금 전이므로 paid 로 올리지
    // 않고, 입금 시각을 뜻하는 paid_at 도 비워 둔다.
    const waitingForDeposit = data.status === 'WAITING_FOR_DEPOSIT';

    if (supabaseAdmin && order) {
      const { error: updateError } = await supabaseAdmin
        .from('orders')
        .update({
          status: waitingForDeposit ? STATUS_WAITING_DEPOSIT : STATUS_PAID,
          payment_key: paymentKey,
          method: data.method ?? null,
          paid_at: waitingForDeposit ? null : new Date().toISOString(),
          raw: data,
        })
        .eq('id', orderId);

      if (updateError) {
        // 승인 자체는 성공이므로 로깅만 하고 진행한다.
        console.error('orders update error:', updateError);
      }
    }

    return res.status(200).json(data);
  } catch (err) {
    console.error('confirm-payment error:', err);
    return res.status(500).json({ error: String(err?.message ?? err) });
  }
}
