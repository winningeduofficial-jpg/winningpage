// [E-4] 자녀 연결 요청 완료 — docs/login-signup-renewal-spec.md §3.3 E-4, 노드 2393-11191.
// LinkCode(E-3)에서 navigate state로 전달된 child/status를 받아 렌더한다.
//
// ⚠️ 시안과 갈리는 지점 — 여긴 "완료"가 아니라 "승인 대기"다
//   request_parent_link는 status='pending'인 행을 만들 뿐이고 자녀가 승인해야 연결이
//   성립한다(sql/40_auth_signup.sql [8]). 시안(2393-11191)은 자녀의 학습 요약 지표를
//   바로 보여주는데, 그대로 두면 ① 승인 전인데 연결된 것처럼 읽히고 ② 아직 볼 권한도
//   없는 자녀 데이터를 보여주는 화면이 된다. 그래서 지표 블록을 걷어내고 대기 상태를
//   명시한다. 지표는 승인 이후 화면(마이페이지)에 데이터 소스가 생기면 그쪽에 붙는 게 맞다.
import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router";
import {
  AuthLayout,
  AuthTitle,
  OutlineButton,
  TextLinkButton,
} from "@/components/auth";
import { useSignup } from "@/context/SignupContext";

export default function LinkDone() {
  const navigate = useNavigate();
  const location = useLocation();
  const { memberType, parentSignupCompleted, resetSignup } = useSignup();

  const child = location.state?.child || null;

  // memberType 단독 가드는 실제 가입 완료 없이도 URL 직접 진입으로 뚫릴 수 있어
  // parentSignupCompleted(ParentForm 가입 성공 시에만 true)를 함께 요구한다.
  // ⚠️ 마운트 시점 값으로 한 번만 판정한다 — StudentComplete와 같은 이유(2026-08-18).
  //   화면을 떠나며 resetSignup()을 부르면 memberType과 완료 플래그가 함께 초기화된다.
  //   가드가 그 값을 계속 지켜보고 있으면 그 순간 다시 돌아 /signup으로 되돌려,
  //   "홈으로 가기"가 가입 화면으로 튀었다.
  const entryAllowedRef = useRef(
    memberType === "parent" && parentSignupCompleted,
  );

  useEffect(() => {
    if (!entryAllowedRef.current) {
      navigate("/signup", { replace: true });
    }
  }, [navigate]);

  function handleGoHome() {
    resetSignup();
    navigate("/");
  }

  const childLabel = [child?.grade, child?.school].filter(Boolean).join(" ");

  return (
    <AuthLayout>
      <AuthTitle
        line1="연결 요청을 보냈어요"
        line1Color="ink"
        line2={
          child?.name
            ? `${child.name} 학생의 승인을 기다리고 있어요`
            : "자녀의 승인을 기다리고 있어요"
        }
        line2Color="ink"
      />

      <div className="w-full rounded-[1.25rem] border border-line px-5 py-6 sm:px-8 sm:py-8">
        <p className="text-left text-xl font-medium text-ink-title">
          {child?.name}
        </p>
        {childLabel && (
          <p className="mt-2 text-left text-base text-ink-sub">{childLabel}</p>
        )}

        <div className="mx-auto my-6 w-full max-w-[20rem] border-t border-line" />

        <p className="text-center text-base font-medium text-primary">
          승인 대기 중
        </p>
        <p className="mt-2 break-keep text-center text-sm text-ink-sub">
          자녀가 마이페이지에서 요청을 승인하면 연결이 완료돼요.
        </p>
      </div>

      <TextLinkButton
        onClick={() =>
          navigate("/signup/parent/link/add", {
            state: { childName: child?.name },
          })
        }
        tone="primary"
        size="md"
      >
        + 자녀 추가하기
      </TextLinkButton>

      <OutlineButton onClick={handleGoHome} tone="muted" radius="xl">
        홈으로 가기
      </OutlineButton>
    </AuthLayout>
  );
}
