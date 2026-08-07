// [C-1] 학생 14세 이상 회원가입 폼 — docs/login-signup-renewal-spec.md §3.3 C-1,
// 노드 2393-7825(빈)/2393-8057(에러)/2393-8293·2393-8526(입력완료).
// 상태 매트릭스(기본/에러/완료)는 별도 화면 분기 없이 이 컴포넌트 하나가 실제 입력값·
// 인증 플래그에 따라 스스로 표현한다 — 에러 상태에서도 필드 테두리는 border-line 그대로
// 유지하고(§3.3 C-1 명세) 하단 helperText만 상태별 색으로 바뀐다("완료"는 canSubmit이
// true가 되는 시점 = 버튼 활성).
//
// 가입 시퀀스는 기존 src/pages/Signup.jsx와 동일한 호출 순서를 그대로 보존한다
// (§5.3: "가입 시퀀스(중복확인→signUp→OTP검증→RPC저장)는 서버 계약이므로 호출 순서는
// 보존"): 이메일 상태 확인 → OTP 발송 → OTP 검증 → complete_signup_profile RPC.
//
// 앞의 세 단계는 src/lib/signupEmailAuth.js로 옮겼다. 가입 중단 계정을 이어서
// 가입시키려면 상태에 따라 signUp / signInWithOtp를 갈라 써야 하는데, 세 가입
// 화면이 같은 시퀀스를 복제하고 있어 분기가 어긋날 위험이 컸다.
//
// 전화번호 인증은 src/lib/phoneVerification.js를 거쳐 실제 서버가 판정한다
// (발송 /api/send-phone-code, 검증 /api/verify-phone-code). 예전 스텁처럼
// "6자리 입력 = 통과"가 아니며, 가입 RPC도 인증 여부를 다시 확인한다
// (sql/40_auth_signup.sql [15]).
//
// 2026-08-07 변경 3건
//  1. 이메일 인증에 걸려 있던 "비밀번호 먼저" 선행 조건을 없앴다. 비밀번호 필드가
//     이메일보다 아래에 있어서 사용자가 내려갔다 되돌아와야 했다. 계정 비밀번호는
//     가입 완료 직전 applySignupPassword가 맞춘다(src/lib/signupEmailAuth.js).
//  2. 이메일 인증코드도 휴대폰과 똑같이 6자리가 채워지면 자동 검증한다. "확인"
//     버튼을 없앴다.
//  3. 이미 가입에 쓰인 전화번호는 "인증번호 보내기" 단계에서 걸러낸다
//     (/api/send-phone-code reason:'phone_taken'). 경합으로 뚫린 경우는 가입 RPC의
//     duplicate_phone이 잡는다(sql/40_auth_signup.sql [16]).
import { useEffect, useRef, useState } from 'react';
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
import {
  EMAIL_RESEND_COOLDOWN_SECONDS,
  EMAIL_STATE,
  MESSAGES,
  applySignupPassword,
  sendSignupEmailCode,
  verifySignupEmailCode
} from '../../lib/signupEmailAuth';
import { useCooldown } from '../../hooks/useCooldown';
import {
  DUPLICATE_PHONE_MESSAGE,
  isValidMobile,
  normalizePhone,
  sendPhoneCode,
  verifyPhoneCode
} from '../../lib/phoneVerification';

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

