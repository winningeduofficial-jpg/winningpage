// 온보딩 진행 바 — docs/figma-goal/00-INDEX.md §5-3 `OnboardingProgress`.
// ⚠︎ 채움 폭은 반드시 `current/total` 비례로만 계산한다. 시안 px값(184/368/1104)은 스텝 2~6이
// 전부 368로 미갱신된 시안 결함이라 절대 하드코딩하지 말 것(작업 지시 §확정 사항 5).
export default function OnboardingProgress({ current, total, className = '' }) {
  const pct = total > 0 ? Math.min(100, Math.max(0, (current / total) * 100)) : 0;

  return (
    <div
      role="progressbar"
      aria-valuenow={current}
      aria-valuemin={1}
      aria-valuemax={total}
      aria-label={`온보딩 진행률 ${current} / ${total}단계`}
      className={`h-[0.625rem] w-full rounded-full bg-surface-01 ${className}`}
    >
      <div
        className="h-full rounded-full bg-surface-02 transition-[width] duration-300"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
