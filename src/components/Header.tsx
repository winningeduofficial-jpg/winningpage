import type { Session, User } from "@supabase/supabase-js";
import { ChevronDown, Menu, Settings } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router";
import megaPromoDiagnosisImg from "../assets/mega/promo-diagnosis.png";
import {
  MEGA_COL_GAP,
  MEGA_COL_W,
  MEGA_GUARD,
  NAV_CELL_GAP,
  NAV_CELL_W,
  NAV_GUARD,
} from "../data/navigation";
import { cleanText, isSameObject, useNavGroups } from "../hooks/useNavGroups";
import { supabase } from "../lib/supabase";
import MobileNavDrawer from "./MobileNavDrawer";
import { buildMyMenu } from "./myMenuItems";

const CSAT_DATE = "2026-11-19";
const HEADER_PROFILE_CACHE_KEY = "winning-header-profile";

// ---- 헤더 2중 좌표계 정렬 상수 (0729 시안 2207:12337, Playwright 실측 기준) ----
// 좌표계 1 (로고 + 계정 그룹): max-w-[120rem](1920px) 밴드. 좌우 마진은 px-8(2rem)에서
//   2xl(96rem)↑ px-[7.5rem](120px)로 램프한다 — 시안이 1920 기준 좌우 대칭 120px 마진으로
//   설계됐지만, desktop 브레이크포인트(90rem) 바로 위에서 즉시 120px를 적용하면 nav/계정
//   그룹 쪽 여유가 줄어(로고·계정 그룹이 함께 안쪽으로 밀림) 겹침 위험이 커져, 1920에 더
//   가까운 2xl(96rem)에서 램프하도록 의도적으로 분리했다(아래 nav-계정 그룹 충돌 계산 참고).
//   로고는 밴드 좌측 끝, 계정 그룹은 밴드 우측 끝.
// 좌표계 2 (nav 5개 + 메가 컬럼): max-w-content(72.75rem) 컨텐츠 영역, px-8(2rem) 패딩.
//   nav 기준점은 로고가 아니라 "컨텐츠 영역 시작"(뷰포트 중앙정렬 기준)이며, 좌표계 1과 완전히 독립이다.
// LOGO_W: 세로형 로고(SVG, h-[2.1875rem]=35px 고정, viewBox 96:52) 실렌더 폭 4.0385rem(64.6px)
//   → 4.04rem로 반올림(0729 시안, 기존 40px/74px에서 축소 — 프리헤더 로고도 동일 크기로 축소).
// NAV_GUARD·MEGA_GUARD·NAV_CELL_W·NAV_CELL_GAP·MEGA_COL_W·MEGA_COL_GAP: 헤더 nav·메가 컬럼이
// 공유하는 컨텐츠 격자 상수. 산정 근거 및 상세 주석은 src/data/navigation.js에 있다.
// 표준 상태(로그인/관리자, 배지+마이페이지+관리자+로그아웃) 우측 그룹 실측폭
//   (devadmin@gmail.com, D-day 3자리 + 이름 max-w-5rem truncate 상한 당시 기준) = 31.176rem(498.8125px).
//   이후 이름 truncate 상한을 제거해(이름 전체 노출 정책) 계정 그룹 폭은 이름 길이에 따라
//   가변이 되었다 — 위 실측치는 상한 존재 당시 기준값이며, 긴 이름에서의 유동 gap·90rem
//   전환점 상호작용은 Playwright 실측으로 별도 검증한다.
const LOGO_W = "4.04rem";
// 프로모 카드 폭: Figma 1483:926 실측 460×478 → 컴팩트 스케일 0.8 적용 = 368px = 23rem.
// (get_design_context 1483:926 실값 기준으로 재확인 완료 — 패딩 p-[32px], 요소간 gap-[32px],
// radius-[24px], 타이틀 26px Bold, 서브 18px Medium, 일러 컨테이너 188px, 버튼 68px 도 모두
// 동일 0.8 스케일로 환산해 아래 카드 JSX에 반영했다.)
const MEGA_PROMO_W = "23rem";
// 프로모 카드 콘텐츠(로그인 상태별 분기, 시안 3153:5209 로그인된 메가헤더 / 카드 프레임
// 3144:2883 — 크기·간격·그림자·타이포는 비로그인 카드(1483:926)와 완전히 동일해 상수는
// 그대로 재사용하고, 콘텐츠(타이틀/서브/이미지/CTA)만 이 두 상수 객체로 분기한다.
const MEGA_PROMO_GUEST = {
  title: "월 2만원 대로 시작하는 입시 관리!",
  subtitle: (
    <>
      학업·교내활동, 탐구, 학종, 교과, 면접까지
      <br />
      무제한 점검하세요
    </>
  ),
  image: "/images/mega-menu-promo.png",
  ctaLabel: "로그인하기",
  ctaTo: "/login",
};
const MEGA_PROMO_MEMBER = {
  title: "나에게 딱 맞는 서비스를 추천받아요",
  subtitle: "무료 설문조사로 나의 강점과 약점을 찾아보세요",
  image: megaPromoDiagnosisImg,
  ctaLabel: "학습진단 하기",
  ctaTo: "/services/learning-diagnosis",
};
// 메가 회색 존(#F9FAFB — Figma 1483:846 get_design_context 실값, 기존 #F7F7F7 추정치 폐기):
// 프로모 카드(MEGA_PROMO_W)를 상하좌우 정확히 동일한 2.5rem(p-10 — 기존 카드 상단 여백
// py-10과 동일 값) 패딩으로 감싸는 고정 크기 박스. 존 크기 = 카드 + 2.5rem×2 상수로,
// 컬럼 높이와 무관하게 항상 동일하게 보인다. 패널 전체 높이는 grid 겹침 구조에 의해
// max(컬럼 콘텐츠, 존 박스)로 결정되며, 컬럼이 더 길면 존은 상단 고정된 채 크기를 유지한다.
// 존 우측 끝은 1920 밴드 래퍼 바깥쪽 우측 끝(패딩 이전) 기준 — 기존 "컬럼 끝~밴드 우측 끝
// 풀 높이 스트립"(NAV_BLOCK_RIGHT_EDGE 기반 MEGA_ZONE_LEFT 산정)은 컬럼 높이를 따라
// 세로로 늘어나는 구조여서 폐기했고, 관련 상수도 함께 제거했다. 카드 우측 끝은 밴드 우측
// 끝에서 2.5rem 안쪽(기존 px-8=2rem 대비 0.5rem 이동) — 4방향 동일 패딩 원칙이 우선한다.

