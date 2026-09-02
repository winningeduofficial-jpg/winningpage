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
// NAV_CELL_W / NAV_CELL_GAP (2026-09-03 신규 시안 header-footer-figma-2026-09.md §1·§2 실측):
//   nav 항목·메가 컬럼이 이번 시안부터 완전히 같은 값(w 160px/10rem, gap 48px/3rem, 피치
//   208px/13rem)을 쓴다 — 예전(100px/140px 불일치)과 달리 두 상수를 더는 분리할 이유가
//   없어 MEGA_COL_W/MEGA_COL_GAP이 NAV_CELL_W/NAV_CELL_GAP을 그대로 재사용한다.
//   1920(120rem)에서 시안 실값과 일치하고, desktop 브레이크포인트 하한(90rem=1440px)까지
//   clamp(vw)로 비례 축소한다(§7 가정) — 8.3333vw = 160/1920*100, 2.5vw = 48/1920*100이라
//   1920에서 각각 10rem/3rem에 도달하고 그 이상은 clamp 상한(10rem/3rem)에 고정, 1440에서는
//   각각 120px(7.5rem)/36px(2.25rem)로 줄어든다(클램프 하한).
// NAV_GUARD / MEGA_GUARD (좁은 데스크톱 충돌 가드, 메가 컬럼용):
//   marginLeft: max(0px, calc(14rem − (100vw − 72.75rem) / 2))
//   14rem = 2xl 밴드 패딩(px-30=7.5rem) + LOGO_W(6.5rem, dev 현행 스택형 로고 — 2026-09-03
//   사용자 결정으로 신규 시안 가로형 로고 대신 유지, Header.tsx LOGO_W 주석 참고) = 2xl
//   기준 로고 우측 끝까지의 안전영역. 72.75rem은 max-w-content 토큰(메가 컬럼이 속한
//   좌표계 2의 폭, 이번 변경 대상 아님).
//   nav는 이제 3존 flex(로고 shrink-0/nav flex-1/계정 shrink-0, QA 행327 결정)로 렌더되어
//   이 상수를 직접 소비하지 않는다 — 계정 그룹 실폭에 따라 nav 시작 x가 유동적이라
//   NAV_GUARD 같은 뷰포트 전용 계산과 원천적으로 안 맞기 때문이다(Header.tsx return 블록
//   헤더 주석 참고). 메가 컬럼은 여전히 좌표계 2(mx-auto max-w-content)를 쓰므로 이 값을
//   그대로 유지하되, 두 좌표계가 서로 다른 축이라 완벽한 좌측선 정렬은 보장되지 않는다 —
//   폭·gap 수치를 nav와 동일하게 맞추는 선에서 시각적 정합성만 확보한다(러프 구현 허용
//   범위, "코드가 정본" 원칙과 별개로 픽셀 정합은 QA 대상 아님).
import {
  PREMIUM_ADMISSION_A_PATH,
  PREMIUM_PROGRAM_PATH_PREFIX,
} from "@/components/premium/premiumRoutesPaths";

export const NAV_GUARD = "max(0px, calc(14rem - (100vw - 72.75rem) / 2))";
export const MEGA_GUARD = NAV_GUARD;
export const NAV_CELL_W = "clamp(7.5rem, 8.3333vw, 10rem)";
export const NAV_CELL_GAP = "clamp(2.25rem, 2.5vw, 3rem)";
export const MEGA_COL_W = NAV_CELL_W;
export const MEGA_COL_GAP = NAV_CELL_GAP;

