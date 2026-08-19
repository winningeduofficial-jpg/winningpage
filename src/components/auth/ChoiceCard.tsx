// 선택형 정사각 카드 — docs/login-signup-renewal-spec.md §3.3(B-1 296px/E-2·E-5 280px)/§5.1.
// size='lg'(18.5rem/296px, B-1 회원유형 선택) | size='md'(17.5rem/280px, E-2/E-5 자녀 연결
// 방법 선택). radius 2.5rem(40px) 고정, 미선택 border-line, 선택 시 border-primary.
// 반응형(adapt.md): 두 카드를 가로로 나란히 두면(37.75rem) 640px 폭에서 넘치므로 md: 미만은
// 세로 스택 + 유동폭(부모가 md:flex-row로 전환 — MemberType.jsx/LinkChoice.jsx 소관)으로
// 재구성한다. 정사각 고정 높이도 풀폭에서 과도하므로 모바일은 min-h로 완화.
// radius 40px도 풀폭 카드에서 과대해 모바일은 rounded-3xl(24px)로 축소, md부터 원래 값.
import type { ReactNode } from "react";

const SIZE_CLASSES: Record<string, string> = {
  lg: "min-h-44 w-full md:min-h-0 md:h-74 md:w-74",
  md: "min-h-40 w-full md:min-h-0 md:h-70 md:w-70",
};

type ChoiceCardProps = {
  size?: string;
  icon?: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  selected?: boolean;
  onClick?: () => void;
  type?: "button" | "submit" | "reset";
  className?: string;
};

export default function ChoiceCard({
  size = "lg",
  icon,
  title,
  description,
  selected = false,
  onClick,
  type = "button",
  className = "",
}: ChoiceCardProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      aria-pressed={selected}
      className={`flex flex-col items-center justify-center gap-4 rounded-3xl border bg-white px-6 py-6 text-center transition active:scale-[0.98] motion-reduce:active:scale-100 md:rounded-[2.5rem] ${
        selected ? "border-primary ring-2 ring-primary/10" : "border-line"
      } ${SIZE_CLASSES[size] || SIZE_CLASSES.lg} ${className}`}
    >
      {icon && <div className="flex items-center justify-center">{icon}</div>}

      <div>
        <p className="text-xl font-medium text-ink-title">{title}</p>

        {description && (
          <p className="mt-2 break-keep text-base text-ink">{description}</p>
        )}
      </div>
    </button>
  );
}