function getCsatDay() {
  const now = new Date();
  const kstNow = new Date(
    now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }),
  );
  const today = new Date(
    kstNow.getFullYear(),
    kstNow.getMonth(),
    kstNow.getDate(),
  );
  const target = new Date(`${CSAT_DATE}T00:00:00+09:00`);
  const diff = Math.ceil((target.getTime() - today.getTime()) / 86400000);

  if (diff > 0) return `수능 D-${diff}`;
  if (diff === 0) return "수능 D-DAY";
  return `수능 D+${Math.abs(diff)}`;
}

// profiles 테이블 행 — 헤더가 실제로 읽는 컬럼만 좁혀서 둔다.
type Profile = {
  id?: string;
  name?: string;
  email?: string;
  username?: string;
  member_type?: string;
  role?: string;
};

function getMemberLabel(profile: Profile | null) {
  const raw = cleanText(profile?.member_type).toLowerCase();
  const role = cleanText(profile?.role).toLowerCase();

  if (role === "admin") return "관리자";
  if (!raw) return "";
  if (raw === "student" || raw === "학생" || raw === "학생회원")
    return "학생회원";
  if (
    raw === "parent" ||
    raw === "parents" ||
    raw === "학부모" ||
    raw === "학부모회원"
  )
    return "학부모회원";
  if (raw === "mentor" || raw === "teacher" || raw === "멘토" || raw === "교사")
    return "멘토회원";
  return raw.endsWith("회원") ? raw : `${raw}회원`;
}

function readCachedProfile(): Profile | null {
  try {
    const raw = window.localStorage.getItem(HEADER_PROFILE_CACHE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function writeCachedProfile(profile: Profile | null) {
  try {
    if (!profile) {
      window.localStorage.removeItem(HEADER_PROFILE_CACHE_KEY);
      return;
    }

    window.localStorage.setItem(
      HEADER_PROFILE_CACHE_KEY,
      JSON.stringify(profile),
    );
  } catch {
    // 캐시 저장 실패는 무시
  }
}

function isSameUserProfile(
  profile: Profile | null | undefined,
  user: User | null | undefined,
) {
  if (!profile || !user) return false;

  const profileId = cleanText(profile.id);
  const userId = cleanText(user.id);
  const profileEmail = cleanText(profile.email).toLowerCase();
  const userEmail = cleanText(user.email).toLowerCase();

  return (
    (!!profileId && profileId === userId) ||
    (!!profileEmail && profileEmail === userEmail)
  );
}

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  fallbackValue: T,
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) =>
      window.setTimeout(() => resolve(fallbackValue), ms),
    ),
  ]);
}

async function queryProfileById(
  userId: string | undefined,
): Promise<Profile | null> {
  if (!userId) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("id, name, email, username, member_type, role")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("profiles id 조회 실패:", error);
    return null;
  }

  return data || null;
}

async function queryProfileByEmail(
  email: string | null | undefined,
): Promise<Profile | null> {
  const normalizedEmail = cleanText(email).toLowerCase();

  if (!normalizedEmail) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("id, name, email, username, member_type, role")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (error) {
    console.error("profiles email 조회 실패:", error);
    return null;
  }

  return data || null;
}

async function queryProfileByUsername(
  email: string | null | undefined,
): Promise<Profile | null> {
  const username = cleanText(email).split("@")[0];

  if (!username) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("id, name, email, username, member_type, role")
    .eq("username", username)
    .maybeSingle();

  if (error) {
    console.error("profiles username 조회 실패:", error);
    return null;
  }

  return data || null;
}

