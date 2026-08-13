// 읽기 전용 목록에서 index 없이 React key를 만드는 헬퍼.
//
// 대상: 스키마에 고유 id가 없고, 키로 쓸 값(url 등)이 드물게 중복될 수 있는
// 정적 렌더 목록(재정렬·추가·삭제 없음). 값 자체를 key로 쓰되, 같은 값이
// 반복되면 등장 순번을 접미로 붙여 구분한다 — 이 순번은 배열 인덱스가 아니라
// "값별 누적 등장 횟수"라서 노출 순서가 바뀌어도(정렬 등) 값-키 매핑이
// 흔들리지 않는다.
//
// getKeyValue로 각 항목에서 key로 쓸 값을 뽑는다(기본은 항목 자체). 반환값은
// 원본 item과 계산된 key를 함께 담는다.
export function withDedupedKeys(items, getKeyValue = (item) => item) {
  const seen = new Map();
  return items.map((item) => {
    const value = getKeyValue(item);
    const count = (seen.get(value) ?? 0) + 1;
    seen.set(value, count);
    return { item, key: count === 1 ? value : `${value}#${count}` };
  });
}
