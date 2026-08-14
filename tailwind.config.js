/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      maxWidth: {
        // 전 페이지 공통 컨텐츠 영역 최대 폭 (패딩 px-8 포함 1164px, 내부 콘텐츠 1100px — 0729 시안).
        // lg 이상에서 px-8(64px) 좌우 패딩이 붙으므로 1164 − 64 = 1100px가 실제 콘텐츠 폭.
        // 헤더/푸터/프리헤더(1500px)와 의도적으로 좁게 설계된 페이지는 예외.
        content: "72.75rem",
        // 목표관리 앱(goal-app-shell) 콘텐츠 폭 — docs/figma-goal/00-INDEX.md §6-3.
        // 서브페이지는 리포트 기준 1340px로 통일, 대시보드(메인+레일 합)만 1488px.
        "goal-content": "83.75rem",
        "goal-dashboard": "93rem",
        // 수행평가 앱(/app/performance) 캔버스 콘텐츠 폭 — docs/수행평가-상세-명세.md §3.1 제안.
        // 시안은 1920 고정 좌표(캔버스 좌기준선 384, 사용자 말풍선 우변 1756)지만 그대로 쓰면
        // 좁은 데스크톱에서 깨지므로, 좌측 기준선은 고정하고 콘텐츠는 1320px 상한으로 환산한다.
        "perf-content": "82.5rem",
        // AI 말풍선 폭 596px. 고정폭이 아니라 max-width로 처리한다(§11.3 Q36 미확정 → 넓은 쪽 해석).
        "perf-bubble": "37.25rem",
      },
      // 수행평가 앱 셸 반복 치수 — §7.3. 나머지 치수(폼 카드·모달·버튼)는 화면 단위로만 쓰여
      // 토큰화 이득이 없으므로 각 컴포넌트에서 임의값으로 쓴다.
      spacing: {
        "perf-sidebar": "20.25rem", // 사이드바 폭 324px
        "perf-inset": "3.75rem", // 사이드바·캔버스 좌 인셋 60px
        "perf-canvas": "24rem", // 캔버스 좌기준선 384px (= 324 + 60)
        "perf-pill": "19rem", // 활성 pill 폭 304px (좌우 10px 인셋 후 남는 폭)
      },
      borderRadius: {
        // 모달 대(20px)·저장 리포트 카드. 나머지 반경은 기본 스케일과 일치하므로 토큰을 만들지 않는다
        // — 16px=rounded-2xl(말풍선·카드), 12px=rounded-xl(버튼·큰 입력), 8px=rounded-lg(작은 입력·칩),
        //   6px=rounded-md(사이드바 pill).
        "perf-modal": "1.25rem",
      },
      colors: {
        // 0729 시안 공통 아이브로/포인트 색.
        accent: "#0B84FD",
        // 로그인·회원가입 리뉴얼(로그인/회원가입/약관 화면) 신규 토큰 — docs/login-signup-renewal-spec.md §3.0/§5.4.
        // Primary/Primary(#013262): 브랜드 네이비, 활성 버튼·강조 텍스트·'필수' 라벨.
        primary: "#013262",
        // 목표관리 앱(goal-app-shell) 조언 뱃지 pill — docs/figma-goal/00-INDEX.md §6-1 `action`.
        action: "#3799ff",
        // 목표관리 앱 「나의 노력」 모달 선택 칩 텍스트/보더 — 00-INDEX.md §6-1 `gold`/`Text/Gold`.
        gold: "#af9364",
        ink: {
          // --01(#525252): 본문 텍스트, 입력값.
          DEFAULT: "#525252",
          // --헤더(#4d4d4d): 헤더 GNB 텍스트.
          header: "#4d4d4d",
          // --텍스트(시안 원본 #808080): 푸터 카테고리 등 보조 텍스트.
          // 구현값은 `#6b6b6b`로 시안과 갈라진다 — `#808080`은 최악 배경(surface-04 #f5f5f7)
          // 대비 3.63:1로 WCAG AA(일반 텍스트 4.5:1) 미달이라 상향했다. `#6b6b6b`는 같은
          // 배경에서 4.89:1로 AA를 충족하고, 본문 토큰 `ink.DEFAULT`(#525252, 7.18:1)와
          // 명도 위계도 유지된다.
          sub: "#6b6b6b",
          // --텍스트---타이틀(#181d24): 타이틀 색 토큰(로그인 화면에서 확인).
          title: "#181d24",
          // Text/Strong(#191d23): 멘토신청 시안(docs/mentor-apply-spec.md §4·§6-6) 강조 텍스트.
          // 목표관리 앱(goal-app-shell)의 페이지·카드 제목, 사이드바 활성 메뉴도 동일 토큰 사용 — 00-INDEX.md §6-1.
          // ink.title(#181d24)과 1비트 차이지만 시안이 서로 다른 변수로 분리해 두었으므로
          // 임의 통일하지 않고 별도 토큰으로 둔다(명세 확인 항목 ⑦·⑩).
          strong: "#191d23",
        },
        // (비활성, #d7d7d7): placeholder, 비활성 버튼, 보더, '선택' 라벨, 미체크.
        line: "#d7d7d7",
        // --에러컬러(#eb2626): 필드 에러 메시지(12px).
        error: "#eb2626",
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
        warning: "#fde68a",
        surface: {
          // 카드 배경(#f9fafc): 동의 행/안내 카드.
          card: "#f9fafc",
          // 푸터 배경(#f9fafb): 푸터, 비활성 버튼 텍스트.
          footer: "#f9fafb",
          // --메인-채우기(#e9f4ff): 안내 박스, 자녀 미리보기 카드 배경.
          info: "#e9f4ff",
          // 경고 안내 박스 배경(amber-50 고정값). warning 토큰과 짝, 소비처·확산
          // 금지 사유 동일 — 위 warning 주석 참고.
          warning: "#fffbeb",
          // 목표관리 앱 Surface/01~04(00-INDEX.md §6-1) — 진행바 트랙·채움, 보조 버튼, 사이드바·카드 배경.
          // 01(#D9D9D9): 진행바 트랙, 비활성 버튼.
          "01": "#D9D9D9",
          // 02(#D1E8FF): 진행바 채움.
          "02": "#D1E8FF",
          // 03(#E9F4FF): 보조 버튼('이전'), 선택된 라디오.
          "03": "#E9F4FF",
          // 04(#F5F5F7): 사이드바·카드 배경.
          "04": "#F5F5F7",
          // Surface/02(#d1e8ff): 멘토신청 작성현황 사이드바 번호 배지 배경(명세 §6-3).
          badge: "#d1e8ff",
          // Surface/04(#f5f5f7): 멘토신청 비활성 제출 버튼 배경(명세 §6-8).
          muted: "#f5f5f7",
        },
        // 목표관리 앱(goal-app-shell) 전용 실측색·추정색 — docs/figma-goal/00-INDEX.md §6-1/§6-3, part-09~11.
        // 전부 Figma 변수 미연결(디자이너 확인 전) 또는 스크린샷 육안 판독값이며, 서로 다른 파트 문서가
        // 상충하는 경우(과목 색 등) part-09 판독을 정본으로 채택했다 — 자세한 내용은 작업 보고 참조.
        goal: {
          // 변수 미연결 실측색(00-INDEX.md §6-1 하단).
          sidebar: "#F9F8F7", // 사이드바 배경(카드 배경 surface.04와 별개 톤)
          card: "#FBFBFA", // 카드 기본(neutral) 배경
          activePill: "#EAECEF", // 사이드바 활성 메뉴 pill 배경
          // 우측 레일 카드 톤 4종 — 00-INDEX.md §6-4 "신규 정의 필요 토큰" §3.
          cardTone: {
            neutral: "#FBFBFA",
            mint: "#EAF1EC",
            blue: "#F8FBFE",
            cream: "#FEF6ED",
          },
          // 인사이트 팁 박스 톤 4종(part-11 #33 D/F/G/H 카드) — 정확한 HEX 미기재, 근사값 (추정).
          insight: {
            info: "#E9F4FF", // (추정) 연파랑 — 💡 박스(surface.03 재사용)
            warn: "#FBE8D2", // (추정) 연베이지 — 🚨 박스
            success: "#E3F3E6", // (추정) 연초록 — ✅ 박스
            time: "#EAF4FF", // (추정) 연파랑(시간 계열, info와 미세 구분) — ⌚️ 박스
          },
          // 과목 색 5종(국·수·영·탐·기타) — part-09 §"공통 과목 색" 육안 판독 기준 (추정).
          // ⚠︎ part-11 §167~190(나의 노력 칩)은 국어=red/수학=orange/영어=yellow/탐구=green으로 다르게
          // 판독해 상충한다. 시각적 팔레트가 아직 미확정이라 part-09 쪽(도트·프로그레스 공통색)을 채택.
          subject: {
            korean: "#FCE4EC", // (추정) 연한 핑크
            math: "#E3F2FD", // (추정) 연한 하늘색
            english: "#FFF8E1", // (추정) 연한 크림/옐로
            science: "#E8F5E9", // (추정) 연한 그린(탐구)
            etc: "#F1EDE7", // (추정) 문서 미기재 — 중립 웜그레이로 신규 정의
          },
          // 과목 색 진한 2단계 — 도트·진행바 채움 전용(코드 검수 결함 §2). subject.* 파스텔은
          // 배경(칩) 전용으로 남겨두고, 16px 도트/진행바 채움처럼 surface-01(#D9D9D9)·surface-04
          // (#F5F5F7) 위에 얹히는 요소는 여기 진한 톤을 쓴다. 전부 기존 파스텔의 진한 대응색으로
          // 근사한 신규 정의값이다(디자이너 확인 전) — src/components/goal/subjectTokens.js에서
          // 헬퍼로 함께 제공한다.
          subjectStrong: {
            korean: "#F48FB1", // (추정) subject.korean(#FCE4EC) 진한 대응색
            math: "#64B5F6", // (추정) subject.math(#E3F2FD) 진한 대응색
            english: "#FFD54F", // (추정) subject.english(#FFF8E1) 진한 대응색
            science: "#81C784", // (추정) subject.science(#E8F5E9) 진한 대응색
            etc: "#BCAFA0", // (추정) subject.etc(#F1EDE7) 진한 대응색
          },
          // 요일 색 7종(주간 학습 계획표 헤더 칩/카드 톤) — part-10 §"요일별 색상 코딩" 육안 판독 (추정).
          weekday: {
            mon: "#FCE7EE", // (추정) 연한 핑크·로즈
            tue: "#FDEBDD", // (추정) 연한 피치·오렌지
            wed: "#FDF6D8", // (추정) 연한 옐로우
            thu: "#E6F4E9", // (추정) 연한 그린
            fri: "#E7F0FD", // (추정) 연한 블루
            sat: "#EDEDED", // (추정) 연한 그레이
            sun: "#EDEDED", // (추정) 연한 그레이(카드 없음)
          },
        },
        // 수행평가 학생 앱(/app/performance) 전용 색 — docs/수행평가-상세-명세.md §7.1.
        //
        // ⚠️ goal 네임스페이스와 값이 겹치는 항목이 있다(sidebar #F9F8F7 = goal.sidebar,
        //    activePill #EAECEF = goal.activePill). **의도적으로 합치지 않았다** — 두 앱은 시안이
        //    독립적으로 개정되며, 한쪽 톤 조정이 다른 앱 셸을 조용히 바꾸면 이미 배포된 목표관리
        //    화면이 회귀한다.
        //
        // 반대로 **전역 토큰으로 이미 표현되는 값은 여기 다시 만들지 않았다.** §7.1 표에서 재사용한 것:
        //   · 인앱 primary #013262        → `primary`   (§11.1 Q5 결정. 시안 원본 #37352f 대신 브랜드 네이비)
        //   · 액센트 블루 #0b84fd         → `accent`    (추천 배지, 칩 텍스트, 진행단계 current 배지)
        //   · 본문 텍스트 #525252         → `ink`
        //   · 보조 텍스트 #808080         → `ink-sub`
        //   · 인앱 페이지 타이틀 #191d23  → `ink-strong`
        //   · 스텝 배지 #d1e8ff           → `surface-badge`(= `surface-02`)
        //   · 카드/배지 배경 #f5f5f7      → `surface-04`(= `surface-muted`, 진행단계 todo 배지)
        //   · 빈 상태 카드 #f9fafb        → `surface-footer`
        performance: {
          sidebar: "#f9f8f7", // 사이드바 전면(보더 없이 면 대비만)
          activePill: "#eaecef", // 메뉴/진행단계 활성 pill
          bubble: "#f8f7f5", // AI 말풍선·입력 필드 배경
          // 사용자 말풍선 배경 + AI 아바타 배경(§3.1).
          // ⚠️ primary(#013262)와 **별개 토큰이다. 절대 합치지 마라** — §11.1 Q5는 primary 버튼만
          //    브랜드색으로 옮겼고, 채팅 표면의 #37352f는 시안 원본 그대로 유지하기로 확정했다.
          userBubble: "#37352f",
          reportHeading: "#1b5da0", // 리포트 모달 섹션 라벨 전용
          required: "#991e1e", // 폼 필수 라벨
          chip: "#e7f2fb", // 저장 리포트 산출물 칩(보유) 배경
          tag: "#fff3d1", // 주제 카드 메타 태그 배경(§5.20 회차 소진 배너도 같은 값 — Q80 미확정)
          // 인앱 카드·입력 보더. 전역 `line`(#d7d7d7)과 다른 값이며 섞으면 안 된다 —
          // serviceTokens.js가 #d9d9d9를 폐기색으로 규정하지만 그 규칙은 서비스 랜딩(/services/*)
          // 한정이고, 인앱 시안 21개 노드는 전부 #d9d9d9다(§7.1 단정-충돌 항).
          // surface-01(#D9D9D9)과 값은 같지만 그쪽은 진행바 트랙 면색이라 역할이 다르다.
          line: "#d9d9d9",
          dim: "#00000066", // 모달 딤 오버레이(검정 40%)
        },
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
        desktop: "90rem",
        // 전역 컨텐츠 컨테이너(max-w-content 72.75rem = 1164px)를 잘림 없이 온전히
        // 확보할 수 있는 최소 뷰포트 폭. 기본 lg(1024px)에서 데스크톱 그리드를 켜면
        // 컨테이너 내부가 960px로 줄어드는데 그리드는 1100px을 요구하므로 가로 스크롤
        // 43px과 글리프 절단이 발생한다. 그래서 컨테이너 폭 1164px에 스크롤바 여유
        // 20px을 더해 1184px = 74rem을 데스크톱 그리드 전환 임계값으로 잡았다.
        // 사용처: 랜딩 4STEP·추천대상 그리드, 설문 CascadingSelect.
        wide: "74rem",
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
          "GraceSerif",
          '"Noto Serif KR"',
          '"Nanum Myeongjo"',
          "Batang",
          "AppleMyungjo",
          "serif",
        ],
      },
    },
  },
  plugins: [],
};
