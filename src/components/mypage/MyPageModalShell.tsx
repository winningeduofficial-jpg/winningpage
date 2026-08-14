import type { ReactNode } from "react";
import { useEffect, useRef } from "react";

// 마이페이지 모달 공용 셸 — 스크림 + 패널 + a11y(ESC 닫기 / Tab focus trap /
// 배경 스크롤 잠금 / 닫힐 때 트리거로 포커스 복귀).
//
// 기존 ReceiptModal·RefundNoticeModal·WithdrawModal 은 이 로직을 각자 복제해
// 갖고 있다(팀 리드 지시로 AppModal 을 쓰지 않기로 한 결과). 신규 모달 2종
// (PaymentDetailModal·RefundRequestModal)까지 같은 코드를 4·5번째로 베끼는
// 대신 여기로 모았다. 기존 3종은 동작 변경 위험을 만들지 않으려고 이번에
// 건드리지 않았다 — 손볼 일이 생기면 그때 이 셸로 옮기면 된다.
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

type MyPageModalShellProps = {
  open: boolean;
  onClose?: () => void;
  labelledBy?: string;
  className?: string;
  children?: ReactNode;
};

export default function MyPageModalShell({
  open,
  onClose,
  labelledBy,
  className = "",
  children,
}: MyPageModalShellProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerElRef = useRef<Element | null>(null);

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

  // 열릴 때 패널 내 첫 포커서블로 이동.
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

      const first = focusables[0];
      const last = focusables[focusables.length - 1];

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

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={`relative flex max-h-[90vh] flex-col overflow-hidden rounded-xl bg-white shadow-[0_24px_60px_rgba(0,0,0,0.24)] ${className}`}
      >
        {children}
      </div>
    </div>
  );
}
