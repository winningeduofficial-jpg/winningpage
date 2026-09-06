import { useEffect, useRef } from "react";

// QA 행280 — STEP5 제출폼의 수동 "중간 저장" 버튼을 디바운스 자동 저장으로 바꾼다.
// 예전 결정(`PerformanceChatPage.tsx`의 `handleSaveDraft` 주석)은 "§4 상태도가 명시적
// 저장 전이만 그린다"였지만, 디자이너 9/4 댓글과 사용자 확정으로 뒤집혔다 — 수동 버튼
// 제거, 자동 저장만 남긴다.

/** 입력이 멈춘 뒤 이 시간(ms)이 지나면 자동 저장한다. */
export const AUTOSAVE_DEBOUNCE_MS = 1500;

type UseDebouncedAutosaveOptions<T> = {
  /** 지금 화면이 들고 있는 값. 참조가 바뀔 때마다 디바운스 타이머를 다시 건다. */
  value: T;
  /** 실제 저장 호출. 실패하면 반드시 reject해야 한다 — 그래야 "마지막 저장본" 갱신을
   * 건너뛰고, 실패 상태의 수동 재시도(`flush`)가 다시 저장을 시도할 수 있다. */
  onSave: (value: T) => Promise<unknown>;
  /** 지금 저장을 걸어도 되는 상태인지(예: 빈 폼이거나 제출 중이면 false). false면 값이
   * 바뀌어도 새 타이머를 걸지 않는다 — 이미 걸려 있던 타이머는 그대로 취소된다. */
  enabled: boolean;
  delayMs?: number;
  /** 두 값이 "저장할 필요가 없을 만큼 같다"의 기준. 기본은 JSON 문자열 비교 — 이 훅이
   * 다루는 값은 전부 필드 키 → 문자열 레코드라 충분하다. */
  isEqual?: (a: T, b: T) => boolean;
};

function defaultIsEqual<T>(a: T, b: T) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * 값이 바뀐 뒤 조용해지면 `onSave`를 한 번 부르는 디바운스 자동 저장 훅.
 *
 * - 저장이 이미 진행 중일 때 값이 또 바뀌면 요청을 쌓지 않고 "완료 후 최신 값으로 딱
 *   한 번 더"만 예약한다(트레일링) — 타이핑마다 요청이 겹쳐 쌓이는 걸 막는다.
 * - 마지막으로 저장(성공)한 값과 같으면 아무 것도 하지 않는다.
 * - 훅을 쓰는 컴포넌트가 언마운트되면(이 폼은 STEP 전환마다 통째로 unmount/remount된다)
 *   대기 중이던 변경분을 흘리지 않고 마지막으로 한 번 저장을 시도한다.
 */
export function useDebouncedAutosave<T>({
  value,
  onSave,
  enabled,
  delayMs = AUTOSAVE_DEBOUNCE_MS,
  isEqual = defaultIsEqual,
}: UseDebouncedAutosaveOptions<T>) {
  const valueRef = useRef(value);
  valueRef.current = value;
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  // 훅이 처음 값을 받은 시점(=마운트, 재개 복원분을 포함한 초기값)을 "이미 저장된 값"
  // 으로 본다 — 그래야 재개(이어서 하기)로 막 복원된 초안을 아무 입력 없이 곧장
  // 서버로 다시 쏘지 않는다.
  const lastSavedRef = useRef(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 저장 요청 자체가 in-flight인지(중복 호출 방지)와, 그 사이 값이 또 바뀌었는지
  // (완료 후 트레일링 1회 필요 여부)를 따로 추적한다.
  const savingRef = useRef(false);
  const pendingRef = useRef(false);

  function clearTimer() {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  async function attemptSave() {
    if (savingRef.current) {
      pendingRef.current = true;
      return;
    }
    const target = valueRef.current;
    if (isEqual(target, lastSavedRef.current)) return;

    savingRef.current = true;
    try {
      await onSaveRef.current(target);
      lastSavedRef.current = target;
    } catch {
      // 실패 — `lastSavedRef`를 건드리지 않는다. 자동 재시도는 걸지 않는다(사용자가
      // 값을 더 안 바꾸면 아래 effect가 다시 돌지 않는다) — 실패 상태 UI의 수동
      // "다시 시도"가 `flush()`로 이 함수를 다시 부르는 것이 유일한 재시도 경로다.
      // 실패 자체의 사용자 안내(토스트·에러 문구)는 `onSave` 호출부(페이지)의 몫이다.
    } finally {
      savingRef.current = false;
      if (pendingRef.current) {
        pendingRef.current = false;
        attemptSave();
      }
    }
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: onSave/enabled는 ref로 최신값을 읽는다 — 의존성에 넣으면 호출부가 매 렌더 새 함수를 넘길 때마다 타이머가 리셋된다.
  useEffect(() => {
    clearTimer();
    if (!enabled) return undefined;
    if (isEqual(value, lastSavedRef.current)) return undefined;

    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      attemptSave();
    }, delayMs);

    return clearTimer;
  }, [value, enabled, delayMs]);

  // 언마운트(=이 폼의 STEP 전환) 시 대기 중이던 변경분을 흘리지 않는다. deps를 비워
  // cleanup이 "매 렌더"가 아니라 "언마운트 순간"에만 돌게 한다 — 그 순간의 최신값은
  // ref로 읽는다(그래서 clearTimer/isEqual/enabledRef 등을 deps에 넣지 않는다).
  // biome-ignore lint/correctness/useExhaustiveDependencies: 의도적으로 빈 배열이다 — cleanup은 마운트당 한 번(언마운트 시)만 돌아야 하고, 그 안에서 읽는 값은 전부 ref다(위 주석).
  useEffect(() => {
    return () => {
      clearTimer();
      if (
        enabledRef.current &&
        !isEqual(valueRef.current, lastSavedRef.current)
      ) {
        onSaveRef.current(valueRef.current).catch(() => {
          // 언마운트 이후라 화면에 실패를 알릴 수단이 없다 — 콘솔에만 남긴다.
          console.error("[performance] 언마운트 시 자동 저장 flush 실패");
        });
      }
    };
  }, []);

  return {
    /**
     * 제출 직전에 부른다. 대기 중이던 디바운스 타이머만 취소하고, 지금 값을
     * "저장된 값"으로 표시해 둔다 — 제출 자체가 `mode:'submit'`으로 같은 값을 다시
     * 저장하므로 flush가 아니라 취소로 충분하고, 취소하지 않으면 제출 처리 도중
     * 중복 draft 저장 요청이 경합할 수 있다.
     */
    cancel() {
      clearTimer();
      lastSavedRef.current = valueRef.current;
    },
    /**
     * 대기 중인 타이머와 무관하게 지금 즉시 저장을 시도한다. 실패 상태 UI의 "다시
     * 시도" 클릭에 쓴다(§ 위 `attemptSave` 주석 — 실패는 `lastSavedRef`를 갱신하지
     * 않으므로 값이 그대로여도 다시 저장을 시도한다).
     */
    flush() {
      clearTimer();
      attemptSave();
    },
  };
}
