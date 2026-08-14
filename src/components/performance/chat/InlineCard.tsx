// 인라인 카드 껍데기 — docs/수행평가-상세-명세.md §3.1(AI 말풍선 컬럼 x축) / §5.5·§5.9
// (`3754:3206`/`3754:3370` 실측). 폼·업로드·선택지 등 채팅 사이에 끼어드는 모든 카드의
// 공용 컨테이너다. 이 단계에서는 내용을 채우지 않는다 — 필드·버튼은 P6 이후.
//
// 실측 (두 노드 공통, `3754:3206`의 기본 정보 입력 카드 `@456,447 596x594`와 `3754:3370`의
// 안내문 텍스트 입력 카드 `@456,962 596x317` — 폭·보더·반경·상하좌우 인셋이 완전히 일치):
//   폭 596px(=`max-w-perf-bubble`, AI 말풍선과 동일 상한) — **말풍선과 좌변 x=456으로 정렬**.
//   `fill` 없음(=흰 배경) + `stroke #d9d9d9`(=`performance-line` 토큰, §7.1 "인앱 카드·입력
//   보더" 행 — 전역 `line`#d7d7d7과 다른 값이니 섞지 말 것) + `r16`(=`rounded-2xl`, 말풍선과
//   동일 반경).
//   내부 인셋: 좌우 30px(1.875rem) 동일, 상단 20px(1.25rem) — `AiMessage`/`AiLoadingBubble`이
//   이미 쓰는 `p-5`(1.25rem)와 세로값이 맞아떨어지므로 `py-5`로 얹고, 가로만 실측대로
//   `px-[1.875rem]`로 따로 준다(좌우 30px은 Tailwind 표준 스케일에 없는 임의값).
//   하단 인셋은 두 노드에서 23~28px로 갈려 정본이 없다 — 내부 마지막 요소(버튼 등)의 자체
//   여백이 섞인 값으로 보고, 상단과 동일한 `py-5`로 통일했다(P6+ 실제 내용이 들어가면
//   재실측해 조정).
//
// 이 카드가 타임라인에서 어느 발신자 뒤에 붙든(AI 말풍선 대부분, 시안에 사용자 뒤 사례는
// 없다) **자체 아바타를 갖지 않는다** — 대신 `ChatTimeline`이 AI 컬럼과 같은 x축(아바타
// 3.25rem + gap 1.25rem = 4.5rem)만큼 왼쪽 여백을 얹어 정렬을 맞춘다(§3.1). 그래서 이
// 컴포넌트 자신은 들여쓰기를 갖지 않고 카드 자체의 모양만 책임진다.
import type { ReactNode } from "react";

type InlineCardProps = {
  /** 카드 내용. 이 단계에서는 폼 필드·버튼을 만들지 않으므로 호출부가 채운다(P6+). */
  children?: ReactNode;
  /** 루트에 추가할 클래스. */
  className?: string;
};

export default function InlineCard({
  children,
  className = "",
}: InlineCardProps) {
  return (
    <div
      className={[
        "w-full max-w-perf-bubble rounded-2xl border border-performance-line bg-white px-[1.875rem] py-5",
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
}
