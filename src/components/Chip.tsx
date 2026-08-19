import type { ReactNode } from "react";

/**
 * 칩(배지) 공통 컴포넌트 — 랜딩 소식 카테고리 배지 / 게시판 '중요' 칩의 단일 정의처.
 * 원래 회사소식(CompanyNews.jsx) 상세·목록에도 같은 칩이 있어 세 곳을 여기로 모았으나,
 * 칩 노출은 게시판 전용으로 사용자가 확정해 회사소식 쪽은 제거됐다(소비처 2곳).
 *
 * 배치 근거: 이 저장소에는 `src/components/ui/` 가 없고, 여러 기능이 공유하는 컴포넌트는
 * `src/components/` 최상위에 둔다(Header.jsx · SiteFooter.jsx · SiteLayout.jsx ·
 * PopupLayer.jsx · CountUpNumber.jsx). 기능 전용 컴포넌트만 하위 폴더(admission/ board/
 * landing/ services/ ...)에 들어간다. 그 관행을 그대로 따랐다.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 두 축: tone(색) × size(치수·타이포)
 *
 *   tone 은 **외형** 이름이다. 의미 이름을 쓰지 않는다 — 같은 분홍이 랜딩에선 '공지',
 *   게시판에선 '중요' 라서 의미 기반 이름은 곧 어긋난다.
 *   size 는 소비처별 실측 치수 묶음이다(14px 두 종).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠ Tailwind JIT 함정 (serviceTokens.js:6-9)
 *
 *   `bg-[${color}]` 처럼 템플릿 리터럴로 조립한 클래스는 스캐너가 못 잡아 **조용히**
 *   스타일이 사라진다. 그래서
 *     · 색(tone)  → `style={{}}` 인라인 (기존 NewsSection · BoardTable 두 구현이 모두 쓰던 방식)
 *     · 치수(size) → **정적 리터럴 클래스 맵** (키로 고르기만 하고 문자열을 조립하지 않는다)
 *   로 고정한다. 이 파일 안에서도 클래스 문자열을 절대 조립하지 말 것.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠⚠ 색값 복사 금지 — 실제로 한 번 사고가 났다
 *
 *   `coral`(#FFC4C4 / #FF7373) 과 `red`(#FFD9D9 / #991E1E) 는 **서로 다른 물건**이다.
 *   한때 게시판 중요 칩에 랜딩 배지 색(#FFC4C4/#FF7373)이 잘못 들어가 있었다.
 *   "대비 1.75:1 이지만 사용자 지시로 원값 확정" 이라는 이력은 **랜딩 카테고리 배지에만**
 *   해당하고 게시판 칩과는 무관하다. 두 tone 의 값을 서로 복사하거나 통일하지 말 것.
 *   (톤 이름을 `red` / `red-light` 로 두지 않고 `coral` / `red` 로 갈라 둔 것도 같은 이유다.)
 */

/**
 * tone → 색. 이 저장소에서 칩 색 hex 가 존재하는 **유일한 지점**이다.
 * 소비처에는 hex 가 남지 않는다.
 *
 * | tone       | bg      | text    | 출처(Figma)            | 대비    | 사용처                    |
 * |------------|---------|---------|------------------------|---------|---------------------------|
 * | blue       | #E9F4FF | #013262 | 1907:14893             | 11.5:1  | 랜딩 소식 '보도자료'       |
 * | green      | #EEFFE9 | #016215 | 1907:14893             |  7.5:1  | 랜딩 소식 '파트너십'       |
 * | coral      | #FFC4C4 | #FF7373 | 1907:14893 / 3015:14378|  1.75:1 | 랜딩 소식 '공지'·'중요'    |
 * | red        | #FFD9D9 | #991E1E | 2235:3741 · 2235:3742  |  5.9:1  | 게시판 표 '중요' 칩        |
 * | gray       | #F1F5F9 | #525252 | (매핑 없는 카테고리 폴백)|  7.1:1  | 랜딩 소식 미등록 카테고리  |
 *
 * · coral 은 WCAG AA(4.5:1) **미달**이다. 0803 재스펙(3015:14378)에서 디자이너가 원값을
 *   유지했고 사용자 지시로 원값이 확정됐다(이전 보정 팔레트 #FFE9E9/#8F1616 폐기).
 *   **값을 고치지 말 것.** 접근성 사유로도 임의 변경 금지 — 사용자 결정 사항이다.
 * · red 는 Figma 토큰명 Indicator/Red-Light(배경) + Indicator/Red(텍스트)로, AA 통과다.
 * · gray 는 신규 색이 아니라 NewsSection 의 기존 폴백 리터럴(#F1F5F9/#525252)을 그대로 옮긴 것이다.
 */
