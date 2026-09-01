import { formatKRW } from "@/data/pricingCatalog";

// 환불 금액 3~4행 요약 — RefundApprovalModal ≈ RefundRequestModal이 각자
// 복붙해 두고 있던 "결제 금액 / (안분결제액) / 이용분 공제 / 최종 환불액"
// 블록을 공용화한다. 계산(fee/base 분기 등)은 호출부 책임 — 이 컴포넌트는
// 이미 계산된 값만 그대로 렌더한다.

type RefundAmountSummaryProps = {
  // gross_amount 가 없는 레거시 행(sql/72 이전)은 null — 그때는 결제 금액/
  // 이용분 공제 두 행을 통째로 숨기고 최종 환불액만 보여준다(기존 분기 유지).
  gross: number | null;
  // 구성서비스 부분해지에서 일부만 선택했을 때만(scope='items') 값을 전달한다.
  paidAllocated?: number | null | undefined;
  fee: number | null;
  refund: number;
};

export default function RefundAmountSummary({
  gross,
  paidAllocated,
  fee,
  refund,
}: RefundAmountSummaryProps) {
  return (
    <div className="mt-3 flex flex-col gap-2">
      {gross !== null && (
        <>
          <div className="flex items-center justify-between text-[0.875rem]">
            <span className="text-ink-sub">결제 금액</span>
            <span className="text-ink-strong">{formatKRW(gross)}</span>
          </div>
          {/* 라벨은 약관 [별표 2] 1단계 문언 "안분결제액" 그대로(사용자 확정 2026-09-01). */}
          {paidAllocated !== null && paidAllocated !== undefined && (
            <div className="flex items-center justify-between text-[0.875rem]">
              <span className="text-ink-sub">안분결제액</span>
              <span className="text-ink-strong">
                {formatKRW(paidAllocated)}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between text-[0.875rem]">
            <span className="text-ink-sub">이용분 공제</span>
            <span className="text-error">
              {fee !== null && fee > 0 ? `-${formatKRW(fee)}` : formatKRW(0)}
            </span>
          </div>
        </>
      )}
      <div className="flex items-center justify-between border-t border-line pt-2 text-[0.9375rem] font-semibold">
        {/* 약관 [별표 2] 최종 단계 문언 "최종 환불액" 그대로(사용자 확정 2026-09-01). */}
        <span className="text-ink">최종 환불액</span>
        <span className="text-ink-strong">{formatKRW(refund)}</span>
      </div>
    </div>
  );
}
