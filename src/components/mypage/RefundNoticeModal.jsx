import { useEffect, useId, useRef } from 'react';

// 환불 신청 접수 완료 모달 (Figma 3762:19708) — 확인 버튼 1개짜리 단순 안내 모달이라
// AppModal(취소/저장 2버튼 고정)과 footer 형태가 달라 독립 구현한다.
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function RefundNoticeModal({ open, onClose }) {
  const panelRef = useRef(null);
  const triggerElRef = useRef(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return undefined;

    triggerElRef.current = document.activeElement;
    const { style } = document.body;
    const previousOverflow = style.overflow;
    style.overflow = 'hidden';

    return () => {
      style.overflow = previousOverflow;
      const trigger = triggerElRef.current;
      if (trigger instanceof HTMLElement) trigger.focus();
      triggerElRef.current = null;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const raf = requestAnimationFrame(() => {
      panelRef.current?.querySelector(FOCUSABLE_SELECTOR)?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose?.();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex w-[33.75rem] flex-col items-center rounded-xl bg-white px-[2.1875rem] py-[3.125rem] text-center shadow-[0_24px_60px_rgba(0,0,0,0.24)]"
      >
        <h2 id={titleId} className="text-[1.25rem] font-bold leading-[1.4] text-ink-strong">
          환불 신청이 접수됐어요
        </h2>
        <p className="mt-[0.9375rem] break-keep text-[0.875rem] leading-[1.6] text-ink-sub">
          영업일 기준 1~2일 안에 검토 후
          <br />
          결제하신 수단으로 환급해드려요.
          <br />
          진행 상황은 결제 내역에서 확인할 수 있어요.
        </p>

        <button
          type="button"
          onClick={onClose}
          className="mt-[1.875rem] h-[2.5rem] w-[9.375rem] rounded-lg bg-primary text-[0.875rem] font-semibold text-white transition-colors hover:opacity-90"
        >
          확인
        </button>
      </div>
    </div>
  );
}
