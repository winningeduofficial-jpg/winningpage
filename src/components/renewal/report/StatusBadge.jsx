// 상태 뱃지 공용 원자 — 3단 의미색(결정5): red(취약) / amber(보완 필요) / blue(양호·상위 등).
const TONES = {
  red: { bg: '#ffcdcd', text: '#991e1e' },
  amber: { bg: 'rgba(255,233,155,0.8)', text: '#736123' },
  blue: { bg: '#f1f8ff', text: '#1b5da0' },
};

export default function StatusBadge({ tone = 'blue', children, className = '' }) {
  const { bg, text } = TONES[tone] ?? TONES.blue;

  return (
    <span
      className={`inline-flex items-center justify-center rounded-[0.75rem] px-2 py-1 text-base font-normal leading-[1.25rem] ${className}`}
      style={{ backgroundColor: bg, color: text }}
    >
      <span className="min-w-[2.5rem] text-center">{children}</span>
    </span>
  );
}
