import { ArrowDownIcon } from "lucide-react";
import type { MutableRefObject, ReactNode } from "react";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import AiLoadingBubble from "./AiLoadingBubble";
import AiMessage from "./AiMessage";
import InlineCard from "./InlineCard";
import UserMessage from "./UserMessage";

// 채팅 타임라인 조립 — docs/수행평가-상세-명세.md §3.1(공통 셸 관례) / §5.9·§5.12·§5.15
// (로딩 노드 3종) / §5.6·§5.8(`3754:3261`/`3754:3370` 메시지 누적) 실측.
//
// 이 컴포넌트의 핵심 책임은 **`kind` 분기**다 — `sql/54_performance_app.sql`
// `performance_messages.kind`(`text`/`loading`/`card`) 체크 제약과 1:1로 맞춘다:
//   kind='text'    → `role`이 `'user'`면 `UserMessage`, 아니면(`'ai'`/`'system'`) `AiMessage`.
//   kind='loading' → `AiLoadingBubble`. `payload`에 `{title, subtitle}` (없으면 `loadingCopy.js`
//                    3쌍 중 호출부가 골라 넘긴 값을 그대로 기대한다 — 이 컴포넌트가 문구를
//                    선택하지 않는다, 순서 조립만 한다).
//   kind='card'    → `InlineCard`. 이 단계는 껍데기뿐이라 `children`을 그대로 통과시킨다.
// `role='system'`은 스키마상 존재하나 시안에 대응 노드가 없다 — 일단 AI 컬럼으로 렌더한다
// (발신자 라벨은 `payload.label`로 덮어쓸 수 있으니 필요해지면 그때 구분한다).
//
// **`messages` 배열이 기본 API**다. 완전히 수동 조립이 필요한 예외적 호출부를 위해 `children`도
// 받는다 — `messages`를 생략하면 `children`을 그대로 컬럼 안에 렌더한다(두 방식을 동시에 쓰면
// `messages`가 우선한다).
//
// **2026-09-06 재구성**: 스크롤 컨테이너를 shadcn `MessageScroller`로 옮겼다. 뷰포트
// (`MessageScrollerViewport`)가 **실제 스크롤 컨테이너**여야 한다 — 부모(PerformanceAppLayout
// `<main>`)가 `100svh - 헤더` 고정 높이 flex 컬럼이고 이 컴포넌트가 `min-h-0 flex-1`로 남은
// 높이를 받아 `overflow-y-auto`로 스크롤한다. 뷰포트 높이가 무제한이면 `scrollAnchor` 항목의
// min-height(뷰포트 높이 기준)와 뷰포트 높이가 서로를 키우며 문서가 수백만 px로 폭주한다
// (2026-09-06 실측 사고). 그래서 예전의 `scrollIntoView` 기반 페이지 스크롤 이펙트는
// 제거했다 — 하단 고정·새 메시지 추적은 `MessageScrollerProvider autoScroll`이 맡는다.
//
// **접근성**: `MessageScrollerContent`가 기본으로 `role="log" aria-relevant="additions"`를
// 갖는다(ARIA `log` 롤은 암묵적으로 `aria-live="polite"`를 내포한다) — 과거 이 컴포넌트가
// 루트에 직접 걸던 `aria-live="polite"`와 동등하거나 더 정확한 시맨틱이라 별도로 다시
// 걸지 않는다. `MessageScrollerViewport`의 기본 `role="region"`/`aria-label="Messages"`(영문
// 기본값)는 이 화면 언어(한국어)에 맞게 오버라이드한다. `tabIndex`는 기본값(`0`, 실제
// 스크롤 컨테이너라 키보드 스크롤 대상이 되어야 한다)을 그대로 둔다.
//
// **2026-09-06 shadcn 공식 조합 정렬**: `MessageScroller`/`MessageScrollerViewport`/
// `MessageScrollerContent`의 className 오버라이드를 걷어내고 라이브러리 기본 스타일
// (`scroll-fade-b`·`scrollbar-thin` 등 포함)을 그대로 쓴다 — 루트는 `className`(호출부가
// 넘기는 `min-h-0 flex-1`)만 통과시킨다. `scrollAnchor`는 매 렌더의 마지막 항목이 아니라
// **`role === 'user'`인 항목에만** 건다 — 라이브러리 소스(`handleContentChange`)를 추적한
// 근거: 새로 추가된 항목들 중 `scrollAnchor` 항목이 하나도 없으면 현재 모드가
// `following-bottom`(자동 추적 중)일 때 무조건 `scrollToEnd`로 폴백하고, 있으면 그 항목의
// 상단을 뷰포트 상단에 맞추는 `align:"start"`로 이동한다. 매 마지막 메시지에 앵커를 걸던
// 예전 방식은 AI 응답(카드 없는 짧은 말풍선)에도 `align:"start"` 정렬을 강제해, 뒤이어 긴
// STEP 폼 카드가 붙어도 진짜 바닥까지 못 내려가는 원인이었다(2026-09-06 실측: 재개 후
// scrollTop이 바닥에 닿지 않음). 사용자 턴에만 앵커를 걸면 "내가 보낸 메시지가 위로
// 붙고 그 아래 AI 응답이 이어진다"는 채팅 UI 관례를 재현하면서, AI 전용 갱신(재개 시
// 대량 재생 포함)은 전부 `following-bottom` 폴백을 타 진짜 바닥까지 스크롤된다. 최초
// 마운트(`itemCount===0`)는 `defaultScrollPosition="end"`가 별도로 처리하므로 이 경로와
// 무관하다. 이 트레이싱만으로 충분해 수동 `scrollToEnd` 이펙트(`FollowLatestMessage`,
// `useMessageScroller().scrollToEnd`)는 두지 않는다 — Provider 컨텍스트 API 밖에서
// 뷰포트 DOM을 직접 건드리는 우회는 애초에 쓰지 않았다.
type PerformanceChatMessagePayload = {
  title?: string;
  subtitle?: string;
  label?: string;
  bubbleMaxWidthClassName?: string;
};

