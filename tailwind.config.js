/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      maxWidth: {
        // 전 페이지 공통 컨텐츠 영역 최대 폭 (패딩 px-8 포함 1164px, 내부 콘텐츠 1100px — 0729 시안).
        // lg 이상에서 px-8(64px) 좌우 패딩이 붙으므로 1164 − 64 = 1100px가 실제 콘텐츠 폭.
        // 헤더/푸터/프리헤더(1500px)와 의도적으로 좁게 설계된 페이지는 예외.
        content: '72.75rem'
      },
      colors: {
        // 0729 시안 공통 아이브로/포인트 색.
        accent: '#0B84FD'
      },
      screens: {
        // 헤더 데스크톱 인라인 nav+계정 메뉴 전환 시점(Header.jsx 겹침 확정안 기준).
        // NAV_GAP이 유동(clamp)으로 최솟값 1rem(16px)까지 수축해도, 로그인(관리자+D-day 배지)
        // 상태의 계정 그룹 실측폭(약 31.176rem/499px) + nav 최소 폭(NAV_ITEM_W 8.75rem×5 +
        // NAV_GAP 최솟값 1rem×4 = 47.75rem/764px) + 여유를 감안하면 좁은 데스크톱에서 두 그룹이
        // 공존할 수 없다. 93rem(1488px)은 NAV_GAP 수식이 하한(1rem)에 도달하는 지점과 정확히
        // 일치시킨 값 — 그 미만은 계정 그룹 상태와 무관하게 항상 모바일 드로어로 전환한다.
        // desktop 브레이크포인트 사용처는 Header.jsx/MobileNavDrawer.jsx뿐이며 값 변경 시
        // 두 컴포넌트가 자동으로 새 임계값을 따른다(별도 상수 동기화 불필요).
        desktop: '93rem'
      }
    }
  },
  plugins: []
};
