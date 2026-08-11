import { Link, useSearchParams } from 'react-router-dom';

// 마이페이지 탭바(Figma 3762:18713 학생/멘토, 3762:20390 학부모).
// 탭 상태는 URL 쿼리 `?tab=`로 관리한다(MyPage.jsx) — 새로고침·공유 링크에서도
// 활성 탭이 유지되고, 뒤로가기로 이전 탭으로 돌아갈 수 있다.
export default function MyPageTabs({ tabs, activeTab }) {
  const [searchParams] = useSearchParams();

  return (
    <nav className="mt-[6.25rem] flex border-b border-line">
      {tabs.map((tab) => {
        const isActive = tab.key === activeTab;
        const params = new URLSearchParams(searchParams);
        params.set('tab', tab.key);

        return (
          <Link
            key={tab.key}
            to={{ search: `?${params.toString()}` }}
            replace
            aria-current={isActive ? 'page' : undefined}
            className={`border-b-[0.1875rem] p-[1.75rem] text-[1.5rem] leading-[1.3] tracking-[-0.02em] transition-colors ${
              isActive
                ? 'border-primary font-semibold text-primary'
                : 'border-transparent font-medium text-line hover:text-ink'
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
