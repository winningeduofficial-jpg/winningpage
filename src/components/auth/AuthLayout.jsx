// 로그인·회원가입 리뉴얼 공통 레이아웃 — docs/login-signup-renewal-spec.md §3.0/§5.1.
// 헤더/푸터는 이 컴포넌트가 렌더하지 않는다(SiteLayout 담당 가정) — 콘텐츠 영역만 책임진다.
// Header가 position:fixed(높이 4rem/64px)이므로 다른 SiteLayout 하위 페이지(Pricing.jsx,
// Home.jsx 등)와 동일하게 pt-16으로 고정 헤더 겹침을 보정한 뒤, 그 안쪽에 spacing만큼
// 화면별 상하 여백(기본 100px/6.25rem, 일부 화면 200px/12.5rem — 예: E-6 자녀 초대 입력)을
// 추가로 둔다. 자식 요소 사이 간격(섹션 gap, 기본 40px/2.5rem·일부 80px/5rem)은
// flex-col + gap 클래스로 처리해 개별 페이지가 매번 gap 클래스를 반복하지 않도록 한다.
// 반응형(adapt.md): 인라인 style은 브레이크포인트를 못 태우므로 prop을 원값 대신 토큰으로
// 받아 모바일 우선 클래스 맵으로 치환한다 — 시안 값(100/200px, 40/80px)은 md: 이상에서만
// 적용되고, 모바일 base는 축소된 값으로 램프한다. width는 항상 유동(px-6 안에서 max-w 상한).
const WIDTH_CLASSES = {
  default: 'max-w-[25rem]', // 400px 콘텐츠 컬럼. 약관 안내 타이틀(1064px) 등 예외 화면은 'wide'.
  // 결제 플로우 시안(1882-9058 계열)의 로그인 화면 콘텐츠 컬럼 실측 460px ÷16 = 28.75rem
  // (1920·1280 동일). default(400px)를 바꾸면 이 컴포넌트를 공유하는 회원가입·약관 화면
  // 전체가 함께 넓어지므로 로그인 전용 키로 분리했다 — Login.jsx 에서 width="login" 으로 옵트인.
  login: 'max-w-[28.75rem]',
  wide: 'max-w-[66.5rem]' // D-1 등 예외 화면.
};

const SPACING_CLASSES = {
  default: 'py-12 md:py-[6.25rem]', // 48px → md 100px
  tall: 'py-16 md:py-[12.5rem]' // 64px → md 200px. E-6(자녀 초대)처럼 py 200px가 필요하면 'tall' 전달.
};

const GAP_CLASSES = {
  default: 'gap-8 md:gap-10', // 32px → md 40px
  wide: 'gap-12 md:gap-20' // 48px → md 80px. E-6처럼 80px가 필요하면 'wide' 전달.
};

export default function AuthLayout({
  children,
  width = 'default', // 'default' | 'login' | 'wide'
  spacing = 'default', // 'default' | 'tall'
  gap = 'default', // 'default' | 'wide'
  className = ''
}) {
  return (
    <main className={`min-h-screen w-full bg-white pt-16 ${className}`}>
      <div
        className={`auth-step-enter mx-auto flex w-full flex-col items-center px-6 sm:px-0 ${
          WIDTH_CLASSES[width] || WIDTH_CLASSES.default
        } ${SPACING_CLASSES[spacing] || SPACING_CLASSES.default} ${
          GAP_CLASSES[gap] || GAP_CLASSES.default
        }`}
      >
        {children}
      </div>
    </main>
  );
}
