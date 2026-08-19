// 사용자 말풍선 프리미티브 — docs/수행평가-상세-명세.md §3.1(우변 x=1756 정렬) / §5.6·§5.8
// (`3754:3261`/`3754:3370` 실측) / §7.1(색) / §7.2(타이포).
//
// 실측(`3754:3370`): 요약 말풍선 @1264,491 492×61, 짧은 말풍선 @1568,747 188×61 — 우변이
// 둘 다 1756(1264+492 = 1568+188 = 1756)으로 일치해 §3.1의 "우변 x=1756 고정" 단정을
// 뒷받침한다. 좌변은 내용 길이에 따라 가변이므로 폭을 고정하지 않고 내용에 맞춘 뒤
// (`w-fit`) AI 말풍선과 같은 상한(`max-w-perf-bubble`, 596px)만 걸어 아주 긴 입력이
// 캔버스를 벗어나지 않게 한다.
//
// 패딩 실측: 텍스트 @1284,511 vs 말풍선 @1264,491 → 좌 인셋 20px(1.25rem), 상 인셋
// 20px(1.25rem) — AI 말풍선과 동일한 `p-5`. 배경 `#37352f`(=`performance-userBubble`,
// §11.1 Q5 결정 — primary 브랜드색과 별개 토큰, 절대 합치지 말 것), 텍스트 흰색.
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
      <div className="w-fit max-w-perf-bubble rounded-2xl bg-performance-userBubble p-5">
        {/* 실측: 16px/21 w500 #ffffff. */}
        <p className="whitespace-pre-line text-left text-[1rem] font-medium leading-5.25 text-white">
          {children}
        </p>
      </div>
    </div>
  );
}
