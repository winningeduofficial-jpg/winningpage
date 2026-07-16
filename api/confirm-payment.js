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
        if (order.status === 'paid') {
          // 이미 승인된 주문 (성공 페이지 재요청/새로고침 등) → 저장해둔 승인 원본으로 멱등 응답
          return res.status(200).json({
            ...(order.raw || {}),
            status: 'DONE',
            orderId,
            totalAmount: order.amount,
            alreadyConfirmed: true,
          });
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
      // 토스가 실패를 반환한 경우 (금액 위변조, 이미 처리된 결제 등) → 주문 실패 기록
      if (supabaseAdmin && order) {
        await supabaseAdmin.from('orders').update({ status: 'failed' }).eq('id', orderId);
      }
      return res.status(tossRes.status).json({
        error: data.message ?? '결제 승인 실패',
        code: data.code,
      });
    }

    // 승인 성공 → 주문을 paid 로 확정한다.
    if (supabaseAdmin && order) {
      const { error: updateError } = await supabaseAdmin
        .from('orders')
        .update({
          status: 'paid',
          payment_key: paymentKey,
          method: data.method ?? null,
          paid_at: new Date().toISOString(),
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
