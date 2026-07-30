// [E-8] 학부모 홈 — 연결된 자녀 없음(빈 상태) — docs/login-signup-renewal-spec.md §3.3 E-8,
// 노드 2393:11777. 서브타이틀 "자녀 앱 설정 > 연결코드에서..."는 E-3의 "자녀 마의페이지 >
// 연결코드"와 표기가 다르지만, 이 화면 원문(11777) 그대로 재현한다(§3.3/§6.3: 표기 불일치는
// 확인 필요 항목으로 남겨두고 임의 통일하지 않음).
// 타이틀의 "이혜진 학부모님"은 학부모 본인 이름 기준(E-1에서 입력한 formData.name)이며,
// E-4의 자녀 이름 기준 호칭과는 별개다(§3.3 E-4 주석: 호칭 규칙 확인 필요, 이 화면은 본인
// 이름 기준으로 데이터가 있으므로 그대로 사용).
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthLayout, AuthTitle, OutlineButton, TextLinkButton } from '../../../components/auth';
import { useSignup } from '../../../context/SignupContext';

export default function ParentHome() {
  const navigate = useNavigate();
  const { memberType, formData, resetSignup } = useSignup();

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
        <AuthTitle
          line1="안녕하세요,"
          line1Color="ink"
          line2={formData.name ? `${formData.name} 학부모님` : '학부모님'}
          line2Color="ink"
        />
        <p className="text-xl font-medium text-ink">
          자녀 앱 설정 &gt; 연결코드에서 6자리 숫자를 확인할 수 있어요
        </p>
      </div>

      <div className="flex w-full items-center justify-center rounded-2xl border border-line px-6 py-10 text-base text-ink-sub">
        아직 연결된 자녀가 없어요
      </div>

      <TextLinkButton onClick={() => navigate('/signup/parent/link/add')} tone="primary" size="md">
        + 자녀 추가하기
      </TextLinkButton>

      <OutlineButton onClick={handleGoHome} tone="primary" radius="lg">
        홈으로 가기
      </OutlineButton>
    </AuthLayout>
  );
}