/**
 * `focusRef` 쓰는 이유는 전부 같다 — **직전에 포커스를 갖고 있던 노드가 같은 커밋에서
 * 언마운트되는 전이**라 브라우저 기본 동작(`<body>`로 떨어짐)에 맡기면 키보드 사용자가
 * 위치를 잃는다. `PerformanceChatPage`의 세 자리가 그렇다: STEP4 로딩 진입(확정 경로에서
 * 카드 목록이 통째로 빠진다, 검토 A-2), STEP4 실패 진입(로딩 버블이 빠진다), `주제 다시
 * 고르기`로 STEP3 복귀(방금 누른 버튼째 빠진다).
 *
 * `focusRef`가 있으면 이 항목의 래퍼에 `aria-live="off"`도 함께 준다 — 포커스 이동 시
 * 스크린리더가 포커스된 엘리먼트를 읽고, 같은 순간 상위 `role="log"`(`aria-live="polite"`
 * 내포)가 같은 내용을 다시 읽으면 중복 낭독이 되기 때문이다(ARIA 중첩 live region 규칙상
 * 자식의 `aria-live="off"`가 조상의 `polite`를 그 서브트리에 한해 무효화한다).
 */
export type PerformanceChatMessage = {
  /** 리스트 key 겸 스크롤 대상 식별자. */
  id: string | number;
  /** 기본 `'ai'`. `kind='text'`일 때만 분기에 쓰인다. */
  role?: "ai" | "user" | "system" | undefined;
  /** 기본 `'text'`. */
  kind?: "text" | "loading" | "card" | undefined;
  /** `kind='text'`일 때 말풍선 본문. */
  body?: string | undefined;
  /** `kind='loading'`일 때 `title`/`subtitle`, `kind='text'`(AI)일 때 `label`/
   * `bubbleMaxWidthClassName` 오버라이드. */
  payload?: PerformanceChatMessagePayload | undefined;
  /** `kind='text'`(AI)면 말풍선 뒤에 붙는 인라인 카드, `kind='card'`면 `InlineCard`가
   * 감쌀 내용. */
  children?: ReactNode;
  /** 호출부가 이 항목이 나타나는 시점에 프로그램적으로 포커스를 옮기고 싶을 때 넘긴다.
   * 배선 위치는 `kind`에 따라 다르다: `kind='loading'`이면 `AiLoadingBubble`의 루트에
   * 그대로 전달되고, 그 밖(`kind='text'` 등)이면 말풍선 컴포넌트가 ref를 받지 않으므로
   * **이 항목의 래퍼**가 목적지가 된다. 어느 쪽이든 `tabIndex={-1}`을 함께 준다
   * (프로그램 포커스만 받고 Tab 순서에는 끼지 않는다). */
  focusRef?: MutableRefObject<HTMLDivElement | null> | undefined;
};

