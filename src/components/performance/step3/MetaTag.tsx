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
import type { ReactNode } from "react";

type MetaTagProps = {
  /** 칩 라벨. */
  children?: ReactNode;
};

// QA 지적 — 라벨은 BasicInfoForm.tsx의 자유 입력값(진로・직접 입력 과목)에서 오고, 그
// 필드들은 이제 maxLength로 길이를 막지만(BasicInfoForm.tsx 주석) 그건 신규 입력에만
// 적용된다. 이미 저장된 세션(구 데이터) 값이 더 길 수 있으므로 칩 자체도 방어한다 —
// `max-w`로 카드 폭(37.25rem)을 넘지 않는 폭에서 자르고 말줄임(`truncate`)한다.
// `title`로 잘린 전체 텍스트를 hover 시 확인할 수 있게 하고, 텍스트 자체는 그대로
// DOM에 남아 스크린리더는 전체 문구를 읽는다(시각적 말줄임일 뿐 접근성 손실 없음).
export default function MetaTag({ children }: MetaTagProps) {
  return (
    <span
      title={typeof children === "string" ? children : undefined}
      className="inline-flex h-7.5 max-w-50 shrink-0 items-center truncate rounded-perf-modal bg-performance-tag px-1.5 text-[0.875rem] font-medium leading-4.5 text-ink"
    >
      {children}
    </span>
  );
}
