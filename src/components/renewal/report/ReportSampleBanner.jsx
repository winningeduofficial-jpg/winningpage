import { Link } from 'react-router-dom';
import { SAMPLE_REPORT_COPY } from '../../../data/diagnosisScreenCopy';

/**
 * 예시 리포트 배너(F-18) — 저장된 응답이 없어 디자인 픽스처(가상 학생)로 렌더될 때만 붙는다.
 *
 * 왜 리다이렉트가 아닌가: 이 URL 이 디자인·인쇄 레이아웃 점검의 유일한 경로다
 * (FreeDiagnosisReport.jsx 상단 주석). 대신 "이건 예시다"를 화면과 인쇄 양쪽에 남긴다 —
 * 배너는 여기(화면 전용, 문서 흐름 안), 인쇄는 report-print.css 의 대각선 워터마크
 * (.fd-report-sample .fd-report-sheet::after, 문서 흐름 밖이라 A4 2장 높이에 영향 0).
 *
 * 인쇄에 흐름 안 배너를 넣지 않는 이유는 여유가 없어서다(1p 71.0px · 2p 52.6px).
 *
 * CTA 라벨은 창작이 아니라 LearningDiagnosisLanding 의 기존 버튼 문구 인용이다.
 */
export default function ReportSampleBanner() {
  // 색은 이 리포트가 이미 쓰는 blue 쌍(RecommendServices 카드 테두리 #d1e8ff / 칩 배경 #f1f8ff)
  // 그대로다 — 새 색을 만들지 않는다. 본문 #525252 대비 ≈7.6:1.
  return (
    <section className="fd-screen-only flex w-full max-w-[70rem] flex-col items-start gap-4 rounded-xl border border-[#d1e8ff] bg-[#f1f8ff] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <p className="break-keep text-base leading-[1.5] text-[#525252]">
        {SAMPLE_REPORT_COPY.BANNER}
      </p>

      {/* 터치 타깃 h-11(2.75rem = 44px) — 최소 기준 충족. */}
      <Link
        to={SAMPLE_REPORT_COPY.CTA_HREF}
        className="inline-flex h-11 shrink-0 items-center justify-center rounded-[1.375rem] bg-[#013262] px-6 text-base font-semibold text-white transition-colors duration-150 hover:bg-[#01427e] focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        {SAMPLE_REPORT_COPY.CTA}
      </Link>
    </section>
  );
}
