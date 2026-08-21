import type { ReactNode } from "react";

// 상태 뱃지 공용 원자 — 3단 의미색(결정5): red(취약) / amber(보완 필요) / blue(양호·상위 등).
// Figma 시안(1889-12784) 확정 팔레트 — 뮤티드 톤(2026-08-20).
const TONES: Record<string, { bg: string; text: string }> = {
  red: { bg: "#F7DAD8", text: "#98504D" },
  amber: { bg: "#F5EBCB", text: "#9A843F" },
  blue: { bg: "#E9F4FF", text: "#496C99" },
};

type StatusBadgeProps = {
  tone?: string;
  children?: ReactNode;
  className?: string;
};

export default function StatusBadge({
  tone = "blue",
  children,
  className = "",
}: StatusBadgeProps) {
  // blue는 TONES에 항상 존재하는 리터럴 키(폴백 보장) — noUncheckedIndexedAccess 대응.
  const { bg, text } = TONES[tone] ?? TONES.blue!;

  return (
    <span
      className={`inline-flex items-center justify-center rounded-xl px-2 py-1 text-base font-normal leading-5 ${className}`}
      style={{ backgroundColor: bg, color: text }}
    >
      <span className="min-w-10 text-center">{children}</span>
    </span>
  );
}
