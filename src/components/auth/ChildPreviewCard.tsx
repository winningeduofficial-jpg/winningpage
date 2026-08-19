// 자녀 미리보기 카드 — docs/login-signup-renewal-spec.md §3.3(E-3 연결코드 입력)/§5.1.
// bg-surface-info, 높이 3.75rem(60px), radius 0.75rem(12px), 원형 프로필 + 이름 + 학년/학교.
// E-3 상태 매트릭스: 코드 인식 직후(2393-10969)엔 border 없음·프로필 2.25rem(36px) 노출, 자녀
// 선택/활성(2393-11078)엔 border-primary이나 시안상 아바타 미표시 — selected일 때 아바타를
// 렌더하지 않는다. TODO: 코드 인식→선택 전환 시 아바타가 사라지는 상태 전환 규칙은 디자이너
// 확인 대기(§3.3 미해결 이슈로 별도 등록 필요).
const AVATAR_SIZE_CLASSES: Record<string, string> = {
  default: "h-9 w-9", // 36px
  lg: "h-10 w-10", // 40px
};

type ChildPreviewCardProps = {
  name?: string;
  /** 예: '고3' */
  grade?: string;
  school?: string;
  avatarUrl?: string;
  selected?: boolean;
  avatarSize?: string;
  onClick?: () => void;
  type?: "button" | "submit" | "reset";
  className?: string;
};

export default function ChildPreviewCard({
  name,
  grade,
  school,
  avatarUrl,
  selected = false,
  avatarSize = "default",
  onClick,
  type = "button",
  className = "",
}: ChildPreviewCardProps) {
  const initial = (name || "").trim().slice(0, 1);

  return (
    <button
      type={type}
      onClick={onClick}
      aria-pressed={selected}
      className={`flex h-perf-inset w-full items-center gap-3 rounded-xl border bg-surface-info px-4 text-left transition active:scale-[0.98] motion-reduce:active:scale-100 ${
        selected ? "border-primary" : "border-transparent"
      } ${className}`}
    >
      {!selected && (
        <span
          className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-white text-sm font-medium text-primary ${
            AVATAR_SIZE_CLASSES[avatarSize] || AVATAR_SIZE_CLASSES.default
          }`}
        >
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={name}
              className="h-full w-full object-cover"
            />
          ) : (
            initial
          )}
        </span>
      )}

      <span className="text-sm text-ink">
        <span className="font-medium">{name}</span>
        {(grade || school) && (
          <span className="text-ink-sub">
            {" "}
            {[grade, school].filter(Boolean).join(" ")}
          </span>
        )}
      </span>
    </button>
  );
}
