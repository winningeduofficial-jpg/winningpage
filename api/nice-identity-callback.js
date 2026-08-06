// GET|POST /api/nice-identity-callback?rid=<request_id>
//
// NICE 표준창이 인증을 마치고 사용자를 돌려보내는 지점이다. 우리 프론트가
// 부르는 API가 아니라 **브라우저가 이동해 오는 페이지**라서, JSON이 아니라
// 화면을 반환한다.
//
// 왜 302 리다이렉트가 아니라 HTML + postMessage인가
//   통합인증 표준창은 window.open으로 띄우는 팝업이다(가이드 3단계). 팝업 안에서
//   /signup으로 302를 보내면 앱 전체가 팝업 안에 다시 뜬다 — 원래 창은 아무것도
//   모른 채 그대로다. 그래서 결과를 opener로 postMessage 하고 팝업을 닫는다.
//   docs/auth-signup-spec.md §2.3은 302로 적혀 있는데, 그건 표준창을 페이지
//   이동 방식으로 쓰던 구 규격 기준이라 여기서 갈라진다.
//   opener가 없으면(팝업이 아니라 직접 열린 경우) 리다이렉트로 물러난다.
//
// 신뢰 경계
//   rid는 return_url에 실려 나갔다가 돌아오므로 사용자가 볼 수 있고 바꿀 수도
//   있다. 그래서 rid만으로 인증됐다고 판단하지 않는다 — 실제 판정은 NICE의
//   /auth/result 호출이 한다. 저장해 둔 transaction_id·ticket·iterators와
//   콜백이 들고 온 web_transaction_id가 모두 맞아야 복호화까지 간다.
//
// ⚠️ 남은 연결: 가입 RPC(complete_signup_profile)가 아직 이 결과를 소비하지
//    않는다. consumed_at을 찍는 주체가 없으므로, 지금은 "인증을 했다"는 사실만
//    남고 가입 절차를 강제하지는 못한다.

import { createSupabaseAdmin, getEnv } from './_lib/supabaseAdmin.js';
import {
  computeKoreanAge,
  fetchAuthResult,
  isUnder14,
  parseNiceBirthDate
} from './_lib/niceIdentity.js';

export const config = { runtime: 'nodejs' };

/** 결과를 알릴 프론트 오리진. 콜백 URL과 같은 사이트다. */
function getSiteOrigin() {
  const explicit = getEnv('PUBLIC_SITE_URL', 'VITE_SITE_URL');
  if (explicit) return new URL(explicit).origin;

  // 별도 설정이 없으면 콜백 URL의 오리진을 쓴다. 같은 배포에 붙어 있으므로
  // 이게 사실상 정답이고, 환경변수를 하나 더 요구하지 않아도 된다.
  return new URL(getEnv('NICE_RETURN_URL')).origin;
}

