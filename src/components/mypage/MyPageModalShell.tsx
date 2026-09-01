import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import type { ReactNode } from "react";
import { useId } from "react";
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
//
// size/title/subtitle/footer(2026-09) — 결제 탭 모달 6종 통일 작업에서 추가한
// 슬롯. 전부 optional이라 기존 호출부(계정 탭 모달 등, className으로 직접
// 폭·헤더·푸터를 그려 넣는 방식)는 그대로 동작한다. title을 넘기면 셸이
// 헤더(중앙 정렬 제목+선택적 부제)를 직접 그리고 useId로 만든 자체 id를
// aria-labelledby에 쓴다("aria-labelledby 셸이 소유") — 이때 labelledBy prop은
// 무시된다. title이 없으면 기존처럼 호출부가 넘긴 labelledBy를 그대로 쓴다.

const SIZE_CLASS = { sm: "w-104", md: "w-135" } as const;
// 헤더 좌우/상단 패딩 — 폭 프리셋마다 기존 두 방언의 패딩이 달랐다(sm: px-6
// pt-8, md: px-8.75 pt-10). 헤더를 셸로 옮기며 그 패딩값을 그대로 가져온다.
const HEADER_PADDING = { sm: "px-6 pt-8", md: "px-8.75 pt-10" } as const;

type MyPageModalShellSize = keyof typeof SIZE_CLASS;

type MyPageModalShellProps = {
  open: boolean;
  onClose?: (() => void) | undefined;
  labelledBy?: string;
  className?: string;
  size?: MyPageModalShellSize;
  title?: ReactNode;
  subtitle?: ReactNode;
  footer?: ReactNode;
  children?: ReactNode;
};

export default function MyPageModalShell({
  open,
  onClose,
  labelledBy,
  className = "",
  size = "sm",
  title,
  subtitle,
  footer,
  children,
}: MyPageModalShellProps) {
  const autoTitleId = useId();
  const titleId = title ? autoTitleId : labelledBy;

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
          aria-labelledby={titleId}
          className={`fixed top-1/2 left-1/2 z-100 flex max-h-[90vh] max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl bg-white shadow-[0_24px_60px_rgba(0,0,0,0.24)] outline-none ${SIZE_CLASS[size]} ${className}`}
        >
          {title && (
            <div className={`text-center ${HEADER_PADDING[size]}`}>
              <h2
                id={autoTitleId}
                className="text-[1.25rem] font-bold leading-[1.4] text-ink-title"
              >
                {title}
              </h2>
              {subtitle && (
                <p className="mt-4 break-keep text-[0.8125rem] leading-[1.6] text-ink-sub">
                  {subtitle}
                </p>
              )}
            </div>
          )}
          {children}
          {footer}
        </DialogPrimitive.Popup>
      </DialogPortal>
    </Dialog>
  );
}
