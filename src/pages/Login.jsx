import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, BarChart3, CheckCircle2, LockKeyhole, Mail, Sparkles } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    let alive = true;

    async function checkSession() {
      const { data } = await supabase.auth.getSession();

      if (!alive) return;

      if (data.session?.user) {
        const nextPath = await getRedirectPath(data.session.user.id);
        navigate(nextPath, { replace: true });
        return;
      }

      setCheckingSession(false);
    }

    checkSession();

    return () => {
      alive = false;
    };
  }, [navigate]);

  async function getRedirectPath(userId) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle();

    if (profile?.role === 'admin') return '/admin';

    return location.state?.from?.pathname || '/';
  }

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

    setLoading(true);
    setMessage('');

    const normalizedEmail = email.trim().toLowerCase();

    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password
    });

    if (error) {
      setMessage(getFriendlyError(error.message));
      setLoading(false);
      return;
    }

    const userId = data.user?.id;

    if (!userId) {
      setMessage('사용자 정보를 불러오지 못했습니다. 다시 시도해 주세요.');
      setLoading(false);
      return;
    }

    const nextPath = await getRedirectPath(userId);

    setLoading(false);
    navigate(nextPath, { replace: true });
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
      <section className="relative overflow-hidden border-b border-[#0D1B2A]/10 bg-[linear-gradient(120deg,#081321_0%,#0D1B2A_42%,#142B45_100%)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_22%,rgba(184,135,55,0.28),transparent_30%),radial-gradient(circle_at_18%_76%,rgba(47,111,237,0.18),transparent_32%)]" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/35 to-transparent" />

        <div className="relative mx-auto grid min-h-[calc(100vh-84px)] max-w-[1280px] items-center gap-10 px-6 py-16 lg:grid-cols-[1.08fr_0.92fr] lg:px-8">
          <div className="max-w-2xl text-white">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#D7B56D]/45 bg-[#D7B56D]/10 px-4 py-2 text-sm font-black text-[#E5C677] shadow-[0_12px_34px_rgba(0,0,0,0.18)]">
              <Sparkles size={16} fill="currentColor" />
              데이터 기반 맞춤 학습 플랫폼
            </div>

            <h1 className="mt-8 text-[44px] font-black leading-[1.15] tracking-[-0.04em] md:text-[58px]">
              로그인 후,
              <br />
              <span className="text-[#D7B56D]">나만의 위닝 서비스</span>를
              <br />
              확인하세요
            </h1>

            <p className="mt-6 max-w-xl text-lg font-bold leading-8 text-white/78">
              내 입시를 위한 선택, 역시 입시는 위닝에듀입니다.
            </p>

            <div className="mt-10 grid max-w-xl grid-cols-3 overflow-hidden rounded-3xl border border-white/12 bg-white/[0.07] backdrop-blur-xl">
              <div className="border-r border-white/10 p-5">
                <p className="text-2xl font-black text-white">1,240+</p>
                <p className="mt-1 text-xs font-extrabold text-white/58">누적 회원 수</p>
              </div>

              <div className="border-r border-white/10 p-5">
                <p className="text-2xl font-black text-white">94.7%</p>
                <p className="mt-1 text-xs font-extrabold text-white/58">수시 합격률</p>
              </div>

              <div className="p-5">
                <p className="text-2xl font-black text-white">평균 18.7점</p>
                <p className="mt-1 text-xs font-extrabold text-white/58">평균 성장 폭</p>
              </div>
            </div>
          </div>

          <div className="mx-auto w-full max-w-[480px]">
            <div className="rounded-[34px] border border-white/70 bg-white p-7 shadow-[0_28px_80px_rgba(13,27,42,0.28)] md:p-9">
              <div className="flex items-start justify-between gap-5">
                <div>
                  <p className="text-sm font-black text-[#B88737]">
                    WINNING EDU LOGIN
                  </p>

                  <h2 className="mt-2 text-3xl font-black tracking-[-0.04em] text-[#0D1B2A]">
                    로그인
                  </h2>
                </div>
             </div>
                
            

              <form onSubmit={handleLogin} className="mt-8 space-y-4">
                <label className="block">
                  <span className="mb-2 block text-sm font-black text-[#0D1B2A]">
                    이메일
                  </span>

                  <div className="flex h-14 items-center gap-3 rounded-2xl border border-[#0D1B2A]/12 bg-[#F8F7F3] px-4 transition focus-within:border-[#B88737] focus-within:bg-white focus-within:shadow-[0_0_0_4px_rgba(184,135,55,0.12)]">
                    <Mail size={19} className="text-[#8B95A1]" />

                    <input
                      type="email"
                      placeholder="winningedu@example.com"
                      className="h-full w-full bg-transparent text-[15px] font-bold text-[#0D1B2A] outline-none placeholder:text-[#9AA3AF]"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                      required
                    />
                  </div>
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-black text-[#0D1B2A]">
                    비밀번호
                  </span>

                  <div className="flex h-14 items-center gap-3 rounded-2xl border border-[#0D1B2A]/12 bg-[#F8F7F3] px-4 transition focus-within:border-[#B88737] focus-within:bg-white focus-within:shadow-[0_0_0_4px_rgba(184,135,55,0.12)]">
                    <LockKeyhole size={19} className="text-[#8B95A1]" />

                    <input
                      type="password"
                      placeholder="비밀번호 입력"
                      className="h-full w-full bg-transparent text-[15px] font-bold text-[#0D1B2A] outline-none placeholder:text-[#9AA3AF]"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                      required
                    />
                  </div>
                </label>

                {message && (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold leading-6 text-red-700">
                    {message}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="group flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#0D1B2A] text-[15px] font-black text-white shadow-[0_18px_34px_rgba(13,27,42,0.24)] transition hover:bg-[#162A40] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? '로그인 처리 중...' : '로그인'}
                  {!loading && (
                    <ArrowRight
                      size={18}
                      className="transition group-hover:translate-x-1"
                    />
                  )}
                </button>
              </form>

              <div className="mt-6 grid gap-3 rounded-3xl border border-[#0D1B2A]/8 bg-[#F8F7F3] p-4 text-sm font-bold text-[#5B6573]">
                <div className="flex items-center gap-3">
                  <CheckCircle2 size={18} className="text-[#B88737]" />
                  개인정보와 상담 내역을 안전하게 관리합니다.
                </div>

                <div className="flex items-center gap-3">
                  <BarChart3 size={18} className="text-[#B88737]" />
                  다양한 위닝 서비스들을 만나볼 수 있습니다.
                </div>
              </div>

              <p className="mt-6 text-center text-sm font-bold text-[#6B7280]">
                아직 계정이 없나요?{' '}
                <Link
                  to="/signup"
                  className="font-black text-[#B88737] hover:text-[#8F6421]"
                >
                  회원가입
                </Link>
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
