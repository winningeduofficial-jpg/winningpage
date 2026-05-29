import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  GraduationCap,
  LockKeyhole,
  Mail,
  MapPin,
  Phone,
  School,
  Sparkles,
  UserRound,
  UsersRound,
  X
} from 'lucide-react';
import { supabase } from '../lib/supabase';

const TERMS_CONTENT = {
  service: {
    title: '위닝에듀 이용약관',
    content: `
제1조 목적
본 약관은 위닝에듀가 제공하는 학습 관리, 학습 리포트, 입시 전략 분석 및 관련 서비스의 이용 조건과 절차, 회원과 회사의 권리·의무 및 책임 사항을 규정함을 목적으로 합니다.

제2조 서비스의 내용
위닝에듀는 회원에게 학습 기록 관리, 주간 리포트 제공, 목표 대학 및 학과 기반 학습 전략 안내, 상담 및 공지 서비스를 제공할 수 있습니다.

제3조 회원가입
회원은 회사가 정한 가입 양식에 따라 정보를 기입하고 본 약관에 동의함으로써 회원가입을 신청합니다.

제4조 회원의 의무
회원은 가입 시 정확한 정보를 제공해야 하며, 타인의 정보를 도용하거나 서비스 운영을 방해하는 행위를 해서는 안 됩니다.
`
  },
  privacyRequired: {
    title: '개인정보 수집 및 이용 필수 동의',
    content: `
1. 수집 항목
- 이름, 아이디, 이메일 주소, 휴대전화번호, 지역, 재학 구분, 학교명, 회원 유형

2. 이용 목적
- 회원 식별 및 본인 확인
- 학습 관리 서비스 제공
- 리포트 및 상담 서비스 제공
- 공지사항 전달
- 부정 이용 방지

3. 보유 기간
- 회원 탈퇴 시까지
`
  },
  privacyOptional: {
    title: '개인정보 수집 및 이용 선택 동의',
    content: `
1. 수집 항목
- 추가 상담 정보, 희망 대학 및 학과 정보, 학습 성향 정보

2. 이용 목적
- 맞춤형 학습 관리 안내
- 상담 품질 개선
- 개인화 서비스 제공
`
  },
  marketing: {
    title: '마케팅 목적 개인정보 수집 및 이용 선택 동의',
    content: `
1. 수집 항목
- 이름, 연락처, 이메일, 서비스 이용 기록

2. 이용 목적
- 신규 서비스 안내
- 이벤트 및 혜택 안내
- 교육 프로그램 안내
`
  },
  ads: {
    title: '광고성 정보 수신 선택 동의',
    content: `
1. 수신 방법
- 문자, 전화, 이메일, 카카오 알림 등

2. 수신 내용
- 위닝에듀 교육 프로그램 안내
- 학습 관리 서비스 안내
- 이벤트 및 혜택 안내
`
  }
};

const SCHOOL_TYPES = ['초등학교', '중학교', '고등학교', 'N수생', '기타'];

