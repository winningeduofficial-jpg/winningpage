// buildPlainListHtml(admissionParsing.js:1037) 재현.
// 연속된 'bullet' 아이템은 <ul> 하나로 묶인다(legacy가 flushBullets로 한 번에
// 플러시하는 방식) — 아이템 단위로 각각 <ul>을 만들면 안 된다.
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

export default function PlainListView({ items }) {
  if (!items || !items.length) return null;
  const groups = groupItems(items);

  return (
    <div className="admission-readable-body">
      {groups.map((group, idx) => {
        if (group.kind === 'bulletGroup') {
          return (
            <ul key={idx} className="admission-bullet-list">
              {group.items.map((text, itemIdx) => (
                <li key={itemIdx}>{text}</li>
              ))}
            </ul>
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
