import StepBadge from "./StepBadge";

// 질문 카드 — docs/figma-goal/00-INDEX.md §5-3 `QuestionCard`.
// 폭 1100(68.75rem, 부모 OnboardingStepShell이 결정), 패딩 좌우 3.75rem/상하 2.5rem →
// 내부 콘텐츠 폭 61.25rem(980px). 배지+라벨 / 질문(h40) / 설명(옵셔널, h20) 순서.
export default function QuestionCard({
  step,
  label,
  title,
  description,
  children,
}) {
  return (
    <div className="w-full rounded-[1.5rem] bg-white px-[3.75rem] py-[2.5rem]">
      <div className="flex items-center gap-[0.75rem]">
        <StepBadge step={step} />
        <span className="text-[0.875rem] text-ink-sub">{label}</span>
      </div>

      <h2 className="mt-[1.5rem] text-[1.5rem] font-bold leading-[1.4] text-ink-strong">
        {title}
      </h2>

      {/* 설명문은 옵셔널 슬롯 — part-01 #2(카드 B)처럼 없는 스텝도 있다(part-01 구현 노트). */}
      {description && (
        <p className="mt-[0.5rem] text-[0.875rem] leading-[1.5] text-ink-sub">
          {description}
        </p>
      )}

      <div className="mt-[2rem]">{children}</div>
    </div>
  );
}
