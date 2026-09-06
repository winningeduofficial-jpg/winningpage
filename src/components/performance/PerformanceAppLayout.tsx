import { useQuery } from "@tanstack/react-query";
import { Outlet } from "react-router";
import {
  AppShellSidebarProvider,
  AppShellSidebarTrigger,
} from "@/components/app-shell/AppShellSidebar";
import Header from "@/components/Header";
import RouteLoadingOverlay from "@/components/ui/RouteLoadingOverlay";
import {
  PerformanceShellProvider,
  usePerformanceShell,
} from "@/context/PerformanceShellContext";
import { useSession } from "@/context/SessionContext";
import { ToastProvider } from "@/context/ToastContext";
import { pickKnownSchoolType } from "@/lib/performance/schoolType";
import { performanceBootstrapQueryOptions } from "@/lib/queryClient";
import PerformanceSidebar from "./PerformanceSidebar";
import QuotaExhaustedBanner from "./quota/QuotaExhaustedBanner";

// 수행평가 학생 앱 셸 — docs/수행평가-상세-명세.md §3.1(전체 골격) / §3.5(헤더).
//
// 시안 21개 인앱 노드가 전부 이 셸을 공유한다: 좌측 고정 사이드바 + 우측 채팅 캔버스.
// (QA 행279, 2026-09-06 개정) §3.5의 "사이트 공통 헤더를 쓰지 않는다" 단정은 폐기한다 —
// 디자이너 시안(Figma 3754-3562)이 공개 페이지와 같은 공통 헤더를 앱 화면 최상단에
// 두고 있고, 사용자가 그 시안대로 확정했다. 헤더는 새로 만들지 않고 공개 페이지 정본
// `Header.tsx`를 그대로 재사용한다(SiteLayout이 그리는 것과 같은 컴포넌트).
// **사이트 공통 푸터는 여전히 쓰지 않는다** — 앱 화면 하단은 그대로 캔버스로 끝난다.
// 이 결정으로 사이드바 상단 "메인으로" 링크·하단 "메인으로 나가기" 버튼(QA 행318/280)은
// 제거했다 — 헤더 로고·메뉴가 메인 이동 통로 역할을 대신한다.
// 그래서 App.jsx에서 이 라우트 그룹을 SiteLayout 밖에 둔다(목표관리 GoalAppLayout 선례와 동일).
//
// 세션 컨텍스트는 여기서 감싸지 않는다. App.jsx가
//   <SessionProvider> → <RequireEntitlement> → <PerformanceAppLayout>
// 순으로 이미 배선했고(SessionContext.jsx 상단 배선 주석이 정본), 셸이 다시 감싸면
// 이용권 조회가 2벌이 돼 같은 화면에서 잔여 회차가 갈라진다.
//
// GoalAppLayout과 코드 형태가 닮았지만 **레이아웃 전체를 공통 셸로 추출하지는
// 않았다.** 사이드바의 "고정·폭·모바일 전환" 규칙만 공통(AppShellSidebar.tsx,
// 2026-09-06 개정)이고, 사이드바 콘텐츠 구성(목표관리 4그룹 10항목 vs 수행평가
// 메뉴 2 + 진행단계 5스텝 상태머신)·캔버스 폭 규칙·페이지 타이틀 유무는 여전히 서로
// 다르고 시안도 독립적으로 개정된다. 이 두 컴포넌트(PerformanceAppLayout/
// GoalAppLayout) 자체를 하나로 합치면 공통 컴포넌트가 곧 분기 플래그 덩어리가 된다.
//
// 예외 하나: RouteLoadingOverlay(소프트 내비게이션 로딩 표시)는 순수 UI라 두 셸이
// 그대로 공유한다 — 사이드바・콘텐츠 폭 같은 화면 고유 규칙이 전혀 없고, 판정 방식이
// 다른(수행평가는 middleware가 아니라 RequireEntitlement) 두 셸에도 useNavigation()
// 훅 자체는 동일하게 동작하기 때문이다(App.tsx가 두 라우트 그룹을 같은
// createBrowserRouter 하나로 묶는다).
//
// (2026-09-06 개정) 사이드바 shadcn Sidebar 전환(AppShellSidebar.tsx, 사용자 결정
//   "목표관리/수행평가 다 같은 스타일로") 이후 모바일 대응이 더 이상 범위 밖이 아니다 —
//   768px 미만에서는 AppShellSidebarProvider가 내장 Sheet 드로어로 자동 전환한다.
//   데스크톱은 여전히 사이드바 고정 18rem(`--spacing-app-sidebar`), 캔버스는 좌 인셋
//   3.75rem + 콘텐츠 max-width 82.5rem 좌측 정렬(§3.1 제안 그대로).
export default function PerformanceAppLayout() {
  return (
    // ToastProvider는 P18 토스트 컨텍스트 배선 — src/context/ToastContext.jsx 참고.
    // 이 셸 하위 전 화면(STEP1~5, 리포트, 마이리포트)이 useToast()를 공유한다.
    <ToastProvider>
      {/* PerformanceShellProvider(P13) — 채팅 페이지(Outlet 자식)가 라이브 세션 상태에서
          파생한 진행단계 5스텝 상태를 이 셸의 사이드바로 올리는 통로. 값 자체는
          `PerformanceShellContent`가 컨텍스트에서 읽어 사이드바로 내려보낸다(주석은
          src/context/PerformanceShellContext.jsx 참고). */}
      <PerformanceShellProvider>
        <PerformanceShellContent />
      </PerformanceShellProvider>
    </ToastProvider>
  );
}

