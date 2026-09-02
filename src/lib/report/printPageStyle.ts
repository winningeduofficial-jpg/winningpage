// react-to-print(iframe 격리) 공용 베이스 인쇄 스타일 — 수행평가 리포트 모달
// (`ReportModalShell.tsx`)에서 처음 확립된 규칙을 목표관리 성장 리포트 페이지(QA 행319,
// `GrowthReportBody.tsx`)가 이어받으며 공용으로 뽑았다. 두 화면이 공유하는 것은 딱 이
// 두 줄뿐이다 — `@page` 여백과 인쇄 시 배경색 보존(`print-color-adjust: exact`, 기본
// `useReactToPrint`의 기본 pageStyle을 이 문자열이 완전히 대체하므로 여기서 다시
// 선언해야 한다). 그 외(모달 크롬을 문서 흐름으로 푸는 규칙, 페이지 안쪽 콘텐츠를
// 숨기는 규칙 등)는 호출부마다 다르므로 각자 이 문자열 뒤에 자기 규칙을 이어붙인다.
export const REPORT_PRINT_PAGE_BASE_STYLE = `
  @page { margin: 15mm; }
  @media print {
    body {
      color-adjust: exact;
      print-color-adjust: exact;
      -webkit-print-color-adjust: exact;
    }
  }
`;
