// 학부모 온보딩(E-1~E-8) 전용 mock API — docs/login-signup-renewal-spec.md §4.2 GAP 참고.
// 아래 함수는 전부 프론트 전용 placeholder이며, 실제 백엔드(Edge Function/RPC)가
// 준비되기 전까지 UI 흐름 확인용으로만 사용한다.
//
// TODO(백엔드 §4.2-1): 카카오 알림톡 전화번호 인증 발송/검증/재발송 Edge Function 미구현.
// TODO(백엔드 §5.5 순서5): 학부모 가입 완료 시퀀스(is_email_available→signUp→verifyOtp→
//   complete_signup_profile)는 기존 RPC를 재사용할 예정 — 이 mock은 그 자리의 placeholder.
// TODO(백엔드 §4.2-3): 연결코드 발급/조회 RPC, 보호자-자녀 관계 테이블, 초대 레코드+SMS
//   발송은 전부 신규 백엔드 설계 대상. 초대 링크는 토큰 딥링크(`/join/:code`)가 아니라
//   공통 가입 링크 발송으로 확정(2026-07-30 기획 결정).

const MOCK_DELAY = 500;

function delay(ms = MOCK_DELAY) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 실제로는 서버가 발송한 코드를 서버가 검증해야 한다(코드 자체를 클라이언트에 노출하면 안 됨).
// mock 단계에서만 편의상 발송 시점 코드를 반환해 페이지 쪽에서 로컬 비교에 사용한다.
export async function requestPhoneVerificationCode(_phone) {
  await delay();
  return { success: true, mockCode: '123456' };
}

export async function verifyPhoneVerificationCode(_phone, code, mockCode) {
  await delay(300);
  return code === mockCode;
}

export async function requestEmailVerificationCode(_email) {
  await delay();
  return { success: true, mockCode: '123456' };
}

export async function verifyEmailVerificationCode(_email, code, mockCode) {
  await delay(300);
  return code === mockCode;
}

export async function completeParentSignup(_formData) {
  await delay();
  return { success: true };
}

// §3.3 C-2 예시 연동 코드(990624)를 mock 조회 데이터로 재사용.
const MOCK_CHILD_BY_CODE = {
  990624: { name: '김주원', grade: '고3', school: '울산외국어고등학교' }
};

export async function findChildByLinkCode(code) {
  await delay();
  return MOCK_CHILD_BY_CODE[code] || null;
}

export async function connectChild(_code) {
  await delay(300);
  return { success: true };
}

// 공통 가입 링크 발송으로 확정(2026-07-30 기획 결정) — 토큰 딥링크(`/join/:code`) 미사용.
// SMS 실발송은 여전히 백엔드 TODO(§4.2-3).
export async function sendChildInvite({ name: _name, phone: _phone }) {
  await delay();
  const inviteUrl =
    typeof window !== 'undefined' ? `${window.location.origin}/signup` : 'winningedu.kr/signup';
  return { success: true, inviteUrl };
}
