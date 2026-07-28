import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, LogOut, Menu, Settings } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { MY_MENU } from './myMenuItems';
import MobileNavDrawer from './MobileNavDrawer';

const CSAT_DATE = '2026-11-19';
const HEADER_PROFILE_CACHE_KEY = 'winning-header-profile';
const HEADER_NAV_CACHE_KEY = 'winning-header-nav-groups-dynamic-v4';

// ---- 헤더 2중 좌표계 정렬 상수 (Playwright 실측 기준) ----
// 좌표계 1 (로고 + 계정 그룹): max-w-[120rem](1920px) 밴드, px-8(2rem) 패딩.
//   랜딩 마퀴 밴드(max-w-[120rem])와 동일 기준 — 로고는 밴드 좌측 끝, 계정 그룹은 밴드 우측 끝.
// 좌표계 2 (nav 5개 + 메가 컬럼): max-w-content(75rem/1200px) 컨텐츠 영역, px-8(2rem) 패딩.
//   nav 기준점은 로고가 아니라 "컨텐츠 영역 시작"(뷰포트 중앙정렬 기준)이며, 좌표계 1과 완전히 독립이다.
// LOGO_W: 세로형 로고(SVG, h-2.5rem 고정, viewBox 96:52) 실렌더 폭 실측 4.615rem(73.84px)
//   → 프리헤더(index.html .pre-logo, 74px)와 동일하게 4.625rem(74px) 고정 슬롯으로 반올림.
// NAV_GUARD (좁은 데스크톱 충돌 가드, A안 — 로고용, 유지):
//   marginLeft: max(0px, calc(6.625rem − (100vw − 75rem) / 2))
//   6.625rem = 밴드 패딩(px-8=2rem) + LOGO_W(4.625rem) = 로고 우측 끝까지의 안전영역.
//   원래 100vw < 88.25rem(1412px) 구간에서 로고와의 충돌을 막던 값인데, desktop 브레이크포인트가
//   93rem(1488px)으로 올라가면서 데스크톱 인라인 nav가 노출되는 범위(100vw ≥ 93rem)는 항상
//   1412px 조건을 만족해(93rem > 88.25rem) 이 가드는 데스크톱 상태에서 상시 0으로 평가된다.
//   즉 로고 충돌 가드는 현재 실질적으로 비활성(그 미만은 desktop:hidden으로 nav 자체가 없음) —
//   그래도 향후 breakpoint를 다시 낮추는 변경에 대비한 안전망으로 제거하지 않고 유지한다.
// NAV_GAP (겹침 해결 확정안 — 유동 gap):
//   clamp(1rem, calc(1rem + (100vw - 93rem) / 8), 2.5rem)
//   100vw ≤ 93rem(1488px)에서 1rem(16px, 하한) — desktop 브레이크포인트(93rem) 바로 아래에서
//   최소 gap에 도달하도록 맞춘 값. 100vw ≥ 105rem(1680px)에서 2.5rem(40px, 상한, 피그마 시안 값).
//   그 사이(1488~1680px)는 선형 보간. nav row와 메가 컬럼 grid 양쪽 모두 이 식을 그대로
//   참조해(동일 상수) 유동 상태에서도 nav-컬럼 x 정렬이 유지된다.
// 표준 상태(로그인/관리자, 배지+마이페이지+관리자+로그아웃) 우측 그룹 실측폭
//   (devadmin@gmail.com, D-day 3자리 + 이름 max-w-5rem truncate 상한 기준) = 31.176rem(498.8125px).
// nav 5칸 폭(최솟값, gap=1rem) = NAV_ITEM_W 8.75rem×5 + 1rem×4 = 43.75+4 = 47.75rem(764px).
// nav 5칸 폭(최댓값, gap=2.5rem) = 43.75+10 = 53.75rem(860px) < max-w-content 내부 폭(71rem/1136px).
//   좌표계가 분리되어 있어(계정 그룹은 1920 밴드, nav는 1200 컨텐츠 영역) 폭 예산 자체는 서로
//   침범하지 않지만, 두 좌표계가 화면상 인접해 보일 수 있어(특히 로그인/관리자 상태) desktop
//   브레이크포인트(93rem)를 "최소 gap(764px 폭)으로도 로그인 헤더가 안 들어가는 지점"에 맞춰
//   93rem 미만에서는 아예 모바일 드로어로 전환시켜 겹침 자체가 발생하지 않게 했다(Playwright
//   실측으로 nav-계정 그룹 간격이 desktop 범위 전역에서 양수인지 확인 필요).
// 메가 컬럼 폭(NAV_ITEM_W=8.75rem)도 nav 아이템 폭과 동일해 서브아이템 라벨 중
// 긴 것(예: "해외명문대 진학컨설팅")이 넓어진 컬럼 폭 안에서 줄바꿈 없이 한 줄에 들어간다.
const LOGO_W = '4.625rem';
const NAV_GUARD = 'max(0px, calc(6.625rem - (100vw - 75rem) / 2))';
const NAV_ITEM_W = '8.75rem';
const NAV_GAP = 'clamp(1rem, calc(1rem + (100vw - 93rem) / 8), 2.5rem)';
// 프로모 카드 폭: Figma 1483:926 실측 460×478 → 컴팩트 스케일 0.8 적용 = 368px = 23rem.
// (get_design_context 1483:926 실값 기준으로 재확인 완료 — 패딩 p-[32px], 요소간 gap-[32px],
// radius-[24px], 타이틀 26px Bold, 서브 18px Medium, 일러 컨테이너 188px, 버튼 68px 도 모두
// 동일 0.8 스케일로 환산해 아래 카드 JSX에 반영했다.)
const MEGA_PROMO_W = '23rem';
// 메가 컬럼 우측 끝(뷰포트 절대 x): 데스크톱 노출 구간(100vw ≥ 93rem)에서는 NAV_GUARD가 항상
// 0으로 평가되므로(위 NAV_GUARD 주석 참고), 컬럼 블록 우측 끝 = 컨텐츠 영역 시작
// (50vw - 35.5rem, = (100vw-75rem)/2 + px-8 2rem) + nav 5칸 총 폭(43.75rem + 4×NAV_GAP).
// Playwright 실측으로 5개 뷰포트(1490/1600/1920/2560)에서 이 식과 실제 lastColumn.right가
// 오차 0으로 일치함을 확인했다(회색 존 좌측 시작점 산정에 사용).
const NAV_BLOCK_RIGHT_EDGE =
  'calc(50vw + 8.25rem + clamp(4rem, calc(4rem + (100vw - 93rem) / 2), 10rem))';
