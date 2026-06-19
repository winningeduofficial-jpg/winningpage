import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ChevronDown,
  LogOut,
  Settings,
  UserRound,
  CreditCard,
  RotateCcw
} from 'lucide-react';
import { supabase } from '../lib/supabase';

const CSAT_DATE = '2026-11-19';
const HEADER_PROFILE_CACHE_KEY = 'winning-header-profile';
const HEADER_NAV_CACHE_KEY = 'winning-header-nav-groups-events-notice-v1';

const FALLBACK_NAV_GROUPS = [
  {
    title: '서비스',
    to: '/page/services-goal',
    items: [
      { label: '목표관리서비스', to: '/page/services-goal' },
      { label: 'AI 수행평가 서비스', to: '/page/services-ai-performance' },
      { label: '세특코치서비스', to: '/page/services-record-coach' },
      { label: '수시키드', to: '/page/services-susi-card' },
      { label: '약점관리서비스', to: '/page/services-weakness' },
      { label: '특화멘토링', to: '/page/services-mentoring' }
    ]
  },
  {
    title: '합격전략',
    to: '/page/strategy-success',
    items: [
      { label: '성공사례', to: '/page/strategy-success' },
      { label: '교육부시운영지침', to: '/page/strategy-guide' },
      { label: '관리시스템이란', to: '/page/strategy-system' }
    ]
  },
  {
  title: '입시정보',
  to: '/admission/susi',
  items: [
    { label: '수시정보', to: '/admission/susi' },
    { label: '정시정보', to: '/admission/jungsi' },
    { label: '논술정보', to: '/admission/essay' }
  ]
},
  {
    title: '회사소개',
    to: '/page/company-history',
    items: [
      { label: '회사연혁', to: '/page/company-history' },
      { label: '조직소개', to: '/page/company-team' },
      { label: '포트폴리오', to: '/page/company-portfolio' }
    ]
  },
  {
  title: '위닝정보',
  to: '/events',
  items: [
    { label: '공지사항', to: '/events' },
    { label: '이용후기', to: '/reviews' },
    { label: '자주하는 질문', to: '/faq' }
  ]
}
];

const MENU_GROUP_ORDER = {
  서비스: 1,
  합격전략: 2,
  입시정보: 3,
  회사소개: 4,
  위닝정보: 5
};

const MY_MENU = [
  { label: '내정보·자녀수정', to: '/mypage', icon: UserRound },
  { label: '수강신청·결제', to: '/pricing', icon: CreditCard },
  { label: '환불신청', to: '/mypage#refund', icon: RotateCcw }
];

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

function readCachedNavGroups() {
  try {
    const raw = window.localStorage.getItem(HEADER_NAV_CACHE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed) || parsed.length === 0) {
      return null;
    }

    return parsed;
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

function buildNavGroups(rows) {
  const grouped = new Map();

  (rows || []).forEach((item) => {
    const groupName = cleanText(item.menu_group) || '기타';
    const slug = cleanText(item.slug);

    if (!slug) return;

    const itemLink = `/page/${slug}`;

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
      label: cleanText(item.menu_label) || cleanText(item.title) || groupName,
      to: itemLink,
      sortOrder
    });
  });

  const groups = Array.from(grouped.values())
  .sort((a, b) => a.groupOrder - b.groupOrder)
  .map((group) => ({
    title: group.title,
    to: group.items[0]?.to || group.to,
    items: group.items.sort((a, b) => a.sortOrder - b.sortOrder)
  }));

  const admissionGroup = groups.find((group) => group.title === '입시정보');

if (admissionGroup) {
  admissionGroup.to = '/admission/susi';
  admissionGroup.items = [
    { label: '수시정보', to: '/admission/susi', sortOrder: 1 },
    { label: '정시정보', to: '/admission/jungsi', sortOrder: 2 },
    { label: '논술정보', to: '/admission/essay', sortOrder: 3 }
  ];
} else {
  groups.splice(2, 0, {
    title: '입시정보',
    to: '/admission/susi',
    items: [
      { label: '수시정보', to: '/admission/susi', sortOrder: 1 },
      { label: '정시정보', to: '/admission/jungsi', sortOrder: 2 },
      { label: '논술정보', to: '/admission/essay', sortOrder: 3 }
    ]
  });
}

const winningGroup = groups.find((group) => group.title === '위닝정보');

