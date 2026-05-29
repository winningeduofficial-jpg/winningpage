import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  LockKeyhole,
  Mail,
  Phone,
  ShieldCheck,
  Sparkles,
  UserRound
} from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function Signup() {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    password: ''
  });

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    let alive = true;

    async function checkSession() {
      const { data } = await supabase.auth.getSession();

      if (!alive) return;

      if (data.session?.user) {
        navigate('/', { replace: true });
        return;
      }

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

  async function handleSubmit(e) {
    e.preventDefault();

    const normalizedEmail = form.email.trim().toLowerCase();
    const normalizedName = form.name.trim();
    const normalizedPhone = form.phone.trim();

    if (!normalizedName) {
      setMessage('이름을 입력해 주세요.');
      return;
    }

    if (!normalizedEmail) {
      setMessage('이메일을 입력해 주세요.');
      return;
    }

    if (form.password.length < 6) {
      setMessage('비밀번호는 최소 6자 이상으로 입력해 주세요.');
      return;
    }

    setLoading(true);
    setMessage('');

    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password: form.password,
      options: {
        data: {
          name: normalizedName,
          phone: normalizedPhone,
          role: 'user'
        }
      }
    });

    if (error) {
      setMessage(getFriendlyError(error.message));
      setLoading(false);
      return;
    }

    const user = data.user;

    if (user?.id) {
      const { error: profileError } = await supabase
        .from('profiles')
        .upsert(
          {
            id: user.id,
            name: normalizedName,
            phone: normalizedPhone,
            role: 'user'
          },
          {
            onConflict: 'id'
          }
        );

      if (profileError) {
        console.warn('profiles 저장 오류:', profileError.message);
      }
    }

    setLoading(false);
    navigate('/login', {
      replace: true,
      state: {
        message: '회원가입이 완료되었습니다. 로그인해 주세요.'
      }
    });
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
              위닝에듀 학습 관리 시작
            </div>

            <h1 className="mt-8 text-[44px] font-black leading-[1.15] tracking-[-0.04em] md:text-[58px]">
              학습 기록이 쌓이면,
              <br />
              <span className="text-[#D7B56D]">입시 전략이 더 정교해집니다</span>
            </h1>

            <p className="mt-6 max-w-xl text-lg font-bold leading-8 text-white/78">
              매일의 학습 데이터를 기반으로 주간 리포트, 목표 달성률, 합격 가능성 변화를 체계적으로 관리합니다.
            </p>

            <div className="mt-10 grid max-w-xl grid-cols-3 overflow-hidden rounded-3xl border border-white/12 bg-white/[0.07] backdrop-blur-xl">
              <div className="border-r border-white/10 p-5">
                <p className="text-2xl font-black text-white">1,240+</p>
                <p className="mt-1 text-xs font-extrabold text-white/58">
                  누적 회원 수
                </p>
              </div>

              <div className="border-r border-white/10 p-5">
                <p className="text-2xl font-black text-white">94.7%</p>
                <p className="mt-1 text-xs font-extrabold text-white/58">
                  수시 합격률
                </p>
              </div>

              <div className="p-5">
                <p className="text-2xl font-black text-white">18.7점</p>
                <p className="mt-1 text-xs font-extrabold text-white/58">
                  평균 성장 폭
                </p>
              </div>
            </div>
          </div>

          <div className="mx-auto w-full max-w-[480px]">
            <div className="rounded-[34px] border border-white/70 bg-white p-7 shadow-[0_28px_80px_rgba(13,27,42,0.28)] md:p-9">
              <div className="flex items-start justify-between gap-5">
                <div>
                  <p className="text-sm font-black text-[#B88737]">
                    WINNING EDU SIGN UP
                  </p>

                  <h2 className="mt-2 text-3xl font-black tracking-[-0.04em] text-[#0D1B2A]">
                    회원가입
                  </h2>

                  <p className="mt-2 text-sm font-bold leading-6 text-[#5B6573]">
                    학습 관리 서비스를 이용할 계정을 생성하세요.
                  </p>
                </div>

                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#0D1B2A] text-white shadow-[0_16px_30px_rgba(13,27,42,0.28)]">
                  <ShieldCheck size={26} />
                </div>
              </div>

              <form onSubmit={handleSubmit} className="mt-8 space-y-4">
                <label className="block">
                  <span className="mb-2 block text-sm font-black text-[#0D1B2A]">
                    이름
                  </span>

                  <div className="flex h-14 items-center gap-3 rounded-2xl border border-[#0D1B2A]/12 bg-[#F8F7F3] px-4 transition focus-within:border-[#B88737] focus-within:bg-white focus-within:shadow-[0_0_0_4px_rgba(184,135,55,0.12)]">
                    <UserRound size={19} className="text-[#8B95A1]" />

                    <input
                      type="text"
                      placeholder="홍길동"
                      className="h-full w-full bg-transparent text-[15px] font-bold text-[#0D1B2A] outline-none placeholder:text-[#9AA3AF]"
                      value={form.name}
                      onChange={(e) => updateForm('name', e.target.value)}
                      autoComplete="name"
                      required
                    />
                  </div>
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-black text-[#0D1B2A]">
                    연락처
                  </span>

                  <div className="flex h-14 items-center gap-3 rounded-2xl border border-[#0D1B2A]/12 bg-[#F8F7F3] px-4 transition focus-within:border-[#B88737] focus-within:bg-white focus-within:shadow-[0_0_0_4px_rgba(184,135,55,0.12)]">
                    <Phone size={19} className="text-[#8B95A1]" />

                    <input
                      type="tel"
                      placeholder="010-0000-0000"
                      className="h-full w-full bg-transparent text-[15px] font-bold text-[#0D1B2A] outline-none placeholder:text-[#9AA3AF]"
                      value={form.phone}
                      onChange={(e) => updateForm('phone', e.target.value)}
                      autoComplete="tel"
                    />
                  </div>
                </label>

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
                      value={form.email}
                      onChange={(e) => updateForm('email', e.target.value)}
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
                      placeholder="6자 이상 입력"
                      className="h-full w-full bg-transparent text-[15px] font-bold text-[#0D1B2A] outline-none placeholder:text-[#9AA3AF]"
                      value={form.password}
                      onChange={(e) => updateForm('password', e.target.value)}
                      autoComplete="new-password"
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
                  {loading ? '가입 처리 중...' : '회원가입'}
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
                  가입 후 학습 리포트와 상담 데이터를 관리할 수 있습니다.
                </div>

                <div className="flex items-center gap-3">
                  <BarChart3 size={18} className="text-[#B88737]" />
                  관리자 승인 계정은 별도 관리자 페이지 접근이 가능합니다.
                </div>
              </div>

              <p className="mt-6 text-center text-sm font-bold text-[#6B7280]">
                이미 계정이 있나요?{' '}
                <Link
                  to="/login"
                  className="font-black text-[#B88737] hover:text-[#8F6421]"
                >
                  로그인
                </Link>
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
