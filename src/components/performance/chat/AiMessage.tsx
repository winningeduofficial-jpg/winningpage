import type { ReactNode } from "react";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import {
  Message,
  MessageAvatar,
  MessageContent,
  MessageHeader,
} from "@/components/ui/message";
import AiAvatar from "./AiAvatar";

type AiMessageProps = {
  /** 발신자 라벨. 전 노드 공통 `위닝 수행평가 서포터`. */
  label?: string;
  /** 말풍선 본문. 생략하면 말풍선 자체를 렌더하지 않는다. */
  body?: string;
  /** 말풍선 뒤에 이어 붙는 인라인 카드. */
  children?: ReactNode;
  /** 말풍선 max-width 클래스. 기본 `max-w-perf-bubble`(560px, 2026-09-06 스케일 축소). */
  bubbleMaxWidthClassName?: string;
  /** 루트(아바타+컬럼 행)에 추가할 클래스. */
  className?: string;
};

// AI 말풍선 프리미티브 — docs/수행평가-상세-명세.md §3.1(셸 관례) / §5.3(예외) / §5.5·§5.6·§5.8
// (말풍선 뒤에 폼·업로드 카드가 붙는 실제 배치) / §7.1(색) / §7.2(타이포).
//
// **2026-09-06 재구성**: shadcn `Message`(아바타·헤더·컨텐츠 슬롯) + `Bubble`/`BubbleContent`로
// 조립한다. 두 컴포넌트 다 채팅용 색 테마(primary/secondary 등)를 전제한 `variant` 체계를
// 갖고 있는데, 이 화면은 자체 브랜드 토큰(`performance-bubble`/`ink`)을 쓰므로 `Bubble`은
// `variant="ghost"`(배경·패딩·반경을 강제하지 않는 완전 커스텀 모드)로 두고 `BubbleContent`에
// 실측값을 직접 얹는다. `Message`/`MessageAvatar`/`MessageContent`/`MessageHeader`의 기본
// 간격(`gap-2`/`gap-2.5`)·정렬(`self-end`)도 이 화면 실측(아바타 상단 정렬, 라벨↔말풍선
// `gap-4`)에 맞게 개별 오버라이드한다 — 아래 각 className 주석 참고.
//
// 좌표 실측(공통, `3754:3261`/`3754:3370` 등 596폭 노드 기준, 2026-09-06 스케일 축소 이전값):
//   아바타 @384,y 52×52 → 우변 436. 라벨·말풍선 @456,y → 아바타와 컬럼 사이 gap 20px(1.25rem).
//   라벨 @456,270 h18 → 말풍선 @456,304 : gap 16px(1rem) → 이번 스케일 축소로 `gap-4`(1rem)
//   유지. 말풍선(`3754:3206`) → 폼 카드(`3754:3206` @456,447): gap 16px(1rem)로 동일 — 그래서
//   컬럼 전체에 `gap-4`(1rem) 하나만 주면 라벨↔말풍선, 말풍선↔후속 카드 두 간격이 동시에 맞는다.
//
// **말풍선 폭 예외 (§5.3 단정)** `3754:3035`(접속 직후 로딩) 한 노드만 말풍선 폭이 다른
// 노드보다 좁고, 나머지 전 노드는 `perf-bubble` 토큰이다. 명세는 기본값을 정본으로 제안하면서도
// 예외를 규정으로 남겼으므로, 기본값은 `perf-bubble`로 두고 `bubbleMaxWidthClassName`으로
// 완전히 교체할 수 있게 열어 둔다 — 이 prop은 항상 기본값을 **대체**하지, 덧붙이지 않는다.
//
// 조립은 이 컴포넌트가 하지 않는다 — `body`는 이 말풍선 텍스트만 렌더하고, 후속 인라인
// 카드(폼·업로드 슬롯·리포트 요약)는 `children`으로 받아 같은 컬럼 안, 말풍선 바로 아래에
// 놓는다. 카드 자체의 마크업·상태는 `ChatTimeline`과 그 하위 `InlineCard`가 책임진다.
export default function AiMessage({
  label = "위닝 수행평가 서포터",
  body,
  children,
  bubbleMaxWidthClassName = "max-w-perf-bubble",
  className = "",
}: AiMessageProps) {
  return (
    <Message
      align="start"
      className={["items-start gap-5", className].join(" ")}
    >
      {/* 실측: 아바타는 라벨 첫 줄과 상단이 맞는다 — `Message` 기본값 `self-end`(입력창
          있는 채팅 UI 관례)를 이 화면엔 하단 입력창이 없어 `self-start`로 되돌린다. */}
      <MessageAvatar className="size-10 self-start overflow-visible rounded-xl bg-transparent">
        <AiAvatar />
      </MessageAvatar>
      <MessageContent className="min-w-0 flex-1 items-start gap-4">
        {/* 실측: 13px/18 w600 `ink`(2026-09-06 스케일 축소, 기존 14px). */}
        <MessageHeader className="px-0 text-app-label font-semibold text-ink">
          {label}
        </MessageHeader>
        {body != null && (
          <Bubble variant="ghost" align="start" className="w-full max-w-none">
            <BubbleContent
              className={[
                "w-full rounded-2xl bg-performance-bubble p-4",
                bubbleMaxWidthClassName,
              ].join(" ")}
            >
              {/* 실측: 15px/22.5 w500 `ink`(2026-09-06 스케일 축소, 기존 16px). */}
              <p className="whitespace-pre-line text-left text-app-body font-medium text-ink">
                {body}
              </p>
            </BubbleContent>
          </Bubble>
        )}
        {children}
      </MessageContent>
    </Message>
  );
}
