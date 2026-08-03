// A4 리포트 시트 공용 셸 — 페이지 표기 라벨 + 시트 내부 컨텐츠 래퍼.
// fd-report-sheet 클래스는 report-print.css 인쇄 계약이므로 반드시 유지한다.
export default function ReportSheetA4({ page, totalPages = 2, children }) {
  const pageLabel = `위닝에듀 무료 진단 리포트 ${page}페이지 / ${totalPages}페이지`;

  return (
    <section
      className="fd-report-sheet w-[70rem] min-h-[99.0588rem] shrink-0 bg-white p-[3.75rem] shadow-[0_0_1.25rem_rgba(0,0,0,0.06)]"
      aria-label={pageLabel}
    >
      <p className="text-base font-normal leading-[1.3] text-[#808080]">{pageLabel}</p>
      {children}
    </section>
  );
}
