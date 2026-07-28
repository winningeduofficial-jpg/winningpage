import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, LogOut, Menu, Settings } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { MY_MENU } from './myMenuItems';
import MobileNavDrawer from './MobileNavDrawer';

const CSAT_DATE = '2026-11-19';
const HEADER_PROFILE_CACHE_KEY = 'winning-header-profile';
const HEADER_NAV_CACHE_KEY = 'winning-header-nav-groups-dynamic-v4';

function cleanText(value) {
  return String(value || '').trim();
}

function safeJsonStringify(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
}

function isSameObject(a, b) {
  return safeJsonStringify(a) === safeJsonStringify(b);
}

const FALLBACK_NAV_GROUPS = [
  {
    title: '서비스',
    to: '/free-diagnosis',
    items: [
      { label: '무료진단', to: '/free-diagnosis', sortOrder: 0 },
      { label: '위닝 목표관리', to: '/page/services-goal', sortOrder: 1 },
      { label: '위닝 수시예측', to: '/page/services-susi-prediction', sortOrder: 2 },
      { label: '위닝 콜멘토', to: '/page/services-content', sortOrder: 3 },
      { label: '위닝AI 수행평가', to: '/page/services-ai-performance', sortOrder: 4 },
      { label: '위닝 세특관리', to: '/page/services-record-coach', sortOrder: 5 },
      { label: '위닝 약점관리', to: '/page/services-weakness', sortOrder: 6 }
    ]
  },
  {
    title: '프리미엄',
    to: '/page/premium-a',
    items: [
      { label: '입시컨설팅 A프로그램', to: '/page/premium-a', sortOrder: 1 },
      { label: '입시컨설팅 S프로그램', to: '/page/premium-s', sortOrder: 2 },
      { label: '특화 멘토링 서비스', to: '/page/services-mentoring', sortOrder: 3 }
    ]
  },
  {
    title: '입시정보',
    to: '/admission/guidelines',
    items: [
      { label: '대입모집요강', to: '/admission/guidelines', sortOrder: 1 },
      { label: '입결정보', to: '/admission/results', sortOrder: 2 },
      { label: '수시·정시', to: '/admission/susi-jungsi', sortOrder: 3 }
    ]
  },
  {
    title: '이용신청',
    to: '/pricing',
    items: [
      { label: '서비스요금', to: '/pricing', sortOrder: 1 },
      { label: '구독권안내', to: '/page/subscription-guide', sortOrder: 2 },
      { label: '프리미엄 이용', to: '/page/premium-apply', sortOrder: 3 }
    ]
  },
  {
    title: '위닝정보',
    to: '/company-news',
    items: [
      { label: '회사소식', to: '/company-news', sortOrder: 1 },
      { label: '공지사항', to: '/events', sortOrder: 2 },
      { label: '자주하는질문', to: '/faq', sortOrder: 3 },
      { label: '교육컬럼', to: '/gallery', sortOrder: 4 }
    ]
  }
];

const MENU_GROUP_ORDER = {
  서비스: 1,
  프리미엄: 2,
  입시정보: 3,
  이용신청: 4,
  위닝정보: 5,
  합격전략: 6,
  회사소개: 7
};

function resolveMenuLink(slug) {
  const value = cleanText(slug);

  if (!value) return '/';
  if (value.startsWith('http://') || value.startsWith('https://')) return value;
  if (value.startsWith('/')) return value;

  return `/page/${value}`;
}

function ensureFreeDiagnosisInService(groups) {
  const source = Array.isArray(groups) ? groups : [];

  return source.map((group) => {
    if (cleanText(group?.title) !== '서비스') {
      return group;
    }

    const items = Array.isArray(group.items) ? group.items : [];
    const withoutFreeDiagnosis = items.filter((item) => {
      const label = cleanText(item?.label).replace(/\s+/g, '');
      return label !== '무료진단' && cleanText(item?.to) !== '/free-diagnosis';
    });

    return {
      ...group,
      to: group.to || '/free-diagnosis',
      items: [{ label: '무료진단', to: '/free-diagnosis', sortOrder: 0 }, ...withoutFreeDiagnosis]
    };
  });
}

