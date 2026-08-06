// GroupBlock(kind:'group', 제목+중첩 children) 읽기 전용 요약.
// 중첩 편집은 이번 범위 밖 — 1단계까지만 지원한다(제목·자식 블록 종류
// 목록만 표시). 특수대학(경찰대·사관학교·과기원) 데이터가 이 kind를
// 쓴다(§4.4). children까지 편집하려면 재귀 에디터가 필요한데, 현재
// AdmissionBlockEditor 디스패처가 GroupBlock 자체를 지원하지 않아
// children 안의 TableBlockEditor를 재사용하려면 순환 참조 구조가
// 필요하다 — 이번 커밋에서는 하지 않는다(보고 대상).
export default function GroupBlockSummary({ block }) {
  const children = block.children || [];
  return (
    <div className="p-2">
      <p className="text-[11px] font-bold text-gray-500">
        그룹 블록(group) — 제목: {block.title || '(없음)'} · 자식 {children.length}개
      </p>
      <ul className="mt-1 list-disc pl-4 text-[11px] text-gray-400">
        {children.map((child, idx) => (
          <li key={idx}>
            {idx + 1}. {child.kind}
            {child.kind === 'table' ? `(${child.variant})` : ''}
          </li>
        ))}
      </ul>
      <p className="mt-1 text-[11px] text-amber-600">
        이 편집기는 그룹 내부(중첩) 블록을 편집할 수 없습니다 — 읽기 전용 요약만 제공합니다.
      </p>
    </div>
  );
}
