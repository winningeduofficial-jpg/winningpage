import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { supabase } from '../lib/supabase';

const CSAT_DATE = '2026-11-19';
const HEADER_PROFILE_CACHE_KEY = 'winning-header-profile';

function cleanText(value) {
  return String(value || '').trim();
}

function getCsatDay() {
  const now = new Date();
  const kstNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  const today = new Date(kstNow.getFullYear(), kstNow.getMonth(), kstNow.getDate());
  const target = new Date(`${CSAT_DATE}T00:00:00+09:00`);
  const diff = Math.ceil((target.getTime() - today.getTime()) / 86400000);

  if (diff > 0) return `수능 D-${diff}`;
  if (diff === 0) return '수능 D-DAY';
  return `수능 D+${Math.abs(diff)}`;
}

function getMemberLabel(profile) {
  const raw = cleanText(profile?.member_type).toLowerCase();
  const role = cleanText(profile?.role).toLowerCase();

  if (role === 'admin') return '관리자';
  if (!raw) return '';

  if (raw === 'student' || raw === '학생' || raw === '학생회원') return '학생회원';
  if (raw === 'parent' || raw === 'parents' || raw === '학부모' || raw === '학부모회원') return '학부모회원';
  if (raw === 'mentor' || raw === 'teacher' || raw === '멘토' || raw === '교사') return '멘토회원';

  return raw.endsWith('회원') ? raw : `${raw}회원`;
}

function readCachedProfile() {
  try {
    const raw = window.localStorage.getItem(HEADER_PROFILE_CACHE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;

    return parsed;
  } catch {
    return null;
  }
}

function writeCachedProfile(profile) {
  try {
    if (!profile) {
      window.localStorage.removeItem(HEADER_PROFILE_CACHE_KEY);
      return;
    }

    window.localStorage.setItem(HEADER_PROFILE_CACHE_KEY, JSON.stringify(profile));
  } catch {
    // 캐시 저장 실패는 화면 렌더링을 막지 않는다.
  }
}

function isSameUserProfile(profile, user) {
  if (!profile || !user) return false;

  const profileId = cleanText(profile.id);
  const userId = cleanText(user.id);
  const profileEmail = cleanText(profile.email).toLowerCase();
  const userEmail = cleanText(user.email).toLowerCase();

  return (!!profileId && profileId === userId) || (!!profileEmail && profileEmail === userEmail);
}

async function queryProfileById(userId) {
  if (!userId) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, email, username, member_type, role')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.error('profiles id 조회 실패:', error);
    return null;
  }

  return data || null;
}

async function queryProfileByEmail(email) {
  const normalizedEmail = cleanText(email).toLowerCase();
  if (!normalizedEmail) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, email, username, member_type, role')
    .eq('email', normalizedEmail)
    .maybeSingle();

  if (error) {
    console.error('profiles email 조회 실패:', error);
    return null;
  }

  return data || null;
}

async function queryProfileByUsername(email) {
  const username = cleanText(email).split('@')[0];
  if (!username) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, email, username, member_type, role')
    .eq('username', username)
    .maybeSingle();

  if (error) {
    console.error('profiles username 조회 실패:', error);
    return null;
  }

  return data || null;
}

async function fetchProfile(user) {
  if (!user) return null;

  const byId = await queryProfileById(user.id);
  if (byId?.name) return byId;

  const byEmail = await queryProfileByEmail(user.email);
  if (byEmail?.name) return byEmail;

  const byUsername = await queryProfileByUsername(user.email);
  if (byUsername?.name) return byUsername;

  return byId || byEmail || byUsername || null;
}

