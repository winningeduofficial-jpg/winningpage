import type { User } from "@supabase/supabase-js";
import { Menu, Settings } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router";
import megaPromoDiagnosisImg from "@/assets/mega/promo-diagnosis.png";
import { useAuth } from "@/context/AuthProvider";
import { MEGA_COL_GAP, MEGA_COL_W, MEGA_GUARD } from "@/data/navigation";
import { cleanText, isSameObject, useNavGroups } from "@/hooks/useNavGroups";
import { queryClient } from "@/lib/queryClient";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/types/database.types";
import MobileNavDrawer from "./MobileNavDrawer";

const CSAT_DATE = "2026-11-19";
const HEADER_PROFILE_CACHE_KEY = "winning-header-profile";
const MS_PER_DAY = 86400000;

// ---- 헤더 정렬 상수 ----
// (QA 행327, 2026-09-02 개정) 로고·nav·계정 그룹은 이제 max-w-[120rem](1920px) 밴드 하나를
//   공유하는 3존 flex 행(로고 shrink-0 / nav flex-1 / 계정 그룹 shrink-0)에 배치한다 — 로고+
//   계정 그룹의 max-w-[120rem] 밴드와 nav의 max-w-content(72.75rem) 컨텐츠 영역이 서로 독립적으로
//   중앙정렬되던 옛 2중 좌표계는 폐기했다(계정 그룹 실측폭을 전혀 반영 못 하는 뷰포트 전용
//   clamp() 가드 수식이 원인이라 좁은 데스크톱 구간에서 nav·계정 그룹이 실제로 겹쳤다 — 상세
//   경위는 아래 return 블록 헤더 주석 참고). MEGA_GUARD·MEGA_COL_W·MEGA_COL_GAP(메가 패널
//   컬럼 격자)은 이번 변경 대상이 아니라 기존 방식을 그대로 유지한다.
// LOGO_W: 헤더 로고를 푸터형(스택형, "W" 아래 회사명, SVG viewBox 763:324)으로 교체했다
//   (QA 행320 — 기존 가로형 winning-logo-horizontal.svg는 폭이 넓어 헤더처럼 높이가
//   좁은 자리에서 클릭 영역이 어색했다). 헤더 높이(h-16=64px)에 맞춰 h-11(44px)로
//   렌더하고, 실렌더 폭은 스택형 원본 비율(763/324)로 환산한 6.5rem(104px)이다.
// 표준 상태(로그인/관리자, 배지+마이페이지+관리자+로그아웃) 우측 그룹 실측폭
//   (devadmin@gmail.com, D-day 3자리 + 이름 max-w-5rem truncate 상한 당시 기준) = 31.176rem(498.8125px).
//   이후 이름 truncate 상한을 제거해(이름 전체 노출 정책) 계정 그룹 폭은 이름 길이에 따라
//   가변이 되었다 — 위 실측치는 상한 존재 당시 기준값이며, 긴 이름에서의 유동 gap·90rem
//   전환점 상호작용은 Playwright 실측으로 별도 검증한다.
const LOGO_W = "6.5rem";
// 프로모 카드 폭: Figma 1483:926 실측 460×478 → 컴팩트 스케일 0.8 적용 = 368px = 23rem.
// (get_design_context 1483:926 실값 기준으로 재확인 완료 — 패딩 p-[32px], 요소간 gap-[32px],
// radius-[24px], 타이틀 26px Bold, 서브 18px Medium, 일러 컨테이너 188px, 버튼 68px 도 모두
// 동일 0.8 스케일로 환산해 아래 카드 JSX에 반영했다.)
const MEGA_PROMO_W = "23rem";
// 프로모 카드 콘텐츠(로그인 상태별 분기, 시안 3153:5209 로그인된 메가헤더 / 카드 프레임
// 3144:2883 — 크기·간격·그림자·타이포는 비로그인 카드(1483:926)와 완전히 동일해 상수는
// 그대로 재사용하고, 콘텐츠(타이틀/서브/이미지/CTA)만 이 두 상수 객체로 분기한다.
const MEGA_PROMO_GUEST = {
  title: "흔들리지 않는 학습·진로 관리의 시작!",
  subtitle:
    "학습진단, 목표관리, 수행, 탐구, 성장설계까지 완벽히 점검해 드립니다",
  image: "/images/mega-menu-promo.png",
  ctaLabel: "로그인하기",
  ctaTo: "/login",
};
const MEGA_PROMO_MEMBER = {
  title: "흔들리지 않는 학습·진로 관리의 시작!",
  subtitle:
    "학습진단, 목표관리, 수행, 탐구, 성장설계까지 완벽히 점검해 드립니다",
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
  const diff = Math.ceil((target.getTime() - today.getTime()) / MS_PER_DAY);

  if (diff > 0) return `수능 D-${diff}`;
  if (diff === 0) return "수능 D-DAY";
  return `수능 D+${Math.abs(diff)}`;
}

