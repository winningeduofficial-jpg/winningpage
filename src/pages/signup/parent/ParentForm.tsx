// [E-1] 학부모 회원가입 폼 — docs/login-signup-renewal-spec.md §3.3 E-1, 노드 2393:10666.
// 학생 폼(C-1)과 달리 지역/재학구분/학교명 없음, 약관 4행(모두동의+3항목)만 사용.
// 인증코드 필드는 6자리가 채워지는 즉시 자동 검증한다(TextField의 액션 링크 슬롯은
// 스펙대로 "인증번호 보내기"/"인증번호 다시 보내기"에만 사용하고 별도 "확인" 버튼은 두지 않음).
//
// ⚠️ 가입 완료 후 signOut 하지 않는다
//   StudentForm은 가입 직후 세션을 파기하지만 학부모는 그러면 안 된다. 바로 다음
//   화면(E-2~E-4)의 자녀 연결코드 조회가 로그인을 요구하기 때문이다
//   (api/lookup-child.js — 조회 결과에 미성년자의 이름과 학교가 들어간다).
//   여기서 signOut을 넣으면 다음 화면이 통째로 not_authenticated로 죽는다.
//
// ⚠️ 인증번호 검증은 서버가 한다
//   mock은 발송 코드를 클라이언트에 내려주고 프론트가 비교했다. 지금은
//   /api/verify-phone-code가 판정하고, 서버가 시도를 5회로 끊는다. 그래서 같은
//   코드를 반복 전송하지 않도록 마지막 시도값을 기억한다 — 지웠다 다시 입력하는
//   것만으로 시도가 깎이면 안 된다.
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AgreementList,
  AuthLayout,
  AuthTitle,
  PrimaryButton,
  TextField,
} from "../../../components/auth";
import { useSignup } from "../../../context/SignupContext";
import { useCooldown } from "../../../hooks/useCooldown";
import {
  DUPLICATE_PHONE_MESSAGE,
  isValidMobile,
  normalizePhone,
  sendPhoneCode,
  verifyPhoneCode,
} from "../../../lib/phoneVerification";
import {
  applySignupPassword,
  MESSAGES as EMAIL_MESSAGES,
  EMAIL_RESEND_COOLDOWN_SECONDS,
  EMAIL_STATE,
  sendSignupEmailCode,
  verifySignupEmailCode,
} from "../../../lib/signupEmailAuth";
import { supabase } from "../../../lib/supabase";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{6,}$/;

type FieldStatus = "default" | "error" | "success";
interface FieldMessage {
  text: string;
  status: FieldStatus;
}

// 실계정을 만드는 화면이라 배포 노출은 플래그로 통제한다.
// (VITE_PARENT_SIGNUP_ENABLED='true')
const PARENT_SIGNUP_ENABLED =
  import.meta.env.VITE_PARENT_SIGNUP_ENABLED === "true";

const AGREEMENT_KEYS = ["service", "privacyRequired", "marketing"];
const AGREEMENT_LABELS = [
  {
    key: "service",
    label: "위닝에듀 이용약관",
    required: true,
    to: "/terms/parent/service",
  },
  {
    key: "privacyRequired",
    label: "개인정보 수집 및 이용",
    required: true,
    to: "/terms/parent/privacy",
  },
  {
    key: "marketing",
    label: "마케팅 목적의 개인정보 수집 및 이용",
    required: false,
    to: "/terms/parent/marketing",
  },
];

