import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import {
  Dialog,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import { COMPANY } from "@/data/company";
import { formatKRW } from "@/data/pricingCatalog";

// 결제 영수증 모달 (Figma 3762:19227).
// AppModal(src/components/goal/AppModal.jsx)은 하단 취소/저장 버튼이 항상 어두운 단색(#2E2A26)
// 고정이라 이 모달의 "인쇄 하기" 버튼(bg-primary)과 스타일이 어긋난다 — team-lead 지침대로
// 재사용하지 않고 이 파일에서 독립 구현한다. ESC 닫기·포커스 트랩·배경 스크롤 잠금·트리거
// 포커스 복귀는 이제 shadcn Dialog(Base UI) 내장 동작으로 처리한다(수동 useEffect 3개 제거).
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
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose?.();
      }}
    >
      <DialogPortal>
        <DialogOverlay className="bg-black/40" />
        <DialogPrimitive.Popup
          data-slot="dialog-content"
          // Base UI Popup은 aria-modal을 자동 배선하지 않는다 — 리터럴로 명시.
          aria-modal="true"
          className="fixed top-1/2 left-1/2 z-100 flex max-h-[90vh] w-[min(calc(100%-2rem),33.75rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl bg-white shadow-[0_24px_60px_rgba(0,0,0,0.24)] outline-none"
        >
          {/* 시안(3762:19227)에는 우상단 X 닫기 버튼이 없다 — 하단 닫기/인쇄 버튼만 유지하고
              ESC·배경 클릭 닫기(Base UI Dialog 내장)는 그대로 둔다. */}
          <div className="flex-1 overflow-y-auto px-8.75 pt-10">
            <DialogTitle className="text-center text-[1.25rem] font-bold leading-[1.4] text-ink-strong">
              결제 영수증
            </DialogTitle>

            <dl className="mt-7.5 flex flex-col gap-3.75 pb-8.75">
              {rows.map((row) => (
                <div
                  key={row.label}
                  className="flex items-center justify-between gap-4 border-b border-line/60 pb-3.75"
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

          <div className="flex justify-center gap-3 border-t border-[#F0F0F0] px-8.75 py-6.25">
            <button
              type="button"
              onClick={onClose}
              className="h-10 w-33 rounded-lg border border-[#E3E3E3] text-[0.875rem] font-medium text-ink-sub transition-colors hover:bg-surface-04"
            >
              닫기
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="h-10 w-33 rounded-lg bg-primary text-[0.875rem] font-semibold text-white transition-colors hover:opacity-90"
            >
              인쇄 하기
            </button>
          </div>
        </DialogPrimitive.Popup>
      </DialogPortal>
    </Dialog>
  );
}