const REGION_OPTIONS = [
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

export default function Signup() {
  const navigate = useNavigate();

  const [step, setStep] = useState(0);
  const [memberType, setMemberType] = useState('');
  const [checkingSession, setCheckingSession] = useState(true);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const [isTermsOpen, setIsTermsOpen] = useState(true);
  const [modalKey, setModalKey] = useState(null);

  const [agreements, setAgreements] = useState({
    service: false,
    privacyRequired: false,
    privacyOptional: false,
    marketing: false,
    ads: false
  });

  const [form, setForm] = useState({
    name: '',
    username: '',
    password: '',
    passwordConfirm: '',
    phone: '',
    email: '',
    emailCode: '',
    region: '',
    schoolType: '',
    schoolName: ''
  });

  const [usernameCheck, setUsernameCheck] = useState({
    checked: false,
    available: false,
    message: ''
  });

  const [emailVerification, setEmailVerification] = useState({
    requested: false,
    verified: false,
    message: ''
  });

  const allRequiredAgreed = agreements.service && agreements.privacyRequired;
  const allAgreed = Object.values(agreements).every(Boolean);
  const modalData = modalKey ? TERMS_CONTENT[modalKey] : null;

  const progressWidth = useMemo(() => {
    if (step === 0) return '0%';
    if (step === 1) return '33.333%';
    if (step === 2) return '66.666%';
    return '100%';
  }, [step]);

  useEffect(() => {
    let alive = true;

    async function checkSession() {
      const { data: sessionData } = await supabase.auth.getSession();
      const sessionUser = sessionData.session?.user;

      if (!alive) return;

      if (!sessionUser) {
        setCheckingSession(false);
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('username, member_type')
        .eq('id', sessionUser.id)
        .maybeSingle();

      if (!alive) return;

      if (profile?.username && profile?.member_type) {
        navigate('/', { replace: true });
        return;
      }

      setForm((prev) => ({
        ...prev,
        email: sessionUser.email || prev.email
      }));

      setEmailVerification({
        requested: true,
        verified: true,
        message: '이메일 인증이 완료된 상태입니다.'
      });

      setCheckingSession(false);
    }

    checkSession();

    return () => {
      alive = false;
    };
  }, [navigate]);

  function updateForm(key, value) {
    setForm((prev) => ({
      ...prev,
      [key]: value
    }));

    if (key === 'username') {
      setUsernameCheck({
        checked: false,
        available: false,
        message: ''
      });
    }

    if (key === 'email') {
      setEmailVerification({
        requested: false,
        verified: false,
        message: ''
      });
    }
  }

  function selectMemberType(type) {
    setMemberType(type);
    setMessage('');
    setStep(1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function toggleAgreement(key) {
    setAgreements((prev) => ({
      ...prev,
      [key]: !prev[key]
    }));
  }

  function toggleAllAgreements() {
    const nextValue = !allAgreed;

    setAgreements({
      service: nextValue,
      privacyRequired: nextValue,
      privacyOptional: nextValue,
      marketing: nextValue,
      ads: nextValue
    });
  }

  function goNextFromTerms() {
    setMessage('');

    if (!allRequiredAgreed) {
      setMessage('필수 약관에 동의해야 회원가입을 진행할 수 있습니다.');
      return;
    }

    setStep(2);
    window.scrollTo({ top: 0, behavior: 'smooth' });
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

  function isValidUsername(value) {
    return /^[a-zA-Z0-9_]{4,20}$/.test(value);
  }

  function isValidPhone(value) {
    return /^01[0-9]-?[0-9]{3,4}-?[0-9]{4}$/.test(value);
  }

  async function checkUsernameDuplicate() {
  const username = form.username.trim();
  const usernameKey = username.toLowerCase();

  setMessage('');

  if (!isValidUsername(username)) {
    setUsernameCheck({
      checked: false,
      available: false,
      message: '아이디는 영문, 숫자, 밑줄 조합 4~20자로 입력해 주세요.'
    });
    return;
  }

  const { data, error } = await supabase
    .from('signup_duplicate_check')
    .select('username_key')
    .eq('username_key', usernameKey)
    .limit(1);

  if (error) {
    console.error('아이디 중복확인 오류:', error);

    setUsernameCheck({
      checked: false,
      available: false,
      message: `아이디 중복 확인 중 오류가 발생했습니다: ${error.message}`
    });
    return;
  }

  if (data && data.length > 0) {
    setUsernameCheck({
      checked: true,
      available: false,
      message: '이미 사용 중인 아이디입니다.'
    });
    return;
  }

  setUsernameCheck({
    checked: true,
    available: true,
    message: '사용 가능한 아이디입니다.'
  });
}
  }

  async function requestEmailVerification() {
    const normalizedEmail = form.email.trim().toLowerCase();

    setMessage('');

    if (!normalizedEmail) {
      setEmailVerification({
        requested: false,
        verified: false,
        message: '이메일을 먼저 입력해 주세요.'
      });
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      setEmailVerification({
        requested: false,
        verified: false,
        message: '이메일 형식이 올바르지 않습니다.'
      });
      return;
    }

    const { data: existingEmailRows, error: emailCheckError } = await supabase
  .from('signup_duplicate_check')
  .select('email_key')
  .eq('email_key', normalizedEmail)
  .limit(1);

if (emailCheckError) {
  console.error('이메일 중복확인 오류:', emailCheckError);

  setEmailVerification({
    requested: false,
    verified: false,
    message: `이메일 확인 중 오류가 발생했습니다: ${emailCheckError.message}`
  });
  return;
}

if (existingEmailRows && existingEmailRows.length > 0) {
  setEmailVerification({
    requested: false,
    verified: false,
    message: '이미 가입된 이메일입니다.'
  });
  return;
}

    const { data: sessionData } = await supabase.auth.getSession();
    const currentEmail = sessionData.session?.user?.email?.toLowerCase();

    if (currentEmail && currentEmail !== normalizedEmail) {
      await supabase.auth.signOut();
    }

    const { error } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: {
        shouldCreateUser: true
      }
    });

    if (error) {
      setEmailVerification({
        requested: false,
        verified: false,
        message: getFriendlyError(error.message)
      });
      return;
    }

    setEmailVerification({
      requested: true,
      verified: false,
      message: '입력한 이메일로 인증코드를 발송했습니다.'
    });
  }

  async function verifyEmailCode() {
    const normalizedEmail = form.email.trim().toLowerCase();
    const token = form.emailCode.trim();

    if (!emailVerification.requested) {
      setEmailVerification((prev) => ({
        ...prev,
        message: '먼저 인증 메일을 발송해 주세요.'
      }));
      return;
    }

    if (!token) {
      setEmailVerification((prev) => ({
        ...prev,
        message: '인증코드를 입력해 주세요.'
      }));
      return;
    }

    const { error } = await supabase.auth.verifyOtp({
      email: normalizedEmail,
      token,
      type: 'email'
    });

    if (error) {
      setEmailVerification({
        requested: true,
        verified: false,
        message: '인증코드가 올바르지 않거나 만료되었습니다.'
      });
      return;
    }

    setEmailVerification({
      requested: true,
      verified: true,
      message: '이메일 인증이 완료되었습니다.'
    });
  }

  function validateStepTwo() {
    const normalizedName = form.name.trim();
    const normalizedUsername = form.username.trim();
    const normalizedPhone = form.phone.trim();
    const normalizedEmail = form.email.trim().toLowerCase();

    if (!memberType) return '회원 유형을 선택해 주세요.';
    if (!normalizedName) return '이름을 입력해 주세요.';

    if (!isValidUsername(normalizedUsername)) {
      return '아이디는 영문, 숫자, 밑줄 조합 4~20자로 입력해 주세요.';
    }

    if (!usernameCheck.checked || !usernameCheck.available) {
      return '아이디 중복확인을 완료해 주세요.';
    }

    if (form.password.length < 6) {
      return '비밀번호는 최소 6자 이상으로 입력해 주세요.';
    }

    if (form.password !== form.passwordConfirm) {
      return '비밀번호와 비밀번호 확인이 일치하지 않습니다.';
    }

    if (!isValidPhone(normalizedPhone)) {
      return '휴대전화번호를 올바르게 입력해 주세요.';
    }

    if (!normalizedEmail) {
      return '이메일을 입력해 주세요.';
    }

    if (!emailVerification.verified) {
      return '이메일 인증을 완료해 주세요.';
    }

    if (!form.region) {
      return '지역을 선택해 주세요.';
    }

    if (!form.schoolType) {
      return '재학 구분을 선택해 주세요.';
    }

    if (form.schoolType !== 'N수생' && !form.schoolName.trim()) {
      return '재학 중인 학교명을 입력해 주세요.';
    }

    return '';
  }

  async function handleSubmit(e) {
    e.preventDefault();

    setMessage('');

    const validationMessage = validateStepTwo();
    if (validationMessage) {
      setMessage(validationMessage);
      return;
    }

    setLoading(true);

    const normalizedName = form.name.trim();
    const normalizedUsername = form.username.trim();
    const normalizedEmail = form.email.trim().toLowerCase();
    const normalizedPhone = form.phone.replaceAll('-', '').trim();
    const normalizedSchoolName =
      form.schoolType === 'N수생' ? '' : form.schoolName.trim();

    const { data: userData } = await supabase.auth.getUser();
    const currentUser = userData.user;

    if (!currentUser) {
      setMessage('이메일 인증 세션을 찾을 수 없습니다. 다시 인증해 주세요.');
      setLoading(false);
      return;
    }

    if ((currentUser.email || '').toLowerCase() !== normalizedEmail) {
      setMessage('인증한 이메일과 입력한 이메일이 다릅니다. 다시 인증해 주세요.');
      setLoading(false);
      return;
    }

    const { error: updateUserError } = await supabase.auth.updateUser({
      password: form.password,
      data: {
        name: normalizedName,
        username: normalizedUsername,
        phone: normalizedPhone,
        email: normalizedEmail,
        region: form.region,
        school_type: form.schoolType,
        school_name: normalizedSchoolName,
        member_type: memberType,
        role: 'user'
      }
    });

    if (updateUserError) {
      setMessage(getFriendlyError(updateUserError.message));
      setLoading(false);
      return;
    }

    const { error: profileError } = await supabase.from('profiles').upsert(
      {
        id: currentUser.id,
        name: normalizedName,
        username: normalizedUsername,
        phone: normalizedPhone,
        email: normalizedEmail,
        region: form.region,
        school_type: form.schoolType,
        school_name: normalizedSchoolName,
        member_type: memberType,
        role: 'user',
        terms_service_agreed: agreements.service,
        privacy_required_agreed: agreements.privacyRequired,
        privacy_optional_agreed: agreements.privacyOptional,
        marketing_agreed: agreements.marketing,
        ads_agreed: agreements.ads
      },
      {
        onConflict: 'id'
      }
    );

    if (profileError) {
      setMessage(`프로필 저장 중 문제가 발생했습니다: ${profileError.message}`);
      setLoading(false);
      return;
    }

    setLoading(false);
    setStep(3);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  if (checkingSession) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#F7F4EF] pt-[84px] text-[#0D1B2A]">
        <div className="rounded-2xl border border-[#0D1B2A]/10 bg-white px-6 py-4 text-sm font-extrabold shadow-[0_18px_45px_rgba(13,27,42,0.10)]">
          로그인 상태 확인 중...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#F7F4EF] pt-[84px] text-[#0D1B2A]">
      <section className="relative overflow-hidden border-b border-[#0D1B2A]/10 bg-[linear-gradient(120deg,#081321_0%,#0D1B2A_44%,#142B45_100%)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_22%,rgba(184,135,55,0.25),transparent_30%),radial-gradient(circle_at_18%_76%,rgba(47,111,237,0.15),transparent_32%)]" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/35 to-transparent" />

        <div className="relative mx-auto max-w-[1180px] px-6 py-14 lg:px-8">
          <div className="mx-auto max-w-3xl text-center text-white">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#D7B56D]/45 bg-[#D7B56D]/10 px-4 py-2 text-sm font-black text-[#E5C677] shadow-[0_12px_34px_rgba(0,0,0,0.18)]">
              <Sparkles size={16} fill="currentColor" />
              위닝에듀 학습 관리 시작
            </div>

            <h1 className="mt-6 text-[38px] font-black leading-[1.16] tracking-[-0.04em] md:text-[54px]">
              회원가입 후,
              <br />
              <span className="text-[#D7B56D]">맞춤 학습 관리</span>를 시작하세요
            </h1>

            <p className="mt-5 text-base font-bold leading-7 text-white/76 md:text-lg">
              학습 기록, 주간 리포트, 목표 대학 전략까지 하나의 계정으로 관리합니다.
            </p>
          </div>

          <div className="mx-auto mt-10 max-w-[980px] rounded-[34px] border border-white/80 bg-[linear-gradient(180deg,#FFFFFF_0%,#FBFAF7_100%)] p-6 shadow-[0_28px_80px_rgba(13,27,42,0.30)] md:p-9">
            {step > 0 && (
              <div className="relative mb-10">
                <div className="absolute left-0 right-0 top-[26px] h-[3px] rounded-full bg-[#E5E7EB]" />
                <div
                  className="absolute left-0 top-[26px] h-[3px] rounded-full bg-[#B88737] transition-all duration-300"
                  style={{ width: progressWidth }}
                />

                <div className="relative grid grid-cols-3">
                  <StepBadge number="01" title="약관 동의" active={step >= 1} current={step === 1} />
                  <StepBadge number="02" title="정보 입력" active={step >= 2} current={step === 2} />
                  <StepBadge number="03" title="가입 완료" active={step >= 3} current={step === 3} />
                </div>
              </div>
            )}

            {message && (
              <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold leading-6 text-red-700">
                {message}
              </div>
            )}

            {step === 0 && (
              <section>
                <div className="mb-8 text-center">
                  <p className="text-sm font-black text-[#B88737]">
                    SELECT MEMBER TYPE
                  </p>

                  <h2 className="mt-2 text-3xl font-black tracking-[-0.04em] md:text-4xl">
                    회원 유형을 선택해 주세요
                  </h2>

                  <p className="mt-3 text-sm font-bold leading-6 text-[#64748B]">
                    서비스 이용 목적에 맞는 유형을 선택하면 가입 절차가 이어집니다.
                  </p>
                </div>

                <div className="grid gap-5 md:grid-cols-2">
                  <MemberTypeCard
                    icon={<GraduationCap size={72} />}
                    caption="대학 합격을 위해 준비하는 수험생이라면"
                    title="학생회원"
                    buttonText="회원가입"
                    onClick={() => selectMemberType('student')}
                  />

                  <MemberTypeCard
                    icon={<UsersRound size={72} />}
                    caption="학생 회원의 자녀가 있다면"
                    title="학부모회원"
                    buttonText="회원가입"
                    onClick={() => selectMemberType('parent')}
                  />
                </div>

                <p className="mt-6 text-center text-sm font-bold text-[#64748B]">
                  이미 계정이 있나요?{' '}
                  <Link
                    to="/login"
                    className="font-black text-[#B88737] hover:text-[#8F6421]"
                  >
                    로그인
                  </Link>
                </p>
              </section>
            )}

            {step === 1 && (
              <section>
                <div className="mb-7">
                  <p className="text-sm font-black text-[#B88737]">
                    STEP 01 · {memberType === 'student' ? '학생회원' : '학부모회원'}
                  </p>

                  <h2 className="mt-2 text-3xl font-black tracking-[-0.04em]">
                    통합회원 약관 동의
                  </h2>

                  <p className="mt-2 text-sm font-bold leading-6 text-[#64748B]">
                    필수 약관에 동의해야 회원가입을 진행할 수 있습니다.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={toggleAllAgreements}
                  className="flex w-full items-start gap-4 rounded-3xl border border-[#0D1B2A]/10 bg-[#F8F7F3] p-5 text-left transition hover:border-[#B88737]/50"
                >
                  <CheckBox checked={allAgreed} large />

                  <div>
                    <p className="text-lg font-black text-[#0D1B2A]">
                      모두 확인하였으며 동의합니다.
                    </p>

                    <p className="mt-1 text-sm font-bold leading-6 text-[#64748B]">
                      이용약관, 개인정보 처리 및 이용 안내, 마케팅 및 광고성 정보 수신 동의 항목을 한 번에 선택합니다.
                    </p>
                  </div>
                </button>

                <div className="mt-7 overflow-hidden rounded-3xl border border-[#0D1B2A]/10 bg-white">
                  <button
                    type="button"
                    onClick={() => setIsTermsOpen((prev) => !prev)}
                    className="flex w-full items-center justify-between border-b border-[#0D1B2A]/8 px-5 py-4 text-left"
                  >
                    <div className="flex items-center gap-4">
                      <CheckBox checked={agreements.service} />

                      <p className="text-base font-black">
                        이용 약관 전체 동의 <span className="text-[#2563EB]">(필수)</span>
                      </p>
                    </div>

                    {isTermsOpen ? <ChevronUp size={22} /> : <ChevronDown size={22} />}
                  </button>

                  {isTermsOpen && (
                    <div>
                      <AgreementRow
                        checked={agreements.service}
                        label="위닝에듀 이용약관"
                        required
                        onToggle={() => toggleAgreement('service')}
                        onView={() => setModalKey('service')}
                      />

                      <AgreementRow
                        checked={agreements.privacyRequired}
                        label="개인정보 수집 및 이용"
                        required
                        onToggle={() => toggleAgreement('privacyRequired')}
                        onView={() => setModalKey('privacyRequired')}
                      />

                      <AgreementRow
                        checked={agreements.privacyOptional}
                        label="개인정보 수집 및 이용"
                        onToggle={() => toggleAgreement('privacyOptional')}
                        onView={() => setModalKey('privacyOptional')}
                      />

                      <AgreementRow
                        checked={agreements.marketing}
                        label="마케팅 목적의 개인정보 수집 및 이용"
                        onToggle={() => toggleAgreement('marketing')}
                        onView={() => setModalKey('marketing')}
                      />

                      <AgreementRow
                        checked={agreements.ads}
                        label="광고성 정보 수신 동의"
                        onToggle={() => toggleAgreement('ads')}
                        onView={() => setModalKey('ads')}
                      />
                    </div>
                  )}
                </div>

                <p className="mt-5 text-sm font-bold leading-6 text-[#8B95A1]">
                  선택 항목에 동의하지 않아도 회원가입은 가능하나, 맞춤형 서비스 안내나 이벤트 혜택 제공이 제한될 수 있습니다.
                </p>

                <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
                  <button
                    type="button"
                    onClick={() => {
                      setMessage('');
                      setStep(0);
                    }}
                    className="group flex h-14 items-center justify-center gap-2 rounded-2xl border border-[#0D1B2A]/20 bg-white px-8 text-[15px] font-black text-[#0D1B2A] transition hover:bg-[#F8F7F3]"
                  >
                    <ArrowLeft size={18} className="transition group-hover:-translate-x-1" />
                    유형 다시 선택
                  </button>

                  <button
                    type="button"
                    onClick={goNextFromTerms}
                    className="group flex h-14 items-center justify-center gap-2 rounded-2xl bg-[#0D1B2A] px-8 text-[15px] font-black text-white shadow-[0_18px_34px_rgba(13,27,42,0.24)] transition hover:bg-[#162A40]"
                  >
                    다음 단계
                    <ArrowRight size={18} className="transition group-hover:translate-x-1" />
                  </button>
                </div>
              </section>
            )}

            {step === 2 && (
              <section>
                <div className="mb-7">
                  <p className="text-sm font-black text-[#B88737]">
                    STEP 02 · {memberType === 'student' ? '학생회원' : '학부모회원'}
                  </p>

                  <h2 className="mt-2 text-3xl font-black tracking-[-0.04em]">
                    정보 입력 및 이메일 인증
                  </h2>

                  <p className="mt-2 text-sm font-bold leading-6 text-[#64748B]">
                    서비스 이용을 위한 기본 정보를 입력해 주세요.
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">
                  <div className="grid gap-5 md:grid-cols-2">
                    <InputField
                      label={memberType === 'parent' ? '학부모 이름' : '학생 이름'}
                      icon={<UserRound size={19} />}
                      value={form.name}
                      onChange={(value) => updateForm('name', value)}
                      placeholder="홍길동"
                      autoComplete="name"
                    />

                    <div>
                      <label className="mb-2 block text-sm font-black text-[#0D1B2A]">
                        아이디
                      </label>

                      <div className="flex gap-2">
                        <div className="flex h-14 flex-1 items-center gap-3 rounded-2xl border border-[#0D1B2A]/12 bg-[#F8F7F3] px-4 transition focus-within:border-[#B88737] focus-within:bg-white focus-within:shadow-[0_0_0_4px_rgba(184,135,55,0.12)]">
                          <UserRound size={19} className="text-[#8B95A1]" />

                          <input
                            type="text"
                            placeholder="영문/숫자 4~20자"
                            className="h-full w-full bg-transparent text-[15px] font-bold text-[#0D1B2A] outline-none placeholder:text-[#9AA3AF]"
                            value={form.username}
                            onChange={(e) => updateForm('username', e.target.value)}
                            autoComplete="username"
                          />
                        </div>

                        <button
                          type="button"
                          onClick={checkUsernameDuplicate}
                          className="h-14 rounded-2xl border border-[#0D1B2A] bg-white px-4 text-sm font-black text-[#0D1B2A] transition hover:bg-[#F8F7F3]"
                        >
                          중복확인
                        </button>
                      </div>

                      {usernameCheck.message && (
                        <p
                          className={`mt-2 text-sm font-bold ${
                            usernameCheck.available ? 'text-[#15803D]' : 'text-red-600'
                          }`}
                        >
                          {usernameCheck.message}
                        </p>
                      )}
                    </div>

                    <InputField
                      label="비밀번호"
                      icon={<LockKeyhole size={19} />}
                      type="password"
                      value={form.password}
                      onChange={(value) => updateForm('password', value)}
                      placeholder="6자 이상 입력"
                      autoComplete="new-password"
                    />

                    <InputField
                      label="비밀번호 다시 입력"
                      icon={<LockKeyhole size={19} />}
                      type="password"
                      value={form.passwordConfirm}
                      onChange={(value) => updateForm('passwordConfirm', value)}
                      placeholder="비밀번호 재입력"
                      autoComplete="new-password"
                    />

                    <InputField
                      label="휴대전화번호"
                      icon={<Phone size={19} />}
                      type="tel"
                      value={form.phone}
                      onChange={(value) => updateForm('phone', value)}
                      placeholder="010-0000-0000"
                      autoComplete="tel"
                    />

                    <div>
                      <label className="mb-2 block text-sm font-black text-[#0D1B2A]">
                        이메일
                      </label>

                      <div className="flex gap-2">
                        <div className="flex h-14 flex-1 items-center gap-3 rounded-2xl border border-[#0D1B2A]/12 bg-[#F8F7F3] px-4 transition focus-within:border-[#B88737] focus-within:bg-white focus-within:shadow-[0_0_0_4px_rgba(184,135,55,0.12)]">
                          <Mail size={19} className="text-[#8B95A1]" />

                          <input
                            type="email"
                            placeholder="winningedu@example.com"
                            className="h-full w-full bg-transparent text-[15px] font-bold text-[#0D1B2A] outline-none placeholder:text-[#9AA3AF]"
                            value={form.email}
                            onChange={(e) => updateForm('email', e.target.value)}
                            autoComplete="email"
                          />
                        </div>

                        <button
                          type="button"
                          onClick={requestEmailVerification}
                          className="h-14 rounded-2xl border border-[#0D1B2A] bg-white px-4 text-sm font-black text-[#0D1B2A] transition hover:bg-[#F8F7F3]"
                        >
                          인증요청
                        </button>
                      </div>

                      {emailVerification.message && (
                        <p
                          className={`mt-2 text-sm font-bold ${
                            emailVerification.verified ? 'text-[#15803D]' : 'text-[#B88737]'
                          }`}
                        >
                          {emailVerification.message}
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-black text-[#0D1B2A]">
                        이메일 인증코드
                      </label>

                      <div className="flex gap-2">
                        <div className="flex h-14 flex-1 items-center gap-3 rounded-2xl border border-[#0D1B2A]/12 bg-[#F8F7F3] px-4 transition focus-within:border-[#B88737] focus-within:bg-white focus-within:shadow-[0_0_0_4px_rgba(184,135,55,0.12)]">
                          <Mail size={19} className="text-[#8B95A1]" />

                          <input
                            type="text"
                            placeholder="메일로 받은 인증코드 입력"
                            className="h-full w-full bg-transparent text-[15px] font-bold text-[#0D1B2A] outline-none placeholder:text-[#9AA3AF]"
                            value={form.emailCode}
                            onChange={(e) => updateForm('emailCode', e.target.value)}
                          />
                        </div>

                        <button
                          type="button"
                          onClick={verifyEmailCode}
                          className="h-14 rounded-2xl bg-[#0D1B2A] px-4 text-sm font-black text-white transition hover:bg-[#162A40]"
                        >
                          확인
                        </button>
                      </div>
                    </div>

                    <SelectField
                      label="지역"
                      icon={<MapPin size={19} />}
                      value={form.region}
                      onChange={(value) => updateForm('region', value)}
                      placeholder="지역 선택"
                      options={REGION_OPTIONS}
                    />

                    <SelectField
                      label="재학 구분"
                      icon={<School size={19} />}
                      value={form.schoolType}
                      onChange={(value) => updateForm('schoolType', value)}
                      placeholder="재학 구분 선택"
                      options={SCHOOL_TYPES}
                    />

                    <InputField
                      label={memberType === 'parent' ? '자녀 재학 학교' : '재학 중인 학교'}
                      icon={<School size={19} />}
                      value={form.schoolName}
                      onChange={(value) => updateForm('schoolName', value)}
                      placeholder={
                        form.schoolType === 'N수생'
                          ? 'N수생은 입력하지 않아도 됩니다'
                          : '학교명 입력'
                      }
                      disabled={form.schoolType === 'N수생'}
                    />
                  </div>

                  <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
                    <button
                      type="button"
                      onClick={() => {
                        setMessage('');
                        setStep(1);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className="group flex h-14 items-center justify-center gap-2 rounded-2xl border border-[#0D1B2A]/20 bg-white px-8 text-[15px] font-black text-[#0D1B2A] transition hover:bg-[#F8F7F3]"
                    >
                      <ArrowLeft size={18} className="transition group-hover:-translate-x-1" />
                      이전 단계
                    </button>

                    <button
                      type="submit"
                      disabled={loading}
                      className="group flex h-14 items-center justify-center gap-2 rounded-2xl bg-[#0D1B2A] px-8 text-[15px] font-black text-white shadow-[0_18px_34px_rgba(13,27,42,0.24)] transition hover:bg-[#162A40] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {loading ? '가입 처리 중...' : '가입 완료'}
                      {!loading && (
                        <ArrowRight size={18} className="transition group-hover:translate-x-1" />
                      )}
                    </button>
                  </div>
                </form>
              </section>
            )}

            {step === 3 && (
              <section className="py-10 text-center">
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[#0D1B2A] text-white shadow-[0_18px_36px_rgba(13,27,42,0.25)]">
                  <Check size={38} />
                </div>

                <p className="mt-8 text-sm font-black text-[#B88737]">
                  SIGN UP COMPLETE
                </p>

                <h2 className="mt-2 text-4xl font-black tracking-[-0.04em]">
                  회원가입이 완료되었습니다.
                </h2>

                <p className="mx-auto mt-4 max-w-xl text-sm font-bold leading-7 text-[#64748B]">
                  위닝에듀 학습 관리 서비스를 바로 이용할 수 있습니다.
                </p>

                <div className="mt-9 flex justify-center">
                  <Link
                    to="/"
                    className="group flex h-14 min-w-[220px] items-center justify-center gap-2 rounded-2xl bg-[#0D1B2A] px-8 text-[15px] font-black text-white shadow-[0_18px_34px_rgba(13,27,42,0.24)] transition hover:bg-[#162A40]"
                  >
                    서비스 시작하기
                    <ArrowRight size={18} className="transition group-hover:translate-x-1" />
                  </Link>
                </div>
              </section>
            )}
          </div>
        </div>
      </section>

      {modalData && (
        <TermsModal
          title={modalData.title}
          content={modalData.content}
          onClose={() => setModalKey(null)}
        />
      )}
    </main>
  );
}

function MemberTypeCard({ icon, caption, title, buttonText, onClick }) {
  return (
    <div className="group rounded-[30px] border border-[#0D1B2A]/10 bg-[linear-gradient(180deg,#FFFFFF_0%,#F8F7F3_100%)] px-8 py-12 text-center shadow-[0_12px_34px_rgba(13,27,42,0.06)] transition hover:-translate-y-1 hover:border-[#B88737]/35 hover:shadow-[0_20px_44px_rgba(13,27,42,0.12)]">
      <div className="mx-auto flex h-36 w-36 items-center justify-center rounded-full bg-[#F1F4F8] text-[#95A2B5] transition group-hover:bg-[#EEF2F7] group-hover:text-[#73839A]">
        {icon}
      </div>

      <p className="mt-8 text-lg font-bold text-[#64748B]">
        {caption}
      </p>

      <h3 className="mt-2 text-3xl font-black tracking-[-0.04em] text-[#0D1B2A]">
        {title}
      </h3>

      <button
        type="button"
        onClick={onClick}
        className="mt-10 h-14 w-full rounded-2xl bg-[#0D1B2A] text-lg font-black text-white transition hover:bg-[#162A40]"
      >
        {buttonText}
      </button>
    </div>
  );
}

function StepBadge({ number, title, active, current }) {
  return (
    <div className="flex flex-col items-center">
      <div
        className={`z-10 flex h-14 w-14 items-center justify-center rounded-full border-4 text-sm font-black transition ${
          active
            ? 'border-[#F8F7F3] bg-[#0D1B2A] text-white shadow-[0_14px_28px_rgba(13,27,42,0.22)]'
            : 'border-[#F8F7F3] bg-[#E5E7EB] text-[#94A3B8]'
        }`}
      >
        {current ? number : active ? <Check size={22} /> : number}
      </div>

      <p
        className={`mt-3 text-sm font-black ${
          active ? 'text-[#0D1B2A]' : 'text-[#94A3B8]'
        }`}
      >
        {title}
      </p>
    </div>
  );
}

function CheckBox({ checked, large = false }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-md border transition ${
        large ? 'mt-1 h-7 w-7' : 'h-6 w-6'
      } ${
        checked
          ? 'border-[#0D1B2A] bg-[#0D1B2A] text-white'
          : 'border-[#CBD5E1] bg-white text-transparent'
      }`}
    >
      <Check size={large ? 19 : 16} strokeWidth={3} />
    </span>
  );
}

function AgreementRow({ checked, label, required = false, onToggle, onView }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-[#0D1B2A]/8 px-5 py-4 last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        className="flex flex-1 items-center gap-4 text-left"
      >
        <CheckBox checked={checked} />

        <p className="text-sm font-extrabold text-[#334155] md:text-base">
          {label}{' '}
          <span className={required ? 'text-[#2563EB]' : 'text-[#94A3B8]'}>
            {required ? '(필수)' : '(선택)'}
          </span>
        </p>
      </button>

      <button
        type="button"
        onClick={onView}
        className="text-sm font-black text-[#2563EB] underline underline-offset-4"
      >
        보기
      </button>
    </div>
  );
}

function TermsModal({ title, content, onClose }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 px-4 py-8 backdrop-blur-sm">
      <div className="relative w-full max-w-[760px] rounded-[30px] bg-white p-6 shadow-[0_30px_90px_rgba(0,0,0,0.35)] md:p-8">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-5 top-5 flex h-10 w-10 items-center justify-center rounded-full border border-[#0D1B2A]/10 bg-white text-[#0D1B2A] transition hover:bg-[#F8F7F3]"
          aria-label="닫기"
        >
          <X size={22} />
        </button>

        <p className="text-sm font-black text-[#B88737]">
          TERMS DETAIL
        </p>

        <h3 className="mt-2 pr-12 text-3xl font-black tracking-[-0.04em] text-[#0D1B2A]">
          {title}
        </h3>

        <div className="mt-6 max-h-[520px] overflow-y-auto rounded-2xl border border-[#0D1B2A]/10 bg-[#F8F7F3] p-5 whitespace-pre-line text-[15px] font-bold leading-8 text-[#334155]">
          {content}
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="h-12 rounded-2xl bg-[#0D1B2A] px-7 text-sm font-black text-white transition hover:bg-[#162A40]"
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
}

function InputField({
  label,
  icon,
  type = 'text',
  value,
  onChange,
  placeholder,
  autoComplete,
  disabled = false
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-black text-[#0D1B2A]">
        {label}
      </span>

      <div
        className={`flex h-14 items-center gap-3 rounded-2xl border border-[#0D1B2A]/12 px-4 transition focus-within:border-[#B88737] focus-within:bg-white focus-within:shadow-[0_0_0_4px_rgba(184,135,55,0.12)] ${
          disabled ? 'bg-[#ECEFF3]' : 'bg-[#F8F7F3]'
        }`}
      >
        <span className="text-[#8B95A1]">{icon}</span>

        <input
          type={type}
          placeholder={placeholder}
          className="h-full w-full bg-transparent text-[15px] font-bold text-[#0D1B2A] outline-none placeholder:text-[#9AA3AF] disabled:cursor-not-allowed"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          disabled={disabled}
        />
      </div>
    </label>
  );
}

function SelectField({ label, icon, value, onChange, placeholder, options }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-black text-[#0D1B2A]">
        {label}
      </span>

      <div className="flex h-14 items-center gap-3 rounded-2xl border border-[#0D1B2A]/12 bg-[#F8F7F3] px-4 transition focus-within:border-[#B88737] focus-within:bg-white focus-within:shadow-[0_0_0_4px_rgba(184,135,55,0.12)]">
        <span className="text-[#8B95A1]">{icon}</span>

        <select
          className="h-full w-full bg-transparent text-[15px] font-bold text-[#0D1B2A] outline-none"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">{placeholder}</option>

          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>
    </label>
  );
}
