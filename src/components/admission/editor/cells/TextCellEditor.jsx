import ImeSafeInput from '../ImeSafeInput';

// 일반 문자열 셀 편집기.
export default function TextCellEditor({ value, onChange }) {
  const text = typeof value === 'string' ? value : (value?.text ?? '');

  return (
    <ImeSafeInput
      type="text"
      value={text}
      onCommit={onChange}
      // 2026-08-06: 평상시엔 공개 표의 일반 텍스트처럼 보이게 테두리·배경을
      // 투명하게 두고, hover/focus에서만 드러낸다("클릭하면 그 자리에서
      // 고쳐진다"를 뷰/편집 모드 전환 없이 인라인 input만으로 만족 — 모드
      // 전환 상태를 새로 만들지 말라는 팀 결정 반영).
      className="admission-cell-editor-input w-full border border-transparent bg-transparent px-2 py-1.5 text-sm outline-none transition-colors hover:border-[#d7d7d7] hover:bg-white focus:border-[#2348ff] focus:bg-white"
    />
  );
}
