import { useEffect } from "react";

// 결제 요청 흐름 공용 안내 모달 — 학생 화면의 학부모 미연결 실패 모달
// (시안 3921:7480, StudentEnrollmentRequest.jsx)과 Pricing.jsx 의 학부모용
// "학생이 요청한 건만 결제할 수 있다" 안내 모달이 같은 구조를 쓴다(팀 리드
// 지시, 2026-08-12b — "화면 2 모달의 구조·해요체 톤을 따르라"). 시안 실측
// (3921:7480): overlay bg-black/40 전체, 카드 546×339 rounded-20, 내부
// gap-36 콘텐츠 폭 362.
//
// 버튼 동작(그냥 닫기 vs 페이지 이동)은 onConfirm 으로 호출부가 정한다 —
// 생략하면 onClose 와 동일하게 닫기만 한다.
export default function ConfirmModal({
  title,
  children,
  buttonLabel = "확인",
  onConfirm,
  onClose,
}) {
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
    >
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative flex w-full max-w-[34.125rem] flex-col items-center rounded-[1.25rem] bg-white px-6 py-10 shadow-2xl lg:h-[21.1875rem] lg:justify-center lg:px-0 lg:py-0">
        <div className="mx-auto flex w-full max-w-[22.625rem] flex-col items-center gap-9 text-center">
          <h2
            id="confirm-modal-title"
            className="text-[1.5rem] font-semibold leading-[1.3] tracking-[-0.03rem] text-ink"
          >
            {title}
          </h2>
          <p className="text-[1rem] font-normal leading-[1.3] tracking-[-0.02rem] text-ink-sub">
            {children}
          </p>
          <button
            type="button"
            onClick={onConfirm || onClose}
            className="flex h-[2.5rem] w-[11.1875rem] shrink-0 items-center justify-center rounded-lg bg-primary text-[1rem] font-semibold text-white transition hover:brightness-125"
          >
            {buttonLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
