import EmptyBoxView from "./EmptyBoxView";
import FootnoteView from "./FootnoteView";
import GroupView from "./GroupView";
import HeadingView from "./HeadingView";
import KeyValueView from "./KeyValueView";
import NoteView from "./NoteView";
import PlainListView from "./PlainListView";
import PreTextView from "./PreTextView";
import RawHtmlView from "./RawHtmlView";
import TableBlockView from "./TableBlockView";

// Block.kind 디스패처. AdmissionSectionView(최상위)와 GroupView(중첩
// children)가 공유한다 — GroupView가 이 함수를 다시 import하는 순환 참조가
// 있지만, 실제 호출은 렌더 시점(함수 본문 안)에서만 일어나므로 ESM 라이브
// 바인딩으로 안전하다.
export function renderBlock(block, key) {
  if (!block || typeof block !== "object") return null;

  switch (block.kind) {
    case "table":
      return <TableBlockView key={key} block={block} />;
    case "keyValue":
      return <KeyValueView key={key} rows={block.rows} />;
    // `ordered`는 §8.5 블록 뷰 확장분(번호 목록). 없으면 `undefined`가 넘어가
    // `PlainListView`의 기본값(`false`, `<ul>`)이 그대로 걸린다 — 기존 생성 경로 무영향.
    case "plainList":
      return (
        <PlainListView key={key} items={block.items} ordered={block.ordered} />
      );
    case "preText":
      return <PreTextView key={key} text={block.text} />;
    case "emptyBox":
      return <EmptyBoxView key={key} message={block.message} />;
    case "note":
      return <NoteView key={key} text={block.text} />;
    case "footnote":
      return <FootnoteView key={key} items={block.items} />;
    case "heading":
      return <HeadingView key={key} text={block.text} />;
    case "group":
      return (
        <GroupView key={key} title={block.title} childBlocks={block.children} />
      );
    case "rawHtml":
      return <RawHtmlView key={key} html={block.html} />;
    default:
      return null;
  }
}
