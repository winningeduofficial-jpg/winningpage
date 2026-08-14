// 리포트 블록용 CSS 서피스 — docs/수행평가-상세-명세.md §6.1 컴포넌트 표
// (`PerformanceReportSurface` / props `children` / 「`AdmissionSurface`의 admission-* 스타일
// 대체(§6.2)」) / §5.13 실측 / §7.2 타이포.
//
// ── 왜 `AdmissionSurface`를 쓰지 않는가 (명세 단정, 판단 대상 아님)
// §6.2·§8.5: 「`AdmissionSurface.jsx:75-92`가 주입하는 CSS(`admission-text-line` = 흰 배경 +
// `#d7d7d7` 1px 보더 + 13.5px + `font-weight:800` 등)가 시안 스펙(라벨 1rem w600 `#1b5da0`,
// 본문 1rem w500 `#808080`, **무테**)과 전면 충돌 → `PerformanceReportSurface` 신설」.
// 즉 재사용 대상은 **렌더러(`renderBlock` + 블록 뷰)까지**이고 스타일 서피스는 아니다.
//
// ── `AdmissionSurface`와의 구조적 차이 3가지
//   ① **래핑한다.** `AdmissionSurface`는 `<style>` 태그만 렌더하고 호출부의 기존 div에
//      `admission-surface` 클래스를 병합하라고 요구한다(그쪽은 이미 ref·스크롤·레이아웃
//      클래스를 가진 div가 있었기 때문). 여기 §6.1 표는 `children`을 prop으로 명시하므로
//      래퍼 div를 이 컴포넌트가 소유한다.
//   ② **스코프가 있다.** `AdmissionSurface`의 규칙 상당수가 `.admission-text-line`처럼
//      전역 (0,1,0)이라, 두 서피스가 한 문서에 공존하면 나중에 마운트된 쪽이 이긴다.
//      여기 규칙은 전부 `.performance-report-surface` 하위로 (0,2,0) 이상이라 admission
//      CSS가 같은 문서에 있어도 항상 이긴다(현재 두 화면은 라우트가 갈려 공존하지 않지만,
//      "우연히 공존하지 않아서 안전"한 상태로 두지 않는다).
//   ③ **표(table) 규칙이 없다.** 설계·평가 리포트 블록에 `table`/`rawHtml`이 나오지
//      않는다(`design-report.js buildSections` 전수 — keyValue/plainList/group뿐).
//      쓰지 않는 400여 줄을 복사해 오지 않는다.
//
// ── 색 결정과 대비(모두 흰 배경 #ffffff 기준, WCAG AA 4.5:1)
//   섹션 라벨 `#1b5da0`(performance-reportHeading) 6.73:1 — 라벨은 `SectionedReportView`가
//     Tailwind로 칠하므로 여기서 다시 칠하지 않는다.
//   본문/값  `#6b6b6b`(ink-sub 토큰) 5.33:1. **시안 원본은 `#808080`(3.95:1, AA 미달)이고
//     저장소가 이미 `ink-sub`를 `#6b6b6b`로 상향해 둔 상태다**(tailwind.config.js `ink.sub`
//     주석) — 시안 리터럴이 아니라 그 상향된 토큰값을 따른다.
//   행 라벨(`<b>`) `#525252`가 아니라 **본문색 그대로 + weight 600**. 시안 §5.13 본문은
//     라벨·값 구분 없이 한 색(`#808080`)이고, §7.2 표에도 "리포트 섹션 본문" 한 행뿐이라
//     별도 색을 만들 근거가 없다. 굵기만으로 구분한다.
//   group 제목(`자료 1`, `서론 구성 방향`) `#525252`(ink) 7.82:1 — 섹션 라벨(파랑)과 본문
//     사이의 3단계 위계를 만드는 유일한 자리다. §5.13에 이 중간 위계의 색 실측이 없어
//     본문 토큰 중 가장 진한 `ink`를 썼다(제안 — 시안 미실측).
//   링크 `#1b5da0` 6.73:1 + `underline`. `accent`(#0b84fd)는 흰 배경 3.66:1로 AA 미달이라
//     쓰지 않았다. 밑줄을 함께 두어 색에만 의존하지 않는다(WCAG 1.4.1).
//
// ── 행 라벨 뒤 콜론을 CSS로 붙이는 이유
// §5.13 「본문 내부 하위 구조 (단정 — 원문 키)」의 키는 전부 `주제명:`처럼 콜론으로 끝나는데,
// 서버 라벨 상수(`prompts.js DESIGN_SECTION_ROW_LABELS`)는 원문 프롬프트의 하위 키 줄과
// 바이트 동일하게 유지하느라 콜론이 없다(`{ key:'topic_name', label:'주제명' }`). 그리고
// `작성 구조 설계` 섹션의 행 라벨은 아예 모델 산출물이라 콜론 유무를 서버가 보장할 수 없다.
// 표시 규약(콜론)을 데이터에 섞지 않고 이 서피스가 붙인다 — 같은 블록을 다른 서피스에서
// 다르게 표시할 수 있고, 프롬프트 원문 이식 규칙(§12.1)도 건드리지 않는다.
//
// ── 인쇄(§10.2 P10 「PDF/인쇄(`@media print`)」) — 여기가 담당하는 범위
// 이 파일은 **리포트 본문의 인쇄 룩**만 갖는다(색 정규화, 페이지 넘김 회피 단위, 링크).
// 딤·푸터·앱 셸을 걷는 **크롬 쪽 인쇄 규칙은 `DesignReportModal`이 갖는다** — 저장소에
// 선례가 없어(`@media print` 전수 검색 0건) 이 두 파일이 관례를 만든다: **인쇄 규칙은 그
// 요소를 렌더하는 컴포넌트가 소유한다.**
//
// 페이지 넘김 단위를 **섹션이 아니라 블록**에 건다. `작성 구조 설계`는 시안 실측만 932px
// (약 A4 본문 1페이지)이라 섹션 통째로 `break-inside: avoid`를 걸면 한 페이지에 못 들어가
// 규칙이 무시되거나 앞 페이지가 통째로 비는 대신 잘림은 그대로 남는다. 실제로 반으로
// 갈리면 곤란한 최소 단위는 ⓐ 자료 카드 1장(`admission-special-block`) ⓑ 키-값 1행
// (`admission-text-line`) ⓒ 목록 항목 1개다. 섹션 라벨은 `break-after: avoid`로 본문과
// 붙여 둔다(라벨만 페이지 끝에 남는 고아 방지).
import type { ReactNode } from "react";

