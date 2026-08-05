// 가입 화면 3종(StudentForm / UnifiedSignupForm / Under14Form)이 공유하는
// 이메일 인증 시퀀스.
//
// 왜 공용으로 뽑았나
//   세 화면이 "중복확인 → 코드 발송 → 코드 검증"을 그대로 복제하고 있었는데,
//   여기에 "가입 중단 계정 이어가기" 분기가 더해지면 복제본마다 어긋날 위험이
//   커진다. 분기 규칙을 한 곳에만 둔다.
//
// 무엇을 푸는가
//   Supabase Auth는 이메일 OTP를 보내려면 auth.users 행을 먼저 만들어야 한다.
//   그래서 코드까지 받고 "가입 완료"를 누르지 않은 채 나가면 계정만 남는다.
//   예전에는 그 상태를 "이메일 중복"으로 보고 로그인하라고 안내해서, 가입도
//   못 하고 쓸 계정도 없는 막다른 길이 됐다. 이제는 이어서 가입하게 한다.
//
// 상태별 경로 (sql/40_auth_signup.sql [9] check_email_signup_state)
//   available            → signUp        → verifyOtp type 'signup'
//   resumable_unverified → signUp 재호출 → verifyOtp type 'signup'  (확인메일 재발송)
//   resumable_verified   → signInWithOtp → verifyOtp type 'email'   (Magic Link 템플릿)
//   taken                → 로그인 안내
//
// ※ resumable_verified 경로는 "Confirm signup"이 아니라 **Magic Link** 템플릿으로
//   나간다. Supabase 대시보드에서 그 템플릿도 {{ .Token }}을 쓰도록 고쳐두지
//   않으면 이 경로에서만 매직링크가 발송된다.

import { supabase } from './supabase';

export const EMAIL_STATE = {
  AVAILABLE: 'available',
  RESUMABLE_UNVERIFIED: 'resumable_unverified',
  RESUMABLE_VERIFIED: 'resumable_verified',
  TAKEN: 'taken'
};

// verifyOtp에 넘길 타입. 발송에 쓴 API에 따라 달라서 발송 결과로 함께 돌려준다.
export const OTP_MODE = {
  SIGNUP: 'signup',
  EMAIL: 'email'
};

// Supabase Auth의 "Minimum interval between emails"(기본 60초)와 맞춘다.
// 이 값을 대시보드에서 바꿨다면 여기도 같이 바꿔야 안내가 어긋나지 않는다.
export const EMAIL_RESEND_COOLDOWN_SECONDS = 60;

export const MESSAGES = {
  taken: '이미 가입된 이메일입니다. 로그인 페이지에서 로그인해 주세요.',
  cooldown: (left) => `인증번호는 ${left}초 후에 다시 보낼 수 있어요.`,
  resumed: '이전에 진행하던 가입이 있어 인증코드를 다시 보냈습니다.',
  sent: '입력한 이메일로 인증코드를 발송했습니다.',
  checkFailed: '중복확인 기능을 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.',
  codeMismatch: '인증번호가 틀립니다.'
};

/**
 * 이메일 가입 상태를 조회한다.
 * @returns {Promise<{state?: string, error?: Error}>}
 */
export async function checkEmailSignupState(email) {
  const { data, error } = await supabase.rpc('check_email_signup_state', {
    p_email: email
  });

  if (error) return { error };
  return { state: data };
}

/**
 * 인증코드를 발송한다. 상태에 따라 신규 가입/이어가기를 알아서 고른다.
 *
 * @param {object} params
 * @param {string} params.email      정규화된(소문자·trim) 이메일
 * @param {string} params.password   폼에 입력된 비밀번호
 * @param {string} params.name
 * @param {string} params.memberType 'student' | 'parent' | 'mentor'
 * @returns {Promise<{state?: string, mode?: string, resumed?: boolean, error?: Error}>}
 *          state가 'taken'이면 발송하지 않는다. mode는 검증 단계에 그대로 넘긴다.
 */
