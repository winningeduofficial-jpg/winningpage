import type { Block } from "../../../lib/admissionDoc";
import { renderBlock } from "./renderBlock";

// specialBlock(admissionParsing.js:2626, `<section class="admission-special-block">
// <div class="admission-special-title">...</div>...</section>`) 재현.
// title이 없으면 title div는 생략한다(legacy specialBlock은 title이 항상
// 있는 호출부만 쓰지만, 스키마상 title은 optional이라 방어한다).
type AdmissionBlock = Record<string, unknown> & { kind?: string };

type GroupViewProps = {
  title?: string | undefined;
  childBlocks?: AdmissionBlock[];
};

export default function GroupView({ title, childBlocks }: GroupViewProps) {
  return (
    <section className="admission-special-block">
      {title ? <div className="admission-special-title">{title}</div> : null}
      {(childBlocks || []).map((child, idx) =>
        // renderBlock은 lib/admissionDoc의 엄격한 Block 유니온을 다룬다 —
        // child는 그 값을 이 뷰의 느슨한 로컬 AdmissionBlock 타입으로
        // 통과시켜 온 것이라 런타임 형태는 같다.
        renderBlock(child as unknown as Block, idx),
      )}
    </section>
  );
}
