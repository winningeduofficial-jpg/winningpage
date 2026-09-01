// 리포트 PDF 파일명(QA 행354) — `{주제명}_{학생이름}_{리포트이름}`.
//
// `useReactToPrint`의 `documentTitle`이 인쇄 다이얼로그 "PDF로 저장"의 기본 파일명이 된다
// (`ReportModalShell.tsx`). 옵션을 주지 않으면 브라우저가 인쇄 iframe의 `document.title`을
// 그대로 쓰는데, 그 iframe은 앱 전체를 복제하지 않아 `document.title`이 사이트 기본값
// "위닝에듀"로 떨어진다 — 그래서 문서 그대로 PDF 이름이 "위닝에듀"가 됐다.
//
// `src/pages/renewal/reportFileName.ts`(학습진단)를 그대로 가져다 쓰지 않는다 — 그쪽은
// 요구 형식이 `{접두사}_{이름}학생_{날짜}`로 조각 구성이 다르고 도메인 상수(접두사·날짜
// 포맷)까지 섞여 있어, 재사용하면 그 상수들을 이 도메인으로 새로 의미 부여해야 한다.
// 여기 필요한 것은 "값 3개를 안전하게 밑줄로 잇는다"는 훨씬 작은 규칙뿐이라 별도 파일로
// 둔다.
//
// 값이 비어 있으면(주제 미확정·학생 이름 미배선) 그 조각만 건너뛴다 — 가짜 값으로
// 메우지 않는다(학습진단 유틸과 같은 원칙). 리포트이름은 호출부가 항상 상수로 주므로
// (`"구성설계리포트"`/`"평가리포트"`) 비는 경우가 없다.

// 파일 시스템에서 문제를 일으키는 문자(Windows 예약 문자 + 공백류 남용) — 밑줄로 치환한다.
const UNSAFE_FILENAME_CHARS_RE = /[\\/:*?"<>|]+/g;

function sanitizeFileNamePart(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .replace(UNSAFE_FILENAME_CHARS_RE, "_");
}

export function buildPerformanceReportFileName(input: {
  topicTitle?: string | null | undefined;
  studentName?: string | null | undefined;
  reportName: string;
}): string {
  const parts = [
    sanitizeFileNamePart(input.topicTitle),
    sanitizeFileNamePart(input.studentName),
    sanitizeFileNamePart(input.reportName),
  ].filter(Boolean);

  return parts.join("_");
}
