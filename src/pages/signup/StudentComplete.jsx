// [C-2] 학생 가입 완료 — docs/login-signup-renewal-spec.md §3.3 C-2,
// 노드 2393:10548 = 2393:10182(픽셀 단위 동일 중복 프레임).
//
// 연결코드는 가입 RPC가 발급한다(sql/40_auth_signup.sql [7] — complete_signup_profile이
// student_link_codes에 없으면 issue_student_link_code로 만들고 응답의 link_code로 준다).
// StudentForm이 그 값을 SignupContext에 넣어주므로 이 화면은 **표시만** 한다.
//
// ⚠️ 예전에는 이 화면이 6자리 mock 코드를 직접 만들어 보여줬다. 그 코드는 DB에 없어서
//   학부모가 입력하면 link_code_not_found가 났다 — 화면상으로는 정상이라 발견이 어렵다.
//   여기서 코드를 "만들어내면" 안 된다. 없으면 없다고 보여줘야 한다.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthLayout, AuthTitle, InfoCard, PrimaryButton, TextLinkButton } from '../../components/auth';
import { useSignup } from '../../context/SignupContext';

// 연결코드 안내 노출 여부. 학부모 연결 기능 오픈 시점에 맞춰 켠다.
const CHILD_LINK_ENABLED = import.meta.env.VITE_CHILD_LINK_ENABLED === 'true';

export default function StudentComplete() {
  const navigate = useNavigate();
  const { formData, linkCode, signupCompleted, resetSignup } = useSignup();
  const [copied, setCopied] = useState(false);

  // StudentForm의 complete_signup_profile RPC 성공 직후에만 setSignupCompleted(true)가
  // 호출되므로, 이 화면을 거치지 않고 직접 진입(새로고침 포함)한 경우를 이 플래그로 막는다.
  useEffect(() => {
    if (!signupCompleted) {
      navigate('/signup/student', { replace: true });
    }
  }, [signupCompleted, navigate]);

  const studentName = formData.name?.trim() || '회원';
  // 시안 호칭은 성을 뗀 이름만 사용(예: '김주원' → '주원님'). 한국식 3자 이상 이름 기준
  // 첫 글자를 성으로 간주해 제외한다. TODO: 남궁/황보 등 복성(2자 성)은 미대응 — 첫
  // 한 글자만 성으로 취급하는 단순 규칙이라 복성 이름은 잘못 잘릴 수 있다.
  const greetingName = studentName.length >= 3 ? studentName.slice(1) : studentName;

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
    // resetSignup은 가입 플로우 상태(sessionStorage + 컨텍스트)만 비운다. 로그인
    // 세션은 건드리지 않으므로 이 CTA는 로그인된 채로 진단에 들어간다
    // (StudentForm이 가입 후 signOut 하지 않도록 2026-08-06에 바꿨다).
    resetSignup();
    navigate('/learning-diagnosis');
  }

  function handleGoHome() {
    resetSignup();
  }

  return (
    <AuthLayout>
      <AuthTitle
        line1={
          <>
            <span className="text-ink">{greetingName}님</span>
            <span className="text-primary">, 위닝에듀 회원이 되신 것을 환영해요</span>
          </>
        }
      />

      <p className="break-keep text-center text-base text-ink sm:text-xl">
        {studentName} 학생, 위닝에듀에 온 걸 환영해요
      </p>

      {/* 코드가 없으면 빈 자리를 보여주는 대신 안내로 대체한다. 여기서 임의의 코드를
          만들어 채우면 학부모가 입력했을 때 찾을 수 없는 코드가 된다. */}
      {CHILD_LINK_ENABLED && linkCode && (
        <div className="flex w-full flex-col gap-4">
          <InfoCard variant="card" className="text-center">
            코드를 학부모님께 알려주면 학부모 대시보드에 내 학습 현황이 자동으로 연결돼요
          </InfoCard>

          <div className="flex w-full items-center justify-center rounded-[0.875rem] py-4 text-xl font-medium tracking-[0.2em] text-accent">
            {linkCode}
          </div>

          <TextLinkButton
            as="button"
            tone="accent"
            size="xs"
            underline
            onClick={handleCopyCode}
            className="self-center"
          >
            {copied ? '복사되었습니다' : '코드 복사하기'}
          </TextLinkButton>
        </div>
      )}

      {CHILD_LINK_ENABLED && !linkCode && (
        <InfoCard variant="card" className="text-center">
          연결코드는 마이페이지에서 확인할 수 있어요
        </InfoCard>
      )}

      <div className="flex w-full flex-col gap-3">
        <PrimaryButton size="default" radius="default" onClick={handleStartDiagnosis}>
          학습 진단 시작하기
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
