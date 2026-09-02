// 목표관리 앱 서브페이지 공통 헤더 — docs/figma-goal/00-INDEX.md §5-2 `PageHeader`.
// 시안 y=100(타이틀 h42) / y=154(서브카피 h21) 상단 여백을 흐름형(padding-top)으로 근사한다.
// 콘텐츠 시작 x=372px = 사이드바 20.25rem + 거터 48px(3rem) — GoalAppLayout이 사이드바를 이미
// 담당하므로 여기서는 좌측 거터 3rem만 패딩으로 잡는다.
//
// title: 페이지 타이틀(필수). meta: 타이틀 옆 인라인 보조 텍스트(예: D-63, 회차 라벨 등, 옵셔널).
// subcopy: 설명문 1줄(옵셔널). actions: 우측 정렬 액션 슬롯(예: `+ 일정 등록` 버튼, 옵셔널).
// maxWidthClassName: 서브페이지는 기본 83.75rem(1340px), 대시보드만 93rem을 넘겨 쓴다.
import type { ReactNode } from "react";

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
  return (
    <header className={`w-full px-4 pb-10 pt-25 md:px-12 ${maxWidthClassName}`}>
      <div className="flex items-start justify-between gap-6">
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="text-[1.875rem] font-bold leading-[1.4] text-ink-strong">
            {title}
          </h1>
          {meta && (
            <span className="text-[0.9375rem] font-medium leading-[1.4] text-ink-sub">
              {meta}
            </span>
          )}
        </div>
        {actions && (
          <div className="flex shrink-0 items-center gap-2">{actions}</div>
        )}
      </div>
      {subcopy && (
        <p className="mt-3 text-[0.875rem] leading-[1.4] text-ink-sub">
          {subcopy}
        </p>
      )}
    </header>
  );
}
