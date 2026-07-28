/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}"
  ],
  theme: {
    extend: {
      maxWidth: {
        // 전 페이지 공통 컨텐츠 영역 최대 폭 (1100px = 68.75rem).
        // 헤더/푸터/프리헤더(1500px)와 의도적으로 좁게 설계된 페이지는 예외.
        content: '68.75rem'
      },
      screens: {
        // 헤더/푸터 컨테이너의 max-w-[1500px]와 동일한 값.
        // 그 이상에서만 데스크톱 인라인 nav+계정 메뉴를 노출한다(그 미만은 전부 모바일 드로어).
        // 근거: 로그인+관리자 상태 nav(5그룹) + 이름박스 + 마이페이지 + 관리자 + 로그아웃을
        // 한 줄에 배치하려면 Pretendard 실측 글리프 폭(한글 1자 ≈ 0.865em) 기준 약 1750px가
        // 필요해 1500px 미만 구간에서는 안전하게 들어갈 여지가 없다.
        desktop: '1500px'
      }
    }
  },
  plugins: []
};
