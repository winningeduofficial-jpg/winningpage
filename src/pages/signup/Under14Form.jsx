// [D-2] 14세 미만 회원가입 폼(학생 정보+학부모 정보+약관 동의) —
// docs/login-signup-renewal-spec.md §3.3 D-2, 노드 2393-8759=2393-9007(중복 프레임).
//
// C-1(14세 이상 폼)과의 차이(§3.3 D-2 "C-1과의 차이"):
//  - 전화번호 필드에 인증 링크 없음. 대신 체크박스 "학생 명의의 핸드폰이 없어요".
//  - 전화번호 인증번호 필드 없음.
//  - "학부모 정보 (필수)" 섹션 추가(전화번호 + 수집 안내 + 법정대리인 동의 체크).
// 약관 동의 항목은 D-2 전용 차이가 스펙에 기록돼 있지 않아 C-1(학생 6항목 중 필수3/선택2 —
// 7825 정본 채택분)과 동일 구성으로 채택한다.
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check } from "lucide-react";
import {
  AuthLayout,
  AuthTitle,
  TextField,
  SelectField,
  PrimaryButton,
  InfoCard,
  AgreementList,
} from "../../components/auth";
import { useSignup } from "../../context/SignupContext";
import { supabase } from "../../lib/supabase";
import {
  EMAIL_RESEND_COOLDOWN_SECONDS,
  EMAIL_STATE,
  MESSAGES,
  sendSignupEmailCode,
  verifySignupEmailCode,
} from "../../lib/signupEmailAuth";
import { useCooldown } from "../../hooks/useCooldown";
// AS-IS Signup.jsx(§2.2)의 17개 시도 + '기타' select 관례를 StudentForm(C-1)과 공유한다
// (§3.3 C-1 예시 데이터 "울산"과 표기 형식 일치 — "울산광역시"가 아닌 "울산").
import { REGION_OPTIONS } from "./StudentForm";

// AS-IS 재학구분 enum(§2.2: "초·중·고·N수생·기타") 그대로 채택.
const SCHOOL_TYPE_OPTIONS = ["초등학교", "중학교", "고등학교", "N수생", "기타"];

// 14세 미만 가입 플로우는 아직 백엔드 연동이 없는 데드엔드라 기본 off — StudentBirth.jsx/
// Under14Verify.jsx와 동일 플래그. off인 배포에서는 URL 직접 진입도 막는다.
const UNDER14_SIGNUP_ENABLED =
  import.meta.env.VITE_UNDER14_SIGNUP_ENABLED === "true";

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidPassword(value) {
  return /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{6,}$/.test(value);
}

// StudentForm.jsx의 동명 헬퍼와 동일 — 공유 훅/유틸 추출은 StudentForm 소유권 밖이라
// 최소한의 인라인 복제로 둔다.
function getFriendlyEmailError(errorMessage) {
  if (!errorMessage) return "회원가입 중 문제가 발생했습니다.";

  if (errorMessage.includes("User already registered")) {
    return "이미 가입된 이메일입니다. 로그인 페이지에서 로그인해 주세요.";
  }

  if (errorMessage.includes("Password should be at least")) {
    return "비밀번호는 최소 6자 이상으로 입력해 주세요.";
  }

  if (errorMessage.includes("Invalid email")) {
    return "이메일 형식이 올바르지 않습니다.";
  }

  return errorMessage;
}

// §3.3 C-1 약관 6행 중 7825 정본 기준(본인 인증을 위한 정보 수집) — §5.2 약관 라우트 표
// (/terms/student/{service|privacy|identity|marketing|promotion}) 그대로 매핑.
const STUDENT_AGREEMENT_ITEMS = [
  {
    key: "service",
    label: "위닝에듀 이용약관",
    required: true,
    to: "/terms/student/service",
  },
  {
    key: "privacyRequired",
    label: "개인정보 수집 및 이용",
    required: true,
    to: "/terms/student/privacy",
  },
  {
    key: "identityRequired",
    label: "본인 인증을 위한 정보 수집",
    required: true,
    to: "/terms/student/identity",
  },
  {
    key: "marketing",
    label: "마케팅 목적의 개인정보 수집 및 이용",
    required: false,
    to: "/terms/student/marketing",
  },
  {
    key: "ads",
    label: "광고성 정보 수신 동의",
    required: false,
    to: "/terms/student/promotion",
  },
];

