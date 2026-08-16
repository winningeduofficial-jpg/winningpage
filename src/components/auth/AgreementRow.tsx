// 약관 동의 개별 행 — docs/login-signup-renewal-spec.md §3.3(C-1/E-1)/§5.1, 시안 2393:7943.
// 카드 bg-surface-card, radius 0.5rem(8px, 카드/안내 카드 계열 radius), 좌측부터 체크박스 →
// 필수/선택 배지(필수 text-primary/선택 text-ink-sub — text-line은 대비 1.38:1로 판독 불가라 상향) →
// 약관명 순, 우측 펼침 chevron(약관 페이지로
// 링크 이동 — §3.3 F: "별도 풀페이지가 존재하므로 페이지 이동으로 추정" 채택).
import { Check, ChevronRight } from "lucide-react";
import type { CSSProperties } from "react";
import { Link } from "react-router";
import { STAGGER_STEP_MS } from "@/lib/agreementStagger";

type AgreementRowProps = {
  label: string;
  required?: boolean;
  checked?: boolean;
  onToggle?: () => void;
  /** 약관 상세 페이지 경로(chevron 클릭 시 이동). 없으면 chevron 미노출. */
  to?: string;
  /** AgreementList가 매기는 행 순서 — "모두 동의" stagger의 --i로만 쓰인다. */
  index?: number;
  /** AgreementList가 "모두 동의합니다"로 체크될 때만 true(개별 클릭 시 false). */
  staggered?: boolean;
  className?: string;
};

export default function AgreementRow({
  label,
  required = false,
  checked = false,
  onToggle,
  to,
  index = 0,
  staggered = false,
  className = "",
}: AgreementRowProps) {
  const showCheckPop = staggered && checked;

  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-lg bg-surface-card px-5 py-4 ${className}`}
    >
      <label className="-my-4 flex flex-1 cursor-pointer items-center gap-3 py-4 text-left">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className="sr-only"
        />
        <span
          aria-hidden="true"
          style={
            showCheckPop
              ? ({
                  animationDelay: `calc(var(--i) * ${STAGGER_STEP_MS}ms)`,
                  "--i": index,
                } as CSSProperties)
              : undefined
          }
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition ${
            checked
              ? "border-primary bg-primary text-white"
              : "border-line bg-white text-transparent"
          } ${showCheckPop ? "auth-check-pop" : ""}`}
        >
          <Check size={14} strokeWidth={3} />
        </span>

        <span className="flex items-center gap-2 text-sm text-ink">
          <span className={required ? "text-primary" : "text-ink-sub"}>
            {required ? "필수" : "선택"}
          </span>
          {label}
        </span>
      </label>

      {to && (
        <Link
          to={to}
          aria-label={`${label} 상세 보기`}
          className="shrink-0 -m-3 p-3 text-line"
        >
          <ChevronRight size={20} />
        </Link>
      )}
    </div>
  );
}
