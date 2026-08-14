// buildSafeTextSectionHtml(admissionParsing.js:2724) 재현.
type PreTextViewProps = {
  text?: string | null;
};

export default function PreTextView({ text }: PreTextViewProps) {
  if (!text) return null;
  return (
    <pre className="admission-raw-pre admission-safe-text-block">{text}</pre>
  );
}
