import type { ReactNode } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// 마이페이지 결제/신청 목록 표 — 확정 디자인의 세 섹션(환불요청 / 결제 신청하기 /
// 지난 결제내역, 3967:3944)과 학생 신청 내역(3967:3016)이 **같은 표 형식**을
// 쓴다. 열 라벨만 화면마다 다르므로(학부모 "주문번호/일시/결제 금액" ↔ 학생
// "주문번호/일시/상태") headers 로 받는다.
//
// shadcn Table(src/components/ui/table.tsx) 위에 쌓는다 — 열 셀에 기본 패딩이
// 있어야 "표 같은" 여백이 생기는데, 이전 grid+span 구현은 셀마다 직접 패딩을
// 관리해야 해서 계속 텍스트가 셀 경계에 바짝 붙어 보였다. shadcn Table의
// TableHead/TableCell 기본 padding(p-2)을 그대로 받아 쓴다.
//
// 열 폭 — 실측(각 셀 콘텐츠의 nowrap 폭) 기준. 주문번호는 전체 값(order_
// 접두어만 뗀 토스 orderId, 예: 1786575058832_3939f472, 최대 223px)이
// 말줄임 없이 한 줄로 들어가야 해서 14rem. 승인일시(최대 101px)·금액(최대
// 91px)·상태 배지(최대 108px)는 타이트하게 잡고, 상품이 나머지 전부를
// 가져가 제일 넓다. table-fixed + colgroup으로 고정한다.
//
// showAmount=false(학생, 2026-09-01 형식 통일 B안) — 금액은 여전히 학생에게
// 보이면 안 된다(2026-08-13 확정 정책 불변, 형식만 통일). 열 자체를 숨김
// 처리(CSS)하는 대신 렌더하지 않는다 — DOM에 금액이 아예 없어야 값이 실수로
// 새는 경로(접근성 트리·검색 등)를 원천 차단한다. 학부모 5열은 그대로 둔다.
const COL_WIDTHS = ["14rem", "7rem", undefined, "7rem", "8rem"];
const COL_WIDTHS_NO_AMOUNT = ["14rem", "7rem", undefined, "8rem"];

type PaymentTableHeaders = {
  id: string;
  date: string;
  product: string;
  // showAmount=false면 안 쓴다 — 그 화면(학생)은 헤더 객체에 아예 안 넣어도 된다.
  amount?: string;
  status: string;
};

type PaymentTableRow = {
  key: string;
  idFull?: string;
  idText: string;
  dateText: string;
  productText: string;
  note?: string;
  // showAmount=false(학생)면 애초에 계산하지 않는다 — 값이 있어도 렌더하지
  // 않지만, 존재 자체가 실수 노출 경로가 될 수 있어 옵셔널로 둔다.
  amountText?: string;
  [key: string]: unknown;
};

type PaymentTableProps = {
  headers: PaymentTableHeaders;
  rows: PaymentTableRow[];
  emptyText?: ReactNode;
  onSelect?: (row: PaymentTableRow) => void;
  renderStatus: (row: PaymentTableRow) => ReactNode;
  showAmount?: boolean;
};

export default function PaymentTable({
  headers,
  rows,
  emptyText,
  onSelect,
  renderStatus,
  showAmount = true,
}: PaymentTableProps) {
  if (!rows.length) {
    return (
      <p className="mt-6 rounded-lg bg-surface-04 px-5 py-6 text-center text-[0.875rem] text-ink-sub">
        {emptyText}
      </p>
    );
  }

  const colWidths = showAmount ? COL_WIDTHS : COL_WIDTHS_NO_AMOUNT;

  return (
    <div className="mt-6">
      <Table className="table-fixed">
        <colgroup>
          {colWidths.map((width, i) => (
            // 열 개수·순서 고정(주문번호/일시/상품/[금액]/상태), 재정렬 없음 — index 키로 충분.
            // biome-ignore lint/suspicious/noArrayIndexKey: 고정된 colgroup, 재정렬 없음
            <col key={i} style={width ? { width } : undefined} />
          ))}
        </colgroup>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="text-ink-sub">{headers.id}</TableHead>
            <TableHead className="text-ink-sub">{headers.date}</TableHead>
            <TableHead className="text-ink-sub">{headers.product}</TableHead>
            {showAmount && (
              <TableHead className="text-right text-ink-sub">
                {headers.amount}
              </TableHead>
            )}
            <TableHead className="text-center text-ink-sub">
              {headers.status}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow
              key={row.key}
              tabIndex={0}
              onClick={() => onSelect?.(row)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect?.(row);
                }
              }}
              className="cursor-pointer border-b-0 hover:bg-surface-04"
            >
              <TableCell
                title={row.idFull || row.idText}
                className="whitespace-nowrap font-semibold text-ink-strong"
              >
                {row.idText}
              </TableCell>
              <TableCell className="truncate text-ink-sub">
                {row.dateText}
              </TableCell>
              <TableCell className="truncate whitespace-normal text-ink-strong">
                {row.productText}
                {row.note && (
                  <span className="ml-1.5 shrink-0 text-xs text-ink-sub">
                    {row.note}
                  </span>
                )}
              </TableCell>
              {showAmount && (
                <TableCell className="text-right text-ink-strong">
                  {row.amountText}
                </TableCell>
              )}
              <TableCell className="text-center">{renderStatus(row)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
