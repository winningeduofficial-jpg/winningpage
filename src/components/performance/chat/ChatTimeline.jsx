import { useEffect, useRef } from 'react';
import AiMessage from './AiMessage';
import UserMessage from './UserMessage';
import AiLoadingBubble from './AiLoadingBubble';
import InlineCard from './InlineCard';

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
// **세로 간격** 실측(`3754:3261`/`3754:3370`, 두 노드가 겹치는 항목은 좌표까지 일치):
//   AI 말풍선(bottom) → 사용자 말풍선(top): 40px  (`3754:3370` 707→747, 552→592 대칭도 40px)
//   사용자 말풍선(bottom) → AI 말풍선(top): 40px  (`3754:3370` 808→848, `3754:3261` 552→592)
//   AI 말풍선(bottom) → 사용자 말풍선(top), 첫 인사말 뒤: 60px (`3754:3261`/`3370` 공통 431→491)
// 세 값 중 40px이 4번 중 3번으로 다수이고, 60px 사례는 유일하게 3줄짜리 인사말 말풍선
// (`3754:3206`~) 바로 뒤에서만 나타나 개별 말풍선의 줄바꿈 렌더링 오차로 보인다 — 두 시안
// 모두 다음 AI 메시지로 이어지는 간격은 예외 없이 40px이었다. 그래서 40px(2.5rem =
// `gap-10`) 하나로 통일한다. 시안에 AI 말풍선끼리 사용자 메시지 없이 바로 연속되는 사례가
// 없어(`3754:3261`/`3754:3370` 둘 다 매 AI 메시지 사이에 사용자 메시지가 끼어 있다) AI-AI
// 전용 간격은 실측 대상 자체가 없었다 — 같은 40px을 적용한다.
//
// `kind='card'`는 시안상 자체 아바타가 없는 컬럼이라(`InlineCard` 주석 참고) AI 컬럼과 같은
// x축에 맞추려면 아바타 폭(3.25rem)+gap(1.25rem)=4.5rem만큼 들여써야 한다 — 그래서 카드
// 항목만 `ml-[4.5rem]`을 더한다.
//
// **자동 스크롤**: 시안에는 없는 동작이지만 채팅 UI의 기본 기대치다. 메시지가 늘어날 때마다
// 최신 항목으로 스크롤한다. `prefers-reduced-motion`이면 즉시 이동, 아니면 부드럽게.
//
// ⚠️ **호출부 계약(필수)**: `scrollIntoView`는 "가장 가까운 스크롤 가능한 조상"을 스크롤한다.
// 이 컴포넌트 자신은 `overflow-y-auto` 경계를 두지 않는다(시안에 그런 경계가 없고, §3.1
// 단정대로 하단 고정 입력창(composer)도 전 노드에 없어 "채팅 패널만 스크롤"이라는 시안
// 근거 자체가 없다 — 임의로 경계를 만들지 않는다). **그 결과 가장 가까운 스크롤 조상이
// 곧 페이지/뷰포트가 되므로, 자동 스크롤은 기본적으로 전체 페이지 스크롤이다.** 통합 시점에
// 이 컴포넌트를 고정 높이 + `overflow-y-auto` 컨테이너로 감싸면 그 컨테이너가 스크롤 경계가
// 되어 자동 스크롤이 그 안으로 국한된다 — 반대로 페이지 전체가 스크롤되길 원치 않는 호출부는
// 반드시 그런 경계를 직접 감싸야 한다(이 컴포넌트가 알아서 만들어주지 않는다).
//
// **접근성**: 로딩 카드가 이 컨테이너 안에서 나타났다 사라지므로 `aria-live="polite"`를
// 리스트 루트에 배선한다 — 이전 단계(`AiLoadingBubble`)는 이 배선을 강제하지 않았고, 여기서
// 시점을 확정한다.
/**
 * @typedef {Object} PerformanceChatMessage
 * @property {string|number} id 리스트 key 겸 스크롤 대상 식별자.
 * @property {'ai'|'user'|'system'} [role] 기본 `'ai'`. `kind='text'`일 때만 분기에 쓰인다.
 * @property {'text'|'loading'|'card'} [kind] 기본 `'text'`.
 * @property {string} [body] `kind='text'`일 때 말풍선 본문.
 * @property {{title?: string, subtitle?: string, label?: string, bubbleMaxWidthClassName?: string}} [payload]
 *   `kind='loading'`일 때 `title`/`subtitle`, `kind='text'`(AI)일 때 `label`/`bubbleMaxWidthClassName` 오버라이드.
 * @property {import('react').ReactNode} [children] `kind='text'`(AI)면 말풍선 뒤에 붙는 인라인
 *   카드, `kind='card'`면 `InlineCard`가 감쌀 내용.
 */
/**
 * @param {PerformanceChatMessage[]} [messages]
 * @param {import('react').ReactNode} [children] `messages` 생략 시 그대로 렌더.
 * @param {string} [className] 루트에 추가할 클래스.
 */
export default function ChatTimeline({ messages, children, className = '' }) {
  const lastItemRef = useRef(null);
  const lastId = messages?.length ? messages[messages.length - 1].id : undefined;

  useEffect(() => {
    if (lastId === undefined) return;
    const node = lastItemRef.current;
    if (!node) return;
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    node.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'end' });
  }, [lastId]);

  return (
    <div
      aria-live="polite"
      className={['flex w-full flex-col gap-10', className].join(' ')}
    >
      {messages
        ? messages.map((message, index) => {
            const isLast = index === messages.length - 1;
            const ref = isLast ? lastItemRef : undefined;
            return (
              <div key={message.id} ref={ref}>
                {renderMessage(message)}
              </div>
            );
          })
        : children}
    </div>
  );
}

function renderMessage(message) {
  const { role = 'ai', kind = 'text', body, payload, children } = message;

  if (kind === 'loading') {
    return (
      <AiLoadingBubble
        title={payload?.title}
        subtitle={payload?.subtitle}
        label={payload?.label}
      />
    );
  }

  if (kind === 'card') {
    // 자체 아바타가 없는 컬럼 — AI 말풍선 x축(아바타+gap=4.5rem)에 맞춰 들여쓴다.
    return <InlineCard className="ml-[4.5rem]">{children}</InlineCard>;
  }

  if (role === 'user') {
    return <UserMessage>{body}</UserMessage>;
  }

  return (
    <AiMessage
      label={payload?.label}
      body={body}
      bubbleMaxWidthClassName={payload?.bubbleMaxWidthClassName}
    >
      {children}
    </AiMessage>
  );
}
