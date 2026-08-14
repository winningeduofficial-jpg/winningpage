// 목표관리 앱 지표 뱃지 — docs/figma-goal/00-INDEX.md §5-4 `StatChip`/`MetricPill`.
// 모의고사 카드 `현재 종합 백분위 78.4`(연파랑), 내신 카드 `현재 내신 평균 3.24 등급 (9등급 환산)`
// (연보라) 등 라벨+값 2줄 파스텔 필. 정확한 HEX는 변수 미연결이라 00-INDEX §6-1 실측값을 그대로 씀.
const TONE_CLASS = {
  blue: "bg-[#E7F0FB] text-[#1D5FBF]", // 모의고사(part-05 §63 실측)
  purple: "bg-[#E0DDF4] text-[#5B4E9E]", // 내신(part-05 §63 실측)
};

export default function GoalStatChip({ label, value, tone = "blue" }) {
  const toneClass = TONE_CLASS[tone] ?? TONE_CLASS.blue;
  return (
    <div
      className={`inline-flex min-h-[4.25rem] w-fit flex-col justify-center gap-1 rounded-xl px-4 py-3 ${toneClass}`}
    >
      <span className="text-[0.75rem] leading-[1.4] opacity-80">{label}</span>
      <span className="text-[1.125rem] font-bold leading-[1.3]">{value}</span>
    </div>
  );
}
