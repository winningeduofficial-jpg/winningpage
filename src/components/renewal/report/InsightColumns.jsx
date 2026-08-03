// 잘하고 있는 부분(3) / 보완할 부분(4) 2열 리스트.
// props: { strengths, improvements } — 문자열 배열.
const InsightColumns = ({ strengths, improvements }) => {
  return (
    <div className="mt-[4.5rem] grid grid-cols-[30.875rem_30.875rem] gap-x-4">
      <div>
        <h3 className="text-[1.25rem] font-semibold leading-[1.25rem] text-[#0b84fd]">
          잘하고 있는 부분
        </h3>
        <ul className="mt-[1.375rem] flex flex-col gap-3 list-disc ps-[1.78125rem]">
          {strengths.map((item, index) => (
            <li key={index} className="text-[1.1875rem] font-normal leading-[1.3] text-[#808080]">
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
            <li key={index} className="text-[1.1875rem] font-normal leading-[1.3] text-[#808080]">
              {item}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default InsightColumns;
