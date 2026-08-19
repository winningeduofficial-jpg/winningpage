import type { KeyboardEvent, ReactNode } from "react";

// 마이페이지 결제/신청 목록 표 — 확정 디자인의 세 섹션(환불요청 / 결제 신청하기 /
// 지난 결제내역, 3967:3944)과 학생 신청 내역(3967:3016)이 **같은 5열 표**를 쓴다.
// 열 라벨만 화면마다 다르므로(학부모 "주문번호/승인 일시/결제 금액" ↔ 학생
// "신청번호/신청일/이용금액") headers 로 받는다.
//
// 열 폭은 기존 결제내역 표 실측을 그대로 승계한다 — 주문번호·승인일시 각 220px,
// 상품은 minmax(0,1fr), 금액·상태는 고정폭. 바깥 1fr 대신 minmax(0,1fr)를 쓰는
// 이유는 grid item 기본 최소폭(min-content)이 긴 상품명에서 열 합을 컨테이너 밖으로
// 밀어 상태 칩을 잘라먹기 때문이다.
const GRID =
  "grid grid-cols-[13.75rem_13.75rem_minmax(0,1fr)_9rem_9rem] gap-x-2";

type PaymentTableHeaders = {
  id: string;
  date: string;
  product: string;
  amount: string;
  status: string;
};

type PaymentTableRow = {
  key: string;
  idFull?: string;
  idText: string;
  dateText: string;
  productText: string;
  note?: string;
  amountText: string;
  [key: string]: unknown;
};

type PaymentTableProps = {
  headers: PaymentTableHeaders;
  rows: PaymentTableRow[];
  emptyText?: ReactNode;
  onSelect?: (row: PaymentTableRow) => void;
  renderStatus: (row: PaymentTableRow) => ReactNode;
};

export default function PaymentTable({
  headers,
  rows,
  emptyText,
  onSelect,
  renderStatus,
}: PaymentTableProps) {
  if (!rows.length) {
    return (
      <p className="mt-[1.5rem] rounded-lg bg-surface-04 px-5 py-6 text-center text-[0.875rem] text-ink-sub">
        {emptyText}
      </p>
    );
  }

  return (
    <div className="mt-[1.5rem] overflow-x-auto">
      <div className="w-full text-sm">
        <div
          className={`${GRID} border-b border-line pb-[0.625rem] text-sm font-semibold text-ink-sub`}
        >
          <span>{headers.id}</span>
          <span>{headers.date}</span>
          <span>{headers.product}</span>
          <span className="text-right">{headers.amount}</span>
          <span className="text-right">{headers.status}</span>
        </div>

        <div className="flex flex-col gap-y-5 pt-[1.25rem]">
          {rows.map((row) => {
            const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect?.(row);
              }
            };
            return (
              // 배경(hover:bg-surface-04)이 wrapper 자기 자신에 붙어야 grid gap
              // 영역까지 이어서 칠해진다 — 셀마다 개별로 주면 gap 만큼 배경이
              // 끊겨 보인다. 열 폭 정렬은 헤더와 같은 GRID 상수를 그대로 재사용해
              // 맞춘다(부모가 아니라 이 wrapper 자신이 grid 컨테이너다).
              <div
                key={row.key}
                role="button"
                tabIndex={0}
                onClick={() => onSelect?.(row)}
                onKeyDown={handleKeyDown}
                className={`${GRID} cursor-pointer rounded-lg hover:bg-surface-04`}
              >
                <span
                  title={row.idFull || row.idText}
                  className="flex h-8 items-center truncate self-center text-left text-accent underline underline-offset-2"
                >
                  {row.idText}
                </span>
                <span className="flex h-8 items-center truncate text-ink-sub">
                  {row.dateText}
                </span>
                <span className="flex h-8 items-center truncate text-ink-strong">
                  {row.productText}
                  {row.note && (
                    <span className="ml-1.5 shrink-0 text-xs text-ink-sub">
                      {row.note}
                    </span>
                  )}
                </span>
                <span className="flex h-8 items-center justify-end truncate text-ink-strong">
                  {row.amountText}
                </span>
                <span
                  onClick={(e) => e.stopPropagation()}
                  className="flex h-8 items-center justify-end"
                >
                  {renderStatus(row)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
