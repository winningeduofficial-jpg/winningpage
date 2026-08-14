import { Fragment } from "react";

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

export default function PaymentTable({
  headers,
  rows,
  emptyText,
  onSelect,
  renderStatus,
}) {
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

        <div className={`${GRID} gap-y-5 pt-[1.25rem]`}>
          {rows.map((row) => (
            <Fragment key={row.key}>
              <button
                type="button"
                onClick={() => onSelect?.(row)}
                title={row.idFull || row.idText}
                className="h-8 truncate self-center text-left text-accent underline underline-offset-2"
              >
                {row.idText}
              </button>
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
              <span className="flex h-8 items-center justify-end">
                {renderStatus(row)}
              </span>
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}