function escapeJson(value) {
  // </script> 로 스크립트 블록이 끊기는 것을 막는다.
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

/**
 * 팝업을 닫으면서 결과를 부모 창에 알린다.
 * opener가 없으면 프론트로 이동시킨다(팝업이 아닌 경로 대비).
 */
function renderResult(res, { status, origin, payload, fallbackPath }) {
  const fallback = new URL(fallbackPath, origin);

  for (const [key, value] of Object.entries(payload)) {
    if (value !== undefined && value !== null) fallback.searchParams.set(key, String(value));
  }

  const html = `<!doctype html>
<meta charset="utf-8">
<title>본인확인</title>
<body style="font:14px/1.6 system-ui,sans-serif;padding:24px;text-align:center">
<p>본인확인 결과를 처리하고 있습니다…</p>
<script>
(function () {
  var payload = ${escapeJson({ type: 'nice-identity', ...payload })};
  var origin = ${escapeJson(origin)};
  try {
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage(payload, origin);
      window.close();
      return;
    }
  } catch (e) {}
  location.replace(${escapeJson(fallback.toString())});
})();
</script>
</body>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  // 인증 결과가 브라우저나 중간 캐시에 남으면 안 된다.
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).send(html);
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ ok: false, detail: 'Method not allowed' });
  }

  // method_type을 GET으로 요청하지만, 설정이 바뀌어도 깨지지 않게 둘 다 읽는다.
  const rid = String(req.query?.rid || req.body?.rid || '').trim();
  const webTransactionId = String(
    req.query?.web_transaction_id || req.body?.web_transaction_id || ''
  ).trim();

  let origin;
  try {
    origin = getSiteOrigin();
  } catch {
    // 오리진조차 못 구하면 안내할 곳이 없다. 이건 배포 설정 오류다.
    console.error('[nice-identity-callback] NICE_RETURN_URL 설정이 잘못되었습니다.');
    return res.status(500).json({ ok: false, reason: 'server_misconfigured' });
  }

  const fail = (reason, status = 200) =>
    renderResult(res, {
      status,
      origin,
      payload: { ok: false, verify: 'failed', reason },
      fallbackPath: '/signup'
    });

  // 사용자가 표준창을 닫은 경우 web_transaction_id 없이 돌아온다.
  if (!rid) return fail('invalid_request');
  if (!webTransactionId) return fail('canceled');

  try {
    const supabase = createSupabaseAdmin();

    const { data: row, error: selectError } = await supabase
      .from('identity_verifications')
      .select('id, status, purpose, transaction_id, auth_ticket, auth_iterators, expires_at')
      .eq('request_id', rid)
      .maybeSingle();

    if (selectError) throw selectError;
    if (!row) return fail('unknown_request');

    // 이미 처리된 요청을 다시 열지 않는다(콜백 재생 방지).
    if (row.status !== 'pending') return fail('already_processed');

    if (new Date(row.expires_at).getTime() < Date.now()) {
      await supabase
        .from('identity_verifications')
        .update({ status: 'expired' })
        .eq('id', row.id)
        .eq('status', 'pending');

      return fail('timeout');
    }

    let result;

    try {
      result = await fetchAuthResult({
        webTransactionId,
        transactionId: row.transaction_id,
        requestNo: rid,
        ticket: row.auth_ticket,
        iterators: row.auth_iterators
      });
    } catch (vendorError) {
      console.error('[nice-identity-callback] NICE 결과 조회 실패:', vendorError);

      await supabase
        .from('identity_verifications')
        .update({
          status: 'failed',
          web_transaction_id: webTransactionId,
          error_message: String(vendorError?.message || '').slice(0, 500)
        })
        .eq('id', row.id)
        .eq('status', 'pending');

      // 세 가지를 구분한다. 사용자에게 할 말이 다르기 때문이다.
      //   invalid_signature   위변조 신호 — 재시도로 풀리지 않는다
      //   invalid_result      NICE가 result_code로 거절 — 이것도 재시도 대상이 아니다
      //   vendor_unavailable  NICE에 닿지 못함(네트워크·타임아웃) — 이때만 "잠시 후 다시"
      const reason = vendorError?.integrityFailed
        ? 'invalid_signature'
        : vendorError?.niceResultCode
          ? 'invalid_result'
          : 'vendor_unavailable';

      return fail(reason);
    }

    const birthDate = parseNiceBirthDate(result.birthdate);
    const under14 = isUnder14(birthDate);

    const { error: updateError } = await supabase
      .from('identity_verifications')
      .update({
        status: 'verified',
        web_transaction_id: webTransactionId,
        ci: result.ci || null,
        di: result.di || null,
        name: result.name || null,
        birth_date: birthDate ? birthDate.toISOString().slice(0, 10) : null,
        gender: result.gender || null,
        nationality: result.national_info || null,
        mobile: result.mobile_no || null,
        carrier: result.mobile_co || null,
        auth_method: result.auth_method || null,
        is_under14: under14,
        verified_at: new Date().toISOString()
      })
      .eq('id', row.id)
      .eq('status', 'pending');

    if (updateError) throw updateError;

    // 법정대리인 인증인데 본인이 미성년자면 통과시키면 안 된다. 저장은 이미
    // 끝났으므로(근거는 남긴다) 프론트에만 실패로 알린다.
    if (row.purpose === 'under14_guardian' && under14 !== false) {
      return fail('guardian_age');
    }

    return renderResult(res, {
      status: 200,
      origin,
      payload: {
        ok: true,
        verify: 'success',
        rid,
        // 결과 원문은 넘기지 않는다. 프론트가 알아야 할 건 분기에 쓸 값뿐이다.
        is_under14: under14 === null ? '' : String(under14),
        age: computeKoreanAge(birthDate) ?? ''
      },
      fallbackPath: '/signup'
    });
  } catch (error) {
    console.error('[nice-identity-callback] 오류:', error);
    return fail('server_error');
  }
}
