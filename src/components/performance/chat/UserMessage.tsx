// 사용자 말풍선 프리미티브 — docs/수행평가-상세-명세.md §3.1(우변 x=1756 정렬) / §5.6·§5.8
// (`3754:3261`/`3754:3370` 실측) / §7.1(색) / §7.2(타이포).
//
// **2026-09-06 재구성**: shadcn `Bubble`/`BubbleContent`(`variant="ghost"` — 자체 브랜드 색
// `performance-userBubble`을 쓰므로 배경·반경·패딩은 이 컴포넌트가 직접 얹는다)로 옮긴다.
// `Message` 컴포넌트는 쓰지 않는다 — 아바타·라벨이 없는 이 컴포넌트에는 `Message`의
// 아바타 슬롯·`data-align` 행 반전 로직이 필요 없고, 기존처럼 `flex justify-end` 하나로
// 충분하다(아래 "아바타·라벨 없음" 주석 그대로 유지).
//
// 실측(`3754:3370`): 요약 말풍선 @1264,491 492×61, 짧은 말풍선 @1568,747 188×61 — 우변이
// 둘 다 1756(1264+492 = 1568+188 = 1756)으로 일치해 §3.1의 "우변 x=1756 고정" 단정을
// 뒷받침한다. 좌변은 내용 길이에 따라 가변이므로 폭을 고정하지 않고 내용에 맞춘 뒤
// (`w-fit`) AI 말풍선과 같은 상한(`max-w-perf-bubble`)만 걸어 아주 긴 입력이 캔버스를
// 벗어나지 않게 한다. `Bubble` 자체의 기본 `max-w-[80%]`는 이 화면 실측과 무관한 값이라
// `max-w-none`으로 지우고 `BubbleContent`의 `max-w-perf-bubble` 하나만 남긴다.
//
// 패딩: AI 말풍선과 동일 스케일(`p-4`, 2026-09-06 축소 — 기존 `p-5`). 배경
// `#37352f`(=`performance-userBubble`, §11.1 Q5 결정 — primary 브랜드색과 별개 토큰,
// 절대 합치지 말 것), 텍스트 흰색.
//
// **아바타·라벨 없음** — 두 슬라이스 모두 사용자 메시지 옆에 아바타/발신자 라벨 레이어가
// 없다(작업 지시서 ② 확인 사항). AI 쪽과 달리 이 컴포넌트는 컬럼 없이 말풍선 하나만
// 우측 정렬한다.
//
// 텍스트 정렬은 우측(bubble position)과 별개로 좌측 정렬이다 — 여러 줄 문구(§5.9
// "수행평가 정보:\n수행평가 유형: …")가 채팅 UI 관례대로 버블 내부에서는 좌측 정렬로
// 읽히는 편이 자연스럽고, 실측 좌표도 매 줄 좌변이 텍스트 블록 x(1262/1284)로 고정돼
// 있어 우측 정렬 근거가 없다.
import type { ReactNode } from "react";
import { Bubble, BubbleContent } from "@/components/ui/bubble";

type UserMessageProps = {
  /** 말풍선 본문. 여러 줄 문자열을 그대로 넘기면 `whitespace-pre-line`이 줄바꿈을 보존한다. */
  children?: ReactNode;
  /** 루트(우측 정렬 컨테이너)에 추가할 클래스. */
  className?: string;
};

export default function UserMessage({
  children,
  className = "",
}: UserMessageProps) {
  return (
    <div className={["flex justify-end", className].join(" ")}>
      <Bubble variant="ghost" align="end" className="max-w-none">
        <BubbleContent className="w-fit max-w-perf-bubble rounded-2xl bg-performance-userBubble p-4">
          {/* 실측: 15px/22.5 w500 #ffffff(2026-09-06 스케일 축소, 기존 16px). */}
          <p className="whitespace-pre-line text-left text-app-body font-medium text-white">
            {children}
          </p>
        </BubbleContent>
      </Bubble>
    </div>
  );
}
