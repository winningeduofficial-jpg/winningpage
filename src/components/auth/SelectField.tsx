// 네이티브 select + ChevronDown — docs/login-signup-renewal-spec.md §3.3(C-1 지역/재학구분)/§5.1.
import { ChevronDown } from "lucide-react";

const SIZE_CLASSES: Record<string, string> = {
  default: "h-13 rounded-xl border-line bg-white px-5 pr-12 text-base", // 52px
  lg: "h-perf-inset rounded-xl border-line bg-white px-5 pr-12 text-base", // 60px
  // 인앱(수행평가) 폼 전용 — docs/수행평가-상세-명세.md §5.5/§7.3 실측(3754:3206).
  // 높이 2.5rem(40)·radius 0.5rem(8)·텍스트 0.875rem(14)·보더 performance-line(#d9d9d9)·
  // 배경 performance-bubble(#f8f7f5). default/lg(52·60px, radius 12px, bg-white)와 별개 계열.
  perf: "h-10 rounded-lg border-performance-line bg-performance-bubble px-4 pr-9 text-sm",
};

// 셰브론 아이콘 치수·위치·색 — 사이즈별로 다르다(perf는 시안 실측 VECTOR 11×7 `#808080`,
// default/lg는 기존 회원가입/로그인 폼 그대로 20px `text-line`). `#808080`은 전역 `ink-sub`
// 토큰과 값이 같아 재사용한다(§7.1 재사용 원칙, performance 네임스페이스에 새로 만들지 않음).
type ChevronConfig = {
  size: number;
  width?: number;
  height?: number;
  position: string;
  color: string;
};

const CHEVRON_CONFIG: Record<string, ChevronConfig> = {
  default: { size: 20, position: "right-4", color: "text-line" },
  lg: { size: 20, position: "right-4", color: "text-line" },
  perf: {
    size: 12,
    width: 11,
    height: 7,
    position: "right-3",
    color: "text-ink-sub",
  },
};

const STATUS_TEXT_CLASSES: Record<string, string> = {
  default: "text-ink-sub",
  error: "text-error",
  success: "text-accent",
};

type SelectOption = string | { value: string; label: string };

// options: string[] 또는 { value, label }[] 둘 다 허용.
function normalizeOptions(options?: SelectOption[] | null) {
  return (options || []).map((option) =>
    typeof option === "string" ? { value: option, label: option } : option,
  );
}

type SelectFieldProps = {
  label?: string;
  id?: string;
  name?: string;
  value?: string;
  onChange?: (value: string) => void;
  options?: SelectOption[];
  placeholder?: string;
  size?: string;
  /** 라벨 텍스트 색 오버라이드. 기본값이 기존 하드코딩(text-ink)과 동일해 기존 호출부는
   * 영향받지 않는다 — TextField.jsx의 같은 확장과 동일한 이유(§5.5 필수/선택 라벨 분리). */
  labelClassName?: string;
  helperText?: string;
  status?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
};

export default function SelectField({
  label,
  id,
  name,
  value,
  onChange,
  options,
  placeholder,
  size = "default",
  labelClassName = "text-ink",
  helperText,
  status = "default",
  disabled = false,
  required = false,
  className = "",
}: SelectFieldProps) {
  const fieldId = id || name;
  const normalizedOptions = normalizeOptions(options);
  // CHEVRON_CONFIG.default 키는 항상 정의돼 있는 최종 폴백.
  const chevron = CHEVRON_CONFIG[size] || CHEVRON_CONFIG.default!;

  return (
    <div className={className}>
      {label && (
        <label
          htmlFor={fieldId}
          className={`mb-2 block text-[0.875rem] font-medium ${labelClassName}`}
        >
          {label}
        </label>
      )}

      <div className="relative">
        <select
          id={fieldId}
          name={name}
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          disabled={disabled}
          required={required}
          aria-describedby={helperText ? `${fieldId}-helper` : undefined}
          aria-invalid={status === "error"}
          className={`w-full appearance-none border outline-hidden transition focus:border-primary disabled:cursor-not-allowed disabled:bg-surface-footer ${SIZE_CLASSES[size] || SIZE_CLASSES.default} ${value ? "text-ink" : "text-ink-sub"}`}
        >
          <option value="" disabled hidden>
            {placeholder}
          </option>

          {normalizedOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <ChevronDown
          size={chevron.size}
          // width/height는 chevron.width가 있을 때만 스프레드한다 — lucide Icon은
          // {...defaultAttributes, width: size, height: size, ..., ...rest} 순서라
          // width={undefined}를 그대로 넘기면 rest가 size 기반 width를 덮어써 아이콘이
          // 사라진다(default/lg는 애초에 width/height를 안 정한다).
          {...(chevron.width
            ? { width: chevron.width, height: chevron.height }
            : {})}
          className={`pointer-events-none absolute top-1/2 -translate-y-1/2 ${chevron.position} ${chevron.color}`}
        />
      </div>

      {helperText && (
        <p
          id={`${fieldId}-helper`}
          role="status"
          className={`auth-message-enter mt-2 text-xs ${STATUS_TEXT_CLASSES[status] || STATUS_TEXT_CLASSES.default}`}
        >
          {helperText}
        </p>
      )}
    </div>
  );
}
