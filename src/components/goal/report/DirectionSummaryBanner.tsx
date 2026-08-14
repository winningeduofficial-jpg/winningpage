// 학습방향 리포트 요약 배너(1340×145, part-13 §67·§72) — 연한 민트 배경 카드. 메타(회차·평균·
// 등급제) → 유형명 → 진단 문단 3단 구성.
type DirectionSummaryBannerProps = {
  meta?: string;
  typeLabel?: string;
  body?: string;
};

export default function DirectionSummaryBanner({
  meta,
  typeLabel,
  body,
}: DirectionSummaryBannerProps) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-goal-cardTone-mint px-7 py-6">
      <span className="text-[0.75rem] leading-[1.4] text-ink-sub">{meta}</span>
      <h3 className="text-[1.125rem] font-bold leading-[1.4] text-ink-strong">
        {typeLabel}
      </h3>
      <p className="max-w-[67.375rem] text-[0.875rem] leading-[1.6] text-ink">
        {body}
      </p>
    </div>
  );
}
