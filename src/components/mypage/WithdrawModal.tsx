// 회원 탈퇴 사유 선택 모달 — ProfileTab 하단 "회원탈퇴" 링크에서 연다.
// 시안(3762:20560 비활성 / 3762:20898 활성) 실측: 사유 7개 박스형 라디오 목록, '기타 사유'
// 선택 시 한 줄 입력 노출, 분홍 경고 박스, 하단 취소/탈퇴 진행 버튼. 사유 미선택(또는 '기타
// 사유' 선택 후 입력 없음) 상태에서는 탈퇴 진행 버튼이 회색 비활성, 그 외엔 빨강 활성.
//
// 사유 4번째 항목은 원본 PNG에 "서서비 이용이 불편해서"로 판독되나 "서비스"의 중복 오타로
// 보여 "서비스 이용이 불편해서"로 교정했다 — 디자이너 확인 필요.
//
// 중요: 실제 계정 삭제/탈퇴 처리는 정책이 확정되지 않아 구현하지 않는다. 제출 핸들러는
// 사유만 받고 모달을 닫는다 — supabase 삭제 쿼리·auth.admin 호출을 여기 추가하지 말 것.
import { useEffect, useState } from "react";

const ETC_REASON = "기타 사유 (직접 입력)";

const REASONS = [
  "더 이상 서비스가 필요하지 않아서",
  "서비스를 자주 이용하지 않아서",
  "원하는 기능이나 콘텐츠가 부족해서",
  "서비스 이용이 불편해서",
  "다른 서비스를 이용하려고",
  "계정을 새로 만들려고",
  ETC_REASON,
];

const NOTICE =
  "회원 탈퇴 시 회원 정보와 서비스 이용 내역이 삭제되며, 이용 중인 서비스(학업 활동 및 결과 리포트 등 모두 포함)와 보유한 쿠폰·혜택도 모두 소멸됩니다. 삭제된 정보는 복구할 수 없습니다.\n※ 결제 내역 등 관계 법령에 따라 보관이 필요한 정보는 일정 기간 보관됩니다.";

type WithdrawModalProps = {
  open: boolean;
  onClose?: () => void;
};

export default function WithdrawModal({ open, onClose }: WithdrawModalProps) {
  const [reason, setReason] = useState("");
  const [etcText, setEtcText] = useState("");

  // 배경 스크롤 잠금 + ESC 닫기.
  useEffect(() => {
    if (!open) return undefined;

    const { style } = document.body;
    const previousOverflow = style.overflow;
    style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose?.();
      }
    }
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  const canSubmit =
    Boolean(reason) && (reason !== ETC_REASON || etcText.trim().length > 0);

  function resetAndClose() {
    setReason("");
    setEtcText("");
    onClose?.();
  }

  function handleSubmit() {
    if (!canSubmit) return;
    // TODO(정책 확정 전): 실제 탈퇴 처리 미구현. 선택된 사유(reason/etcText)를 서버로
    // 보내는 대신 모달만 닫는다 — 계정 삭제는 정책 확정 후 별도 구현.
    resetAndClose();
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: APG 모달 백드롭 패턴 — role="presentation"으로 이미 장식 레이어임을 명시했다. Escape는 document keydown 리스너(위)가 처리한다.
    <div
      role="presentation"
      className="fixed inset-0 z-100 flex items-center justify-center bg-black/40 px-4"
      onClick={resetAndClose}
    >
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: onClick은 배경 클릭이 대화상자 안까지 닫지 않도록 막는 stopPropagation 가드일 뿐, 키보드로 도달할 사용자 동작이 없다. */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="withdraw-modal-title"
        className="w-full max-w-104 rounded-perf-modal bg-white p-6 shadow-[0_24px_60px_rgba(0,0,0,0.24)]"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="withdraw-modal-title"
          className="text-center text-xl font-bold text-ink-title"
        >
          회원 탈퇴 사유를 작성해주세요
        </h2>

        <div className="mt-5 flex flex-col gap-2">
          {REASONS.map((item) => {
            const selected = reason === item;
            return (
              <label
                key={item}
                className={`flex h-13 cursor-pointer items-center gap-3 rounded-xl border px-4 transition ${
                  selected ? "border-accent bg-surface-info" : "border-line"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                    selected ? "border-accent" : "border-line"
                  }`}
                >
                  {selected && (
                    <span className="h-2.5 w-2.5 rounded-full bg-accent" />
                  )}
                </span>
                <input
                  type="radio"
                  name="withdraw-reason"
                  value={item}
                  checked={selected}
                  onChange={() => setReason(item)}
                  className="sr-only"
                />
                <span className="text-sm text-ink">{item}</span>
              </label>
            );
          })}

          {reason === ETC_REASON && (
            <input
              type="text"
              value={etcText}
              onChange={(e) => setEtcText(e.target.value)}
              placeholder="탈퇴 사유를 직접 입력해주세요"
              className="h-13 w-full rounded-xl border border-line px-4 text-sm text-ink outline-hidden focus:border-accent"
            />
          )}
        </div>

        <div className="mt-5 whitespace-pre-line rounded-xl bg-[#FCEAEE] px-4 py-3 text-xs leading-relaxed text-[#D6336C]">
          {NOTICE}
        </div>

        <div className="mt-6 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={resetAndClose}
            className="h-12 rounded-xl bg-surface-footer text-sm font-semibold text-ink-sub transition hover:bg-line/30"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={`h-12 rounded-xl text-sm font-semibold text-white transition ${
              canSubmit
                ? "bg-error hover:bg-error/90"
                : "cursor-not-allowed bg-line"
            }`}
          >
            탈퇴 진행
          </button>
        </div>
      </div>
    </div>
  );
}
