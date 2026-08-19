import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import type { ReactNode } from "react";
import { Dialog, DialogOverlay, DialogPortal } from "@/components/ui/dialog";

// 마이페이지 모달 공용 셸 — shadcn/ui Dialog(Base UI 기반) 위에 패널 스타일만 입힌다.
// ESC 닫기 / Tab focus trap / 배경 스크롤 잠금 / 딤 클릭 닫기 / 닫힐 때 트리거로
// 포커스 복귀는 전부 Base UI Dialog가 기본 제공한다 — 예전엔 이 파일이 전부 손으로
// 구현했었다(그 구현은 지금 제거됐다).
//
// DialogContent(components/ui/dialog.tsx)를 그대로 쓰지 않고 Popup을 직접 조립하는
// 이유: DialogContent의 기본 클래스(bg-popover, p-4, sm:max-w-sm, X 버튼 등)가 기존
// 패널 규격과 충돌이 많고, 오버레이 색(bg-black/40)도 DialogContent는 커스터마이즈할
// 통로가 없다. Dialog/DialogOverlay/DialogPortal만 shadcn 프리미티브를 쓰고 Popup은
// Base UI 원본을 그대로 써서 기존 패널 마크업을 1:1로 재현한다.
//
// 기존 ReceiptModal·RefundNoticeModal·WithdrawModal 은 이 로직을 각자 복제해
// 갖고 있다(팀 리드 지시로 AppModal 을 쓰지 않기로 한 결과). 신규 모달 2종
// (PaymentDetailModal·RefundRequestModal)까지 같은 코드를 4·5번째로 베끼는
// 대신 여기로 모았다. 기존 3종은 동작 변경 위험을 만들지 않으려고 이번에
// 건드리지 않았다 — 손볼 일이 생기면 그때 이 셸로 옮기면 된다.

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
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose?.();
      }}
    >
      <DialogPortal>
        <DialogOverlay className="z-100 bg-black/40" />
        {/* Base UI가 aria-modal을 자동 배선하지 않아 리터럴로 보강 — 이 셸은 항상 모달 전용. */}
        <DialogPrimitive.Popup
          aria-modal="true"
          aria-labelledby={labelledBy}
          className={`fixed top-1/2 left-1/2 z-100 flex max-h-[90vh] max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl bg-white shadow-[0_24px_60px_rgba(0,0,0,0.24)] outline-none ${className}`}
        >
          {children}
        </DialogPrimitive.Popup>
      </DialogPortal>
    </Dialog>
  );
}
