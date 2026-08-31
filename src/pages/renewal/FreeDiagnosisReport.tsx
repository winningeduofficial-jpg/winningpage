import { type ComponentProps, useEffect, useMemo, useState } from "react";
import { Navigate, useLocation } from "react-router";
import "../../styles/report-print.css";
import "../../styles/report-responsive.css";
import ReportPageOne from "@/components/renewal/report/ReportPageOne";
import ReportPageTwo from "@/components/renewal/report/ReportPageTwo";
import ReportScreenExtras, {
  hasReportExtras,
} from "@/components/renewal/report/ReportScreenExtras";
import ReportSincerityBanner from "@/components/renewal/report/ReportSincerityBanner";
import { useAuth } from "@/context/AuthProvider";
// 저장 키·스키마 검증은 storage 모듈이 소유한다 — 저장 주체(설문 CTA)와 읽기 주체(이 페이지)가
// 다른 파일이라 리터럴을 양쪽에 두면 조용히 갈라진다.
import { loadDiagnosisInput } from "@/lib/diagnosisInputStorage";
import { buildReport } from "@/lib/diagnosisReport";
import { supabase } from "@/lib/supabase";
import { buildReportFileName } from "./reportFileName";

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
 * - A4 시트 2장(ReportPageOne·Two, 1120×1584.94 = 70rem×99.0588rem)에 부록(3·4페이지,
 *   ReportScreenExtras)이 있으면 이어 붙어 총 4장이 된다 — 화면에서는 전부 세로로 쌓아
 *   보여주고, "PDF 파일로 다운 받기" 클릭 시 window.print() 로 브라우저 인쇄 다이얼로그를
 *   띄운다(결정9 — 전용 PDF 파일 생성은 2차). 총 페이지 수(totalPages, 2026-08-21)는
 *   hasReportExtras()로 한 번만 계산해 모든 페이지 라벨("N페이지 / 총페이지")에 같은
 *   값을 내려보낸다.
 * - 헤더/푸터는 SiteLayout(App.jsx 의 부모 라우트)이 공급 — 이 페이지에서 렌더하지 않는다.
 *   main 상단 오프셋은 기존 설문 셸과 동일한 pt-16(4rem) 관례를 따른다.
 * - fd-print-area / fd-report-sheet / fd-no-print 클래스는 report-print.css 의 계약이므로
 *   섹션 컴포넌트가 들어와도 그대로 유지해야 한다.
 * - A4 출력물 컨셉(2026-08-20 확정) — 리포트는 A4 인쇄용 문서고 화면은 그 프리뷰다. 모바일
 *   리플로우(R3)는 폐기했다: lg(1024px) 미만에서는 A4 시트를 화면에 렌더하지 않고 다운로드
 *   안내 카드만 보여준다(fd-mobile-notice). 인쇄는 뷰포트와 무관하게 항상 A4 데스크톱
 *   레이아웃이 나가야 하므로 fd-desktop-report 훅으로 report-print.css 가 인쇄 시 강제
 *   표시하고, fd-mobile-notice는 인쇄에서 강제 숨김한다.
 */
