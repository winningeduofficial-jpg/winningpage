import GoalCard from "../GoalCard";

// "오늘의 조언" 카드(530×194 = 33.125rem×12.125rem, part-07 #20 y=700) — 카드 타이틀 + 본문만
// 렌더한다. 조언 뱃지("일일 분석 조언"/"AI 입시 분석 조언")는 이 카드 소속이 아니라 페이지
// 헤더(y=100, `DashboardPageHeader`)에 있다(part-07 §126 실측 정정, 2026-08-10 — 직전 작업에서
// 이 카드 안에 뱃지를 넣었던 것은 잘못된 지시에 따른 것이었다).
type AdviceCardProps = {
  data: { body: string };
};

export default function AdviceCard({ data }: AdviceCardProps) {
  return (
    <GoalCard
      tone="neutral"
      className="flex h-full flex-col gap-4 px-[2rem] py-[1.75rem]"
    >
      <h3 className="text-[1.125rem] font-bold leading-[1.4] text-ink-strong">
        오늘의 조언
      </h3>
      <p className="text-[0.875rem] leading-[1.5] text-ink">{data.body}</p>
    </GoalCard>
  );
}
