// buildRecruitmentHtml(admissionParsing.js:2288) 재현. items를 공백으로
// join해 div 하나에 담는다(legacy가 footnotes.filter(Boolean).join(' ')로
// 단일 문자열을 만든 뒤 div 하나만 출력하기 때문 — 아이템별 별도 div 아님).
type FootnoteViewProps = {
  items?: Array<string | null | undefined> | null;
};

export default function FootnoteView({ items }: FootnoteViewProps) {
  const text = (items || []).filter(Boolean).join(" ");
  if (!text) return null;
  return <div className="admission-footnote">{text}</div>;
}
