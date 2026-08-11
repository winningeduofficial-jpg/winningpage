// 라벨 + 스위치 토글 행 — 마이페이지 "내 정보 수정" 탭 "이용안내" 목록의 한 행.
// 위·아래에 있는 서비스 이용약관/개인정보처리방침 같은 chevron 링크 행과 같은 박스 스타일
// (rounded-xl border, h-[3.25rem])로 통일해 하나의 목록처럼 보이게 한다 — 시안(3762:20170)
// 실측: 토글 on 색이 accent(#0B84FD, 밝은 파랑)이고 primary(네이비)와 다르다.
export default function ToggleRow({
  label,
  description,
  checked = false,
  onChange,
  disabled = false,
  className = ''
}) {
  return (
    <div
      className={`flex h-[3.25rem] items-center justify-between gap-4 rounded-xl border border-line px-5 ${className}`}
    >
      <div className="min-w-0">
        <p className="text-sm text-ink">{label}</p>
        {description && <p className="mt-0.5 break-keep text-xs text-ink-sub">{description}</p>}
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => !disabled && onChange?.(!checked)}
        disabled={disabled}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
          checked ? 'bg-accent' : 'bg-line'
        }`}
      >
        <span
          aria-hidden="true"
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-[1.375rem]' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  );
}
