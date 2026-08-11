import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import '../../styles/report-print.css';
import '../../styles/report-responsive.css';
import renewalReportSample from '../../data/renewalReportSample';
import { buildReport } from '../../lib/diagnosisReport';
// 저장 키·스키마 검증은 storage 모듈이 소유한다 — 저장 주체(설문 CTA)와 읽기 주체(이 페이지)가
// 다른 파일이라 리터럴을 양쪽에 두면 조용히 갈라진다.
import { DIAGNOSIS_INPUT_STORAGE_KEY, loadDiagnosisInput } from '../../lib/diagnosisInputStorage';
import { fill, templateCopy } from '../../lib/diagnosisCopyBinding';
import ReportPageOne from '../../components/renewal/report/ReportPageOne';
import ReportPageTwo from '../../components/renewal/report/ReportPageTwo';

/**
 * 픽스처(1차 디자인 샘플)를 현재 ReportData 계약에 맞춘다.
 *
 * 픽스처는 buildReport 이전 shape 라 traitsHeading 이 없다. 문자열을 새로 쓰지 않고
 * 문구집 템플릿(section_traits)으로 채운다 — 픽스처 파일은 스냅샷 기준이라 수정하지 않는다.
 */
function adaptSample(sample) {
  return {
    ...sample,
    traitsHeading: fill(
      templateCopy('section_traits'),
      { name: sample.student.name },
      'section_traits'
    )
  };
}

/**
 * 무료진단 결과 리포트 페이지.
 *
 * - 채점 실행 위치는 이 페이지 하나다(§7.4.2). 제출 시점에는 normalizeAnswers() 결과만 저장하고
 *   이동하므로, 새로고침·직접 URL 진입·프리뷰가 전부 같은 경로 하나를 탄다.
 * - 응답이 없으면 승인된 디자인 샘플(renewalReportSample)로 렌더한다 — 개발 모드에서만 그 사실을 알린다.
 *   (설문 1스텝으로 리다이렉트하지 않는 이유: 디자인 확인·인쇄 레이아웃 점검이 이 URL 로만 가능하다.)
 * - A4 시트 2장(1120×1584.94 = 70rem×99.0588rem)을 화면에서는 세로로 쌓아 보여주고,
 *   "PDF 파일로 다운 받기" 클릭 시 window.print() 로 브라우저 인쇄 다이얼로그를 띄운다
 *   (결정9 — 전용 PDF 파일 생성은 2차, report-print.css 의 @media print 가 A4 2장만 남긴다).
 * - 헤더/푸터는 SiteLayout(App.jsx 의 부모 라우트)이 공급 — 이 페이지에서 렌더하지 않는다.
 *   main 상단 오프셋은 기존 설문 셸과 동일한 pt-16(4rem) 관례를 따른다.
 * - fd-print-area / fd-report-sheet / fd-no-print 클래스는 report-print.css 의 계약이므로
 *   섹션 컴포넌트가 들어와도 그대로 유지해야 한다.
 * - 좁은 뷰포트 반응형: report-responsive.css 가 .fd-report-sheet 를 transform: scale() 로
 *   비례 축소해 가로 스크롤 없이 화면에 맞춘다(레이아웃 리플로우 없음, 인쇄는 영향 없음).
 */
export default function FreeDiagnosisReport() {
  const location = useLocation();

  const data = useMemo(() => {
    const input = loadDiagnosisInput(location.state);
    if (input) {
      try {
        // TODO: ctx.cuts(입결 마스터 조회 결과)는 연결 전이다 — 입결 섹션은 BAND_NODATA 로 조립된다(§4.6).
        return buildReport(input);
      } catch (error) {
        // 스키마 버전은 맞지만 내부가 손상된 페이로드(수기 편집·부분 저장)까지는 막지 못한다.
        // 조립이 실패해 리포트 전체가 흰 화면이 되는 것보다 픽스처를 보여주고 원인을 로그로 남기는 편이 낫다.
        if (import.meta.env?.DEV) console.error('[free-diagnosis] 리포트 조립 실패 — 픽스처로 폴백한다', error);
      }
    }
    if (import.meta.env?.DEV) {
      console.info(
        '[free-diagnosis] 저장된 진단 응답이 없어 renewalReportSample 픽스처로 렌더한다 ' +
          `(sessionStorage['${DIAGNOSIS_INPUT_STORAGE_KEY}'] 비어 있음 또는 스키마 버전 불일치).`
      );
    }
    return adaptSample(renewalReportSample);
  }, [location.state]);

  return (
    <main className="fd-print-area min-h-screen w-full bg-[#FBFAFA] pt-16">
      <div className="fd-sheet-stack flex flex-col items-center gap-[6.25rem] pt-[6.25rem] pb-[6.25rem]">
        <ReportPageOne data={data} />
        <ReportPageTwo data={data} />

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
