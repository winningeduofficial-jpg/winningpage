import { useId } from 'react';

// STEP5 평가 후 분기 3버튼 — docs/수행평가-상세-명세.md §5.17(`3754:4349` 실측) /
// §12.2 「평가 후 3분기 확정 의미론」(동작 정본).
//
// ── 실측 (§5.17)
//   선택지 스택 16.25rem×11.25rem(260×180) VERTICAL gap 0.75rem(12)
//     = 3.25rem×3 + 0.75rem×2 = 11.25rem. 버튼 각 16.25rem×3.25rem(260×52) r0.75rem.
//   `추가 평가 받기` / `이대로 확정짓기`  secondary — stroke `#d9d9d9`, 1rem w500 `#808080`
//   `추가 수행평가 진행하기`              primary   — `fill #013262`(§11.1 Q5 결정. 시안
//                                          원본 `#37352f`가 아니다), 1rem w600 `#ffffff`
//   라벨 색 `#808080`은 저장소 토큰 `ink-sub`(#6b6b6b)로 렌더한다 — 시안 리터럴은 흰 배경
//   3.95:1로 WCAG AA 미달이고 저장소가 이미 상향해 둔 값이다(tailwind.config.js `ink.sub`).
//
// ── 동작 (§12.2 L2372 정본 — 시안이 말해주지 않는 제품 규칙)
//   「'확정짓기'와 '추가 수행평가 진행하기' **둘 다** 마지막 제출본을 최종본으로 확정
//     저장하고, '추가 평가 받기'만 확정 없이 폼을 복원한다」
//   · `추가 평가 받기`         → 서버 호출 없음. 프론트가 제출폼을 복원한다.
//   · `이대로 확정짓기`        → `POST /api/performance/finalize` `action:'confirm'`
//   · `추가 수행평가 진행하기` → 같은 엔드포인트 `action:'new_assessment'` (+ 새 세션)
//
// ── **위계 의문 — 시안대로 구현했다** (§5.17 단정 / §11-Q16)
// 「흐름상 주 액션은 `이대로 확정짓기`로 보이는데 primary는 `추가 수행평가 진행하기`다.」
// Q16은 미결이고 외부 앱은 셋 다 같은 스타일이라(`index.html:2501-2503`) 정할 근거가 없다.
// **임의로 뒤집지 않고 시안 실측 그대로 둔다** — 이 주석이 그 사실의 기록이다. Q16이
// 닫히면 바꿀 곳은 이 파일의 클래스 두 줄뿐이다.
//
// ── 결과 고지 문구를 스택 **아래**에 한 줄 둔다 (제안 — 시안 없음)
// `추가 수행평가 진행하기`라는 라벨은 "지금 제출본이 최종본으로 확정된다"는 사실을 전혀
// 말하지 않는데 §12.2는 그것을 확정 동작으로 규정한다. 확인 다이얼로그는 §5.17에 없으므로
// 발명하지 않고(그리고 Q67 결정대로 확정 뒤에도 재평가가 열려 있어 되돌릴 수 없는 파괴적
// 액션이 아니다), 대신 **결과를 미리 알리는 한 줄**을 둔다. 실측 스택(260×180) 바깥의
// 형제라 시안 치수를 건드리지 않으며, 두 확정 버튼의 `aria-describedby` 대상이기도 하다.

const REEVALUATE_LABEL = '추가 평가 받기';
const CONFIRM_LABEL = '이대로 확정짓기';
const NEW_ASSESSMENT_LABEL = '추가 수행평가 진행하기';

/** 제안 — 위 「결과 고지 문구」 주석 참고. */
const FINALIZE_NOTICE = `‘${CONFIRM_LABEL}’과 ‘${NEW_ASSESSMENT_LABEL}’는 지금 제출본을 최종본으로 저장합니다.`;

const BUTTON_BASE =
  'flex h-[3.25rem] w-[16.25rem] min-w-0 max-w-full items-center justify-center rounded-xl px-2 text-center transition active:scale-[0.97] motion-reduce:active:scale-100 disabled:cursor-not-allowed disabled:active:scale-100';
const SECONDARY =
  `${BUTTON_BASE} border border-performance-line bg-white text-[1rem] font-medium leading-[1.25rem] text-ink-sub hover:bg-performance-bubble disabled:opacity-60 disabled:hover:bg-white`;
const PRIMARY =
  `${BUTTON_BASE} bg-primary text-[1rem] font-semibold leading-[1.25rem] text-white hover:bg-primary/90 disabled:bg-performance-line disabled:hover:bg-performance-line`;

/**
 * @param {() => void} onReevaluate `추가 평가 받기` — 확정 없이 폼 복원.
 * @param {() => void} onConfirm `이대로 확정짓기`.
 * @param {() => void} onNewAssessment `추가 수행평가 진행하기`.
 * @param {'confirm'|'new_assessment'|null} [busyAction] 확정 요청 진행 중인 액션.
 *   진행 중에는 세 버튼을 모두 잠근다 — 두 확정 액션이 겹치면 서버는 멱등/409로 정상
 *   분기하지만(`api/performance/finalize.js` 멱등 ②③), 그 사이에 폼 복원까지 끼어들면
 *   화면 상태가 서버와 어긋난다.
 * @param {boolean} [reevaluateDisabled] 재평가 상한에 도달한 경우.
 * @param {string} [reevaluateNote] 상한 안내 등 재평가 버튼 아래 한 줄(없으면 렌더 안 함).
 */
export default function EvaluationBranchActions({
  onReevaluate,
  onConfirm,
  onNewAssessment,
  busyAction = null,
  reevaluateDisabled = false,
  reevaluateNote = ''
}) {
  const noticeId = useId();
  const busy = busyAction !== null;

  return (
    <div className="flex w-full flex-col gap-3">
      {/* 실측 스택 260×180. 버튼 폭이 컨테이너를 넘는 좁은 화면에서는 `max-w-full`로 줄고
          라벨이 3.25rem 안에서 두 줄로 접힌다(1.25rem × 2 < 3.25rem). */}
      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={onReevaluate}
          disabled={busy || reevaluateDisabled}
          className={SECONDARY}
        >
          {REEVALUATE_LABEL}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          aria-describedby={noticeId}
          // 어느 버튼이 요청을 물고 있는지 보조기술에 알린다(둘 다 disabled라 시각적으로는
          // 구분되지 않는다). 진행 상태 문구 자체는 호출부(타임라인)가 낸다.
          aria-busy={busyAction === 'confirm' || undefined}
          className={SECONDARY}
        >
          {CONFIRM_LABEL}
        </button>
        <button
          type="button"
          onClick={onNewAssessment}
          disabled={busy}
          aria-describedby={noticeId}
          aria-busy={busyAction === 'new_assessment' || undefined}
          className={PRIMARY}
        >
          {NEW_ASSESSMENT_LABEL}
        </button>
      </div>

      <p
        id={noticeId}
        className="max-w-[26rem] break-words text-[0.875rem] font-medium leading-[1.125rem] text-ink-sub"
      >
        {FINALIZE_NOTICE}
      </p>

      {reevaluateNote ? (
        <p className="max-w-[26rem] break-words text-[0.875rem] font-medium leading-[1.125rem] text-ink-sub">
          {reevaluateNote}
        </p>
      ) : null}
    </div>
  );
}
