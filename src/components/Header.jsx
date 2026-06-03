import { useEffect, useLayoutEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { supabase } from '../lib/supabase';

const CSAT_DATE = '2026-11-19';

function getCsatDay() {
  const now = new Date();
  const todayKst = new Date(
    now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' })
  );
  const today = new Date(
    todayKst.getFullYear(),
    todayKst.getMonth(),
    todayKst.getDate()
  );
  const target = new Date(`${CSAT_DATE}T00:00:00+09:00`);
  const diff = Math.ceil((target.getTime() - today.getTime()) / 86400000);

  if (diff > 0) return `수능 D-${diff}`;
  if (diff === 0) return '수능 D-DAY';
  return `수능 D+${Math.abs(diff)}`;
}

function cleanText(value) {
  return String(value || '').trim();
}

function getDisplayName(profile) {
  const name = cleanText(profile?.name);

  // profiles.name만 이름으로 사용한다.
  // username/email은 이름이 아니므로 헤더 이름으로 절대 대체하지 않는다.
  return name || '회원';
}

function getMemberLabel(profile) {
  const raw = cleanText(profile?.member_type).toLowerCase();
  const role = cleanText(profile?.role).toLowerCase();

  if (role === 'admin') return '관리자';
  if (['student', '학생', '학생회원'].includes(raw)) return '학생회원';
  if (['parent', 'parents', '학부모', '학부모회원'].includes(raw)) return '학부모회원';
  if (['teacher', 'mentor', '멘토', '교사', '선생님', '선생님회원'].includes(raw)) {
    return '멘토회원';
  }
  if (!raw) return '회원';
  if (raw.endsWith('회원')) return raw;

  return `${raw}회원`;
}

export default function Header() {
  const navigate = useNavigate();

  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [csatDDay, setCsatDDay] = useState(getCsatDay());

  useLayoutEffect(() => {
    const preHeader = document.getElementById('pre-header');
    if (preHeader) preHeader.remove();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCsatDDay(getCsatDay());
    }, 60 * 60 * 1000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let alive = true;

    async function loadProfile(nextSession) {
      const userId = nextSession?.user?.id;

      if (!userId) {
        if (alive) setProfile(null);
        return;
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('id, name, username, email, phone, region, school_type, school_name, member_type, role')
        .eq('id', userId)
        .maybeSingle();

      if (!alive) return;

      if (error) {
        console.error('프로필 조회 오류:', error);
        setProfile(null);
        return;
      }

      setProfile(data || null);
    }

    async function syncSession() {
      const { data } = await supabase.auth.getSession();
      const nextSession = data?.session || null;

      if (!alive) return;

      setSession(nextSession);
      await loadProfile(nextSession);
    }

    syncSession();

    function handleProfileUpdated() {
      syncSession();
    }

    window.addEventListener('winning-profile-updated', handleProfileUpdated);

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (_event, nextSession) => {
        if (!alive) return;
        setSession(nextSession || null);
        await loadProfile(nextSession || null);
      }
    );

    return () => {
      alive = false;
      window.removeEventListener('winning-profile-updated', handleProfileUpdated);
      authListener?.subscription?.unsubscribe?.();
    };
  }, []);

  async function handleLogout() {
    setSession(null);
    setProfile(null);

    try {
      await supabase.auth.signOut({ scope: 'global' });
    } catch (error) {
      console.error('로그아웃 오류:', error);
    }

    try {
      Object.keys(window.localStorage).forEach((key) => {
        if (
          key.startsWith('sb-') ||
          key.includes('supabase') ||
          key.includes('auth-token')
        ) {
          window.localStorage.removeItem(key);
        }
      });

      Object.keys(window.sessionStorage).forEach((key) => {
        if (
          key.startsWith('sb-') ||
          key.includes('supabase') ||
          key.includes('auth-token')
        ) {
          window.sessionStorage.removeItem(key);
        }
      });
    } catch (error) {
      console.error('로컬 세션 삭제 오류:', error);
    }

    navigate('/', { replace: true });
  }

  const displayName = getDisplayName(profile);
  const memberLabel = getMemberLabel(profile);
  const isAdmin = cleanText(profile?.role).toLowerCase() === 'admin';

  return (
    <header className="fixed left-0 top-0 z-50 w-full border-b border-[#0D1B2A]/10 bg-white shadow-[0_8px_28px_rgba(13,27,42,0.08)]">
      <div className="mx-auto flex h-[84px] max-w-[1500px] items-center justify-between px-8">
        <Link to="/" className="flex h-[84px] w-[190px] shrink-0 items-center">
          <img
            src="/images/winning-logo.png"
            alt="위닝에듀"
            width="190"
            height="66"
            className="block h-[66px] w-[190px] object-contain"
          />
        </Link>

        <nav className="hidden items-center justify-center gap-10 whitespace-nowrap text-[15px] font-black leading-none text-[#0D1B2A] md:flex">
          <Link
            to="/services"
            className="inline-flex h-6 items-center gap-1 transition hover:text-[#B88737]"
          >
            서비스
            <ChevronDown size={15} strokeWidth={2.7} />
          </Link>

          <Link
            to="/learning-analysis"
            className="inline-flex h-6 items-center transition hover:text-[#B88737]"
          >
            학습 분석
          </Link>

          <Link
            to="/admissions"
            className="inline-flex h-6 items-center transition hover:text-[#B88737]"
          >
            수시 · 대입
          </Link>

          <Link
            to="/pricing"
            className="inline-flex h-6 items-center transition hover:text-[#B88737]"
          >
            결제
          </Link>

          <Link
            to="/reviews"
            className="inline-flex h-6 items-center transition hover:text-[#B88737]"
          >
            후기
          </Link>

          <Link
            to="/events"
            className="inline-flex h-6 items-center transition hover:text-[#B88737]"
          >
            공지사항
          </Link>
        </nav>

        <div className="flex shrink-0 items-center gap-3">
          {session ? (
            <>
              <div className="hidden items-center gap-2 rounded-xl border border-[#0D1B2A]/10 bg-[#F8F7F3] px-4 py-2 text-sm font-black text-[#0D1B2A] lg:flex">
                <span className="rounded-lg bg-[#0D1B2A] px-2.5 py-1 text-xs text-white">
                  {csatDDay}
                </span>
                <span>
                  {displayName}님 {memberLabel}
                </span>
              </div>

              <Link
                to="/mypage"
                className="inline-flex h-10 items-center justify-center rounded-xl border border-[#0D1B2A]/25 bg-white px-5 text-sm font-black leading-5 text-[#0D1B2A] transition hover:border-[#0D1B2A] hover:bg-[#F8F7F3]"
              >
                마이페이지
              </Link>

              {isAdmin && (
                <Link
                  to="/admin"
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-[#0D1B2A]/25 bg-white px-6 text-sm font-black leading-5 text-[#0D1B2A] transition hover:border-[#0D1B2A] hover:bg-[#F8F7F3]"
                >
                  관리자
                </Link>
              )}

              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-[#0D1B2A] bg-[#0D1B2A] px-6 text-sm font-black leading-5 text-white shadow-[0_10px_26px_rgba(13,27,42,0.22)] transition hover:bg-[#162A40]"
              >
                로그아웃
              </button>
            </>
          ) : (
            <>
              <Link
                to="/login"
                className="inline-flex h-10 items-center justify-center rounded-xl border border-[#0D1B2A]/25 bg-white px-6 text-sm font-black leading-5 text-[#0D1B2A] transition hover:border-[#0D1B2A] hover:bg-[#F8F7F3]"
              >
                로그인
              </Link>

              <Link
                to="/signup"
                className="inline-flex h-10 items-center justify-center rounded-xl border border-[#0D1B2A] bg-[#0D1B2A] px-6 text-sm font-black leading-5 text-white shadow-[0_10px_26px_rgba(13,27,42,0.22)] transition hover:bg-[#162A40]"
              >
                회원가입
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