const RPC_ERRORS = [
  [
    "duplicate_email",
    "이미 가입된 이메일입니다. 로그인 페이지에서 로그인해 주세요.",
  ],
  [
    "not_authenticated",
    "로그인 세션이 만료되었습니다. 이메일 인증을 다시 진행해 주세요.",
  ],
  ["terms_service_required", "이용약관 필수 동의가 필요합니다."],
  ["privacy_required", "개인정보 필수 동의가 필요합니다."],
  [
    "invalid_member_type",
    "회원 유형이 올바르지 않습니다. 처음부터 다시 시도해 주세요.",
  ],
  ["name_required", "이름을 입력해 주세요."],
  // sql/40 [16] — 전화번호는 계정당 하나다. 발송 단계에서 걸러지지만 동시 가입
  // 경합으로 여기까지 올 수 있다.
  ["duplicate_phone", DUPLICATE_PHONE_MESSAGE],
  // sql/40 [16]이 아직 적용되지 않은 환경에서는 unique 인덱스 위반 원문이 올라온다.
  ["profiles_phone_unique", DUPLICATE_PHONE_MESSAGE],
  // sql/40 [14] — 서버가 휴대폰 인증을 직접 확인한다. 프론트 가드를 우회했거나
  // 인증 후 30분이 지났거나, 이미 그 인증으로 가입한 경우다.
  [
    "phone_not_verified",
    "휴대폰 인증이 확인되지 않습니다. 인증번호를 다시 받아 인증해 주세요.",
  ],
  // region_required는 sql/40 [13]에서 학생 전용으로 바뀌었다. 그래도 남겨두는 이유는
  // [13]이 아직 적용되지 않은 환경에서 원인을 바로 알아보기 위해서다.
  [
    "region_required",
    "서버 스키마가 최신이 아닙니다(sql/40 [13] 미적용). 관리자에게 문의해 주세요.",
  ],
];

