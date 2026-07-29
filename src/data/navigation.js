// ---- 컨텐츠 격자 공유 상수 (헤더 nav·메가 컬럼·푸터 메뉴가 공유하는 컨텐츠 격자) ----
// 헤더 Header.jsx에서 이전(원래 위치: Header.jsx 상단, 산정 근거 주석 포함). 헤더의
// nav 5개(좌표계 2, 1200 컨텐츠 영역)와 메가 컬럼이 이 상수를 사용해 정렬되며,
// SiteFooter.jsx의 데스크톱 메뉴 grid도 동일 상수를 그대로 참조해 x 격자를 공유한다.
// NAV_GUARD (좁은 데스크톱 충돌 가드, A안 — 로고용, 유지):
//   marginLeft: max(0px, calc(6.625rem − (100vw − 75rem) / 2))
//   6.625rem = 밴드 패딩(px-8=2rem) + LOGO_W(4.625rem) = 로고 우측 끝까지의 안전영역.
//   원래 100vw < 88.25rem(1412px) 구간에서 로고와의 충돌을 막던 값인데, desktop 브레이크포인트가
//   93rem(1488px)으로 올라가면서 데스크톱 인라인 nav가 노출되는 범위(100vw ≥ 93rem)는 항상
//   1412px 조건을 만족해(93rem > 88.25rem) 이 가드는 데스크톱 상태에서 상시 0으로 평가된다.
//   즉 로고 충돌 가드는 현재 실질적으로 비활성(그 미만은 desktop:hidden으로 nav 자체가 없음) —
//   그래도 향후 breakpoint를 다시 낮추는 변경에 대비한 안전망으로 제거하지 않고 유지한다.
// NAV_GAP (겹침 해결 확정안 — 유동 gap):
//   clamp(1rem, calc(1rem + (100vw - 93rem) / 8), 2.5rem)
//   100vw ≤ 93rem(1488px)에서 1rem(16px, 하한) — desktop 브레이크포인트(93rem) 바로 아래에서
//   최소 gap에 도달하도록 맞춘 값. 100vw ≥ 105rem(1680px)에서 2.5rem(40px, 상한, 피그마 시안 값).
//   그 사이(1488~1680px)는 선형 보간. nav row와 메가 컬럼 grid 양쪽 모두 이 식을 그대로
//   참조해(동일 상수) 유동 상태에서도 nav-컬럼 x 정렬이 유지된다.
// nav 5칸 폭(최솟값, gap=1rem) = NAV_ITEM_W 8.75rem×5 + 1rem×4 = 43.75+4 = 47.75rem(764px).
// nav 5칸 폭(최댓값, gap=2.5rem) = 43.75+10 = 53.75rem(860px) < max-w-content 내부 폭(71rem/1136px).
//   좌표계가 분리되어 있어(계정 그룹은 1920 밴드, nav는 1200 컨텐츠 영역) 폭 예산 자체는 서로
//   침범하지 않지만, 두 좌표계가 화면상 인접해 보일 수 있어(특히 로그인/관리자 상태) desktop
//   브레이크포인트(93rem)를 "최소 gap(764px 폭)으로도 로그인 헤더가 안 들어가는 지점"에 맞춰
//   93rem 미만에서는 아예 모바일 드로어로 전환시켜 겹침 자체가 발생하지 않게 했다(Playwright
//   실측으로 nav-계정 그룹 간격이 desktop 범위 전역에서 양수인지 확인 필요).
// 메가 컬럼 폭(NAV_ITEM_W=8.75rem)도 nav 아이템 폭과 동일해 서브아이템 라벨 중
// 긴 것(예: "해외명문대 진학컨설팅")이 넓어진 컬럼 폭 안에서 줄바꿈 없이 한 줄에 들어간다.
export const NAV_GUARD = 'max(0px, calc(6.625rem - (100vw - 75rem) / 2))';
export const NAV_ITEM_W = '8.75rem';
export const NAV_GAP = 'clamp(1rem, calc(1rem + (100vw - 93rem) / 8), 2.5rem)';

// 헤더 메가메뉴·푸터 공용 fallback — DB(page_contents)가 우선, 이 상수는 오프라인/최초 페인트용.
// 시안 2016:1796 기준.
export const FALLBACK_NAV_GROUPS = [
  {
    title: '서비스',
    to: '/free-diagnosis',
    items: [
      { label: '무료진단', to: '/free-diagnosis', sortOrder: 1 },
      { label: '목표관리', to: '/page/services-goal', sortOrder: 2 },
      { label: '콜멘토', to: '/page/services-content', sortOrder: 3 },
      { label: '수행평가', to: '/page/services-ai-performance', sortOrder: 4 },
      { label: '자기평가', to: '/page/services-self-assessment', sortOrder: 5 },
      { label: '심화탐구', to: '/page/services-in-depth-research', sortOrder: 6 }
    ]
  },
  {
    title: '프리미엄',
    to: '/page/premium-a',
    items: [
      { label: '대입컨설팅 프로그램', to: '/page/premium-a', sortOrder: 1 },
      { label: '특목고입학 프로그램', to: '/page/premium-special-highschool', sortOrder: 2 },
      { label: '대학원입학 프로그램', to: '/page/premium-graduate-school', sortOrder: 3 },
      { label: '해외명문대 진학컨설팅', to: '/page/premium-global-university', sortOrder: 4 },
      { label: '국제학교 학습관리', to: '/page/premium-international-school', sortOrder: 5 },
      { label: '국제・해외고 국내대 입학컨설팅', to: '/page/premium-returning-student', sortOrder: 6 }
    ]
  },
  {
    title: '입시정보',
    to: '/admission/guidelines',
    items: [
      { label: '대입모집요강', to: '/admission/guidelines', sortOrder: 1 },
      { label: '입결정보', to: '/admission/results', sortOrder: 2 },
      { label: '수시정시합격', to: '/admission/susi-jungsi', sortOrder: 3 },
      { label: '특목고합격', to: '/page/admission-special-highschool-results', sortOrder: 4 },
      { label: '교육컬럼', to: '/gallery', sortOrder: 5 }
    ]
  },
  {
    title: '이용신청',
    to: '/pricing',
    items: [
      { label: '서비스요금', to: '/pricing', sortOrder: 1 },
      { label: '프리미엄 이용', to: '/page/premium-apply', sortOrder: 2 },
      { label: '멘토신청', to: '/page/mentor-apply', sortOrder: 3 }
    ]
  },
  {
    title: '고객안내',
    to: '/company-news',
    items: [
      { label: '회사소개', to: '/company-news', sortOrder: 1 },
      { label: '공지사항', to: '/events', sortOrder: 2 },
      { label: '자주하는 질문', to: '/faq', sortOrder: 3 },
      { label: '온라인문의', to: '/page/online-inquiry', sortOrder: 4 }
    ]
  }
];

export const MENU_GROUP_ORDER = {
  서비스: 1,
  프리미엄: 2,
  입시정보: 3,
  이용신청: 4,
  고객안내: 5,
  합격전략: 6,
  회사소개: 7
};
