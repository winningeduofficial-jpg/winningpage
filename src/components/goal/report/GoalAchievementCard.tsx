import GoalCard from "../GoalCard";
import GoalProgressBar from "../GoalProgressBar";

// Row1 카드① `이번 주/달 목표 달성 현황` — part-11 §235~237(주간, h=200) / part-12 §110·
// part-15 §262~264(월간, h=451 확장형) 겸용. 컴포넌트 트리는 하나로 두고 `variant`로 데이터만
// 분기한다(작업 지시 "주간/월간 차이는 데이터 단위만").
//
// weekly  → rows(2행: 수시/정시 합격률)만 사용.
// monthly → rows(이상/최소 목표 2행) + weeks(4주차 × 최소/이상 미니 프로그레스 8개, part-15 §264).
//
// 두 행(rows[0]/rows[1])의 채움 색을 파랑/초록으로 구분한다(part-11 §236~237 스크린샷 판독:
// 수시=파랑, 정시=그린). 이상/최소 목표 2행도 동일 색 규칙을 재사용한다(판단 지점, 추정).
type AchievementRow = { label: string; value: number; max?: number };
type AchievementWeek = { label: string; min: number; upper: number };

type GoalAchievementCardProps = {
  title?: string | undefined;
  variant?: "weekly" | "monthly";
  rows: AchievementRow[];
  weeks?: AchievementWeek[] | undefined;
};

export default function GoalAchievementCard({
  title,
  variant = "weekly",
  rows,
  weeks,
}: GoalAchievementCardProps) {
  const ROW_FILL = ["bg-accent", "bg-[#ABDFBA]"];

  return (
    <GoalCard
      tone="neutral"
      className="flex min-h-[12.5rem] flex-col gap-5 px-6 py-6"
    >
      <h3 className="text-[1rem] font-bold leading-[1.4] text-ink-strong">
        {title}
      </h3>

      <div className="flex flex-col gap-4">
        {rows.map((row, index) => (
          <div key={row.label} className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between text-[0.8125rem] leading-[1.4]">
              <span className="text-ink">{row.label}</span>
              <span className="font-bold text-ink-strong">{row.value}%</span>
            </div>
            <GoalProgressBar
              value={row.value}
              max={row.max ?? 100}
              thickness="0.375rem"
              // index % ROW_FILL.length 는 항상 배열 범위 내
              fillClassName={ROW_FILL[index % ROW_FILL.length]!}
            />
          </div>
        ))}
      </div>

      {variant === "monthly" && weeks && weeks.length > 0 && (
        <>
          <div className="h-px w-full bg-[#EEEEEE]" aria-hidden="true" />
          <div className="flex flex-1 flex-col justify-center gap-3">
            {weeks.map((week) => (
              <div
                key={week.label}
                className="flex flex-wrap items-center gap-3 text-[0.75rem] leading-[1.3]"
              >
                <span className="w-10 shrink-0 font-semibold text-ink-strong">
                  {week.label}
                </span>
                <div className="flex min-w-[8rem] flex-1 items-center gap-2">
                  <span className="w-8 shrink-0 text-ink-sub">최소</span>
                  <GoalProgressBar
                    value={week.min}
                    max={100}
                    thickness="0.375rem"
                    className="flex-1"
                  />
                  <span className="w-9 shrink-0 text-right font-medium text-ink-strong">
                    {week.min}%
                  </span>
                </div>
                <div className="flex min-w-[8rem] flex-1 items-center gap-2">
                  <span className="w-8 shrink-0 text-ink-sub">이상</span>
                  <GoalProgressBar
                    value={week.upper}
                    max={100}
                    thickness="0.375rem"
                    fillClassName="bg-[#ABDFBA]"
                    className="flex-1"
                  />
                  <span className="w-9 shrink-0 text-right font-medium text-ink-strong">
                    {week.upper}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </GoalCard>
  );
}
