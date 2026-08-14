import { useEffect, useId, useRef } from "react";
import { COMPANY } from "../../data/company";
import { formatKRW } from "../../data/pricingCatalog";

// 결제 영수증 모달 (Figma 3762:19227).
// AppModal(src/components/goal/AppModal.jsx)은 하단 취소/저장 버튼이 항상 어두운 단색(#2E2A26)
// 고정이라 이 모달의 "인쇄 하기" 버튼(bg-primary)과 스타일이 어긋난다 — team-lead 지침대로
// 재사용하지 않고 이 파일에서 독립 구현한다(a11y 로직은 AppModal과 동일한 수준으로 갖춘다).
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

type ReceiptOrder = {
  order_name?: string;
  method?: string;
  amount: number;
};

type ReceiptModalProps = {
  open: boolean;
  onClose?: () => void;
  order: ReceiptOrder | null;
};

export default function ReceiptModal({
  open,
  onClose,
  order,
}: ReceiptModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerElRef = useRef<Element | null>(null);
  const titleId = useId();

  // 배경 스크롤 잠금 + 닫힐 때 트리거로 포커스 복귀.
  useEffect(() => {
    if (!open) return undefined;

    triggerElRef.current = document.activeElement;
    const { style } = document.body;
    const previousOverflow = style.overflow;
    style.overflow = "hidden";

    return () => {
      style.overflow = previousOverflow;
      const trigger = triggerElRef.current;
      if (trigger instanceof HTMLElement) trigger.focus();
      triggerElRef.current = null;
    };
  }, [open]);

  // 열릴 때 패널 내 첫 포커서블 엘리먼트로 포커스 이동.
  useEffect(() => {
    if (!open) return undefined;
    const raf = requestAnimationFrame(() => {
      panelRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [open]);

  // ESC 닫기 + Tab focus trap.
  useEffect(() => {
    if (!open) return undefined;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose?.();
        return;
      }
      if (event.key !== "Tab") return;

      const panel = panelRef.current;
      if (!panel) return;
      const focusables = Array.from(
        panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      );
      if (focusables.length === 0) return;

      // 위 length===0 가드로 focusables는 항상 1개 이상이다.
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open || !order) return null;

  // 라벨/값 행 목록. DB에는 결제 수단 컬럼(orders.method, sql/10_pricing_orders.sql)이
  // 있지만, 이 모달에 내려오는 orders prop 계약(PaymentsTab 상위)이 id/order_name/amount/
  // paid_at만 보장하고 method는 아직 select에 포함되지 않는다 — 값이 없으면 대시(-)로
  // 폴백한다(DB 마이그레이션 없이, 상위가 method를 내려주기 시작하면 그대로 표시된다).
  // 시안 스크린샷은 모든 값 행을 동일한 굵기로 표시한다(총 결제 금액도 별도 강조 없음).
  const rows = [
    { label: "상품 명", value: order.order_name || "-" },
    { label: "판매자", value: COMPANY.name },
    { label: "사업자등록번호", value: COMPANY.bizRegNo },
    { label: "결제 수단", value: order.method || "-" },
    { label: "총 결제 금액", value: formatKRW(order.amount) },
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* 스크림 — 클릭 시 닫기 */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex max-h-[90vh] w-[33.75rem] flex-col overflow-hidden rounded-xl bg-white shadow-[0_24px_60px_rgba(0,0,0,0.24)]"
      >
        {/* 시안(3762:19227)에는 우상단 X 닫기 버튼이 없다 — 하단 닫기/인쇄 버튼만 유지하고
            ESC·배경 클릭 닫기(위 useEffect)는 그대로 둔다. */}
        <div className="flex-1 overflow-y-auto px-[2.1875rem] pt-[2.5rem]">
          <h2
            id={titleId}
            className="text-center text-[1.25rem] font-bold leading-[1.4] text-ink-strong"
          >
            결제 영수증
          </h2>

          <dl className="mt-[1.875rem] flex flex-col gap-[0.9375rem] pb-[2.1875rem]">
            {rows.map((row) => (
              <div
                key={row.label}
                className="flex items-center justify-between gap-4 border-b border-line/60 pb-[0.9375rem]"
              >
                <dt className="shrink-0 text-[0.875rem] text-ink-sub">
                  {row.label}
                </dt>
                <dd className="truncate text-right text-[0.875rem] text-ink-strong">
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="flex justify-center gap-[0.75rem] border-t border-[#F0F0F0] px-[2.1875rem] py-[1.5625rem]">
          <button
            type="button"
            onClick={onClose}
            className="h-[2.5rem] w-[8.25rem] rounded-lg border border-[#E3E3E3] text-[0.875rem] font-medium text-ink-sub transition-colors hover:bg-surface-04"
          >
            닫기
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="h-[2.5rem] w-[8.25rem] rounded-lg bg-primary text-[0.875rem] font-semibold text-white transition-colors hover:opacity-90"
          >
            인쇄 하기
          </button>
        </div>
      </div>
    </div>
  );
}