// profiles 테이블 행 — 헤더가 실제로 읽는 컬럼만 좁혀서 둔다.
// 생성 타입(Tables<"profiles">)에서 파생시켜 null 가능 여부가 실제 스키마와 어긋나지
// 않게 한다(role만 NOT NULL이라 string, 나머지는 string | null).
type Profile = Pick<
  Tables<"profiles">,
  "id" | "name" | "email" | "username" | "member_type" | "role"
>;

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

const MEGA_CLOSE_DELAY_MS = 100;
// megaPanelPhase를 'closing' → 'closed'로 옮기는 JS 타이머 지연이자, 메가 딤+패널의
// 클로즈 transitionDuration(인라인 style)이기도 하다 — 아래 두 <div>가 이 상수를 그대로
// style로 소비한다. Tailwind duration-[Nms] 유틸은 정적 문자열만 JIT가 인식하므로 JS
// 상수를 클래스명에 보간할 수 없어, 클로징 구간만 인라인 style로 뺐다(둘이 어긋나면
// setMegaPanelPhase("closed")가 트랜지션 도중에 발화해 깜빡임이 생긴다).
const MEGA_PANEL_CLOSING_MS = 120;
const CSAT_DDAY_REFRESH_MS = 60 * 60 * 1000;
const LOGOUT_FALLBACK_TIMEOUT_MS = 1800;

