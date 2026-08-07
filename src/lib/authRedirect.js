// ?redirect= 복귀 규약의 단일 검증·조립 지점.
// 로그인 게이트에서 튕긴 사용자를 어디로 되돌려보낼지(safeRedirect)와,
// 그 목적지를 /login URL에 어떻게 실어보낼지(buildLoginUrl)를 여기서만 정의한다.
// 호출부가 직접 문자열을 조립하면 검증·인코딩이 빠진 오픈 리다이렉트 구멍이
// 생기기 쉬우므로, 모든 로그인 이동은 이 두 함수를 거치게 한다.

// 오픈 리다이렉트 방지: 같은 사이트 내부 경로만 통과시키고, 그 외는 모두 '/'로 강등한다.
export function safeRedirect(value) {
  // 문자열이 아니면(null, undefined, 숫자 등) 즉시 강등.
  if (typeof value !== 'string') return '/';

  // URLSearchParams.get()은 퍼센트 디코딩만 하고 trim은 하지 않는다.
  // 예: '  //evil.com' 처럼 앞쪽에 공백이나 제어문자가 섞여 들어오면
  // 아래 startsWith 검사가 원래 의도한 값과 다른 값을 보고 통과시킬 수 있으므로
  // 검사 전에 반드시 trim하고, 반환값도 trim된 값으로 통일한다.
  const trimmed = value.trim();

  // 제어문자(U+0000~U+001F, tab/LF/CR 포함) 차단. trim()은 문자열 앞뒤 공백만
  // 제거하므로 중간에 낀 제어문자는 그대로 남는다. 예: '/\t/evil.com'은 '/'로
  // 시작하고 '//'로도 '/\\'로도 시작하지 않아 아래 검사를 전부 통과하지만,
  // WHATWG URL 파서는 파싱 전에 tab/LF/CR을 제거하므로 '//evil.com'과 동등하게
  // 해석되어 외부 도메인으로 튄다. 검사 순서와 무관하게 가장 먼저 걸러낸다.
  if (/[\x00-\x1f]/.test(trimmed)) return '/';

  // 빈 문자열이거나 '/'로 시작하지 않으면 전부 차단.
  // 예: '', 'https://evil.com', 'javascript:alert(1)', 'data:text/html,...'
  if (!trimmed || !trimmed.startsWith('/')) return '/';

  // 프로토콜 상대 URL(protocol-relative URL) 차단.
  // 예: '//evil.com' → 브라우저가 현재 스킴(https:)을 그대로 붙여
  // 'https://evil.com'으로 해석해 외부 도메인으로 이동한다.
  if (trimmed.startsWith('//')) return '/';

  // 백슬래시 변형 차단. 예: '/\\evil.com', '/\\/evil.com'
  // 위 두 검사는 통과하지만, 브라우저 URL 파서가 '\\'를 '/'로 정규화하므로
  // 실제로는 '//evil.com'과 동등하게 해석되어 외부 도메인으로 튈 수 있다.
  // 두 번째 글자가 '/' 또는 '\\'이면 거부한다.
  if (trimmed[1] === '/' || trimmed[1] === '\\') return '/';

  return trimmed;
}

// 로그인 페이지 URL을 조립하는 단일 지점. target은 이미 search까지 붙은
// 경로 문자열 하나를 받는다(예: '/demo/self-assessment', '/admin?tab=orders').
// encodeURIComponent를 강제해, target 자체에 쿼리스트링이 섞여 있어도
// /login?redirect=... 파싱 시 첫 '&'에서 잘리지 않게 한다.
export function buildLoginUrl(target) {
  return `/login?redirect=${encodeURIComponent(safeRedirect(target))}`;
}
