import { useEffect, useRef } from 'react';
import { BlockNoteView } from '@blocknote/ariakit';
import { useCreateBlockNote } from '@blocknote/react';
import { ko } from '@blocknote/core/locales';
import { columnSchema } from '../editor/columnSchema';
// CSS는 반드시 이 파일 안에서 import — 상위에서 import하면 49KB CSS가 초기 번들에 남는다.
import '@blocknote/ariakit/style.css';
import '../editor/blockNoteContent.css';

/**
 * 공개 페이지·미리보기 공용 읽기 전용 렌더러.
 * 에디터와 같은 스키마·같은 BlockNote 렌더 경로를 쓰므로 구조적으로 불일치가 생기지 않는다.
 * BlockNote를 import하는 유일한 공개 측 모듈 — ColumnBody가 React.lazy로 분리해 가져간다.
 *
 * @param {{ blocks: Array<object> }} props  blocks는 non-empty 배열이 보장된다(호출부 책임).
 *   빈 배열이면 BlockNoteEditor.create가 throw한다.
 */
export default function ColumnBodyBlockNote({ blocks }) {
  // deps [] : uncontrolled. blocks가 바뀌면 호출부가 key로 remount한다.
  const editor = useCreateBlockNote(
    { schema: columnSchema, dictionary: ko, initialContent: blocks },
    []
  );

  const wrapperRef = useRef(null);

  useEffect(() => {
    // ProseMirror는 editable={false}와 무관하게 .bn-editor에 role="textbox"/tabindex="0"을
    // 그대로 찍는다(실측). 공개 본문은 입력 상자가 아니라 문서이므로 시맨틱을 바로잡는다 —
    // 그대로 두면 스크린리더가 "편집 가능한 텍스트 상자"로 안내하고, 키보드 사용자는
    // 본문 전체가 하나의 포커스 스톱이 돼 안쪽 링크에 곧장 닿지 못한다.
    const node = wrapperRef.current?.querySelector('.bn-editor');
    if (!node) return;
    node.setAttribute('role', 'article');
    node.tabIndex = -1;
  }, []);

  return (
    <div ref={wrapperRef}>
      <BlockNoteView
        editor={editor}
        editable={false}
        // theme 미지정 시 matchMedia(prefers-color-scheme)를 따라가 라이트 사이트에서 본문만
        // 다크로 렌더된다(에디터에서 이미 겪은 함정, BlockEditor.jsx 주석 참조).
        theme="light"
        // sideMenu/formattingToolbar 컨트롤러는 소스상 isEditable을 전혀 보지 않는다.
        // 생략하면 공개 페이지에서 블록 호버 시 드래그 핸들·⊕ 버튼이 뜬다.
        sideMenu={false}
        formattingToolbar={false}
        linkToolbar={false}
        slashMenu={false}
        emojiPicker={false}
        filePanel={false}
        tableHandles={false}
        comments={false}
        // attributionTooltip은 의도적으로 넘기지 않는다 — BlockNoteViewRaw가 이 prop을 구조분해하지
        // 않아 defaultUIProps에 안 들어가고, rest로 흘러 DOM div에 그대로 spread된다(react dist 3341·3410 실측).
        // 즉 효과는 없고 React unknown-prop 경고만 남는다. 컨트롤러 자체는 'attribution' 확장이
        // 있을 때만 렌더되는데 우리 스키마엔 그 확장이 없다.
      />
    </div>
  );
}
