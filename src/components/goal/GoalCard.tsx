// 목표관리 앱 공용 카드 셸 — docs/figma-goal/00-INDEX.md §5-4 `Card`.
// 배경 톤은 4종(neutral/mint/blue/cream, tailwind.config.js `goal.cardTone.*`)이며 화면마다
// tone만 바꿔 재사용한다(대시보드 우측 레일: 목표대학=neutral, 학습계획=mint, 중요일정=blue,
// 학습순위=cream). radius는 문서 추정값 12px(0.75rem)로 전 카드 통일.
// 패딩은 카드마다 내부 구성이 달라(메인 카드 vs 레일 카드) 여기서 강제하지 않고 className으로 받는다.
import type { ReactNode } from "react";

const TONE_CLASS: Record<string, string> = {
  neutral: "bg-goal-cardTone-neutral",
  mint: "bg-goal-cardTone-mint",
  blue: "bg-goal-cardTone-blue",
  cream: "bg-goal-cardTone-cream",
};

type GoalCardProps = {
  tone?: string;
  className?: string;
  children?: ReactNode;
};

export default function GoalCard({
  tone = "neutral",
  className = "",
  children,
}: GoalCardProps) {
  const toneClass = TONE_CLASS[tone] ?? TONE_CLASS.neutral;
  return (
    <div className={`rounded-xl ${toneClass} ${className}`}>{children}</div>
  );
}
