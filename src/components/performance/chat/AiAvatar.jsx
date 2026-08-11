// AI 아바타 — docs/수행평가-상세-명세.md §3.1 실측: 3.25rem(52) 정사각, r0.75rem(12),
// `fill #37352f`(=`performance-userBubble` 토큰, §11.1 Q5 결정 — primary와 절대 혼동 금지).
//
// 시안(`3754:3035`)에는 마스킹된 인물 사진 레이어가 있지만, 텍스트만 남은 노드
// (`3754:3261`/`3754:3370`/`3754:3493`/`3754:3868`/`3754:4248`)가 다수이고 실제 자산이
// 없다 — "AI" 텍스트 배지가 정본이다(작업 지시서 ①·④). 사진 에셋을 만들지 않는다.
//
// `AiMessage`·`AiLoadingBubble` 둘 다 이 컴포넌트를 재사용한다. 장식 요소라 스크린리더에는
// 옆의 발신자 라벨("위닝 AI 수행평가 서포터")이 이름을 대신하므로 `aria-hidden`을 건다.
export default function AiAvatar({ className = '' }) {
  return (
    <div
      aria-hidden="true"
      className={[
        'flex h-[3.25rem] w-[3.25rem] flex-shrink-0 items-center justify-center rounded-xl',
        'bg-performance-userBubble',
        className
      ].join(' ')}
    >
      {/* 실측: "AI" 16px/20 w600 #ffffff, @402,286 — 52×52 박스 안 텍스트(16×20) 중앙 정렬과
          정확히 일치(가로 (52-16)/2=18, 세로 (52-20)/2=16). */}
      <span className="text-[1rem] font-semibold leading-[1.25rem] text-white">AI</span>
    </div>
  );
}
