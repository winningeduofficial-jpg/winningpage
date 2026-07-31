// 선택형 정사각 카드 — docs/login-signup-renewal-spec.md §3.3(B-1 296px/E-2·E-5 280px)/§5.1.
// size='lg'(18.5rem/296px, B-1 회원유형 선택) | size='md'(17.5rem/280px, E-2/E-5 자녀 연결
// 방법 선택). radius 2.5rem(40px) 고정, 미선택 border-line, 선택 시 border-primary.
// 반응형(adapt.md): 두 카드를 가로로 나란히 두면(37.75rem) 640px 폭에서 넘치므로 md: 미만은
// 세로 스택 + 유동폭(부모가 md:flex-row로 전환 — MemberType.jsx/LinkChoice.jsx 소관)으로
// 재구성한다. 정사각 고정 높이도 풀폭에서 과도하므로 모바일은 min-h로 완화.
// radius 40px도 풀폭 카드에서 과대해 모바일은 rounded-3xl(24px)로 축소, md부터 원래 값.
const SIZE_CLASSES = {
  lg: 'min-h-[11rem] w-full md:min-h-0 md:h-[18.5rem] md:w-[18.5rem]',
  md: 'min-h-[10rem] w-full md:min-h-0 md:h-[17.5rem] md:w-[17.5rem]'
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
      className={`flex flex-col items-center justify-center gap-4 rounded-3xl border bg-white px-6 py-6 text-center transition md:rounded-[2.5rem] ${
        selected ? 'border-primary ring-2 ring-primary/10' : 'border-line'
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
