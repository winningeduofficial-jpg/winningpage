import { BlockNoteSchema, defaultBlockSpecs } from "@blocknote/core";
import { createReactBlockSpec } from "@blocknote/react";
import { useCallback, useRef, useState } from "react";

export const CALLOUT_DEFAULT_ICON = "💡";

// 강조 박스(callout). variant 프롭은 만들지 않는다 — 허용값이 하나뿐인 확장은 speculative generality다.
export const Callout = createReactBlockSpec(
  {
    type: "callout",
    propSchema: {
      icon: { default: CALLOUT_DEFAULT_ICON },
    },
    content: "inline",
  },
  {
    render: ({ block, contentRef }) => (
      <div className="editor-callout">
        <span
          className="editor-callout__icon"
          contentEditable={false}
          aria-hidden="true"
        >
          {block.props.icon}
        </span>
        <div className="editor-callout__body" ref={contentRef} />
      </div>
    ),
  },
);

// 이미지 2단. createReactBlockSpec의 content 타입은 'inline' | 'none' 뿐이라 자식 블록을 담는
// 컨테이너 블록은 만들 수 없다 — 이미지 두 장을 props로 직접 들고 있는 리프 블록으로 구현한다.
// 폭은 50:50 고정(가변 grow prop 없음), 모바일 세로 스택 없음 — 에디터·미리보기·공개가 항상 같게 보여야 한다.
function ImageRowSlot({ side, block, editor }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);

  const urlKey = side === "left" ? "leftUrl" : "rightUrl";
  const altKey = side === "left" ? "leftAlt" : "rightAlt";
  const url = block.props[urlKey];
  const alt = block.props[altKey] || "";
  const editable = editor.isEditable;

  const pick = useCallback(() => {
    if (editable && !busy) inputRef.current?.click();
  }, [editable, busy]);

  const onChange = useCallback(
    async (event) => {
      const file = event.target.files?.[0];
      event.target.value = ""; // 같은 파일 재선택 허용
      if (!file || !editor.uploadFile) return;
      setBusy(true);
      try {
        const uploaded = await editor.uploadFile(file);
        const nextUrl = typeof uploaded === "string" ? uploaded : uploaded?.url;
        if (nextUrl) {
          editor.updateBlock(block, {
            props: { [urlKey]: nextUrl, [altKey]: file.name },
          });
        }
      } finally {
        setBusy(false);
      }
    },
    [editor, block, urlKey, altKey],
  );

  // 읽기 전용 + 빈 슬롯이어도 슬롯 박스 자체는 그린다(업로드 UI만 숨긴다).
  // null을 반환하면 .image-row(flex)에 자식이 하나만 남아 flex:1인 나머지 슬롯이
  // 행 전체(50:50이 아니라 100%)를 차지해 에디터와 공개 페이지의 이미지 폭이 달라진다.
  if (!url && !editable)
    return <div className="image-row__slot" aria-hidden="true" />;

  return (
    <div className="image-row__slot">
      {url ? (
        <img
          className="image-row__img"
          src={url}
          alt={alt}
          loading="lazy"
          decoding="async"
          draggable={false}
        />
      ) : (
        <div
          className="image-row__empty"
          onClick={pick}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              pick();
            }
          }}
          role="button"
          tabIndex={0}
        >
          {busy ? "업로드 중…" : "이미지 선택"}
        </div>
      )}
      {editable && (
        <input
          className="image-row__input"
          ref={inputRef}
          type="file"
          accept="image/*"
          onChange={onChange}
        />
      )}
    </div>
  );
}

function ImageRowRender({ block, editor }) {
  // 읽기 전용에서 양쪽 다 비었으면 블록 자체를 그리지 않는다.
  if (!editor.isEditable && !block.props.leftUrl && !block.props.rightUrl)
    return null;

  return (
    <div className="image-row" contentEditable={false}>
      <ImageRowSlot side="left" block={block} editor={editor} />
      <ImageRowSlot side="right" block={block} editor={editor} />
    </div>
  );
}

export const ImageRow = createReactBlockSpec(
  {
    type: "imageRow",
    content: "none",
    propSchema: {
      leftUrl: { default: "" },
      rightUrl: { default: "" },
      leftAlt: { default: "" },
      rightAlt: { default: "" },
    },
  },
  { render: ImageRowRender },
);

// 스키마는 모듈 스코프 싱글턴 — 에디터와 리더가 반드시 이 인스턴스를 공유한다.
// 렌더마다 BlockNoteSchema.create를 호출하면 스키마 identity가 바뀌어 에디터가 재생성된다.
// createReactBlockSpec은 팩토리를 반환하므로 등록 시 반드시 호출한다 — Callout(), ImageRow().
export const columnSchema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    callout: Callout(),
    imageRow: ImageRow(),
  },
});
