import type { ReactNode } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  PREMIUM_BEIGE_BG_CLASS,
  PREMIUM_GRADUATE_GREEN,
  PREMIUM_NATURAL_TEXT_CLASS,
} from "./premiumTokens";

// 3개 대학 비교표 — 진초록(PREMIUM_GRADUATE_GREEN, 시안 실측) 헤더 행 + 첫 열은 행 라벨
// (서류명/평가내용/추천서 등), 셀은 본문+보조 텍스트 2줄. 모바일은 페이지 자체가 가로
// 스크롤되지 않도록 overflow-x-auto 컨테이너 안에서 표만 스크롤하고, 첫 열을 sticky 로
// 고정한다.

type CompareTableCell = {
  primary: string;
  secondary?: string;
};

type CompareTableRow = {
  label: string;
  cells: CompareTableCell[];
};

type PremiumCompareTableProps = {
  columns: string[];
  rows: CompareTableRow[];
  footnote?: ReactNode;
};

export default function PremiumCompareTable({
  columns,
  rows,
  footnote,
}: PremiumCompareTableProps) {
  if (!columns || columns.length === 0 || !rows || rows.length === 0) {
    return null;
  }

  return (
    <div className="w-full">
      <ScrollArea axis="x" className="rounded-lg border border-line">
        <table className="w-full min-w-[40rem] border-collapse text-left">
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-10 w-[6.5rem] px-4 py-4 sm:w-[8rem]"
                style={{ backgroundColor: PREMIUM_GRADUATE_GREEN }}
              >
                <span className="sr-only">구분</span>
              </th>
              {columns.map((column) => (
                <th
                  key={column}
                  scope="col"
                  className="px-4 py-4 text-center text-[1rem] font-semibold leading-[1.4] text-white sm:text-[1.125rem]"
                  style={{ backgroundColor: PREMIUM_GRADUATE_GREEN }}
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-t border-line">
                <th
                  scope="row"
                  className={`sticky left-0 z-10 w-[6.5rem] px-4 py-6 text-center text-[0.875rem] font-semibold leading-[1.4] text-ink-strong sm:w-[8rem] sm:text-[0.9375rem] ${PREMIUM_BEIGE_BG_CLASS}`}
                >
                  {row.label}
                </th>
                {row.cells.map((cell, cellIndex) => (
                  <td
                    // biome-ignore lint/suspicious/noArrayIndexKey: 셀은 (행,열) 조합으로만 식별되는 순수 데이터라 열 인덱스가 안정적인 키다.
                    key={`${row.label}-${cellIndex}`}
                    className="border-l border-line bg-white px-4 py-6 text-center align-top"
                  >
                    <p className="break-keep text-[0.875rem] font-medium leading-[1.5] text-ink-strong sm:text-[1rem]">
                      {cell.primary}
                    </p>
                    {cell.secondary ? (
                      <p
                        className={`mt-1 break-keep text-[0.75rem] leading-[1.4] ${PREMIUM_NATURAL_TEXT_CLASS}`}
                      >
                        {cell.secondary}
                      </p>
                    ) : null}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollArea>
      {footnote ? (
        <div
          className={`mt-4 break-keep text-[0.75rem] leading-[1.6] ${PREMIUM_NATURAL_TEXT_CLASS}`}
        >
          {footnote}
        </div>
      ) : null}
    </div>
  );
}