export default function ParentForm() {
  const navigate = useNavigate();
  const {
    memberType,
    setMemberType,
    formData,
    updateFormData,
    agreements,
    updateAgreements,
    setAllAgreements,
    verification,
    updateVerification,
    setParentSignupCompleted,
  } = useSignup();

  useEffect(() => {
    if (PARENT_SIGNUP_ENABLED && memberType !== "parent") {
      setMemberType("parent");
    }
  }, [memberType, setMemberType]);

  const [phoneSending, setPhoneSending] = useState(false);
  const [emailSending, setEmailSending] = useState(false);
  const [phoneMessage, setPhoneMessage] = useState<FieldMessage>({
    text: "",
    status: "default",
  });
  const [emailMessage, setEmailMessage] = useState<FieldMessage>({
    text: "",
    status: "default",
  });
  const [passwordError, setPasswordError] = useState("");
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const phoneCooldown = useCooldown(60);
  const emailCooldown = useCooldown(EMAIL_RESEND_COOLDOWN_SECONDS);

  // 서버가 시도를 세므로 같은 코드를 두 번 보내지 않는다.
  const lastPhoneAttempt = useRef("");
  const lastEmailAttempt = useRef("");

  const normalizedEmail = formData.email.trim().toLowerCase();
  const normalizedPhone = normalizePhone(formData.phone);

  // ── 휴대폰 ────────────────────────────────────────────────────────
  // biome-ignore lint/correctness/useExhaustiveDependencies: TODO(useEffectEvent) OTP 자동검증 — verification.phone.*/updateVerification을 deps에 넣으면 effect 안의 updateVerification 호출이 자기 자신을 다시 트리거해 중복 검증 API 호출·루프 위험. phoneCode 6자리 완성 시에만 실행되어야 한다.
  useEffect(() => {
    const code = formData.phoneCode;

    if (
      code.length !== 6 ||
      !verification.phone.requested ||
      verification.phone.verified ||
      lastPhoneAttempt.current === code
    ) {
      return;
    }

    lastPhoneAttempt.current = code;

    verifyPhoneCode(normalizedPhone, code).then((result) => {
      if (result.ok) {
        updateVerification("phone", { verified: true });
        setPhoneMessage({ text: "인증되었습니다", status: "success" });
        return;
      }

      setPhoneMessage({ text: result.message, status: "error" });

      // 시도가 소진되면 재발송 외에는 길이 없다. 다음 입력이 다시 시도되도록 푼다.
      if (
        result.reason === "too_many_attempts" ||
        result.reason === "code_expired"
      ) {
        lastPhoneAttempt.current = "";
      }
    });
  }, [formData.phoneCode]);

  async function handleSendPhoneCode() {
    if (!isValidMobile(formData.phone)) {
      setPhoneMessage({
        text: "올바른 전화번호를 입력해 주세요",
        status: "error",
      });
      return;
    }

    setPhoneSending(true);
    setPhoneMessage({ text: "", status: "default" });

    try {
      const result = await sendPhoneCode(normalizedPhone, "parent_signup");

      if (!result.ok) {
        if (result.retryAfter) phoneCooldown.start();

        // 이미 가입에 쓰인 번호라 문자가 나가지 않았다. 인증코드 필드를 열어두면
        // 사용자가 오지 않을 문자를 기다리게 된다.
        if (result.reason === "phone_taken") {
          updateVerification("phone", { requested: false, verified: false });
          setPhoneMessage({ text: DUPLICATE_PHONE_MESSAGE, status: "error" });
          return;
        }

        setPhoneMessage({ text: result.message, status: "error" });
        return;
      }

      lastPhoneAttempt.current = "";
      updateVerification("phone", { requested: true, verified: false });
      updateFormData({ phoneCode: "" });
      phoneCooldown.start();
      setPhoneMessage({
        // 운영에서 dryRun이 true면 문자가 실제로 나가지 않은 것이다.
        text: result.dryRun
          ? "테스트 모드입니다 — 실제 문자는 발송되지 않았습니다."
          : "인증번호를 보냈습니다.",
        status: "default",
      });
    } finally {
      setPhoneSending(false);
    }
  }

  // ── 이메일 ────────────────────────────────────────────────────────
  // biome-ignore lint/correctness/useExhaustiveDependencies: TODO(useEffectEvent) OTP 자동검증 — verification.email.*/updateVerification을 deps에 넣으면 effect 안의 updateVerification 호출이 자기 자신을 다시 트리거해 중복 검증 API 호출·루프 위험. emailCode 6자리 완성 시에만 실행되어야 한다.
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

    verifySignupEmailCode({
      email: normalizedEmail,
      token,
      mode: verification.email.mode,
    }).then(({ error }) => {
      if (error) {
        updateVerification("email", { verified: false });
        setEmailMessage({ text: EMAIL_MESSAGES.codeMismatch, status: "error" });
        return;
      }

      updateVerification("email", { verified: true });
      setEmailMessage({ text: "인증되었습니다", status: "success" });
    });
  }, [formData.emailCode]);

  async function handleSendEmailCode() {
    if (!EMAIL_REGEX.test(normalizedEmail)) {
      setEmailMessage({
        text: "올바른 이메일을 입력해 주세요",
        status: "error",
      });
      return;
    }

    // 비밀번호는 여기서 요구하지 않는다. 비어 있으면 임시 비밀번호로 계정이
    // 만들어지고, 실제 값은 가입 완료 직전 applySignupPassword가 채운다
    // (src/lib/signupEmailAuth.js).
    if (emailCooldown.active) {
      setEmailMessage({
        text: EMAIL_MESSAGES.cooldown(emailCooldown.remaining),
        status: "error",
      });
      return;
    }

    setEmailSending(true);
    setEmailMessage({
      text: "이메일 중복 여부를 확인하는 중입니다.",
      status: "default",
    });

    try {
      const { state, mode, resumed, error } = await sendSignupEmailCode({
        email: normalizedEmail,
        password: formData.password,
        name: formData.name.trim(),
        memberType: "parent",
      });

      if (error) {
        console.error("이메일 인증코드 발송 오류:", error);
        updateVerification("email", { checked: false, available: false });
        setEmailMessage({
          // state가 없으면 상태 조회 자체가 실패한 것이고, 있으면 발송이 실패한 것이다.
          text: state ? error.message : EMAIL_MESSAGES.checkFailed,
          status: "error",
        });
        return;
      }

      if (state === EMAIL_STATE.TAKEN) {
        updateVerification("email", { checked: true, available: false });
        setEmailMessage({ text: EMAIL_MESSAGES.taken, status: "error" });
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
        text: resumed ? EMAIL_MESSAGES.resumed : EMAIL_MESSAGES.sent,
        status: "default",
      });
    } finally {
      setEmailSending(false);
    }
  }

  function handlePasswordChange(value: string) {
    updateFormData({ password: value });
    if (!value) {
      setPasswordError("");
    } else if (!PASSWORD_REGEX.test(value)) {
      setPasswordError("영문/숫자/특수문자 포함 6자 이상");
    } else {
      setPasswordError("");
    }
  }

  const passwordStatus = !formData.password
    ? "default"
    : passwordError
      ? "error"
      : "success";
  const passwordHelper = !formData.password
    ? "영문/숫자/특수문자 포함 6자 이상"
    : passwordError || "영문/숫자/특수문자 포함 6자 이상";

  const requiredAgreementsChecked =
    agreements.service && agreements.privacyRequired;
  const allChecked = AGREEMENT_KEYS.every((key) => agreements[key]);

  const canSubmit =
    formData.name.trim() &&
    verification.phone.verified &&
    verification.email.verified &&
    PASSWORD_REGEX.test(formData.password) &&
    requiredAgreementsChecked;

  async function handleSubmit() {
    if (!canSubmit || submitting) return;

    setSubmitting(true);
    setFormError("");

    try {
      // 이메일 OTP 검증 직후라 세션이 있어야 한다. 확인하지 않고 RPC를 부르면
      // not_authenticated만 보고 원인을 짐작해야 한다.
      const { data: userData, error: getUserError } =
        await supabase.auth.getUser();

      if (getUserError || !userData?.user?.id) {
        setFormError(
          "이메일 인증 세션을 찾을 수 없습니다. 다시 인증해 주세요.",
        );
        return;
      }

      if ((userData.user.email || "").toLowerCase() !== normalizedEmail) {
        setFormError(
          "인증한 이메일과 입력한 이메일이 다릅니다. 다시 인증해 주세요.",
        );
        return;
      }

      // 이메일 인증 시점의 계정 비밀번호는 임시값일 수 있다. 여기서 폼에 입력된
      // 값으로 맞추지 않으면 사용자가 방금 정한 비밀번호로 로그인할 수 없다.
      const { error: passwordError } = await applySignupPassword(
        formData.password,
      );

      if (passwordError) {
        setFormError(
          "비밀번호 설정에 실패했습니다. 잠시 후 다시 시도해 주세요.",
        );
        return;
      }

      const { data: result, error } = await supabase.rpc(
        "complete_signup_profile",
        {
          p_name: formData.name.trim(),
          p_username: normalizedEmail,
          p_phone: normalizedPhone,
          p_email: normalizedEmail,
          // 학부모 폼은 지역/재학구분/학교명을 받지 않는다 → sql/40 [13]에서
          // 이 셋을 학생 전용 필수로 바꿨다.
          p_region: null,
          p_school_type: null,
          p_school_name: null,
          p_member_type: "parent",
          p_terms_service_agreed: agreements.service,
          p_privacy_required_agreed: agreements.privacyRequired,
          // 아래 셋은 학부모 폼에 체크박스가 없다. 받지 않은 동의를 true로 보내면 안 된다.
          p_identity_required_agreed: false,
          p_privacy_optional_agreed: false,
          p_marketing_agreed: agreements.marketing,
          p_ads_agreed: false,
        },
      );

      if (error) {
        const message = String(error.message || "").toLowerCase();
        const matched = RPC_ERRORS.find(([code]) => message.includes(code));

        setFormError(
          matched
            ? matched[1]
            : `회원 정보 저장 중 문제가 발생했습니다: ${error.message}`,
        );
        return;
      }

      if (!result?.ok) {
        setFormError(
          "회원 정보 저장 결과를 확인할 수 없습니다. 다시 시도해 주세요.",
        );
        return;
      }

      setParentSignupCompleted(true);

      // ⚠️ 여기서 signOut 하지 않는다 — 파일 상단 주석 참고.
      navigate("/signup/parent/link");
    } catch (error) {
      setFormError(
        `가입 처리 중 오류가 발생했습니다: ${error.message || String(error)}`,
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (!PARENT_SIGNUP_ENABLED) {
    return (
      <AuthLayout>
        <AuthTitle line1="학부모 회원가입은 준비 중입니다" />

        <p className="w-full text-center text-sm text-ink">
          실제 계정 생성 연동이 완료된 후 오픈될 예정입니다. 잠시 후 다시 시도해
          주세요.
        </p>
      </AuthLayout>
    );
  }

  const phoneResendLabel = phoneCooldown.active
    ? `${phoneCooldown.remaining}초 후 다시 보내기`
    : "인증번호 다시 보내기";

  return (
    <AuthLayout>
      <AuthTitle
        line1={
          <span className="sm:whitespace-nowrap">
            회원가입 정보를 입력해주세요
          </span>
        }
      />

      <div className="flex w-full flex-col gap-5">
        <h2 className="w-full text-lg font-semibold text-ink">
          학부모 기본 정보 (필수)
        </h2>

        <TextField
          label="이름"
          id="name"
          name="name"
          value={formData.name}
          onChange={(value) => updateFormData({ name: value })}
          placeholder="이름을 입력 해주세요"
          required
        />

        <TextField
          label="전화번호"
          id="phone"
          name="phone"
          type="tel"
          value={formData.phone}
          onChange={(value) => updateFormData({ phone: value })}
          placeholder="전화번호를 입력 해주세요"
          actionLabel="인증번호 보내기"
          onAction={handleSendPhoneCode}
          actionDisabled={
            phoneSending || phoneCooldown.active || verification.phone.verified
          }
          helperText={
            verification.phone.verified
              ? undefined
              : phoneMessage.text || undefined
          }
          status={verification.phone.verified ? "default" : phoneMessage.status}
          required
        />

        <TextField
          label="전화번호 인증번호"
          id="phoneCode"
          name="phoneCode"
          value={formData.phoneCode}
          onChange={(value) =>
            updateFormData({ phoneCode: value.replace(/\D/g, "").slice(0, 6) })
          }
          placeholder="카카오톡으로 보낸 인증번호를 입력 해주세요"
          actionLabel={phoneResendLabel}
          onAction={handleSendPhoneCode}
          actionDisabled={
            !verification.phone.requested ||
            phoneSending ||
            phoneCooldown.active ||
            verification.phone.verified
          }
          helperText={phoneMessage.text || undefined}
          status={verification.phone.verified ? "success" : phoneMessage.status}
          disabled={
            !verification.phone.requested || verification.phone.verified
          }
        />

        <TextField
          label="아이디(이메일)"
          id="email"
          name="email"
          type="email"
          value={formData.email}
          onChange={(value) => updateFormData({ email: value })}
          placeholder="이메일을 입력 해주세요"
          actionLabel={
            emailCooldown.active
              ? `${emailCooldown.remaining}초 후 다시 보내기`
              : "인증번호 보내기"
          }
          onAction={handleSendEmailCode}
          actionDisabled={
            emailSending || emailCooldown.active || verification.email.verified
          }
          helperText={
            verification.email.verified
              ? undefined
              : emailMessage.text || undefined
          }
          status={verification.email.verified ? "default" : emailMessage.status}
          required
        />

        <TextField
          label="이메일 인증코드"
          id="emailCode"
          name="emailCode"
          value={formData.emailCode}
          onChange={(value) =>
            updateFormData({ emailCode: value.replace(/\D/g, "").slice(0, 6) })
          }
          placeholder="이메일 인증코드 6자리를 입력해주세요"
          helperText={emailMessage.text || undefined}
          status={verification.email.verified ? "success" : emailMessage.status}
          disabled={
            !verification.email.requested || verification.email.verified
          }
        />

        <TextField
          label="비밀번호"
          id="password"
          name="password"
          type="password"
          value={formData.password}
          onChange={handlePasswordChange}
          placeholder="비밀번호를 입력 해주세요"
          helperText={passwordHelper}
          status={passwordStatus}
          required
        />
      </div>

      <div className="flex w-full flex-col gap-5">
        <h2 className="w-full text-lg font-semibold text-ink">약관 동의</h2>

        <AgreementList
          items={AGREEMENT_LABELS.map((item) => ({
            ...item,
            checked: agreements[item.key],
          }))}
          allChecked={allChecked}
          onToggleAll={() => setAllAgreements(!allChecked, AGREEMENT_KEYS)}
          onToggleItem={(key) => updateAgreements({ [key]: !agreements[key] })}
        />
      </div>

      {formError && (
        <p className="w-full text-center text-sm text-red-500">{formError}</p>
      )}

      <PrimaryButton
        onClick={handleSubmit}
        disabled={!canSubmit || submitting}
        loading={submitting}
      >
        가입 완료하기
      </PrimaryButton>
    </AuthLayout>
  );
}
