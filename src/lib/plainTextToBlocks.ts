// 평문 -> BlockNote 문단 블록 배열. blockToPlainText.js와 짝이 되는 역방향 순수 함수.
// 중립 위치(src/lib/)에 둔다 — 순환 의존 차단.
//
// 마크다운을 해석하지 않는다: 기존 데이터는 평문이므로 '#', '*', '>' 로 시작하는 줄도
// 그대로 문단 텍스트로 취급한다.
export function plainTextToBlocks(text) {
  if (!text || typeof text !== "string") return [];

  const lines = text.split("\n");
  const blocks = [];
  let prevBlank = false;

  for (const line of lines) {
    if (line === "") {
      if (prevBlank) continue; // 연속 빈 줄은 하나로 접는다
      prevBlank = true;
      blocks.push({ type: "paragraph", props: {}, content: [], children: [] });
      continue;
    }

    prevBlank = false;
    blocks.push({
      type: "paragraph",
      props: {},
      content: [{ type: "text", text: line, styles: {} }],
      children: [],
    });
  }

  return blocks;
}
