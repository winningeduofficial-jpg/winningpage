// 전체 동의 + 개별 약관 행 목록 — docs/login-signup-renewal-spec.md §3.3(C-1 6행/E-1 4행)/§5.1.
// "모두 동의합니다" 행은 전체 토글이며 상세 링크(chevron)가 없다. 개별 항목은 items 배열로
// 받아 AgreementRow에 그대로 매핑한다(학생 폼 6항목, 학부모 폼 4항목처럼 화면마다 항목 수·
// 구성이 다르므로 컴포넌트 내부에 항목을 하드코딩하지 않는다 — §3.3 C-1/E-1 참고).
//
// 모션(impeccable animate): "모두 동의합니다" 클릭으로 개별 행이 한꺼번에 체크될 때만
// index 기반 stagger로 체크마크가 순차 팝인한다(개별 행을 직접 클릭할 때는 그 행만 즉시
// 반응 — staggered=false). batchAnimating 윈도우가 끝나면 자동으로 꺼져 이후 리렌더에는
// 영향을 주지 않는다. 총 stagger 시간은 항목 수에 비례해 상한(§ 10개 500ms 규칙)을 넘지 않도록
// 40ms/행으로 짧게 유지한다(AgreementRow.jsx의 auth-check-pop 참고).

import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import AgreementRow from "./AgreementRow";

type AgreementItem = {
  key: string;
  label: string;
  required?: boolean;
  checked?: boolean;
  to?: string;
};

type AgreementListProps = {
  items: AgreementItem[];
  allChecked?: boolean;
  onToggleAll?: () => void;
  onToggleItem?: (key: string) => void;
  className?: string;
};

const STAGGER_STEP_MS = 40;
const STAGGER_BUFFER_MS = 260;

export default function AgreementList({
  items,
  allChecked = false,
  onToggleAll,
  onToggleItem,
  className = "",
}: AgreementListProps) {
  const [batchAnimating, setBatchAnimating] = useState(false);
  const itemCount = items?.length || 0;

  useEffect(() => {
    if (!batchAnimating) return undefined;

    const timer = window.setTimeout(
      () => setBatchAnimating(false),
      itemCount * STAGGER_STEP_MS + STAGGER_BUFFER_MS,
    );
    return () => window.clearTimeout(timer);
  }, [batchAnimating, itemCount]);

  function handleToggleAll() {
    setBatchAnimating(true);
    onToggleAll?.();
  }

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <label className="flex cursor-pointer items-center gap-3 rounded-lg bg-surface-card px-5 py-4 text-left">
        <input
          type="checkbox"
          checked={allChecked}
          onChange={handleToggleAll}
          className="sr-only"
        />
        <span
          aria-hidden="true"
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition ${
            allChecked
              ? "border-primary bg-primary text-white"
              : "border-line bg-white text-transparent"
          }`}
        >
          <Check size={14} strokeWidth={3} />
        </span>

        <span className="text-sm font-medium text-ink">모두 동의합니다</span>
      </label>

      {(items || []).map((item, index) => (
        <AgreementRow
          key={item.key}
          label={item.label}
          index={index}
          staggered={batchAnimating}
          onToggle={() => onToggleItem?.(item.key)}
          // exactOptionalPropertyTypes: AgreementRowProps의 옵셔널 필드는 명시적 undefined를
          // 허용하지 않으므로, 값이 있을 때만 프롭 자체를 넣는다(동작은 동일).
          {...(item.required !== undefined ? { required: item.required } : {})}
          {...(item.checked !== undefined ? { checked: item.checked } : {})}
          {...(item.to !== undefined ? { to: item.to } : {})}
        />
      ))}
    </div>
  );
}
