// [D-1] 법정대리인 PASS 본인인증 안내 — docs/login-signup-renewal-spec.md §3.3 D-1,
// 노드 2393-10295(기본)/2393-10404(버튼 강조, 최종안 추정).
// §3.3 D-1 상태 매트릭스에 PASS 버튼 사이즈(52px/16px vs 60px/20px)가 미해결로 남아 있어,
// 임무 지시에 따라 3.75rem(60px)/text-xl(20px) 강조 변형(10404)을 채택한다 — 최종 확정 시
// size prop만 'default'로 되돌리면 된다.
//
// PASS 본인인증 자체(NICE/토스페이먼츠 연동, CI/DI 수신·저장)는 백엔드+외부 연동이 필요한
// 신규 기능이라(§4.2-2 GAP 분석) 프론트만으로 완결할 수 없다. 지금은 인증 완료를 가정한
// 스텁으로 verification.pass.verified만 true로 세팅하고 다음 화면(D-2)으로 이동한다.
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check } from 'lucide-react';
import { AuthLayout, AuthTitle, InfoCard, PrimaryButton } from '../../components/auth';
import { useSignup } from '../../context/SignupContext';

// 14세 미만 가입 플로우는 아직 백엔드 연동이 없는 데드엔드라 기본 off — StudentBirth.jsx와
// 동일 플래그. off인 배포에서는 URL 직접 진입도 막는다.
const UNDER14_SIGNUP_ENABLED = import.meta.env.VITE_UNDER14_SIGNUP_ENABLED === 'true';

export default function Under14Verify() {
  const navigate = useNavigate();
  const { memberType, isUnder14, updateVerification } = useSignup();

  // §3.2 흐름: S0(유형선택, 학생) -> S1(생년월일) -> 만 14세 미만 -> U0(이 화면).
  // memberType 없이 직접 진입하면 처음부터, 플래그가 off면 아예 이 플로우를 열지 않으므로
  // /signup으로 되돌린다. isUnder14가 true로 확정되지 않은 모든 경우(false=14세 이상 확정,
  // null=생년월일 미입력/판정 불가 포함)는 B-2(생년월일 입력)로 되돌려 대칭적으로 가드한다.
  useEffect(() => {
    if (memberType !== 'student') {
      navigate('/signup', { replace: true });
      return;
    }
    if (!UNDER14_SIGNUP_ENABLED) {
      navigate('/signup', { replace: true });
      return;
    }
    if (isUnder14 !== true) {
      navigate('/signup/student/birth', { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberType, isUnder14]);

  // TODO(PASS 연동): 실제로는 PASS 인증창 호출 -> 콜백 수신 -> CI/DI 저장 -> 서버 검증 성공
  // 시에만 다음 이동으로 교체해야 한다(§4.2-2). 지금은 클릭 즉시 인증 완료로 간주하는 스텁.
  function handlePassAuth() {
    updateVerification('pass', { verified: true });
    navigate('/signup/student/under14');
  }

  return (
    <AuthLayout maxWidth="66.5rem" spacingY="6.25rem" gap="2.5rem">
      {/* 타이틀 1064px 폭(§3.3 D-1) — 표준 400px AuthLayout 폭으로는 2번째 줄이 줄바꿈되므로
          이 화면만 maxWidth를 넓게 override하고, 하위 카드/버튼은 각자 폭을 좁혀 중앙 정렬한다. */}
      <AuthTitle
        line1="만 14세미만 회원의 가입을 위해"
        line2="최초 1회 법정대리인의 본인인증 절차가 필요합니다."
        line1Color="ink"
        line2Color="ink"
      />

      <div className="w-full max-w-[25.25rem]">
        <InfoCard variant="card">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-white">
              <Check size={14} strokeWidth={3} />
            </span>
            <span className="font-medium text-primary">필수</span>
            <span className="text-ink">학부모로서 자녀의 위닝에듀 회원가입에 동의</span>
          </div>
        </InfoCard>
      </div>

      <div className="w-full max-w-[25rem]">
        <PrimaryButton size="lg" onClick={handlePassAuth}>
          PASS 간편 인증
        </PrimaryButton>
      </div>
    </AuthLayout>
  );
}
