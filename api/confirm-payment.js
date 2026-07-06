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

    // 토스 승인 API 호출. 인증은 Basic base64(`${secretKey}:`)
    const auth = Buffer.from(`${secretKey}:`).toString('base64');
    const tossRes = await fetch(TOSS_CONFIRM_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ paymentKey, orderId, amount: Number(amount) }),
    });

    const data = await tossRes.json();

    if (!tossRes.ok) {
      // 토스가 실패를 반환한 경우 (금액 위변조, 이미 처리된 결제 등)
      return res.status(tossRes.status).json({
        error: data.message ?? '결제 승인 실패',
        code: data.code,
      });
    }

    // (선택) 승인 성공 결과를 payments 테이블에 저장한다.
    // 로그인 사용자면 Authorization 헤더의 토큰으로 user 를 매핑한다.
    const supabaseAdmin = createSupabaseAdmin();
    if (supabaseAdmin) {
      let userId = null;
      const token = getBearerToken(req);
      if (token) {
        const { data: userData } = await supabaseAdmin.auth.getUser(token);
        userId = userData?.user?.id ?? null;
      }

      // TODO: payments 테이블 스키마에 맞춰 컬럼을 조정한다.
      const { error: insertError } = await supabaseAdmin.from('payments').insert({
        order_id: orderId,
        payment_key: paymentKey,
        amount: Number(amount),
        status: data.status ?? 'DONE',
        method: data.method ?? null,
        user_id: userId,
        raw: data,
      });

      if (insertError) {
        // 저장 실패해도 승인 자체는 성공이므로 로깅만 하고 진행한다.
        console.error('payments insert error:', insertError);
      }
    }

    return res.status(200).json(data);
  } catch (err) {
    console.error('confirm-payment error:', err);
    return res.status(500).json({ error: String(err?.message ?? err) });
  }
}
