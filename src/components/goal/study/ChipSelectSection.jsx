import GoalCard from '../GoalCard';
import SelectChip from './SelectChip';

// 섹션3 "방해 요인"(531×265) / 섹션4 "오늘 완료한 핵심 학습 항목"(1190×184) 공용 — 둘 다 다중
// 선택 pill 칩 그룹이라 한 컴포넌트로 묶는다. part-09 §182~192(방해 요인) / §189~192(핵심 학습
// 항목). 칩 폭은 라벨에 따라 가변(auto-width) — 고정 폭 아님(part-09 §187).
export default function ChipSelectSection({ title, options, selectedValues, onToggle, className = '' }) {
  return (
    <GoalCard tone="neutral" className={`flex h-full flex-col gap-5 px-[2rem] py-[1.875rem] ${className}`}>
      <h3 className="text-[1.125rem] font-bold leading-[1.4] text-ink-strong">{title}</h3>
      <div className="flex flex-wrap gap-[0.625rem]">
        {options.map((option) => (
          <SelectChip
            key={option.value}
            label={option.label}
            selected={selectedValues.includes(option.value)}
            onClick={() => onToggle(option.value)}
          />
        ))}
      </div>
    </GoalCard>
  );
}
