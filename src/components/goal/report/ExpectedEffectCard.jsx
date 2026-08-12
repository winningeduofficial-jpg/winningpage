import GoalCard from '../GoalCard';

// Row4(월간 전용) 카드③ `기대 효과` — part-15 §269(pill 371×55 ×3 + 각주). pill 톤 2종(파랑/
// 베이지)이 카테고리별로 다르다는 관측(part-15 §380)이 있으나 규칙이 불명확해 균일 스타일로
// 통일한다(추정, 과도한 분기 방지).
export default function ExpectedEffectCard({ title, pills, caption }) {
  return (
    <GoalCard tone="cream" className="flex min-h-[22.4375rem] flex-col gap-4 px-6 py-6">
      <h3 className="text-[1rem] font-bold leading-[1.4] text-ink-strong">{title}</h3>
      <div className="flex flex-col gap-2.5">
        {pills.map((pill) => (
          <span
            key={pill}
            className="inline-flex w-fit items-center rounded-lg bg-white px-4 py-2.5 text-[0.8125rem] font-semibold leading-[1.4] text-ink-strong"
          >
            {pill}
          </span>
        ))}
      </div>
      <p className="mt-auto text-[0.75rem] leading-[1.5] text-ink-sub">{caption}</p>
    </GoalCard>
  );
}
