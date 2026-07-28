/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}"
  ],
  theme: {
    extend: {
      maxWidth: {
        // 전 페이지 공통 컨텐츠 영역 최대 폭 (1200px = 75rem).
        // 헤더/푸터/프리헤더(1500px)와 의도적으로 좁게 설계된 페이지는 예외.
        content: '75rem'
      },
      screens: {
        // 헤더 컨텐츠 폭 제한(max-w-content, 1200px = 75rem)과 동일한 값.
        // 그 이상에서만 데스크톱 인라인 nav+계정 메뉴를 노출한다(그 미만은 전부 모바일 드로어).
        // 근거: 헤더 컨테이너 자체가 1200px로 고정돼 그 안에서 폰트를 text-sm로 통일/축소했기
        // 때문에, 컨텐츠 제한 폭에 도달하는 시점(1200px)과 햄버거 전환 시점을 일치시킨다.
        desktop: '75rem'
      }
    }
  },
  plugins: []
};