function readCachedNavGroups() {
  try {
    const raw = window.localStorage.getItem(HEADER_NAV_CACHE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed) || parsed.length === 0) {
      return null;
    }

    return ensureFreeDiagnosisInService(parsed);
  } catch {
    return null;
  }
}

function writeCachedNavGroups(groups) {
  try {
    if (!Array.isArray(groups) || groups.length === 0) {
      return;
    }

    window.localStorage.setItem(HEADER_NAV_CACHE_KEY, JSON.stringify(groups));
  } catch {
    // 메뉴 캐시 저장 실패는 무시
  }
}

function buildNavGroups(rows) {
  const grouped = new Map();

  (rows || []).forEach((item) => {
    const groupName = cleanText(item.menu_group) || '기타';
    const slug = cleanText(item.slug);

    if (!slug) return;

    const isCompanyIntro = slug === 'company-intro';
    const itemLink = isCompanyIntro ? '/company-news' : resolveMenuLink(slug);
    const savedGroupOrder = Number(item.menu_group_order);
    const groupOrder =
      Number.isFinite(savedGroupOrder) && savedGroupOrder > 0
        ? savedGroupOrder
        : MENU_GROUP_ORDER[groupName] || 99;

    const savedSortOrder = Number(item.sort_order);
    const sortOrder =
      Number.isFinite(savedSortOrder) && savedSortOrder > 0
        ? savedSortOrder
        : 99;

    if (!grouped.has(groupName)) {
      grouped.set(groupName, {
        title: groupName,
        groupOrder,
        to: itemLink,
        items: []
      });
    }

    const group = grouped.get(groupName);

    if (groupOrder < group.groupOrder) {
      group.groupOrder = groupOrder;
      group.to = itemLink;
    }

    group.items.push({
      label: isCompanyIntro
        ? '회사소식'
        : cleanText(item.menu_label) || cleanText(item.title) || groupName,
      to: itemLink,
      sortOrder
    });
  });

  const groups = Array.from(grouped.values())
    .sort((a, b) => a.groupOrder - b.groupOrder)
    .map((group) => {
      const sortedItems = group.items.sort((a, b) => a.sortOrder - b.sortOrder);

      return {
        title: group.title,
        to: sortedItems[0]?.to || group.to,
        items: sortedItems
      };
    });

  return ensureFreeDiagnosisInService(groups);
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
    return parsed && typeof parsed === 'object' ? parsed : null;
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
    // 캐시 저장 실패는 무시
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

function withTimeout(promise, ms, fallbackValue = null) {
  return Promise.race([
    promise,
    new Promise((resolve) => window.setTimeout(() => resolve(fallbackValue), ms))
  ]);
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
  const [activeMega, setActiveMega] = useState(null);
  const [myOpen, setMyOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const mobileNavTriggerRef = useRef(null);
  const [navGroups, setNavGroups] = useState(() => {
    return ensureFreeDiagnosisInService(readCachedNavGroups() || FALLBACK_NAV_GROUPS);
  });

  useEffect(() => {
    let alive = true;

    async function loadHeaderMenus() {
      const { data, error } = await supabase
        .from('page_contents')
        .select('menu_group, menu_group_order, menu_label, title, slug, sort_order, is_active')
        .eq('is_active', true)
        .order('menu_group_order', { ascending: true })
        .order('sort_order', { ascending: true });

      if (!alive) return;

      if (error) {
        console.error('헤더 메뉴 조회 실패:', error);
        return;
      }

      const nextGroups = buildNavGroups(data);

      if (nextGroups.length === 0) {
        return;
      }

      setNavGroups((prev) => {
        if (isSameObject(prev, nextGroups)) {
          return prev;
        }

        writeCachedNavGroups(nextGroups);
        return nextGroups;
      });
    }

    loadHeaderMenus();

    const channel = supabase
      .channel('header-page-contents')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'page_contents' },
        () => loadHeaderMenus()
      )
      .subscribe();

    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setCsatDDay(getCsatDay()), 60 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let alive = true;
    let seq = 0;

    async function syncSession(nextSession) {
      const currentSeq = ++seq;

      try {
        const sessionResult =
          nextSession !== undefined
            ? nextSession
            : await withTimeout(
              supabase.auth.getSession(),
              1200,
              { data: { session: null } }
            );

        if (!alive || currentSeq !== seq) return;

        const currentSession =
          nextSession !== undefined
            ? sessionResult
            : sessionResult?.data?.session || null;

        if (!currentSession?.user) {
          setSession(null);
          setProfile(null);
          writeCachedProfile(null);
          setIsAuthReady(true);
          return;
        }

        const cachedProfile = readCachedProfile();
        let nextProfile = null;

        if (isSameUserProfile(cachedProfile, currentSession.user)) {
          nextProfile = cachedProfile;
        }

        const fetchedProfile = await withTimeout(
          fetchProfile(currentSession.user),
          1800,
          null
        );

        if (!alive || currentSeq !== seq) return;

        if (fetchedProfile && isSameUserProfile(fetchedProfile, currentSession.user)) {
          nextProfile = fetchedProfile;
          writeCachedProfile(fetchedProfile);
        }

        setSession((prev) => {
          if (prev?.user?.id === currentSession?.user?.id) {
            return prev;
          }

          return currentSession;
        });

        setProfile((prev) => {
          if (isSameObject(prev, nextProfile)) {
            return prev;
          }

          return nextProfile;
        });

        setIsAuthReady(true);
      } catch (error) {
        console.error('헤더 세션 동기화 오류:', error);

        if (!alive || currentSeq !== seq) return;

        setSession(null);
        setProfile(null);
        setIsAuthReady(true);
      }
    }

    syncSession();

    const handleProfileUpdated = () => {
      syncSession();
    };

    window.addEventListener('winning-profile-updated', handleProfileUpdated);

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      syncSession(nextSession || null);
    });

    return () => {
      alive = false;
      window.removeEventListener('winning-profile-updated', handleProfileUpdated);
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

  const isLoggedIn = isAuthReady && !!session?.user;
  const hasProfile = !!profile && !!cleanText(profile?.name);
  const shouldShowLoggedInHeader = isLoggedIn && hasProfile;
  const displayName = cleanText(profile?.name) || '';
  const memberLabel = getMemberLabel(profile);
  const isAdmin = cleanText(profile?.role).toLowerCase() === 'admin';

  return (
    <header className="fixed left-0 top-0 z-50 w-full border-b border-black/5 bg-white">
      <div className="mx-auto flex h-[4.25rem] max-w-content items-center justify-between px-8">
        <div className="flex min-w-0 items-center gap-6">
          <Link to="/" className="flex shrink-0 items-center">
            <img
              src="/images/winning-logo.png"
              alt="위닝에듀"
              className="h-[2rem] w-auto object-contain"
            />
          </Link>

          {/* 헤더 컨테이너가 max-w-content(1200px)로 고정돼 내부 폭이 1136px로 줄었다. nav 5그룹 + 우측 로그인 그룹이 한 줄에 들어가도록
              nav 아이템 px-2/text-sm, 우측 버튼 px-4/py-2/text-sm(py는 px의 절반), D-day 배지 컨테이너 px-3/py-1.5/text-sm/gap-1/이름 max-w-5rem,
              우측 그룹 gap-1.5로 축소했다. 로그인/비로그인 양쪽 상태에서 nav·우측 버튼 폰트를 text-sm으로 통일했다.
              좌측(로고-nav)·nav 자체 gap은 gap-5(게스트)/gap-0(로그인)이다.
              로그인(관리자 포함) 상태에서는 우측 그룹 폭이 커서 nav도 gap-0으로 더 좁힌다.
              헤더 두께는 4.25rem(68px)로 축소됐다.
              데스크톱 인라인 nav 전환 시점(tailwind desktop: 브레이크포인트)은 max-w-content와 동일한 1200px로,
              컨텐츠 제한 폭 도달 시점과 햄버거 전환 시점을 일치시켰다 */}
          <nav className={`hidden items-center desktop:flex ${isLoggedIn ? 'gap-0' : 'gap-5'}`}>
            {navGroups.map((group) => {
              const hasDropdown = Array.isArray(group.items) && group.items.length > 0;

              return (
                <div
                  key={group.title}
                  className="relative flex shrink-0 items-center"
                  onMouseEnter={() => hasDropdown && setActiveMega(group.title)}
                  onMouseLeave={() => hasDropdown && setActiveMega(null)}
                >
                  <Link
                    to={group.to}
                    onClick={() => setActiveMega(null)}
                    className={`flex items-center gap-1 whitespace-nowrap px-2 py-4 text-sm font-medium leading-none tracking-[-0.025em] transition ${activeMega === group.title ? 'text-[#013262]' : 'text-[#4d4d4d] hover:text-[#013262]'
                      }`}
                  >
                    {group.title}
                    {hasDropdown && (
                      <ChevronDown
                        size={14}
                        strokeWidth={2.2}
                        className={`transition ${activeMega === group.title ? 'rotate-180' : ''}`}
                      />
                    )}
                  </Link>

                  {hasDropdown && activeMega === group.title && (
                    <div className="absolute left-1/2 top-full z-50 w-[14rem] -translate-x-1/2">
                      <div className="overflow-hidden rounded-lg border border-[#d7d7d7] bg-white shadow-[0_18px_45px_rgba(13,27,42,0.14)]">
                        {group.items.map((item) => (
                          <Link
                            key={`${group.title}-${item.to}-${item.label}`}
                            to={item.to}
                            onClick={() => setActiveMega(null)}
                            className="block whitespace-nowrap border-b border-[#eeeeee] px-6 py-4 text-center text-sm font-medium text-[#4d4d4d] transition last:border-b-0 hover:bg-[#f5f8fb] hover:text-[#013262]"
                          >
                            {item.label}
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
        </div>

        <button
          ref={mobileNavTriggerRef}
          type="button"
          onClick={() => setMobileNavOpen(true)}
          aria-expanded={mobileNavOpen}
          aria-controls="mobile-nav-drawer"
          aria-label="전체 메뉴 열기"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[#d7d7d7] bg-white text-[#1e293b] transition hover:border-[#013262] hover:text-[#013262] desktop:hidden"
        >
          <Menu size={22} />
        </button>

        <div className="hidden shrink-0 flex-nowrap items-center justify-end gap-1.5 whitespace-nowrap desktop:flex">
          {!isAuthReady ? (
            <div className="h-[2rem] w-[16rem]" aria-hidden="true" />
          ) : shouldShowLoggedInHeader ? (
            <>
              <div className="flex shrink-0 items-center gap-1 rounded-lg border border-[#d7d7d7] bg-[#f9fafb] px-3 py-1.5 text-sm font-medium text-[#1e293b] whitespace-nowrap">
                <span className="rounded bg-[#013262] px-2 py-1 text-xs text-white">
                  {csatDDay}
                </span>
                <span className="inline-block max-w-[5rem] truncate">
                  {displayName}님{memberLabel ? ` ${memberLabel}` : ''}
                </span>
              </div>

              <div
                className="relative flex items-center"
                onMouseEnter={() => setMyOpen(true)}
                onMouseLeave={() => setMyOpen(false)}
              >
                <button
                  type="button"
                  onClick={() => setMyOpen((prev) => !prev)}
                  className="inline-flex shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-lg border border-[#d7d7d7] bg-white px-4 py-2 text-sm font-medium leading-5 text-[#1e293b] transition hover:border-[#013262] hover:text-[#013262]"
                >
                  마이페이지
                  <ChevronDown size={14} className={`transition ${myOpen ? 'rotate-180' : ''}`} />
                </button>

                {myOpen && (
                  <div className="absolute right-0 top-full z-50 w-[16rem]">
                    <div className="overflow-hidden rounded-lg border border-[#d7d7d7] bg-white shadow-[0_18px_45px_rgba(13,27,42,0.14)]">
                      {MY_MENU.map((item) => {
                        const Icon = item.icon;

                        return (
                          <Link
                            key={item.label}
                            to={item.to}
                            onClick={() => setMyOpen(false)}
                            className="flex items-center gap-3 whitespace-nowrap border-b border-[#eeeeee] px-5 py-4 text-sm font-medium text-[#4d4d4d] transition last:border-b-0 hover:bg-[#f5f8fb] hover:text-[#013262]"
                          >
                            <Icon size={18} />
                            {item.label}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {isAdmin && (
                <Link
                  to="/admin"
                  className="inline-flex shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-lg border border-[#d7d7d7] bg-white px-4 py-2 text-sm font-medium leading-5 text-[#1e293b] transition hover:border-[#013262] hover:text-[#013262]"
                >
                  <Settings size={14} />
                  관리자
                </Link>
              )}

              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-lg bg-[#013262] px-4 py-2 text-sm font-medium leading-5 text-[#f5f5f5] transition hover:bg-[#012347]"
              >
                <LogOut size={14} />
                로그아웃
              </button>
            </>
          ) : isLoggedIn ? (
            <>
              <div
                className="relative flex items-center"
                onMouseEnter={() => setMyOpen(true)}
                onMouseLeave={() => setMyOpen(false)}
              >
                <button
                  type="button"
                  onClick={() => setMyOpen((prev) => !prev)}
                  className="inline-flex shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-lg border border-[#d7d7d7] bg-white px-4 py-2 text-sm font-medium leading-5 text-[#1e293b] transition hover:border-[#013262] hover:text-[#013262]"
                >
                  마이페이지
                  <ChevronDown size={14} className={`transition ${myOpen ? 'rotate-180' : ''}`} />
                </button>

                {myOpen && (
                  <div className="absolute right-0 top-full z-50 w-[16rem]">
                    <div className="overflow-hidden rounded-lg border border-[#d7d7d7] bg-white shadow-[0_18px_45px_rgba(13,27,42,0.14)]">
                      {MY_MENU.map((item) => {
                        const Icon = item.icon;

                        return (
                          <Link
                            key={item.label}
                            to={item.to}
                            onClick={() => setMyOpen(false)}
                            className="flex items-center gap-3 whitespace-nowrap border-b border-[#eeeeee] px-5 py-4 text-sm font-medium text-[#4d4d4d] transition last:border-b-0 hover:bg-[#f5f8fb] hover:text-[#013262]"
                          >
                            <Icon size={18} />
                            {item.label}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-lg border border-[#d7d7d7] bg-white px-4 py-2 text-sm font-medium leading-5 text-[#1e293b] transition hover:border-[#013262] hover:text-[#013262]"
              >
                로그아웃
              </button>
            </>
          ) : (
            <>
              <Link
                to="/login"
                className="inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-lg border border-[#d7d7d7] bg-white px-4 py-2 text-sm font-medium leading-5 text-[#1e293b] transition hover:border-[#013262] hover:text-[#013262]"
              >
                로그인
              </Link>

              <Link
                to="/signup"
                className="inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-lg bg-[#013262] px-4 py-2 text-sm font-medium leading-5 text-[#f5f5f5] transition hover:bg-[#012347]"
              >
                회원가입
              </Link>
            </>
          )}
        </div>
      </div>

      <MobileNavDrawer
        open={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
        navGroups={navGroups}
        shouldShowLoggedInHeader={shouldShowLoggedInHeader}
        isLoggedIn={isLoggedIn}
        displayName={displayName}
        memberLabel={memberLabel}
        csatDDay={csatDDay}
        isAdmin={isAdmin}
        onLogout={handleLogout}
        triggerRef={mobileNavTriggerRef}
      />
    </header>
  );
}