type ChatTimelineProps = {
  messages?: PerformanceChatMessage[];
  /** `messages` 생략 시 그대로 렌더. */
  children?: ReactNode;
  /** 루트에 추가할 클래스. */
  className?: string;
};

export default function ChatTimeline({
  messages,
  children,
  className = "",
}: ChatTimelineProps) {
  return (
    <MessageScrollerProvider autoScroll defaultScrollPosition="end">
      <MessageScroller className={className}>
        {/* scroll-fade(shadcn 유틸, 문서: "Use it on MessageScroller"): 기본 클래스는 하단만
            (`scroll-fade-b`)이라 접힌 타이틀 아래로 지나가는 위쪽 가장자리도 흐리게
            `scroll-fade-y`로 바꾼다. 위로 스크롤할 내용이 있을 때만 상단 페이드가 나타나고
            맨 위에 닿으면 사라진다(스크롤 드리븐 애니메이션, JS 없음). 상단 깊이 2.5rem.
            `cn()`이 `scroll-fade-b`를 지우도록 src/lib/utils.ts에 클래스 그룹을 등록했다. */}
        <MessageScrollerViewport
          aria-label="채팅 타임라인"
          className="scroll-fade-y scroll-fade-t-10"
        >
          <MessageScrollerContent className="pb-8">
            {messages
              ? messages.map((message) => {
                  const isUserTurn = message.role === "user";
                  // `kind='loading'`은 `AiLoadingBubble` 루트에 직접 배선한다(`renderMessage`).
                  // 나머지 kind는 말풍선 컴포넌트가 ref를 받지 않으므로 이 래퍼가 목적지다.
                  const wrapperFocusRef =
                    message.focusRef && (message.kind ?? "text") !== "loading"
                      ? message.focusRef
                      : null;
                  // 한 노드에 두 ref(마지막 항목 스크롤 대상 + 포커스 목적지)를 실을 수
                  // 있어야 해서 콜백 ref로 합친다.
                  const setNode = (node: HTMLDivElement | null) => {
                    if (wrapperFocusRef) wrapperFocusRef.current = node;
                  };
                  return (
                    <MessageScrollerItem
                      key={message.id}
                      messageId={String(message.id)}
                      scrollAnchor={isUserTurn}
                      ref={wrapperFocusRef ? setNode : undefined}
                      tabIndex={wrapperFocusRef ? -1 : undefined}
                      aria-live={message.focusRef ? "off" : undefined}
                    >
                      {renderMessage(message)}
                    </MessageScrollerItem>
                  );
                })
              : children}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton>
          <ArrowDownIcon />
          <span className="sr-only">맨 아래로</span>
        </MessageScrollerButton>
      </MessageScroller>
    </MessageScrollerProvider>
  );
}

function renderMessage(message: PerformanceChatMessage) {
  const {
    role = "ai",
    kind = "text",
    body,
    payload,
    children,
    focusRef,
  } = message;

  if (kind === "loading") {
    return (
      <AiLoadingBubble
        ref={focusRef}
        tabIndex={focusRef ? -1 : undefined}
        {...(payload?.title !== undefined ? { title: payload.title } : {})}
        {...(payload?.subtitle !== undefined
          ? { subtitle: payload.subtitle }
          : {})}
        {...(payload?.label !== undefined ? { label: payload.label } : {})}
      />
    );
  }

  if (kind === "card") {
    // 자체 아바타가 없는 컬럼 — AI 말풍선 x축(아바타+gap=3.75rem)에 맞춰 들여쓴다.
    return <InlineCard className="ml-15">{children}</InlineCard>;
  }

  if (role === "user") {
    return <UserMessage>{body}</UserMessage>;
  }

  return (
    <AiMessage
      {...(payload?.label !== undefined ? { label: payload.label } : {})}
      {...(body !== undefined ? { body } : {})}
      {...(payload?.bubbleMaxWidthClassName !== undefined
        ? { bubbleMaxWidthClassName: payload.bubbleMaxWidthClassName }
        : {})}
    >
      {children}
    </AiMessage>
  );
}
