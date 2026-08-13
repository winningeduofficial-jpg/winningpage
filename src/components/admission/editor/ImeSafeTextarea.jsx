import { useEffect, useRef, useState } from "react";

// ImeSafeInput.jsx의 textarea 버전 — preText/note 등 여러 줄 텍스트 편집용.
// 로직은 동일하다: 조합 중(compositionstart~compositionend)에는 로컬
// draft만 갱신하고, 상위 커밋(onCommit)은 조합 종료 후에만 흘려보낸다.
export default function ImeSafeTextarea({ value, onCommit, ...rest }) {
  const [draft, setDraft] = useState(value ?? "");
  const composingRef = useRef(false);

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
    <textarea
      {...rest}
      value={draft}
      onChange={handleChange}
      onCompositionStart={handleCompositionStart}
      onCompositionEnd={handleCompositionEnd}
    />
  );
}