// 회색 존(#F9FAFB — Figma 1483:846 get_design_context 실값으로 확인 완료, 기존 #F7F7F7 추정치 폐기) 좌측 시작 x:
// "컬럼 영역 끝 ~ 1920 밴드 우측 끝 풀 높이"로, 기존 고정폭(20.25rem) 스트립을 폐기하고
// NAV_BLOCK_RIGHT_EDGE(뷰포트 절대 x)를 1920 밴드 래퍼의 자체 좌표(래퍼 padding-box 좌측 끝
// 기준)로 환산한 값 — 래퍼 좌측 끝(뷰포트 절대 x) = max(0px, (100vw-120rem)/2)이므로 그만큼을 뺀다.
// 시안 실측: 분할선 x=1281, 마지막 컬럼 끝(1208) 사이에 73px 흰 여백이 존재 — 컬럼 끝에 존이
// 밀착하던 기존 구현을 폐기하고 0.8 스케일 환산한 3.5rem(≈58px) 오프셋을 더해 존 시작점을 우측으로 민다.
const MEGA_ZONE_LEFT = `calc(${NAV_BLOCK_RIGHT_EDGE} + 3.5rem - max(0px, calc((100vw - 120rem) / 2)))`;

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
    title: '고객안내',
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
  고객안내: 5,
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

  const activeMegaGroup = navGroups.find((group) => group.title === activeMega);

  return (
    <header
      className="fixed left-0 top-0 z-50 w-full border-b border-black/5 bg-white"
      onMouseLeave={() => setActiveMega(null)}
    >
      {/* 좌표계 1(1920 밴드): 로고(좌측 끝) + 계정 그룹(우측 끝). 랜딩 마퀴 밴드(max-w-[120rem])와
          동일 기준의 px-8 패딩으로 로고/계정 그룹을 뷰포트 1920 캡 좌우 끝에 고정한다.
          nav는 이 flex 라인에 속하지 않는다(좌표계 2, 아래 별도 overlay). */}
      <div className="mx-auto flex h-[4.25rem] max-w-[120rem] items-center justify-between px-8">
        <Link
          to="/"
          className="flex shrink-0 items-center"
          style={{ width: LOGO_W }}
          onClick={() => setActiveMega(null)}
        >
          <img
            src="/images/winning-logo-stacked.svg"
            alt="위닝에듀"
            className="h-[2.5rem] w-auto object-contain"
          />
        </Link>

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

      {/* 좌표계 2(1200 컨텐츠 영역): nav 5개. header가 position:fixed라 이 nav의 containing
          block이 되므로 별도 wrapper 없이 absolute로 좌표계 1(로고/계정 그룹) 위에 겹쳐 그린다.
          바깥 두 겹(overlay, mx-auto 컨테이너)은 pointer-events-none이라 로고/계정 그룹 클릭을
          가리지 않고, 실제 nav 아이템을 감싸는 안쪽 div만 pointer-events-auto로 되살린다.
          상태 불변 nav 그리드: nav 아이템은 로그인/비로그인 상태와 무관하게 항상
          NAV_ITEM_W(고정폭) + NAV_GAP(고정 간격)만 사용한다(과거 게스트 gap-5/로그인 gap-0
          토글로 인해 상태별 x 좌표가 달라지던 문제 제거) — 좌표계가 계정 그룹과 완전히
          분리돼 있어 이제는 이 원칙이 자연히 충족된다.
          nav 텍스트는 아이템 박스 좌측에 고정(px 없음)해 메가 컬럼 타이틀과 동일 x좌표를 공유한다.
          데스크톱 인라인 nav 전환 시점(desktop: 브레이크포인트)은 max-w-content와 동일한 1200px. */}
      <nav className="pointer-events-none absolute inset-x-0 top-0 hidden h-[4.25rem] desktop:block">
        <div className="pointer-events-none mx-auto flex h-full w-full max-w-content items-center px-8">
          <div
            className="pointer-events-auto flex items-center"
            style={{ gap: NAV_GAP, marginLeft: NAV_GUARD }}
          >
            {navGroups.map((group) => {
              const hasDropdown = Array.isArray(group.items) && group.items.length > 0;

              return (
                <div
                  key={group.title}
                  className="relative flex shrink-0 items-center"
                  style={{ width: NAV_ITEM_W }}
                  onMouseEnter={() => hasDropdown && setActiveMega(group.title)}
                >
                  <Link
                    to={group.to}
                    onClick={() => setActiveMega(null)}
                    className={`whitespace-nowrap py-4 text-xl font-medium leading-none tracking-[-0.025em] transition ${activeMega === group.title ? 'text-[#013262]' : 'text-[#4d4d4d] hover:text-[#013262]'
                      }`}
                  >
                    {group.title}
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      </nav>

      {activeMegaGroup && (
        <>
          {/* 헤더+메가패널 아래 전체를 어둡게 dim 처리. 패널(z-50, 불투명)이 위에 그려져
              패널이 차지하는 영역만 자연히 dim이 가려지므로 패널 높이를 따로 측정할 필요가 없다. */}
          <div
            className="fixed inset-x-0 top-[4.25rem] bottom-0 z-40 hidden bg-black/30 desktop:block"
            onClick={() => setActiveMega(null)}
            aria-hidden="true"
          />

          <div className="fixed left-0 top-[4.25rem] z-50 hidden w-full border-b border-black/5 bg-white shadow-[0_18px_45px_rgba(13,27,42,0.14)] desktop:block">
            {/* 패널도 헤더와 동일한 2중 좌표계: 컬럼(좌표계 2, 1200 컨텐츠)과 프로모 카드(좌표계 1,
                1920 밴드 — 헤더 계정 그룹과 같은 축)를 같은 grid cell(col-start-1 row-start-1)에
                겹쳐 그린다. absolute 오버레이 대신 grid 겹침을 쓴 이유: 두 레이어 중 더 큰 쪽이
                패널의 자연 높이(hug)를 그대로 결정하게 하기 위함(absolute는 문서 흐름에서 빠져
                높이에 기여하지 못한다). */}
            <div className="grid">
              {/* 좌표계 2(1200 컨텐츠 영역): 메가 컬럼. nav와 동일한 mx-auto max-w-content px-8 +
                  marginLeft(NAV_GUARD)로 컬럼 0의 시작 x를 nav 아이템 0의 시작 x와 맞춘다(이
                  정렬은 아래 회색 존/카드 폴리시 변경과 무관하게 그대로 유지). 컬럼 폭이
                  8.75rem(140px, 시안 132px과 거의 1:1)으로 넓어지면서 "해외명문대 진학컨설팅" 등
                  이전에 자동 줄바꿈되던 긴 서브아이템 라벨도 한 줄에 들어간다.
                  타이포 위계: Figma 1483:882 get_design_context 실값으로 확인 — 컬럼은 컬럼 폭(140px)이
                  이미 시안(132px)과 거의 1:1이라 0.8 컴팩트 스케일을 적용하지 않고 실측값을 그대로 쓴다.
                  타이틀 18px/#7a7a7a, 아이템 14px/#525252, 폰트 굵기는 둘 다 Pretendard Medium(전체
                  서브트리에 상속) — 기존 구현의 title font-semibold/#4d4d4d는 추정치 오류였다.
                  타이틀→아이템 간격은 실측 gap-[20px]=1.25rem(기존 추정 40/2rem 아님), 아이템 행간은
                  실측 gap-[12px]=0.75rem(gap-3, 변경 없음), 행 line-height는 실측 20px=leading-5로
                  타이틀/아이템 모두 통일. */}
              <div className="col-start-1 row-start-1 mx-auto w-full max-w-content px-8 py-6">
                <div
                  className="grid"
                  style={{
                    marginLeft: NAV_GUARD,
                    gridTemplateColumns: `repeat(5, ${NAV_ITEM_W})`,
                    columnGap: NAV_GAP
                  }}
                >
                  {navGroups.map((group) => (
                    <div key={`mega-col-${group.title}`} className="flex flex-col gap-5">
                      <p className="text-lg font-medium leading-5 text-[#7a7a7a]">{group.title}</p>
                      <div className="flex flex-col gap-3">
                        {group.items.map((item) => (
                          <Link
                            key={`mega-${group.title}-${item.to}-${item.label}`}
                            to={item.to}
                            onClick={() => setActiveMega(null)}
                            className="break-keep text-sm font-medium leading-5 text-[#525252] transition hover:text-[#013262]"
                          >
                            {item.label}
                          </Link>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 좌표계 1(1920 밴드): 회색 존 + 프로모 카드. 헤더 Band 1(로고+계정 그룹)과 동일한
                  mx-auto max-w-[120rem] px-8 축을 공유해 카드 우측 끝 = 계정 그룹 우측 끝이
                  전 뷰포트에서 일치한다. 컬럼 레이어와 같은 grid cell에 겹치므로 바깥 두 겹은
                  pointer-events-none으로 비워 컬럼 클릭을 가리지 않고, 카드 자체만
                  pointer-events-auto로 되살린다(헤더 nav 오버레이와 동일한 기법). */}
              <div className="pointer-events-none relative col-start-1 row-start-1 mx-auto w-full max-w-[120rem] px-8 py-10">
                {/* 회색 존: 기존 고정폭(20.25rem) 스트립이 컬럼 끝에 못 미쳐 패널 중간에서
                    하드 엣지로 시작하던 문제를 해결 — "컬럼 영역 끝 + 3.5rem 여백 ~ 밴드 우측 끝"
                    풀 높이로 확장했다(MEGA_ZONE_LEFT, 파일 상단 상수 주석 참고). right-0은 이 1920
                    밴드 래퍼의 바깥쪽 우측 끝 기준(패딩 이전) — 뷰포트가 120rem(1920px)을 넘으면
                    밴드 자체가 중앙 정렬되며 캡 안쪽에 서므로, 이 존과 카드는 항상 같은 밴드
                    우측 끝을 공유해 어긋나지 않는다. 색상 #f9fafb는 Figma 1483:846 실측값. */}
                <div
                  className="pointer-events-none absolute inset-y-0 right-0 bg-[#f9fafb]"
                  style={{ left: MEGA_ZONE_LEFT }}
                  aria-hidden="true"
                />

                <div className="pointer-events-none flex h-full items-start justify-end">
                  {/* 프로모 카드: 콘텐츠 하드코딩. 추후 admin에서 편집 가능한 배너로 전환 후보.
                      Figma 1483:926 get_design_context 실측(460×478, p-[32px], gap-[32px],
                      rounded-[24px], 타이틀 26px Bold, 서브 18px Medium, 일러 컨테이너 188px,
                      버튼 68px/rounded-[16px]/20px SemiBold) 기준 0.8 컴팩트 스케일 환산.
                      쉐도우는 실측 이펙트 그대로 적용: DROP_SHADOW(0,4,16,rgba(0,0,0,.06)) +
                      inset 하이라이트(회색 존 위에 얹힌 카드의 유리질감 재현), 기존
                      shadow-[0_18px_45px_...]는 패널 전체 쉐도우를 잘못 재사용한 값이었다. */}
                  <div
                    className="pointer-events-auto relative shrink-0 rounded-[1.2rem] bg-white p-6 shadow-[0px_4px_16px_rgba(0,0,0,0.06)]"
                    style={{ width: MEGA_PROMO_W }}
                  >
                    <div
                      className="pointer-events-none absolute inset-0 rounded-[inherit] shadow-[inset_0px_4px_4px_0px_rgba(255,255,255,0.24),inset_0px_-0.9px_0px_0px_rgba(0,0,0,0.04)]"
                      aria-hidden="true"
                    />
                    <p className="text-xl font-bold leading-[1.3] tracking-[-0.02em] text-[#1e293b]">
                      월 2만원 대로 시작하는 입시 관리!
                    </p>
                    <p className="mt-2 text-sm leading-[1.4] text-[#525252]">
                      학업·교내활동, 탐구, 학종, 교과, 면접까지
                      <br />
                      AI로 무제한 점검하세요
                    </p>

                    <img
                      src="/images/mega-menu-promo.png"
                      alt=""
                      className="mx-auto mt-6 h-[9.5rem] w-auto object-contain"
                    />

                    <Link
                      to="/login"
                      onClick={() => setActiveMega(null)}
                      className="mt-6 flex h-14 items-center justify-center rounded-xl bg-[#013262] text-base font-semibold text-white transition hover:bg-[#012347]"
                    >
                      로그인하기
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

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
