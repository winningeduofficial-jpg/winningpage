// 서비스 랜딩 4종(심화탐구・자기평가・수행평가・목표관리) 공통 디자인 토큰.
//
// 출처: src/pages/services/InDepthResearch.jsx 가 정본(canonical)이며, 4페이지가 각자
// 중복 정의하던 SECTION_HEADING_CLASS 와 흩어져 있던 색 리터럴을 여기로 모았다.
//
// 이 파일은 실제로 import 되는 클래스 상수 4개만 보유한다(SECTION_HEADING_CLASS,
// CARD_TITLE_CLASS, CARD_DESC_CLASS, CARD_DESC_MUTED_CLASS). 색 값은 Tailwind JIT 제약상
// 클래스 문자열로 조립할 수 없어(`text-[${COLOR}]` 는 스캐너가 못 잡아 조용히 스타일이
// 사라진다) 각 컴포넌트에 리터럴로 박아 두며, 이 파일에는 별도 값 상수로 두지 않는다.
//
// [폐기 선언] 이번 수렴으로 아래 값들은 4개 페이지에서 사라졌다. 다시 나타나면 회귀다.
//   보더:       #D9D9D9            → #D7D7D7
//   카드 배경:  #FBFAFA / #F6F5F4 / #F8F9FA → #F9FAFB / #F5F5F7
//   텍스트:     #808080 / #D9D9D9  → #767676 / #A3A3A3

// 섹션 h2 공통 클래스. 정렬(text-left/center)은 포함하지 않는다 — 기준은 전 헤딩 좌측 정렬이다.
export const SECTION_HEADING_CLASS =
  'break-keep text-[1.5rem] font-semibold leading-[1.4] tracking-[-0.02em] text-[#0F172A] sm:text-[1.75rem] lg:text-[2rem]';

// 멘토신청(/mentor-apply, docs/mentor-apply-spec.md) 전용 섹션 헤딩 2위계.
//
// 왜 SECTION_HEADING_CLASS 를 고치지 않고 새 상수를 두는가 —
//   위 상수는 서비스 랜딩 4종의 정본이라 색(#0F172A)·크기(최대 2rem)·굵기(SemiBold)를 바꾸면
//   4페이지 전 섹션이 동시에 회귀한다. 멘토신청 시안은 색·크기·굵기가 모두 다르므로 분리한다.
//
// 시안이 같은 페이지 안에서 h2 위계를 둘로 쓴다(명세 §4 ⚠ 디자인 불일치 2건, 확인 항목 ⑩ —
// 어느 쪽으로 통일할지 미확정이라 시안 그대로 둘 다 보존한다):
//   LG = 38px(2.375rem) Bold  / lh 1.3 / ls -0.02em / ink.title(#181d24)  … §2·§3·§6 폼 헤더·§7 FAQ
//   MD = 32px(2rem)     SemiBold / lh 1.3 / ls 0    / ink.strong(#191d23) … §4·§5
// ls 는 명세 확인 항목 ㊽ 확정 목록(Heading/38-B 등 20px 이상)에 따라 LG 에만 적용한다.
// 모바일 램프(1.75rem→2.375rem / 1.5rem→2rem)는 768/375 시안이 없어 구현 재량이다(확인 항목 ㊺).
export const MENTOR_HEADING_LG =
  'break-keep text-[1.75rem] font-bold leading-[1.3] tracking-[-0.02em] text-ink-title sm:text-[2rem] lg:text-[2.375rem]';
export const MENTOR_HEADING_MD =
  'break-keep text-[1.5rem] font-semibold leading-[1.3] text-ink-strong sm:text-[1.75rem] lg:text-[2rem]';

// 표준 카드 타이포의 단일 정의처. 각 컴포넌트 마크업에는 가독성을 위해 리터럴로 적혀 있으므로
// 이 상수들은 신규 섹션 작성 시 참조 기준으로 쓴다.
export const CARD_TITLE_CLASS =
  'text-[1.25rem] font-semibold leading-[1.4] tracking-[-0.02em] text-[#525252]';
export const CARD_DESC_CLASS = 'break-keep text-[1rem] font-medium leading-[1.4] text-[#525252]';
export const CARD_DESC_MUTED_CLASS =
  'break-keep text-[1rem] font-medium leading-[1.4] text-[#767676]';
