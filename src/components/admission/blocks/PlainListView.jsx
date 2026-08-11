// buildPlainListHtml(admissionParsing.js:1037) 재현.
// 연속된 'bullet' 아이템은 <ul> 하나로 묶인다(legacy가 flushBullets로 한 번에
// 플러시하는 방식) — 아이템 단위로 각각 <ul>을 만들면 안 된다.
//
// ── `ordered` 확장 (docs/수행평가-상세-명세.md §8.5 「번호 목록(`체크 1~5`, `분석 포인트:`)
//    → 블록 뷰 확장(`ordered` 분기 + `<ol>`) **또는** 번호를 `text`에 포함」)
// 두 갈래 중 **둘 다** 쓴다. 갈래가 나뉘는 기준은 "번호가 목록 마커인가, 문구의 일부인가"다:
//   · `분석 포인트`(설계 리포트 §5.13) — 번호가 순수 마커다 → `ordered:true` + `<ol>`.
//     서버가 `1. `을 텍스트에 박으면 `<ul>` 불릿과 겹쳐 `• 1. …`로 마커가 두 개가 된다.
//   · `체크 1:` ~ `체크 5:` — `체크 N:`은 원문 프롬프트 뼈대의 **라벨**이지 목록 마커가
//     아니다(`find-resources.js:486-490`). `<ol>`로 옮기면 라벨 문구가 소실되므로
//     텍스트에 남긴 채 `<ul>`로 렌더한다.
//
// **하위 호환이다**: `ordered`가 없거나 falsy면 이전과 완전히 같은 `<ul class="admission-bullet-list">`를
// 낸다. 대입 모집요강 생성 경로(`admissionParsing.js`)는 `ordered`를 만들지 않으므로 회귀 표면이 없다.
// `<ol>`에도 `admission-bullet-list`를 함께 붙여 기존 목록 스타일(gap·패딩)을 그대로 상속시키고,
// 마커 종류만 `admission-ordered-list`로 구분한다(AdmissionSurface에는 이 클래스 규칙이 없어
// 대입 쪽 룩에 영향이 없고, `PerformanceReportSurface`가 수행평가 쪽에서만 정의한다).
//
// ⚠ **HTML 미러와 짝을 맞춰 둘 것**: `admissionParsing.js renderPlainListBlockHtml`이 같은
//    분기(`ol` + 같은 클래스 순서)를 갖고 있다. 이 두 렌더러가 같은 DOM을 내는 것이 Gate B
//    (React 출력 ↔ `renderDocToHtml` 출력 바이트 대조)의 전제다 — 한쪽만 고치면 대입 경로가
//    `ordered`를 만들기 시작하는 순간 게이트가 조용히 갈라진다.
//    (`keyValue`는 아직 미러에 케이스가 없다 — 대입 쪽 생성 경로가 0건이라 남겨 둔 것이고,
//     그 경로가 생기면 미러도 함께 만들어야 한다.)
function groupItems(items) {
  const groups = [];
  let currentBullets = null;

  items.forEach((item) => {
    if (item.type === 'bullet') {
      if (!currentBullets) {
        currentBullets = [];
        groups.push({ kind: 'bulletGroup', items: currentBullets });
      }
      currentBullets.push(item.text);
      return;
    }
    currentBullets = null;
    groups.push({ kind: item.type, text: item.text });
  });

  return groups;
}

/**
 * @param {Array<{type: 'bullet'|'subtitle', text: string}>} items
 * @param {boolean} [ordered] true면 bullet 묶음을 `<ol>`(번호 목록)로 낸다. 기본 `<ul>`.
 */
export default function PlainListView({ items, ordered = false }) {
  if (!items || !items.length) return null;
  const groups = groupItems(items);
  const ListTag = ordered ? 'ol' : 'ul';
  const listClassName = ordered
    ? 'admission-bullet-list admission-ordered-list'
    : 'admission-bullet-list';

  return (
    <div className="admission-readable-body">
      {groups.map((group, idx) => {
        if (group.kind === 'bulletGroup') {
          return (
            <ListTag key={idx} className={listClassName}>
              {group.items.map((text, itemIdx) => (
                <li key={itemIdx}>{text}</li>
              ))}
            </ListTag>
          );
        }
        const className = group.kind === 'subtitle' ? 'admission-subtitle-line' : 'admission-text-line';
        return (
          <div key={idx} className={className}>
            {group.text}
          </div>
        );
      })}
    </div>
  );
}
