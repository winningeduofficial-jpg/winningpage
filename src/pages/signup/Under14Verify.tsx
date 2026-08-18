// [D-1] 법정대리인 본인확인 — docs/login-signup-renewal-spec.md §3.3 D-1,
// 노드 2393-10295(기본)/2393-10404(버튼 강조, 최종안 추정).
// §3.3 D-1 상태 매트릭스에 PASS 버튼 사이즈(52px/16px vs 60px/20px)가 미해결로 남아 있어,
// 임무 지시에 따라 3.75rem(60px)/text-xl(20px) 강조 변형(10404)을 채택한다 — 최종 확정 시
// size prop만 'default'로 되돌리면 된다.
//
// NICE 「통합인증」 표준창을 팝업으로 띄운다(src/pages/signup/identityVerification.ts).
// 인증이 끝나면 콜백이 opener로 결과를 postMessage 하고 팝업이 스스로 닫힌다.
//
// ⚠️ 버튼 라벨은 "PASS 간편 인증"이지만 실제로는 NICE 표준창이 열린다.
//   PASS는 벤더가 아니라 표준창 안에서 고를 수 있는 인증 수단 중 하나다(통신 3사 앱).
//   현재 계약 상품은 휴대폰 본인확인(CK490)이라 svc_types=['M']로 요청한다.
//
// ⚠️ 아직 연결되지 않은 것
//   인증 결과(request_id)를 가입 RPC가 소비하지 않는다. complete_signup_profile에는
//   본인확인을 받을 파라미터가 없어서 identity_verifications.consumed_at을 찍는 주체가
//   없다. 그래서 지금은 "인증했다"는 사실이 컨텍스트에만 남고 서버가 가입 시점에
//   재확인하지는 못한다. 휴대폰 인증과 같은 구멍이며 둘을 함께 막아야 한다.

import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import {
  AuthLayout,
  AuthTitle,
  InfoCard,
  PrimaryButton,
} from "@/components/auth";
import { useSignup } from "@/context/SignupContext";
import { runIdentityVerification } from "./identityVerification";

// 만 14세 미만 가입 플로우 전체를 가리는 플래그 — StudentBirth.jsx와 동일.
// off인 배포에서는 URL 직접 진입도 막는다.
const UNDER14_SIGNUP_ENABLED =
  import.meta.env.VITE_UNDER14_SIGNUP_ENABLED === "true";

export default function Under14Verify() {
  const navigate = useNavigate();
  const { memberType, isUnder14, updateVerification } = useSignup();

  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");

  // §3.2 흐름: S0(유형선택, 학생) -> S1(생년월일) -> 만 14세 미만 -> U0(이 화면).
  // memberType 없이 직접 진입하면 처음부터, 플래그가 off면 아예 이 플로우를 열지 않으므로
  // /signup으로 되돌린다. isUnder14가 true로 확정되지 않은 모든 경우(false=14세 이상 확정,
  // null=생년월일 미입력/판정 불가 포함)는 B-2(생년월일 입력)로 되돌려 대칭적으로 가드한다.
  useEffect(() => {
    if (memberType !== "student") {
      navigate("/signup", { replace: true });
      return;
    }
    if (!UNDER14_SIGNUP_ENABLED) {
      navigate("/signup", { replace: true });
      return;
    }
    if (isUnder14 !== true) {
      navigate("/signup/student/birth", { replace: true });
    }
  }, [memberType, isUnder14, navigate]);

  // ⚠️ 팝업 차단을 피하려면 이 핸들러가 runIdentityVerification을 직접 불러야 한다.
  //   중간에 다른 await를 끼워 넣으면 창이 사용자 제스처와 분리돼 차단된다.
  async function handlePassAuth() {
    if (verifying) return;

    setVerifying(true);
    setError("");

    try {
      const result = await runIdentityVerification({
        purpose: "under14_guardian",
      });

      if (!result.ok) {
        setError(result.message);
        return;
      }

      // requestId를 남겨둔다 — D-2 제출이 이 값을 가입 RPC에 실어 보내고,
      // 서버가 identity_verifications를 검증·소비한다(sql/84_under14_signup.sql).
      updateVerification("pass", {
        verified: true,
        requestId: result.requestId,
        verifiedAt: Date.now(),
      });

      navigate("/signup/student/under14");
    } finally {
      setVerifying(false);
    }
  }

  return (
    <AuthLayout width="wide">
      {/* 타이틀 1064px 폭(§3.3 D-1) — 표준 400px AuthLayout 폭으로는 2번째 줄이 줄바꿈되므로
          이 화면만 width="wide"로 넓게 지정하고, 하위 카드/버튼은 각자 폭을 좁혀 중앙 정렬한다. */}
      <AuthTitle
        line1="만 14세미만 회원의 가입을 위해"
        line2="최초 1회 법정대리인의 본인인증 절차가 필요합니다."
        line1Color="ink"
        line2Color="ink"
      />

      <div className="w-full max-w-[25.25rem]">
        <InfoCard variant="card">
          <div className="flex items-center gap-3">
            <Check size={20} strokeWidth={2} className="shrink-0 text-line" />
            <span className="font-medium text-primary">필수</span>
            <span className="text-ink">
              학부모로서 자녀의 위닝에듀 회원가입에 동의
            </span>
          </div>
        </InfoCard>
      </div>

      <div className="flex w-full max-w-[25rem] flex-col gap-3">
        <PrimaryButton
          size="lg"
          onClick={handlePassAuth}
          disabled={verifying}
          loading={verifying}
        >
          PASS 간편 인증
        </PrimaryButton>

        {verifying && (
          <p className="text-center text-sm text-ink-sub">
            인증 창에서 본인확인을 진행해 주세요. 완료되면 자동으로 넘어갑니다.
          </p>
        )}

        {error && <p className="text-center text-sm text-red-500">{error}</p>}
      </div>
    </AuthLayout>
  );
}
