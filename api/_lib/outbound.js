// 외부 API 호출을 고정 IP로 내보내기 위한 공용 유틸.
//
// 왜 필요한가
//   알리고(알림톡·SMS)와 NICE평가정보는 발신 IP 화이트리스트를 쓴다. Vercel의
//   서버리스 함수는 나갈 때 IP가 매번 달라지므로 그대로 호출하면 차단된다.
//   그래서 Fixie(Vercel 통합)가 제공하는 고정 IP 프록시를 경유해야 한다.
//
// 주의 세 가지
//   1) Fixie는 자동이 아니다. HTTP_PROXY 환경변수를 심어둬도 Node의 기본 fetch는
//      그걸 읽지 않는다. 이 파일처럼 dispatcher를 명시적으로 붙여야 실제로 경유한다.
//   2) Node 런타임에서만 동작한다. 이 유틸을 쓰는 라우트는 Edge 런타임으로 두면
//      안 된다(Vercel API 라우트 기본값이 Node라 별도 설정은 보통 불필요하다).
//   3) Supabase Edge Function에서 호출하면 Fixie를 타지 않아 화이트리스트를
//      통과하지 못한다. 외부 호출은 반드시 이 레포의 api/ 에서 나가야 한다.
//
// 사용
//   import { outboundFetch } from './_lib/outbound.js';
//   const res = await outboundFetch('https://apis.aligo.in/...', { method: 'POST', body });

import { ProxyAgent, fetch as undiciFetch } from 'undici';

const DEFAULT_TIMEOUT_MS = 10_000;

let cachedAgent = null;
let cachedProxyUrl = '';

function readProxyUrl() {
  // FIXIE_URL은 Fixie 통합이 자동으로 주입한다. OUTBOUND_PROXY_URL은 다른
  // 프록시로 갈아탈 때를 위한 수동 우선 지정용이다.
  return String(process.env.OUTBOUND_PROXY_URL || process.env.FIXIE_URL || '').trim();
}

// 배포 환경에서 프록시가 없으면 조용히 직접 나가면 안 된다. 벤더가 IP로
// 거절하는 형태로 뒤늦게 실패해서 원인을 찾기 어렵기 때문이다.
function isDeployed() {
  return Boolean(process.env.VERCEL);
}

export function isProxyConfigured() {
  return readProxyUrl() !== '';
}

// 로그에 프록시 자격증명이 찍히면 안 된다. host:port만 남긴다.
export function describeEgress() {
  const raw = readProxyUrl();
  if (!raw) return 'direct (no proxy)';

  try {
    const url = new URL(raw);
    return `proxy ${url.host}`;
  } catch {
    return 'proxy (unparsable url)';
  }
}

function getAgent() {
  const proxyUrl = readProxyUrl();
  if (!proxyUrl) return null;

  // 서버리스 인스턴스가 재사용되므로 agent도 재사용한다.
  // 환경변수가 바뀌면(프리뷰/프로덕션 전환 등) 새로 만든다.
  if (cachedAgent && cachedProxyUrl === proxyUrl) return cachedAgent;

  cachedAgent = new ProxyAgent(proxyUrl);
  cachedProxyUrl = proxyUrl;
  return cachedAgent;
}

/**
 * 고정 IP 프록시를 경유해 외부 API를 호출한다.
 *
 * 재시도는 하지 않는다 — 이 유틸의 주 사용처가 문자·알림톡 발송과 본인확인
 * 요청이라, 실패로 보이는 요청이 실제로는 전달됐을 수 있어서 자동 재시도가
 * 중복 발송을 만든다. 재시도가 필요하면 호출부가 멱등성을 보장한 뒤 직접 한다.
 *
 * @param {string} url
 * @param {object} [options] fetch 옵션 + 아래 확장
 * @param {number} [options.timeoutMs=10000]
 * @param {boolean} [options.requireProxy] 기본값: 배포 환경이면 true, 로컬이면 false
 */
export async function outboundFetch(url, options = {}) {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    requireProxy = isDeployed(),
    ...fetchOptions
  } = options;

  const agent = getAgent();

  if (!agent) {
    if (requireProxy) {
      throw new Error(
        'FIXIE_URL(또는 OUTBOUND_PROXY_URL)이 설정되지 않았습니다. ' +
          '고정 IP를 경유하지 않으면 알리고·NICE의 IP 화이트리스트에서 차단됩니다.'
      );
    }

    // 로컬 개발: 프록시 없이 그대로 나간다. 벤더에 개발 IP가 등록돼 있지
    // 않으면 여기서 나간 요청은 차단되는 게 정상이다.
    console.warn(
      `[outbound] 프록시 없이 직접 호출합니다 (${url}). ` +
        '벤더 IP 화이트리스트에 걸릴 수 있습니다.'
    );
  }

  const response = await undiciFetch(url, {
    ...fetchOptions,
    ...(agent ? { dispatcher: agent } : {}),
    signal: fetchOptions.signal ?? AbortSignal.timeout(timeoutMs)
  });

  return response;
}
