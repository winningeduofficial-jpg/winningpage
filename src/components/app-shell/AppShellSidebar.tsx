import type { CSSProperties, ReactNode } from "react";
import {
  Sidebar,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";

// 수행평가·목표관리 앱 셸 공통 좌측 사이드바 래퍼 — 사용자 결정(2026-09-06)
// "목표관리/수행평가 다 같은 스타일로"에 따라 두 셸이 이 파일 하나를 통해서만
// 폭·고정 동작·모바일 대응을 공유한다(FF cohesion — 같이 바뀌는 규칙은 한 곳에).
// PerformanceAppLayout.tsx / GoalAppLayout.tsx가 이 컴포넌트들을 조립하고,
// 사이드바 내부 콘텐츠(프로필·내비 구성)는 각 셸의 *SidebarContent 컴포넌트가 맡는다
// — 이 파일은 "고정·폭·모바일 전환" 규칙만 책임진다.
//
// (2026-09-06 개정) shadcn 공식 블록 sidebar-16("A sidebar with a sticky site
// header", https://ui.shadcn.com/r/styles/base-nova/sidebar-16.json) 구조를
// 그대로 따른다 — 수동 `md:fixed`/`md:top-16`/`md:ml-app-sidebar` 재구현 금지.
// 공식 블록은 `<div className="[--header-height:...]"><SidebarProvider
// className="flex flex-col"><SiteHeader/><div className="flex flex-1">
// <AppSidebar/><SidebarInset/></div></SidebarProvider></div>` 형태이고 헤더가
// `sticky`라 자기 높이를 흐름에 남긴다. 이 저장소의 공통 헤더(Header.tsx)는
// `position:fixed h-16`라 흐름 높이를 남기지 않으므로, 아래
// `AppShellSidebarProvider`가 첫 자식으로 `h-(--header-height)` 스페이서를 둬
// 그 자리를 대신 잡는다 — `--header-height` 정의도 이 컴포넌트 한 곳뿐이다.

// 사이드바 폭 — index.css `@theme`의 `--spacing-app-sidebar`(18rem)가 **데스크톱 고정
// 사이드바**의 정본이다. shadcn Sidebar 내부 유틸(`w-(--sidebar-width)` 등)이 이 CSS
// 변수를 그대로 읽으므로, 데스크톱 폭을 바꾸려면 index.css 토큰 하나만 고치면 된다.
//
// **모바일 Sheet 드로어 폭은 이 토큰을 안 읽는다.** 벤더 파일
// `src/components/ui/sidebar.tsx`의 상수 `SIDEBAR_WIDTH_MOBILE = "18rem"`(모바일
// 분기가 `--sidebar-width`를 이 값으로 인라인 재정의한다)가 정본이라 **두 값을 손으로
// 같게 유지해야 한다** — 지금은 우연히 둘 다 18rem이지만, index.css 토큰만 바꾸면
// 데스크톱과 모바일 드로어 폭이 갈라진다.
//
// (2026-09-06 결정 기록) 벤더 파일 `src/components/ui/*`는 이 저장소의 "CSS 단위는
// rem만" 규칙에서 예외다 — shadcn CLI가 생성한 그대로 유지하는 것이 원칙이라(diff를
// 최소화해 업스트림 업데이트를 쉽게 받기 위함), 리터럴 rem 문자열(`SIDEBAR_WIDTH_MOBILE`
// 같은)을 포함해 그 파일들의 단위 스타일을 이 저장소 관례에 맞춰 고치지 않는다.
const SIDEBAR_WIDTH_STYLE = {
  "--sidebar-width": "var(--spacing-app-sidebar)",
} as CSSProperties;

// SidebarProvider — 사이드바 열림 상태(모바일 Sheet open/close)를 들고 있는
// 컨텍스트 루트. 공식 블록과 같이 `flex flex-col`로 세로 배치해 헤더 스페이서 →
// (사이드바+본문) 행 순서로 쌓는다. `--header-height`는 사이트 공통 헤더
// (Header.tsx)의 실제 클래스 `h-16`(4rem)을 그대로 따라간다 — 다른 값을 새로
// 만들지 않는다.
export function AppShellSidebarProvider({ children }: { children: ReactNode }) {
  return (
    <div className="[--header-height:calc(--spacing(16))]">
      <SidebarProvider className="flex flex-col" style={SIDEBAR_WIDTH_STYLE}>
        {/* Header.tsx가 fixed라 흐름 높이를 안 남기므로, 공식 블록의 sticky
            헤더 대신 이 스페이서가 그 자리를 잡는다. */}
        <div className="h-(--header-height)" />
        {children}
      </SidebarProvider>
    </div>
  );
}

// `collapsible` 기본값(`offcanvas`)을 그대로 쓴다 — 모바일(<768px)에서는 shadcn
// 내장 Sheet 드로어로, 데스크톱에서는 고정(fixed) 사이드바로 자동 분기하는 것도
// Sidebar 컴포넌트 자체 책임이라 여기서 다시 분기할 필요가 없다.
// `collapsible="none"`을 쓰지 않는 이유: 그러면 데스크톱 고정 포지션·좌측
// 여백(gap)이 함께 사라져 다시 수동 `md:fixed`/margin 재구현으로 돌아간다.
// 데스크톱에서 접히지 않는 것은 `SidebarProvider`의 기본 `defaultOpen`(=true)과
// 접기 트리거를 데스크톱에 노출하지 않는 것(`AppShellSidebarTrigger`가
// `md:hidden`)만으로 충분하다.
// `top-(--header-height) h-[calc(100svh-var(--header-height))]!`는 공식 블록의
// `AppSidebar` 클래스 그대로 — 헤더 높이만큼 아래로 내리고, 나머지 뷰포트
// 높이만큼만 채운다(`!`는 Tailwind v4 important 접미사, 기본 `inset-y-0 h-svh`를
// 덮어써야 해서 필요하다).
export function AppShellSidebar({
  children,
  "aria-label": ariaLabel,
}: {
  children: ReactNode;
  /** "수행평가 사이드바" / "목표관리 사이드바" — complementary 랜드마크 이름.
   * shadcn `Sidebar`가 `role`을 자체적으로 주지 않으므로 여기서 붙여야 실제
   * 랜드마크가 된다.
   *
   * **`Sidebar`가 아니라 그 안의 래퍼(`<aside>`)에 건다.** `Sidebar`는 모바일에서
   * `<Sheet {...props}>`(Base UI Dialog.Root, DOM을 그리지 않는다)로 갈라지고
   * `role`/`aria-label`을 포함한 나머지 props는 전부 그 `Sheet`로 흘러간다 —
   * 즉 `Sidebar`에 직접 걸면 데스크톱에서만 랜드마크가 생기고 모바일 드로어에서는
   * 사라진다(그리핑 원인). 데스크톱·모바일 둘 다 `children`을 그대로 렌더하므로,
   * `children`을 감싼 이 wrapper가 두 경로 모두에서 정확히 하나의 랜드마크가 된다
   * (`Sidebar` 자신에는 더 이상 `role`을 걸지 않으므로 데스크톱에 랜드마크가
   * 두 번 생기지도 않는다). */
  "aria-label": string;
}) {
  return (
    <Sidebar className="top-(--header-height) h-[calc(100svh-var(--header-height))]!">
      {/* `<aside>`의 암묵적 role이 이미 `complementary`라 리터럴 `role="complementary"`를
          안 쓴다(biome `lint/a11y/useSemanticElements`). */}
      <aside
        aria-label={ariaLabel}
        className="flex h-full min-h-0 w-full flex-col"
      >
        {children}
      </aside>
    </Sidebar>
  );
}

// 모바일 전용 얇은 트리거 바 — 공식 블록의 `SiteHeader`(사이드바 열기 버튼 자리)를
// 흉내내되, 이 저장소는 사이트 공통 헤더가 이미 따로 있으므로 새 헤더를 만들지
// 않고 `SidebarInset` 상단에 `md:hidden`인 얇은 바 하나만 둔다. 데스크톱에는
// 트리거를 아예 노출하지 않는다(사이드바가 항상 펼쳐져 있어 접을 UI가 없다).
// 목표관리가 갖고 있던 자체 모바일 앱바(제목·"메인으로" 링크)는 이식하지 않는다
// (사용자 지시 "래퍼가 주는 기본만") — 헤더 로고·메뉴가 그 역할을 대신한다.
export function AppShellSidebarTrigger() {
  return (
    <div className="flex h-12 shrink-0 items-center border-b border-sidebar-border px-4 md:hidden">
      <SidebarTrigger aria-label="메뉴 열기" />
    </div>
  );
}
