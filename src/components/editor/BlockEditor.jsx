import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { BlockNoteSchema, defaultBlockSpecs, filterSuggestionItems, insertOrUpdateBlockForSlashMenu } from '@blocknote/core';
import { ko } from '@blocknote/core/locales';
import { BlockNoteView } from '@blocknote/ariakit';
import { createReactBlockSpec, getDefaultReactSlashMenuItems, SuggestionMenuController, useCreateBlockNote } from '@blocknote/react';
import { blocksToPlainText } from '../../lib/blockToPlainText';
// @blocknote/ariakit/style.css 하나가 core+react+ariakit 스타일을 전부 포함하는 자체완결 번들이다
// (실측 확인). 각 패키지는 JS 엔트리에서 CSS를 자동 import하지 않으므로 명시적으로 붙여야 한다 —
// 안 하면 슬래시 메뉴·툴바가 배경/보더 없이 무너진 채로 렌더된다. inter.css 폰트만 의도적으로 생략한다.
import '@blocknote/ariakit/style.css';
import './blockEditor.css';

// 강조 박스(callout). variant 프롭은 만들지 않는다 — 허용값이 하나뿐인 확장은 speculative generality다.
const Callout = createReactBlockSpec(
  {
    type: 'callout',
    propSchema: {
      icon: { default: '💡' }
    },
    content: 'inline'
  },
  {
    render: ({ block, contentRef }) => (
      <div className="editor-callout">
        <span className="editor-callout__icon" contentEditable={false} aria-hidden="true">
          {block.props.icon}
        </span>
        <div className="editor-callout__body" ref={contentRef} />
      </div>
    )
  }
);

// 스키마는 모듈 스코프 싱글턴 — 렌더마다 재생성하지 않는다.
const schema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    callout: Callout()
  }
});

// 설치된 @blocknote/react@0.52.1 실측 key 값(node_modules/@blocknote/react/dist/blocknote-react.js:2636-2660).
// title이 아니라 key로 걸러야 한다 — dictionary: ko 적용 시 title이 한글로 바뀌어 title 매칭은 전부 실패한다.
const REMOVED_SLASH_KEYS = new Set([
  'heading',
  'check_list',
  'toggle_list',
  'code_block',
  'table',
  'audio',
  'file',
  'heading_4',
  'heading_5',
  'heading_6',
  'toggle_heading',
  'toggle_heading_2',
  'toggle_heading_3',
  'video',
  'emoji'
]);

function getCustomSlashMenuItems(editor) {
  const defaultItems = getDefaultReactSlashMenuItems(editor).filter((item) => !REMOVED_SLASH_KEYS.has(item.key));

  const calloutItem = {
    title: '강조 박스',
    subtext: '아이콘과 함께 핵심 내용을 박스로 강조합니다',
    aliases: ['콜아웃', '박스', '팁', 'callout'],
    group: '강조',
    icon: <span aria-hidden="true">💡</span>,
    onItemClick: () => insertOrUpdateBlockForSlashMenu(editor, { type: 'callout' })
  };

  return [...defaultItems, calloutItem];
}

function isEmptyDocument(blocks) {
  if (!Array.isArray(blocks) || blocks.length === 0) return true;
  return blocks.every((block) => block.type === 'paragraph' && blocksToPlainText([block]).trim() === '');
}

// uncontrolled. initialContent는 마운트 시 1회만 사용 — 값을 역주입하면 캐럿이 붕괴한다.
const BlockEditor = forwardRef(function BlockEditor({ initialContent, uploadFile }, ref) {
  const editor = useCreateBlockNote(
    {
      schema,
      dictionary: ko,
      uploadFile,
      initialContent: Array.isArray(initialContent) && initialContent.length > 0 ? initialContent : undefined
    },
    []
  );

  useImperativeHandle(
    ref,
    () => ({
      getBlocks: () => editor.document,
      getPlainText: () => blocksToPlainText(editor.document),
      isEmpty: () => isEmptyDocument(editor.document)
    }),
    [editor]
  );

  const containerRef = useRef(null);
  const sheetRef = useRef(null);

  useEffect(() => {
    // Safari는 일본어 IME 후보 확정용 Enter를 막으려고 compositionend 후 500ms 동안
    // keydown을 통째로 버리는데(prosemirror-view), 한글은 음절마다 조합이 확정돼 이 창이
    // 타이핑 내내 열려 있어 Enter가 씹힌다. 라이브러리 자신의 무효화 센티널(-2e8)로 되돌려
    // 창을 즉시 닫는다.
    const isSafari = !!navigator.vendor && /Apple Computer/.test(navigator.vendor);
    const container = containerRef.current;
    if (!isSafari || !container) return;

    // 버블 위상 필수 — capture로 달면 ProseMirror 핸들러보다 먼저 실행돼 직후 덮어써진다.
    const closeSafariCompositionGuard = () => {
      const input = editor?.prosemirrorView?.input;
      if (input && typeof input.compositionEndedAt === 'number') {
        input.compositionEndedAt = -2e8;
      }
    };

    container.addEventListener('compositionend', closeSafariCompositionGuard);
    return () => container.removeEventListener('compositionend', closeSafariCompositionGuard);
  }, [editor]);

  // 클릭 지점이 .bn-editor(실제 contentEditable) 바깥의 여백(틴트 프레임 또는 시트 패딩)이면
  // 네이티브 contentEditable 캐럿 배치가 일어나지 않으므로 수동으로 포커스를 넘긴다.
  const focusIfFrameClicked = (event) => {
    if (event.target === containerRef.current || event.target === sheetRef.current) editor.focus();
  };

  return (
    <div className="block-editor-frame" ref={containerRef} onClick={focusIfFrameClicked}>
      {/* theme="light": OS가 다크 모드여도 BlockNote가 :where(.dark, .dark *) 팔레트로
          전환되지 않도록 강제한다 — 미지정 시 os.colorSchemePreference(matchMedia)를 따라가
          관리자 화면 전체가 라이트인데 에디터만 다크로 렌더되는 문제가 있었다(실측 확인). */}
      <div className="block-editor" translate="no" ref={sheetRef} onClick={focusIfFrameClicked}>
        <BlockNoteView editor={editor} theme="light" slashMenu={false}>
          <SuggestionMenuController
            triggerCharacter="/"
            getItems={async (query) => filterSuggestionItems(getCustomSlashMenuItems(editor), query)}
          />
        </BlockNoteView>
      </div>
    </div>
  );
});

export default BlockEditor;
