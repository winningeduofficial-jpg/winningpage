// 다단계 회원가입 플로우 상태 컨텍스트 — docs/login-signup-renewal-spec.md §5.3.
// 라우트 분할(유형 선택 → 생년월일 → 분기 폼 → 완료 → 학부모 온보딩) 간 데이터(memberType/
// birthDate/isUnder14/폼데이터/인증플래그)를 유지하기 위해 sessionStorage('signup-flow')로
// 동기화한다. 새로고침 시 자동 복구되며, hasFlow로 "진행 중이던 가입 흐름이 있었는지"를
// 노출해 각 페이지가 단계 강제 이동(예: memberType 없이 폼 단계 직접 진입 시 /signup으로
// redirect) 정책을 스스로 구현할 수 있게 한다. resetSignup()은 가입 완료·이탈 시 호출한다.
import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'signup-flow';

// 학생(9필드: 이름/전화/전화인증코드/이메일/이메일인증코드/비밀번호/지역/재학구분/학교명)과
// 학부모(6필드: 이름/전화/전화인증코드/이메일/이메일인증코드/비밀번호) + 14세 미만 부가 필드
// (noOwnPhone/guardianPhone/guardianConsent)를 하나의 평평한 폼데이터로 통합 관리한다.
// 화면별로 필요한 키만 골라 쓰면 되고, 안 쓰는 키는 초기값 그대로 남는다.
const INITIAL_FORM_DATA = {
  name: '',
  phone: '',
  phoneCode: '',
  noOwnPhone: false, // D-2: '학생 명의의 핸드폰이 없어요'
  email: '',
  emailCode: '',
  password: '',
  region: '',
  schoolType: '',
  schoolName: '',
  guardianPhone: '', // D-2 학부모 정보 섹션
  guardianConsent: false // D-2: '법정대리인 정보를 학부모 정보로 수집합니다'
};

// 학생 폼(C-1) 6항목 기준 — 학부모 폼(E-1)은 4항목(identityRequired/ads 미사용)만 쓰면 된다.
const INITIAL_AGREEMENTS = {
  service: false, // 필수: 위닝에듀 이용약관
  privacyRequired: false, // 필수: 개인정보 수집 및 이용
  identityRequired: false, // 필수(학생만): 본인 인증을 위한 정보 수집
  privacyOptional: false, // 선택(레거시 호환용 — 시안엔 없으나 기존 스키마 대응)
  marketing: false, // 선택: 마케팅 목적의 개인정보 수집 및 이용
  ads: false // 선택(학생만): 광고성 정보 수신 동의
};

const INITIAL_VERIFICATION = {
  phone: { requested: false, verified: false },
  email: { requested: false, verified: false, checked: false, available: false },
  pass: { verified: false } // 법정대리인 PASS 본인인증(D-1)
};

const INITIAL_STATE = {
  memberType: null, // 'student' | 'parent' | null
  birthDate: '', // 8자리 문자열, 예: '20120101'
  isUnder14: null, // birthDate로부터 계산(null=미입력)
  formData: INITIAL_FORM_DATA,
  agreements: INITIAL_AGREEMENTS,
  verification: INITIAL_VERIFICATION,
  linkCode: null, // 학생 가입 완료 후 발급되는 학부모 연동 코드(C-2)
  signupCompleted: false // 가입 성공(complete_signup_profile RPC 성공) 직후 true — C-2 진입 가드용
};

// 만 나이 계산: 생일이 이미 지났으면 연도 차, 아직 안 지났으면 연도 차 - 1.
// (§3.3 B-2: "연령 확인은 회원가입 시 입력하는 생년월일을 기준으로 하며, 생일이 지나지
// 않은 경우 만 14세 미만으로 처리합니다" — 통상적인 만 나이 계산 규칙 그대로 적용)
function computeIsUnder14(birthDate8) {
  if (!birthDate8 || birthDate8.length !== 8) return null;

  const year = Number(birthDate8.slice(0, 4));
  const month = Number(birthDate8.slice(4, 6));
  const day = Number(birthDate8.slice(6, 8));

  if (!year || !month || !day) return null;

  const birth = new Date(year, month - 1, day);
  if (Number.isNaN(birth.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();

  const hasHadBirthdayThisYear =
    today.getMonth() > birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() >= birth.getDate());

  if (!hasHadBirthdayThisYear) age -= 1;

  return age < 14;
}

function readStoredFlow() {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (error) {
    console.error('signup-flow 세션 저장소 읽기 오류:', error);
    return null;
  }
}

// 민감 필드(비밀번호/인증코드)는 sessionStorage에 평문으로 남기지 않는다 — 새로고침 복구
// 시에는 사용자가 다시 입력해야 하며, 이 필드들은 저장 대상에서 제외한다.
const SENSITIVE_FORM_KEYS = ['password', 'phoneCode', 'emailCode'];

function writeStoredFlow(state) {
  try {
    const sanitizedFormData = { ...state.formData };
    SENSITIVE_FORM_KEYS.forEach((key) => {
      delete sanitizedFormData[key];
    });

    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...state, formData: sanitizedFormData })
    );
  } catch (error) {
    console.error('signup-flow 세션 저장소 쓰기 오류:', error);
  }
}

