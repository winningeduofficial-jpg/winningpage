import GoalCard from "@/components/goal/GoalCard";

// 섹션5 "한 문장 회고"(1190×238) — 텍스트영역 1137×109(71.0625rem×6.8125rem). part-09 §194~197.
type RetrospectSectionProps = {
  value?: string;
  onChange: (value: string) => void;
};

export default function RetrospectSection({
  value,
  onChange,
}: RetrospectSectionProps) {
  return (
    <GoalCard tone="neutral" className="flex flex-col gap-4 px-8 py-7.5">
      <div>
        <h3 className="text-[1.125rem] font-bold leading-[1.4] text-ink-strong">
          한 문장 회고
        </h3>
        <p className="mt-1 text-[0.875rem] leading-[1.4] text-ink-sub">
          오늘 하루를 한 문장으로 남겨보세요
        </p>
      </div>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="예) 오늘 어떤 유형이 어려웠는지, 내일은 무엇부터 할지 적어보세요"
        className="h-27.25 w-full resize-none rounded-lg border border-line bg-white px-5 py-4 text-[0.875rem] leading-[1.4] text-ink placeholder:text-ink-sub focus:border-accent focus:outline-hidden focus:ring-1 focus:ring-accent"
      />
    </GoalCard>
  );
}
