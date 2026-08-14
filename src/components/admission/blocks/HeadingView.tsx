// renderGradeScoreTable(admissionParsing.js:1947, `<div class="admission-subhead">`) 재현.
export default function HeadingView({ text }) {
  if (!text) return null;
  return <div className="admission-subhead">{text}</div>;
}