// 프리미엄 메뉴 그룹 — DB(page_contents) 소유가 아니라 이 상수가 정본이다(premium-db-decouple:
// 프리미엄 프로그램 페이지 전체가 DB 조회 0건으로 전환되며 메뉴도 함께 코드 소유로 옮겼다).
// useNavGroups.ts가 DB에서 파생된 그룹 트리에 이 그룹을 항상 주입한다(제목 '프리미엄'인 DB
// 그룹은 있어도 무시하고 이 상수로 교체) — page_contents에 프리미엄 프로그램 행이 아예
// 없어져도(20260824000007 마이그레이션) 메뉴가 사라지지 않는다.
export const PREMIUM_NAV_GROUP = {
  title: "프리미엄",
  to: PREMIUM_ADMISSION_A_PATH,
  items: [
    {
      label: "대입컨설팅 프로그램",
      to: PREMIUM_ADMISSION_A_PATH,
      sortOrder: 1,
    },
    {
      label: "특목고입학 프로그램",
      to: `${PREMIUM_PROGRAM_PATH_PREFIX}/special-highschool`,
      sortOrder: 2,
    },
    {
      label: "대학원입학 프로그램",
      to: `${PREMIUM_PROGRAM_PATH_PREFIX}/graduate-school`,
      sortOrder: 3,
    },
    {
      label: "해외명문대 진학컨설팅",
      to: `${PREMIUM_PROGRAM_PATH_PREFIX}/global-university`,
      sortOrder: 4,
    },
    {
      label: "국제학교 학습관리",
      to: `${PREMIUM_PROGRAM_PATH_PREFIX}/international-school`,
      sortOrder: 5,
    },
    {
      label: "국제・해외고 국내대 입학컨설팅",
      to: `${PREMIUM_PROGRAM_PATH_PREFIX}/returning-student`,
      sortOrder: 6,
    },
  ],
};

// 헤더 메가메뉴·푸터 공용 fallback — DB(page_contents)가 우선, 이 상수는 오프라인/최초 페인트용.
// 시안 2016:1796 기준. '프리미엄' 그룹은 PREMIUM_NAV_GROUP을 그대로 참조한다(위 주석 참고).
export const FALLBACK_NAV_GROUPS = [
  {
    title: "서비스",
    to: "/services/learning-diagnosis",
    items: [
      { label: "학습진단", to: "/services/learning-diagnosis", sortOrder: 1 },
      { label: "목표관리", to: "/services/goal", sortOrder: 2 },
      { label: "수행평가", to: "/services/performance", sortOrder: 3 },
      { label: "자기평가", to: "/services/self-assessment", sortOrder: 4 },
      { label: "심화탐구", to: "/services/research", sortOrder: 5 },
      { label: "콜멘토", to: "/services/callmentor", sortOrder: 6 },
    ],
  },
  PREMIUM_NAV_GROUP,
  {
    title: "입시정보",
    to: "/admission/guidelines",
    items: [
      { label: "대입모집요강", to: "/admission/guidelines", sortOrder: 1 },
      { label: "입결정보", to: "/admission/results", sortOrder: 2 },
      { label: "대입합격", to: "/admission/susi-jungsi", sortOrder: 3 },
      {
        label: "특목고합격",
        to: "/admission/special-highschool",
        sortOrder: 4,
      },
      { label: "교육칼럼", to: "/info/column", sortOrder: 5 },
    ],
  },
  {
    title: "이용신청",
    to: "/pricing",
    items: [
      { label: "서비스요금", to: "/pricing", sortOrder: 1 },
      { label: "프리미엄 이용", to: "/page/premium-apply", sortOrder: 2 },
      { label: "멘토신청", to: "/page/mentor-apply", sortOrder: 3 },
    ],
  },
  {
    title: "고객안내",
    to: "/company-news",
    items: [
      { label: "회사소개", to: "/company-news", sortOrder: 1 },
      { label: "공지사항", to: "/events", sortOrder: 2 },
      { label: "자주하는 질문", to: "/faq", sortOrder: 3 },
      { label: "온라인문의", to: "/online-inquiry", sortOrder: 4 },
    ],
  },
];

// program_categories(DB) 서비스명 → 서비스 6종 정본 라우트. ServicesSection 카드 클릭 링크가
// DB link 컬럼에 죽은 값(레거시 '/services' 스텁 등)을 담고 있을 때의 이름 기반 안전망.
// FALLBACK_NAV_GROUPS의 '서비스' 그룹 라벨・경로와 동일한 소스오브트루스로 유지할 것.
export const SERVICE_NAME_ROUTES = {
  학습진단: "/services/learning-diagnosis",
  목표관리: "/services/goal",
  수행평가: "/services/performance",
  자기평가: "/services/self-assessment",
  심화탐구: "/services/research",
  콜멘토: "/services/callmentor",
};

export const MENU_GROUP_ORDER = {
  서비스: 1,
  프리미엄: 2,
  입시정보: 3,
  이용신청: 4,
  고객안내: 5,
  합격전략: 6,
  회사소개: 7,
};
