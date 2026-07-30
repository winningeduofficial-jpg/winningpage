// 약관 동의 개별 행 — docs/login-signup-renewal-spec.md §3.3(C-1/E-1)/§5.1, 시안 2393:7943.
// 카드 bg-surface-card, radius 0.5rem(8px, 카드/안내 카드 계열 radius), 좌측부터 체크박스 →
// 필수/선택 배지(필수 text-primary/선택 text-line) → 약관명 순, 우측 펼침 chevron(약관 페이지로
// 링크 이동 — §3.3 F: "별도 풀페이지가 존재하므로 페이지 이동으로 추정" 채택).
import { ChevronRight, Check } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function AgreementRow({
  label,
  required = false,
  checked = false,
  onToggle,
  to, // 약관 상세 페이지 경로(chevron 클릭 시 이동). 없으면 chevron 미노출.
  className = ''
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-lg bg-surface-card px-5 py-4 ${className}`}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex flex-1 items-center gap-3 text-left"
      >
        <span
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition ${
            checked ? 'border-primary bg-primary text-white' : 'border-line bg-white text-transparent'
          }`}
        >
          <Check size={14} strokeWidth={3} />
        </span>

        <span className="flex items-center gap-2 text-sm text-ink">
          <span className={required ? 'text-primary' : 'text-line'}>
            {required ? '필수' : '선택'}
          </span>
          {label}
        </span>
      </button>

      {to && (
        <Link to={to} aria-label={`${label} 상세 보기`} className="shrink-0 text-line">
          <ChevronRight size={20} />
        </Link>
      )}
    </div>
  );
}
