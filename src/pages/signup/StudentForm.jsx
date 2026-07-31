// [C-1] 학생 14세 이상 회원가입 폼 — docs/login-signup-renewal-spec.md §3.3 C-1,
// 노드 2393-7825(빈)/2393-8057(에러)/2393-8293·2393-8526(입력완료).
// 상태 매트릭스(기본/에러/완료)는 별도 화면 분기 없이 이 컴포넌트 하나가 실제 입력값·
// 인증 플래그에 따라 스스로 표현한다 — 에러 상태에서도 필드 테두리는 border-line 그대로
// 유지하고(§3.3 C-1 명세) 하단 helperText만 상태별 색으로 바뀐다("완료"는 canSubmit이
// true가 되는 시점 = 버튼 활성).
//
// 가입 시퀀스는 기존 src/pages/Signup.jsx와 동일한 호출 순서를 그대로 보존한다
// (§5.3: "가입 시퀀스(중복확인→signUp→OTP검증→RPC저장)는 서버 계약이므로 호출 순서는
// 보존"): 이메일 중복확인(is_email_available RPC) → auth.signUp(OTP 발송) →
// auth.verifyOtp → complete_signup_profile RPC.
//
// 전화번호 인증(카카오톡 OTP)은 AS-IS에 대응하는 백엔드 API가 없어 핸들러를 스텁으로
// 구현했다(TODO 표시, requestPhoneCode/자동 검증 useEffect 참고).
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AuthLayout,
  AuthTitle,
  TextField,
  SelectField,
  PrimaryButton,
  AgreementList
} from '../../components/auth';
import { useSignup } from '../../context/SignupContext';
import { supabase } from '../../lib/supabase';

// Under14Form(D-2)도 동일 지역 목록(17개 시도 + '기타')을 쓰므로 이 상수를 공유한다.
export const REGION_OPTIONS = [
  '서울',
  '부산',
  '대구',
  '인천',
  '광주',
  '대전',
  '울산',
  '세종',
  '경기',
  '강원',
  '충북',
  '충남',
  '전북',
  '전남',
  '경북',
  '경남',
  '제주',
  '기타'
];

const SCHOOL_TYPES = ['초등학교', '중학교', '고등학교', 'N수생', '기타'];

// §3.3 C-1 약관 6행 중 "모두 동의합니다"를 제외한 개별 5항목.
// identityRequired 키는 스펙 7825(정본) 채택 — 8057/8293의 중복 "개인정보 수집 및 이용"
// 표기는 오류로 간주(T1 계약 주석 참고).
const STUDENT_AGREEMENT_ITEMS = [
  { key: 'service', label: '위닝에듀 이용약관', required: true, to: '/terms/student/service' },
  {
    key: 'privacyRequired',
    label: '개인정보 수집 및 이용',
    required: true,
    to: '/terms/student/privacy'
  },
  {
    key: 'identityRequired',
    label: '본인 인증을 위한 정보 수집',
    required: true,
    to: '/terms/student/identity'
  },
  {
    key: 'marketing',
    label: '마케팅 목적의 개인정보 수집 및 이용',
    required: false,
    to: '/terms/student/marketing'
  },
  { key: 'ads', label: '광고성 정보 수신 동의', required: false, to: '/terms/student/promotion' }
];

const STUDENT_AGREEMENT_KEYS = STUDENT_AGREEMENT_ITEMS.map((item) => item.key);
const REQUIRED_AGREEMENT_KEYS = ['service', 'privacyRequired', 'identityRequired'];

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidPassword(value) {
  return /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{6,}$/.test(value);
}

function isValidPhone(value) {
  return /^01[0-9]-?[0-9]{3,4}-?[0-9]{4}$/.test(value);
}

