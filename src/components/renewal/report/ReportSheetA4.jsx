// A4 리포트 시트 공용 셸 — 페이지 표기 라벨 + 시트 내부 컨텐츠 래퍼.
// fd-report-sheet 클래스는 report-print.css 인쇄 계약이므로 반드시 유지한다.
// R3(2026-08-11) — lg(1024px) 미만은 A4 고정 폭·높이(70rem/99.0588rem)를 걷어내고 뷰포트
// 폭에 맞춘 단일 컬럼 카드로 리플로우한다. min-height 도 함께 제거해 실제 컨텐츠 높이만큼만
// 차지하게 한다(강제로 A4 비율을 유지할 이유가 화면에는 없다 — 그 비율은 인쇄 전용 요구다).
import { SAMPLE_REPORT_COPY } from '../../../data/diagnosisScreenCopy';

export default function ReportSheetA4({ page, totalPages = 2, children }) {
  const pageLabel = `위닝에듀 학습진단 리포트 ${page}페이지 / ${totalPages}페이지`;

  return (
    <section
      className="fd-report-sheet w-full min-w-0 shrink-0 rounded-2xl bg-white p-6 shadow-[0_0_1.25rem_rgba(0,0,0,0.06)] lg:w-[70rem] lg:min-h-[99.0588rem] lg:rounded-none lg:p-[3.75rem]"
      aria-label={pageLabel}
      // G-3(NIT 5) — 워터마크 문구의 정의처는 SAMPLE_REPORT_COPY.WATERMARK 하나다. 이 속성은
      // report-print.css 의 `.fd-report-sample .fd-report-sheet::after { content: attr(data-watermark) }`
      // 가 읽는다 — .fd-report-sample 조상 클래스가 없으면(실제 응답 리포트) 그 선택자 자체가
      // 매치하지 않아 속성이 있어도 아무것도 그려지지 않는다.
      data-watermark={SAMPLE_REPORT_COPY.WATERMARK}
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
