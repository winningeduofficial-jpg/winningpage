// 잘하고 있는 부분(3) / 보완할 부분(4) 2열 리스트.
// props: { strengths, improvements } — 문자열 배열.
// R3(2026-08-11) — 2열 고정폭(30.875rem×2 ≈ 988px)은 모바일에서 세로 스택으로 바뀐다.
const InsightColumns = ({ strengths, improvements }) => {
  return (
    // fd-insight-columns — 인쇄 훅(BLOCK 수정). report-print.css 가 기존 lg: 리터럴과
    // 동일한 값으로 강제한다.
    <div className="fd-insight-columns mt-10 grid grid-cols-1 gap-8 lg:mt-[4.5rem] lg:grid-cols-[30.875rem_30.875rem] lg:gap-x-4 lg:gap-y-0">
      <div>
        <h3 className="text-[1.25rem] font-semibold leading-[1.25rem] text-[#0b84fd]">
          잘하고 있는 부분
        </h3>
        <ul className="mt-[1.375rem] flex flex-col gap-3 list-disc ps-[1.78125rem]">
          {strengths.map((item, index) => (
            <li
              // biome-ignore lint/suspicious/noArrayIndexKey: 리포트 생성 시 매번 새로 만들어지는 문자열 목록 — id 없고 재정렬 없음.
              key={index}
              className="text-[1.1875rem] font-normal leading-[1.3] text-[#808080]"
            >
              {item}
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="text-[1.25rem] font-semibold leading-[1.25rem] text-[#0b84fd]">
          보완할 부분
        </h3>
        <ul className="mt-[1.375rem] flex flex-col gap-3 list-disc ps-[1.78125rem]">
          {improvements.map((item, index) => (
            <li
              // biome-ignore lint/suspicious/noArrayIndexKey: 리포트 생성 시 매번 새로 만들어지는 문자열 목록 — id 없고 재정렬 없음.
              key={index}
              className="text-[1.1875rem] font-normal leading-[1.3] text-[#808080]"
            >
              {item}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default InsightColumns;
