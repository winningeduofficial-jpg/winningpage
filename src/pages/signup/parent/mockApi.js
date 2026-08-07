// 학부모 온보딩(E-1~E-8)에서 아직 백엔드가 없는 자리만 남은 mock.
//
// 옮겨간 것들
//   requestPhoneVerificationCode / verifyPhoneVerificationCode
//     → src/lib/phoneVerification.js (api/send-phone-code, api/verify-phone-code)
//   requestEmailVerificationCode / verifyEmailVerificationCode
//     → src/lib/signupEmailAuth.js (Supabase Auth OTP)
//   completeParentSignup
//     → complete_signup_profile RPC (ParentForm에서 직접 호출)
//   findChildByLinkCode / connectChild
//     → src/lib/parentLink.js (api/lookup-child, request_parent_link RPC)
//
// TODO(백엔드): 자녀 초대는 아직 설계 단계다. 알림톡 템플릿 미등록이고, 전화번호로
//   기존 회원을 어떻게 매칭할지도 미정이라 착수하지 못했다. 초대 링크는 토큰
//   딥링크(`/join/:code`)가 아니라 공통 가입 링크 발송으로 확정(2026-07-30 기획 결정).

const MOCK_DELAY = 500;

function delay(ms = MOCK_DELAY) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sendChildInvite({ name: _name, phone: _phone }) {
  await delay();
  const inviteUrl =
    typeof window !== 'undefined' ? `${window.location.origin}/signup` : 'winningedu.kr/signup';
  return { success: true, inviteUrl };
}
