// [C-2] 학생 가입 완료 — docs/login-signup-renewal-spec.md §3.3 C-2,
// 노드 2393:10548 = 2393:10182(픽셀 단위 동일 중복 프레임).
// 학부모 연동 코드의 발급 주체/저장 위치가 시안 데이터에 없다(§4 GAP: 백엔드 신규
// 기능) — 이 페이지는 임시로 6자리 mock 코드를 생성해 SignupContext.linkCode에 보관하고
// 표시한다. TODO: StudentForm의 complete_signup_profile RPC 응답(또는 별도 발급 API)에서
// 실제 코드를 받아 setLinkCode로 채우도록 교체해야 한다.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { AuthLayout, AuthTitle, InfoCard, PrimaryButton, TextLinkButton } from '../../components/auth';
import { useSignup } from '../../context/SignupContext';

// TODO: 실제 연동 코드는 백엔드 발급 API 응답값으로 교체 — 현재는 6자리 mock.
function generateMockLinkCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// 자녀 연동 코드 발급/표시는 백엔드 발급 API가 없어 mock으로 대체한 것이라(위 TODO) 실제
// 배포 경로에는 노출하지 않는다 — 이 플래그가 켜진 경우에만 mock 코드 섹션을 렌더링한다.
const CHILD_LINK_ENABLED = import.meta.env.VITE_CHILD_LINK_ENABLED === 'true';

export default function StudentComplete() {
  const navigate = useNavigate();
  const { formData, linkCode, setLinkCode, signupCompleted, resetSignup } = useSignup();
  const [copied, setCopied] = useState(false);

  // StudentForm의 complete_signup_profile RPC 성공 직후에만 setSignupCompleted(true)가
  // 호출되므로, 이 화면을 거치지 않고 직접 진입(새로고침 포함)한 경우를 이 플래그로 막는다.
  useEffect(() => {
    if (!signupCompleted) {
      navigate('/signup/student', { replace: true });
    }
  }, [signupCompleted, navigate]);

  useEffect(() => {
    if (CHILD_LINK_ENABLED && !linkCode) {
      setLinkCode(generateMockLinkCode());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const studentName = formData.name?.trim() || '회원';

  async function handleCopyCode() {
    if (!linkCode) return;

    try {
      await navigator.clipboard.writeText(linkCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      // TODO: 클립보드 API 미지원 환경 대비 폴백(예: 임시 textarea + execCommand) 필요.
      console.error('연동 코드 복사 오류:', error);
    }
  }

  function handleStartDiagnosis() {
    // TODO(§3.3 C-2 "함의"): 이 화면은 "무료 진단 시작하기" CTA로 바로 진입하는 시안이라
    // 가입 직후 로그인 상태 유지가 전제로 보인다. 그러나 StudentForm은 AS-IS 정책대로
    // 가입 완료 시 signOut을 유지하므로, 실제로는 로그인 세션이 없는 상태에서 이 버튼을
    // 누르게 된다 — 정책 확정 전까지는 그대로 두고 확인 필요.
    resetSignup();
    navigate('/free-diagnosis');
  }

  function handleGoHome() {
    resetSignup();
  }

  return (
    <AuthLayout>
      {/* 가입 완료 축하 모먼트(impeccable animate 제안 5) — 배지 1개만, 과하지 않게.
          celebrate-badge는 mount 1회만 재생되며(route 재진입 시에만 다시 보임)
          prefers-reduced-motion 시 index.css에서 애니메이션이 꺼지고 배지는 정적으로 보인다. */}
      <div
        aria-hidden="true"
        className="celebrate-badge flex h-16 w-16 items-center justify-center rounded-full bg-surface-info text-primary"
      >
        <Sparkles className="h-8 w-8" strokeWidth={1.75} />
      </div>

      <AuthTitle
        line1={
          <>
            <span className="text-primary">{studentName}님</span>, 위닝에듀 회원이 되신 것을
            환영해요
          </>
        }
      />

      <p className="break-keep text-center text-base text-ink sm:text-xl">
        {studentName} 학생, 위닝에듀에 온 걸 환영해요
      </p>

      {/* TODO: 실제 연동 코드는 백엔드 발급 API 응답값으로 교체 — 현재는 6자리 mock(위
          generateMockLinkCode). 백엔드 미연동 상태로는 배포 경로에 노출하지 않도록
          VITE_CHILD_LINK_ENABLED 플래그로 감싼다. */}
      {CHILD_LINK_ENABLED && (
        <div className="flex w-full flex-col gap-4">
          <InfoCard variant="card">
            코드를 학부모님께 알려주면 학부모 대시보드에 내 학습 현황이 자동으로 연결돼요
          </InfoCard>

          <div className="flex w-full items-center justify-center rounded-[0.875rem] border border-line py-4 text-xl font-medium text-accent">
            {linkCode}
          </div>

          <TextLinkButton as="button" tone="accent" size="xs" underline onClick={handleCopyCode}>
            {copied ? '복사되었습니다' : '코드 복사하기'}
          </TextLinkButton>
        </div>
      )}

      <div className="flex w-full flex-col gap-3">
        <PrimaryButton size="default" radius="default" onClick={handleStartDiagnosis}>
          무료 진단 시작하기
        </PrimaryButton>

        <TextLinkButton
          as="link"
          to="/"
          tone="muted"
          weight="medium"
          onClick={handleGoHome}
          className="flex h-[3.25rem] w-full items-center justify-center"
        >
          홈으로 가기
        </TextLinkButton>
      </div>
    </AuthLayout>
  );
}
