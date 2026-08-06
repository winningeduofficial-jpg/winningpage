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
      fontFamily: {
        // CompanyNews.jsx 히어로 카드 타이틀(font-serif) 전용 — 시안 서체 "BM 우아한 세리프"
        // 웹폰트를 아직 확보하지 못해(assets.md §3-1 blocker) Tailwind 기본 font-serif를 임시
        // 대체로 쓰되, 기본값(ui-serif/Georgia 등 라틴 세리프)은 한글에서 폴백이 OS마다
        // 제각각이라 알려진 한글 세리프 시스템 폰트를 명시적으로 먼저 시도해 폴백 편차를
        // 줄인다. 웹폰트 확보 후 맨 앞에 교체한다.
        serif: [
          '"Noto Serif KR"',
          '"Nanum Myeongjo"',
          'Batang',
          '"AppleMyungjo"',
          'ui-serif',
          'Georgia',
          'serif'
        ]
      },
      screens: {
        // 헤더 데스크톱 인라인 nav+계정 메뉴 전환 시점(0729 시안 2207:12337 재산정).
        // nav 5칸이 고정폭(NAV_CELL_W 6.25rem×5 + NAV_CELL_GAP 3rem×4 = 43.25rem/692px)으로
        // 바뀌면서(과거 유동 clamp 폭 최대 47.75rem/764px보다도 좁음) 필요한 여유가 줄었다.
        // 밴드 패딩(px-8→2xl:px-[7.5rem] 램프, Header.jsx 참고)이 desktop 브레이크포인트
        // 바로 위에서는 아직 px-8(32px)이므로, 그 구간을 기준으로 nav 우측 끝(logo 우측 끝
        // 기준 6.04rem + nav 692px)과 계정 그룹 좌측 끝(로그인/관리자 상태 실측폭 약
        // 31.176rem/499px)이 32px 이상 여유를 두고 공존 가능한 최소값을 계산해 90rem(1440px)로
        // 낮췄다(과거 93rem 대비 -3rem). 2xl(96rem)에서 밴드 패딩이 7.5rem으로 커져도 그 시점엔
        // 컨텐츠 영역이 이미 충분히 넓어져(콘텐츠 좌측 시작 x > 로고 우측 끝) 재충돌하지
        // 않음을 계산으로 확인했다(자세한 산정은 Header.jsx 상단 좌표계 주석 참고).
        // 실제 계정 그룹 폭은 로그인 이름 길이에 따라 가변이라 Playwright 실측으로 별도
        // 검증이 필요하다(기존에도 동일하게 미결이던 리스크 — 이번 변경으로 새로 생긴 것은 아님).
        // desktop 브레이크포인트 사용처는 Header.jsx/MobileNavDrawer.jsx뿐이며 값 변경 시
        // 두 컴포넌트가 자동으로 새 임계값을 따른다(별도 상수 동기화 불필요).
        desktop: '90rem',
        // 전역 컨텐츠 컨테이너(max-w-content 72.75rem = 1164px)를 잘림 없이 온전히
        // 확보할 수 있는 최소 뷰포트 폭. 기본 lg(1024px)에서 데스크톱 그리드를 켜면
        // 컨테이너 내부가 960px로 줄어드는데 그리드는 1100px을 요구하므로 가로 스크롤
        // 43px과 글리프 절단이 발생한다. 그래서 컨테이너 폭 1164px에 스크롤바 여유
        // 20px을 더해 1184px = 74rem을 데스크톱 그리드 전환 임계값으로 잡았다.
        // 사용처: 랜딩 4STEP·추천대상 그리드, 설문 CascadingSelect.
        wide: '74rem'
      },
      fontFamily: {
        // 회사소개 히어로 카드 타이틀 전용 디스플레이 세리프.
        // 서체 = "우아한세리프"(GraceSerif, Pear Type Foundry / 이희배, SIL OFL 1.1).
        // @font-face 는 src/styles/fonts.css. Bold(700) 1종만 로드하므로
        // 이 패밀리를 font-bold 없이 쓰면 유일한 700 face 가 선택돼 항상 Bold 로 조용히 렌더된다
        // (렌더 품질 저하가 없어 육안 검출이 어렵다). 반드시 font-bold 와 함께 쓸 것.
        //
        // 첫 항목 'GraceSerif' 만이 우리가 셀프호스팅한 웹폰트에 매칭된다.
        // 뒤쪽 시스템 세리프는 swap 구간 및 폰트 로드 실패 시의 0바이트 보험이며
        // 전부 "OS 에 설치돼 있을 때만" 적중한다.
        // '우아한세리프' 를 여기 넣지 마라 — 웹폰트가 아니라 OS 로컬 설치본에만 매칭돼
        // 폰트가 설치된 작업자 기기에서 로드 실패를 가려버린다(local() 을 금지한 이유와 동일).
        grace: [
          'GraceSerif',
          '"Noto Serif KR"',
          '"Nanum Myeongjo"',
          'Batang',
          'AppleMyungjo',
          'serif'
        ]
      }
    }
  },
  plugins: []
};
