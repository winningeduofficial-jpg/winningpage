import { renderBlock } from "./renderBlock";

// specialBlock(admissionParsing.js:2626, `<section class="admission-special-block">
// <div class="admission-special-title">...</div>...</section>`) 재현.
// title이 없으면 title div는 생략한다(legacy specialBlock은 title이 항상
// 있는 호출부만 쓰지만, 스키마상 title은 optional이라 방어한다).
type AdmissionBlock = Record<string, unknown> & { kind?: string };

type GroupViewProps = {
  title?: string;
  childBlocks?: AdmissionBlock[];
};

export default function GroupView({ title, childBlocks }: GroupViewProps) {
  return (
    <section className="admission-special-block">
      {title ? <div className="admission-special-title">{title}</div> : null}
      {(childBlocks || []).map((child, idx) => renderBlock(child, idx))}
    </section>
  );
}
