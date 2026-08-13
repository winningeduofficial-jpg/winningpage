// 다단계 회원가입 플로우 상태 컨텍스트 — docs/login-signup-renewal-spec.md §5.3.
// 라우트 분할(유형 선택 → 생년월일 → 분기 폼 → 완료 → 학부모 온보딩) 간 데이터(memberType/
// birthDate/isUnder14/폼데이터/인증플래그)를 유지하기 위해 sessionStorage('signup-flow')로
// 동기화한다. 새로고침 시 자동 복구되며, hasFlow로 "진행 중이던 가입 흐름이 있었는지"를
// 노출해 각 페이지가 단계 강제 이동(예: memberType 없이 폼 단계 직접 진입 시 /signup으로
// redirect) 정책을 스스로 구현할 수 있게 한다. resetSignup()은 가입 완료·이탈 시 호출한다.
import { createContext, useContext, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "signup-flow";

// 학생(9필드: 이름/전화/전화인증코드/이메일/이메일인증코드/비밀번호/지역/재학구분/학교명)과
// 학부모(6필드: 이름/전화/전화인증코드/이메일/이메일인증코드/비밀번호) + 14세 미만 부가 필드
// (noOwnPhone/guardianPhone/guardianConsent)를 하나의 평평한 폼데이터로 통합 관리한다.
// 화면별로 필요한 키만 골라 쓰면 되고, 안 쓰는 키는 초기값 그대로 남는다.
const INITIAL_FORM_DATA = {
  name: "",
  phone: "",
  phoneCode: "",
  noOwnPhone: false, // D-2: '학생 명의의 핸드폰이 없어요'
  email: "",
  emailCode: "",
  password: "",
  region: "",
  schoolType: "",
  schoolName: "",
  guardianPhone: "", // D-2 학부모 정보 섹션
  guardianConsent: false, // D-2: '법정대리인 정보를 학부모 정보로 수집합니다'
};

// 학생 폼(C-1) 6항목 기준 — 학부모 폼(E-1)은 4항목(identityRequired/ads 미사용)만 쓰면 된다.
const INITIAL_AGREEMENTS = {
  service: false, // 필수: 위닝에듀 이용약관
  privacyRequired: false, // 필수: 개인정보 수집 및 이용
  identityRequired: false, // 필수(학생만): 본인 인증을 위한 정보 수집
  privacyOptional: false, // 선택(레거시 호환용 — 시안엔 없으나 기존 스키마 대응)
  marketing: false, // 선택: 마케팅 목적의 개인정보 수집 및 이용
  ads: false, // 선택(학생만): 광고성 정보 수신 동의
};

const INITIAL_VERIFICATION = {
  phone: { requested: false, verified: false },
  // mode/resumed: 인증코드를 어떤 API로 보냈는지 기억한다. 신규 가입은 signUp
  // (verifyOtp type 'signup'), 중단된 가입 이어가기는 signInWithOtp(type 'email')라
  // 검증 호출이 달라진다. src/lib/signupEmailAuth.js 참고.
  email: {
    requested: false,
    verified: false,
    checked: false,
    available: false,
    mode: null,
    resumed: false,
  },
  pass: { verified: false }, // 법정대리인 PASS 본인인증(D-1)
};

const INITIAL_STATE = {
  memberType: null, // 'student' | 'parent' | null
  birthDate: "", // 8자리 문자열, 예: '20120101'
  isUnder14: null, // birthDate로부터 계산(null=미입력)
  formData: INITIAL_FORM_DATA,
  agreements: INITIAL_AGREEMENTS,
  verification: INITIAL_VERIFICATION,
  linkCode: null, // 학생 가입 완료 후 발급되는 학부모 연동 코드(C-2)
  signupCompleted: false, // 가입 성공(complete_signup_profile RPC 성공) 직후 true — C-2 진입 가드용
  parentSignupCompleted: false, // 학부모 가입 성공 직후 true — signupCompleted와 동일 패턴의 학부모 온보딩 진입 가드용
};

// 만 나이 계산: 생일이 이미 지났으면 연도 차, 아직 안 지났으면 연도 차 - 1.
// (§3.3 B-2: "연령 확인은 회원가입 시 입력하는 생년월일을 기준으로 하며, 생일이 지나지
// 않은 경우 만 14세 미만으로 처리합니다" — 통상적인 만 나이 계산 규칙 그대로 적용)
// 유효하지 않은 입력(파싱 불가/Date 롤오버로 실제 날짜가 바뀐 경우/미래 날짜/1900년 이전
// 비상식적인 연도)은 null을 반환하므로, 호출부는 null을 "계산 불가 → 에러 표시"로 다뤄야
// 한다. StudentBirth 등 다른 화면에서 동일 로직을 중복 구현하지 않도록 export한다.
export function computeIsUnder14(birthDate8) {
  if (!birthDate8 || birthDate8.length !== 8) return null;

  const year = Number(birthDate8.slice(0, 4));
  const month = Number(birthDate8.slice(4, 6));
  const day = Number(birthDate8.slice(6, 8));

  if (!year || !month || !day) return null;
  if (year < 1900) return null; // 비상식적인 연도 거부

  const birth = new Date(year, month - 1, day);
  if (Number.isNaN(birth.getTime())) return null;

  // Date는 month=13, day=32처럼 범위를 벗어난 값을 다음 달/해로 조용히 롤오버시켜
  // 전혀 다른 날짜를 만들어낸다(예: 2024-02-30 → 2024-03-01). 역검증으로 이런
  // 입력을 걸러낸다.
  if (
    birth.getFullYear() !== year ||
    birth.getMonth() !== month - 1 ||
    birth.getDate() !== day
  ) {
    return null;
  }

  const today = new Date();
  if (birth.getTime() > today.getTime()) return null; // 미래 날짜 거부

  let age = today.getFullYear() - birth.getFullYear();

  const hasHadBirthdayThisYear =
    today.getMonth() > birth.getMonth() ||
    (today.getMonth() === birth.getMonth() &&
      today.getDate() >= birth.getDate());

  if (!hasHadBirthdayThisYear) age -= 1;

  return age < 14;
}

function readStoredFlow() {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (error) {
    console.error("signup-flow 세션 저장소 읽기 오류:", error);
    return null;
  }
}

// 민감 필드(비밀번호/인증코드)는 sessionStorage에 평문으로 남기지 않는다 — 새로고침 복구
// 시에는 사용자가 다시 입력해야 하며, 이 필드들은 저장 대상에서 제외한다.
const SENSITIVE_FORM_KEYS = ["password", "phoneCode", "emailCode"];

function writeStoredFlow(state) {
  try {
    const sanitizedFormData = { ...state.formData };
    SENSITIVE_FORM_KEYS.forEach((key) => {
      delete sanitizedFormData[key];
    });

    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...state, formData: sanitizedFormData }),
    );
  } catch (error) {
    console.error("signup-flow 세션 저장소 쓰기 오류:", error);
  }
}