type PerformanceReportSurfaceProps = {
  /** 블록 뷰(`renderBlock`) 출력 또는 그것을 감싼 `SectionedReportView`. */
  children?: ReactNode;
  /** 래퍼에 추가할 클래스. */
  className?: string;
};

export default function PerformanceReportSurface({
  children,
  className = "",
}: PerformanceReportSurfaceProps) {
  return (
    <div
      className={["performance-report-surface", className]
        .filter(Boolean)
        .join(" ")}
    >
      <style>{`
        /* ── 블록 공통 컨테이너 (§5.13 섹션 내부 gap 0.5rem) */
        .performance-report-surface .admission-readable-body { display: grid; gap: 0.5rem; }

        /* ── 키-값 행 / 평문 줄. 무테·무배경이 요점이다(admission은 흰 카드 + 보더). */
        .performance-report-surface .admission-text-line {
          margin: 0;
          border: 0;
          border-radius: 0;
          padding: 0;
          background: transparent;
          color: #6b6b6b;
          font-size: 1rem;
          line-height: 1.3125rem;
          font-weight: 500;
          word-break: keep-all;
          /* 긴 무공백 문자열(출처 URL)이 모달 본문에 가로 스크롤을 만들지 않게 한다. */
          overflow-wrap: anywhere;
        }
        .performance-report-surface .admission-text-line b { font-weight: 600; }
        /* 표시 규약 — 상단 「행 라벨 뒤 콜론」 주석 참고. */
        .performance-report-surface .admission-text-line b::after { content: ':'; }

        /* ── group(자료 카드 / 작성 단계). 카드가 아니라 소제목 + 들여쓰기 없는 묶음이다. */
        .performance-report-surface .admission-special-block {
          display: grid;
          gap: 0.5rem;
          margin: 0;
          border: 0;
          padding: 0;
          background: transparent;
        }
        /* 형제 블록 사이 간격은 여기서 만들지 않는다 — 섹션 내부 최상위 블록의 gap은
           SectionedReportView의 블록 래퍼(flex flex-col gap-2)가 소유한다(§5.13
           「섹션 내부 gap 0.5rem」). 초판은 group끼리만 margin-top 1rem으로 벌렸는데,
           그러면 keyValue↔group 이음매가 0px로 남아 '수행평가 전체 방향' 섹션만 세 덩어리가
           붙어 보였다. 한 곳에서 한 값으로 통일한다. */
        .performance-report-surface .admission-special-title {
          color: #525252;
          font-size: 1rem;
          line-height: 1.3125rem;
          font-weight: 600;
          word-break: keep-all;
        }

        /* ── 목록. 마커를 살리되 항목 자체는 본문과 같은 무테 평문이다. */
        .performance-report-surface .admission-bullet-list {
          margin: 0;
          padding: 0 0 0 1.25rem;
          display: grid;
          gap: 0.5rem;
          list-style: disc;
        }
        .performance-report-surface .admission-ordered-list { list-style: decimal; }
        .performance-report-surface .admission-bullet-list li {
          margin: 0;
          border: 0;
          border-radius: 0;
          padding: 0;
          background: transparent;
          color: #6b6b6b;
          font-size: 1rem;
          line-height: 1.3125rem;
          font-weight: 500;
          word-break: keep-all;
          overflow-wrap: anywhere;
        }
        .performance-report-surface .admission-bullet-list li::marker { color: #6b6b6b; }

        /* ── 출처 링크(KeyValueView의 href 확장). 색 + 밑줄 이중 표시. */
        .performance-report-surface .admission-inline-link {
          color: #1b5da0;
          text-decoration: underline;
          text-underline-offset: 0.125rem;
        }
        .performance-report-surface .admission-inline-link:hover { color: #013262; }
        .performance-report-surface .admission-inline-link:focus-visible {
          outline: 2px solid #0b84fd;
          outline-offset: 2px;
          border-radius: 0.125rem;
        }

        @media print {
          /* 화면 대비용으로 낮춘 회색은 인쇄에서 더 흐려진다 — 잉크 기준으로 되돌린다. */
          .performance-report-surface .admission-text-line,
          .performance-report-surface .admission-bullet-list li { color: #333333; }
          .performance-report-surface .admission-special-title { color: #111111; }
          /* 링크는 본문 색으로 인쇄한다. URL을 ::after로 덧붙이지 않는 이유 —
             이 리포트에서 href를 가진 유일한 행이 '출처 링크'이고 그 행의 **보이는 텍스트가
             이미 URL 자체**다(design-report.js kvRow(labelOf('link'), resource.link,
             resource.link)). attr(href)를 덧붙이면 종이에 같은 URL이 두 번 찍힌다.
             텍스트 ≠ URL인 링크를 만드는 생성 경로가 생기면 그때 그 경로 쪽에서 표시용
             텍스트를 함께 내려주는 편이 낫다(CSS는 둘이 같은지 비교할 수 없다). */
          .performance-report-surface .admission-inline-link {
            color: #333333;
            text-decoration: underline;
          }
          /* 페이지 넘김에서 반으로 갈리면 곤란한 최소 단위 — 상단 주석 참고. */
          .performance-report-surface .admission-special-block,
          .performance-report-surface .admission-text-line,
          .performance-report-surface .admission-bullet-list li {
            break-inside: avoid;
            page-break-inside: avoid;
          }
          .performance-report-surface h3 {
            break-after: avoid;
            page-break-after: avoid;
          }
        }
      `}</style>
      {children}
    </div>
  );
}
