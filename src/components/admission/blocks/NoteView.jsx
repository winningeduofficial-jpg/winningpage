// 실제 문구가 있는 노트 전용. SECTION_NOTES(admissionParsing.js:119) 6키가
// 전부 ''인 "항상 빈 admission-result-note"는 AdmissionSectionView가 애초에
// 렌더하지 않는다(설계 문서 §2.3 — Gate B 허용 diff 1번). NoteBlock은 그와
// 별개로 실제 내용이 있을 때만 만들어지는 블록이라 같은 클래스를 재사용해도
// 안전하다.
export default function NoteView({ text }) {
  if (!text) return null;
  return <div className="admission-result-note">{text}</div>;
}
