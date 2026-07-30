// 로그인·회원가입 리뉴얼 공통 레이아웃 — docs/login-signup-renewal-spec.md §3.0/§5.1.
// 헤더/푸터는 이 컴포넌트가 렌더하지 않는다(SiteLayout 담당 가정) — 콘텐츠 영역만 책임진다.
// Header가 position:fixed(높이 4rem/64px)이므로 다른 SiteLayout 하위 페이지(Pricing.jsx,
// Home.jsx 등)와 동일하게 pt-16으로 고정 헤더 겹침을 보정한 뒤, 그 안쪽에 spacingY만큼
// 화면별 상하 여백(기본 100px/6.25rem, 일부 화면 200px/12.5rem — 예: E-6 자녀 초대 입력)을
// 추가로 둔다. 자식 요소 사이 간격(섹션 gap, 기본 40px/2.5rem·일부 80px/5rem)은
// flex-col + rowGap으로 처리해 개별 페이지가 매번 gap 클래스를 반복하지 않도록 한다.
export default function AuthLayout({
  children,
  maxWidth = '25rem', // 400px 콘텐츠 컬럼. 약관 안내 타이틀(1064px) 등 예외 화면은 override.
  spacingY = '6.25rem', // 100px. E-6(자녀 초대)처럼 py 200px가 필요하면 '12.5rem' 전달.
  gap = '2.5rem', // 40px 섹션 간격. E-6처럼 80px가 필요하면 '5rem' 전달.
  className = ''
}) {
  return (
    <main className={`min-h-screen w-full bg-white pt-16 ${className}`}>
      <div
        className="mx-auto flex w-full flex-col items-center px-6"
        style={{ maxWidth, paddingTop: spacingY, paddingBottom: spacingY, rowGap: gap }}
      >
        {children}
      </div>
    </main>
  );
}
