/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      maxWidth: {
        // 전 페이지 공통 컨텐츠 영역 최대 폭 (패딩 px-8 포함 1164px, 내부 콘텐츠 1100px — 0729 시안).
        // lg 이상에서 px-8(64px) 좌우 패딩이 붙으므로 1164 − 64 = 1100px가 실제 콘텐츠 폭.
        // 헤더/푸터/프리헤더(1500px)와 의도적으로 좁게 설계된 페이지는 예외.
        content: '72.75rem',
        // 목표관리 앱(goal-app-shell) 콘텐츠 폭 — docs/figma-goal/00-INDEX.md §6-3.
        // 서브페이지는 리포트 기준 1340px로 통일, 대시보드(메인+레일 합)만 1488px.
        'goal-content': '83.75rem',
        'goal-dashboard': '93rem'
      },
      colors: {
        // 0729 시안 공통 아이브로/포인트 색.
        accent: '#0B84FD',
        // 로그인·회원가입 리뉴얼(로그인/회원가입/약관 화면) 신규 토큰 — docs/login-signup-renewal-spec.md §3.0/§5.4.
        // Primary/Primary(#013262): 브랜드 네이비, 활성 버튼·강조 텍스트·'필수' 라벨.
        primary: '#013262',
        // 목표관리 앱(goal-app-shell) 조언 뱃지 pill — docs/figma-goal/00-INDEX.md §6-1 `action`.
        action: '#3799ff',
        // 목표관리 앱 「나의 노력」 모달 선택 칩 텍스트/보더 — 00-INDEX.md §6-1 `gold`/`Text/Gold`.
        gold: '#af9364',
        ink: {
          // --01(#525252): 본문 텍스트, 입력값.
          DEFAULT: '#525252',
          // --헤더(#4d4d4d): 헤더 GNB 텍스트.
          header: '#4d4d4d',
          // --텍스트(#808080): 푸터 카테고리 등 보조 텍스트.
          sub: '#808080',
          // --텍스트---타이틀(#181d24): 타이틀 색 토큰(로그인 화면에서 확인).
          title: '#181d24',
          // Text/Strong(#191d23): 멘토신청 시안(docs/mentor-apply-spec.md §4·§6-6) 강조 텍스트.
          // 목표관리 앱(goal-app-shell)의 페이지·카드 제목, 사이드바 활성 메뉴도 동일 토큰 사용 — 00-INDEX.md §6-1.
          // ink.title(#181d24)과 1비트 차이지만 시안이 서로 다른 변수로 분리해 두었으므로
          // 임의 통일하지 않고 별도 토큰으로 둔다(명세 확인 항목 ⑦·⑩).
          strong: '#191d23'
        },
        // (비활성, #d7d7d7): placeholder, 비활성 버튼, 보더, '선택' 라벨, 미체크.
        line: '#d7d7d7',
        // --에러컬러(#eb2626): 필드 에러 메시지(12px).
        error: '#eb2626',
        // 경고 텍스트·보더 색. 시안에 없는 신규 토큰(결제 완료 화면 P0 수정,
        // 2026-08-11 사용자 승인). 소비처는 PaymentSuccess.jsx 의 가상계좌
        // 입금대기 안내 박스와 이용 권한부여 지연 안내 박스 두 곳으로 고정한다 —
        // 다른 화면으로 확산 금지.
        // error(#eb2626)를 쓰지 않는 이유: 두 상태 모두 결제 자체는 성공했다.
        // 실패색을 쓰면 성공한 결제를 실패로 오인시킨다.
        // 값은 새 hue 를 만든 게 아니라 기존에 이 화면이 하드코딩해 쓰던
        // amber-200 을 그대로 고정한 것이다(tailwindcss@3.4.19 기본 팔레트 실측) —
        // error/accent/primary 어디에도 없는 "성공도 실패도 아닌 상태"라는
        // 빈 의미 역할이라 예외적으로 config 에 추가했다.
        warning: '#fde68a',
        surface: {
          // 카드 배경(#f9fafc): 동의 행/안내 카드.
          card: '#f9fafc',
          // 푸터 배경(#f9fafb): 푸터, 비활성 버튼 텍스트.
          footer: '#f9fafb',
          // --메인-채우기(#e9f4ff): 안내 박스, 자녀 미리보기 카드 배경.
          info: '#e9f4ff',
          // 경고 안내 박스 배경(amber-50 고정값). warning 토큰과 짝, 소비처·확산
          // 금지 사유 동일 — 위 warning 주석 참고.
          warning: '#fffbeb',
          // 목표관리 앱 Surface/01~04(00-INDEX.md §6-1) — 진행바 트랙·채움, 보조 버튼, 사이드바·카드 배경.
          // 01(#D9D9D9): 진행바 트랙, 비활성 버튼.
          '01': '#D9D9D9',
          // 02(#D1E8FF): 진행바 채움.
          '02': '#D1E8FF',
          // 03(#E9F4FF): 보조 버튼('이전'), 선택된 라디오.
          '03': '#E9F4FF',
          // 04(#F5F5F7): 사이드바·카드 배경.
          '04': '#F5F5F7',
          // Surface/02(#d1e8ff): 멘토신청 작성현황 사이드바 번호 배지 배경(명세 §6-3).
          badge: '#d1e8ff',
          // Surface/04(#f5f5f7): 멘토신청 비활성 제출 버튼 배경(명세 §6-8).
          muted: '#f5f5f7'
        },
        // 목표관리 앱(goal-app-shell) 전용 실측색·추정색 — docs/figma-goal/00-INDEX.md §6-1/§6-3, part-09~11.
        // 전부 Figma 변수 미연결(디자이너 확인 전) 또는 스크린샷 육안 판독값이며, 서로 다른 파트 문서가
        // 상충하는 경우(과목 색 등) part-09 판독을 정본으로 채택했다 — 자세한 내용은 작업 보고 참조.
        goal: {
          // 변수 미연결 실측색(00-INDEX.md §6-1 하단).
          sidebar: '#F9F8F7', // 사이드바 배경(카드 배경 surface.04와 별개 톤)
          card: '#FBFBFA', // 카드 기본(neutral) 배경
          activePill: '#EAECEF', // 사이드바 활성 메뉴 pill 배경
          // 우측 레일 카드 톤 4종 — 00-INDEX.md §6-4 "신규 정의 필요 토큰" §3.
          cardTone: {
            neutral: '#FBFBFA',
            mint: '#EAF1EC',
            blue: '#F8FBFE',
            cream: '#FEF6ED'
          },
          // 인사이트 팁 박스 톤 4종(part-11 #33 D/F/G/H 카드) — 정확한 HEX 미기재, 근사값 (추정).
          insight: {
            info: '#E9F4FF', // (추정) 연파랑 — 💡 박스(surface.03 재사용)
            warn: '#FBE8D2', // (추정) 연베이지 — 🚨 박스
            success: '#E3F3E6', // (추정) 연초록 — ✅ 박스
            time: '#EAF4FF' // (추정) 연파랑(시간 계열, info와 미세 구분) — ⌚️ 박스
          },
          // 과목 색 5종(국·수·영·탐·기타) — part-09 §"공통 과목 색" 육안 판독 기준 (추정).
          // ⚠︎ part-11 §167~190(나의 노력 칩)은 국어=red/수학=orange/영어=yellow/탐구=green으로 다르게
          // 판독해 상충한다. 시각적 팔레트가 아직 미확정이라 part-09 쪽(도트·프로그레스 공통색)을 채택.
          subject: {
            korean: '#FCE4EC', // (추정) 연한 핑크
            math: '#E3F2FD', // (추정) 연한 하늘색
            english: '#FFF8E1', // (추정) 연한 크림/옐로
            science: '#E8F5E9', // (추정) 연한 그린(탐구)
            etc: '#F1EDE7' // (추정) 문서 미기재 — 중립 웜그레이로 신규 정의
          },
          // 과목 색 진한 2단계 — 도트·진행바 채움 전용(코드 검수 결함 §2). subject.* 파스텔은
          // 배경(칩) 전용으로 남겨두고, 16px 도트/진행바 채움처럼 surface-01(#D9D9D9)·surface-04
          // (#F5F5F7) 위에 얹히는 요소는 여기 진한 톤을 쓴다. 전부 기존 파스텔의 진한 대응색으로
          // 근사한 신규 정의값이다(디자이너 확인 전) — src/components/goal/subjectTokens.js에서
          // 헬퍼로 함께 제공한다.
          subjectStrong: {
            korean: '#F48FB1', // (추정) subject.korean(#FCE4EC) 진한 대응색
            math: '#64B5F6', // (추정) subject.math(#E3F2FD) 진한 대응색
            english: '#FFD54F', // (추정) subject.english(#FFF8E1) 진한 대응색
            science: '#81C784', // (추정) subject.science(#E8F5E9) 진한 대응색
            etc: '#BCAFA0' // (추정) subject.etc(#F1EDE7) 진한 대응색
          },
          // 요일 색 7종(주간 학습 계획표 헤더 칩/카드 톤) — part-10 §"요일별 색상 코딩" 육안 판독 (추정).
          weekday: {
            mon: '#FCE7EE', // (추정) 연한 핑크·로즈
            tue: '#FDEBDD', // (추정) 연한 피치·오렌지
            wed: '#FDF6D8', // (추정) 연한 옐로우
            thu: '#E6F4E9', // (추정) 연한 그린
            fri: '#E7F0FD', // (추정) 연한 블루
            sat: '#EDEDED', // (추정) 연한 그레이
            sun: '#EDEDED' // (추정) 연한 그레이(카드 없음)
          }
        }
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
