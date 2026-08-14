import { useEffect, useId, useRef } from "react";

// 환불 신청 접수 완료 모달 (Figma 3762:19708) — 확인 버튼 1개짜리 단순 안내 모달이라
// AppModal(취소/저장 2버튼 고정)과 footer 형태가 달라 독립 구현한다.
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

type RefundNoticeModalProps = {
  open: boolean;
  asStudent?: boolean;
  parentName?: string;
  onClose?: () => void;
};

export default function RefundNoticeModal({
  open,
  asStudent = false,
  parentName = "",
  onClose,
}: RefundNoticeModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerElRef = useRef<Element | null>(null);
  const titleId = useId();

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

  useEffect(() => {
    if (!open) return undefined;
    const raf = requestAnimationFrame(() => {
      panelRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose?.();
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
        aria-labelledby={titleId}
        className="relative flex w-[33.75rem] flex-col items-center rounded-xl bg-white px-[2.1875rem] py-[3.125rem] text-center shadow-[0_24px_60px_rgba(0,0,0,0.24)]"
      >
        <h2
          id={titleId}
          className="text-[1.25rem] font-bold leading-[1.4] text-ink-strong"
        >
          {asStudent ? "환불 요청을 보냈어요" : "환불 신청이 접수됐어요"}
        </h2>
        {/* 학생 완료 문구는 확정 디자인 3967:3933 실측. 학생 요청은 곧바로
            환불되지 않고 학부모 확인을 거치므로 안내가 달라야 한다. */}
        {asStudent ? (
          <p className="mt-[0.9375rem] break-keep text-[0.875rem] leading-[1.6] text-ink-sub">
            {parentName ? `${parentName} ` : ""}학부모님께 환불 요청이
            전달됐어요.
            <br />
            학부모님이 확인하고 환불을 진행하면 알림으로 알려드릴게요.
          </p>
        ) : (
          <p className="mt-[0.9375rem] break-keep text-[0.875rem] leading-[1.6] text-ink-sub">
            영업일 기준 1~2일 안에 검토 후
            <br />
            결제하신 수단으로 환급해드려요.
            <br />
            진행 상황은 결제 내역에서 확인할 수 있어요.
          </p>
        )}

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
