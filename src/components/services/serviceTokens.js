// 서비스 랜딩 4종(심화탐구・자기평가・수행평가・목표관리) 공통 디자인 토큰.
//
// 출처: src/pages/services/InDepthResearch.jsx 가 정본(canonical)이며, 4페이지가 각자
// 중복 정의하던 SECTION_HEADING_CLASS 와 흩어져 있던 색 리터럴을 여기로 모았다.
//
// ⚠ Tailwind JIT 제약 — 색 값을 JS 상수에서 클래스 문자열로 조립하면(`text-[${BRAND_NAVY}]`)
// 스캐너가 클래스를 못 잡아 조용히 스타일이 사라진다. 따라서 아래 색 상수는
//   (a) 인라인 style 용,
//   (b) 문서/검색 기준용
// 이고, 실제 Tailwind 클래스는 각 컴포넌트에 리터럴로 박아 둔다.
//
// [폐기 선언] 이번 수렴으로 아래 값들은 4개 페이지에서 사라진다. 다시 나타나면 회귀다.
//   보더:       #D9D9D9            → BORDER(#D7D7D7)
//   카드 배경:  #FBFAFA / #F6F5F4 / #F8F9FA → CARD_BG(#F9FAFB) / CARD_BG_ALT(#F5F5F7)
//   텍스트:     #808080 / #D9D9D9  → TEXT_MUTED(#767676) / TEXT_DISABLED(#A3A3A3)

// ── 클래스 상수 (실제 import 해서 쓰는 것) ──────────────────────────────────
// 섹션 h2 공통 클래스. 정렬(text-left/center)은 포함하지 않는다 — 기준은 전 헤딩 좌측 정렬이다.
export const SECTION_HEADING_CLASS =
  'break-keep text-[1.5rem] font-semibold leading-[1.4] tracking-[-0.02em] text-[#0F172A] sm:text-[1.75rem] lg:text-[2rem]';

// ServiceSection 이 내부에서 쓰는 값과 동일. 신규 섹션을 bespoke 로 짤 때 참조용.
export const SECTION_BASE_CLASS = 'bg-white pt-16 sm:pt-20';
export const SECTION_CONTAINER_CLASS = 'mx-auto w-full max-w-content px-5 sm:px-8';

// 표준 카드 타이포의 단일 정의처. 각 컴포넌트 마크업에는 가독성을 위해 리터럴로 적혀 있으므로
// 이 상수들은 신규 섹션 작성 시 참조 기준으로 쓴다.
export const CARD_TITLE_CLASS =
  'text-[1.25rem] font-semibold leading-[1.4] tracking-[-0.02em] text-[#525252]';
export const CARD_DESC_CLASS = 'break-keep text-[1rem] font-medium leading-[1.4] text-[#525252]';
export const CARD_DESC_MUTED_CLASS =
  'break-keep text-[1rem] font-medium leading-[1.4] text-[#767676]';

// ── 색 토큰 (값 상수) ───────────────────────────────────────────────────────
// ⚠ 아래 색 상수 11개와 위 SECTION_BASE_CLASS/SECTION_CONTAINER_CLASS 는 실제로 어디서도
// import 되지 않는다 — Tailwind JIT 스캐너는 정적 클래스 리터럴만 인식하므로 이 값들을
// 조립해 클래스를 만들면 스타일이 조용히 사라진다(파일 상단 경고 참고). 실제 클래스는 각
// 컴포넌트에 리터럴로 박혀 있고, 이 값들은 문서・검색용 참조 상수로만 존재한다.
export const BRAND_NAVY = '#013262'; // 헤딩 강조 span, STEP 라벨, CTA 배경
export const BRAND_ACCENT = '#0B84FD'; // Hero eyebrow(text-accent), 추천 배지, CTA 보더
export const BORDER = '#D7D7D7'; // 보더・구분선 단일 토큰
export const CARD_BG = '#F9FAFB'; // Audience / Outcomes / Testimonials / 탭 이미지박스
export const CARD_BG_ALT = '#F5F5F7'; // StepCards 전용
export const TEXT_HEADING = '#0F172A';
export const TEXT_BODY = '#525252';
export const TEXT_MUTED = '#767676'; // 회색 하한 (#808080 이하는 전부 이쪽으로 클램프)
export const TEXT_DISABLED = '#A3A3A3'; // 비활성 탭 라벨 (대비 미달분 대체)
export const CHIP_BG = '#F1F1F1'; // 후기 이모지 칩
