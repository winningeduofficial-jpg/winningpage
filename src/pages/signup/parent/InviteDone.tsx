// [E-7] 초대 전송 완료 — docs/login-signup-renewal-spec.md §3.3 E-7, 노드 2393:11662.
// InviteChild(E-6)에서 navigate state로 전달된 childName/inviteUrl을 표시. 가입 시 자동
// 연결 로직은 전부 백엔드 신규(§4.2-3 GAP) — inviteUrl은 공통 가입 링크 mock 값
// (토큰 딥링크 미사용, 2026-07-30 기획 결정).
import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  AuthLayout,
  AuthTitle,
  OutlineButton,
  TextField,
  TextLinkButton,
} from "../../../components/auth";
import { useSignup } from "../../../context/SignupContext";

export default function InviteDone() {
  const navigate = useNavigate();
  const location = useLocation();
  const { memberType, parentSignupCompleted, resetSignup } = useSignup();

  const childName = location.state?.childName || "";
  const inviteUrl = location.state?.inviteUrl || "winningedu.kr/signup";

  // memberType 단독 가드는 실제 가입 완료 없이도 URL 직접 진입으로 뚫릴 수 있어
  // parentSignupCompleted(ParentForm 가입 성공 시에만 true)를 함께 요구한다.
  useEffect(() => {
    if (memberType !== "parent" || !parentSignupCompleted) {
      navigate("/signup", { replace: true });
    }
  }, [memberType, parentSignupCompleted, navigate]);

  function handleGoHome() {
    resetSignup();
    navigate("/");
  }

  return (
    <AuthLayout>
      <div className="flex flex-col items-center gap-3 text-center">
        <AuthTitle
          line1={
            <span className="sm:whitespace-nowrap">
              초대 링크를 문자로 보내드렸어요
            </span>
          }
        />
        <p className="break-keep text-base font-medium text-ink sm:text-xl">
          {childName
            ? `${childName}님에게 초대 문자를 전송했습니다.`
            : "초대 문자를 전송했습니다."}
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
          onClick={() =>
            navigate("/signup/parent/link/add", { state: { childName } })
          }
          tone="primary"
          size="md"
        >
          + 자녀 추가하기
        </TextLinkButton>
      </div>
    </AuthLayout>
  );
}
