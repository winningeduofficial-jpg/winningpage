// 전체 동의 + 개별 약관 행 목록 — docs/login-signup-renewal-spec.md §3.3(C-1 6행/E-1 4행)/§5.1.
// "모두 동의합니다" 행은 전체 토글이며 상세 링크(chevron)가 없다. 개별 항목은 items 배열로
// 받아 AgreementRow에 그대로 매핑한다(학생 폼 6항목, 학부모 폼 4항목처럼 화면마다 항목 수·
// 구성이 다르므로 컴포넌트 내부에 항목을 하드코딩하지 않는다 — §3.3 C-1/E-1 참고).
import { Check } from 'lucide-react';
import AgreementRow from './AgreementRow';

export default function AgreementList({
  items, // [{ key, label, required, checked, to }]
  allChecked = false,
  onToggleAll,
  onToggleItem, // (key) => void
  className = ''
}) {
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <button
        type="button"
        role="checkbox"
        aria-checked={allChecked}
        onClick={onToggleAll}
        className="flex items-center gap-3 rounded-lg bg-surface-card px-5 py-4 text-left"
      >
        <span
          aria-hidden="true"
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition ${
            allChecked
              ? 'border-primary bg-primary text-white'
              : 'border-line bg-white text-transparent'
          }`}
        >
          <Check size={14} strokeWidth={3} />
        </span>

        <span className="text-sm font-medium text-ink">모두 동의합니다</span>
      </button>

      {(items || []).map((item) => (
        <AgreementRow
          key={item.key}
          label={item.label}
          required={item.required}
          checked={item.checked}
          to={item.to}
          onToggle={() => onToggleItem?.(item.key)}
        />
      ))}
    </div>
  );
}
