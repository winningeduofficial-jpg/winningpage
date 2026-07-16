// Vercel 서버리스 함수: 주문 생성 (결제 금액 서버 재계산)
//
// 클라이언트가 보낸 상품 id / 쿠폰 id 만 신뢰하고,
// 실제 가격·할인은 서버가 Supabase `products` / `coupons` 에서 다시 읽어 계산한다.
// → 프런트에서 금액을 위변조해도 결제 금액이 조작되지 않는다.
//
// 흐름:
//   1) items[].id 로 products 조회 → 정가/판매가 합계 계산
//   2) couponIds 로 coupons 조회 → 유효/최소금액 확인 후 할인 합산 (판매가 초과 불가)
//   3) orders(pending) + order_items insert
//   4) { orderId, orderName, amount } 반환 → 클라이언트가 토스 결제창 호출
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

    // 2) 쿠폰 검증 및 할인 계산
    let couponDiscount = 0;
    let appliedCouponId = null;
    if (couponIds.length > 0) {
      const today = new Date().toISOString().slice(0, 10);
      const { data: coupons } = await supabaseAdmin
        .from('coupons')
        .select('id, discount_amount, min_amount, valid_until, is_active')
        .in('id', couponIds)
        .eq('is_active', true)
        .gte('valid_until', today);

      (coupons || []).forEach((c) => {
        if (subtotal >= Number(c.min_amount || 0)) {
          couponDiscount += Number(c.discount_amount || 0);
          appliedCouponId = c.id; // 대표 쿠폰 1개만 기록 (order_items 확장 여지)
        }
      });
      couponDiscount = Math.min(couponDiscount, subtotal);
    }

    const discountTotal = listTotal - subtotal + couponDiscount;
    const amount = Math.max(0, listTotal - discountTotal);

    if (amount <= 0) {
      return res.status(400).json({ error: '결제 금액이 올바르지 않습니다.' });
    }

    // 로그인 사용자 매핑 (비회원 결제 허용)
    let userId = null;
    let customerEmail = null;
    const token = getBearerToken(req);
    if (token) {
      const { data: userData } = await supabaseAdmin.auth.getUser(token);
      userId = userData?.user?.id ?? null;
      customerEmail = userData?.user?.email ?? null;
    }

    // 3) 주문 생성 (pending)
    const orderId = `order_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const orderName = buildOrderName(products);

    const { error: orderError } = await supabaseAdmin.from('orders').insert({
      id: orderId,
      user_id: userId,
      status: 'pending',
      order_name: orderName,
      list_amount: listTotal,
      discount_amount: discountTotal,
      amount,
      coupon_id: appliedCouponId,
      customer_email: customerEmail,
    });

    if (orderError) {
      console.error('orders insert 오류:', orderError);
      return res.status(500).json({ error: '주문 생성에 실패했습니다.' });
    }

    const orderItems = products.map((p) => ({
      order_id: orderId,
      product_id: p.id,
      service_key: p.service_key,
      name: p.name,
      list_price: Number(p.list_price || p.price || 0),
      price: Number(p.price || 0),
      quantity: 1,
    }));

    const { error: itemsError } = await supabaseAdmin.from('order_items').insert(orderItems);
    if (itemsError) {
      console.error('order_items insert 오류:', itemsError);
      // 주문 헤더는 생성됐으므로 결제는 진행 가능. 로깅만.
    }

    return res.status(200).json({ orderId, orderName, amount });
  } catch (err) {
    console.error('create-order error:', err);
    return res.status(500).json({ error: String(err?.message ?? err) });
  }
}
