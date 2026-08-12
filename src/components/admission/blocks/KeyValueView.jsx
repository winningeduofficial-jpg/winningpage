// KeyValueBlock 렌더러. ⚠ 현재 파서 어느 빌더도 KeyValueBlock을 만들지
// 않는다(admissionParsing.js 전수 확인 — recordInfo는 2컬럼 GenericTable로
// 이미 렌더되고 있어 KeyValue 경로를 타지 않는다). 즉 이 컴포넌트는 바이트
// 재현 대상 legacy 마크업이 없다 — admission-readable-body/admission-text-line
// 기존 클래스를 재사용해 최소 구현했을 뿐, §5.3 표에 대응 행이 없으므로
// Gate B 대조 시 반드시 재검토가 필요하다(design-doc §9 미결 항목 아님 —
// 스키마에는 있으나 생성 경로가 아직 없는 케이스).
export default function KeyValueView({ rows }) {
  if (!rows || !rows.length) return null;

  return (
    <div className="admission-readable-body">
      {rows.map((row, idx) => (
        <div key={idx} className="admission-text-line">
          {row.label ? <b>{row.label}</b> : null}
          {row.label && row.content ? ' ' : ''}
          {row.content}
        </div>
      ))}
    </div>
  );
}
