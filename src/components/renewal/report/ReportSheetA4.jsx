// A4 리포트 시트 공용 셸 — 페이지 표기 라벨 + 시트 내부 컨텐츠 래퍼.
// fd-report-sheet 클래스는 report-print.css 인쇄 계약이므로 반드시 유지한다.
// R3(2026-08-11) — lg(1024px) 미만은 A4 고정 폭·높이(70rem/99.0588rem)를 걷어내고 뷰포트
// 폭에 맞춘 단일 컬럼 카드로 리플로우한다. min-height 도 함께 제거해 실제 컨텐츠 높이만큼만
// 차지하게 한다(강제로 A4 비율을 유지할 이유가 화면에는 없다 — 그 비율은 인쇄 전용 요구다).
export default function ReportSheetA4({ page, totalPages = 2, children }) {
  const pageLabel = `위닝에듀 학습진단 리포트 ${page}페이지 / ${totalPages}페이지`;

  return (
    <section
      className="fd-report-sheet w-full min-w-0 shrink-0 rounded-2xl bg-white p-6 shadow-[0_0_1.25rem_rgba(0,0,0,0.06)] lg:w-[70rem] lg:min-h-[99.0588rem] lg:rounded-none lg:p-[3.75rem]"
      aria-label={pageLabel}
    >
      {/* fd-page-label — 인쇄에서 report-print.css 가 이 훅으로 lg: 값(1rem/#808080)을
          강제 복원한다(인쇄는 항상 데스크톱 레이아웃). */}
      <p className="fd-page-label text-sm font-normal leading-[1.3] text-[#525252] lg:text-base lg:text-[#808080]">
        {pageLabel}
      </p>
      {children}
    </section>
  );
}
