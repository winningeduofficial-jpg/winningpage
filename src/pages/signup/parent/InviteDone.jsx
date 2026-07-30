// [E-7] 초대 전송 완료 — docs/login-signup-renewal-spec.md §3.3 E-7, 노드 2393:11662.
// InviteChild(E-6)에서 navigate state로 전달된 childName/inviteUrl을 표시. 초대 코드
// 생성/만료/가입 시 자동 연결 로직은 전부 백엔드 신규(§4.2-3 GAP) — inviteUrl은 mock 값.
import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AuthLayout, AuthTitle, TextField, OutlineButton, TextLinkButton } from '../../../components/auth';
import { useSignup } from '../../../context/SignupContext';

export default function InviteDone() {
  const navigate = useNavigate();
  const location = useLocation();
  const { memberType, resetSignup } = useSignup();

  const childName = location.state?.childName || '';
  const inviteUrl = location.state?.inviteUrl || 'winningedu.kr/join/8F3K2D';

  useEffect(() => {
    if (memberType !== 'parent') {
      navigate('/signup', { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberType]);

  function handleGoHome() {
    resetSignup();
    navigate('/');
  }

  return (
    <AuthLayout>
      <div className="flex flex-col items-center gap-3 text-center">
        <AuthTitle line1="초대 링크를 문자로 보내드렸어요" />
        <p className="text-xl font-medium text-ink">
          {childName ? `${childName}님에게 초대 문자를 전송했습니다.` : '초대 문자를 전송했습니다.'}
        </p>
      </div>

      <div className="w-full">
        <TextField
          label="초대링크"
          id="inviteUrl"
          name="inviteUrl"
          value={inviteUrl}
          onChange={() => {}}
          readOnly
        />
      </div>

      <div className="flex w-full flex-col gap-5">
        <OutlineButton onClick={handleGoHome} tone="primary" radius="lg">
          홈으로 가기
        </OutlineButton>

        <TextLinkButton
          onClick={() => navigate('/signup/parent/link/add', { state: { childName } })}
          tone="primary"
          size="md"
        >
          + 자녀 추가하기
        </TextLinkButton>
      </div>
    </AuthLayout>
  );
}
