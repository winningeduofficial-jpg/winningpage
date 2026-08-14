// 주제 카드 메타 태그(칩) — docs/수행평가-상세-명세.md §5.10(`3754:3629`/`3754:3746` 실측).
//
// 실측 (두 노드 동일, 좌표까지 일치):
//   프레임 h30(1.875rem) r20(1.25rem) `fill #fff3d1`(=`performance-tag`) pad 0.375rem(6) 사방.
//   텍스트 0.875rem/1.125rem(14/18) w500 `#525252`(=`ink`).
//   태그 사이 gap 0.75rem(12).
//   폭은 내용에 따라 가변이다 — `고1`은 31(19+6+6), `국어/공통국어1`은 96(84+6+6)으로
//   전부 "텍스트 폭 + 좌우 6"이라 고정폭을 주지 않는다.
//
// **태그 유형별 색 구분은 하지 않는다** — §5.10 「미정」이고 시안 4개 칩이 전부 같은
// `#fff3d1`이다. 근거 없이 색을 갈라 놓으면 그 자체가 새로운 디자인 결정이 된다.
//
// 이 칩은 클릭 대상이 아니다(시안에 상태·액션 표기가 없다). 카드 전체가 버튼이므로
// (§5.10 결정) 여기에 별도 인터랙션을 얹으면 중첩 클릭 대상이 생긴다.
/**
 * @param {import('react').ReactNode} children 칩 라벨.
 */
export default function MetaTag({ children }) {
  return (
    <span className="inline-flex h-[1.875rem] shrink-0 items-center rounded-[1.25rem] bg-performance-tag px-1.5 text-[0.875rem] font-medium leading-[1.125rem] text-ink">
      {children}
    </span>
  );
}
