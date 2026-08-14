// 안내 박스 — docs/login-signup-renewal-spec.md §3.3(D-1/D-2/E-6/C-2)/§5.1.
// variant='card'(bg-surface-card, 동의 안내·코드 안내 카드) | variant='info'(bg-surface-info,
// 파란 안내 박스 — 학부모 휴대폰번호 수집 안내, 14세 미만 법정대리인 동의 안내 등).
const VARIANT_CLASSES = {
  card: "bg-surface-card",
  info: "bg-surface-info",
};

const RADIUS_CLASSES = {
  default: "rounded-lg", // 0.5rem(8px)
  lg: "rounded-xl", // 0.75rem(12px) — E-6 안내 박스
};

export default function InfoCard({
  children,
  variant = "card", // 'card' | 'info'
  radius = "default", // 'default' | 'lg'
  className = "",
}) {
  return (
    <div
      className={`p-5 text-sm leading-6 text-ink ${VARIANT_CLASSES[variant] || VARIANT_CLASSES.card} ${
        RADIUS_CLASSES[radius] || RADIUS_CLASSES.default
      } ${className}`}
    >
      {children}
    </div>
  );
}
