// [B-2] 학생 생년월일 입력 — docs/login-signup-renewal-spec.md §3.3 B-2, 노드 2393:10073.
// 생년월일 8자리 입력 → SignupContext.setBirthDate로 저장(만 14세 판정은 컨텍스트가 계산)
// → 만 14세 이상이면 /signup/student(C-1), 미만이면 /signup/student/under14/verify(D-1)로 이동.
//
// 연령 판정은 setBirthDate 호출 후 컨텍스트 state 갱신을 기다리지 않고(setState는 비동기),
// 제출 시점에 즉시 분기 판단이 필요하다. 중복 구현을 피하기 위해 SignupContext.jsx가
// export하는 computeIsUnder14(강화된 검증: 1900년 미만/미래 날짜/Date 롤오버 거부)를
// 그대로 재사용한다(§3.3 B-2: "생일이 지나지 않은 경우 만 14세 미만으로 처리").
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import {
  AuthLayout,
  AuthTitle,
  PrimaryButton,
  TextField,
} from "@/components/auth";
import { computeIsUnder14, useSignup } from "@/context/SignupContext";

// 14세 미만 가입 플로우(D-1 PASS 본인인증, D-2 법정대리인 동의 폼, complete_signup_profile
// RPC의 guardian_* 인자까지)는 이미 만들어져 있지만 기본 off다(QA 2026-08-22 재확인 —
// Under14Verify.jsx/Under14Form.jsx의 guardian 관련 코드는 이 작업 범위가 아니다, 손대지
// 않는다). 플래그를 켜면(sql/84_under14_signup.sql 등 선행 마이그레이션 적용 후) 14세
// 미만도 법정대리인 동의를 거쳐 정상 가입한다 — 아래 "만 14세 이상만 가입할 수 있습니다."
// 안내는 그 플로우가 꺼져 있는 배포에서만 보이는 임시 문구이고, 켜지면 이 분기 자체를
// 타지 않고 바로 under14 라우트로 이동한다(Under14Verify/Under14Form의 URL 직접 진입
// 가드와 짝을 이룬다).
const UNDER14_SIGNUP_ENABLED =
  import.meta.env.VITE_UNDER14_SIGNUP_ENABLED === "true";

// QA 지시(2026-08-22): 플래그 off 배포에서 14세 미만 판정 시 노출하는 안내. 생년월일
// 입력 바로 아래(helperText)에 인라인으로 보여준다 — 시트가 요구한 위치가 별도 화면/
// 모달이 아니라 입력 하단이라 error 문구와 같은 자리를 공유한다.
const UNDER14_BLOCKED_MESSAGE = "만 14세 이상만 가입할 수 있습니다.";

export default function StudentBirth() {
  const navigate = useNavigate();
  const { memberType, birthDate, setBirthDate } = useSignup();
  const [value, setValue] = useState(birthDate || "");
  const [error, setError] = useState("");

  // memberType 없이(예: 새로고침 전 이탈, 직접 URL 진입) 이 화면에 들어온 경우 첫 단계로 되돌림.
  useEffect(() => {
    if (memberType !== "student") {
      navigate("/signup", { replace: true });
    }
  }, [memberType, navigate]);

  function handleChange(next: string) {
    setValue(next.replace(/\D/g, "").slice(0, 8));
    if (error) setError("");
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
      setError(UNDER14_BLOCKED_MESSAGE);
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
          // helperText는 string(exactOptionalPropertyTypes, undefined 불가) —
          // TextField가 내부에서 truthy 체크만 하므로 ""는 undefined와 동일하게 렌더된다.
          helperText={error}
          status={error ? "error" : "default"}
          autoComplete="off"
          required
        />

        <PrimaryButton onClick={handleContinue}>계속하기</PrimaryButton>
      </div>
    </AuthLayout>
  );
}
