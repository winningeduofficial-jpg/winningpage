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
import { grantProgramAccessForOrder } from './_lib/programAccess.js';

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

// 부여를 시도조차 하지 않은 경우의 응답 형태. grantProgramAccessForOrder 의
// 반환 형태와 같게 유지해서 프런트(src/pages/PaymentSuccess.jsx)가 한 가지
// 모양만 보게 한다.
function accessNotAttempted(reason) {
  return { ok: false, granted: [], serviceKeys: [], skipped: [], error: reason };
}

// 즉시 입장 모델(사용자 확정): 돈이 들어온 주문은 승인 직후 권한을 준다.
// 부여 실패가 결제 승인을 되돌리면 안 되므로(승인은 이미 났다) 로그만 남기고
// 결제 성공 응답을 유지한다. 대신 실패 사실은 응답 access 필드로 드러낸다 —
// 그래야 사용자가 '프로그램 시작하기' 대신 문의 안내를 보고, 운영자가 로그로
// 복구할 수 있다. 성공 페이지를 새로고침하면 멱등 upsert 로 자동 재시도된다.
async function grantAndLog(supabaseAdmin, { orderId, userId, paidAt, restoreRevoked }) {
  const access = await grantProgramAccessForOrder(supabaseAdmin, {
    orderId,
    userId,
    paidAt,
    restoreRevoked
  });
  if (!access.ok) {
    console.error('program_access grant failed:', orderId, access.error);
  }
  return access;
}

// 멱등 재응답 경로의 재부여는 주문 소유자 본인만 트리거할 수 있어야 한다.
//
// 왜 여기만 인증을 거는가
//   이 엔드포인트는 결제 승인 자체를 위해 열려 있어야 한다(승인의 근거는 토스
//   승인 API 응답이고, 비회원 결제도 승인은 되어야 한다). 그런데 "이미 paid 인
//   주문"으로 들어오면 토스 호출도 금액 비교도 없이 곧장 권한 부여가 실행된다 —
//   성공 URL 을 북마크에서 다시 열거나 orderId 하나만 아는 요청 한 번으로 남의
//   권한 상태를 되돌릴 수 있다는 뜻이다. 그래서 "새 승인"에는 인증을 걸지 않고
//   (근거가 토스에 있다) "재부여"에만 소유자 확인을 건다.
//   프런트는 이미 세션 토큰을 실어 보낸다(src/pages/PaymentSuccess.jsx:236-240).
async function isOrderOwner(supabaseAdmin, req, order) {
  const token = getBearerToken(req);
  if (!token) return false;

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user?.id) return false;

  return clean(data.user.id) === clean(order.user_id);
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
        // user_id / paid_at 은 권한 부여용이다(부여 대상 사용자 + 이용 시작 시각).
        .select('id, user_id, amount, status, paid_at, raw')
        .eq('id', orderId)
        .maybeSingle();
      order = data ?? null;

      if (order) {
        if (order.status === STATUS_PAID || order.status === STATUS_WAITING_DEPOSIT) {
          // 이미 승인된 주문 (성공 페이지 재요청/새로고침 등) → 저장해둔 승인 원본으로 멱등 응답.
          // waiting_deposit 도 여기서 걸러야 한다. 안 그러면 미입금 상태에서 새로고침할 때마다
          // 토스 승인 API를 재호출한다.
          const raw = order.raw || {};
          // 이미 paid 인 주문은 여기서 부여를 한 번 더 시도한다. 첫 승인 때
          // 부여가 실패했더라도(결제는 성공 처리되므로) 성공 페이지 재방문으로
          // 복구된다. waiting_deposit 은 아직 돈이 안 들어왔으므로 부여 금지 —
          // 입금 확인 시 api/toss-webhook.js 가 부여한다.
          //
          // 단 이 재시도는 (a) 주문 소유자 본인만, (b) 회수·제재된 권한은 되살리지
          // 않는 모드로만 돈다(restoreRevoked 를 넘기지 않는다 = false). 새 돈이
          // 들어온 근거가 없는 호출이므로 "복구"까지만 허용하고 "복원"은 막는다.
          let access;
          if (order.status !== STATUS_PAID) {
            access = accessNotAttempted('waiting_deposit');
          } else if (!clean(order.user_id)) {
            // 비회원 결제(orders.user_id = null). 부여 대상이 없다 — 소유자 확인
            // 이전에 걸러서 프런트가 '영구 실패' 로 안내할 수 있게 한다.
            access = accessNotAttempted('order_has_no_user');
          } else if (!(await isOrderOwner(supabaseAdmin, req, order))) {
            access = accessNotAttempted('not_order_owner');
          } else {
            access = await grantAndLog(supabaseAdmin, {
              orderId,
              userId: order.user_id,
              paidAt: order.paid_at
            });
          }

          return res.status(200).json({
            ...raw,
            // raw 에 토스 status(DONE | WAITING_FOR_DEPOSIT)가 들어 있다. raw 가 없는
            // 과거 주문을 위해 주문 상태에서 역산한 값을 폴백으로 둔다.
            status: raw.status ?? (order.status === STATUS_PAID ? 'DONE' : 'WAITING_FOR_DEPOSIT'),
            orderId,
            totalAmount: order.amount,
            alreadyConfirmed: true,
            access,
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
    // 즉시 입장의 '이용 시작일'은 이 값에서 파생된다(orders 스키마는 그대로 두고
    // paid_at 하나만 원천으로 쓴다 — 시작일/기간 컬럼을 새로 만들지 않는다).
    const paidAt = waitingForDeposit ? null : new Date().toISOString();

    let access = accessNotAttempted(supabaseAdmin ? 'order_not_found' : 'supabase_admin_unavailable');

    if (supabaseAdmin && order) {
      const { error: updateError } = await supabaseAdmin
        .from('orders')
        .update({
          status: waitingForDeposit ? STATUS_WAITING_DEPOSIT : STATUS_PAID,
          payment_key: paymentKey,
          method: data.method ?? null,
          paid_at: paidAt,
          raw: data,
        })
        .eq('id', orderId);

      if (updateError) {
        // 승인 자체는 성공이므로 로깅만 하고 진행한다.
        console.error('orders update error:', updateError);
      }

      // 가상계좌(waiting_deposit)에는 권한을 주지 않는다 — 계좌만 발급됐고 돈은
      // 안 들어왔다. 입금 확인 시 api/toss-webhook.js 가 같은 모듈로 부여한다.
      // 이 경로는 방금 토스 승인이 성공한 "새 결제"다. 이전에 환불로 회수된 권한이
      // 있어도 되살려야 한다(재구매) → restoreRevoked: true. 운영자 제재
      // (access_status='suspended')는 이 경로에서도 유지된다.
      access = waitingForDeposit
        ? accessNotAttempted('waiting_deposit')
        : await grantAndLog(supabaseAdmin, {
            orderId,
            userId: order.user_id,
            paidAt,
            restoreRevoked: true
          });
    }

    return res.status(200).json({ ...data, access });
  } catch (err) {
    console.error('confirm-payment error:', err);
    return res.status(500).json({ error: String(err?.message ?? err) });
  }
}