export default function Header() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(() => readCachedProfile());
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [csatDDay, setCsatDDay] = useState(getCsatDay());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCsatDDay(getCsatDay());
    }, 60 * 60 * 1000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let alive = true;
    let syncSeq = 0;

    const TIMEOUT = Symbol('timeout');

    function withTimeout(promise, ms, fallbackValue = TIMEOUT) {
      return Promise.race([
        promise,
        new Promise((resolve) => {
          window.setTimeout(() => resolve(fallbackValue), ms);
        })
      ]);
    }

    async function syncSession(nextSession) {
      const currentSeq = ++syncSeq;

      try {
        const sessionResult =
          nextSession !== undefined
            ? nextSession
            : await withTimeout(supabase.auth.getSession(), 3500, { data: { session: null } });

        if (!alive || currentSeq !== syncSeq) return;

        const currentSession = nextSession !== undefined
          ? sessionResult
          : (sessionResult?.data?.session || null);

        setSession(currentSession);

        if (!currentSession?.user) {
          setProfile(null);
          writeCachedProfile(null);
          setIsAuthReady(true);
          return;
        }

        const cachedProfile = readCachedProfile();

        if (isSameUserProfile(cachedProfile, currentSession.user)) {
          setProfile(cachedProfile);
        }

        setIsAuthReady(true);

        const nextProfile = await withTimeout(fetchProfile(currentSession.user), 5000, TIMEOUT);

        if (!alive || currentSeq !== syncSeq) return;

        if (nextProfile && isSameUserProfile(nextProfile, currentSession.user)) {
          setProfile(nextProfile);
          writeCachedProfile(nextProfile);
          return;
        }

        setProfile((prevProfile) => {
          if (isSameUserProfile(prevProfile, currentSession.user)) return prevProfile;
          if (isSameUserProfile(cachedProfile, currentSession.user)) return cachedProfile;
          return null;
        });
      } catch (error) {
        console.error('헤더 세션 동기화 오류:', error);

        if (alive && currentSeq === syncSeq) {
          setIsAuthReady(true);
          setProfile((prevProfile) => prevProfile || readCachedProfile());
        }
      }
    }

    syncSession();

    const handleProfileUpdated = () => {
      syncSession();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') syncSession();
    };

    window.addEventListener('winning-profile-updated', handleProfileUpdated);
    window.addEventListener('focus', handleProfileUpdated);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (_event, nextSession) => {
        await syncSession(nextSession || null);
      }
    );

    return () => {
      alive = false;
      window.removeEventListener('winning-profile-updated', handleProfileUpdated);
      window.removeEventListener('focus', handleProfileUpdated);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      authListener?.subscription?.unsubscribe?.();
    };
  }, []);

  function clearSupabaseAuthStorage() {
    try {
      const localKeys = [];

      for (let i = 0; i < window.localStorage.length; i += 1) {
        const key = window.localStorage.key(i);
        if (key) localKeys.push(key);
      }

      localKeys.forEach((key) => {
        if (
          key.startsWith('sb-') ||
          key.includes('supabase') ||
          key.includes('auth-token') ||
          key === HEADER_PROFILE_CACHE_KEY
        ) {
          window.localStorage.removeItem(key);
        }
      });

      const sessionKeys = [];

      for (let i = 0; i < window.sessionStorage.length; i += 1) {
        const key = window.sessionStorage.key(i);
        if (key) sessionKeys.push(key);
      }

      sessionKeys.forEach((key) => {
        if (
          key.startsWith('sb-') ||
          key.includes('supabase') ||
          key.includes('auth-token')
        ) {
          window.sessionStorage.removeItem(key);
        }
      });
    } catch (error) {
      console.error('브라우저 세션 정리 오류:', error);
    }
  }

  async function handleLogout() {
    setSession(null);
    setProfile(null);
    writeCachedProfile(null);
    clearSupabaseAuthStorage();

    try {
      await Promise.race([
        supabase.auth.signOut({ scope: 'local' }),
        new Promise((resolve) => window.setTimeout(resolve, 1800))
      ]);
    } catch (error) {
      console.error('로그아웃 오류:', error);
    }

    clearSupabaseAuthStorage();
    window.dispatchEvent(new Event('winning-profile-updated'));
    window.location.replace('/');
  }

  const isLoggedIn = !!session?.user;
  const displayName = cleanText(profile?.name) || '회원';
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
          <Link to="/services" className="inline-flex h-6 items-center gap-1 transition hover:text-[#B88737]">
            서비스
            <ChevronDown size={15} strokeWidth={2.7} />
          </Link>

          <Link to="/learning-analysis" className="inline-flex h-6 items-center transition hover:text-[#B88737]">
            학습 분석
          </Link>

          <Link to="/admissions" className="inline-flex h-6 items-center transition hover:text-[#B88737]">
            수시 · 대입
          </Link>

          <Link to="/pricing" className="inline-flex h-6 items-center transition hover:text-[#B88737]">
            결제
          </Link>

          <Link to="/reviews" className="inline-flex h-6 items-center transition hover:text-[#B88737]">
            후기
          </Link>

          <Link to="/events" className="inline-flex h-6 items-center transition hover:text-[#B88737]">
            공지사항
          </Link>
        </nav>

        <div className="flex shrink-0 items-center gap-3">
          {!isAuthReady ? (
            <div className="flex shrink-0 items-center gap-3 opacity-0" aria-hidden="true">
              <div className="hidden h-10 w-[198px] rounded-xl lg:block" />
              <div className="h-10 w-[118px] rounded-xl" />
              <div className="h-10 w-[96px] rounded-xl" />
            </div>
          ) : isLoggedIn ? (
            <>
              <div className="hidden items-center gap-2 rounded-xl border border-[#0D1B2A]/10 bg-[#F8F7F3] px-4 py-2 text-sm font-black text-[#0D1B2A] lg:flex">
                <span className="rounded-lg bg-[#0D1B2A] px-2.5 py-1 text-xs text-white">
                  {csatDDay}
                </span>

                <span>
                  {displayName}님{memberLabel ? ` ${memberLabel}` : ''}
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
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-[#0D1B2A]/25 bg-white px-5 text-sm font-black leading-5 text-[#0D1B2A] transition hover:border-[#0D1B2A] hover:bg-[#F8F7F3]"
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
