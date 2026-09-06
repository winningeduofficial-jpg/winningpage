// 사용자 말풍선 프리미티브 — docs/수행평가-상세-명세.md §3.1(우변 x=1756 정렬) / §5.6·§5.8
// (`3754:3261`/`3754:3370` 실측) / §7.1(색) / §7.2(타이포).
//
// **2026-09-06 shadcn 공식 조합 정렬**: `Message align="end"` + `Bubble variant="default"`
// (사용자 턴을 뜻하는 shadcn 팔레트)로 옮긴다. `Message`의 `data-align=end` 행 반전
// (`flex-row-reverse`)이 예전에 직접 걸던 `flex justify-end`와 같은 결과를 낸다 — 아바타가
// 없어도 `Message`를 쓰는 이유는 공식 조합 자체(`Message > MessageContent > Bubble`)를
// 따르기 위함이다.
//
// **색 (§11.1 Q5 결정 유지)**: `Bubble variant="default"`의 기본 배색은
// `bg-primary`(`#013262`, 사이트 브랜드 남색)인데, 이 화면의 사용자 말풍선 색
// `#37352f`(=`performance-userBubble`)는 그 결정에서 "primary 브랜드색과 별개 토큰,
// 절대 합치지 말 것"로 명시적으로 못박은 값이다 — 남색과 웜그레이 계열은 색상 자체가
// 달라(§7.1) `--primary`로 대체할 수 없다(확인 완료, 보고 대상). 그래서 `variant="default"`가
// 주는 `*:data-[slot=bubble-content]:bg-primary` 오버라이드를 `BubbleContent`가 아니라
// **`Bubble` 자신에게 같은 형태(`*:data-[slot=bubble-content]:…`)의 override 클래스 +
// `!` important**로 되짚어 지운다 — `BubbleContent`에 평범한 클래스만 얹으면 셀렉터
// 특이도가 낮아(단일 클래스 vs `부모클래스 > [data-slot=...]`) variant 쪽이 이긴다.
//
// 실측(`3754:3370`): 요약 말풍선 @1264,491 492×61, 짧은 말풍선 @1568,747 188×61 — 우변이
// 둘 다 1756(1264+492 = 1568+188 = 1756)으로 일치해 §3.1의 "우변 x=1756 고정" 단정을
// 뒷받침한다. 좌변은 내용 길이에 따라 가변이므로 폭을 고정하지 않고 내용에 맞춘 뒤
// (`w-fit`) AI 말풍선과 같은 상한(`max-w-perf-bubble`)만 걸어 아주 긴 입력이 캔버스를
// 벗어나지 않게 한다. 말풍선 폭은 `BubbleContent`가 아니라 `Bubble`에 한 번만 건다.
//
// **아바타·라벨 없음** — 두 슬라이스 모두 사용자 메시지 옆에 아바타/발신자 라벨 레이어가
// 없다(작업 지시서 ② 확인 사항). `MessageAvatar`/`MessageHeader`는 렌더하지 않는다.
//
// 텍스트 정렬은 우측(bubble position)과 별개로 좌측 정렬이다 — 여러 줄 문구(§5.9
// "수행평가 정보:\n수행평가 유형: …")가 채팅 UI 관례대로 버블 내부에서는 좌측 정렬로
// 읽히는 편이 자연스럽고, 실측 좌표도 매 줄 좌변이 텍스트 블록 x(1262/1284)로 고정돼
// 있어 우측 정렬 근거가 없다.
import type { ReactNode } from "react";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Message, MessageContent } from "@/components/ui/message";

type UserMessageProps = {
  /** 말풍선 본문. 여러 줄 문자열을 그대로 넘기면 `whitespace-pre-line`이 줄바꿈을 보존한다. */
  children?: ReactNode;
  /** 루트에 추가할 클래스. */
  className?: string;
};

export default function UserMessage({
  children,
  className = "",
}: UserMessageProps) {
  return (
    <Message align="end" className={className}>
      <MessageContent>
        <Bubble
          variant="default"
          align="end"
          className={[
            "w-fit max-w-perf-bubble",
            "*:data-[slot=bubble-content]:bg-performance-userBubble! *:data-[slot=bubble-content]:text-white!",
          ].join(" ")}
        >
          <BubbleContent>
            {/* 실측: 15px/22.5 w500 #ffffff(2026-09-06 스케일 축소, 기존 16px). */}
            <p className="whitespace-pre-line text-left text-app-body font-medium">
              {children}
            </p>
          </BubbleContent>
        </Bubble>
      </MessageContent>
    </Message>
  );
}
