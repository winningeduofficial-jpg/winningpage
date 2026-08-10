// NICE 「통합인증」 표준창 호출. Under14Verify(D-1)의 PASS 버튼이 쓴다.
//
// 흐름
//   1) 빈 팝업을 **동기적으로** 먼저 연다
//   2) /api/nice-identity-start 로 표준창 URL을 받는다
//   3) 그 URL로 팝업을 이동시킨다
//   4) 인증이 끝나면 콜백 페이지가 opener로 postMessage 하고 스스로 닫는다
//
// ⚠️ 1)과 2)의 순서가 중요하다
//   팝업을 fetch 이후에 열면 브라우저가 "사용자 제스처와 무관한 팝업"으로 보고
//   차단한다. 그래서 클릭 핸들러 안에서 빈 창을 먼저 띄우고, URL은 나중에 넣는다.
//   따라서 이 함수는 **반드시 클릭 핸들러에서 직접** 호출해야 한다.
//
// ⚠️ 로컬 개발에서는 환경변수 두 개가 더 필요하다
//   콜백은 postMessage의 targetOrigin으로 PUBLIC_SITE_URL(없으면 NICE_RETURN_URL)의
//   오리진을 쓴다. 운영값 그대로면 localhost 창으로는 메시지가 도착하지 않는다.
//   `.env`에 아래를 넣고 `npm run dev:api`(vercel dev)로 띄워야 한다.
//     NICE_RETURN_URL=http://localhost:3000/api/nice-identity-callback
//     PUBLIC_SITE_URL=http://localhost:3000
//   NICE는 return_url을 사전 등록 없이 받으므로 localhost도 그대로 통과한다(확인 완료).

import { supabase } from './supabase';

const POPUP_NAME = 'niceIdentity';
const POPUP_FEATURES = 'width=480,height=812,menubar=no,toolbar=no,location=no,resizable=yes,scrollbars=yes';

// 표준창 transaction_id의 수명(10분)과 맞춘다.
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
// 사용자가 창을 닫았는지 보는 주기. 닫힘은 이벤트로 알 수 없어 폴링뿐이다.
const CLOSE_POLL_MS = 500;

const MESSAGES = {
  popup_blocked: '팝업이 차단되었습니다. 브라우저에서 팝업을 허용한 뒤 다시 시도해 주세요.',
  canceled: '본인확인을 취소했습니다.',
  closed: '본인확인 창이 닫혔습니다. 다시 시도해 주세요.',
  timeout: '시간이 초과되었습니다. 다시 시도해 주세요.',
  invalid_signature: '본인확인 결과를 신뢰할 수 없습니다. 다시 시도해 주세요.',
  invalid_result: '본인확인에 실패했습니다. 다시 시도해 주세요.',
  guardian_age: '법정대리인 본인확인은 만 14세 이상만 가능합니다.',
  unknown_request: '만료된 요청입니다. 다시 시도해 주세요.',
  already_processed: '이미 처리된 요청입니다. 다시 시도해 주세요.',
  rate_limited: '본인확인 요청이 많습니다. 잠시 후 다시 시도해 주세요.',
  vendor_unavailable: '본인확인 서비스에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.',
  vendor_rejected: '본인확인을 시작하지 못했습니다. 문제가 계속되면 고객센터로 문의해 주세요.',
  server_misconfigured: '본인확인 설정에 문제가 있습니다. 관리자에게 문의해 주세요.',
  network: '연결 상태를 확인한 뒤 다시 시도해 주세요.',
  unknown: '잠시 후 다시 시도해 주세요.'
};

function fail(reason) {
  return { ok: false, reason, message: MESSAGES[reason] || MESSAGES.unknown };
}

async function requestAuthUrl(purpose) {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;

  let response;
  let payload;

  try {
    response = await fetch('/api/nice-identity-start', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // 가입 전 호출이 정상이라 토큰이 없어도 보낸다. 있으면 서버가 user_id를 붙인다.
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ purpose })
    });
    payload = await response.json();
  } catch {
    return fail('network');
  }

  if (!response.ok || !payload?.ok) {
    return fail(payload?.reason || 'unknown');
  }

  return { ok: true, authUrl: payload.auth_url, requestId: payload.request_id };
}

/**
 * 콜백이 보내는 postMessage를 기다린다.
 * 창이 닫히거나 시간이 지나면 정리하고 끝낸다 — 리스너가 남으면 다음 시도의 결과를
 * 엉뚱한 곳에서 받는다.
 */
function waitForResult(popup, timeoutMs) {
  return new Promise((resolve) => {
    let done = false;

    function finish(result) {
      if (done) return;
      done = true;
      window.removeEventListener('message', onMessage);
      clearInterval(closeTimer);
      clearTimeout(timeoutTimer);
      resolve(result);
    }

    function onMessage(event) {
      // 우리 오리진에서 온 우리 메시지만 받는다.
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== 'nice-identity') return;

      const data = event.data;

      if (data.ok === true || data.verify === 'success') {
        finish({
          ok: true,
          requestId: data.rid || '',
          // 콜백은 문자열로 실어 보낸다("true"/"false"/""). 판정 불가는 null로 둔다.
          isUnder14: data.is_under14 === '' ? null : data.is_under14 === 'true',
          age: data.age === '' || data.age == null ? null : Number(data.age)
        });
        return;
      }

      finish(fail(data.reason || 'unknown'));
    }

    window.addEventListener('message', onMessage);

    // 닫힘은 이벤트가 없어 폴링해야 한다. 콜백이 window.close()를 부른 직후에도
    // 여기서 먼저 감지될 수 있으므로, 메시지가 오면 finish가 이미 잠근다.
    const closeTimer = setInterval(() => {
      if (popup.closed) finish(fail('closed'));
    }, CLOSE_POLL_MS);

    const timeoutTimer = setTimeout(() => {
      try {
        popup.close();
      } catch {
        // 이미 닫혔거나 접근할 수 없으면 무시한다.
      }
      finish(fail('timeout'));
    }, timeoutMs);
  });
}

/**
 * 본인확인을 처음부터 끝까지 수행한다.
 *
 * **클릭 핸들러에서 직접 호출할 것** — 팝업 차단을 피하려면 동기적으로 창을 열어야 한다.
 *
 * @param {object} [options]
 * @param {string} [options.purpose] 'signup' | 'under14_guardian' | 'phone_change'
 * @returns {Promise<{ok: true, requestId: string, isUnder14: boolean|null, age: number|null}
 *   | {ok: false, reason: string, message: string}>}
 */
export async function runIdentityVerification({
  purpose = 'under14_guardian',
  timeoutMs = DEFAULT_TIMEOUT_MS
} = {}) {
  // 1) 빈 창을 먼저 연다(팝업 차단 회피).
  const popup = window.open('', POPUP_NAME, POPUP_FEATURES);

  if (!popup) return fail('popup_blocked');

  // 2) 표준창 URL을 받아온다.
  const started = await requestAuthUrl(purpose);

  if (!started.ok) {
    popup.close();
    return started;
  }

  // 3) 팝업을 표준창으로 보낸다. replace를 쓰면 뒤로가기로 빈 창에 돌아가지 않는다.
  popup.location.replace(started.authUrl);

  // 4) 결과를 기다린다.
  const result = await waitForResult(popup, timeoutMs);

  // 성공 응답에는 requestId가 콜백 쪽 값으로 들어오지만, 혹시 비어 있으면
  // 우리가 발급받은 값으로 채운다. 이후 단계가 이 id로 인증을 소비한다.
  if (result.ok && !result.requestId) result.requestId = started.requestId;

  return result;
}
