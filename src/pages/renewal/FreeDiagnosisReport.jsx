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
import ReportSampleBanner from '../../components/renewal/report/ReportSampleBanner';
import ReportSincerityBanner from '../../components/renewal/report/ReportSincerityBanner';
import ReportScreenExtras from '../../components/renewal/report/ReportScreenExtras';

/**
 * 픽스처(1차 디자인 샘플)를 현재 ReportData 계약에 맞춘다.
 *
 * 픽스처는 buildReport 이전 shape 라 traitsHeading 이 없다. 문자열을 새로 쓰지 않고
 * 문구집 템플릿(section_traits)으로 채운다 — 픽스처 파일은 스냅샷 기준이라 수정하지 않는다.
 */
function adaptSample(sample) {
  return {
    ...sample,
    // F-18 — 예시 표시(화면 배너 + 인쇄 워터마크)를 켜는 유일한 스위치. buildReport 를 통과한
    // 데이터는 정의상 isSample:false 라, 실제 응답 리포트에 예시 표시가 붙을 경로가 구조적으로 없다.
    isSample: true,
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
 * - 좁은 뷰포트 반응형(R3, 2026-08-11): lg(1024px) 미만은 각 섹션 컴포넌트가 단일 컬럼으로
 *   리플로우한다(축소 폐기 — report-responsive.css 상단 주석 참고). lg 이상은 기존 A4 고정
 *   레이아웃 그대로다. 인쇄(@media print)는 항상 A4 2장 고정 — 화면 리플로우와 무관하다.
 */
export default function FreeDiagnosisReport() {
  const location = useLocation();

  const data = useMemo(() => {
    const input = loadDiagnosisInput(location.state);
    if (input) {
      try {
        // B-1(2026-08-11 확정) — 입결 컷은 스텝5 캐스케이드가 선택 시점에 이미 조회해 페이로드에
        // 실어 뒀다(diagnosisInputStorage.submitDiagnosisAnswers). 이 페이지는 다시 조회하지 않는다
        // — 그대로면 buildReport 는 여전히 동기다. 미연결(admissionCuts 없음)이면 ctx.cuts 가
        // undefined 로 떨어져 §4.6 그대로 BAND_NODATA 로 조립된다.
        // F-22 — cutsError 는 '지금 못 불러왔다'(일시 오류)를 '이 조합은 원래 자료가 없다'
        // (영구 부재)와 가르는 유일한 신호다. 이걸 빼면 조회 실패 학생에게 BAND_NODATA
        // ('…자료가 없어 산출하지 않았습니다')가 나가는데, 그 문장은 영구 부재를 단정하므로
        // 거짓말이 된다. 훅이 참조 비교로 판정해 불리언으로 저장해 둔 값을 그대로 넘긴다.
        return buildReport(input, {
          cuts: input.admissionCuts,
          cutsError: input.admissionCutsError,
          admissionMeta: input.admissionMeta
        });
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
      {/* fd-report-sample — 인쇄 워터마크 훅. report-print.css 가 이 조상 클래스로
          .fd-report-sheet::after('예시')를 켠다. 문서 흐름 밖(absolute)이라 A4 2장 높이 영향 0. */}
      <div
        className={`fd-sheet-stack flex flex-col items-center gap-10 px-4 pt-10 pb-10 lg:gap-[6.25rem] lg:px-0 lg:pt-[6.25rem] lg:pb-[6.25rem] ${
          data.isSample ? 'fd-report-sample' : ''
        }`}
      >
        {/* 두 배너 모두 시트 **위**에 둔다 — '이건 예시다' / '결과가 다를 수 있다'는 경고가
            리포트 2장을 다 읽은 뒤에 나오면 아무 기능도 하지 못한다. 시트 안이 아니라 밖인
            이유는 승인된 A4 레이아웃의 첫 요소(페이지 라벨)를 밀어내지 않기 위해서다. */}
        {data.isSample && <ReportSampleBanner />}
        <ReportSincerityBanner message={data.notices?.sincerityBanner} />

        <ReportPageOne data={data} />
        <ReportPageTwo data={data} />

        {/* 화면 전용 확장 영역(F-04 · F-05) — AREA_COPY 108문구·고지·긴급도가 사는 자리.
            PDF 버튼 **앞**이어야 한다: 버튼이 시트 직후에 있으면 '리포트는 여기서 끝'이라는
            종결 신호가 되어 이 섹션의 발견율이 급감한다. */}
        <ReportScreenExtras data={data} />

        {/* PdfDownloadButton.jsx 미배정 — 결정9 스펙(253×60, r30, bg #013262)을 인라인 구현.
            모바일에서도 살아 있어야 한다(A4 출력은 이 경로로만 얻는다) — 터치 타깃 h-[3.75rem]
            (60px) 는 이미 2.75rem(44px) 최소 기준을 넘는다. */}
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