export default function Header() {
  // 세션 구독 자체는 AuthProvider(전역 단일 구독, src/context/AuthProvider.tsx)에
  // 위임한다(명세서 B-3) — 이 컴포넌트는 세션이 확정된 뒤 프로필(profiles 테이블)만
  // 별도로 조회한다.
  const { session, user, isReady: isAuthReady } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(() =>
    readCachedProfile(),
  );
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
    }, MEGA_CLOSE_DELAY_MS);
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
    }, MEGA_PANEL_CLOSING_MS);

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
      CSAT_DDAY_REFRESH_MS,
    );
    return () => window.clearInterval(timer);
  }, []);

  // 세션이 아니라 프로필(profiles 테이블)만 조회한다 — 세션 확정은 AuthProvider가
  // 이미 끝냈으므로(위 useAuth()), user가 바뀔 때만 프로필을 다시 가져오면 된다.
  // "winning-profile-updated" 커스텀 이벤트(마이페이지 등에서 이름 변경 후 발행)도
  // 같은 재조회 트리거로 남겨둔다.
  useEffect(() => {
    let alive = true;
    let seq = 0;

    async function syncProfile() {
      const currentSeq = ++seq;

      if (!user) {
        setProfile(null);
        writeCachedProfile(null);
        return;
      }

      try {
        const cachedProfile = readCachedProfile();
        let nextProfile: Profile | null = null;

        if (isSameUserProfile(cachedProfile, user)) {
          nextProfile = cachedProfile;
        }

        const fetchedProfile = await withTimeout(
          fetchProfile(user),
          1800,
          null,
        );

        if (!alive || currentSeq !== seq) return;

        if (fetchedProfile && isSameUserProfile(fetchedProfile, user)) {
          nextProfile = fetchedProfile;
          writeCachedProfile(fetchedProfile);
        }

        setProfile((prev) => {
          if (isSameObject(prev, nextProfile)) {
            return prev;
          }

          return nextProfile;
        });
      } catch (error) {
        console.error("헤더 프로필 동기화 오류:", error);

        if (!alive || currentSeq !== seq) return;

        setProfile(null);
      }
    }

    syncProfile();

    const handleProfileUpdated = () => {
      syncProfile();
    };

    window.addEventListener("winning-profile-updated", handleProfileUpdated);

    return () => {
      alive = false;
      window.removeEventListener(
        "winning-profile-updated",
        handleProfileUpdated,
      );
    };
  }, [user]);

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
    // 세션 자체는 AuthProvider가 SIGNED_OUT 이벤트로 곧 null로 갱신하지만(비동기),
    // 프로필은 이 컴포넌트가 로컬로 들고 있으므로 여기서 즉시 비운다.
    setProfile(null);
    writeCachedProfile(null);
    clearSupabaseAuthStorage();

    try {
      await Promise.race([
        supabase.auth.signOut({ scope: "local" }),
        new Promise((resolve) =>
          window.setTimeout(resolve, LOGOUT_FALLBACK_TIMEOUT_MS),
        ),
      ]);
    } catch (error) {
      console.error("로그아웃 오류:", error);
    }

    // 1차 정리는 supabase의 SIGNED_OUT 이벤트 구독(queryClient.ts)이 담당한다 —
    // 위 signOut() 호출이 성공하면 그 구독이 이미 queryClient.clear()를 부른다.
    // 여기 있는 호출은 그 위에 얹는 중복 안전장치다(주석 정정, 재검증 LOW) —
    // signOut()이 LOGOUT_FALLBACK_TIMEOUT_MS 안에 응답하지 않아 이벤트 자체가
    // 아직 안 왔거나, 이 페이지 이동(window.location.replace 아래)까지 SIGNED_OUT
    // 처리보다 먼저 도달하는 경우를 대비한다. signOut 시도가 끝난 뒤로 미룬
    // 이유는 별도다 — signOut 요청이 아직 진행 중인데 먼저 캐시를 비우면, 그
    // 사이 진행 중이던 다른 in-flight 쿼리가 비워진 캐시에 다시 값을 채워 넣는
    // 경합 창이 생긴다.
    queryClient.clear();

    clearSupabaseAuthStorage();
    window.dispatchEvent(new Event("winning-profile-updated"));
    window.location.replace("/");
  }

  const isLoggedIn = isAuthReady && !!session?.user;
  const hasProfile = !!profile && !!cleanText(profile?.name);
  const shouldShowLoggedInHeader = isLoggedIn && hasProfile;
  const displayName = cleanText(profile?.name) || "";
  const memberLabel = getMemberLabel(profile);
  // isParentMember는 MobileNavDrawer의 드로어 마이페이지 메뉴(buildMyMenu) 분기에
  // 쓰인다 — 헤더 데스크톱 쪽은 QA 행241로 이름 칩 자체가 /mypage 링크가 돼 더는 쓰지 않는다.
  const isParentMember =
    cleanText(profile?.member_type).toLowerCase() === "parent";
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

  // 계정 그룹(로그인 로딩 placeholder / 로그인+프로필 완료 / 로그인만·프로필 로딩 중 /
  // 비로그인 4분기)을 별도 노드로 뽑아둔다 — 아래 헤더 행에서 실제로 그리는 것 외에,
  // return 블록 헤더 주석에 적은 이유로 헤더 nav 존의 "실제로 남는 폭"을 구하기 위해
  // 같은 내용을 그대로 한 번 더(보이지 않게) 렌더해야 하기 때문이다.
  // QA 행241 — 우측 상단 "마이페이지" 단독 버튼을 없애고, 이름 칩 자체를 /mypage 링크로
  // 바꾼다(호버 시 언더라인+색 변화, aria-label로 목적지 명시). 관리자 링크·로그아웃은 유지.
  const accountGroupNode = (() => {
    if (!isAuthReady)
      return <div className="h-8 w-[16rem]" aria-hidden="true" />;
    if (shouldShowLoggedInHeader)
      return (
        <>
          <Link
            to="/mypage"
            aria-label="마이페이지"
            className="flex shrink-0 items-center rounded-lg bg-[#d9d9d9] px-3 py-1.5 text-sm font-medium text-primary whitespace-nowrap transition hover:text-[#012347] hover:underline"
          >
            {displayName}님{memberLabel ? ` ${memberLabel}` : ""}
          </Link>

          {isAdmin && (
            <Link
              to="/admin"
              className="inline-flex shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-lg border border-line bg-white px-4 py-1.5 text-sm font-medium leading-5 text-[#1e293b] transition hover:border-primary hover:text-primary"
            >
              <Settings size={14} />
              관리자
            </Link>
          )}

          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-lg bg-primary px-4 py-1.5 text-sm font-medium leading-5 text-[#f5f5f5] transition hover:bg-[#012347]"
          >
            로그아웃
          </button>
        </>
      );
    if (isLoggedIn)
      // 프로필(이름) 로딩 중이라 아직 이름 칩을 그릴 수 없다 — 마이페이지 단독 버튼도
      // QA 행241로 제거 대상이라, 이 분기는 로그아웃만 노출한다(이름 도착 즉시 위 분기로 전환).
      return (
        <button
          type="button"
          onClick={handleLogout}
          className="inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-lg bg-primary px-4 py-1.5 text-sm font-medium leading-5 text-[#f5f5f5] transition hover:bg-[#012347]"
        >
          로그아웃
        </button>
      );
    return (
      <>
        <Link
          to="/login"
          className="inline-flex h-8 w-22.5 shrink-0 items-center justify-center whitespace-nowrap rounded-lg bg-white px-3 py-1.5 text-sm font-medium leading-5 text-primary transition hover:bg-[#f5f8fb]"
        >
          로그인
        </Link>

        <Link
          to="/signup"
          className="inline-flex h-8 w-22.5 shrink-0 items-center justify-center whitespace-nowrap rounded-lg bg-primary px-3 py-1.5 text-sm font-medium leading-5 text-[#f5f5f5] transition hover:bg-[#012347]"
        >
          회원가입
        </Link>
      </>
    );
  })();

  return (
    <header className="fixed left-0 top-0 z-50 w-full border-b border-black/5 bg-white">
      {/* (QA 행327 재작업) 로고·nav·계정 그룹을 max-w-[120rem] 밴드 하나를 공유하는 3존 flex
          행(로고 shrink-0 / nav flex-1 / 계정 그룹 shrink-0)에 배치한다.
          옛 구조는 로고+계정 그룹(max-w-[120rem] 밴드)과 nav(max-w-content 72.75rem 컨텐츠
          영역, header를 containing block 삼아 absolute로 위에 겹쳐 그림)가 서로 다른 축으로
          독립 중앙정렬됐고, nav 시작 위치는 뷰포트 폭만 보는 clamp() 가드 수식(NAV_GUARD)으로
          보정했다. 그런데 계정 그룹 실폭은 로그인 상태·이름 길이에 따라 달라지는데
          NAV_GUARD는 그 실폭을 전혀 모르는 수식이라, 좁은 데스크톱 구간(1440~1600px대,
          관리자처럼 계정 그룹이 넓은 상태)에서 nav 마지막 항목과 계정 그룹이 실제로 겹쳤다
          (Playwright로 재현: 1440px 폭·관리자 계정 그룹 기준 nav 우측 끝이 계정 그룹 좌측
          안으로 약 84px 파고듦).
          3존 flex는 계정 그룹이 실제로 차지한 폭만큼 브라우저가 자동으로 nav 존(flex-1) 폭을
          줄여주므로 상태·이름 길이와 무관하게 항상 "남는 공간만" nav가 차지해 구조적으로
          겹침이 불가능하다. nav 항목도 고정폭 셀(옛 NAV_CELL_W) 대신 텍스트 자연폭을 쓴다 —
          고정 100px 셀은 실제 텍스트("서비스" 등)보다 넓어 불필요하게 공간을 더 요구했었다.
          항목 사이 gap은 nav 존을 @container로 감싸 존 폭이 좁아지면 단계적으로 줄어들게
          했다(gap은 flexbox가 자동으로 줄여주지 않는 유일한 값이라 컨테이너 쿼리로 직접
          반응시켰다) — 0729 시안 gap 48px(3rem, gap-12)은 존이 넉넉한 구간(@[48rem]=768px
          이상)에서만 적용되고, 더 좁으면 24px(gap-6)로 축소된다. nav에 min-w-0 +
          overflow-hidden도 추가해, 있을 수 없는 극단값(예: 매우 긴 이름)에서도 겹침 대신
          nav 끝쪽이 잘리는 쪽으로만 실패하게 안전장치를 뒀다.
          메가 패널 컬럼(MEGA_GUARD/MEGA_COL_W 기반, 아래)은 이번 변경 대상이 아니다 — nav
          항목이 고정폭에서 자연폭으로 바뀌어 메가 컬럼과의 좌측선 공유가 더 이상 항상
          보장되진 않지만, 메가 패널은 호버로 뜨는 별도 레이어라 계정 그룹과 공간을 다투지
          않아 QA 대상 겹침과는 무관하고 "러프 디자인 구현" 범위에서 허용했다. */}
      <div className="mx-auto flex h-16 max-w-[120rem] items-center gap-6 px-8 2xl:px-30">
        <Link
          to="/"
          className="flex shrink-0 items-center"
          style={{ width: LOGO_W }}
          onClick={() => setActiveMega(null)}
        >
          <img
            src="/images/winning-logo-stacked.svg"
            alt="위닝에듀"
            className="h-11 w-auto object-contain"
          />
        </Link>

        <nav
          className="hidden min-w-0 flex-1 overflow-hidden @container desktop:block"
          onMouseEnter={clearMegaCloseTimer}
          onMouseLeave={scheduleMegaClose}
        >
          <div className="flex items-center justify-center gap-6 @[48rem]:gap-12">
            {navGroups.map((group) => {
              const hasDropdown =
                Array.isArray(group.items) && group.items.length > 0;
              const isPathActive = activePathTitle === group.title;

              return (
                <button
                  key={group.title}
                  type="button"
                  aria-haspopup="true"
                  aria-expanded={activeMega === group.title}
                  aria-current={isPathActive ? "page" : undefined}
                  onFocus={() => {
                    clearMegaCloseTimer();
                    hasDropdown && setActiveMega(group.title);
                  }}
                  onMouseEnter={() => hasDropdown && setActiveMega(group.title)}
                  onClick={() => {
                    clearMegaCloseTimer();
                    hasDropdown &&
                      setActiveMega((prev) =>
                        prev === group.title ? null : group.title,
                      );
                  }}
                  className={`shrink-0 cursor-default whitespace-nowrap py-4 text-base leading-[1.4] tracking-[-0.02em] transition ${
                    isPathActive
                      ? "font-semibold text-primary"
                      : activeMega === group.title
                        ? "font-medium text-primary"
                        : "font-medium text-ink-header hover:text-primary"
                  }`}
                >
                  {group.title}
                </button>
              );
            })}
          </div>
        </nav>

        <div className="flex shrink-0 items-center gap-3">
          <button
            ref={mobileNavTriggerRef}
            type="button"
            onClick={() => setMobileNavOpen(true)}
            aria-expanded={mobileNavOpen}
            aria-controls="mobile-nav-drawer"
            aria-label="전체 메뉴 열기"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-line bg-white text-[#1e293b] transition hover:border-primary hover:text-primary desktop:hidden"
          >
            <Menu size={22} />
          </button>

          <div className="hidden shrink-0 flex-nowrap items-center justify-end gap-3 whitespace-nowrap desktop:flex">
            {accountGroupNode}
          </div>
        </div>
      </div>

      {/* 메가 딤+패널은 activeMega 조건부 마운트 대신 상시 마운트(always-mounted) 후 상태
          클래스로 open/closing/closed 3-phase를 토글한다(megaPanelPhase, 위 effect 참고).
          조건부 마운트는 클로즈 애니메이션이 불가능하고(언마운트 즉시 사라짐), 마운트 직후
          클래스를 바로 여는 첫 프레임에 트랜지션이 발화하지 않을 위험이 있어 폐기했다 —
          항상 DOM에 상주(opacity-0 + invisible + pointer-events-none)시켜 두 문제를 모두 해소한다. */}

      {/* 헤더+메가패널 아래 전체를 어둡게 dim 처리. 패널(z-50, 불투명)이 위에 그려져
            패널이 차지하는 영역만 자연히 dim이 가려지므로 패널 높이를 따로 측정할 필요가 없다.
            오픈 200ms / 클로즈 120ms 모두 opacity만(이동 없음), ease-out-quart(프로젝트 표준
            이징 — MobileNavDrawer의 ease-(--ease-out-quart) 관례를 그대로 따른다). */}
      <div
        className={`fixed inset-x-0 top-16 bottom-0 z-40 hidden bg-black/30 desktop:block motion-reduce:transition-none motion-reduce:duration-0 ${
          isMegaPanelOpen
            ? "visible opacity-100 pointer-events-auto transition-opacity duration-200 ease-(--ease-out-quart)"
            : isMegaPanelClosing
              ? "visible opacity-0 pointer-events-none transition-opacity ease-(--ease-out-quart)"
              : "invisible opacity-0 pointer-events-none"
        }`}
        style={
          isMegaPanelClosing
            ? { transitionDuration: `${MEGA_PANEL_CLOSING_MS}ms` }
            : undefined
        }
        onClick={() => setActiveMega(null)}
        aria-hidden="true"
      />

      <div
        className={`fixed left-0 top-16 z-50 hidden w-full border-b border-black/5 bg-white shadow-[0_18px_45px_rgba(13,27,42,0.14)] desktop:block motion-reduce:transition-none motion-reduce:duration-0 ${
          isMegaPanelOpen
            ? "visible opacity-100 translate-y-0 pointer-events-auto transition-all duration-180 ease-(--ease-out-quart)"
            : isMegaPanelClosing
              ? "visible opacity-0 translate-y-0 pointer-events-none transition-all ease-(--ease-out-quart)"
              : "invisible opacity-0 -translate-y-2 pointer-events-none"
        }`}
        style={
          isMegaPanelClosing
            ? { transitionDuration: `${MEGA_PANEL_CLOSING_MS}ms` }
            : undefined
        }
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
          {/* (QA 행327 재작업 이후) 메가 컬럼은 여전히 옛 좌표계 2(72.75rem 컨텐츠 영역,
                  mx-auto max-w-content px-8 + MEGA_GUARD marginLeft)를 그대로 쓴다 — 위 nav
                  행은 고정폭 셀에서 텍스트 자연폭 + 반응형 gap으로 바뀌어(return 블록 헤더
                  주석 참고) 더는 "컬럼 0의 시작 x = nav 셀 0의 텍스트 시작 x"가 항상 보장되진
                  않는다(뷰포트·계정 그룹 폭에 따라 nav 항목 x가 유동적이라 고정폭 컬럼과
                  매 순간 좌측선을 공유할 방법이 없다). 메가 패널은 호버로 뜨는 별도 레이어라
                  계정 그룹과 공간을 다투지 않아 QA 대상 겹침(행327)과는 무관하고, 정렬 오차는
                  "러프 디자인 구현" 범위에서 의도적으로 허용했다 — 시각적으로는 여전히 nav
                  아래 대체로 같은 위치에 컬럼이 뜬다(1920 기준 넉넉한 gap 구간에서는 거의 일치).
                  컬럼 폭은 8.75rem(140px) 그대로 유지 — "국제・해외고 국내대 입학컨설팅" 등
                  긴 서브아이템 라벨이 줄바꿈되는 것을 막기 위함이며, 컬럼 gap 0.5rem(8px)도
                  변경하지 않았다(자세한 계산은 src/data/navigation.js 상단 주석 참고).
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
                  {group.items.map((item) => {
                    const isItemActive = item.to === pathname;
                    return (
                      <Link
                        key={`mega-${group.title}-${item.to}-${item.label}`}
                        to={item.to}
                        onClick={() => setActiveMega(null)}
                        aria-current={isItemActive ? "page" : undefined}
                        className={`break-keep text-sm leading-5 transition hover:text-primary ${
                          isItemActive
                            ? "font-semibold text-primary"
                            : "font-medium text-ink"
                        }`}
                      >
                        {item.label}
                      </Link>
                    );
                  })}
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
              className="pointer-events-none ml-auto w-fit bg-surface-footer p-10"
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
                <p className="mt-2 break-keep text-sm leading-[1.4] text-ink">
                  {megaPromo.subtitle}
                </p>

                <img
                  src={megaPromo.image}
                  alt=""
                  className="mx-auto mt-6 h-38 w-auto object-contain"
                />

                <Link
                  to={megaPromo.ctaTo}
                  onClick={() => setActiveMega(null)}
                  className="mt-6 flex h-14 items-center justify-center rounded-xl bg-primary text-base font-semibold text-white transition hover:bg-[#012347]"
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
        activeGroupTitle={activePathTitle}
      />
    </header>
  );
}
