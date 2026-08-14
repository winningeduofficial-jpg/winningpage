import { ChevronRight } from "lucide-react";

// 재방문 이어서/새로 시작 선택 카드 — docs/수행평가-상세-명세.md §5.4 `3754:5028`.
//
// **단정** ChoiceButton ×2, 각 16.25rem×2.5rem(260×40) r0.5rem `fill #f8f7f5`
// stroke `#d9d9d9`, 라벨 0.875rem/1.125rem w500 `#525252`, 우측 1.5rem 아이콘 프레임 안
// 셰브론(원문 VECTOR 7×11 `#808080`). 버튼 간 gap 1rem(16). **두 버튼 스타일 동일 —
// primary/secondary 위계 없음**(§5.4 단정 — 시안 원본 색은 무시하고 이 단정을 따른다).
//
// 공용 `OutlineButton`을 쓰지 않는 이유는 `TopicCardList`의 재추천 버튼과 같다 —
// 실측 치수(40×260, r0.5rem, fill #f8f7f5)가 공용 프리셋과 하나도 맞지 않고, 이
// 저장소엔 tailwind-merge가 없어 겹쳐 쓰면 승자가 예측 불가다.

const CONTINUE_LABEL = "이어서 하기";
const RESTART_LABEL = "새로 시작하기";
const BUSY_LABEL = "불러오는 중…";

function ChoiceButton({ label, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex h-10 w-[16.25rem] items-center justify-between rounded-lg border border-performance-line bg-[#f8f7f5] px-4 text-[0.875rem] font-medium leading-[1.125rem] text-ink transition-colors hover:border-ink-sub disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span>{label}</span>
      <span className="flex h-6 w-6 items-center justify-center">
        <ChevronRight
          className="h-[0.6875rem] w-[0.4375rem] text-[#808080]"
          aria-hidden="true"
        />
      </span>
    </button>
  );
}

/**
 * @param {() => void} onContinue `이어서 하기`.
 * @param {() => void} onRestart `새로 시작하기`.
 * @param {boolean} [busy] `이어서 하기` 조회(§8.6 세션 상세 GET) 진행 중. 두 버튼을 함께
 *   잠근다 — `새로 시작하기`를 동시에 누르면 조회 결과 적용과 리셋이 경합할 수 있다.
 * @param {string|null} [error] 조회 실패 안내. 실패해도 이 카드는 그대로 남아 재시도할 수
 *   있다(§5.20 인라인 실패 패턴과 같은 판단 — 모달로 가리지 않는다).
 */
export default function ResumeChoiceCard({
  onContinue,
  onRestart,
  busy = false,
  error = null,
}) {
  return (
    <div className="flex flex-col gap-3 pt-1">
      <div className="flex flex-wrap gap-4">
        <ChoiceButton
          label={busy ? BUSY_LABEL : CONTINUE_LABEL}
          onClick={onContinue}
          disabled={busy}
        />
        <ChoiceButton
          label={RESTART_LABEL}
          onClick={onRestart}
          disabled={busy}
        />
      </div>
      {error && (
        <p
          role="alert"
          className="text-[0.875rem] leading-[1.125rem] text-[#d01c1c]"
        >
          {error}
        </p>
      )}
    </div>
  );
}
