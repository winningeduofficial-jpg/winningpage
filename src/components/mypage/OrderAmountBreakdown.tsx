import type { ReactNode } from "react";
import {
  computeDiscountBreakdown,
  type DiscountOrderInput,
} from "@/components/mypage/paymentRows";
import { formatKRW } from "@/data/pricingCatalog";
import { useBundleCompositionMap } from "./bundleComposition";

// 영수증형 금액 구조 — Carbon Design System의 order summary 템플릿 패턴을 따른다:
// "결제 항목" 섹션 → "할인" 섹션(없으면 통째로 생략) → 굵은 구분선 → 원금/할인액
// 총합/합계 요약 블록. EnrollmentRequestModal과 PaymentDetailModal이 공유한다 —
// 두 화면이 각자 만들면 같은 주문이 서로 다른 레이아웃으로 보일 수 있다.

type OrderAmountBreakdownProps = {
  order: DiscountOrderInput;
  amount: number;
  // itemRows가 비는 구 호출부(order_items 조인 없는 화면)를 위한 폴백 — 상품명
  // 한 줄만 "결제 항목" 섹션에 보여준다.
  fallbackName?: string | undefined;
};

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-[0.8125rem] font-semibold text-ink-sub">{children}</p>
  );
}

function Row({
  label,
  value,
  emphasize,
  bold,
  sublines,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
  bold?: boolean;
  // 번들 구성 내역(태스크6) — 금액 없는 들여쓰기 보조 텍스트 행. 이 상품
  // 행에만 붙고, 값이 없으면 아무것도 렌더하지 않는다.
  sublines?: string[] | undefined;
}) {
  return (
    <div>
      <div className="mt-2 flex items-center justify-between gap-3 text-[0.9375rem]">
        <span
          className={`truncate ${bold ? "font-bold text-ink-strong" : "text-ink"}`}
          title={label}
        >
          {label}
        </span>
        <span
          className={`shrink-0 ${
            emphasize
              ? "font-semibold text-primary"
              : bold
                ? "text-[1.0625rem] font-bold text-ink-strong"
                : "font-semibold text-ink-strong"
          }`}
        >
          {value}
        </span>
      </div>
      {sublines && sublines.length > 0 && (
        <div className="mt-1 flex flex-col gap-0.5 pl-3">
          {sublines.map((line) => (
            <span key={line} className="text-[0.8125rem] text-ink-sub">
              {line}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function OrderAmountBreakdown({
  order,
  amount,
  fallbackName,
}: OrderAmountBreakdownProps) {
  const { listAmount, itemRows, discountRows, couponRows, discountTotal } =
    computeDiscountBreakdown(order);

  const hasDiscount = discountTotal > 0;

  // 번들 구성 내역(태스크6) — itemRows는 order.order_items와 같은 순서·같은
  // 길이로 만들어진다(computeDiscountBreakdown의 .map()) 그래서 인덱스로
  // product_id를 짝지을 수 있다. 번들 아닌 주문은 bundleMap이 빈 채로
  // 남아 sublines가 항상 undefined라 화면이 그대로다.
  const productIds = (order.order_items ?? []).map((item) => item.product_id);
  const bundleMap = useBundleCompositionMap(productIds);

  return (
    <div>
      <SectionLabel>결제 항목</SectionLabel>
      {itemRows.length > 0 ? (
        itemRows.map((row, i) => (
          <Row
            // biome-ignore lint/suspicious/noArrayIndexKey: 파생 표시 행이라 고유 id가 없고 재정렬·삽입 없이 통째로 다시 그린다 — 같은 라벨이 반복될 수 있어 인덱스로 구분한다.
            key={`item-${row.label}-${i}`}
            label={row.label}
            value={row.amountText}
            sublines={bundleMap.get(order.order_items?.[i]?.product_id || "")}
          />
        ))
      ) : (
        <Row label="결제 상품" value={fallbackName || "-"} />
      )}

      {hasDiscount && (
        <div className="mt-4">
          <SectionLabel>할인</SectionLabel>
          {discountRows.map((row, i) => (
            <Row
              // biome-ignore lint/suspicious/noArrayIndexKey: 파생 표시 행이라 고유 id가 없고 재정렬·삽입 없이 통째로 다시 그린다.
              key={`discount-${i}`}
              label={row.label}
              value={row.amountText}
              emphasize
            />
          ))}
          {couponRows.map((row, i) => (
            <Row
              // biome-ignore lint/suspicious/noArrayIndexKey: 파생 표시 행이라 고유 id가 없고 재정렬·삽입 없이 통째로 다시 그린다.
              key={`coupon-${i}`}
              label={row.label}
              value={row.amountText}
              emphasize
            />
          ))}
        </div>
      )}

      <div className="mt-4 border-t-2 border-ink-strong/15 pt-3">
        {hasDiscount && (
          <>
            <Row label="원금" value={formatKRW(listAmount)} />
            <Row
              label="할인액 총합"
              value={`-${formatKRW(discountTotal)}`}
              emphasize
            />
          </>
        )}
        <Row label="합계" value={formatKRW(amount)} bold />
      </div>
    </div>
  );
}
