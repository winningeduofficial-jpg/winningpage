// AI 아바타 — docs/수행평가-상세-명세.md §3.1 실측: 3.25rem(52) 정사각, r0.75rem(12),
// `fill #37352f`(=`performance-userBubble` 토큰, §11.1 Q5 결정 — primary와 절대 혼동 금지).
//
// 시안(`3754:3035`)에는 마스킹된 인물 사진 레이어가 있지만, 텍스트만 남은 노드
// (`3754:3261`/`3754:3370`/`3754:3493`/`3754:3868`/`3754:4248`)가 다수이고 실제 자산이
// 없다 — "AI" 텍스트 배지가 정본이다(작업 지시서 ①·④). 사진 에셋을 만들지 않는다.
//
// `AiMessage`·`AiLoadingBubble` 둘 다 이 컴포넌트를 재사용한다. 장식 요소라 스크린리더에는
// 옆의 발신자 라벨("위닝 수행평가 서포터")이 이름을 대신하므로 `aria-hidden`을 건다.
type AiAvatarProps = {
  className?: string;
};

export default function AiAvatar({ className = "" }: AiAvatarProps) {
  return (
    <div
      aria-hidden="true"
      className={[
        "flex h-[3.25rem] w-[3.25rem] flex-shrink-0 items-center justify-center rounded-xl",
        "bg-performance-userBubble",
        className,
      ].join(" ")}
    >
      {/* 실측(원 시안): "AI" 16px/20 w600 #ffffff, @402,286 — 52×52 박스 안 텍스트(16×20)
          중앙 정렬과 정확히 일치(가로 (52-16)/2=18, 세로 (52-20)/2=16).
          사용자 지시로 화면 문구에서 "AI" 표기를 전부 제거하면서 이 배지도 대체가
          필요했다 — 사진 에셋을 만들지 않는다는 위 제약은 유지한 채 "위닝"(브랜드명,
          발신자 라벨·사이드바 메뉴 라벨과 표기 일관)으로 바꿨다.
          치수 재확인: 배경 #37352f(=performance-userBubble) 위 흰색(#ffffff)은
          상대휘도 계산상 대비비 약 12.26:1로 WCAG AA(4.5:1)를 큰 여유로 충족(텍스트
          색·배경 자체는 안 바꿨으므로 원래도 동일). 폭은 "위닝" 두 글자가 16px
          font-semibold 기준 약 32~34px로 52px 박스에 여유 있게 들어가 줄바꿈·잘림이
          없다 — 별도 크기 조정 불필요. */}
      <span className="text-[1rem] font-semibold leading-[1.25rem] text-white">
        위닝
      </span>
    </div>
  );
}
