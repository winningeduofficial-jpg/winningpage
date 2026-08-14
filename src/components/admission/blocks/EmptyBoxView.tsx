// admissionParsing.js:1444/1681 (`<div class="admission-empty-box">...없음</div>`) 재현.
type EmptyBoxViewProps = {
  message?: string | null;
};

export default function EmptyBoxView({ message }: EmptyBoxViewProps) {
  if (!message) return null;
  return <div className="admission-empty-box">{message}</div>;
}
