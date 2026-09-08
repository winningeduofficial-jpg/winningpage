// 목표관리 앱 서브페이지 공통 헤더 — docs/figma-goal/00-INDEX.md §5-2 `PageHeader`.
// 시안 y=100(타이틀 h42) / y=154(서브카피 h21) 상단 여백을 흐름형(padding-top)으로 근사한다.
// 콘텐츠 시작 x=372px = 사이드바 20.25rem + 거터 48px(3rem) — GoalAppLayout이 사이드바를 이미
// 담당하므로 여기서는 좌측 거터 3rem만 패딩으로 잡는다.
//
// title: 페이지 타이틀(필수). meta: 타이틀 옆 인라인 보조 텍스트(예: D-63, 회차 라벨 등, 옵셔널).
// subcopy: 설명문 1줄(옵셔널). actions: 우측 정렬 액션 슬롯(예: `+ 일정 등록` 버튼, 옵셔널).
// maxWidthClassName: 서브페이지는 기본 83.75rem(1340px), 대시보드만 93rem을 넘겨 쓴다.
//
// 스크롤 접힘(2026-09-06 사용자 확정) — 수행평가 채팅 셸의 타이틀 접힘 관례를 이 헤더에도
// 이식한다. 수행평가는 채팅 캔버스 자체가 스크롤 컨테이너라 CSS `group-has()`만으로 충분했지만,
// 이 헤더가 쓰이는 목표관리 서브페이지는 문서(window) 스크롤이라 그 트릭을 못 쓴다 — 대신
// `sticky` + sentinel + `IntersectionObserver`(useCondensedOnScroll.ts) 조합으로 같은 효과를
// 낸다. `top-(--header-height)`는 AppShellSidebar.tsx가 정의하는 사이트 공통 헤더 높이(4rem)
// 바로 아래에 붙인다는 뜻 — 그 변수 정의를 다시 하지 않고 그대로 구독한다.
import type { ReactNode } from "react";
import { useCondensedOnScroll } from "@/components/goal/useCondensedOnScroll";

type GoalPageHeaderProps = {
  title: ReactNode;
  meta?: ReactNode;
  subcopy?: ReactNode;
  actions?: ReactNode;
  maxWidthClassName?: string;
};

export default function GoalPageHeader({
  title,
  meta,
  subcopy,
  actions,
  maxWidthClassName = "max-w-goal-content",
}: GoalPageHeaderProps) {
  const { sentinelRef, isCondensed } = useCondensedOnScroll();

  return (
    <>
      {/* sentinel은 헤더 "앞"에 둬야 한다 — sticky 헤더 자신을 관찰 대상으로 삼으면
          헤더가 고정되는 순간 그 자신의 교차 상태가 더 이상 스크롤 위치를 반영하지
          않는다. 높이 0이라 레이아웃에 아무 자리도 차지하지 않는다. */}
      <div ref={sentinelRef} aria-hidden="true" className="h-0" />
      {/* z-20: 사이트 공통 헤더(Header.tsx, fixed z-50)보다는 낮고, 데스크톱 고정
          사이드바(ui/sidebar.tsx, z-10)보다는 같거나 높게 — 이 헤더가 사이드바와
          가로로 겹칠 일은 없지만(SidebarInset이 별도 컬럼) 페이지 본문(z 미지정,
          기본값)보다는 위에 있어야 스크롤되는 콘텐츠가 이 헤더 뒤로 지나간다.
          bg-background는 SidebarInset의 기본 배경(ui/sidebar.tsx)과 동일한 토큰이라
          접힌 헤더 뒤로 콘텐츠가 비치지 않는다. */}
      <header
        className={`sticky top-(--header-height) z-20 w-full bg-background px-4 transition-[padding] duration-200 md:px-12 motion-reduce:transition-none ${maxWidthClassName} ${
          isCondensed ? "py-4" : "pb-10 pt-14"
        }`}
      >
        <div className="flex items-start justify-between gap-6">
          <div className="flex flex-wrap items-baseline gap-3">
            <h1
              className={`font-bold text-ink-strong transition-[font-size] duration-200 motion-reduce:transition-none ${
                isCondensed ? "text-app-section" : "text-app-title"
              }`}
            >
              {title}
            </h1>
            {meta && (
              <span className="text-app-body font-medium leading-[1.4] text-ink-sub">
                {meta}
              </span>
            )}
          </div>
          {/* 접힘 상태에도 액션 슬롯(예: "+ 일정 등록")은 그대로 둔다 — 스크롤 중에도
              페이지의 주요 조작을 계속 쓸 수 있어야 한다(수행평가엔 없는 슬롯이라
              참고할 선례가 없어 이 헤더의 기존 계약을 그대로 유지하는 쪽으로 판단). */}
          {actions && (
            <div className="flex shrink-0 items-center gap-2">{actions}</div>
          )}
        </div>
        {/* 서브카피는 `hidden`이 아니라 opacity+max-height로 접는다 — `hidden`은 높이가
            즉시 0이 돼 접히는 도중 타이틀·액션이 위로 튀는 레이아웃 점프가 생긴다.
            max-h-24(6rem)는 이 헤더를 쓰는 페이지들의 가장 긴 서브카피(TargetUniversity,
            2줄로 감싸질 수 있음)도 잘리지 않을 여유치다. */}
        {subcopy && (
          <p
            className={`overflow-hidden text-app-body leading-[1.4] text-ink-sub transition-[opacity,max-height,margin-top] duration-200 motion-reduce:transition-none ${
              isCondensed
                ? "mt-0 max-h-0 opacity-0"
                : "mt-3 max-h-24 opacity-100"
            }`}
          >
            {subcopy}
          </p>
        )}
      </header>
    </>
  );
}
