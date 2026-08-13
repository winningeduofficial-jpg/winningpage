// [B-2] 학생 생년월일 입력 — docs/login-signup-renewal-spec.md §3.3 B-2, 노드 2393:10073.
// 생년월일 8자리 입력 → SignupContext.setBirthDate로 저장(만 14세 판정은 컨텍스트가 계산)
// → 만 14세 이상이면 /signup/student(C-1), 미만이면 /signup/student/under14/verify(D-1)로 이동.
//
// 연령 판정은 setBirthDate 호출 후 컨텍스트 state 갱신을 기다리지 않고(setState는 비동기),
// 제출 시점에 즉시 분기 판단이 필요하다. 중복 구현을 피하기 위해 SignupContext.jsx가
// export하는 computeIsUnder14(강화된 검증: 1900년 미만/미래 날짜/Date 롤오버 거부)를
// 그대로 재사용한다(§3.3 B-2: "생일이 지나지 않은 경우 만 14세 미만으로 처리").
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AuthLayout,
  AuthTitle,
  InfoCard,
  PrimaryButton,
  TextField,
} from "../../components/auth";
import { computeIsUnder14, useSignup } from "../../context/SignupContext";

// 14세 미만 가입 플로우(D-1 PASS 본인인증 스텁 등)는 아직 백엔드 연동이 없는 데드엔드라
// 기본 off. off인 배포에서는 14세 미만으로 판정돼도 under14 라우트로 보내지 않고 준비 중
// 안내만 표시한다(Under14Verify/Under14Form의 URL 직접 진입 가드와 짝을 이룬다).
const UNDER14_SIGNUP_ENABLED =
  import.meta.env.VITE_UNDER14_SIGNUP_ENABLED === "true";

export default function StudentBirth() {
  const navigate = useNavigate();
  const { memberType, birthDate, setBirthDate } = useSignup();
  const [value, setValue] = useState(birthDate || "");
  const [error, setError] = useState("");
  const [showUnder14ComingSoon, setShowUnder14ComingSoon] = useState(false);

  // memberType 없이(예: 새로고침 전 이탈, 직접 URL 진입) 이 화면에 들어온 경우 첫 단계로 되돌림.
  useEffect(() => {
    if (memberType !== "student") {
      navigate("/signup", { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberType]);

  function handleChange(next) {
    setValue(next.replace(/\D/g, "").slice(0, 8));
    if (error) setError("");
    if (showUnder14ComingSoon) setShowUnder14ComingSoon(false);
  }

  function handleContinue() {
    if (value.length !== 8) {
      setError("생년월일 8자리를 정확히 입력해 주세요.");
      return;
    }

    const isUnder14 = computeIsUnder14(value);

    if (isUnder14 === null) {
      setError("올바른 생년월일을 입력해 주세요.");
      return;
    }

    if (isUnder14 && !UNDER14_SIGNUP_ENABLED) {
      setShowUnder14ComingSoon(true);
      return;
    }

    setBirthDate(value);
    navigate(isUnder14 ? "/signup/student/under14/verify" : "/signup/student");
  }

  return (
    <AuthLayout>
      <div className="flex flex-col items-center gap-3 text-center">
        <AuthTitle
          line1={
            <span className="sm:whitespace-nowrap">
              학생의 생년월일을 입력해 주세요
            </span>
          }
        />
        <p className="break-keep text-base font-medium text-ink sm:text-xl sm:whitespace-nowrap">
          만 14세 미만은 보호자(법정대리인) 동의가 필요해요
        </p>
      </div>

      <div className="flex w-full flex-col gap-5">
        <TextField
          id="birthDate"
          name="birthDate"
          type="text"
          value={value}
          onChange={handleChange}
          placeholder="생년월일 8자리 입력"
          helperText={error || undefined}
          status={error ? "error" : "default"}
          autoComplete="off"
          required
        />

        <PrimaryButton onClick={handleContinue}>계속하기</PrimaryButton>

        {showUnder14ComingSoon && (
          <InfoCard variant="card">
            만 14세 미만 가입은 준비 중입니다. 잠시 후 다시 시도해 주세요.
          </InfoCard>
        )}
      </div>
    </AuthLayout>
  );
}
