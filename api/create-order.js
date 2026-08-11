// Vercel 서버리스 함수: 주문 생성 (결제 금액 서버 재계산)
//
// 클라이언트가 보낸 상품 id / 쿠폰 id 만 신뢰하고,
// 실제 가격은 서버가 Supabase `products` 에서 다시 읽어 계산한다.
// → 프런트에서 금액을 위변조해도 결제 금액이 조작되지 않는다.
//
// 흐름:
//   1) items[].id 로 products 조회 → 정가/판매가 합계 계산 (과금 정본은 여전히 products.price)
//   2) rpc fn_redeem_coupons 호출 → 쿠폰 판정 + orders(pending)/order_items 생성 +
//      쿠폰 사용 이력(coupon_redemptions) 기록을 한 트랜잭션으로 원자 처리
//      (sql/55_coupon_policy.sql). 인라인 쿠폰 조회·판정(과거 이 파일 :88-106)은
//      DB 함수로 이관했다 — Checkout.jsx 의 fn_usable_coupons 호출과 판정 로직이
//      한 곳(DB)에서만 정의되어 더 이상 두 곳이 따로 어긋날 수 없다.
//   3) { orderId, orderName, amount } 반환 → 클라이언트가 토스 결제창 호출
//
// 필요 환경변수:
//   WINNING_SUPABASE_URL / SUPABASE_URL / VITE_SUPABASE_URL
//   WINNING_SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SERVICE_ROLE_KEY

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

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

function createSupabaseAdmin() {
  const url = getEnv('WINNING_SUPABASE_URL', 'SUPABASE_URL', 'VITE_SUPABASE_URL');
  const key = getEnv('WINNING_SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function buildOrderName(products) {
  if (products.length === 0) return '위닝에듀 서비스';
  const first = products[0].name || '위닝에듀 서비스';
  return products.length === 1 ? first : `${first} 외 ${products.length - 1}건`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = req.body || {};
    const rawItems = Array.isArray(body.items) ? body.items : [];
    const couponIds = Array.isArray(body.couponIds) ? body.couponIds.map(clean).filter(Boolean) : [];

    const productIds = [...new Set(rawItems.map((it) => clean(it?.id)).filter(Boolean))];
    if (productIds.length === 0) {
      return res.status(400).json({ error: '선택된 상품이 없습니다.' });
    }

    const supabaseAdmin = createSupabaseAdmin();
    if (!supabaseAdmin) {
      return res.status(500).json({ error: '서버에 Supabase 서비스 키가 설정되지 않았습니다.' });
    }

    // 1) 상품 조회 (서버 신뢰 가격)
    const { data: products, error: productError } = await supabaseAdmin
      .from('products')
      .select('id, service_key, name, list_price, price, is_active')
      .in('id', productIds)
      .eq('is_active', true);

    if (productError) {
      console.error('products 조회 오류:', productError);
      return res.status(500).json({ error: '상품 정보를 불러오지 못했습니다.' });
    }
    if (!products || products.length !== productIds.length) {
      return res.status(400).json({ error: '판매 중이 아닌 상품이 포함되어 있습니다.' });
    }

    const listTotal = products.reduce((s, p) => s + Number(p.list_price || p.price || 0), 0);
    const subtotal = products.reduce((s, p) => s + Number(p.price || 0), 0);

    // 로그인 사용자 매핑 (비회원 결제 허용)
    let userId = null;
    let customerEmail = null;
    const token = getBearerToken(req);
    if (token) {
      const { data: userData } = await supabaseAdmin.auth.getUser(token);
      userId = userData?.user?.id ?? null;
      customerEmail = userData?.user?.email ?? null;
    }

    const orderId = `order_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const orderName = buildOrderName(products);

    // 2) 쿠폰 판정 + 주문(pending)/주문아이템/쿠폰 사용 이력을 DB 함수 한 번으로
    //    원자 처리한다(sql/55_coupon_policy.sql fn_redeem_coupons). subtotal/
    //    list_amount 는 위에서 products 로 계산한 신뢰값을 그대로 넘긴다 —
    //    이 함수는 금액을 재계산하지 않는다(과금 정본은 여전히 products.price).
    const { data: redeemRows, error: redeemError } = await supabaseAdmin.rpc('fn_redeem_coupons', {
      p_order_id: orderId,
      p_user_id: userId,
      p_customer_email: customerEmail,
      p_order_name: orderName,
      p_items: products.map((p) => ({
        product_id: p.id,
        service_key: p.service_key,
        name: p.name,
        list_price: Number(p.list_price || p.price || 0),
        price: Number(p.price || 0),
        quantity: 1,
      })),
      p_list_amount: listTotal,
      p_subtotal: subtotal,
      p_coupon_ids: couponIds,
    });

    if (redeemError) {
      // fn_redeem_coupons 는 결제 금액이 0원 이하가 되면 'invalid_amount' 로
      // raise exception 한다(트랜잭션 전체 롤백 — orders/order_items/
      // coupon_redemptions 어느 것도 남지 않는다). 그 외는 서버 오류.
      // P3: sql/55_coupon_policy.sql 이 이 예외에 errcode='WC001' 을 붙였다
      // (2026-08-11) — 메시지 문자열은 PostgREST 래핑이나 문구 변경으로
      // 흔들릴 수 있어 code 비교를 정본으로 쓴다. 메시지 비교는 과거 배포
      // 흔적(구버전 PostgREST 캐시 등)에 대한 폴백으로만 남겨 둔다.
      if (redeemError.code === 'WC001' || redeemError.message === 'invalid_amount') {
        return res.status(400).json({ error: '결제 금액이 올바르지 않습니다.' });
      }
      console.error('fn_redeem_coupons 오류:', redeemError);
      return res.status(500).json({ error: '주문 생성에 실패했습니다.' });
    }

    const redeemRow = redeemRows?.[0] ?? {};
    const amount = Number(redeemRow.amount ?? 0);
    if (!amount) {
      console.error('fn_redeem_coupons 응답에 amount 없음:', redeemRows);
      return res.status(500).json({ error: '주문 생성에 실패했습니다.' });
    }

    // P1-3: 서버가 실제로 적용한 쿠폰과 할인액을 응답에 싣는다. 화면은 클라이언트가
    // '선택한' 쿠폰으로 payAmount 를 미리 계산해 두지만, 서버는 로그인 필요/전체
    // 소진/비결합 배제/0원 방지 스킵 등으로 그중 일부를 조용히 뺄 수 있다 — 이걸
    // 숨기면 사용자가 토스 결제창에서 처음 보는 금액으로 결제하게 된다(Checkout.jsx
    // handlePay 의 표시가/청구가 대조가 이 값을 쓴다).
    return res.status(200).json({
      orderId,
      orderName,
      amount,
      appliedCouponIds: redeemRow.applied_coupon_ids ?? [],
      couponDiscount: Number(redeemRow.coupon_discount ?? 0)
    });
  } catch (err) {
    console.error('create-order error:', err);
    return res.status(500).json({ error: String(err?.message ?? err) });
  }
}
