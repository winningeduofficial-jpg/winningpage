import type { ReactNode } from "react";

/**
 * 리포트 섹션 위계 공용 컴포넌트(2026-08-21, 사용자 지시 — 스크린샷 근거).
 *
 * 감사 근거(화면 lg 실측, 시트1~4 h2/h3 전수 — 완료 보고 표 참고): 제목 타이포는
 * text-[1.25rem] font-semibold text-accent 로 이미 만장일치였다(부록 최상단 H2
 * "영역별 상세 진단과 맞춤 전략"만 문서 제목 격이라 더 크고 text-primary — 이 컴포넌트
 * 적용 대상이 아니다). 갈라진 건 두 곳: ① line-height(leading-5 20px 다수 vs
 * leading-[1.4] 28px 소수, 부록 소제목 3곳) ② 제목→콘텐츠 간격(14~32px 제각각, mt-4가
 * 가장 흔한 단일값). 이 컴포넌트가 그 둘을 하나로 고정한다.
 *
 * 섹션 상단 마진(이 섹션이 시작되는 위치)은 배치 컨텍스트마다 실제로 다를 수 있어
 * className prop(호출부 소유)으로 남긴다 — 다만 감사 결과 기본값도 통일할 여지가 있어
 * (ReadinessOverview·AdmissionSection이 이미 mt-12로 그리드 정렬 맞춰 둔 상태) 이번
 * 적용에서 전 호출부가 lg: 분기 없는 mt-12 하나로 실제로 통일됐다(완료 보고 참고) —
 * 이 컴포넌트가 강제하지는 않는다, className을 비우면 여백 없이 시작한다.
 *
 * as prop — 문서 구조(h2/h3)는 그대로 보존한다: 시트 최상위 섹션은 h2, 2단·다단 그리드
 * 안에서 병렬로 오는 하위 섹션(잘하고/보완할, 부록 블록 A·B·D)은 h3.
 *
 * 카드/블록 소제목(2026-08-31, QA 행244) — 이 컴포넌트가 다루는 섹션 제목(h2/h3, 1.25rem
 * text-accent) 한 단 아래에 필드 라벨 격 소제목이 하나 더 있다: "종합점수"(ReadinessOverview)·
 * 확률 라벨(AdmissionSection)·카드 라벨(SummaryCards)·추천 서비스명(RecommendServices h3) —
 * 전부 text-[1.1875rem] font-medium text-ink로 색·굵기·크기는 이미 일치했고 line-height만
 * SummaryCards(leading-5)와 나머지 3곳(미지정)이 갈려 있었다. 나머지 3곳에도 leading-5를
 * 맞춰 이 컴포넌트와 같은 2단 스케일(섹션 제목 / 카드·블록 소제목)로 정리했다. 옆에 붙는
 * 값 표시(1.25rem text-primary, 예: "82%")는 소제목이 아니라 데이터 값이라 대상이 아니고,
 * ReportPageOne 헤드라인(fd-headline, 인쇄 CSS 고정폭)과 부록 최상단 H2(ReportScreenExtras,
 * text-primary)는 위에서부터 문서 제목 격으로 이미 제외돼 있어 그대로 둔다.
 */
type ReportSectionProps = {
  title: ReactNode;
  children?: ReactNode;
  /** 섹션 상단 마진 등 호출부 배치 클래스. 예: "mt-12" */
  className?: string;
  as?: "h2" | "h3";
};

export default function ReportSection({
  title,
  children,
  className = "",
  as: Heading = "h2",
}: ReportSectionProps) {
  return (
    <section className={className}>
      <Heading className="text-[1.25rem] font-semibold leading-5 text-accent">
        {title}
      </Heading>
      <div className="mt-4">{children}</div>
    </section>
  );
}
