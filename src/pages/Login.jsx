import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { AuthLayout, AuthTitle, TextField, PrimaryButton, TextLinkButton } from '../components/auth';

// 오픈 리다이렉트 방지: 같은 사이트 내부 경로만 허용
function safeRedirect(value) {
  if (!value) return '/';
  try {
    // origin 비교로 판단해야 백슬래시('/\evil.com')처럼 startsWith('//') 검사를
    // 우회하는 프로토콜 상대 URL도 브라우저의 URL 파싱과 동일하게 차단된다.
    const u = new URL(value, window.location.origin);
    return u.origin === window.location.origin ? u.pathname + u.search + u.hash : '/';
  } catch {
    return '/';
  }
}

export default function Login() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const redirectTo = safeRedirect(params.get('redirect'));

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let alive = true;

    async function checkSession() {
      try {
        const { data } = await supabase.auth.getSession();

        if (!alive) return;

        if (data?.session?.user) {
          navigate(redirectTo, { replace: true });
        }
      } catch (error) {
        console.error('기존 세션 확인 오류:', error);
      }
    }

    checkSession();

    return () => {
      alive = false;
    };
  }, [navigate, redirectTo]);

  function getFriendlyError(errorMessage) {
    if (!errorMessage) return '로그인 중 문제가 발생했습니다.';

    if (errorMessage.includes('Invalid login credentials')) {
      return '이메일 또는 비밀번호가 올바르지 않습니다.';
    }

    if (errorMessage.includes('Email not confirmed')) {
      return '이메일 인증이 완료되지 않았습니다. 받은 메일함을 확인해 주세요.';
    }

    return errorMessage;
  }

  async function handleLogin(e) {
    e.preventDefault();

    if (loading) return;

    setLoading(true);
    setMessage('');

    try {
      const normalizedEmail = email.trim().toLowerCase();

      const loginPromise = supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password
      });

      const timeoutPromise = new Promise((_, reject) => {
        window.setTimeout(() => reject(new Error('login_timeout')), 12000);
      });

      const { data, error } = await Promise.race([loginPromise, timeoutPromise]);

      if (error) {
        setMessage(getFriendlyError(error.message));
        setLoading(false);
        return;
      }

      if (!data?.user) {
        setMessage('사용자 정보를 불러오지 못했습니다. 다시 시도해 주세요.');
        setLoading(false);
        return;
      }

      setLoading(false);
      window.location.href = redirectTo;
    } catch (error) {
      console.error('로그인 처리 오류:', error);

      if (error?.message === 'login_timeout') {
        setMessage('로그인 응답이 지연되고 있습니다. 새로고침 후 다시 시도해 주세요.');
      } else {
        setMessage('로그인 처리 중 문제가 발생했습니다. 다시 시도해 주세요.');
      }

      setLoading(false);
    }
  }

  const canSubmit = email.trim().length > 0 && password.length > 0;

  return (
    <AuthLayout>
      <AuthTitle line1="진학의 첫단추," line2="위닝에듀에서 시작해요" />

      <form onSubmit={handleLogin} className="flex w-full flex-col gap-3">
        <TextField
          id="login-email"
          name="email"
          type="email"
          value={email}
          onChange={setEmail}
          placeholder="이메일을 입력해 주세요"
          autoComplete="email"
          required
        />

        <TextField
          id="login-password"
          name="password"
          type="password"
          value={password}
          onChange={setPassword}
          placeholder="비밀번호를 입력해 주세요"
          autoComplete="current-password"
          required
          helperText={message || undefined}
          status={message ? 'error' : 'default'}
        />

        <PrimaryButton type="submit" disabled={!canSubmit || loading}>
          {loading ? '로그인 처리 중...' : '로그인'}
        </PrimaryButton>
      </form>

      <p className="text-center text-base text-ink">
        아직 위닝에듀 회원이 아니신가요?{' '}
        <TextLinkButton as="link" to="/signup" tone="primary" size="md" weight="semibold">
          회원가입
        </TextLinkButton>
      </p>
    </AuthLayout>
  );
}
