// ---- 컨텐츠 격자 공유 상수 (헤더 nav·메가 컬럼이 공유하는 컨텐츠 격자, 0729 시안 2207:12337) ----
// 헤더 Header.jsx에서 이전(원래 위치: Header.jsx 상단, 산정 근거 주석 포함). SiteFooter.jsx는
// 이 상수를 import하지 않는다(2026-07-29 확인 — 별도 재작업 예정).
//
// nav 5개 셀(좌표계 2, max-w-content=72.75rem 컨텐츠 영역)과 메가 컬럼은 0729 시안부터
// 서로 다른 폭·gap을 쓴다(예전엔 완전히 동일 상수 공유) — nav 셀이 100px로 좁아지면서
// 메가 컬럼(140px, 긴 라벨 보존 위해 유지)과 더 이상 같은 상수를 쓸 수 없어 분리했다.
// 정렬 기준은 좌측선 공유다 — nav 텍스트가 셀 안에서 좌측 정렬(justify-start)이므로,
// 메가 컬럼 i의 타이틀·아이템 좌측 끝이 nav 셀 i의 텍스트 좌측 끝과 정확히 일치해야 한다.
// 두 그리드의 "피치"(셀/컬럼 폭 + gap)를 148px로 동일하게 맞추면(nav: 100+48, 메가: 140+8)
// 좌측선끼리는 marginLeft를 별도 보정 없이 동일하게 써도 항상 정렬된다(중심 정렬이었던
// 이전 버전은 컬럼이 100px보다 40px 넓어 -20px 오프셋(MEGA_GUARD)이 필요했지만, 좌측선
// 기준에서는 시작점이 같으므로 그 오프셋이 불필요 — MEGA_GUARD를 폐기하고 NAV_GUARD를
// 그대로 재사용한다).
//
// NAV_CELL_W / NAV_CELL_GAP (0729 시안 실측 — nav 5항목):
//   각 항목 100px(6.25rem) 셀, 셀 내부는 좌측 정렬(justify-start), 셀 간 gap 48px(3rem)
//   고정(피치 148px). 과거 유동 clamp(gap)는 폐기 — 시안이 고정값이라 뷰포트별 보간이
//   불필요해졌다.
// MEGA_COL_W / MEGA_COL_GAP:
//   컬럼 폭은 기존 8.75rem(140px) 유지(변경 시 "국제・해외고 국내대 입학컨설팅" 등 긴
//   서브아이템 라벨이 줄바꿈된다). gap은 140+8=148px로 nav 피치와 일치시키기 위한 8px(0.5rem)
//   고정값 — nav와 임의로 다른 값을 쓰면 컬럼-셀 좌측선 정렬이 뷰포트에 따라 어긋난다.
//
// NAV_GUARD (좁은 데스크톱 충돌 가드, 로고용, 유지):
//   marginLeft: max(0px, calc(6.04rem − (100vw − 72.75rem) / 2))
//   6.04rem = 밴드 패딩(px-8=2rem) + LOGO_W(4.04rem, 0729 시안 35px 높이 로고) = 로고 우측
//   끝까지의 안전영역. 72.75rem은 max-w-content 토큰(2026-07-29 1200px→1164px 축소 반영,
//   과거 75rem 참조는 스테일이었다 — 이번에 함께 수정).
//   이 가드는 100vw ≈ 84.83rem(1357px) 이상에서 0으로 수렴한다 — desktop 브레이크포인트(90rem)가
//   그보다 크므로 nav가 보이는 범위 전역에서 항상 0으로 평가된다(로고 충돌 가드는 실질적으로
//   비활성). 밴드 패딩이 2xl(96rem)에서 7.5rem으로 확장되지만, 그 시점엔 이미 가드가 0으로
//   수렴한 지 오래(84.83rem)라 이 가드 공식은 32px 패딩 구간 기준으로 유지해도 안전하다.
//   그래도 향후 breakpoint를 다시 낮추는 변경에 대비한 안전망으로 제거하지 않고 유지한다.
// MEGA_GUARD: 좌측선 정렬 기준에서는 컬럼 0의 시작이 nav 셀 0의 시작과 같아야 하므로
//   NAV_GUARD와 완전히 동일한 값을 그대로 재사용한다(별도 오프셋 보정 없음 — 위 피치
//   설명 참고). 두 이름으로 나눠 export하는 이유는 순수 값이 같더라도 nav/메가 각각의
//   의미를 코드에서 명확히 구분하기 위함이다.
export const NAV_GUARD = 'max(0px, calc(6.04rem - (100vw - 72.75rem) / 2))';
export const MEGA_GUARD = NAV_GUARD;
export const NAV_CELL_W = '6.25rem';
export const NAV_CELL_GAP = '3rem';
export const MEGA_COL_W = '8.75rem';
export const MEGA_COL_GAP = '0.5rem';

