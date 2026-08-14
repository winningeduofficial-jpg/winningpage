// 멘토 지원서 폼 섹션 카드 셸 — docs/mentor-apply-spec.md §6-4(섹션 카드 공통 규격) / §6-6(타이포).
//
// 폼 5개 섹션(지원자 정보 / 대학 및 합격 전형 / 출신 고등학교 / 멘토 역량 / 증빙 서류 및 동의)이
// 전부 같은 껍데기를 쓰므로 카드 + 섹션 헤더 + 구분선 + 필드 세로 간격까지를 한 컴포넌트로 묶었다.
// 필드군 세로 gap 26 을 이 안에서 책임지는 이유는 시안 섹션 1~5 가 예외 없이 26 으로 동일해서,
// 소비처마다 gap 클래스를 반복 선언하면 드리프트가 생기기 때문이다.
//
// 작성 현황 사이드바가 단계 앵커로 점프할 수 있도록 `id` 를 루트 <section> 에 붙인다(명세 §6-3).
export default function FormSectionCard({
  no, // 섹션 번호(1~5) — 제목 앞에 "N. " 로 붙는다
  title,
  subtitle,
  id, // 사이드바 앵커 타깃
  children,
}) {
  const headingId = id ? `${id}-heading` : undefined;

  return (
    // radius 16(1rem) / 그림자 없음 / bg 흰색.
    // ⚠ 4번 섹션 카드(3375:4264)의 radius·그림자는 실측이 아니라 5번 섹션 기준 추정값이다
    //    (명세 §6-10 #9 / 확인 항목 36). 5개 카드를 동일 규격으로 통일해 두었으므로 실측이
    //    나오면 이 파일 한 곳만 고치면 된다.
    // 패딩은 시안 상 38 / 우 39 / 하 42 / 좌 40 인데, 좌우 1px 비대칭은 수작업 드리프트로 보고
    // 40(2.5rem)으로 정규화했다. <md 에서는 명세 § 반응형 전략(§6 행)대로 좌우 40 → 20 축소.
    <section
      id={id}
      aria-labelledby={headingId}
      className="rounded-2xl bg-white px-5 pb-8 pt-7 md:px-10 md:pb-[2.625rem] md:pt-[2.375rem]"
    >
      {/* 섹션 헤더 — 타이틀 + gap 8 + 부제 */}
      <div className="flex flex-col gap-2">
        <h3
          id={headingId}
          className="text-xl font-semibold leading-[1.4] text-ink"
        >
          {no}. {title}
        </h3>
        {subtitle && (
          <p className="text-sm font-normal leading-[1.4] text-ink-sub">
            {subtitle}
          </p>
        )}
      </div>

      {/* 구분선(753×1) — 시안은 Line 2420 SVG 지만 명세 §6-9 #1 지시대로 border-top 으로 대체.
          헤더 ↔ 구분선 20, 구분선 ↔ 필드영역 20. */}
      <div className="mt-5 border-t border-line" aria-hidden="true" />

      {/* 필드군 세로 gap 26(1.625rem) — 섹션 1~5 전부 동일 */}
      <div className="mt-5 flex flex-col gap-[1.625rem]">{children}</div>
    </section>
  );
}
