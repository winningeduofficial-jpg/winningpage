// [E-1] 학부모 회원가입 폼 — docs/login-signup-renewal-spec.md §3.3 E-1, 노드 2393:10666.
// 학생 폼(C-1)과 달리 지역/재학구분/학교명 없음, 약관 4행(모두동의+3항목)만 사용.
// 전화/이메일 인증은 §4.2-1 백엔드(카카오 알림톡) 미구현 상태라 mockApi.js의 placeholder로
// 대체하고, 인증코드 필드는 6자리 입력이 채워지는 즉시 자동 검증한다(TextField의 액션 링크
// 슬롯은 스펙대로 "인증번호 보내기"/"인증번호 다시 보내기"에만 사용하고, 별도 "확인" 버튼은
// 두지 않음 — T1 계약 주석 참고).
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AuthLayout,
  AuthTitle,
  TextField,
  PrimaryButton,
  AgreementList
} from '../../../components/auth';
import { useSignup } from '../../../context/SignupContext';
import {
  requestPhoneVerificationCode,
  verifyPhoneVerificationCode,
  requestEmailVerificationCode,
  verifyEmailVerificationCode,
  completeParentSignup
} from './mockApi';

const PHONE_REGEX = /^01[0-9]-?[0-9]{3,4}-?[0-9]{4}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{6,}$/;

// TODO(백엔드 §5.5 순서5): is_email_available→auth.signUp→verifyOtp→complete_signup_profile
// 실제 RPC 시퀀스가 연결되기 전까지는 완료 버튼이 mockApi.completeParentSignup만 호출해
// 실제 계정/프로필을 생성하지 않는다. 배포 환경에서 학부모 가입을 노출하지 않도록 이
// feature flag(VITE_PARENT_SIGNUP_ENABLED='true')가 켜진 경우에만 폼을 렌더링한다.
const PARENT_SIGNUP_ENABLED = import.meta.env.VITE_PARENT_SIGNUP_ENABLED === 'true';