// 헤더 메가메뉴·푸터 공용 fallback — DB(page_contents)가 우선, 이 상수는 오프라인/최초 페인트용.
// 시안 2016:1796 기준.
export const FALLBACK_NAV_GROUPS = [
  {
    title: '서비스',
    to: '/learning-diagnosis',
    items: [
      { label: '학습진단', to: '/learning-diagnosis', sortOrder: 1 },
      { label: '목표관리', to: '/services/goal', sortOrder: 2 },
      { label: '콜멘토', to: '/services/callmentor', sortOrder: 3 },
      { label: '수행평가', to: '/services/performance', sortOrder: 4 },
      { label: '자기평가', to: '/services/self-assessment', sortOrder: 5 },
      { label: '심화탐구', to: '/services/research', sortOrder: 6 }
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
      {
        label: '국제・해외고 국내대 입학컨설팅',
        to: '/page/premium-returning-student',
        sortOrder: 6
      }
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
      { label: '교육칼럼', to: '/info/column', sortOrder: 5 }
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

// program_categories(DB) 서비스명 → 서비스 6종 정본 라우트. ServicesSection 카드 클릭 링크가
// DB link 컬럼에 죽은 값(레거시 '/services' 스텁 등)을 담고 있을 때의 이름 기반 안전망.
// FALLBACK_NAV_GROUPS의 '서비스' 그룹 라벨・경로와 동일한 소스오브트루스로 유지할 것.
export const SERVICE_NAME_ROUTES = {
  학습진단: '/learning-diagnosis',
  목표관리: '/services/goal',
  콜멘토: '/services/callmentor',
  수행평가: '/services/performance',
  자기평가: '/services/self-assessment',
  심화탐구: '/services/research'
};

// program_categories(DB) name 컬럼에 아직 남아있는 구 이름 → 화면 표시용 신 이름 매핑.
// 무료진단 → 학습진단 개명 후 링크는 useNavGroups의 PROMOTED_PATH_ROUTES가 이미 신규 라우트로
// 보내고 있지만, DB name 자체가 여전히 '무료진단'이라 서비스 카드에 구 이름이 그대로 노출된다.
// DB 레코드 수정은 운영자 몫(공통 구현 규칙 — DB 수정 금지)이라 PROMOTED_PATH_ROUTES와 같은
// 취지로 여기에 안전망을 둔다. DB 값이 '무료진단'/'무료 진단'(공백 포함) 어느 쪽으로 저장돼
// 있을지 확실치 않아 공백을 제거한 뒤 키를 비교한다. DB name을 '학습진단'으로 마이그레이션하면
// 이 매핑은 더 이상 아무것도 치환하지 않는 상태가 되어 자연히 무해해진다(그때 제거 가능).
const SERVICE_NAME_OVERRIDES = {
  무료진단: '학습진단'
};

export function normalizeServiceName(name) {
  const trimmed = String(name || '').trim();
  const key = trimmed.replace(/\s+/g, '');
  return SERVICE_NAME_OVERRIDES[key] || trimmed;
}

export const MENU_GROUP_ORDER = {
  서비스: 1,
  프리미엄: 2,
  입시정보: 3,
  이용신청: 4,
  고객안내: 5,
  합격전략: 6,
  회사소개: 7
};
