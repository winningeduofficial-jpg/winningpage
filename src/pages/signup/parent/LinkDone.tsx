// [E-4] 자녀 연결 완료 — docs/login-signup-renewal-spec.md §3.3 E-4, 노드 2393-11191.
// LinkCode(E-3)에서 navigate state로 전달된 child/status를 받아 렌더한다.
//
// request_parent_link는 코드 입력 즉시 status='approved'로 연결을 확정한다
// (sql/40_auth_signup.sql, 2026-08-18 결정 — 별도 학생 승인 단계 없음).
// 시안(2393-11191)의 자녀 학습 요약 지표는 아직 데이터 소스가 없어 그대로
// 붙이지 않는다 — 지표는 마이페이지 쪽에 데이터가 생기면 그쪽에 붙는 게 맞다.
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
        line1="자녀와 연결됐어요"
        line1Color="ink"
        line2={
          child?.name
            ? `${child.name} 학생과 연결이 완료됐어요`
            : "연결이 완료됐어요"
        }
        line2Color="ink"
      />

      <div className="w-full rounded-perf-modal border border-line px-5 py-6 sm:px-8 sm:py-8">
        <p className="text-left text-xl font-medium text-ink-title">
          {child?.name}
        </p>
        {childLabel && (
          <p className="mt-2 text-left text-base text-ink-sub">{childLabel}</p>
        )}

        <div className="mx-auto my-6 w-full max-w-[20rem] border-t border-line" />

        <p className="text-center text-base font-medium text-primary">
          연결 완료
        </p>
        <p className="mt-2 break-keep text-center text-sm text-ink-sub">
          이제 마이페이지에서 자녀 정보를 확인할 수 있어요.
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