function clearStoredFlow() {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error("signup-flow 세션 저장소 초기화 오류:", error);
  }
}

function buildInitialState(stored) {
  if (!stored) return { ...INITIAL_STATE };

  const formData = { ...INITIAL_FORM_DATA, ...(stored.formData || {}) };
  const verification = {
    ...INITIAL_VERIFICATION,
    phone: {
      ...INITIAL_VERIFICATION.phone,
      ...(stored.verification?.phone || {}),
    },
    email: {
      ...INITIAL_VERIFICATION.email,
      ...(stored.verification?.email || {}),
    },
    pass: {
      ...INITIAL_VERIFICATION.pass,
      ...(stored.verification?.pass || {}),
    },
  };

  // SENSITIVE_FORM_KEYS(password 포함)는 세션 저장소에 절대 남지 않으므로, 복구 직후
  // formData.password는 항상 빈 문자열이다. signUp 시 서버에 등록한 비밀번호와 새로고침
  // 후 사용자가 다시 입력할 비밀번호가 서로 다를 수 있는데, phone/email 인증 완료 플래그만
  // 그대로 복구되면 "인증은 완료됐지만 그 인증이 보장하는 비밀번호는 알 수 없다"는 불일치
  // 상태가 된다. 이를 막기 위해 비밀번호가 비어 있으면 인증 상태를 INITIAL로 리셋해
  // 재-signUp(재인증)을 강제한다.
  if (!formData.password) {
    verification.phone = { ...INITIAL_VERIFICATION.phone };
    verification.email = { ...INITIAL_VERIFICATION.email };
  }

  return {
    ...INITIAL_STATE,
    ...stored,
    formData,
    agreements: { ...INITIAL_AGREEMENTS, ...(stored.agreements || {}) },
    verification,
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
    setState((prev) => ({
      ...prev,
      birthDate,
      isUnder14: computeIsUnder14(birthDate),
    }));
  }

  function updateFormData(partial) {
    setState((prev) => ({
      ...prev,
      formData: { ...prev.formData, ...partial },
    }));
  }

  function updateAgreements(partial) {
    setState((prev) => ({
      ...prev,
      agreements: { ...prev.agreements, ...partial },
    }));
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
        [section]: { ...prev.verification[section], ...partial },
      },
    }));
  }

  function setLinkCode(linkCode) {
    setState((prev) => ({ ...prev, linkCode }));
  }

  function setSignupCompleted(signupCompleted) {
    setState((prev) => ({ ...prev, signupCompleted }));
  }

  // signupCompleted(학생)와 동일 패턴 — 학부모 가입 성공 직후 true, sessionStorage로 영속.
  function setParentSignupCompleted(parentSignupCompleted) {
    setState((prev) => ({ ...prev, parentSignupCompleted }));
  }

  // 유형 선택(학생/학부모)을 되돌아가 다시 고를 때, 이전 유형에서 입력하던 폼데이터/동의/
  // 인증/완료 플래그가 새 유형 흐름에 그대로 남아있으면 상태가 오염된다(예: 학부모로
  // 전환했는데 학생 인증 플래그가 verified로 남는 등). memberType 설정과 동시에 관련
  // 상태를 전부 INITIAL로 되돌려 안전하게 유형을 전환한다. birthDate/isUnder14/linkCode는
  // 유형과 무관하게 유지한다.
  function resetForMemberType(memberType) {
    setState((prev) => ({
      ...prev,
      memberType,
      formData: INITIAL_FORM_DATA,
      agreements: INITIAL_AGREEMENTS,
      verification: INITIAL_VERIFICATION,
      signupCompleted: false,
      parentSignupCompleted: false,
    }));
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
      setParentSignupCompleted,
      resetForMemberType,
      resetSignup,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, hasFlow],
  );

  return (
    <SignupContext.Provider value={value}>{children}</SignupContext.Provider>
  );
}

export function useSignup() {
  const ctx = useContext(SignupContext);

  if (!ctx) {
    throw new Error(
      "useSignup은 SignupProvider 내부에서만 사용할 수 있습니다.",
    );
  }

  return ctx;
}