if (winningGroup) {
  const withoutBoardItems = winningGroup.items.filter(
    (item) =>
      item.label !== '공지사항' &&
      item.label !== '이용후기' &&
      item.label !== '자주하는 질문'
  );

  winningGroup.items = [
    { label: '공지사항', to: '/events', sortOrder: 1 },
    { label: '이용후기', to: '/reviews', sortOrder: 2 },
    { label: '자주하는 질문', to: '/faq', sortOrder: 3 },
    ...withoutBoardItems
  ];

  winningGroup.to = '/events';
} else {
  groups.push({
    title: '위닝정보',
    to: '/events',
    items: [
      { label: '공지사항', to: '/events', sortOrder: 1 },
      { label: '이용후기', to: '/reviews', sortOrder: 2 },
      { label: '자주하는 질문', to: '/faq', sortOrder: 3 }
    ]
  });
}

return groups;
}

export default function Header() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(() => readCachedProfile());
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [csatDDay, setCsatDDay] = useState(getCsatDay());
  const [activeMega, setActiveMega] = useState(null);
  const [myOpen, setMyOpen] = useState(false);
  const [navGroups, setNavGroups] = useState(() => {
    return readCachedNavGroups() || FALLBACK_NAV_GROUPS;
  });

  useEffect(() => {
    const timer = window.setInterval(() => setCsatDDay(getCsatDay()), 60 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

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
    <header className="fixed left-0 top-0 z-50 w-full border-b border-[#0D1B2A]/10 bg-white shadow-[0_8px_28px_rgba(13,27,42,0.08)] will-change-transform">
      <div className="mx-auto grid h-[84px] max-w-[1500px] grid-cols-[190px_minmax(460px,1fr)_560px] items-center px-8">
        <Link
          to="/"
          className="flex h-[84px] w-[190px] shrink-0 items-center justify-self-start"
        >
          <img
            src="/images/winning-logo.png"
            alt="위닝에듀"
            width="190"
            height="66"
            className="block h-[66px] w-[190px] object-contain"
          />
        </Link>

        <nav className="hidden min-w-0 items-center justify-center gap-8 justify-self-center whitespace-nowrap text-[15px] font-black leading-none text-[#0D1B2A] md:flex">
          {navGroups.map((group) => (
            <div
              key={group.title}
              className="relative flex h-[84px] items-center"
              onMouseEnter={() => setActiveMega(group.title)}
              onMouseLeave={() => setActiveMega(null)}
            >
              <Link
                to={group.to}
                className={`relative inline-flex h-[84px] items-center gap-1 transition ${
                  activeMega === group.title ? 'text-[#B88737]' : 'hover:text-[#B88737]'
                }`}
              >
                {group.title}
                <ChevronDown
                  size={15}
                  strokeWidth={2.7}
                  className={`transition ${activeMega === group.title ? 'rotate-180' : ''}`}
                />

                {activeMega === group.title && (
                  <span className="absolute bottom-0 left-1/2 h-[3px] w-10 -translate-x-1/2 rounded-full bg-[#B88737]" />
                )}
              </Link>

              {activeMega === group.title && (
                <div className="absolute left-1/2 top-full z-50 w-[230px] -translate-x-1/2">
                  <div className="overflow-hidden border border-t-0 border-[#E5E0D6] bg-white shadow-[0_18px_45px_rgba(13,27,42,0.14)]">
                    {group.items.map((item) => (
                      <Link
                        key={item.to}
                        to={item.to}
                        onClick={() => setActiveMega(null)}
                        className="block border-b border-[#EEE8DA] px-6 py-5 text-center text-[16px] font-black tracking-[-0.04em] text-[#0D1B2A] transition last:border-b-0 hover:bg-[#FFF8E8] hover:text-[#B88737]"
                      >
                        {item.label}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </nav>

        <div className="flex h-[84px] w-[560px] shrink-0 flex-nowrap items-center justify-end gap-3 justify-self-end whitespace-nowrap">
          {!isAuthReady ? (
            <div className="h-10 w-[260px]" aria-hidden="true" />
          ) : shouldShowLoggedInHeader ? (
            <>
              <div className="hidden shrink-0 items-center gap-2 rounded-xl border border-[#0D1B2A]/10 bg-[#F8F7F3] px-4 py-2 text-sm font-black text-[#0D1B2A] whitespace-nowrap lg:flex">
                <span className="rounded-lg bg-[#0D1B2A] px-2.5 py-1 text-xs text-white">
                  {csatDDay}
                </span>
                <span className="whitespace-nowrap">
  {displayName}님{memberLabel ? ` ${memberLabel}` : ''}
</span>
              </div>

              <div
                className="relative flex h-[84px] items-center"
                onMouseEnter={() => setMyOpen(true)}
                onMouseLeave={() => setMyOpen(false)}
              >
                <button
                  type="button"
                  onClick={() => setMyOpen((prev) => !prev)}
                  className="inline-flex h-10 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-xl border border-[#0D1B2A]/25 bg-white px-5 text-sm font-black leading-5 text-[#0D1B2A] transition hover:border-[#B88737] hover:bg-[#FFF8E8] hover:text-[#B88737]"
                >
                  마이페이지
                  <ChevronDown size={15} className={`transition ${myOpen ? 'rotate-180' : ''}`} />
                </button>

                {myOpen && (
                  <div className="absolute right-0 top-full z-50 w-[260px]">
                    <div className="overflow-hidden border border-t-0 border-[#E5E0D6] bg-white shadow-[0_18px_45px_rgba(13,27,42,0.14)]">
                      {MY_MENU.map((item) => {
                        const Icon = item.icon;

                        return (
                          <Link
                            key={item.label}
                            to={item.to}
                            onClick={() => setMyOpen(false)}
                            className="flex items-center gap-3 border-b border-[#EEE8DA] px-5 py-5 text-sm font-black text-[#0D1B2A] transition last:border-b-0 hover:bg-[#FFF8E8] hover:text-[#B88737]"
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
                  className="inline-flex h-10 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-xl border border-[#0D1B2A]/25 bg-white px-5 text-sm font-black leading-5 text-[#0D1B2A] transition hover:border-[#B88737] hover:bg-[#FFF8E8] hover:text-[#B88737]"
                >
                  <Settings size={16} />
                  관리자
                </Link>
              )}

              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex h-10 items-center justify-center gap-1 rounded-xl border border-[#0D1B2A] bg-[#0D1B2A] px-6 text-sm font-black leading-5 text-white shadow-[0_10px_26px_rgba(13,27,42,0.22)] transition hover:bg-[#162A40]"
              >
                <LogOut size={16} />
                로그아웃
              </button>
            </>
          ) : isLoggedIn ? (
            <>
              <div
                className="relative flex h-[84px] items-center"
                onMouseEnter={() => setMyOpen(true)}
                onMouseLeave={() => setMyOpen(false)}
              >
                <button
                  type="button"
                  onClick={() => setMyOpen((prev) => !prev)}
                  className="inline-flex h-10 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-xl border border-[#0D1B2A]/25 bg-white px-5 text-sm font-black leading-5 text-[#0D1B2A] transition hover:border-[#B88737] hover:bg-[#FFF8E8] hover:text-[#B88737]"
                >
                  마이페이지
                  <ChevronDown size={15} className={`transition ${myOpen ? 'rotate-180' : ''}`} />
                </button>

                {myOpen && (
                  <div className="absolute right-0 top-full z-50 w-[260px]">
                    <div className="overflow-hidden border border-t-0 border-[#E5E0D6] bg-white shadow-[0_18px_45px_rgba(13,27,42,0.14)]">
                      {MY_MENU.map((item) => {
                        const Icon = item.icon;

                        return (
                          <Link
                            key={item.label}
                            to={item.to}
                            onClick={() => setMyOpen(false)}
                            className="flex items-center gap-3 border-b border-[#EEE8DA] px-5 py-5 text-sm font-black text-[#0D1B2A] transition last:border-b-0 hover:bg-[#FFF8E8] hover:text-[#B88737]"
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
                className="inline-flex h-10 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-xl border border-[#0D1B2A]/25 bg-white px-5 text-sm font-black leading-5 text-[#0D1B2A] transition hover:border-[#B88737] hover:bg-[#FFF8E8] hover:text-[#B88737]"
              >
                로그아웃
              </button>
            </>
          ) : (
            <>
              <Link
                to="/login"
                className="inline-flex h-10 items-center justify-center rounded-xl border border-[#0D1B2A]/25 bg-white px-6 text-sm font-black leading-5 text-[#0D1B2A] transition hover:border-[#B88737] hover:bg-[#FFF8E8] hover:text-[#B88737]"
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
