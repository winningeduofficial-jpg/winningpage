import { useEffect, useRef, useState } from "react";

// 한글 등 조합 입력(IME) 안전 controlled input.
//
// 일반 controlled input(value={state} onChange={setState})은 상위 상태가
// 재검증·재렌더 등으로 value를 다시 흘려보낼 때 조합 중인 글자가 끊기거나
// 캐럿이 튀는 문제가 알려져 있다(react + IME composition 조합 중 흔한
// 함정). 조합 중(onCompositionStart~onCompositionEnd)에는 로컬 draft만
// 갱신하고, 상위로의 커밋(onCommit)은 조합이 끝난 뒤에만 흘려보낸다.
export default function ImeSafeInput({ value, onCommit, ...rest }) {
  const [draft, setDraft] = useState(value ?? "");
  const composingRef = useRef(false);

  // 조합 중이 아닐 때만 상위 값 변경을 반영한다(예: undo/외부 갱신).
  // 조합 중에 덮어쓰면 그게 바로 "캐럿 튐/조합 끊김" 버그다.
  // biome-ignore lint/correctness/useExhaustiveDependencies: TODO(useEffectEvent) draft를 deps에 넣으면 로컬 타이핑(setDraft)마다 이 effect가 다시 돌아, 아직 부모로 커밋 안 된 방금 입력한 값을 상위 value로 즉시 덮어써 버린다. value가 바뀔 때만 동기화해야 한다.
  useEffect(() => {
    if (!composingRef.current && value !== draft) {
      setDraft(value ?? "");
    }
  }, [value]);

  function handleChange(event) {
    const next = event.target.value;
    setDraft(next);
    if (!composingRef.current) onCommit(next);
  }

  function handleCompositionStart() {
    composingRef.current = true;
  }

  function handleCompositionEnd(event) {
    composingRef.current = false;
    const next = event.target.value;
    setDraft(next);
    onCommit(next);
  }

  return (
    <input
      {...rest}
      value={draft}
      onChange={handleChange}
      onCompositionStart={handleCompositionStart}
      onCompositionEnd={handleCompositionEnd}
    />
  );
}
