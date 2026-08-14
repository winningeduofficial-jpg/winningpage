import { Link, useSearchParams } from "react-router-dom";

// 마이페이지 탭바(Figma 3762:18713 학생/멘토, 3762:20390 학부모).
// 탭 상태는 URL 쿼리 `?tab=`로 관리한다(MyPage.jsx) — 새로고침·공유 링크에서도
// 활성 탭이 유지되고, 뒤로가기로 이전 탭으로 돌아갈 수 있다.
type MyPageTab = {
  key: string;
  label: string;
  badges?: Array<{ label: string; count: number }>;
};

type MyPageTabsProps = {
  tabs: MyPageTab[];
  activeTab: string;
};

export default function MyPageTabs({ tabs, activeTab }: MyPageTabsProps) {
  const [searchParams] = useSearchParams();

  return (
    <nav className="mt-[6.25rem] flex border-b border-line">
      {tabs.map((tab) => {
        const isActive = tab.key === activeTab;
        const params = new URLSearchParams(searchParams);
        params.set("tab", tab.key);

        return (
          <Link
            key={tab.key}
            to={{ search: `?${params.toString()}` }}
            replace
            aria-current={isActive ? "page" : undefined}
            className={`border-b-[0.1875rem] p-[1.75rem] text-[1.5rem] leading-[1.3] tracking-[-0.02em] transition-colors ${
              isActive
                ? "border-primary font-semibold text-primary"
                : "border-transparent font-medium text-line hover:text-ink"
            }`}
          >
            <span className="flex items-center gap-2">
              {tab.label}
              {/* 대기 건수 배지 — 확정 디자인 3967:3944 의 "결제 요청 1"·"환불 요청 1".
                  실측: 높이 32, radius 8, 배경 #fff3d1, 글자 #af9364(gold).
                  0건이면 렌더하지 않는다(빈 배지가 붙으면 탭 폭만 흔들린다). */}
              {(tab.badges || [])
                .filter((badge) => badge.count > 0)
                .map((badge) => (
                  <span
                    key={badge.label}
                    className="inline-flex h-8 shrink-0 items-center rounded-lg bg-[#fff3d1] px-3 text-[0.875rem] font-semibold text-gold"
                  >
                    {badge.label} {badge.count}
                  </span>
                ))}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