export async function sendSignupEmailCode({ email, password, name, memberType }) {
  const { state, error: stateError } = await checkEmailSignupState(email);

  if (stateError) return { error: stateError };
  if (state === EMAIL_STATE.TAKEN) return { state };

  // 이전 세션이 남아 있으면 OTP 검증이 엉뚱한 계정에 붙을 수 있어 먼저 끊는다.
  try {
    await supabase.auth.signOut({ scope: 'global' });
  } catch (_error) {
    // 세션이 없으면 실패하는 게 정상이라 무시한다.
  }

  // 이메일이 이미 확인된 계정은 signUp이 "이미 등록됨"으로 막힌다.
  // 이 경우에만 OTP 로그인으로 코드를 보낸다.
  if (state === EMAIL_STATE.RESUMABLE_VERIFIED) {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false }
    });

    if (error) return { error, state };
    return { state, mode: OTP_MODE.EMAIL, resumed: true };
  }

  // available / resumable_unverified 는 둘 다 signUp으로 처리된다.
  // 미확인 계정에 대한 signUp 재호출은 확인메일을 다시 보낸다.
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        email,
        name,
        full_name: name,
        member_type: memberType,
        role: 'user'
      }
    }
  });

  if (error) return { error, state };

  return {
    state,
    mode: OTP_MODE.SIGNUP,
    resumed: state === EMAIL_STATE.RESUMABLE_UNVERIFIED
  };
}

/**
 * "새 비밀번호가 기존과 같다"는 거부인지 판별한다.
 *
 * 이어가기에서 사용자가 이전 시도와 같은 비밀번호를 입력하면 Supabase가
 * same_password로 거부한다. 하지만 우리 목적은 "계정 비밀번호를 방금 입력한
 * 값과 일치시키는 것"이고, 이미 같다면 그 목적은 달성된 상태다. 실패로
 * 취급하면 같은 비밀번호를 쓴 사용자가 가입을 끝낼 수 없게 된다.
 */
function isSamePasswordError(error) {
  const code = String(error?.code || '').toLowerCase();
  const message = String(error?.message || '').toLowerCase();

  return code === 'same_password' || message.includes('different from the old password');
}

/**
 * 인증코드를 검증한다. 이어가기였다면 이번에 입력한 비밀번호로 갱신한다.
 *
 * 비밀번호를 다시 쓰는 이유: 이어가기 경로에서는 지금 폼에 입력한 비밀번호가
 * 계정에 반영되지 않은 상태일 수 있다(이전 시도의 비밀번호가 남아 있다).
 * 검증 직후에는 세션이 있으므로 여기서 맞춰준다.
 *
 * @param {object} params
 * @param {string} params.email
 * @param {string} params.token
 * @param {string} params.mode     sendSignupEmailCode가 돌려준 mode
 * @param {string} [params.password]
 * @param {boolean} [params.resumed]
 * @returns {Promise<{ok?: boolean, error?: Error, stage?: 'verify'|'password'}>}
 */
export async function verifySignupEmailCode({ email, token, mode, password, resumed }) {
  const { error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: mode || OTP_MODE.SIGNUP
  });

  if (error) return { error, stage: 'verify' };

  if (resumed && password) {
    const { error: passwordError } = await supabase.auth.updateUser({ password });

    // 이미 같은 비밀번호면 목적이 달성된 것이므로 성공으로 본다.
    if (passwordError && !isSamePasswordError(passwordError)) {
      // OTP는 1회용이라 이 시점에 이미 소모됐다. 사용자가 같은 코드로 다시
      // 시도하면 403이 나므로, 호출부는 재발송을 안내해야 한다.
      console.error('비밀번호 설정 실패:', passwordError);
      return { error: passwordError, stage: 'password' };
    }
  }

  return { ok: true };
}
