import { Plus } from "lucide-react";

// 사진 추가 타일(빈 슬롯) — docs/수행평가-상세-명세.md §5.6(`3754:3261`) 실측.
//
//   타일    90×100(5.625rem×6.25rem) r8(0.5rem) stroke `#d9d9d9`(= `performance-line`)
//   + 아이콘 VECTOR 13×13 `#d9d9d9` @519,839(타일 기준 위쪽 중앙)
//   라벨    `사진 추가` 0.875rem w500 `#d9d9d9` @505,867
//
// 아이콘·라벨 색이 흰 배경 대비 미달이라는 것은 §11.3 Q31이 이미 기록한 시안 자체의
// 문제다(placeholder `#d9d9d9`, 흰 배경 대비 1.41:1). 라벨은 WCAG AA(4.5:1)를 시안
// 의도보다 우선해 `ink-sub`(#6b6b6b, 흰 배경 5.33:1)로 상향했다 — 새 토큰을 만들지
// 않고 기존 보조 텍스트 토큰을 재사용한다. 아이콘(`Plus`)은 `aria-hidden`이고 옆
// 라벨이 접근 이름을 이미 보장하므로 대비 요건 대상이 아니라 시안 값을 유지한다.
//
// **파일 입력은 이 컴포넌트가 갖지 않는다.** `<input type="file">`은 카드
// (`GuideUploadCard`)가 하나만 두고 이 타일은 그걸 여는 버튼일 뿐이다 — 타일마다
// input을 만들면 accept/멀티 선택 규칙이 여러 벌로 갈라진다.
type PhotoAddTileProps = {
  /** 파일 선택기 열기 */
  onClick?: () => void;
  /** 5장을 이미 채웠을 때 등 */
  disabled?: boolean;
};

export default function PhotoAddTile({
  onClick,
  disabled = false,
}: PhotoAddTileProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex h-25 w-22.5 shrink-0 flex-col items-center justify-center gap-1 rounded-lg border border-performance-line bg-white transition ${
        disabled
          ? "cursor-not-allowed opacity-50"
          : "hover:bg-performance-bubble active:scale-[0.97] motion-reduce:active:scale-100"
      }`}
    >
      <Plus
        className="h-3.25 w-3.25 text-performance-line"
        strokeWidth={2}
        aria-hidden="true"
      />
      <span className="text-[0.875rem] font-medium leading-4.5 text-ink-sub">
        사진 추가
      </span>
    </button>
  );
}
