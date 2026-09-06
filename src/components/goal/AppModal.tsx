import { X } from "lucide-react";
import type { ReactNode } from "react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

type AppModalProps = {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  children?: ReactNode;
  cancelLabel?: string;
  onCancel?: () => void;
  submitLabel?: string;
  onSubmit?: () => void;
  submitDisabled?: boolean;
  className?: string;
};

// 목표관리 앱 모달 6종 공용 셸 — docs/figma-goal/00-INDEX.md §5-4 `AppModal` / §6-3 "모달 규격(전 6종 공통)".
// 이번 범위는 3종(과제 추가/중요일정 등록/모의고사 성적 추가)이지만, 폭 33.125rem + 좌우패딩
// 1.875rem + 하단 취소/저장 슬롯은 나머지 3종(문제집 추가/내신 성적 추가/624px 버전 중요일정 등록)도
// 그대로 재사용 가능하게 title/subtitle/children/footer 전부 caller가 채우는 구조로 설계했다.
//
// 시안 6종 전부 X 닫기 버튼이 없지만, 접근성을 위해 X 버튼을 추가한다(사용자 확정 사항).
//
// **동작(ESC 닫기 / Tab focus trap / 배경 스크롤 잠금 / 딤 클릭 닫기 / 포커스 이동·복귀)은
// shadcn/ui Dialog(Base UI 기반, src/components/ui/dialog.tsx)가 기본 제공한다.** 예전엔
// `useModalBehavior`(src/hooks/useModalBehavior.ts)가 이 동작을 담당했지만, 이 파일은 더 이상
// 그 훅을 쓰지 않는다(훅 자체는 다른 호출부가 없어 파일만 남아 있다).
//
// ── `DialogContent`로 종속 (2026-09, 사용자 결정)
// 예전엔 `Dialog`/`DialogOverlay`/`DialogPortal`/`DialogClose`만 shadcn 프리미티브를 쓰고
// Popup은 `@base-ui/react/dialog`를 직접 import해 조립했다(`DialogContent`의 기본 클래스(폭·
// 패딩·오버레이 색)가 이 셸의 실측 규격과 충돌한다는 판단 — `MyPageModalShell`과 같은 이유).
// 지금은 `DialogContent`에 `className`(폭·패딩·배경 전부 여기서 덮어쓴다, `cn()`이
// tailwind-merge로 충돌을 해소한다)을 넘겨 같은 결과를 낸다. `title`/`subtitle`도 `DialogTitle`/
// `DialogDescription`으로 옮겨 Base UI가 `aria-labelledby`/`aria-describedby`를 자동 배선하게
// 한다 — 예전엔 수동 `useId()` + `aria-labelledby={title ? titleId : undefined}`로 반쪽만
// (설명 연결 없이 이름만) 해줬다.
//
// 높이는 모달마다 다르다(468/574/574, part-06/07/08). 고정 height를 주지 않고 내용에 따라
// 자라게 두고, max-h + overflow-y-auto로 뷰포트 초과만 방지한다.

export default function AppModal({
  open,
  onClose,
  title,
  subtitle,
  children,
  cancelLabel = "취소",
  onCancel,
  submitLabel = "저장",
  onSubmit,
  submitDisabled = false,
  className = "",
}: AppModalProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      {/* X 버튼은 시안엔 없지만 접근성을 위해 추가한다(사용자 확정 사항) — 기본 닫기
          버튼(top-2 right-2, 아이콘 sm) 대신 이 셸의 실측 위치(top-4.5 right-4.5, 6×6)로
          직접 그리므로 `showCloseButton={false}`. 딤은 `DialogContent` 기본값(`bg-black/10`
          + 블러)이 아니라 `bg-black/40`(불투명 딤)이 이 셸 실측이라 `overlayClassName`으로
          덮어쓴다. Base UI Popup은 `aria-modal`을 자동 배선하지 않으므로 리터럴로 보강한다
          (`DialogContent`는 알지 못하는 props를 그대로 Popup에 전달한다). */}
      <DialogContent
        showCloseButton={false}
        aria-modal="true"
        overlayClassName="z-100 bg-black/40"
        // `sm:max-w-[calc(100%-2rem)]`는 `DialogContent` 기본값의 `sm:max-w-sm`을 지우기
        // 위한 중복 지정이다(tailwind-merge는 변형 접두사가 다르면 별개 슬롯으로 봐서
        // 접두사 없는 값만 줘서는 `sm:` 규칙이 안 지워진다) — 이 셸은 뷰포트 폭에 상관없이
        // `w-132.5`(530px)를 유지하고, 뷰포트가 그보다 좁을 때만 `calc(100%-2rem)`로 줄어든다.
        className={`fixed top-1/2 left-1/2 z-100 flex max-h-[90vh] w-132.5 max-w-[calc(100%-2rem)] sm:max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-0 overflow-hidden rounded-xl bg-white p-0 text-base text-ink-strong ring-0 shadow-[0_24px_60px_rgba(0,0,0,0.24)] outline-none ${className}`}
      >
        <DialogClose
          aria-label="닫기"
          className="absolute right-4.5 top-4.5 flex h-6 w-6 items-center justify-center rounded-full text-ink-sub transition-colors hover:bg-surface-04 hover:text-ink-strong"
        >
          <X size={16} />
        </DialogClose>

        <ScrollArea className="flex-1 px-7.5 pt-7.5">
          {(title || subtitle) && (
            <div className="mb-6.75 pr-6">
              {title && (
                <DialogTitle className="wrap-break-word text-[1.125rem] font-bold leading-[1.4] text-ink-strong">
                  {title}
                </DialogTitle>
              )}
              {subtitle && (
                <DialogDescription className="mt-1 wrap-break-word text-[0.8125rem] leading-[1.4] text-ink-sub">
                  {subtitle}
                </DialogDescription>
              )}
            </div>
          )}

          {/* 블록 pitch(93px = 5.8125rem)는 라벨(21)+간격(27)+컨트롤(39) 합(87)에 근접한 값이라,
              필드 블록 사이는 별도 큰 gap 없이 살짝만(0.5rem) 띄운다 — ModalField가 라벨→컨트롤
              간격(1.6875rem)을 자체 보유하므로 여기서는 블록 간 최소 여백만 추가. */}
          <div className="flex flex-col gap-2 pb-7.5">{children}</div>
        </ScrollArea>

        <DialogFooter className="mx-0 mb-0 grid grid-cols-2 gap-2 rounded-b-xl border-t border-[#F0F0F0] bg-white p-0 px-7.5 py-5">
          <button
            type="button"
            onClick={onCancel ?? onClose}
            className="h-9.75 rounded-lg border border-[#E3E3E3] text-[0.875rem] font-medium text-ink-sub transition-colors hover:bg-surface-04"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={submitDisabled}
            className="h-9.75 rounded-lg bg-[#2E2A26] text-[0.875rem] font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:bg-surface-01 disabled:text-ink-sub"
          >
            {submitLabel}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
