// [신규] 통합 회원가입 폼 — 노드 2516-1974('회원가입'), docs/impl-status-recheck.md §4
// (재추출 원문 기반 명세) 참고. docs/login-signup-renewal-spec.md 최초 작성 이후 새로
// 등장한 노드로, 기존 §3.3 상태 매트릭스에는 없다.
//
// ⚠️ 시안 미확정 주의: 재추출 캔버스 좌측 여백에 손그림 벡터 낙서(노드 2516:2234)가
// 남아 있어 디자이너가 아직 검토 중일 가능성이 있다(§4.1 각주). 이 화면은 그 시점의
// 명세를 그대로 반영한 "현재 스냅샷" 구현이며, 시안이 확정되면 ① D-2(14세 미만 가입 폼,
// `Under14Form.jsx`)를 대체하는 개정판인지 ② 별도 독립 스텝인지 디자이너 확인 후 결정
// 대기 상태다(§4.2/§4.3, §5 액션 3번). 그 전까지는 App.jsx에 `VITE_UNIFIED_SIGNUP_ENABLED`
// 플래그로만 노출되는 임시 라우트로 둔다.
//
// Under14Form(D-2)과의 관계: 학생 정보 + 법정대리인(학부모) 전화번호 1필드 + "학생 명의의
// 핸드폰이 없어요" 체크 + 이메일 인증코드 기반 인증 구성이 D-2와 사실상 동일해 이 화면의
// 이메일 OTP 시퀀스(발송/자동 검증)는 Under14Form.jsx/StudentForm.jsx가
// 이미 검증한 Supabase 패턴을 공유한다. 인라인 복제로 두던 것을 가입 중단 계정
// 이어가기 분기가 생기면서 src/lib/signupEmailAuth.js로 추출했다 — 세 화면이 같은
// 분기를 각자 들고 있으면 어긋날 수밖에 없기 때문이다.
//
// D-2와의 차이(§4.1 재추출 명세 기준):
//  - 입력 필드 높이 52px(TextField/SelectField 'default' variant) — D-2/C-1은 60px('lg').
//  - 약관 5번째 행("마케팅 목적의 개인정보 수진 및 이용")은 이 노드에서 재추출된 원문
//    오타('수진')를 그대로 재현한다(기존 9843/9941 이용약관 전문 페이지의 동일 오타와
//    같은 계열 — §4.1 각주, "시안 원문 문구는 그대로" 원칙).
//  - "약관 동의" 섹션 제목은 재추출 원문에 후행 공백이 있다("약관 동의 ") — 브라우저가
//    표시상 접어버리지만 원문 재현 원칙에 따라 문자열 그대로 남긴다.

