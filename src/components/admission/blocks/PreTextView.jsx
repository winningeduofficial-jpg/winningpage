// buildSafeTextSectionHtml(admissionParsing.js:2724) 재현.
export default function PreTextView({ text }) {
  if (!text) return null;
  return <pre className="admission-raw-pre admission-safe-text-block">{text}</pre>;
}
