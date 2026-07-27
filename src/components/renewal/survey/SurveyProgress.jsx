/**
 * SurveyProgress
 * Figma: hsokTD6OilcNEXyCR24sn4 / 1889:13222 (활성 상태, bg #013262) / 1889:8753 (비활성 상태, bg #d7d7d7)
 *
 * "N개 문항이 남았어요" 진행 바 겸 제출 CTA.
 * 미리보기 단계라 클릭 동작은 없고, disabled 시각 상태만 반영한다.
 */
export default function SurveyProgress({ remaining, disabled = false, label }) {
  const text = label ?? `${remaining}개 문항이 남았어요`;

  return (
    <button
      type="button"
      disabled={disabled}
      aria-disabled={disabled}
      className={`flex h-[3.75rem] w-full items-center justify-center rounded-xl px-6 text-center text-lg font-semibold text-white transition sm:px-[4.6875rem] ${
        disabled ? 'bg-[#d7d7d7]' : 'bg-[#013262] hover:bg-[#012548]'
      }`}
    >
      {text}
    </button>
  );
}
