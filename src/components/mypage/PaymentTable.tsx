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
// 지난 결제내역, 3967:3944)과 학생 신청 내역(3967:3016)이 **같은 5열 표**를 쓴다.
// 열 라벨만 화면마다 다르므로(학부모 "주문번호/승인 일시/결제 금액" ↔ 학생
// "신청번호/신청일/이용금액") headers 로 받는다.
//
// shadcn Table(src/components/ui/table.tsx) 위에 쌓는다 — 열 셀에 기본 패딩이
// 있어야 "표 같은" 여백이 생기는데, 이전 grid+span 구현은 셀마다 직접 패딩을
// 관리해야 해서 계속 텍스트가 셀 경계에 바짝 붙어 보였다. shadcn Table의
// TableHead/TableCell 기본 padding(p-2)을 그대로 받아 쓴다.
//
// 열 폭은 기존 결제내역 표 실측을 그대로 승계한다 — 주문번호·승인일시 각 220px,
// 상품은 나머지 전부, 금액·상태는 고정폭. table-fixed + colgroup으로 고정한다
// (기존 grid-template-columns와 동일한 의도).
const COL_WIDTHS = ["13.75rem", "13.75rem", undefined, "9rem", "9rem"];

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
      <p className="mt-6 rounded-lg bg-surface-04 px-5 py-6 text-center text-[0.875rem] text-ink-sub">
        {emptyText}
      </p>
    );
  }

  return (
    <div className="mt-6">
      <Table className="table-fixed">
        <colgroup>
          {COL_WIDTHS.map((width, i) => (
            // 열 개수·순서 고정(주문번호/승인일시/상품/금액/상태), 재정렬 없음 — index 키로 충분.
            // biome-ignore lint/suspicious/noArrayIndexKey: 고정된 5칸 colgroup, 재정렬 없음
            <col key={i} style={width ? { width } : undefined} />
          ))}
        </colgroup>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="text-ink-sub">{headers.id}</TableHead>
            <TableHead className="text-ink-sub">{headers.date}</TableHead>
            <TableHead className="text-ink-sub">{headers.product}</TableHead>
            <TableHead className="text-right text-ink-sub">
              {headers.amount}
            </TableHead>
            <TableHead className="text-right text-ink-sub">
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
              className="cursor-pointer hover:bg-surface-04"
            >
              <TableCell
                title={row.idFull || row.idText}
                className="truncate text-accent underline underline-offset-2"
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
              <TableCell className="text-right text-ink-strong">
                {row.amountText}
              </TableCell>
              <TableCell className="text-right">{renderStatus(row)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