function getFriendlyError(errorMessage) {
  if (!errorMessage) return '회원가입 중 문제가 발생했습니다.';

  if (errorMessage.includes('User already registered')) {
    return '이미 가입된 이메일입니다. 로그인 페이지에서 로그인해 주세요.';
  }

  if (errorMessage.includes('Password should be at least')) {
    return '비밀번호는 최소 6자 이상으로 입력해 주세요.';
  }

  if (errorMessage.includes('Invalid email')) {
    return '이메일 형식이 올바르지 않습니다.';
  }

  return errorMessage;
}

export default function StudentForm() {
  const navigate = useNavigate();
  const {
    memberType,
    isUnder14,
    formData,
    updateFormData,
    agreements,
    updateAgreements,
    setAllAgreements,
    verification,
    updateVerification,
    setSignupCompleted
  } = useSignup();

  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState('');
  const [phoneMessage, setPhoneMessage] = useState({ text: '', status: 'default' });
  const [emailMessage, setEmailMessage] = useState({ text: '', status: 'default' });
  const [emailSending, setEmailSending] = useState(false);

  // B-1(회원유형 선택)을 건너뛰고 직접 진입한 경우의 가드 — SignupContext 계약 주석
  // ("memberType===null인데 폼 단계 라우트에 직접 진입 시 /signup으로 redirect") 참고.
  // memberType===null(직접 진입) 또는 14세 미만(isUnder14!==false, 즉 true/null 미확정 포함)인
  // 경우에도 이 화면(14세 이상 전용)에 머무르지 않도록 함께 막는다.
  useEffect(() => {
    if (memberType !== 'student' || isUnder14 !== false) {
      navigate('/signup', { replace: true });
    }
  }, [memberType, isUnder14, navigate]);

  const passwordValid = formData.password ? isValidPassword(formData.password) : null;
  const emailActionBlockedByPassword = !isValidPassword(formData.password);
  const allRequiredAgreed = REQUIRED_AGREEMENT_KEYS.every((key) => agreements[key]);
  const allAgreed = STUDENT_AGREEMENT_KEYS.every((key) => agreements[key]);

  const agreementItems = STUDENT_AGREEMENT_ITEMS.map((item) => ({
    ...item,
    checked: agreements[item.key]
  }));

  // AS-IS(구 Signup.jsx updateForm) 동작 복원: 이메일/전화번호 값이 바뀌면 이미 진행된 인증
  // 상태가 더 이상 유효하지 않으므로 해당 인증 플래그를 초기값으로 되돌린다. updateVerification은
  // SignupContext state를 갱신하고 그 즉시 sessionStorage('signup-flow')에도 반영되므로(§5.3)
  // 새로고침 후에도 리셋된 상태 그대로 복구된다.
  function handleField(key) {
    return (value) => {
      updateFormData({ [key]: value });

      if (key === 'email') {
        updateVerification('email', { requested: false, verified: false, checked: false, available: false });
      }

      if (key === 'phone') {
        updateVerification('phone', { requested: false, verified: false });
      }
    };
  }

  function handleToggleAllAgreements() {
    setAllAgreements(!allAgreed, STUDENT_AGREEMENT_KEYS);
  }

  function handleToggleAgreement(key) {
    updateAgreements({ [key]: !agreements[key] });
  }

  // --- 전화번호 인증(카카오톡 OTP) — 스텁 ---
  // TODO: 카카오톡 인증번호 발송/검증 백엔드 연동 필요(시안 데이터에 API 계약 없음, §4 GAP).
  // 현재는 "발송" 클릭 시 requested=true만 표시하고, 인증번호 6자리가 입력되면 자동으로
  // verified=true 처리하는 임시 동작이다. 코드 불일치/만료 등 실패 케이스는 재현하지 않는다
  // — 실제 API 연동 시 verifyPhoneCode 쪽에 실패 분기를 추가할 것.
  function requestPhoneCode() {
    setFormError('');

    if (!isValidPhone(formData.phone.trim())) {
      setPhoneMessage({ text: '전화번호를 올바르게 입력해 주세요.', status: 'error' });
      return;
    }

    // TODO: 카카오톡 인증번호 발송 API 호출로 교체.
    updateVerification('phone', { requested: true, verified: false });
    setPhoneMessage({ text: '카카오톡으로 인증번호를 발송했습니다.', status: 'default' });
  }

  useEffect(() => {
    // TODO: 실제로는 서버 검증 응답을 받아야 한다 — 현재는 6자리 입력 시 임시로 통과 처리.
    if (
      verification.phone.requested &&
      !verification.phone.verified &&
      formData.phoneCode.trim().length === 6
    ) {
      updateVerification('phone', { verified: true });
      setPhoneMessage({ text: '전화번호 인증이 완료되었습니다.', status: 'success' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.phoneCode, verification.phone.requested]);

  // --- 이메일 인증: 기존 Signup.jsx 시퀀스 그대로(중복확인 → signUp으로 OTP 발송) ---
  // 시안(§3.3 C-1 표)에는 이메일 필드 액션이 "인증번호 보내기" 하나뿐이라 중복확인과
  // OTP 발송을 한 번의 클릭으로 묶었다(AS-IS는 중복확인/인증요청 버튼이 분리돼 있었음).
  async function requestEmailCode() {
    if (emailSending) return;

    const normalizedEmail = formData.email.trim().toLowerCase();

    setFormError('');

    if (!normalizedEmail) {
      setEmailMessage({ text: '이메일을 먼저 입력해 주세요.', status: 'error' });
      return;
    }

    if (!isValidEmail(normalizedEmail)) {
      setEmailMessage({ text: '이메일 형식이 올바르지 않습니다.', status: 'error' });
      return;
    }

    setEmailSending(true);
    setEmailMessage({ text: '이메일 중복 여부를 확인하는 중입니다.', status: 'default' });

    try {
      const { data, error } = await supabase.rpc('is_email_available', {
        check_email: normalizedEmail
      });

      if (error) {
        console.error('이메일 중복확인 오류:', error);
        updateVerification('email', { checked: false, available: false });
        setEmailMessage({
          text: '중복확인 기능을 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.',
          status: 'error'
        });
        return;
      }

      if (data !== true) {
        updateVerification('email', { checked: true, available: false });
        setEmailMessage({
          text: '이메일이 중복됩니다. 로그인 페이지에서 로그인해 주세요.',
          status: 'error'
        });
        return;
      }

      updateVerification('email', { checked: true, available: true });

      if (!isValidPassword(formData.password)) {
        setEmailMessage({
          text: '비밀번호를 영문/숫자/특수문자 포함 6자 이상으로 먼저 입력해 주세요.',
          status: 'error'
        });
        return;
      }

      try {
        await supabase.auth.signOut({ scope: 'global' });
      } catch (_error) {
        // ignore
      }

      const { error: signUpError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password: formData.password,
        options: {
          data: {
            email: normalizedEmail,
            name: formData.name.trim(),
            full_name: formData.name.trim(),
            member_type: 'student',
            role: 'user'
          }
        }
      });

      if (signUpError) {
        setEmailMessage({ text: getFriendlyError(signUpError.message), status: 'error' });
        return;
      }

      updateVerification('email', { requested: true });
      setEmailMessage({ text: '입력한 이메일로 인증코드를 발송했습니다.', status: 'default' });
    } finally {
      setEmailSending(false);
    }
  }

  // T1 계약 주석: "인증코드 확인용 별도 확인 버튼이 필요하면 이 슬롯 재사용하거나 페이지
  // 쪽에서 별도 버튼 추가" — 시안 표(§3.3 C-1 #5)에는 이메일 인증코드 필드의 부가 UI가
  // 없지만 OTP 검증 트리거가 반드시 필요해 액션 슬롯을 "확인" 버튼으로 재사용한다.
  async function verifyEmailCode() {
    const normalizedEmail = formData.email.trim().toLowerCase();
    const token = formData.emailCode.trim();

    setFormError('');

    if (!verification.email.requested) {
      setEmailMessage({ text: '먼저 인증번호를 발송해 주세요.', status: 'error' });
      return;
    }

    if (!token) {
      setEmailMessage({ text: '인증코드를 입력해 주세요.', status: 'error' });
      return;
    }

    const { error } = await supabase.auth.verifyOtp({
      email: normalizedEmail,
      token,
      type: 'signup'
    });

    if (error) {
      updateVerification('email', { verified: false });
      setEmailMessage({ text: '인증번호가 틀립니다.', status: 'error' });
      return;
    }

    const { data: userData } = await supabase.auth.getUser();
    const currentUser = userData.user;

    if (currentUser?.id) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('email, member_type')
        .eq('id', currentUser.id)
        .maybeSingle();

      if (profile?.email && profile?.member_type) {
        updateVerification('email', { verified: false });
        setEmailMessage({
          text: '이미 가입된 이메일입니다. 로그인 페이지에서 로그인해 주세요.',
          status: 'error'
        });
        return;
      }
    }

    updateVerification('email', { verified: true });
    setEmailMessage({ text: '이메일 인증이 완료되었습니다.', status: 'success' });
  }

  function validateForm() {
    const normalizedName = formData.name.trim();
    const normalizedPhone = formData.phone.trim();
    const normalizedEmail = formData.email.trim().toLowerCase();

    if (!normalizedName) return '이름을 입력해 주세요.';
    if (!isValidPhone(normalizedPhone)) return '전화번호를 올바르게 입력해 주세요.';
    if (!verification.phone.verified) return '전화번호 인증을 완료해 주세요.';
    if (!normalizedEmail) return '이메일을 입력해 주세요.';

    if (!verification.email.checked || !verification.email.available) {
      return '이메일 중복확인을 완료해 주세요.';
    }

    if (!verification.email.verified) return '이메일 인증을 완료해 주세요.';

    if (!isValidPassword(formData.password)) {
      return '비밀번호는 영문, 숫자, 특수문자를 모두 포함해 6자 이상 입력해 주세요.';
    }

    if (!formData.region) return '지역을 선택해 주세요.';
    if (!formData.schoolType) return '재학 구분을 선택해 주세요.';

    if (formData.schoolType !== 'N수생' && !formData.schoolName.trim()) {
      return '재학 중인 학교명을 입력해 주세요.';
    }

    if (!allRequiredAgreed) return '필수 약관에 동의해야 회원가입을 진행할 수 있습니다.';

    return '';
  }

  const submitValidationMessage = validateForm();
  const canSubmit = !loading && submitValidationMessage === '';

  async function handleSubmit() {
    setFormError('');

    const validationMessage = validateForm();

    if (validationMessage) {
      setFormError(validationMessage);
      return;
    }

    setLoading(true);

    try {
      const normalizedName = formData.name.trim();
      const normalizedEmail = formData.email.trim().toLowerCase();
      const normalizedPhone = String(formData.phone || '')
        .replaceAll('-', '')
        .trim();
      const normalizedSchoolName =
        formData.schoolType === 'N수생' ? '' : formData.schoolName.trim();

      const { data: userData, error: getUserError } = await supabase.auth.getUser();

      if (getUserError) {
        setFormError(`사용자 정보를 불러오지 못했습니다: ${getUserError.message}`);
        return;
      }

      const currentUser = userData.user;

      if (!currentUser?.id) {
        setFormError('이메일 인증 세션을 찾을 수 없습니다. 다시 인증해 주세요.');
        return;
      }

      if ((currentUser.email || '').toLowerCase() !== normalizedEmail) {
        setFormError('인증한 이메일과 입력한 이메일이 다릅니다. 다시 인증해 주세요.');
        return;
      }

      const { data: profileResult, error: profileError } = await supabase.rpc(
        'complete_signup_profile',
        {
          p_name: normalizedName,
          p_username: normalizedEmail,
          p_phone: normalizedPhone,
          p_email: normalizedEmail,
          p_region: formData.region,
          p_school_type: formData.schoolType,
          p_school_name: normalizedSchoolName,
          p_member_type: 'student',
          p_terms_service_agreed: agreements.service,
          p_privacy_required_agreed: agreements.privacyRequired,
          // TODO(§4 GAP): identityRequired("본인 인증을 위한 정보 수집")는 현재
          // complete_signup_profile RPC에 대응 파라미터가 없다. 클라이언트 단 필수 동의
          // 검증(validateForm)만 수행 중이며, 백엔드에 p_identity_required_agreed 파라미터
          // 추가 여부를 확인해야 한다.
          p_privacy_optional_agreed: agreements.privacyOptional,
          p_marketing_agreed: agreements.marketing,
          p_ads_agreed: agreements.ads
        }
      );

      if (profileError) {
        const errorMessage = String(profileError.message || '').toLowerCase();

        if (errorMessage.includes('duplicate_email')) {
          setFormError('이미 가입된 이메일입니다. 로그인 페이지에서 로그인해 주세요.');
          return;
        }

        if (errorMessage.includes('not_authenticated')) {
          setFormError('로그인 세션이 만료되었습니다. 이메일 인증을 다시 진행해 주세요.');
          return;
        }

        if (errorMessage.includes('terms_service_required')) {
          setFormError('이용약관 필수 동의가 필요합니다.');
          return;
        }

        if (errorMessage.includes('privacy_required')) {
          setFormError('개인정보 필수 동의가 필요합니다.');
          return;
        }

        if (errorMessage.includes('name_required')) {
          setFormError('이름을 입력해 주세요.');
          return;
        }

        if (errorMessage.includes('region_required')) {
          setFormError('지역을 선택해 주세요.');
          return;
        }

        if (errorMessage.includes('school_type_required')) {
          setFormError('재학 구분을 선택해 주세요.');
          return;
        }

        setFormError(`회원 정보 저장 중 문제가 발생했습니다: ${profileError.message}`);
        return;
      }

      if (!profileResult?.ok) {
        setFormError('회원 정보 저장 결과를 확인할 수 없습니다. 다시 시도해 주세요.');
        return;
      }

      // C-2(StudentComplete) 진입 가드용 완료 플래그 — RPC 성공 직후에만 true로 설정한다.
      setSignupCompleted(true);

      // AS-IS 정책 유지: 가입 완료 직후 세션을 파기(signOut)한다.
      // TODO(§3.3 C-2 "함의"): C-2 완료 화면은 "무료 진단 시작하기" CTA로 바로 진입하는
      // 시안이라 가입 직후 로그인 상태 유지가 전제로 보인다 — AS-IS(가입 완료 시 signOut
      // 후 로그인 유도)와 정면 충돌한다(정책 확인 필요). 정책이 확정되기 전까지는 기존
      // 동작(signOut)을 그대로 둔다.
      try {
        await supabase.auth.signOut({ scope: 'global' });
      } catch (signOutError) {
        console.error('가입 완료 후 로그아웃 오류:', signOutError);
      }

      navigate('/signup/student/complete');
    } catch (error) {
      setFormError(`가입 처리 중 오류가 발생했습니다: ${error.message || String(error)}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout>
      {/* TODO: C-1 자체 타이틀 문구는 시안 데이터에 없음(§3.3 C-1) — 동일 톤인 E-1 문구로
          임시 대체. 디자이너 확인 후 확정 문구로 교체 필요. */}
      <AuthTitle
        line1={<span className="sm:whitespace-nowrap">회원가입 정보를 입력해주세요</span>}
        line1Color="ink"
      />

      {formError && (
        <p role="alert" className="w-full text-sm text-error">
          {formError}
        </p>
      )}

      <section className="flex w-full flex-col gap-4">
        <h2 className="w-full text-lg font-semibold text-ink">학생정보 (필수)</h2>

        <TextField
          label="이름"
          id="student-name"
          name="name"
          size="lg"
          value={formData.name}
          onChange={handleField('name')}
          placeholder="이름을 입력 해주세요"
          autoComplete="name"
          required
        />

        <TextField
          label="전화번호"
          id="student-phone"
          name="phone"
          type="tel"
          size="lg"
          value={formData.phone}
          onChange={handleField('phone')}
          placeholder="전화번호를 입력 해주세요"
          actionLabel="인증번호 보내기"
          onAction={requestPhoneCode}
          actionDisabled={verification.phone.verified}
          helperText={phoneMessage.text}
          status={phoneMessage.status}
          autoComplete="tel"
          required
        />

        <TextField
          label="전화번호 인증번호"
          id="student-phone-code"
          name="phoneCode"
          size="lg"
          value={formData.phoneCode}
          onChange={handleField('phoneCode')}
          placeholder="카카오톡으로 보낸 인증번호를 입력 해주세요"
          actionLabel="인증번호 다시 보내기"
          onAction={requestPhoneCode}
          actionDisabled={!verification.phone.requested || verification.phone.verified}
          disabled={!verification.phone.requested}
        />

        <TextField
          label="아이디(이메일)"
          id="student-email"
          name="email"
          type="email"
          size="lg"
          value={formData.email}
          onChange={handleField('email')}
          placeholder="이메일을 입력 해주세요"
          actionLabel={
            verification.email.requested ? '인증번호 다시 보내기' : '인증번호 보내기'
          }
          onAction={requestEmailCode}
          actionDisabled={emailSending || verification.email.verified || emailActionBlockedByPassword}
          helperText={
            emailActionBlockedByPassword ? '비밀번호 입력 후 인증할 수 있어요' : emailMessage.text
          }
          status={emailActionBlockedByPassword ? 'default' : emailMessage.status}
          autoComplete="email"
          required
        />

        <TextField
          label="이메일 인증코드"
          id="student-email-code"
          name="emailCode"
          size="lg"
          value={formData.emailCode}
          onChange={handleField('emailCode')}
          placeholder="이메일 인증코드 6자리를 입력해주세요"
          actionLabel="확인"
          onAction={verifyEmailCode}
          actionDisabled={!verification.email.requested || verification.email.verified}
          disabled={!verification.email.requested}
        />

        <TextField
          label="비밀번호"
          id="student-password"
          name="password"
          type="password"
          size="lg"
          value={formData.password}
          onChange={handleField('password')}
          placeholder="비밀번호를 입력 해주세요"
          helperText="영문/숫자/특수문자 포함 6자 이상"
          status={passwordValid === null ? 'default' : passwordValid ? 'success' : 'error'}
          autoComplete="new-password"
          required
        />

        <SelectField
          label="지역"
          id="student-region"
          name="region"
          size="lg"
          value={formData.region}
          onChange={handleField('region')}
          placeholder="지역을 선택해주세요"
          options={REGION_OPTIONS}
          required
        />

        <SelectField
          label="재학 구분 선택"
          id="student-school-type"
          name="schoolType"
          size="lg"
          value={formData.schoolType}
          onChange={handleField('schoolType')}
          placeholder="재학 구분 선택"
          options={SCHOOL_TYPES}
          required
        />

        <TextField
          label="재학 중인 학교"
          id="student-school-name"
          name="schoolName"
          size="lg"
          value={formData.schoolName}
          onChange={handleField('schoolName')}
          placeholder="학교명 입력"
          disabled={formData.schoolType === 'N수생'}
        />
      </section>

      <section className="flex w-full flex-col gap-3">
        <h2 className="w-full text-lg font-semibold text-ink">약관 동의</h2>

        <AgreementList
          items={agreementItems}
          allChecked={allAgreed}
          onToggleAll={handleToggleAllAgreements}
          onToggleItem={handleToggleAgreement}
        />
      </section>

      {!canSubmit && !loading && submitValidationMessage && (
        <p role="status" className="w-full text-xs text-ink-sub">
          {submitValidationMessage}
        </p>
      )}

      <PrimaryButton
        size="lg"
        radius="default"
        disabled={!canSubmit}
        loading={loading}
        onClick={handleSubmit}
      >
        {loading ? '가입 처리 중...' : '가입 완료하기'}
      </PrimaryButton>
    </AuthLayout>
  );
}
