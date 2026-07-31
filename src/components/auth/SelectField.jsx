// 네이티브 select + ChevronDown — docs/login-signup-renewal-spec.md §3.3(C-1 지역/재학구분)/§5.1.
import { ChevronDown } from 'lucide-react';

const SIZE_CLASSES = {
  default: 'h-[3.25rem]', // 52px
  lg: 'h-[3.75rem]' // 60px
};

const STATUS_TEXT_CLASSES = {
  default: 'text-ink-sub',
  error: 'text-error',
  success: 'text-accent'
};

// options: string[] 또는 { value, label }[] 둘 다 허용.
function normalizeOptions(options) {
  return (options || []).map((option) =>
    typeof option === 'string' ? { value: option, label: option } : option
  );
}

export default function SelectField({
  label,
  id,
  name,
  value,
  onChange,
  options,
  placeholder,
  size = 'default', // 'default' | 'lg'
  helperText,
  status = 'default', // 'default' | 'error' | 'success'
  disabled = false,
  required = false,
  className = ''
}) {
  const fieldId = id || name;
  const normalizedOptions = normalizeOptions(options);

  return (
    <div className={className}>
      {label && (
        <label htmlFor={fieldId} className="mb-2 block text-[0.875rem] font-medium text-ink">
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
          aria-invalid={status === 'error'}
          className={`w-full appearance-none rounded-xl border border-line bg-white px-5 pr-12 text-base outline-none transition focus:border-primary disabled:cursor-not-allowed disabled:bg-surface-footer ${SIZE_CLASSES[size] || SIZE_CLASSES.default} ${value ? 'text-ink' : 'text-ink-sub'}`}
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
          size={20}
          className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-line"
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
