import '../../styles/report-print.css';
import renewalReportSample from '../../data/renewalReportSample';
import ReportPageOne from '../../components/renewal/report/ReportPageOne';
import ReportPageTwo from '../../components/renewal/report/ReportPageTwo';

/**
 * 무료진단 결과 리포트 페이지.
 *
 * - A4 시트 2장(1120×1584.94 = 70rem×99.0588rem)을 화면에서는 세로로 쌓아 보여주고,
 *   "PDF 파일로 다운 받기" 클릭 시 window.print() 로 브라우저 인쇄 다이얼로그를 띄운다
 *   (결정9 — 전용 PDF 파일 생성은 2차, report-print.css 의 @media print 가 A4 2장만 남긴다).
 * - 헤더/푸터는 SiteLayout(App.jsx 의 부모 라우트)이 공급 — 이 페이지에서 렌더하지 않는다.
 *   main 상단 오프셋은 기존 설문 셸과 동일한 pt-16(4rem) 관례를 따른다.
 * - fd-print-area / fd-report-sheet / fd-no-print 클래스는 report-print.css 의 계약이므로
 *   섹션 컴포넌트가 들어와도 그대로 유지해야 한다.
 */
export default function FreeDiagnosisReport() {
  return (
    <main className="fd-print-area min-h-screen w-full overflow-x-auto bg-[#FBFAFA] pt-16">
      <div className="fd-sheet-stack flex flex-col items-center gap-[6.25rem] pt-[6.25rem] pb-[6.25rem]">
        <ReportPageOne data={renewalReportSample} />
        <ReportPageTwo data={renewalReportSample} />

        {/* PdfDownloadButton.jsx 미배정 — 결정9 스펙(253×60, r30, bg #013262)을 인라인 구현. */}
        <div className="fd-no-print">
          <button
            type="button"
            onClick={() => window.print()}
            className="flex h-[3.75rem] w-[15.8125rem] items-center justify-center rounded-[1.875rem] bg-[#013262] px-10 py-5 text-[1.25rem] font-semibold text-white transition-colors duration-150 hover:bg-[#01427e] focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            PDF 파일로 다운 받기
          </button>
        </div>
      </div>
    </main>
  );
}