const AGREEMENT_KEYS = ['service', 'privacyRequired', 'marketing'];
const AGREEMENT_LABELS = [
  { key: 'service', label: '위닝에듀 이용약관', required: true, to: '/terms/parent/service' },
  { key: 'privacyRequired', label: '개인정보 수집 및 이용', required: true, to: '/terms/parent/privacy' },
  { key: 'marketing', label: '마케팅 목적의 개인정보 수집 및 이용', required: false, to: '/terms/parent/marketing' }
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
    updateVerification
  } = useSignup();

  // 학부모 폼으로 직접 진입(새로고침/직접 URL)한 경우에도 이 화면은 학부모 플로우의
  // 시작점이므로 memberType을 강제로 되돌리지 않고 'parent'로 확정한다.
  useEffect(() => {
    if (memberType !== 'parent') {
      setMemberType('parent');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [phoneMockCode, setPhoneMockCode] = useState('');
  const [emailMockCode, setEmailMockCode] = useState('');
  const [phoneSending, setPhoneSending] = useState(false);
  const [emailSending, setEmailSending] = useState(false);
  const [phoneError, setPhoneError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // 전화 인증코드 6자리가 채워지면 자동 검증(별도 "확인" 버튼 없이 처리).
  useEffect(() => {
    if (
      formData.phoneCode.length === 6 &&
      verification.phone.requested &&
      !verification.phone.verified
    ) {
      verifyPhoneVerificationCode(formData.phone, formData.phoneCode, phoneMockCode).then(
        (ok) => {
          if (ok) {
            updateVerification('phone', { verified: true });
            setPhoneError('');
          } else {
            setPhoneError('인증번호가 틀립니다');
          }
        }
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.phoneCode]);

  // 이메일 인증코드 6자리가 채워지면 자동 검증.
  useEffect(() => {
    if (
      formData.emailCode.length === 6 &&
      verification.email.requested &&
      !verification.email.verified
    ) {
      verifyEmailVerificationCode(formData.email, formData.emailCode, emailMockCode).then(
        (ok) => {
          if (ok) {
            updateVerification('email', { verified: true });
            setEmailError('');
          } else {
            setEmailError('인증번호가 틀립니다');
          }
        }
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.emailCode]);

  async function handleSendPhoneCode() {
    if (!PHONE_REGEX.test(formData.phone)) {
      setPhoneError('올바른 전화번호를 입력해 주세요');
      return;
    }

    setPhoneSending(true);
    setPhoneError('');

    const { mockCode } = await requestPhoneVerificationCode(formData.phone);
    setPhoneMockCode(mockCode);
    updateVerification('phone', { requested: true, verified: false });
    updateFormData({ phoneCode: '' });
    setPhoneSending(false);
  }

  async function handleSendEmailCode() {
    if (!EMAIL_REGEX.test(formData.email)) {
      setEmailError('올바른 이메일을 입력해 주세요');
      return;
    }

    setEmailSending(true);
    setEmailError('');

    const { mockCode } = await requestEmailVerificationCode(formData.email);
    setEmailMockCode(mockCode);
    updateVerification('email', { requested: true, verified: false });
    updateFormData({ emailCode: '' });
    setEmailSending(false);
  }

  function handlePasswordChange(value) {
    updateFormData({ password: value });
    if (!value) {
      setPasswordError('');
    } else if (!PASSWORD_REGEX.test(value)) {
      setPasswordError('영문/숫자/특수문자 포함 6자 이상');
    } else {
      setPasswordError('');
    }
  }

  const passwordStatus = !formData.password ? 'default' : passwordError ? 'error' : 'success';
  const passwordHelper = !formData.password
    ? '영문/숫자/특수문자 포함 6자 이상'
    : passwordError || '영문/숫자/특수문자 포함 6자 이상';

  const requiredAgreementsChecked = agreements.service && agreements.privacyRequired;
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
    // TODO(백엔드 §5.5 순서5): 실제 가입은 is_email_available→signUp→verifyOtp→
    // complete_signup_profile RPC 시퀀스를 재사용해야 한다. 지금은 mock으로 대체.
    await completeParentSignup(formData);
    setSubmitting(false);

    navigate('/signup/parent/link');
  }

  if (!PARENT_SIGNUP_ENABLED) {
    return (
      <AuthLayout>
        <AuthTitle line1="학부모 회원가입은 준비 중입니다" />

        <p className="w-full text-center text-sm text-ink">
          실제 계정 생성 연동이 완료된 후 오픈될 예정입니다. 잠시 후 다시 시도해 주세요.
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <AuthTitle line1="회원가입 정보를 입력해주세요" />

      <div className="flex w-full flex-col gap-5">
        <p className="text-sm font-medium text-ink">학부모 기본 정보 (필수)</p>

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
          actionDisabled={phoneSending || verification.phone.verified}
          helperText={phoneError || undefined}
          status={phoneError ? 'error' : 'default'}
          required
        />

        <TextField
          label="전화번호 인증번호"
          id="phoneCode"
          name="phoneCode"
          value={formData.phoneCode}
          onChange={(value) => updateFormData({ phoneCode: value.replace(/\D/g, '').slice(0, 6) })}
          placeholder="카카오톡으로 보낸 인증번호를 입력 해주세요"
          actionLabel="인증번호 다시 보내기"
          onAction={handleSendPhoneCode}
          actionDisabled={!verification.phone.requested || phoneSending || verification.phone.verified}
          helperText={
            verification.phone.verified ? '인증되었습니다' : phoneError || undefined
          }
          status={verification.phone.verified ? 'success' : phoneError ? 'error' : 'default'}
          disabled={!verification.phone.requested}
        />

        <TextField
          label="아이디(이메일)"
          id="email"
          name="email"
          type="email"
          value={formData.email}
          onChange={(value) => updateFormData({ email: value })}
          placeholder="이메일을 입력 해주세요"
          actionLabel="인증번호 보내기"
          onAction={handleSendEmailCode}
          actionDisabled={emailSending || verification.email.verified}
          helperText={emailError || undefined}
          status={emailError ? 'error' : 'default'}
          required
        />

        <TextField
          label="이메일 인증코드"
          id="emailCode"
          name="emailCode"
          value={formData.emailCode}
          onChange={(value) => updateFormData({ emailCode: value.replace(/\D/g, '').slice(0, 6) })}
          placeholder="이메일 인증코드 6자리를 입력해주세요"
          helperText={
            verification.email.verified ? '인증되었습니다' : emailError || undefined
          }
          status={verification.email.verified ? 'success' : emailError ? 'error' : 'default'}
          disabled={!verification.email.requested}
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
        <p className="text-sm font-medium text-ink">약관 동의</p>

        <AgreementList
          items={AGREEMENT_LABELS.map((item) => ({ ...item, checked: agreements[item.key] }))}
          allChecked={allChecked}
          onToggleAll={() => setAllAgreements(!allChecked, AGREEMENT_KEYS)}
          onToggleItem={(key) => updateAgreements({ [key]: !agreements[key] })}
        />
      </div>

      <PrimaryButton onClick={handleSubmit} disabled={!canSubmit || submitting}>
        가입 완료하기
      </PrimaryButton>
    </AuthLayout>
  );
}