// "학생 명의의 핸드폰이 없어요"(16px 아이콘/12px 텍스트) / "법정대리인 정보를 학부모 정보로
// 수집합니다"(#7a7a7a) 두 곳에서만 쓰는 단독 체크 문구라 공용 컴포넌트로 승격하지 않고
// 이 파일 안에 비공개로 둔다(AS-IS Signup.jsx의 파일 내부 CheckBox 관례와 동일).
function InlineCheckbox({ checked, onToggle, children }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex min-h-[2.75rem] items-center gap-2 text-left"
    >
      <span
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition ${
          checked
            ? "border-primary bg-primary text-white"
            : "border-line bg-white text-transparent"
        }`}
      >
        <Check size={11} strokeWidth={3} />
      </span>
      {/* #7a7a7a는 신규 토큰에 없어 가장 근접한 ink-sub(#808080)로 대체 — 임의 hex 금지 규칙 준수. */}
      <span className="text-xs text-ink-sub">{children}</span>
    </button>
  );
}

export default function Under14Form() {
  const navigate = useNavigate();
  const {
    memberType,
    verification,
    formData,
    agreements,
    updateFormData,
    updateAgreements,
    updateVerification,
    setAllAgreements,
  } = useSignup();
  const [emailMessage, setEmailMessage] = useState({
    text: "",
    status: "default",
  });
  const emailCooldown = useCooldown(EMAIL_RESEND_COOLDOWN_SECONDS);
  // 이메일 OTP는 1회용이라 같은 코드로 두 번 검증하면 403이 난다. 자동 검증이
  // 같은 값으로 재시도하지 않도록 마지막 시도값을 기억한다(StudentForm과 동일).
  const lastEmailAttempt = useRef("");
  const passwordValid = formData.password
    ? isValidPassword(formData.password)
    : null;

  // §3.2 흐름: S1(생년월일) -> U0(PASS 안내) -> U1(이 화면). 학생 유형이 아니거나, 플래그가
  // off이거나, 법정대리인 PASS 인증을 아직 마치지 않은 상태로 직접 URL 진입 시 순서대로 되돌린다.
  useEffect(() => {
    if (memberType !== "student") {
      navigate("/signup", { replace: true });
      return;
    }
    if (!UNDER14_SIGNUP_ENABLED) {
      navigate("/signup", { replace: true });
      return;
    }
    if (!verification.pass.verified) {
      navigate("/signup/student/under14/verify", { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberType, verification.pass.verified]);

  const requiredKeys = useMemo(
    () => STUDENT_AGREEMENT_ITEMS.map((item) => item.key),
    [],
  );
  const allChecked = useMemo(
    () => STUDENT_AGREEMENT_ITEMS.every((item) => agreements[item.key]),
    [agreements],
  );

  // --- 이메일 인증: src/lib/signupEmailAuth.js의 공용 시퀀스를 쓴다.
  // (상태 확인 → OTP 발송 → OTP 검증. 가입 중단 계정이면 이어서 가입한다)
  // 이전에는 "인증번호 보내기" 클릭이 아무 동작도 하지 않는 no-op 스텁이었다.
  async function requestEmailCode() {
    // Supabase Auth가 서버에서 같은 간격으로 막고 있다. 여기서 먼저 잡아주지
    // 않으면 연타가 전부 실패 응답으로 돌아오면서 시간당 발송 할당량만 태운다.
    if (emailCooldown.active) {
      setEmailMessage({
        text: MESSAGES.cooldown(emailCooldown.remaining),
        status: "error",
      });
      return;
    }

    const normalizedEmail = formData.email.trim().toLowerCase();

    if (!normalizedEmail) {
      setEmailMessage({
        text: "이메일을 먼저 입력해 주세요.",
        status: "error",
      });
      return;
    }

    if (!isValidEmail(normalizedEmail)) {
      setEmailMessage({
        text: "이메일 형식이 올바르지 않습니다.",
        status: "error",
      });
      return;
    }

    setEmailMessage({
      text: "이메일 중복 여부를 확인하는 중입니다.",
      status: "default",
    });

    // 비밀번호는 여기서 요구하지 않는다. 비어 있으면 임시 비밀번호로 계정이
    // 만들어지고, 실제 값은 가입을 끝내는 시점에 applySignupPassword가 채운다
    // (src/lib/signupEmailAuth.js). ⚠️ 이 화면은 아직 제출 단계가 없으므로
    // 다음 스텝을 붙일 때 applySignupPassword 호출을 함께 넣어야 한다.
    const { state, mode, resumed, error } = await sendSignupEmailCode({
      email: normalizedEmail,
      password: formData.password,
      name: formData.name.trim(),
      memberType: "student",
    });

    if (error) {
      console.error("이메일 인증코드 발송 오류:", error);
      updateVerification("email", { checked: false, available: false });
      setEmailMessage({
        text: state
          ? getFriendlyEmailError(error.message)
          : MESSAGES.checkFailed,
        status: "error",
      });
      return;
    }

    if (state === EMAIL_STATE.TAKEN) {
      updateVerification("email", { checked: true, available: false });
      setEmailMessage({ text: MESSAGES.taken, status: "error" });
      return;
    }

    lastEmailAttempt.current = "";
    updateVerification("email", {
      checked: true,
      available: true,
      requested: true,
      verified: false,
      mode,
      resumed,
    });
    updateFormData({ emailCode: "" });
    emailCooldown.start();
    setEmailMessage({
      text: resumed ? MESSAGES.resumed : MESSAGES.sent,
      status: "default",
    });
  }

  // 6자리가 채워지면 곧바로 검증한다 — 별도 "확인" 버튼을 두지 않는다.
  // (휴대폰 알림톡 인증과 같은 방식. ParentForm(E-1)/StudentForm(C-1)과 동일 패턴)
  useEffect(() => {
    const token = formData.emailCode;

    if (
      token.length !== 6 ||
      !verification.email.requested ||
      verification.email.verified ||
      lastEmailAttempt.current === token
    ) {
      return;
    }

    lastEmailAttempt.current = token;

    const normalizedEmail = formData.email.trim().toLowerCase();

    verifySignupEmailCode({
      email: normalizedEmail,
      token,
      mode: verification.email.mode,
    }).then(async ({ error }) => {
      if (error) {
        updateVerification("email", { verified: false });
        setEmailMessage({ text: MESSAGES.codeMismatch, status: "error" });
        return;
      }

      const { data: userData } = await supabase.auth.getUser();
      const currentUser = userData.user;

      if (currentUser?.id) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("email, member_type")
          .eq("id", currentUser.id)
          .maybeSingle();

        if (profile?.email && profile?.member_type) {
          updateVerification("email", { verified: false });
          setEmailMessage({
            text: "이미 가입된 이메일입니다. 로그인 페이지에서 로그인해 주세요.",
            status: "error",
          });
          return;
        }
      }

      updateVerification("email", { verified: true });
      setEmailMessage({
        text: "이메일 인증이 완료되었습니다.",
        status: "success",
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.emailCode]);

  // TODO: 버튼 활성화 조건이 시안에 명시돼 있지 않음(§3.3 D-2: "빈 폼 기본만 존재... 확인
  // 필요"). 필수 필드 전부 입력 + 필수 약관 전부 동의를 임시 기준으로 채택 — 실제 검증 규칙은
  // 디자이너/기획 확인 후 교체할 것. noOwnPhone 체크 시 전화번호 필수 여부도 시안에 없어
  // 보수적으로 "체크 시 면제"로만 처리했다.
  const isNextEnabled =
    formData.name.trim() !== "" &&
    (formData.noOwnPhone || formData.phone.trim() !== "") &&
    formData.email.trim() !== "" &&
    formData.emailCode.trim() !== "" &&
    formData.password.trim() !== "" &&
    formData.region !== "" &&
    formData.schoolType !== "" &&
    formData.schoolName.trim() !== "" &&
    formData.guardianPhone.trim() !== "" &&
    formData.guardianConsent &&
    STUDENT_AGREEMENT_ITEMS.filter((item) => item.required).every(
      (item) => agreements[item.key],
    );

  const [showNextComingSoon, setShowNextComingSoon] = useState(false);

  // TODO(다음 단계 미확정): §3.3 D-2 "U1 -> U2 다음 단계(화면 데이터 없음 — 확인 필요)".
  // 실제 다음 라우트/제출 시퀀스가 정해지기 전까지 스텁으로 남겨두되, ParentForm의 "준비
  // 중" 안내 패턴과 동일하게 클릭 시 사용자에게 안내 문구를 노출한다.
  function handleNext() {
    setShowNextComingSoon(true);
  }

  return (
    <AuthLayout>
      {/* TODO: C-1/D-2 두 화면 모두 스펙에 타이틀 원문이 명시돼 있지 않음(§3.3 C-1/D-2에
          타이틀 문구 인용 없음) — 동일 역할의 E-1(학부모 폼) 타이틀 "회원가입 정보를
          입력해 주세요"를 임시로 재사용. 디자이너 확인 후 교체할 것. */}
      <AuthTitle
        line1={
          <span className="sm:whitespace-nowrap">
            회원가입 정보를 입력해 주세요
          </span>
        }
      />

      <section className="flex w-full flex-col gap-3">
        <h2 className="text-xl font-medium text-ink">
          학생 정보 <span className="text-primary">(필수)</span>
        </h2>

        <TextField
          label="이름"
          id="under14-name"
          name="name"
          size="lg"
          value={formData.name}
          onChange={(v) => updateFormData({ name: v })}
          placeholder="이름을 입력 해주세요"
        />

        <div className="flex flex-col gap-2">
          <TextField
            label="전화번호"
            id="under14-phone"
            name="phone"
            size="lg"
            value={formData.phone}
            onChange={(v) => updateFormData({ phone: v })}
            placeholder="전화번호를 입력 해주세요"
            disabled={formData.noOwnPhone}
          />

          {/* C-1과 달리 인증번호 발송 링크 대신 체크박스 — 체크/해제 시 UI 변화는 시안에
              정의돼 있지 않아(§3.3 D-2 "확인 필요") 필드 비활성화만 임시로 연결했다. */}
          <InlineCheckbox
            checked={formData.noOwnPhone}
            onToggle={() =>
              updateFormData({ noOwnPhone: !formData.noOwnPhone })
            }
          >
            학생 명의의 핸드폰이 없어요
          </InlineCheckbox>
        </div>

        <TextField
          label="아이디(이메일)"
          id="under14-email"
          name="email"
          type="email"
          size="lg"
          value={formData.email}
          onChange={(v) => updateFormData({ email: v })}
          placeholder="이메일을 입력 해주세요"
          actionLabel={
            emailCooldown.active
              ? `${emailCooldown.remaining}초 후 재발송`
              : verification.email.requested
                ? "인증번호 다시 보내기"
                : "인증번호 보내기"
          }
          onAction={requestEmailCode}
          actionDisabled={emailCooldown.active || verification.email.verified}
          // 발송 이후의 안내·에러는 인증코드 필드에서 보여준다(문구 중복 방지).
          // status도 같이 내린다 — 문구 없이 error만 남으면 이 입력만 흔들린다.
          helperText={
            verification.email.requested ? undefined : emailMessage.text
          }
          status={
            verification.email.requested ? "default" : emailMessage.status
          }
        />

        {/* 6자리가 채워지면 자동 검증된다 — "확인" 버튼 없음. */}
        <TextField
          label="이메일 인증코드"
          id="under14-email-code"
          name="emailCode"
          size="lg"
          value={formData.emailCode}
          onChange={(v) =>
            updateFormData({ emailCode: v.replace(/\D/g, "").slice(0, 6) })
          }
          placeholder="이메일 인증코드 6자리를 입력해주세요"
          helperText={emailMessage.text}
          status={verification.email.verified ? "success" : emailMessage.status}
          disabled={
            !verification.email.requested || verification.email.verified
          }
        />

        <TextField
          label="비밀번호"
          id="under14-password"
          name="password"
          type="password"
          size="lg"
          value={formData.password}
          onChange={(v) => updateFormData({ password: v })}
          placeholder="비밀번호를 입력 해주세요"
          helperText="영문/숫자/특수문자 포함 6자 이상"
          // 이메일 인증 액션을 막던 선행 조건이 사라졌으므로(2026-08-07) 비밀번호
          // 규칙 충족 여부는 이 필드가 직접 알려준다(StudentForm과 동일).
          status={
            passwordValid === null
              ? "default"
              : passwordValid
                ? "success"
                : "error"
          }
          autoComplete="new-password"
        />

        <SelectField
          label="지역"
          id="under14-region"
          name="region"
          size="lg"
          value={formData.region}
          onChange={(v) => updateFormData({ region: v })}
          options={REGION_OPTIONS}
          placeholder="지역을 선택해주세요"
        />

        <SelectField
          label="재학 구분 선택"
          id="under14-school-type"
          name="schoolType"
          size="lg"
          value={formData.schoolType}
          onChange={(v) => updateFormData({ schoolType: v })}
          options={SCHOOL_TYPE_OPTIONS}
          placeholder="재학 구분 선택"
        />

        <TextField
          label="재학 중인 학교"
          id="under14-school-name"
          name="schoolName"
          size="lg"
          value={formData.schoolName}
          onChange={(v) => updateFormData({ schoolName: v })}
          placeholder="학교명 입력"
        />
      </section>

      <section className="flex w-full flex-col gap-3">
        <h2 className="text-xl font-medium text-ink">
          학부모 정보 <span className="text-primary">(필수)</span>
        </h2>

        <TextField
          label="전화번호"
          id="under14-guardian-phone"
          name="guardianPhone"
          size="lg"
          value={formData.guardianPhone}
          onChange={(v) => updateFormData({ guardianPhone: v })}
          placeholder="전화번호를 입력 해주세요"
        />

        <InfoCard variant="card">
          <span className="block font-medium">
            [학부모 휴대폰번호 수집 안내]
          </span>
          위닝에듀 서비스 이용에 필요한 안내와 공지사항을 제공하기 위해
          학부모(법정대리인)의 휴대폰번호를 수집합니다.
        </InfoCard>

        <InlineCheckbox
          checked={formData.guardianConsent}
          onToggle={() =>
            updateFormData({ guardianConsent: !formData.guardianConsent })
          }
        >
          법정대리인 정보를 학부모 정보로 수집합니다.
        </InlineCheckbox>
      </section>

      <section className="flex w-full flex-col gap-3">
        <h2 className="text-xl font-medium text-ink">약관 동의</h2>

        <AgreementList
          items={STUDENT_AGREEMENT_ITEMS.map((item) => ({
            ...item,
            checked: agreements[item.key],
          }))}
          allChecked={allChecked}
          onToggleAll={() => setAllAgreements(!allChecked, requiredKeys)}
          onToggleItem={(key) => updateAgreements({ [key]: !agreements[key] })}
        />
      </section>

      {showNextComingSoon && (
        <InfoCard variant="info">
          다음 단계 준비 중입니다. 잠시 후 다시 시도해 주세요.
        </InfoCard>
      )}

      {/* §3.3 D-2: "다음" 버튼 400×52px(C-1/D-1과 달리 이 버튼은 사이즈 매트릭스 불일치가
          기록돼 있지 않아 스펙에 명시된 52px/default 그대로 사용 — D-1 PASS 버튼과는 별개 판단). */}
      <PrimaryButton
        size="default"
        radius="default"
        disabled={!isNextEnabled}
        onClick={handleNext}
      >
        다음
      </PrimaryButton>
    </AuthLayout>
  );
}
