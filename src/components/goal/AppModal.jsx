import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

// 목표관리 앱 모달 6종 공용 셸 — docs/figma-goal/00-INDEX.md §5-4 `AppModal` / §6-3 "모달 규격(전 6종 공통)".
// 이번 범위는 3종(과제 추가/중요일정 등록/모의고사 성적 추가)이지만, 폭 33.125rem + 좌우패딩
// 1.875rem + 하단 취소/저장 슬롯은 나머지 3종(문제집 추가/내신 성적 추가/624px 버전 중요일정 등록)도
// 그대로 재사용 가능하게 title/subtitle/children/footer 전부 caller가 채우는 구조로 설계했다.
//
// 시안 6종 전부 X 닫기 버튼이 없지만, 접근성을 위해 X 버튼을 추가한다(사용자 확정 사항).
// role="dialog" + aria-modal + aria-labelledby, focus trap, ESC 닫기, 배경 스크롤 잠금,
// 열릴 때 첫 포커서블로 포커스 이동, 닫힐 때 트리거로 포커스 복귀까지 전부 이 셸이 담당한다
// (시안엔 전혀 표현되지 않은 접근성 요구사항 — 00-INDEX.md §8-4 마지막 줄 근거).
//
// 높이는 모달마다 다르다(468/574/574, part-06/07/08). 고정 height를 주지 않고 내용에 따라
// 자라게 두고, max-h + overflow-y-auto로 뷰포트 초과만 방지한다.
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function AppModal({
  open,
  onClose,
  title,
  subtitle,
  children,
  cancelLabel = '취소',
  onCancel,
  submitLabel = '저장',
  onSubmit,
  submitDisabled = false,
  className = ''
}) {
  const panelRef = useRef(null);
  const triggerElRef = useRef(null);
  const titleId = useId();

  // 배경 스크롤 잠금 + 포커스 복귀(코드 검수 §5). 포커스 복귀를 별도 effect의 `open: true → false`
  // 전이에만 의존하면, 모달이 열린 채로 컴포넌트가 언마운트되는 경우(예: TimerSummaryBar의 Link로
  // 라우트가 바뀌는 경우) 복귀 로직이 실행되지 않고 포커스가 <body>로 떨어진다. 스크롤 잠금과
  // 같은 cleanup에 묶어 언마운트 시에도 항상 실행되게 한다.
  useEffect(() => {
    if (!open) return undefined;

    triggerElRef.current = document.activeElement;
    const { style } = document.body;
    const previousOverflow = style.overflow;
    style.overflow = 'hidden';

    return () => {
      style.overflow = previousOverflow;
      const trigger = triggerElRef.current;
      if (trigger instanceof HTMLElement) {
        trigger.focus();
      }
      triggerElRef.current = null;
    };
  }, [open]);

  // 열릴 때 패널 내 첫 포커서블 엘리먼트로 포커스 이동.
  useEffect(() => {
    if (!open) return undefined;
    const raf = requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const first = panel.querySelector(FOCUSABLE_SELECTOR);
      first?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [open]);

  // ESC 닫기 + Tab focus trap.
  useEffect(() => {
    if (!open) return undefined;

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;

      const panel = panelRef.current;
      if (!panel) return;
      const focusables = Array.from(panel.querySelectorAll(FOCUSABLE_SELECTOR));
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

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* 스크림 — 클릭 시 닫기 */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        className={`relative flex max-h-[90vh] w-[33.125rem] flex-col overflow-hidden rounded-xl bg-white shadow-[0_24px_60px_rgba(0,0,0,0.24)] ${className}`}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="absolute right-[1.125rem] top-[1.125rem] flex h-6 w-6 items-center justify-center rounded-full text-ink-sub transition-colors hover:bg-surface-04 hover:text-ink-strong"
        >
          <X size={16} />
        </button>

        <div className="flex-1 overflow-y-auto px-[1.875rem] pt-[1.875rem]">
          {(title || subtitle) && (
            <div className="mb-[1.6875rem] pr-6">
              {title && (
                <h2 id={titleId} className="text-[1.125rem] font-bold leading-[1.4] text-ink-strong">
                  {title}
                </h2>
              )}
              {subtitle && <p className="mt-1 text-[0.8125rem] leading-[1.4] text-ink-sub">{subtitle}</p>}
            </div>
          )}

          {/* 블록 pitch(93px = 5.8125rem)는 라벨(21)+간격(27)+컨트롤(39) 합(87)에 근접한 값이라,
              필드 블록 사이는 별도 큰 gap 없이 살짝만(0.5rem) 띄운다 — ModalField가 라벨→컨트롤
              간격(1.6875rem)을 자체 보유하므로 여기서는 블록 간 최소 여백만 추가. */}
          <div className="flex flex-col gap-[0.5rem] pb-[1.875rem]">{children}</div>
        </div>

        <div className="grid grid-cols-2 gap-[0.5rem] border-t border-[#F0F0F0] px-[1.875rem] py-[1.25rem]">
          <button
            type="button"
            onClick={onCancel ?? onClose}
            className="h-[2.4375rem] rounded-lg border border-[#E3E3E3] text-[0.875rem] font-medium text-ink-sub transition-colors hover:bg-surface-04"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={submitDisabled}
            className="h-[2.4375rem] rounded-lg bg-[#2E2A26] text-[0.875rem] font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:bg-surface-01 disabled:text-ink-sub"
          >
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
