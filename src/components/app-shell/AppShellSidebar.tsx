import type { CSSProperties, ReactNode } from "react";
import {
  Sidebar,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";

// 수행평가·목표관리 앱 셸 공통 좌측 사이드바 래퍼 — 사용자 결정(2026-09-06)
// "목표관리/수행평가 다 같은 스타일로"에 따라 두 셸이 이 파일 하나를 통해서만
// 폭·고정 동작·모바일 대응을 공유한다(FF cohesion — 같이 바뀌는 규칙은 한 곳에).
// PerformanceAppLayout.tsx / GoalAppLayout.tsx가 이 컴포넌트들을 조립하고,
// 사이드바 내부 콘텐츠(프로필·내비 구성)는 각 셸의 *SidebarContent 컴포넌트가 맡는다
// — 이 파일은 "고정·폭·모바일 전환" 규칙만 책임진다.
//
// 사이트 공통 헤더(Header.tsx)는 `position:fixed h-16`(4rem)로 두 셸 최상단에
// 이미 깔려 있다(PerformanceAppLayout 선례, GoalAppLayout도 이번에 동일하게
// 붙인다). shadcn Sidebar는 `fixed inset-y-0 h-svh`가 기본이라 그대로 두면
// 헤더와 겹치므로, 데스크톱 분기(아래 AppShellSidebar)에서 `top-16` +
// `h-[calc(100svh-4rem)]`로 헤더 높이만큼 오프셋한다 — 이 계산이 딱 한 곳
// (여기)에만 있어야 두 셸이 어긋나지 않는다.

// 사이드바 폭 — index.css `@theme`의 `--spacing-app-sidebar`(18rem)가 정본이다.
// shadcn Sidebar 내부 유틸(`w-(--sidebar-width)` 등)이 이 CSS 변수를 그대로
// 읽으므로, 폭을 바꾸려면 index.css 토큰 하나만 고치면 두 셸이 함께 바뀐다.
const SIDEBAR_WIDTH_STYLE = {
  "--sidebar-width": "var(--spacing-app-sidebar)",
} as CSSProperties;

// SidebarProvider — 사이드바 열림 상태(모바일 Sheet open/close)를 들고 있는
// 컨텍스트 루트. 두 셸 모두 `<Header /> 아래에서 이 프로바이더로 사이드바+본문을
// 감싼다(본문 자체의 `pt-16`/사이드바 폭만큼의 좌측 여백은 각 셸의 `<main>`이
// 직접 진다 — 이 프로바이더는 폭 변수 주입과 열림 상태 관리만 한다.
export function AppShellSidebarProvider({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider style={SIDEBAR_WIDTH_STYLE}>{children}</SidebarProvider>
  );
}

// 데스크톱: `collapsible="none"` — 접기/아이콘 모드 없이 항상 펼쳐진 고정
// 사이드바(사용자 결정, 두 셸 다 접기 기능 자체가 없었다). 모바일(<768px,
// `useIsMobile`이 Tailwind `md` 브레이크포인트와 동일 768px 기준)에서는
// `collapsible="offcanvas"`로 바뀌어 shadcn 내장 Sheet 드로어가 대신 렌더된다
// (Sidebar 컴포넌트 자체 분기 — `isMobile`이면 `className`의 고정 포지션 클래스는
// 아예 쓰이지 않고 Sheet 쪽 마크업만 렌더된다, 아래 md: 접두는 그 사이 짧은
// 순간(최초 렌더 시 `isMobile`이 아직 `false`로 초기화돼 있는 구간)에도 좁은
// 화면에서 고정 포지션이 실수로 적용되지 않게 하는 이중 안전장치다).
export function AppShellSidebar({
  children,
  "aria-label": ariaLabel,
}: {
  children: ReactNode;
  /** "수행평가 사이드바" / "목표관리 사이드바" — complementary 랜드마크 이름.
   * shadcn `Sidebar`(collapsible="none")는 `<div>`만 렌더하므로 여기서
   * `role="complementary"`와 함께 붙여야 실제 랜드마크가 된다. */
  "aria-label": string;
}) {
  const { isMobile } = useSidebar();

  return (
    <Sidebar
      collapsible={isMobile ? "offcanvas" : "none"}
      role="complementary"
      aria-label={ariaLabel}
      className="md:fixed md:inset-y-0 md:top-16 md:z-20 md:h-[calc(100svh-4rem)]"
    >
      {children}
    </Sidebar>
  );
}

// 모바일 전용 사이드바 열기 버튼 — shadcn 기본 `SidebarTrigger`(햄버거 아이콘)를
// 그대로 쓴다. 목표관리가 갖고 있던 자체 상단 앱바(제목·"메인으로" 링크 포함)는
// 커스텀 모바일 디자인이라 이식하지 않는다(사용자 지시 "래퍼가 주는 기본만") —
// 수행평가는 원래 모바일 대응이 없었으므로 이 트리거 하나로 두 셸이 동일한
// 모바일 진입점을 갖게 된다.
export function AppShellSidebarTrigger() {
  return (
    <SidebarTrigger
      aria-label="메뉴 열기"
      className="fixed left-4 top-19 z-30 border border-sidebar-border bg-sidebar text-ink-strong shadow-sm hover:bg-sidebar-accent md:hidden"
    />
  );
}