function PerformanceShellContent() {
  const { stepStates, quotaBannerVisible, sessionGradeLabel } =
    usePerformanceShell();
  // 사이드바 프로필 슬롯(P5) — `session`은 SessionProvider가 이미 판정해 둔 값을
  // 그대로 읽는다(이 셸이 새로 감싸지 않는 이유는 위 주석 참고, 이용권 조회 2벌
  // 방지와 같은 원칙). bootstrap 캐시는 채팅 페이지(Outlet 자식)의
  // `fetchQuery({ ...옵션, staleTime:0 })`가 이미 채워 두므로, 이 useQuery는 보통
  // 그 결과를 그대로 구독만 한다 — 저장 리포트 등 채팅 페이지를 거치지 않고 이
  // 셸에 먼저 진입하는 경로에서만 자체적으로 조회한다.
  const { session, userId } = useSession();
  const accessToken = session?.access_token || null;
  const { data: bootstrap } = useQuery(
    performanceBootstrapQueryOptions(userId, accessToken),
  );
  const schoolType = pickKnownSchoolType(bootstrap?.profile.schoolType);
  // 학년 우선순위(PerformanceShellContext.tsx 주석) — 라이브 세션(이번 방문 STEP1
  // 입력값)이 bootstrap의 마지막 스냅샷보다 항상 우선한다. 채팅 페이지 밖(저장
  // 리포트 등)에서는 `sessionGradeLabel`이 null이라 자연히 bootstrap 값으로
  // 떨어진다.
  const gradeLabel =
    sessionGradeLabel ?? bootstrap?.lastSession?.gradeLabel ?? null;

  return (
    <>
      {/* 공개 페이지 정본 헤더(Header.tsx) 그대로 재사용 — `position:fixed h-16`(4rem)이라
          자기 자신은 레이아웃 흐름의 높이를 차지하지 않는다. 그래서 아래 행 컨테이너에
          `pt-16`을 별도로 줘 헤더 높이(4rem)만큼 사이드바·캔버스를 함께 밀어낸다
          (Tailwind preflight box-sizing: border-box라 min-h-screen 총높이 안에
          padding-top이 포함되므로 뷰포트보다 커지지 않는다 — 아래 사이드바 min-h 주석과
          같은 계산). 헤더 높이 값은 새 상수를 만들지 않고 Header.tsx의 실제 클래스(`h-16`)를
          그대로 따라간다 — 다른 페이지들(MentorApply.tsx 등)도 전부 이 값을 pt-16으로
          하드코딩해 참조하는 것이 기존 관례다. */}
      <Header />
      <AppShellSidebarProvider>
        <div className="flex min-h-screen w-full bg-white pt-16">
          {/* 사이드바는 표시 전용이라 prop을 받는다(프로필 이름·학교유형·학년, 진행단계 5스텝
            상태). 진행단계(stepStates)는 위 PerformanceShellProvider를 통해 채팅 페이지가
            배선했다(P13 해소). 프로필(이름·학교유형·학년, P5)은 이 컴포넌트가 bootstrap
            캐시(performanceBootstrapQueryOptions)를 직접 구독해 내려보낸다 — 값이 없으면
            undefined/null 그대로 넘긴다(§11 Q61-ⓔ, 가짜 이름·리터럴 학교유형 금지). */}
          <PerformanceSidebar
            profileName={bootstrap?.profile.name ?? null}
            schoolType={schoolType}
            gradeLabel={gradeLabel}
            stepStates={stepStates}
          />
          <AppShellSidebarTrigger />

          {/* 캔버스. md 이상에서 `ml-app-sidebar`로 고정 사이드바 폭만큼 통째로
            밀어내고(AppShellSidebar가 사이드바를 문서 흐름 밖으로 fixed 처리하므로
            이 margin이 없으면 본문이 사이드바 밑에 깔린다), 그 안쪽에서 다시
            좌 인셋(3.75rem, `pl-perf-inset`)을 지정해 좌기준선을 맞춘다. 우측은
            콘텐츠 max-width가 남긴 여백으로 처리한다(§7.3 「좌우 대칭 padding 금지」
            규칙). pr은 좁은 뷰포트에서 글자가 화면 우변에 붙지 않게 하는 안전
            여백일 뿐이다. */}
          <main className="relative flex h-[calc(100svh-4rem)] min-w-0 flex-1 flex-col overflow-hidden pl-perf-inset pr-perf-inset pt-14 md:ml-app-sidebar">
            <RouteLoadingOverlay />
            <div className="flex min-h-0 w-full max-w-perf-content flex-1 flex-col">
              {/* 회차 소진 배너(§5.20 (A), P15 [FIX]) — 페이지 타이틀 위, 캔버스 최상단.
                조건 판정은 이 컴포넌트가 하지 않는다 — 채팅 페이지(Outlet 자식)가
                `quotaRemaining === 0 && 진행 중 세션 없음`을 판정해 셸 컨텍스트로
                올리고(PerformanceChatPage.jsx), 여기는 그 값을 그대로 읽어 렌더만 한다.
                저장 리포트 등 판정 근거가 없는 화면은 기본값 false라 배너가 뜨지 않는다
                (PerformanceShellContext.jsx 주석 참고). */}
              {quotaBannerVisible && <QuotaExhaustedBanner />}

              {/* 페이지 타이틀 @384,100 — 2rem/2.625rem w600 ink-strong(#191d23) ls -0.04rem (§7.2).
                TODO(P6): §3.5 제안의 `통합 설계 리포트` 보조 버튼(설계 리포트 생성 이후에만 노출)은
                §11 Q7 미결이라 아직 만들지 않는다. */}
              <h1 className="text-app-title font-semibold tracking-[-0.02rem] text-ink-strong">
                위닝 수행평가 서비스
              </h1>

              <div className="flex min-h-0 flex-1 flex-col">
                <Outlet />
              </div>
            </div>
          </main>
        </div>
      </AppShellSidebarProvider>
    </>
  );
}