const TONE_STYLES: Record<string, { backgroundColor: string; color: string }> =
  Object.freeze({
    blue: Object.freeze({ backgroundColor: "#E9F4FF", color: "#013262" }),
    green: Object.freeze({ backgroundColor: "#EEFFE9", color: "#016215" }),
    coral: Object.freeze({ backgroundColor: "#FFC4C4", color: "#FF7373" }),
    red: Object.freeze({ backgroundColor: "#FFD9D9", color: "#991E1E" }),
    gray: Object.freeze({ backgroundColor: "#F1F5F9", color: "#525252" }),
  });

/**
 * size → 치수·타이포. **정적 리터럴만** 담는다(JIT 스캐너가 읽어야 한다).
 *
 * | size      | 글자      | 모양                                   | 사용처                    |
 * |-----------|-----------|----------------------------------------|---------------------------|
 * | md        | 14px/500  | radius 8, padding 8·3.14, tracking -0.28| 랜딩 소식 카테고리 배지    |
 * | md-fixed  | 14px/500  | 48×28 고정, radius 10, tracking -0.02em | 게시판 표 중요 칩          |
 *
 * · md 의 py-[0.196rem] 은 랜딩 시안 실측(0803 3015:14378)이라 반올림하지 않는다.
 *   폭 하한(min-w-[4rem])은 레이아웃이라 소비처가 className 으로 준다.
 * · md-fixed 는 시안의 오토레이아웃 padding(12·4)이 만들어낸 **결과 크기 48×28** 을 고정한다.
 *   고정폭과 좌우 패딩을 동시에 주면 넘치므로 패딩 없이 중앙정렬로 대체한다.
 * · 한때 회사소식 상세(12px) / 목록(11px)용 sm · xs 가 더 있었다. 회사소식 칩 제거로
 *   소비처가 0이 되어 함께 지웠다 — 다시 필요해지면 그때 실측해서 새로 넣을 것.
 */
const SIZE_CLASSES: Record<string, string> = Object.freeze({
  md: "rounded-lg px-2 py-[0.196rem] text-[0.875rem] font-medium leading-[1.4] tracking-[-0.0175rem]",
  "md-fixed":
    "h-7 w-12 rounded-[0.625rem] text-[0.875rem] font-medium leading-[1.4] tracking-[-0.02em]",
});

/** 모든 size 가 공유하는 골격. 추출 당시 세 소비처의 기존 마크업이 전부 이 조합이었다. */
const BASE_CLASS = "inline-flex items-center justify-center whitespace-nowrap";

type ChipProps = {
  /** 색. 기본 'gray'. */
  tone?: "blue" | "green" | "coral" | "red" | "gray";
  /** 치수·타이포. 기본 'md'. */
  size?: "md" | "md-fixed";
  /** **레이아웃 전용** 유틸리티(relative / shrink-0 / min-w-*)나 소비처 CSS 훅만 넘긴다.
   * 색·글자 크기를 여기서 덮어쓰면 tone/size 토큰이 무의미해진다. */
  className?: string;
  /** 칩 문구. */
  children?: ReactNode;
  [key: string]: unknown;
};

export default function Chip({
  tone = "gray",
  size = "md",
  className = "",
  children,
  ...rest
}: ChipProps) {
  const sizeClass = SIZE_CLASSES[size] ?? SIZE_CLASSES.md;
  const toneStyle = TONE_STYLES[tone] ?? TONE_STYLES.gray;

  return (
    <span
      className={[BASE_CLASS, sizeClass, className].filter(Boolean).join(" ")}
      style={toneStyle}
      {...rest}
    >
      {children}
    </span>
  );
}
