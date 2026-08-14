// renderGradeScoreTable(admissionParsing.js:1947, `<div class="admission-subhead">`) 재현.
type HeadingViewProps = {
  text?: string | null;
};

export default function HeadingView({ text }: HeadingViewProps) {
  if (!text) return null;
  return <div className="admission-subhead">{text}</div>;
}