async function fetchProfile(
  user: User | null | undefined,
): Promise<Profile | null> {
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
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(() =>
    readCachedProfile(),
  );
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [csatDDay, setCsatDDay] = useState(getCsatDay());
  const [activeMega, setActiveMega] = useState<string | null>(null);
  // 메가 패널 애니메이션 상태(open/closed 3-phase state machine, 사용자 확정 스펙).
  // 'closed' → 마운트는 유지하되 opacity-0/invisible/pointer-events-none으로 완전히 상주(비표시).
  // 'open'   → activeMega가 켜지는 즉시 진입, 180ms ease-out-quart로 opacity+translateY 페이드인.
  // 'closing'→ activeMega가 null이 될 때(유지영역 타이머 만료·클릭 토글·로고 클릭 등) 진입,
  //            120ms opacity만 페이드아웃(이동 없음) 후 아래 타이머로 'closed'에 도달한다.
  // 패널이 always-mounted(조건부 렌더 아님)라 첫 hover 시에도 트랜지션이 항상 이미 걸려있는
  // 상태에서 클래스만 토글되므로 최초 오픈에서도 트랜지션이 확실히 발화한다.
  const [megaPanelPhase, setMegaPanelPhase] = useState<
    "closed" | "open" | "closing"
  >("closed");
  const megaPanelAnimTimerRef = useRef<number | null>(null);
  const [myOpen, setMyOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const mobileNavTriggerRef = useRef<HTMLButtonElement>(null);
  const navGroups = useNavGroups();
  const { pathname } = useLocation();

  // 현재 경로 기반 GNB 활성 그룹 판정(사용자 확정 스펙, 2단계):
  // 1단계 — 그룹의 후보 경로(group.to + items[].to 중 내부 경로만) 중 pathname과 정확히
  //   같은 것이 있으면 그 그룹이 활성.
  // 2단계 — 1단계에서 아무 그룹도 안 걸렸을 때만, 후보 경로의 첫 세그먼트와 pathname의 첫
  //   세그먼트가 같으면 활성. /page/<slug>는 여러 그룹에 걸쳐 있어 첫 세그먼트로 비교하면
  //   전 그룹이 동시에 활성화되므로 2단계 비교에서 제외(1단계 정확 일치에만 참여)한다.
  // 세그먼트가 없는 경로(예: '/')는 2단계에서 제외 — 홈은 어느 nav 그룹에도 속하지 않는다.
  // navGroups 순회 순서상 먼저 오는 그룹 하나만 활성으로 삼아 동시 활성을 방지한다.
  const activePathTitle = useMemo(() => {
    function firstSegment(path: string | null | undefined) {
      const segment = String(path || "")
        .split("/")
        .filter(Boolean)[0];
      return segment || null;
    }

    function internalCandidates(group: (typeof navGroups)[number]) {
      const raw = [
        group?.to,
        ...(Array.isArray(group?.items) ? group.items : []).map(
          (item) => item?.to,
        ),
      ];
      return raw.filter(
        (to): to is string => typeof to === "string" && to.startsWith("/"),
      );
    }

    for (const group of navGroups) {
      if (internalCandidates(group).includes(pathname)) {
        return group.title;
      }
    }

    const pathSegment = firstSegment(pathname);
    if (!pathSegment) return null;

    for (const group of navGroups) {
      const segmentCandidates = internalCandidates(group).filter(
        (to) => !to.startsWith("/page/"),
      );
      if (segmentCandidates.some((to) => firstSegment(to) === pathSegment)) {
        return group.title;
      }
    }

    return null;
  }, [navGroups, pathname]);

  // 메가 유지영역(nav 메뉴 블록 + 메가 패널) 전용 공유 close 타이머 —
  // 두 영역이 헤더 안에서 서로 다른 DOM 서브트리(nav 오버레이 / 패널)라 완전히 붙어있지
  // 않고, nav↔패널 이동 시 짧은 순간 두 영역 모두를 벗어나는 프레임이 있을 수 있어
  // 즉시 닫지 않고 ~100ms 유예를 둔다. 로고·계정 그룹·딤·기타 영역으로 나가면(두 영역
  // 중 어느 쪽도 재진입하지 않으면) 유예 후 닫힌다.
  const megaCloseTimerRef = useRef<number | null>(null);

  const clearMegaCloseTimer = useCallback(() => {
    if (megaCloseTimerRef.current) {
      window.clearTimeout(megaCloseTimerRef.current);
      megaCloseTimerRef.current = null;
    }
  }, []);

  function scheduleMegaClose() {
    clearMegaCloseTimer();
    megaCloseTimerRef.current = window.setTimeout(() => {
      setActiveMega(null);
      megaCloseTimerRef.current = null;
    }, 100);
  }

  useEffect(() => () => clearMegaCloseTimer(), [clearMegaCloseTimer]);

  // activeMega(어떤 그룹이 활성인지)와 megaPanelPhase(패널이 화면에서 어떻게 보이는지)를
  // 분리한다 — 그룹이 바뀌어도(호버 이동) activeMega만 바뀌고 phase는 'open'을 유지해
  // 재애니메이션 없이 패널이 그대로 열려있게 하고, activeMega가 null이 될 때만 'closing'으로
  // 전환한다.
  useEffect(() => {
    if (activeMega) {
      if (megaPanelAnimTimerRef.current) {
        window.clearTimeout(megaPanelAnimTimerRef.current);
        megaPanelAnimTimerRef.current = null;
      }

      setMegaPanelPhase("open");
      return undefined;
    }

    setMegaPanelPhase((prev) => (prev === "open" ? "closing" : prev));
    return undefined;
  }, [activeMega]);

  // 'closing' 진입 120ms 후 'closed'로 전환 — 이 시점엔 opacity가 이미 0에 도달해 있어
  // (visibility invisible로 전환되며) translateY를 -0.5rem으로 되돌려도 시각적 이동이 보이지
  // 않는다(닫힘 애니메이션 자체는 opacity 페이드만, 이동 없음이라는 스펙을 그대로 지킨다).
  useEffect(() => {
    if (megaPanelPhase !== "closing") return undefined;

    megaPanelAnimTimerRef.current = window.setTimeout(() => {
      setMegaPanelPhase("closed");
      megaPanelAnimTimerRef.current = null;
    }, 120);

    return () => {
      if (megaPanelAnimTimerRef.current) {
        window.clearTimeout(megaPanelAnimTimerRef.current);
        megaPanelAnimTimerRef.current = null;
      }
    };
  }, [megaPanelPhase]);

  useEffect(() => {
    const timer = window.setInterval(
      () => setCsatDDay(getCsatDay()),
      60 * 60 * 1000,
    );
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let alive = true;
    let seq = 0;

    async function syncSession(nextSession?: Session | null) {
      const currentSeq = ++seq;

      try {
        const sessionResult =
          nextSession !== undefined
            ? nextSession
            : await withTimeout(supabase.auth.getSession(), 1200, {
                data: { session: null },
              } as Awaited<ReturnType<typeof supabase.auth.getSession>>);

        if (!alive || currentSeq !== seq) return;

        const currentSession: Session | null =
          nextSession !== undefined
            ? (sessionResult as Session | null)
            : (
                sessionResult as Awaited<
                  ReturnType<typeof supabase.auth.getSession>
                >
              )?.data?.session || null;

        if (!currentSession?.user) {
          setSession(null);
          setProfile(null);
          writeCachedProfile(null);
          setIsAuthReady(true);
          return;
        }

        const cachedProfile = readCachedProfile();
        let nextProfile: Profile | null = null;

        if (isSameUserProfile(cachedProfile, currentSession.user)) {
          nextProfile = cachedProfile;
        }

        const fetchedProfile = await withTimeout(
          fetchProfile(currentSession.user),
          1800,
          null,
        );

        if (!alive || currentSeq !== seq) return;

        if (
          fetchedProfile &&
          isSameUserProfile(fetchedProfile, currentSession.user)
        ) {
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
        console.error("헤더 세션 동기화 오류:", error);

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

    window.addEventListener("winning-profile-updated", handleProfileUpdated);

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        syncSession(nextSession || null);
      },
    );

    return () => {
      alive = false;
      window.removeEventListener(
        "winning-profile-updated",
        handleProfileUpdated,
      );
      authListener?.subscription?.unsubscribe?.();
    };
  }, []);

  function clearSupabaseAuthStorage() {
    try {
      const localKeys: string[] = [];

      for (let i = 0; i < window.localStorage.length; i += 1) {
        const key = window.localStorage.key(i);
        if (key) localKeys.push(key);
      }

      localKeys.forEach((key) => {
        if (
          key.startsWith("sb-") ||
          key.includes("supabase") ||
          key.includes("auth-token") ||
          key === HEADER_PROFILE_CACHE_KEY
        ) {
          window.localStorage.removeItem(key);
        }
      });

      const sessionKeys: string[] = [];

      for (let i = 0; i < window.sessionStorage.length; i += 1) {
        const key = window.sessionStorage.key(i);
        if (key) sessionKeys.push(key);
      }

      sessionKeys.forEach((key) => {
        if (
          key.startsWith("sb-") ||
          key.includes("supabase") ||
          key.includes("auth-token")
        ) {
          window.sessionStorage.removeItem(key);
        }
      });
    } catch (error) {
      console.error("브라우저 세션 정리 오류:", error);
    }
  }

  async function handleLogout() {
    setSession(null);
    setProfile(null);
    writeCachedProfile(null);
    clearSupabaseAuthStorage();

    try {
      await Promise.race([
        supabase.auth.signOut({ scope: "local" }),
        new Promise((resolve) => window.setTimeout(resolve, 1800)),
      ]);
    } catch (error) {
      console.error("로그아웃 오류:", error);
    }

    clearSupabaseAuthStorage();
    window.dispatchEvent(new Event("winning-profile-updated"));
    window.location.replace("/");
  }

  const isLoggedIn = isAuthReady && !!session?.user;
  const hasProfile = !!profile && !!cleanText(profile?.name);
  const shouldShowLoggedInHeader = isLoggedIn && hasProfile;
  const displayName = cleanText(profile?.name) || "";
  const memberLabel = getMemberLabel(profile);
  // 학부모는 '수강신청·결제'가 /pricing 이 아니라 마이페이지 결제 내역으로 간다
  // (myMenuItems.js buildMyMenu 주석 참고).
  const isParentMember =
    cleanText(profile?.member_type).toLowerCase() === "parent";
  const myMenu = buildMyMenu(isParentMember);
  const isAdmin = cleanText(profile?.role).toLowerCase() === "admin";

  // 메가 패널 콘텐츠(모든 navGroups 컬럼 + 프로모 카드)는 activeMega와 무관하게 항상 동일하다
  // (어떤 그룹을 hover해도 5개 컬럼 전체가 함께 보이는 구조 — activeMega는 nav 버튼 하이라이트와
  // 패널 표시 여부만 결정한다). 그래서 패널 자체는 open 여부(megaPanelPhase)만으로 gate하면 되고,
  // 그룹별 콘텐츠 스위칭 로직은 불필요하다.
  const isMegaPanelOpen = megaPanelPhase === "open";
  const isMegaPanelClosing = megaPanelPhase === "closing";
  // 프로모 카드 콘텐츠는 프로필 로딩 완료 여부(shouldShowLoggedInHeader)와 무관하게
  // "로그인했는가"만으로 2분기한다(사용자 확정).
  const megaPromo = isLoggedIn ? MEGA_PROMO_MEMBER : MEGA_PROMO_GUEST;

  return (
    <header className="fixed left-0 top-0 z-50 w-full border-b border-black/5 bg-white">
      {/* 좌표계 1(1920 밴드): 로고(좌측 끝) + 계정 그룹(우측 끝). 랜딩 마퀴 밴드(max-w-[120rem])와
          동일 기준의 px-8 패딩으로 로고/계정 그룹을 뷰포트 1920 캡 좌우 끝에 고정한다.
          nav는 이 flex 라인에 속하지 않는다(좌표계 2, 아래 별도 overlay). */}
      <div className="mx-auto flex h-16 max-w-[120rem] items-center justify-between px-8 2xl:px-[7.5rem]">
        <Link
          to="/"
          className="flex shrink-0 items-center"
          style={{ width: LOGO_W }}
          onClick={() => setActiveMega(null)}
        >
          <img
            src="/images/winning-logo-stacked.svg"
            alt="위닝에듀"
            className="h-[2.1875rem] w-auto object-contain"
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

        <div className="hidden shrink-0 flex-nowrap items-center justify-end gap-3 whitespace-nowrap desktop:flex">
          {!isAuthReady ? (
            <div className="h-[2rem] w-[16rem]" aria-hidden="true" />
          ) : shouldShowLoggedInHeader ? (
            <>
              <div className="flex shrink-0 items-center rounded-lg bg-[#d9d9d9] px-3 py-1.5 text-sm font-medium text-[#013262] whitespace-nowrap">
                {displayName}님{memberLabel ? ` ${memberLabel}` : ""}
              </div>

              {/* biome-ignore lint/a11y/noStaticElementInteractions: 마우스 호버로 여는 데스크톱 편의 동작 — 실제 토글은 안쪽 button이 클릭·키보드 모두로 이미 접근 가능하다. */}
              <div
                className="relative flex items-center"
                onMouseEnter={() => setMyOpen(true)}
                onMouseLeave={() => setMyOpen(false)}
              >
                <button
                  type="button"
                  onClick={() => setMyOpen((prev) => !prev)}
                  className="inline-flex shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-lg border border-[#013262] bg-white px-4 py-1.5 text-sm font-medium leading-5 text-[#013262] transition hover:bg-[#f5f8fb]"
                >
                  마이페이지
                  <ChevronDown
                    size={14}
                    className={`transition ${myOpen ? "rotate-180" : ""}`}
                  />
                </button>

                {myOpen && (
                  <div className="absolute right-0 top-full z-50 w-[16rem]">
                    <div className="overflow-hidden rounded-lg border border-[#d7d7d7] bg-white shadow-[0_18px_45px_rgba(13,27,42,0.14)]">
                      {myMenu.map((item) => {
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
                  className="inline-flex shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-lg border border-[#d7d7d7] bg-white px-4 py-1.5 text-sm font-medium leading-5 text-[#1e293b] transition hover:border-[#013262] hover:text-[#013262]"
                >
                  <Settings size={14} />
                  관리자
                </Link>
              )}

              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-lg bg-[#013262] px-4 py-1.5 text-sm font-medium leading-5 text-[#f5f5f5] transition hover:bg-[#012347]"
              >
                로그아웃
              </button>
            </>
          ) : isLoggedIn ? (
            <>
              {/* biome-ignore lint/a11y/noStaticElementInteractions: 마우스 호버로 여는 데스크톱 편의 동작 — 실제 토글은 안쪽 button이 클릭·키보드 모두로 이미 접근 가능하다. */}
              <div
                className="relative flex items-center"
                onMouseEnter={() => setMyOpen(true)}
                onMouseLeave={() => setMyOpen(false)}
              >
                <button
                  type="button"
                  onClick={() => setMyOpen((prev) => !prev)}
                  className="inline-flex shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-lg border border-[#013262] bg-white px-4 py-1.5 text-sm font-medium leading-5 text-[#013262] transition hover:bg-[#f5f8fb]"
                >
                  마이페이지
                  <ChevronDown
                    size={14}
                    className={`transition ${myOpen ? "rotate-180" : ""}`}
                  />
                </button>

                {myOpen && (
                  <div className="absolute right-0 top-full z-50 w-[16rem]">
                    <div className="overflow-hidden rounded-lg border border-[#d7d7d7] bg-white shadow-[0_18px_45px_rgba(13,27,42,0.14)]">
                      {myMenu.map((item) => {
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
                className="inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-lg bg-[#013262] px-4 py-1.5 text-sm font-medium leading-5 text-[#f5f5f5] transition hover:bg-[#012347]"
              >
                로그아웃
              </button>
            </>
          ) : (
            <>
              <Link
                to="/login"
                className="inline-flex h-8 w-[5.625rem] shrink-0 items-center justify-center whitespace-nowrap rounded-lg bg-white px-3 py-1.5 text-sm font-medium leading-5 text-[#013262] transition hover:bg-[#f5f8fb]"
              >
                로그인
              </Link>

              <Link
                to="/signup"
                className="inline-flex h-8 w-[5.625rem] shrink-0 items-center justify-center whitespace-nowrap rounded-lg bg-[#013262] px-3 py-1.5 text-sm font-medium leading-5 text-[#f5f5f5] transition hover:bg-[#012347]"
              >
                회원가입
              </Link>
            </>
          )}
        </div>
      </div>

      {/* 좌표계 2(72.75rem 컨텐츠 영역): nav 5개. header가 position:fixed라 이 nav의 containing
          block이 되므로 별도 wrapper 없이 absolute로 좌표계 1(로고/계정 그룹) 위에 겹쳐 그린다.
          바깥 두 겹(overlay, mx-auto 컨테이너)은 pointer-events-none이라 로고/계정 그룹 클릭을
          가리지 않고, 실제 nav 아이템을 감싸는 안쪽 div만 pointer-events-auto로 되살린다.
          상태 불변 nav 그리드: nav 아이템은 로그인/비로그인 상태와 무관하게 항상
          NAV_CELL_W(고정폭) + NAV_CELL_GAP(고정 간격)만 사용한다(과거 게스트 gap-5/로그인 gap-0
          토글로 인해 상태별 x 좌표가 달라지던 문제 제거) — 좌표계가 계정 그룹과 완전히
          분리돼 있어 이제는 이 원칙이 자연히 충족된다.
          0729 시안: 셀 100px 내부 좌측 정렬(justify-start) — 메가 컬럼과 좌측선을 공유한다
          (아래 메가 컬럼 정렬 주석 참고).
          데스크톱 인라인 nav 전환 시점(desktop: 브레이크포인트)은 90rem(nav 5칸 692px 고정 폭 +
          로고/계정 그룹 폭 기준 재산정, tailwind.config.js 주석 참고 — max-w-content와 더 이상
          동일 값이 아니다). */}
      <nav className="pointer-events-none absolute inset-x-0 top-0 hidden h-16 desktop:block">
        <div className="pointer-events-none mx-auto flex h-full w-full max-w-content items-center px-8">
          {/* biome-ignore lint/a11y/noStaticElementInteractions: 마우스 호버로 메가메뉴 닫힘 타이머를 관리하는 데스크톱 편의 동작 — 실제 nav 링크는 클릭·키보드 모두로 접근 가능하다. */}
          <div
            className="pointer-events-auto flex items-center"
            style={{ gap: NAV_CELL_GAP, marginLeft: NAV_GUARD }}
            onMouseEnter={clearMegaCloseTimer}
            onMouseLeave={scheduleMegaClose}
          >
            {navGroups.map((group) => {
              const hasDropdown =
                Array.isArray(group.items) && group.items.length > 0;
              const isPathActive = activePathTitle === group.title;

              return (
                // biome-ignore lint/a11y/noStaticElementInteractions: 마우스 호버로 메가메뉴를 여는 데스크톱 편의 동작 — 실제 nav 링크는 클릭·키보드 모두로 접근 가능하다.
                <div
                  key={group.title}
                  className="pointer-events-none relative flex shrink-0 items-center justify-start"
                  style={{ width: NAV_CELL_W }}
                  onMouseEnter={() => hasDropdown && setActiveMega(group.title)}
                >
                  {/* nav 아이템은 페이지 이동 없이 메가 패널 트리거 전용(사용자 확정) —
                      Link 제거, hover(부모 onMouseEnter)·keyboard focus·클릭 토글로만 패널을 연다.
                      hit 영역은 셀(NAV_CELL_W) 전폭이 아니라 버튼 콘텐츠 폭만(부모 justify-start로
                      셀 좌측에 고정, 메가 컬럼과 동일 좌측선 공유) — 셀의 나머지 빈 공간(이 div)은
                      pointer-events-none으로 통과시켜, 셀이 우측 계정 그룹(배지 등)과 겹치는
                      뷰포트 구간에서도 nav가 그 영역의 hover/클릭을 가로채지 않게 한다. */}
                  <button
                    type="button"
                    aria-haspopup="true"
                    aria-expanded={activeMega === group.title}
                    aria-current={isPathActive ? "page" : undefined}
                    onFocus={() => {
                      clearMegaCloseTimer();
                      hasDropdown && setActiveMega(group.title);
                    }}
                    onClick={() => {
                      clearMegaCloseTimer();
                      hasDropdown &&
                        setActiveMega((prev) =>
                          prev === group.title ? null : group.title,
                        );
                    }}
                    className={`pointer-events-auto cursor-default whitespace-nowrap py-4 text-base leading-[1.4] tracking-[-0.02em] transition ${
                      isPathActive
                        ? "font-semibold text-[#013262]"
                        : activeMega === group.title
                          ? "font-medium text-[#013262]"
                          : "font-medium text-[#4d4d4d] hover:text-[#013262]"
                    }`}
                  >
                    {group.title}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </nav>

      {/* 메가 딤+패널은 activeMega 조건부 마운트 대신 상시 마운트(always-mounted) 후 상태
          클래스로 open/closing/closed 3-phase를 토글한다(megaPanelPhase, 위 effect 참고).
          조건부 마운트는 클로즈 애니메이션이 불가능하고(언마운트 즉시 사라짐), 마운트 직후
          클래스를 바로 여는 첫 프레임에 트랜지션이 발화하지 않을 위험이 있어 폐기했다 —
          항상 DOM에 상주(opacity-0 + invisible + pointer-events-none)시켜 두 문제를 모두 해소한다. */}

      {/* 헤더+메가패널 아래 전체를 어둡게 dim 처리. 패널(z-50, 불투명)이 위에 그려져
            패널이 차지하는 영역만 자연히 dim이 가려지므로 패널 높이를 따로 측정할 필요가 없다.
            오픈 200ms / 클로즈 120ms 모두 opacity만(이동 없음), ease-out-quart(프로젝트 표준
            이징 — MobileNavDrawer의 ease-[var(--ease-out-quart)] 관례를 그대로 따른다). */}
      <div
        className={`fixed inset-x-0 top-16 bottom-0 z-40 hidden bg-black/30 desktop:block motion-reduce:transition-none motion-reduce:duration-0 ${
          isMegaPanelOpen
            ? "visible opacity-100 pointer-events-auto transition-opacity duration-[200ms] ease-[var(--ease-out-quart)]"
            : isMegaPanelClosing
              ? "visible opacity-0 pointer-events-none transition-opacity duration-[120ms] ease-[var(--ease-out-quart)]"
              : "invisible opacity-0 pointer-events-none"
        }`}
        onClick={() => setActiveMega(null)}
        aria-hidden="true"
      />

      <div
        className={`fixed left-0 top-16 z-50 hidden w-full border-b border-black/5 bg-white shadow-[0_18px_45px_rgba(13,27,42,0.14)] desktop:block motion-reduce:transition-none motion-reduce:duration-0 ${
          isMegaPanelOpen
            ? "visible opacity-100 translate-y-0 pointer-events-auto transition-all duration-[180ms] ease-[var(--ease-out-quart)]"
            : isMegaPanelClosing
              ? "visible opacity-0 translate-y-0 pointer-events-none transition-all duration-[120ms] ease-[var(--ease-out-quart)]"
              : "invisible opacity-0 -translate-y-2 pointer-events-none"
        }`}
        aria-hidden={!isMegaPanelOpen}
        onMouseEnter={clearMegaCloseTimer}
        onMouseLeave={scheduleMegaClose}
      >
        {/* 패널도 헤더와 동일한 2중 좌표계: 컬럼(좌표계 2, 1200 컨텐츠)과 프로모 카드(좌표계 1,
                1920 밴드 — 헤더 계정 그룹과 같은 축)를 같은 grid cell(col-start-1 row-start-1)에
                겹쳐 그린다. absolute 오버레이 대신 grid 겹침을 쓴 이유: 두 레이어 중 더 큰 쪽이
                패널의 자연 높이(hug)를 그대로 결정하게 하기 위함(absolute는 문서 흐름에서 빠져
                높이에 기여하지 못한다). */}
        <div className="grid">
          {/* 좌표계 2(72.75rem 컨텐츠 영역): 메가 컬럼. nav와 동일한 mx-auto max-w-content px-8
                  컨테이너를 공유하고, marginLeft도 nav와 동일한 MEGA_GUARD(= NAV_GUARD)를 쓴다 —
                  nav 텍스트가 셀 안에서 좌측 정렬(justify-start)이라 정렬 기준은 "좌측선 공유":
                  컬럼 0의 시작 x가 nav 셀 0의 텍스트 시작 x와 그대로 일치한다(별도 오프셋
                  보정 불필요). 컬럼 폭은 8.75rem(140px) 그대로 유지 — "국제・해외고 국내대
                  입학컨설팅" 등 긴 서브아이템 라벨이 줄바꿈되는 것을 막기 위함이며, 컬럼 gap도
                  0.5rem(8px)로 고정해 컬럼 피치(140+8=148px)가 nav 셀 피치(100+48=148px)와
                  항상 동일하게 유지되도록 했다 — 피치가 같아야 컬럼 1, 2...도 좌측선이 계속
                  맞는다(자세한 계산은 src/data/navigation.js 상단 주석 참고).
                  타이포: Figma 1483:882 get_design_context 실값 기준 — 컬럼 폭(140px)이 이미
                  시안(132px)과 거의 1:1이라 0.8 컴팩트 스케일 없이 실측값을 그대로 쓴다.
                  아이템 14px/#525252/Pretendard Medium, 행간 gap-[12px]=0.75rem(gap-3),
                  행 line-height 20px=leading-5.
                  컬럼 상단 그룹 타이틀(서비스/프리미엄/...)은 바로 위 nav 아이템과 문구가
                  완전히 중복되어 제거했다 — 첫 아이템이 기존 타이틀 자리(패널 상단 py-6=1.5rem)
                  에서 바로 시작하며, 타이틀이 쓰던 간격은 패널 상단 패딩이 그대로 흡수한다. */}
          <div className="col-start-1 row-start-1 mx-auto w-full max-w-content px-8 py-6">
            <div
              className="grid"
              style={{
                marginLeft: MEGA_GUARD,
                gridTemplateColumns: `repeat(5, ${MEGA_COL_W})`,
                columnGap: MEGA_COL_GAP,
              }}
            >
              {navGroups.map((group) => (
                <div
                  key={`mega-col-${group.title}`}
                  className="flex flex-col gap-3"
                >
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
              ))}
            </div>
          </div>

          {/* 좌표계 1(1920 밴드): 회색 존 + 프로모 카드. 헤더 Band 1(로고+계정 그룹)과 동일한
                  mx-auto max-w-[120rem] 축을 공유한다. 컬럼 레이어와 같은 grid cell에 겹치므로
                  바깥 겹은 pointer-events-none으로 비워 컬럼 클릭을 가리지 않고, 카드 자체만
                  pointer-events-auto로 되살린다(헤더 nav 오버레이와 동일한 기법). */}
          <div className="pointer-events-none col-start-1 row-start-1 mx-auto w-full max-w-[120rem]">
            {/* 회색 존: 카드를 상하좌우 동일한 2.5rem(p-10) 패딩으로 감싸는 고정 크기 박스
                    (파일 상단 상수 주석 참고). ml-auto로 밴드 래퍼 바깥쪽 우측 끝(패딩 이전)에
                    붙인다 — 뷰포트가 120rem(1920px)을 넘으면 밴드 자체가 중앙 정렬되며 캡 안쪽에
                    서므로 존 우측 끝은 항상 밴드 우측 끝과 일치한다. 박스 자연 높이(카드+5rem)가
                    grid cell 높이에 기여해 컬럼이 더 짧아도 패널이 존 높이만큼 확보되고, 컬럼이
                    더 길면 존은 상단 고정. 색상 #f9fafb는 Figma 1483:846 실측값.
                    translateX(0.5rem): 존 박스의 p-10(2.5rem)은 헤더 Band 1(px-8=2rem)보다
                    0.5rem(8px) 두꺼워 카드 우측 끝이 계정 그룹 우측 끝보다 8px 안쪽에 있었다.
                    4방향 동일 패딩(p-10)은 그대로 두고 박스 자체의 우측 기준점만 8px 우측으로
                    옮겨(밴드 우측 끝을 8px 넘어서도록) 카드 우측 끝을 계정 그룹 축에 정확히
                    맞춘다 — 레이아웃(grid/폭)에는 영향 없는 순수 시각 보정. */}
            <div
              className="pointer-events-none ml-auto w-fit bg-[#f9fafb] p-10"
              style={{ transform: "translateX(0.5rem)" }}
            >
              {/* 프로모 카드: 콘텐츠 하드코딩(로그인 상태별 분기, megaPromo). 추후 admin에서
                      편집 가능한 배너로 전환 후보.
                      Figma 1483:926 get_design_context 실측(460×478, p-[32px], gap-[32px],
                      rounded-[24px], 타이틀 26px Bold, 서브 18px Medium, 일러 컨테이너 188px,
                      버튼 68px/rounded-[16px]/20px SemiBold) 기준 0.8 컴팩트 스케일 환산.
                      쉐도우는 실측 이펙트 그대로 적용: DROP_SHADOW(0,4,16,rgba(0,0,0,.06)) +
                      inset 하이라이트(회색 존 위에 얹힌 카드의 유리질감 재현), 기존
                      shadow-[0_18px_45px_...]는 패널 전체 쉐도우를 잘못 재사용한 값이었다.
                      로그인 분기 근거: 시안 3153:5209(로그인된 메가헤더) — 카드 프레임 3144:2883은
                      비로그인 카드(1483:926)와 크기·간격·그림자·타이포가 완전히 동일해 위 스케일
                      값은 그대로 재사용하고, 콘텐츠(타이틀/서브/이미지/CTA)만 megaPromo
                      (MEGA_PROMO_GUEST/MEGA_PROMO_MEMBER)로 교체한다. */}
              <div
                className="pointer-events-auto relative shrink-0 rounded-[1.2rem] bg-white p-6 shadow-[0px_4px_16px_rgba(0,0,0,0.06)]"
                style={{ width: MEGA_PROMO_W }}
              >
                <div
                  className="pointer-events-none absolute inset-0 rounded-[inherit] shadow-[inset_0px_4px_4px_0px_rgba(255,255,255,0.24),inset_0px_-0.9px_0px_0px_rgba(0,0,0,0.04)]"
                  aria-hidden="true"
                />
                <p className="text-xl font-bold leading-[1.3] tracking-[-0.02em] text-[#1e293b]">
                  {megaPromo.title}
                </p>
                <p className="mt-2 break-keep text-sm leading-[1.4] text-[#525252]">
                  {megaPromo.subtitle}
                </p>

                <img
                  src={megaPromo.image}
                  alt=""
                  className="mx-auto mt-6 h-[9.5rem] w-auto object-contain"
                />

                <Link
                  to={megaPromo.ctaTo}
                  onClick={() => setActiveMega(null)}
                  className="mt-6 flex h-14 items-center justify-center rounded-xl bg-[#013262] text-base font-semibold text-white transition hover:bg-[#012347]"
                >
                  {megaPromo.ctaLabel}
                </Link>
              </div>
            </div>
          </div>
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
        isParentMember={isParentMember}
        csatDDay={csatDDay}
        isAdmin={isAdmin}
        onLogout={handleLogout}
        triggerRef={mobileNavTriggerRef}
      />
    </header>
  );
}
