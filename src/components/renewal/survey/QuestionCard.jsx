/**
 * QuestionCard
 * Figma: hsokTD6OilcNEXyCR24sn4 / 1889:13222 ("설문조사 선택한 상태")
 *
 * 번호 원형 배지 + 카테고리 라벨 + 질문 타이틀 + 보조문구를 감싸는 카드 셸.
 * 실제 선택 UI(OptionGroup 등)는 children으로 전달한다.
 */
export default function QuestionCard({ number, category, title, helper, children }) {
  return (
    <div className="flex w-full flex-col items-start gap-3 rounded-[1.75rem] bg-white px-6 py-8 sm:rounded-[2.5rem] sm:px-10 sm:py-10 lg:px-[3.75rem]">
      <div className="flex w-full flex-col gap-5">
        <div className="flex w-full flex-col gap-3">
          <div className="flex items-center gap-5">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[#d7d7d7] text-xl font-medium text-[#808080]">
              {number}
            </span>
            {category && <p className="text-base font-medium text-[#d7d7d7]">{category}</p>}
          </div>

          <div className="flex flex-col gap-1">
            <h3 className="break-keep text-xl font-medium leading-snug text-[#525252] sm:text-2xl">
              {title}
            </h3>
            {helper && <p className="break-keep text-base font-medium text-[#d7d7d7]">{helper}</p>}
          </div>
        </div>

        {children}
      </div>
    </div>
  );
}