function clearStoredFlow() {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('signup-flow 세션 저장소 초기화 오류:', error);
  }
}

function buildInitialState(stored) {
  if (!stored) return { ...INITIAL_STATE };

  return {
    ...INITIAL_STATE,
    ...stored,
    formData: { ...INITIAL_FORM_DATA, ...(stored.formData || {}) },
    agreements: { ...INITIAL_AGREEMENTS, ...(stored.agreements || {}) },
    verification: {
      ...INITIAL_VERIFICATION,
      phone: { ...INITIAL_VERIFICATION.phone, ...(stored.verification?.phone || {}) },
      email: { ...INITIAL_VERIFICATION.email, ...(stored.verification?.email || {}) },
      pass: { ...INITIAL_VERIFICATION.pass, ...(stored.verification?.pass || {}) }
    }
  };
}

const SignupContext = createContext(null);

export function SignupProvider({ children }) {
  const [state, setState] = useState(() => buildInitialState(readStoredFlow()));
  // 마운트 시점에 이미 저장돼 있던 흐름이 있었는지(=새로고침/재방문 복구 여부)는 최초 1회만
  // 판정하면 되므로 state와 분리된 lazy useState로 고정한다.
  const [hasFlow] = useState(() => !!readStoredFlow());

  useEffect(() => {
    writeStoredFlow(state);
  }, [state]);

  function setMemberType(memberType) {
    setState((prev) => ({ ...prev, memberType }));
  }

  function setBirthDate(birthDate) {
    setState((prev) => ({ ...prev, birthDate, isUnder14: computeIsUnder14(birthDate) }));
  }

  function updateFormData(partial) {
    setState((prev) => ({ ...prev, formData: { ...prev.formData, ...partial } }));
  }

  function updateAgreements(partial) {
    setState((prev) => ({ ...prev, agreements: { ...prev.agreements, ...partial } }));
  }

  // keys를 지정하면 그 키만 일괄 토글(예: 학생 6항목 vs 학부모 4항목 '모두 동의' 분리).
  function setAllAgreements(value, keys) {
    setState((prev) => {
      const targetKeys = keys || Object.keys(prev.agreements);
      const nextAgreements = { ...prev.agreements };
      targetKeys.forEach((key) => {
        nextAgreements[key] = value;
      });
      return { ...prev, agreements: nextAgreements };
    });
  }

  // section: 'phone' | 'email' | 'pass'
  function updateVerification(section, partial) {
    setState((prev) => ({
      ...prev,
      verification: {
        ...prev.verification,
        [section]: { ...prev.verification[section], ...partial }
      }
    }));
  }

  function setLinkCode(linkCode) {
    setState((prev) => ({ ...prev, linkCode }));
  }

  function setSignupCompleted(signupCompleted) {
    setState((prev) => ({ ...prev, signupCompleted }));
  }

  function resetSignup() {
    clearStoredFlow();
    setState({ ...INITIAL_STATE });
  }

  const value = useMemo(
    () => ({
      ...state,
      hasFlow,
      setMemberType,
      setBirthDate,
      updateFormData,
      updateAgreements,
      setAllAgreements,
      updateVerification,
      setLinkCode,
      setSignupCompleted,
      resetSignup
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, hasFlow]
  );

  return <SignupContext.Provider value={value}>{children}</SignupContext.Provider>;
}

export function useSignup() {
  const ctx = useContext(SignupContext);

  if (!ctx) {
    throw new Error('useSignup은 SignupProvider 내부에서만 사용할 수 있습니다.');
  }

  return ctx;
}
