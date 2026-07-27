/**
 * ConditionalTextInput
 * Figma: hsokTD6OilcNEXyCR24sn4 / 1889:8753 ("설문조사 ver2" — 목표대학/희망학과 선택입력 필드)
 *
 * 라디오 선택 결과에 따라 조건부로 노출되는 자유 입력 텍스트필드.
 * 미리보기 단계라 controlled input 상태만 유지한다 (제출 로직 없음).
 */
export default function ConditionalTextInput({ label, placeholder, value, onChange }) {
  return (
    <div className="flex w-full flex-col items-start gap-3">
      {label && (
        <p className="text-base font-medium text-[#525252]">{label}</p>
      )}
      <div className="flex h-[4.25rem] w-full items-center rounded-[1.25rem] border border-[#d7d7d7] bg-white px-5 py-3.5 transition focus-within:border-[#013262]">
        <input
          type="text"
          value={value ?? ''}
          onChange={(event) => onChange?.(event.target.value)}
          placeholder={placeholder}
          className="w-full bg-transparent text-xl font-normal text-[#525252] placeholder:text-[#d7d7d7] focus:outline-none"
        />
      </div>
    </div>
  );
}
