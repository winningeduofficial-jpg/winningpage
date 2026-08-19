// 라벨 + 스위치 토글 행 — 마이페이지 "내 정보 수정" 탭 "이용안내" 목록의 한 행.
//
// 스위치 치수는 시안 실측이다(3665:5422 트랙 / 3665:5423 노브, 학생 내 정보
// 수정 3665:5323) — 트랙 36×20 radius 20, 노브 16×16, ON 일 때 노브 좌측
// 오프셋 18px(우측 여백 2px), 상하 여백 각 2px. 최초 구현은 44×24 / 노브 20
// 이었는데 시안보다 한 단계 커서 3.25rem 행 안에서 뭉툭해 보였다(2026-08-13 수정).
// OFF 색은 시안에 ON 상태만 있어 기존 bg-line 을 유지한다.
// 위·아래에 있는 서비스 이용약관/개인정보처리방침 같은 chevron 링크 행과 같은 박스 스타일
// (rounded-xl border, h-[3.25rem])로 통일해 하나의 목록처럼 보이게 한다 — 시안(3762:20170)
// 실측: 토글 on 색이 accent(#0B84FD, 밝은 파랑)이고 primary(네이비)와 다르다.
type ToggleRowProps = {
  label: string;
  description?: string;
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
};

export default function ToggleRow({
  label,
  description,
  checked = false,
  onChange,
  disabled = false,
  className = "",
}: ToggleRowProps) {
  return (
    <div
      className={`flex h-13 items-center justify-between gap-4 rounded-xl border border-line px-5 ${className}`}
    >
      <div className="min-w-0">
        <p className="text-sm text-ink">{label}</p>
        {description && (
          <p className="mt-0.5 break-keep text-xs text-ink-sub">
            {description}
          </p>
        )}
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => !disabled && onChange?.(!checked)}
        disabled={disabled}
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
          checked ? "bg-accent" : "bg-line"
        }`}
      >
        {/* left-0 이 없으면 노브가 트랙 밖으로 삐져나온다. <button> 은 기본
            text-align: center 라, left/right 를 주지 않은 absolute 자식의 기준
            위치(static position)가 좌상단이 아니라 **가운데**로 잡힌다. 거기에
            translate-x 가 더해져 오른쪽으로 밀려 나갔다(2026-08-13 수정).
            translate 로 움직이는 값이므로 left 는 0 으로 고정하고 오프셋은
            transform 이 전담한다. */}
        <span
          aria-hidden="true"
          className={`absolute left-0 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-4.5" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}
