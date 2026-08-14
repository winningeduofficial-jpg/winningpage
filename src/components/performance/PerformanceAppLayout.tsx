import { Outlet } from "react-router-dom";
import {
  PerformanceShellProvider,
  usePerformanceShell,
} from "../../context/PerformanceShellContext";
import { ToastProvider } from "../../context/ToastContext";
import PerformanceSidebar from "./PerformanceSidebar";
import QuotaExhaustedBanner from "./quota/QuotaExhaustedBanner";

// 수행평가 학생 앱 셸 — docs/수행평가-상세-명세.md §3.1(전체 골격) / §3.5(헤더).
//
// 시안 21개 인앱 노드가 전부 이 셸을 공유한다: 좌측 고정 사이드바 + 우측 채팅 캔버스.
// §3.5 단정대로 **사이트 공통 헤더·푸터를 쓰지 않는다** — 캔버스 상단의
// `위닝 수행평가 서비스` 텍스트가 유일한 헤더 요소이며 구분선·툴바가 없다.
// 그래서 App.jsx에서 이 라우트 그룹을 SiteLayout 밖에 둔다(목표관리 GoalAppLayout 선례와 동일).
//
// 세션 컨텍스트는 여기서 감싸지 않는다. App.jsx가
//   <SessionProvider> → <RequireEntitlement> → <PerformanceAppLayout>
// 순으로 이미 배선했고(SessionContext.jsx 상단 배선 주석이 정본), 셸이 다시 감싸면
// 이용권 조회가 2벌이 돼 같은 화면에서 잔여 회차가 갈라진다.
//
// GoalAppLayout과 코드 형태가 닮았지만 **공통 셸로 추출하지 않았다.** 두 앱은
// 사이드바 구성(목표관리 4그룹 10항목 vs 수행평가 메뉴 2 + 진행단계 5스텝 상태머신),
// 헤더 유무(수행평가만 캔버스 타이틀), 콘텐츠 폭 규칙이 서로 다르고 시안도 독립적으로
// 개정된다. 지금 공통화하면 공통 컴포넌트가 곧 분기 플래그 덩어리가 되고, 그 리스크를
// 이미 dev에 머지된 목표관리 화면이 진다.
//
// TODO(반응형): 명세서는 인앱 셸의 브레이크포인트를 정의하지 않았다(§11.3에도 항목 없음).
//   그래서 §3.1 제안대로 **데스크톱 1920 기준 고정 레이아웃**으로 둔다 — 사이드바 고정
//   20.25rem, 캔버스는 좌 인셋 3.75rem + 콘텐츠 max-width 82.5rem 좌측 정렬.
//   좁은 화면·모바일 대응은 이번 범위 밖이며, 임의 모바일 레이아웃을 만들지 않는다.
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
  const { stepStates, quotaBannerVisible } = usePerformanceShell();

  return (
    <div className="flex min-h-screen bg-white">
      {/* 사이드바는 표시 전용이라 prop을 받는다(프로필 이름·학교유형·학년, 진행단계 5스텝 상태).
          진행단계(stepStates)는 위 PerformanceShellProvider를 통해 채팅 페이지가 배선했다(P13
          해소). TODO(P5): `GET /api/performance/bootstrap`의 `profile`/`lastSession`을 셸에서
          한 번 읽어 프로필 이름·학교유형·학년으로 내려보내는 작업은 아직 남아 있다. 지금 그
          값을 넘기지 않는 것은 배선이 없어서지 기본값이 정본이라서가 아니다 — 없는 값 자리에
          가짜 이름·리터럴 학교유형을 채우지 않는 것이 §11 Q61-ⓔ 규칙이다. */}
      <PerformanceSidebar stepStates={stepStates} />

      {/* 캔버스. 좌 인셋만 지정해 좌기준선 384px(사이드바 324 + 60)을 맞추고, 우측은
          콘텐츠 max-width가 남긴 여백으로 처리한다(§7.3 「좌우 대칭 padding 금지」 규칙).
          pr은 좁은 뷰포트에서 글자가 화면 우변에 붙지 않게 하는 안전 여백일 뿐이다. */}
      <main className="min-w-0 flex-1 pb-[6.25rem] pl-perf-inset pr-perf-inset pt-[6.25rem]">
        <div className="max-w-perf-content">
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
          <h1 className="text-[2rem] font-semibold leading-[2.625rem] tracking-[-0.04rem] text-ink-strong">
            위닝 수행평가 서비스
          </h1>

          <Outlet />
        </div>
      </main>
    </div>
  );
}
