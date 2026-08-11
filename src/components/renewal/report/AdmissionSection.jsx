// 목표 대학 입결 비교 — 합격 가능성 22% 단일 수치 + 요약문 + 캡션 + 입결 표.
// 결정7: 밴드 UI 없음(HTML 목업 5구간 밴드 미채택), 결정3: 표 2행 라벨 "70% 컷".
// props: { admission } = { probabilityLabel, probabilityValue, summary, caption, rows } — data.admission.
// R3(2026-08-11) — 표 라벨 열("50% 컷(합격자 중위)" 류)은 고정 10rem 에서 모바일 320px대에
// 줄바꿈되면 h-[1.3125rem] 고정 행 높이가 텍스트를 잘라낸다. 라벨 열을 auto, 행 높이를
// min-h + items-start 로 바꿔 실제 줄 수만큼 늘어나게 한다(가로 스크롤 없이 세로로 흡수).
const AdmissionSection = ({ admission }) => {
  const { probabilityLabel, probabilityValue, summary, caption, rows } = admission;

  // R4(2026-08-11) — fd-admission-* 훅: 인쇄(794px, lg: 미적용)에서 report-print.css 가
  // 기존 lg: 리터럴과 동일한 rem 값으로 되돌린다(BLOCK 수정, ReportSheetA4 주석 참고).
  return (
    <section className="fd-admission-section mt-10 lg:mt-[4.0625rem]">
      <h2 className="text-[1.25rem] font-semibold leading-[1.25rem] text-[#0b84fd]">
        목표 대학 입결 비교
      </h2>

      <div className="mt-[0.875rem] flex items-center gap-3">
        <span className="text-[1.1875rem] font-medium text-[#525252]">{probabilityLabel}</span>
        <span className="text-[1.25rem] font-medium text-[#013262]">{probabilityValue}</span>
      </div>

      <p className="fd-admission-summary mt-[0.875rem] w-full text-base leading-[1.3] text-[#0f172a] lg:w-[30.625rem]">
        {summary}
      </p>

      <p className="mt-[0.875rem] text-base leading-[1.3] text-[#808080]">{caption}</p>

      <div className="fd-admission-box mt-[0.875rem] w-full rounded-[0.75rem] border border-[#d9d9d9] px-[0.8125rem] py-[0.6875rem] lg:w-[31.875rem]">
        <div className="fd-admission-rows flex flex-col gap-3 lg:gap-[0.9375rem]">
          <div className="fd-admission-grid grid grid-cols-[auto_1fr_1fr] items-center gap-x-2 break-keep text-base font-medium leading-[1.3] text-[#808080] lg:grid-cols-[10rem_1fr_1fr]">
            <span>구분</span>
            <span className="text-right">등급</span>
            <span className="text-right">내 성적과의 차이</span>
          </div>

          {rows.map((row) => (
            <div
              key={row.label}
              // break-keep — 모바일 좁은 값 칸에서 "부족"이 "부"/"족"으로 음절 단위로 쪼개지는
              // 기본 한글 줄바꿈(word-break: normal)을 막는다(실측). 데스크톱은 폭이 넓어 원래도
              // 줄바꿈이 나지 않던 자리라 시각적 차이가 없다.
              className={`fd-admission-grid grid grid-cols-[auto_1fr_1fr] items-start gap-x-2 break-keep text-base leading-[1.3] lg:grid-cols-[10rem_1fr_1fr] lg:items-center ${
                row.emphasis ? 'font-semibold text-[#0b84fd]' : 'font-medium text-[#808080]'
              }`}
            >
              <span>{row.label}</span>
              <span className="text-right">{row.grade}</span>
              <span className="text-right">{row.gap}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default AdmissionSection;
