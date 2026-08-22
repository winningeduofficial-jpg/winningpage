import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import {
  Dialog,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import { COMPANY } from "@/data/company";
import { formatKRW } from "@/data/pricingCatalog";
import type {
  CardInfo,
  EasyPayInfo,
  VirtualAccountInfo,
} from "@/hooks/usePaymentConfirmation";
import {
  accountLabel,
  formatCardNumber,
  formatDateTime,
  installmentLabel,
  methodLabel,
} from "@/lib/paymentReceiptFormat";
import { formatProductNames } from "./paymentRows";

// 결제 영수증 모달 (Figma 3762:19227).
// AppModal(src/components/goal/AppModal.jsx)은 하단 취소/저장 버튼이 항상 어두운 단색(#2E2A26)
// 고정이라 이 모달의 "인쇄 하기" 버튼(bg-primary)과 스타일이 어긋난다 — team-lead 지침대로
// 재사용하지 않고 이 파일에서 독립 구현한다. ESC 닫기·포커스 트랩·배경 스크롤 잠금·트리거
// 포커스 복귀는 이제 shadcn Dialog(Base UI) 내장 동작으로 처리한다(수동 useEffect 3개 제거).
//
// 카드/마켓 영수증 형태로 개편(QA 요청) — 판매자/상품/결제수단/금액 4블록을 점선으로
// 구분한다. 승인번호는 카드 결제만 있는 값이라 필수로 보여주되(카드 결제 건에서
// approveNo가 비어 있는 건 데이터 이상이라 그 자체로 드러나야 하므로 대시로 숨기지
// 않는다), 그 외 행은 값이 없으면 "정보 없음"으로 채우지 않고 행 자체를 생략한다 —
// 실제로 없는 데이터를 있는 것처럼 보이면 안 된다(팀 리드 지침).
type ReceiptOrder = {
  order_name?: string;
  order_items?: { name: string }[] | null;
  method?: string | null;
  amount: number;
  vat?: number | string | null;
  paid_at?: string | null;
  approved_at?: string | null;
  card?: CardInfo | null;
  virtual_account?: VirtualAccountInfo | null;
  easy_pay?: EasyPayInfo | null;
};

type ReceiptModalProps = {
  open: boolean;
  onClose?: () => void;
  order: ReceiptOrder | null;
};

type ReceiptRow = { label: string; value: string };

function pushRow(
  rows: ReceiptRow[],
  label: string,
  value: string | null | undefined,
) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed || trimmed === "-") return;
  rows.push({ label, value: trimmed });
}

// 섹션 1: 판매자 정보 — 항상 있는 정본 상수(COMPANY)라 생략 조건이 없다.
function buildSellerRows(): ReceiptRow[] {
  return [
    { label: "상호", value: COMPANY.name },
    { label: "사업자등록번호", value: COMPANY.bizRegNo },
  ];
}

// 섹션 2: 구매 상품.
function buildProductRows(order: ReceiptOrder): ReceiptRow[] {
  const rows: ReceiptRow[] = [];
  pushRow(rows, "상품명", formatProductNames(order));
  return rows;
}

// 섹션 3: 결제수단 — 카드/현금(가상계좌·계좌이체)에 따라 구성이 다르다.
function buildPaymentRows(order: ReceiptOrder): ReceiptRow[] {
  const rows: ReceiptRow[] = [];
  const card = order.card;
  const virtualAccount = order.virtual_account;
  const isCardPayment = Boolean(card) && !order.easy_pay?.provider;

  pushRow(
    rows,
    "결제수단",
    methodLabel({ card, easyPay: order.easy_pay, method: order.method }),
  );

  if (isCardPayment && card) {
    pushRow(rows, "카드번호", formatCardNumber(card.number));
    pushRow(rows, "할부", installmentLabel(card.installmentPlanMonths));
    // 승인번호는 카드영수증의 핵심 항목이라 값이 있으면 그대로, 비어 있으면
    // "정보 없음" 폴백 없이 행을 생략한다(위 파일 주석 참고 — 데이터 이상은
    // 숨기지 않되, 없는 값을 지어내지도 않는다).
    pushRow(rows, "승인번호", card.approveNo);
  } else if (virtualAccount) {
    // 현금성 결제(가상계좌/계좌이체)는 승인번호 대신 입금 계좌 정보를 보여준다.
    pushRow(rows, "입금 계좌", accountLabel(virtualAccount));
    pushRow(rows, "입금자명", virtualAccount.customerName);
  }

  pushRow(rows, "승인일시", formatDateTime(order.approved_at || order.paid_at));
  return rows;
}

// 섹션 4: 금액 — 공급가액/부가세는 raw.vat 이 있을 때만 분해해서 보여주고,
// 없으면 빈 배열을 돌려준다(부가세를 우리가 역산하지 않는다 — team-lead 지침).
// 합계는 항상 있는 값이라 별도 상수(TOTAL_ROW)로 분리해 렌더에서 강조한다.
function buildAmountBreakdownRows(order: ReceiptOrder): ReceiptRow[] {
  const rows: ReceiptRow[] = [];
  const vat =
    order.vat === null || order.vat === undefined ? null : Number(order.vat);
  if (vat !== null && !Number.isNaN(vat)) {
    pushRow(rows, "공급가액", formatKRW(order.amount - vat));
    pushRow(rows, "부가가치세", formatKRW(vat));
  }
  return rows;
}

function ReceiptSection({
  rows,
  dashedTop,
}: {
  rows: ReceiptRow[];
  dashedTop: boolean;
}) {
  if (rows.length === 0) return null;
  return (
    <div
      className={`flex flex-col gap-2.5 py-3.75 ${
        dashedTop ? "border-t border-dashed border-line" : ""
      }`}
    >
      {rows.map((row) => (
        <div
          key={row.label}
          className="flex items-center justify-between gap-4"
        >
          <dt className="shrink-0 text-[0.875rem] text-ink-sub">{row.label}</dt>
          <dd className="truncate text-right text-[0.875rem] text-ink-strong">
            {row.value}
          </dd>
        </div>
      ))}
    </div>
  );
}

export default function ReceiptModal({
  open,
  onClose,
  order,
}: ReceiptModalProps) {
  if (!open || !order) return null;

  const sellerRows = buildSellerRows();
  const productRows = buildProductRows(order);
  const paymentRows = buildPaymentRows(order);
  const breakdownRows = buildAmountBreakdownRows(order);
  const totalRow: ReceiptRow = {
    label: "합계",
    value: formatKRW(order.amount),
  };

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

            <dl className="mt-7.5 flex flex-col pb-8.75">
              <ReceiptSection rows={sellerRows} dashedTop={false} />
              <ReceiptSection rows={productRows} dashedTop />
              <ReceiptSection rows={paymentRows} dashedTop />
              <ReceiptSection rows={breakdownRows} dashedTop />
              {/* 합계 — 위 세 블록과 점선으로 구분하고, 총 결제 금액은 굵게
                  강조해 마켓·카드 영수증의 관행적인 합계 표기를 따른다. */}
              <div className="flex items-center justify-between gap-4 border-t border-dashed border-line pt-3.75">
                <dt className="text-[0.9375rem] font-semibold text-ink">
                  {totalRow.label}
                </dt>
                <dd className="text-right text-[0.9375rem] font-bold text-ink-strong">
                  {totalRow.value}
                </dd>
              </div>
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