import { Check } from "lucide-react";
import {
  type ReactNode,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import {
  AgreementList,
  AuthLayout,
  AuthTitle,
  InfoCard,
  PrimaryButton,
  SelectField,
  TextField,
} from "../../components/auth";
import { useSignup } from "../../context/SignupContext";
import { useCooldown } from "../../hooks/useCooldown";
import {
  EMAIL_RESEND_COOLDOWN_SECONDS,
  EMAIL_STATE,
  MESSAGES,
  sendSignupEmailCode,
  verifySignupEmailCode,
} from "../../lib/signupEmailAuth";
import { supabase } from "../../lib/supabase";
// StudentForm(C-1)/Under14Form(D-2)과 동일한 17개 시도 + '기타' 지역 목록을 공유한다.
import { REGION_OPTIONS } from "./StudentForm";

const SCHOOL_TYPE_OPTIONS = ["초등학교", "중학교", "고등학교", "N수생", "기타"];

// 시안 미확정 임시 라우트 — App.jsx가 이 플래그로만 /signup/unified 라우트를 등록한다(§6).
const UNIFIED_SIGNUP_ENABLED =
  import.meta.env.VITE_UNIFIED_SIGNUP_ENABLED === "true";

type FieldStatus = "default" | "error" | "success";
interface FieldMessage {
  text: string;
  status: FieldStatus;
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidPassword(value: string) {
  return /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{6,}$/.test(value);
}

// StudentForm.jsx/Under14Form.jsx의 동명 헬퍼와 동일 — 소유 파일 경계상 최소 인라인 복제.
function getFriendlyEmailError(errorMessage?: string) {
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

// §4.1 재추출 명세 6행 — "마케팅 목적의 개인정보 수진 및 이용"의 '수진'은 원문 오타를
// 그대로 재현한 것이다(오타 아님, 수정 금지 — "시안 원문 문구는 그대로" 원칙).
const UNIFIED_AGREEMENT_ITEMS = [
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
    label: "마케팅 목적의 개인정보 수진 및 이용",
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

// "학생 명의의 핸드폰이 없어요" / "법정대리인 정보를 학부모 정보로 수집합니다" 전용 체크
// 문구 — Under14Form.jsx의 동명 비공개 컴포넌트와 동일 관례(공용 컴포넌트로 승격하지 않음).
function InlineCheckbox({
  checked,
  onToggle,
  children,
}: {
  checked: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
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
      {/* #7a7a7a는 신규 토큰에 없어 가장 근접한 ink-sub(#808080)로 대체(Under14Form.jsx와 동일 판단). */}
      <span className="text-xs text-ink-sub">{children}</span>
    </button>
  );
}

export default function UnifiedSignupForm() {
  const navigate = useNavigate();
  const {
    verification,
    formData,
    agreements,
    updateFormData,
    updateAgreements,
    updateVerification,
    setAllAgreements,
  } = useSignup();

  const [emailMessage, setEmailMessage] = useState<FieldMessage>({
    text: "",
    status: "default",
  });
  const emailCooldown = useCooldown(EMAIL_RESEND_COOLDOWN_SECONDS);
  const passwordValid = formData.password
    ? isValidPassword(formData.password)
    : null;
  // 이메일 OTP는 1회용이라 같은 코드로 두 번 검증하면 403이 난다. 자동 검증이
  // 같은 값으로 재시도하지 않도록 마지막 시도값을 기억한다.
  const lastEmailAttempt = useRef("");

  // 플래그가 꺼져 있으면(App.jsx가 라우트 자체를 등록하지 않음) 직접 URL 진입도 막는다 —
  // Under14Form.jsx의 이중 방어 관례와 동일. 이 화면은 플로우상 선행 스텝이 확정되지 않아
  // (§4.2) memberType/PASS 인증 등 다른 화면과 같은 단계 강제는 걸지 않는다.
  useEffect(() => {
    if (!UNIFIED_SIGNUP_ENABLED) {
      navigate("/signup", { replace: true });
    }
  }, [navigate]);

  const requiredKeys = useMemo(
    () =>
      UNIFIED_AGREEMENT_ITEMS.filter((item) => item.required).map(
        (item) => item.key,
      ),
    [],
  );
  const allChecked = useMemo(
    () => UNIFIED_AGREEMENT_ITEMS.every((item) => agreements[item.key]),
    [agreements],
  );

  // --- 이메일 인증: src/lib/signupEmailAuth.js 공용 시퀀스 ---
  // (상태 확인 → OTP 발송 → OTP 검증). 이 노드는 전화(카카오) 인증
  // 대신 이메일 인증코드만 쓰는 구성이라(§4.1) 별도 전화 인증 핸들러는 두지 않는다.
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
  // (휴대폰 알림톡 인증과 같은 방식. StudentForm/ParentForm/Under14Form과 동일 패턴)
  // OTP 자동검증 — updateVerification 호출이 자기 자신을 다시 트리거해 중복 검증 API 호출·루프로
  // 이어지지 않도록 useEffectEvent로 감싼다. emailCode 6자리 완성 시에만 실행되어야 한다.
  const onEmailCodeChange = useEffectEvent((token: string) => {
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
      // verifySignupEmailCode는 담당 파일이 아니라 수정할 수 없다 —
      // exactOptionalPropertyTypes 때문에 값이 null이면 키 자체를 생략해 전달한다
      // (내부에서 `mode || OTP_MODE.SIGNUP`로 처리하므로 동작은 동일하다).
      ...(verification.email.mode !== null && {
        mode: verification.email.mode,
      }),
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
  });

  useEffect(() => {
    onEmailCodeChange(formData.emailCode);
  }, [formData.emailCode]);

  // TODO(§4.3 GAP): "다음" 버튼이 가리키는 후속 스텝이 시안에 없다("다음" 버튼 → 후속 스텝
  // 존재 추정, §4.1). 필수 필드 전부 입력 + 필수 약관 전부 동의를 임시 활성 기준으로 채택 —
  // 실제 검증 규칙/다음 라우트는 디자이너·기획 확인 후 교체할 것(Under14Form.jsx의 동일
  // TODO와 같은 판단).
  const isNextEnabled =
    formData.name.trim() !== "" &&
    (formData.noOwnPhone || formData.phone.trim() !== "") &&
    formData.email.trim() !== "" &&
    formData.emailCode.trim() !== "" &&
    formData.password.trim() !== "" &&
    formData.region !== "" &&
    formData.schoolType !== "" &&
    (formData.schoolType === "N수생" || formData.schoolName.trim() !== "") &&
    formData.guardianPhone.trim() !== "" &&
    formData.guardianConsent &&
    requiredKeys.every((key) => agreements[key]);

  const [showNextComingSoon, setShowNextComingSoon] = useState(false);

  // TODO(다음 단계 미확정, §4.3): 실제 다음 라우트/제출 시퀀스가 정해지기 전까지 스텁으로
  // 남겨두되, Under14Form.jsx/ParentForm.jsx의 "준비 중" 안내 패턴과 동일하게 클릭 시
  // 사용자에게 안내 문구를 노출한다.
  function handleNext() {
    setShowNextComingSoon(true);
  }

  return (
    <AuthLayout>
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
          id="unified-name"
          name="name"
          size="default"
          value={formData.name}
          onChange={(v) => updateFormData({ name: v })}
          placeholder="이름을 입력 해주세요"
        />

        <div className="flex flex-col gap-2">
          <TextField
            label="전화번호"
            id="unified-phone"
            name="phone"
            size="default"
            value={formData.phone}
            onChange={(v) => updateFormData({ phone: v })}
            placeholder="전화번호를 입력 해주세요"
            disabled={formData.noOwnPhone}
          />

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
          id="unified-email"
          name="email"
          type="email"
          size="default"
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
          // helperText는 string(exactOptionalPropertyTypes, undefined 불가) —
          // TextField가 내부에서 truthy 체크만 하므로 ""는 undefined와 동일하게 렌더된다.
          helperText={verification.email.requested ? "" : emailMessage.text}
          status={
            verification.email.requested ? "default" : emailMessage.status
          }
        />

        {/* 6자리가 채워지면 자동 검증된다 — "확인" 버튼 없음. */}
        <TextField
          label="이메일 인증코드"
          id="unified-email-code"
          name="emailCode"
          size="default"
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
          id="unified-password"
          name="password"
          type="password"
          size="default"
          value={formData.password}
          onChange={(v) => updateFormData({ password: v })}
          placeholder="비밀번호를 입력 해주세요"
          helperText="영문/숫자/특수문자 포함 6자 이상"
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
          id="unified-region"
          name="region"
          size="default"
          value={formData.region}
          onChange={(v) => updateFormData({ region: v })}
          options={REGION_OPTIONS}
          placeholder="지역을 선택해주세요"
        />

        <SelectField
          label="재학 구분 선택"
          id="unified-school-type"
          name="schoolType"
          size="default"
          value={formData.schoolType}
          onChange={(v) => updateFormData({ schoolType: v })}
          options={SCHOOL_TYPE_OPTIONS}
          placeholder="재학 구분 선택"
        />

        <TextField
          label="재학 중인 학교"
          id="unified-school-name"
          name="schoolName"
          size="default"
          value={formData.schoolName}
          onChange={(v) => updateFormData({ schoolName: v })}
          placeholder="학교명 입력"
          disabled={formData.schoolType === "N수생"}
        />
      </section>

      <section className="flex w-full flex-col gap-3">
        <h2 className="text-xl font-medium text-ink">
          학부모 정보 <span className="text-primary">(필수)</span>
        </h2>

        {/* TODO(§4.1): 재추출 스크린샷은 예시값("01088601234")이 채워진 상태였다 — 실제
            기본값인지 목업용 예시 데이터인지 시안만으로는 구분 불가해 보수적으로 빈 입력 +
            다른 전화번호 필드와 동일한 placeholder를 유지한다. */}
        <TextField
          label="전화번호"
          id="unified-guardian-phone"
          name="guardianPhone"
          size="default"
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
        {/* 원문 후행 공백 재현("약관 동의 ") — §4.1 재추출 명세, 렌더 결과는 접혀 보이지만
            문자열은 원문 그대로 유지한다. */}
        <h2 className="text-xl font-medium text-ink">약관 동의 </h2>

        <AgreementList
          items={UNIFIED_AGREEMENT_ITEMS.map((item) => ({
            ...item,
            checked: agreements[item.key],
          }))}
          allChecked={allChecked}
          onToggleAll={() =>
            setAllAgreements(
              !allChecked,
              UNIFIED_AGREEMENT_ITEMS.map((item) => item.key),
            )
          }
          onToggleItem={(key) => updateAgreements({ [key]: !agreements[key] })}
        />
      </section>

      {showNextComingSoon && (
        <InfoCard variant="info">
          다음 단계 준비 중입니다. 잠시 후 다시 시도해 주세요.
        </InfoCard>
      )}

      {/* §4.1: "다음" 버튼 400×52px, radius 12px, 16px SemiBold — PrimaryButton
          size='default'/radius='default' 조합이 그대로 이 스펙과 일치한다. */}
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
