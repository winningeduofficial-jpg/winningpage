import { Plus } from 'lucide-react';

// 사진 추가 타일(빈 슬롯) — docs/수행평가-상세-명세.md §5.6(`3754:3261`) 실측.
//
//   타일    90×100(5.625rem×6.25rem) r8(0.5rem) stroke `#d9d9d9`(= `performance-line`)
//   + 아이콘 VECTOR 13×13 `#d9d9d9` @519,839(타일 기준 위쪽 중앙)
//   라벨    `사진 추가` 0.875rem w500 `#d9d9d9` @505,867
//
// 아이콘·라벨 색이 흰 배경 대비 미달이라는 것은 §11.3 Q31이 이미 기록한 시안 자체의
// 문제다(placeholder `#d9d9d9`). 임의로 톤을 올리지 않고 시안 값을 그대로 쓴다 —
// 대신 버튼의 접근 이름은 색과 무관하게 읽히도록 텍스트로 보장한다.
//
// **파일 입력은 이 컴포넌트가 갖지 않는다.** `<input type="file">`은 카드
// (`GuideUploadCard`)가 하나만 두고 이 타일은 그걸 여는 버튼일 뿐이다 — 타일마다
// input을 만들면 accept/멀티 선택 규칙이 여러 벌로 갈라진다.
/**
 * @param {() => void} onClick 파일 선택기 열기
 * @param {boolean} [disabled] 5장을 이미 채웠을 때 등
 */
export default function PhotoAddTile({ onClick, disabled = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex h-[6.25rem] w-[5.625rem] shrink-0 flex-col items-center justify-center gap-1 rounded-lg border border-performance-line bg-white transition ${
        disabled
          ? 'cursor-not-allowed opacity-50'
          : 'hover:bg-performance-bubble active:scale-[0.97] motion-reduce:active:scale-100'
      }`}
    >
      <Plus
        className="h-[0.8125rem] w-[0.8125rem] text-performance-line"
        strokeWidth={2}
        aria-hidden="true"
      />
      <span className="text-[0.875rem] font-medium leading-[1.125rem] text-performance-line">
        사진 추가
      </span>
    </button>
  );
}