// 하이픈 유무와 무관하게 판정한다. 서버(api/_lib/phoneCode.js)와 같은 규칙을 쓰려고
// lib에 위임한다 — 프론트만 느슨하면 발송 단계에서 invalid_phone으로 되돌아온다.
function isValidPhone(value) {
  return isValidMobile(value);
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
    setSignupCompleted,
    setLinkCode
  } = useSignup();

  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState('');
  const [phoneMessage, setPhoneMessage] = useState({ text: '', status: 'default' });
  const [phoneSending, setPhoneSending] = useState(false);
  const phoneCooldown = useCooldown(60);
  // 서버가 시도를 세므로 같은 코드를 두 번 보내지 않는다.
  const lastPhoneAttempt = useRef('');
  const [emailMessage, setEmailMessage] = useState({ text: '', status: 'default' });
  const [emailSending, setEmailSending] = useState(false);
  const emailCooldown = useCooldown(EMAIL_RESEND_COOLDOWN_SECONDS);
  // 이메일 OTP도 1회용이라 같은 코드를 두 번 검증하면 403이 난다. 휴대폰과 동일하게
  // 마지막 시도값을 기억해 자동 검증이 같은 값으로 재시도하지 않게 한다.
  const lastEmailAttempt = useRef('');

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
        lastEmailAttempt.current = '';
        updateVerification('email', { requested: false, verified: false, checked: false, available: false });
      }

      if (key === 'phone') {
        lastPhoneAttempt.current = '';
        updateVerification('phone', { requested: false, verified: false });
        setPhoneMessage({ text: '', status: 'default' });
      }
    };
  }

  function handleToggleAllAgreements() {
    setAllAgreements(!allAgreed, STUDENT_AGREEMENT_KEYS);
  }

  function handleToggleAgreement(key) {
    updateAgreements({ [key]: !agreements[key] });
  }

  // --- 전화번호 인증(알림톡/SMS) ---
  // 발송은 /api/send-phone-code, 검증은 /api/verify-phone-code가 담당한다.
  // 판정을 서버가 하므로 예전 스텁처럼 "6자리 입력 = 통과"가 아니다.
  //
  // ⚠️ 서버가 시도를 5회로 끊는다. 같은 코드를 두 번 보내지 않도록 마지막 시도값을
  //   기억한다 — 지웠다 다시 입력하는 것만으로 기회가 깎이면 안 된다.
  async function requestPhoneCode() {
    setFormError('');

    if (!isValidPhone(formData.phone)) {
      setPhoneMessage({ text: '전화번호를 올바르게 입력해 주세요.', status: 'error' });
      return;
    }

    if (phoneCooldown.active) {
      setPhoneMessage({
        text: `인증번호는 ${phoneCooldown.remaining}초 후에 다시 보낼 수 있어요.`,
        status: 'error'
      });
      return;
    }

    setPhoneSending(true);
    setPhoneMessage({ text: '', status: 'default' });

    try {
      const result = await sendPhoneCode(formData.phone, 'signup');

      if (!result.ok) {
        // 한도에 걸린 경우 서버가 알려준 대기 시간을 그대로 반영한다.
        if (result.retryAfter) phoneCooldown.start();

        // 이미 가입에 쓰인 번호다. 서버가 문자를 보내지 않았으므로 인증코드
        // 필드를 열어두면 안 된다.
        if (result.reason === 'phone_taken') {
          updateVerification('phone', { requested: false, verified: false });
          setPhoneMessage({ text: DUPLICATE_PHONE_MESSAGE, status: 'error' });
          return;
        }

        setPhoneMessage({ text: result.message, status: 'error' });
        return;
      }

      lastPhoneAttempt.current = '';
      updateVerification('phone', { requested: true, verified: false });
      updateFormData({ phoneCode: '' });
      phoneCooldown.start();
      setPhoneMessage({
        // 운영에서 dryRun이 true면 문자가 실제로 나가지 않은 것이다.
        text: result.dryRun
          ? '테스트 모드입니다 — 실제 문자는 발송되지 않았습니다.'
          : '카카오톡으로 인증번호를 발송했습니다.',
        status: 'default'
      });
    } finally {
      setPhoneSending(false);
    }
  }

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

    verifyPhoneCode(formData.phone, code).then((result) => {
      if (result.ok) {
        updateVerification('phone', { verified: true });
        setPhoneMessage({ text: '전화번호 인증이 완료되었습니다.', status: 'success' });
        return;
      }

      setPhoneMessage({ text: result.message, status: 'error' });

      // 시도가 소진되거나 만료되면 재발송 외에 길이 없다. 다음 입력이 다시
      // 시도되도록 잠금을 푼다.
      if (result.reason === 'too_many_attempts' || result.reason === 'code_expired') {
        lastPhoneAttempt.current = '';
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.phoneCode]);

  // --- 이메일 인증: 기존 Signup.jsx 시퀀스 그대로(중복확인 → signUp으로 OTP 발송) ---
  // 시안(§3.3 C-1 표)에는 이메일 필드 액션이 "인증번호 보내기" 하나뿐이라 중복확인과
  // OTP 발송을 한 번의 클릭으로 묶었다(AS-IS는 중복확인/인증요청 버튼이 분리돼 있었음).
  async function requestEmailCode() {
    if (emailSending) return;

    // Supabase Auth가 서버에서 같은 간격으로 막고 있다. 여기서 먼저 잡아주지
    // 않으면 연타가 전부 실패 응답으로 돌아오면서 시간당 발송 할당량만 태운다.
    if (emailCooldown.active) {
      setEmailMessage({ text: MESSAGES.cooldown(emailCooldown.remaining), status: 'error' });
      return;
    }

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
      // 비밀번호는 여기서 요구하지 않는다(파일 상단 2026-08-07 변경 1번).
      // 아직 비어 있으면 임시 비밀번호로 계정이 만들어지고, 실제 값은
      // 가입 완료 직전 applySignupPassword가 채운다.
      const { state, mode, resumed, error } = await sendSignupEmailCode({
        email: normalizedEmail,
        password: formData.password,
        name: formData.name.trim(),
        memberType: 'student'
      });

      if (error) {
        console.error('이메일 인증코드 발송 오류:', error);
        updateVerification('email', { checked: false, available: false });
        setEmailMessage({
          // state가 없으면 상태 조회 자체가 실패한 것이고, 있으면 발송이 실패한 것이다.
          text: state ? getFriendlyError(error.message) : MESSAGES.checkFailed,
          status: 'error'
        });
        return;
      }

      if (state === EMAIL_STATE.TAKEN) {
        updateVerification('email', { checked: true, available: false });
        setEmailMessage({ text: MESSAGES.taken, status: 'error' });
        return;
      }

      // 이어가기(resumed)도 진행 가능한 상태이므로 available로 표시한다.
      lastEmailAttempt.current = '';
      updateVerification('email', {
        checked: true,
        available: true,
        requested: true,
        verified: false,
        mode,
        resumed
      });
      updateFormData({ emailCode: '' });
      emailCooldown.start();
      setEmailMessage({
        text: resumed ? MESSAGES.resumed : MESSAGES.sent,
        status: 'default'
      });
    } finally {
      setEmailSending(false);
    }
  }

  // 6자리가 채워지면 곧바로 검증한다 — 휴대폰(알림톡) 인증과 같은 방식이라
  // 별도 "확인" 버튼을 두지 않는다(파일 상단 2026-08-07 변경 2번).
  // ParentForm(E-1)이 이미 쓰던 패턴이다.
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
      mode: verification.email.mode
    }).then(async ({ error }) => {
      if (error) {
        updateVerification('email', { verified: false });
        setEmailMessage({ text: MESSAGES.codeMismatch, status: 'error' });
        return;
      }

      // 인증에 성공한 계정이 이미 가입을 끝낸 계정일 수 있다(발송 시점과 지금
      // 사이에 다른 창에서 가입을 마친 경우). 그대로 두면 기존 회원의 프로필을
      // 덮어쓰는 요청으로 이어진다.
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
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.emailCode]);

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
      const normalizedPhone = normalizePhone(formData.phone);
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

      // 계정 비밀번호를 폼에 입력된 값으로 맞춘다. 이메일 인증 시점에는 임시
      // 비밀번호였을 수 있어서(파일 상단 변경 1번) 이 호출을 빠뜨리면 방금 정한
      // 비밀번호로 로그인할 수 없다.
      const { error: passwordError } = await applySignupPassword(formData.password);

      if (passwordError) {
        setFormError('비밀번호 설정에 실패했습니다. 잠시 후 다시 시도해 주세요.');
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
          // identityRequired("본인 인증을 위한 정보 수집") — sql/40_auth_signup.sql [7]에서
          // 파라미터가 추가되어 GAP 해소됨. 서버가 학생에 한해 필수로 검증하고,
          // 동의 이력은 user_term_agreements에 약관 버전 단위로 기록된다.
          p_identity_required_agreed: agreements.identityRequired,
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

        // sql/40 [16]. unique 인덱스 위반(23505)은 [16] 미적용 환경에서 같은 상황이
        // 원문 메시지로 올라오는 경우를 위한 대비다.
        if (
          errorMessage.includes('duplicate_phone') ||
          (errorMessage.includes('duplicate key') && errorMessage.includes('phone'))
        ) {
          setFormError(DUPLICATE_PHONE_MESSAGE);
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

        if (errorMessage.includes('identity_required')) {
          setFormError('본인 인증을 위한 정보 수집 동의가 필요합니다.');
          return;
        }

        if (errorMessage.includes('invalid_member_type')) {
          setFormError('회원 유형이 올바르지 않습니다. 처음부터 다시 시도해 주세요.');
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

      // 연결코드는 RPC가 발급해 응답에 담아준다(sql/40_auth_signup.sql [7] link_code).
      // 이걸 넘기지 않으면 C-2가 화면용 코드를 따로 만들어 보여주게 되는데, 그 코드는
      // DB에 없어서 학부모가 입력해도 link_code_not_found가 난다.
      if (profileResult.link_code) {
        setLinkCode(profileResult.link_code);
      }

      // C-2(StudentComplete) 진입 가드용 완료 플래그 — RPC 성공 직후에만 true로 설정한다.
      setSignupCompleted(true);

      // ⚠️ 가입 완료 후 signOut 하지 않는다 (2026-08-06 정책 확정)
      //   예전에는 AS-IS를 따라 여기서 세션을 파기했다. 그런데 다음 화면(C-2)의
      //   "무료 진단 시작하기" CTA가 바로 진단으로 들어가는 시안이라, 로그아웃된
      //   상태로 넘어가면 사용자가 방금 만든 계정으로 다시 로그인해야 했다.
      //   ParentForm도 같은 이유로 세션을 유지한다(그쪽은 자녀 연결 조회가 로그인을
      //   요구해서 더 강하게 필요하다).
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
          actionLabel={
            phoneCooldown.active ? `${phoneCooldown.remaining}초 후 다시 보내기` : '인증번호 보내기'
          }
          onAction={requestPhoneCode}
          actionDisabled={phoneSending || phoneCooldown.active || verification.phone.verified}
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
          onChange={(value) => updateFormData({ phoneCode: value.replace(/\D/g, '').slice(0, 6) })}
          placeholder="카카오톡으로 보낸 인증번호를 입력 해주세요"
          actionLabel={
            phoneCooldown.active
              ? `${phoneCooldown.remaining}초 후 다시 보내기`
              : '인증번호 다시 보내기'
          }
          onAction={requestPhoneCode}
          actionDisabled={
            !verification.phone.requested ||
            phoneSending ||
            phoneCooldown.active ||
            verification.phone.verified
          }
          helperText={phoneMessage.text}
          status={verification.phone.verified ? 'success' : phoneMessage.status}
          disabled={!verification.phone.requested || verification.phone.verified}
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
            emailCooldown.active
              ? `${emailCooldown.remaining}초 후 재발송`
              : verification.email.requested
                ? '인증번호 다시 보내기'
                : '인증번호 보내기'
          }
          onAction={requestEmailCode}
          actionDisabled={emailSending || emailCooldown.active || verification.email.verified}
          // 발송 이후의 안내·에러는 인증코드 필드 쪽에서 보여준다. 두 필드가 같은
          // 문구를 동시에 띄우면 어느 쪽 이야기인지 알기 어렵다. status도 함께
          // 내려야 한다 — 문구 없이 status만 error면 이 입력만 이유 없이 흔들린다.
          helperText={verification.email.requested ? undefined : emailMessage.text}
          status={verification.email.requested ? 'default' : emailMessage.status}
          autoComplete="email"
          required
        />

        {/* 6자리가 채워지면 자동 검증한다 — 휴대폰 인증번호 필드와 동일하게 "확인"
            버튼이 없다. 검증 결과는 아래 helperText로 나온다. */}
        <TextField
          label="이메일 인증코드"
          id="student-email-code"
          name="emailCode"
          size="lg"
          value={formData.emailCode}
          onChange={(value) => updateFormData({ emailCode: value.replace(/\D/g, '').slice(0, 6) })}
          placeholder="이메일 인증코드 6자리를 입력해주세요"
          helperText={emailMessage.text}
          status={verification.email.verified ? 'success' : emailMessage.status}
          disabled={!verification.email.requested || verification.email.verified}
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