export default function FreeDiagnosisReport() {
  const location = useLocation();

  // QA 행 103 — 설문에는 이름 수집 문항이 없어(StudentInfoBlock.tsx:38 주석) data.student.name이
  // 상시 null이다. 이 페이지 진입은 이제 로그인 필수(비회원 가드, diagnosisRoutes.tsx)라
  // profiles.name으로 대신 채운다 — PaymentsTab.tsx와 동일한 조회 패턴.
  const [studentName, setStudentName] = useState("");
  // 세션은 AuthProvider(전역 단일 구독)에서 읽는다(명세 B-3 §4).
  const { userId: uid } = useAuth();

  useEffect(() => {
    let alive = true;
    if (!uid) return undefined;

    (async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("name")
        .eq("id", uid)
        .maybeSingle();

      if (!alive) return;
      setStudentName(profile?.name || "");
    })();

    return () => {
      alive = false;
    };
  }, [uid]);

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

  // QA 행341 — 리포트 도달 후 브라우저 뒤로가기로 설문 스텝(응답을 다시 고를 수 있는 화면)에
  // 재진입할 수 있었다. 셸(SurveyStepShell)의 answers는 컴포넌트 상태라 뒤로가기로 되짚어가도
  // 이전 응답이 복원되지는 않지만, 여전히 "제출을 마친 설문을 다시 채워 넣을 수 있는 화면"으로
  // 돌아가지는 것 자체가 문제다.
  //
  // 설문 스텝에서 "이미 제출된 세션이면 리포트로 forward redirect"하는 방식 대신 이 페이지에서
  // popstate를 가드하는 쪽을 택했다 — sessionStorage(loadDiagnosisInput)는 설문을 다시 시작해
  // 재진단(이용권 재구매 등)하는 정상 플로우에서도 이전 진단 결과를 계속 들고 있으므로, 그 값의
  // 존재만으로 설문 진입을 막으면 정당한 재진단까지 리포트로 되튕긴다. 반면 popstate 가드는
  // "리포트를 실제로 본 이후의 뒤로가기"만 좁게 겨눈다. 과한 히스토리 조작(추가 페이지 이동 등)
  // 없이 현재 URL을 다시 push해 그 자리에 머무르게만 한다.
  useEffect(() => {
    if (!data) return undefined;
    window.history.pushState(null, "", window.location.href);
    const trapBack = () => {
      window.history.pushState(null, "", window.location.href);
    };
    window.addEventListener("popstate", trapBack);
    return () => window.removeEventListener("popstate", trapBack);
  }, [data]);

  // 무입력·손상 페이로드는 설문 시작점으로 돌려보낸다(가짜 리포트를 본인 결과로 오인하는 것을 원천 차단).
  if (!data) {
    return <Navigate to={SURVEY_ENTRY_PATH} replace />;
  }

  // 문서 총 페이지 수(2026-08-21 사용자 지시) — 부록(3·4페이지)이 실제로 렌더될 때만 4,
  // 아니면 시트 2장뿐이라 2. hasReportExtras()가 ReportScreenExtras의 렌더 분기와 동일한
  // 판정을 쓰므로 여기서 한 번만 계산해 전 시트·부록 페이지 라벨에 같은 값을 내려보낸다
  // (ReportSheetA4가 더 이상 totalPages 기본값을 추정하지 않는 이유).
  const totalPages = hasReportExtras(data) ? 4 : 2;

  // QA 행 103 → 2026-08-22 형식 교체 — 브라우저 인쇄 다이얼로그가 제안하는 기본 파일명은
  // document.title을 따른다(PDF 저장 시 이 값이 그대로 파일명이 된다). SPA라 페이지 자체를
  // 이동하지 않으므로, 인쇄 직전에만 문서 제목을 바꾸고 다이얼로그가 닫힌 뒤 원복한다.
  // window.print()는 다이얼로그가 닫힐 때까지 호출 스레드를 막으므로 이 동기 순서로 충분하다
  // (SPA 내 다른 print 진입점이 없어 전역 상태로 관리할 필요가 없다). 데스크톱 시트 하단
  // 버튼과 모바일 안내 카드 버튼이 이 하나의 핸들러를 공유한다. 파일명 규칙은 reportFileName.ts.
  const handlePdfDownload = () => {
    const originalTitle = document.title;
    document.title = buildReportFileName({
      studentName,
      diagnosedAt: data.student?.diagnosedAt ?? null,
    });
    window.print();
    document.title = originalTitle;
  };

  return (
    <main className="fd-print-area min-h-screen w-full bg-[#FBFAFA] pt-16">
      {/* 데스크톱 A4 리포트 — A4 출력물 컨셉(2026-08-20)이므로 lg(1024px) 미만에서는 렌더하지
          않는다. fd-desktop-report 훅으로 report-print.css 가 인쇄 시(뷰포트 무관) 항상
          강제 표시한다. */}
      <div className="fd-sheet-stack fd-desktop-report hidden flex-col items-center gap-10 px-4 pt-10 pb-10 lg:flex lg:gap-25 lg:px-0 lg:pt-25 lg:pb-25">
        {/* 불성실 응답 경고는 시트 **위**에 둔다 — '결과가 다를 수 있다'는 안내가 리포트 2장을
            다 읽은 뒤에 나오면 기능을 못 한다. 시트 밖인 이유는 승인된 A4 레이아웃의 첫 요소를
            밀어내지 않기 위해서다. */}
        {/* exactOptionalPropertyTypes 대응 — undefined면 키 자체를 생략(ReportSincerityBanner 미수정 범위). */}
        <ReportSincerityBanner
          {...(data.notices?.sincerityBanner !== undefined
            ? { message: data.notices.sincerityBanner }
            : {})}
        />

        <ReportPageOne data={data} totalPages={totalPages} />
        <ReportPageTwo data={data} totalPages={totalPages} />

        {/* 화면 전용 확장 영역(F-04 · F-05) — AREA_COPY 108문구·고지·긴급도가 사는 자리.
            PDF 버튼 **앞**이어야 한다: 버튼이 시트 직후에 있으면 '리포트는 여기서 끝'이라는
            종결 신호가 되어 이 섹션의 발견율이 급감한다. 3·4페이지(부록)까지 렌더할지는
            컴포넌트 내부에서 hasReportExtras()와 동일한 조건으로 다시 판정한다 —
            totalPages=2 인데 부록이 렌더되는 모순은 그래서 구조적으로 발생하지 않는다. */}
        <ReportScreenExtras data={data} totalPages={totalPages} />

        {/* PdfDownloadButton.jsx 미배정 — 결정9 스펙(253×60, r30, bg #013262)을 인라인 구현. */}
        <div className="fd-no-print">
          <button
            type="button"
            onClick={handlePdfDownload}
            className="flex h-perf-inset w-63.25 items-center justify-center rounded-[1.875rem] bg-primary px-10 py-5 text-[1.25rem] font-semibold text-white transition-colors duration-150 hover:bg-[#01427e] focus:outline-hidden focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            PDF 파일로 다운 받기
          </button>
        </div>
      </div>

      {/* 모바일 안내 카드 — A4 시트 대신 다운로드 경로만 제공한다. fd-mobile-notice 훅으로
          report-print.css 가 인쇄에서 항상 숨긴다(모바일에서 인쇄해도 A4가 나가야 한다). */}
      <div className="fd-mobile-notice flex flex-col items-center gap-6 px-6 py-20 text-center lg:hidden">
        <p className="max-w-70 text-base leading-[1.6] text-ink-sub">
          학습진단 리포트는 A4 인쇄용 문서로 제공됩니다. PDF 파일로 다운로드해
          확인해 주세요.
        </p>
        <button
          type="button"
          onClick={handlePdfDownload}
          className="flex h-perf-inset w-63.25 items-center justify-center rounded-[1.875rem] bg-primary px-10 py-5 text-[1.25rem] font-semibold text-white transition-colors duration-150 hover:bg-[#01427e] focus:outline-hidden focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          PDF 파일로 다운 받기
        </button>
      </div>
    </main>
  );
}
