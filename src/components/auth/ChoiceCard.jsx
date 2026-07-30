// 선택형 정사각 카드 — docs/login-signup-renewal-spec.md §3.3(B-1 296px/E-2·E-5 280px)/§5.1.
// size='lg'(18.5rem/296px, B-1 회원유형 선택) | size='md'(17.5rem/280px, E-2/E-5 자녀 연결
// 방법 선택). radius 2.5rem(40px) 고정, 미선택 border-line, 선택 시 border-primary.
const SIZE_CLASSES = {
  lg: 'h-[18.5rem] w-[18.5rem]',
  md: 'h-[17.5rem] w-[17.5rem]'
};

export default function ChoiceCard({
  size = 'lg', // 'lg' | 'md'
  icon, // 일러스트/아이콘 ReactNode
  title,
  description,
  selected = false,
  onClick,
  type = 'button',
  className = ''
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      aria-pressed={selected}
      className={`flex flex-col items-center justify-center gap-4 rounded-[2.5rem] border bg-white px-6 py-6 text-center transition ${
        selected ? 'border-primary' : 'border-line'
      } ${SIZE_CLASSES[size] || SIZE_CLASSES.lg} ${className}`}
    >
      {icon && <div className="flex items-center justify-center">{icon}</div>}

      <div>
        <p className="text-xl font-medium text-ink-title">{title}</p>

        {description && <p className="mt-2 text-base text-ink">{description}</p>}
      </div>
    </button>
  );
}
