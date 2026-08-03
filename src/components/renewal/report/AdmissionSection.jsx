// 목표 대학 입결 비교 — 합격 가능성 22% 단일 수치 + 요약문 + 캡션 + 입결 표.
// 결정7: 밴드 UI 없음(HTML 목업 5구간 밴드 미채택), 결정3: 표 2행 라벨 "70% 컷".
// props: { admission } = { probabilityLabel, probabilityValue, summary, caption, rows } — data.admission.
const AdmissionSection = ({ admission }) => {
  const { probabilityLabel, probabilityValue, summary, caption, rows } = admission;

  return (
    <section className="mt-[4.0625rem]">
      <h2 className="text-[1.25rem] font-semibold leading-[1.25rem] text-[#0b84fd]">
        목표 대학 입결 비교
      </h2>

      <div className="mt-[0.875rem] flex items-center gap-3">
        <span className="text-[1.1875rem] font-medium text-[#525252]">{probabilityLabel}</span>
        <span className="text-[1.25rem] font-medium text-[#013262]">{probabilityValue}</span>
      </div>

      <p className="mt-[0.875rem] w-[30.625rem] text-base leading-[1.3] text-[#0f172a]">
        {summary}
      </p>

      <p className="mt-[0.875rem] text-base leading-[1.3] text-[#808080]">{caption}</p>

      <div className="mt-[0.875rem] h-[11.8125rem] w-[31.875rem] rounded-[0.75rem] border border-[#d9d9d9] px-[0.8125rem] py-[0.6875rem]">
        <div className="flex flex-col gap-[0.9375rem]">
          <div className="grid h-[1.3125rem] grid-cols-[10rem_1fr_1fr] items-center text-base font-medium leading-[1.3] text-[#808080]">
            <span>구분</span>
            <span className="text-right">등급</span>
            <span className="text-right">내 성적과의 차이</span>
          </div>

          {rows.map((row) => (
            <div
              key={row.label}
              className={`grid h-[1.3125rem] grid-cols-[10rem_1fr_1fr] items-center text-base leading-[1.3] ${
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
