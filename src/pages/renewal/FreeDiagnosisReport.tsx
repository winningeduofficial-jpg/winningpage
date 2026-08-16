import { type ComponentProps, useMemo } from "react";
import { Navigate, useLocation } from "react-router";
import "../../styles/report-print.css";
import "../../styles/report-responsive.css";
import ReportPageOne from "@/components/renewal/report/ReportPageOne";
import ReportPageTwo from "@/components/renewal/report/ReportPageTwo";
import ReportScreenExtras from "@/components/renewal/report/ReportScreenExtras";
import ReportSincerityBanner from "@/components/renewal/report/ReportSincerityBanner";
// 저장 키·스키마 검증은 storage 모듈이 소유한다 — 저장 주체(설문 CTA)와 읽기 주체(이 페이지)가
// 다른 파일이라 리터럴을 양쪽에 두면 조용히 갈라진다.
import { loadDiagnosisInput } from "@/lib/diagnosisInputStorage";
import { buildReport } from "@/lib/diagnosisReport";

// 입력 없이 이 URL 로 진입했을 때 되돌려보낼 설문 시작점. 라우트 정본(App.jsx)과 같은 경로다.
const SURVEY_ENTRY_PATH = "/app/learning-diagnosis/survey";

// loadDiagnosisInput()/buildReport()의 JSDoc 반환 타입({object|null}/{object})이 이 파일이
// 읽는 필드를 담지 않아 여기서만 쓰는 최소 타입으로 좁혀 둔다(두 파일 다 이 배치 범위 밖).
type DiagnosisInput = {
  admissionCuts?: {
    cut50: number | null;
    cut70: number | null;
    finalAvg: number | null;
  } | null;
  admissionCutsError?: boolean;
  admissionMeta?: { year: string | number | null };
};

type DiagnosisReportData = ComponentProps<typeof ReportPageTwo>["data"] &
  ComponentProps<typeof ReportPageOne>["data"] & {
    notices?: { sincerityBanner?: string | null };
  };

/**
 * 무료진단 결과 리포트 페이지.
 *
 * - 채점 실행 위치는 이 페이지 하나다(§7.4.2). 제출 시점에는 normalizeAnswers() 결과만 저장하고
 *   이동하므로, 새로고침·직접 URL 진입·프리뷰가 전부 같은 경로 하나를 탄다.
 * - 저장된 응답이 없으면(무입력 직접 진입·손상 페이로드) 설문 시작점으로 리다이렉트한다.
 *   종전에는 승인된 디자인 샘플(renewalReportSample)을 '예시' 표기와 함께 렌더했으나, 학생이
 *   가상 리포트를 본인 결과로 오인할 여지를 없애기 위해 라우트 가드로 전환했다(2026-08-13 확정).
 *   그 결정으로 예시 픽스처·샘플 배너·인쇄 워터마크 경로 전체가 이 페이지에서 제거됐다.
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
    if (!input) return null; // 무입력 → 가드(아래에서 리다이렉트)
    try {
      // B-1(2026-08-11 확정) — 입결 컷은 스텝5 캐스케이드가 선택 시점에 이미 조회해 페이로드에
      // 실어 뒀다(diagnosisInputStorage.submitDiagnosisAnswers). 이 페이지는 다시 조회하지 않는다
      // — 그대로면 buildReport 는 여전히 동기다. 미연결(admissionCuts 없음)이면 ctx.cuts 가
      // undefined 로 떨어져 §4.6 그대로 BAND_NODATA 로 조립된다.
      // F-22 — cutsError 는 '지금 못 불러왔다'(일시 오류)를 '이 조합은 원래 자료가 없다'
      // (영구 부재)와 가르는 유일한 신호다. 이걸 빼면 조회 실패 학생에게 BAND_NODATA
      // ('…자료가 없어 산출하지 않았습니다')가 나가는데, 그 문장은 영구 부재를 단정하므로
      // 거짓말이 된다. 훅이 참조 비교로 판정해 불리언으로 저장해 둔 값을 그대로 넘긴다.
      const typedInput = input as DiagnosisInput;
      // exactOptionalPropertyTypes 대응 — buildReport(범위 밖 파일)의 BuildReportCtx는 각 필드에
      // undefined를 명시적으로 허용하지 않아, undefined면 키 자체를 생략한다(동작 동일).
      return buildReport(input, {
        ...(typedInput.admissionCuts !== undefined
          ? { cuts: typedInput.admissionCuts }
          : {}),
        ...(typedInput.admissionCutsError !== undefined
          ? { cutsError: typedInput.admissionCutsError }
          : {}),
        ...(typedInput.admissionMeta !== undefined
          ? { admissionMeta: typedInput.admissionMeta }
          : {}),
      }) as DiagnosisReportData;
    } catch (error) {
      // 스키마 버전은 맞지만 내부가 손상된 페이로드(수기 편집·부분 저장). 흰 화면이나 가짜
      // 리포트 대신 설문으로 돌려보낸다 — null 을 반환하면 아래 가드가 리다이렉트한다.
      if (import.meta.env?.DEV)
        console.error(
          "[free-diagnosis] 리포트 조립 실패 — 설문으로 리다이렉트한다",
          error,
        );
      return null;
    }
  }, [location.state]);

  // 무입력·손상 페이로드는 설문 시작점으로 돌려보낸다(가짜 리포트를 본인 결과로 오인하는 것을 원천 차단).
  if (!data) {
    return <Navigate to={SURVEY_ENTRY_PATH} replace />;
  }

  return (
    <main className="fd-print-area min-h-screen w-full bg-[#FBFAFA] pt-16">
      <div className="fd-sheet-stack flex flex-col items-center gap-10 px-4 pt-10 pb-10 lg:gap-[6.25rem] lg:px-0 lg:pt-[6.25rem] lg:pb-[6.25rem]">
        {/* 불성실 응답 경고는 시트 **위**에 둔다 — '결과가 다를 수 있다'는 안내가 리포트 2장을
            다 읽은 뒤에 나오면 기능을 못 한다. 시트 밖인 이유는 승인된 A4 레이아웃의 첫 요소를
            밀어내지 않기 위해서다. */}
        {/* exactOptionalPropertyTypes 대응 — undefined면 키 자체를 생략(ReportSincerityBanner 미수정 범위). */}
        <ReportSincerityBanner
          {...(data.notices?.sincerityBanner !== undefined
            ? { message: data.notices.sincerityBanner }
            : {})}
        />

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
