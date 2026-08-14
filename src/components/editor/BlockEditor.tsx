import { BlockNoteView } from "@blocknote/ariakit";
import {
  type Block,
  filterSuggestionItems,
  insertOrUpdateBlockForSlashMenu,
  type PartialBlock,
} from "@blocknote/core";
import { ko } from "@blocknote/core/locales";
import {
  getDefaultReactSlashMenuItems,
  SuggestionMenuController,
  useCreateBlockNote,
} from "@blocknote/react";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { blocksToPlainText } from "../../lib/blockToPlainText";
import { columnSchema } from "./columnSchema";
// @blocknote/ariakit/style.css 하나가 core+react+ariakit 스타일을 전부 포함하는 자체완결 번들이다
// (실측 확인). 각 패키지는 JS 엔트리에서 CSS를 자동 import하지 않으므로 명시적으로 붙여야 한다 —
// 안 하면 슬래시 메뉴·툴바가 배경/보더 없이 무너진 채로 렌더된다. inter.css 폰트만 의도적으로 생략한다.
// 이 CSS들은 반드시 이 lazy 모듈 안에서 import한다 — 상위 정적 모듈로 올리면 초기 번들에 남는다.
import "@blocknote/ariakit/style.css";
import "./blockNoteContent.css"; // 공용 본문 스타일(.bn-doc) — 크롬보다 먼저
import "./blockEditor.css"; // 에디터 크롬 전용

// 설치된 @blocknote/react@0.52.1 실측 key 값(node_modules/@blocknote/react/dist/blocknote-react.js:2636-2660).
// title이 아니라 key로 걸러야 한다 — dictionary: ko 적용 시 title이 한글로 바뀌어 title 매칭은 전부 실패한다.
const REMOVED_SLASH_KEYS = new Set([
  "heading",
  "check_list",
  "toggle_list",
  "code_block",
  "table",
  "audio",
  "file",
  "heading_4",
  "heading_5",
  "heading_6",
  "toggle_heading",
  "toggle_heading_2",
  "toggle_heading_3",
  "video",
  "emoji",
]);

type ColumnEditor = ReturnType<
  typeof useCreateBlockNote<{ schema: typeof columnSchema }>
>;

// 설치된 @blocknote/react@0.52.1 실측으로는 아이템에 key가 실려 있지만(파일 상단 주석),
// DefaultReactSuggestionItem 타입 선언은 key를 Omit한다(types.d.ts) — 타입/런타임 불일치라
// 이 파일 안에서만 key를 되살린 로컬 타입으로 좁힌다.
type SlashMenuItemWithKey = ReturnType<
  typeof getDefaultReactSlashMenuItems
>[number] & {
  key: string;
};

function getCustomSlashMenuItems(editor: ColumnEditor) {
  const defaultItems = getDefaultReactSlashMenuItems(editor).filter(
    (item) => !REMOVED_SLASH_KEYS.has((item as SlashMenuItemWithKey).key),
  );

  const calloutItem = {
    title: "강조 박스",
    subtext: "아이콘과 함께 핵심 내용을 박스로 강조합니다",
    aliases: ["콜아웃", "박스", "팁", "callout"],
    group: "강조",
    icon: <span aria-hidden="true">💡</span>,
    onItemClick: () =>
      insertOrUpdateBlockForSlashMenu(editor, { type: "callout" }),
  };

  const imageRowItem = {
    title: "이미지 2단",
    subtext: "이미지 두 장을 같은 줄에 나란히 배치합니다",
    aliases: ["2단", "가로배치", "나란히", "imagerow", "이미지2"],
    group: "미디어",
    icon: <span aria-hidden="true">🖼️</span>,
    onItemClick: () =>
      insertOrUpdateBlockForSlashMenu(editor, { type: "imageRow" }),
  };

  // imageRowItem을 기본 image 아이템 바로 뒤에 끼워 같은 '미디어' 그룹 런에 합류시킨다.
  // 배열 끝에 붙이면 group '강조'인 calloutItem 뒤라 슬래시 메뉴가 group이 바뀔 때마다 헤더를
  // 새로 찍어 '미디어' 헤더가 두 번 렌더된다(제목…기본 블록…미디어/이미지…강조/강조 박스…미디어/이미지 2단).
  const imageIndex = defaultItems.findIndex(
    (item) => (item as SlashMenuItemWithKey).key === "image",
  );
  const items = [...defaultItems];
  items.splice(imageIndex + 1, 0, imageRowItem);
  items.push(calloutItem);

  return items;
}

export function isEmptyDocument(blocks: unknown): boolean {
  if (!Array.isArray(blocks) || blocks.length === 0) return true;
  return blocks.every(
    (block: Block<typeof columnSchema.blockSchema>) =>
      block.type === "paragraph" && blocksToPlainText([block]).trim() === "",
  );
}

export type BlockEditorHandle = {
  getBlocks: () => Block<typeof columnSchema.blockSchema>[];
  getPlainText: () => string;
  isEmpty: () => boolean;
};

type BlockEditorProps = {
  initialContent?: PartialBlock<typeof columnSchema.blockSchema>[];
  uploadFile?: (file: File) => Promise<string>;
};

// uncontrolled. initialContent는 마운트 시 1회만 사용 — 값을 역주입하면 캐럿이 붕괴한다.
const BlockEditor = forwardRef<BlockEditorHandle, BlockEditorProps>(
  function BlockEditor({ initialContent, uploadFile }, ref) {
    // columnSchema를 any로 다루는 선례(columnSchema.tsx 상단 주석)와 같은 이유로, 옵션 객체는
    // any로 넘기고(exactOptionalPropertyTypes가 BlockNoteEditorOptions 내부 옵셔널 필드와 충돌)
    // 반환값만 이 파일에서 실제로 쓰는 ColumnEditor로 되돌린다.
    const editor = useCreateBlockNote(
      {
        schema: columnSchema,
        dictionary: ko,
        uploadFile,
        initialContent:
          Array.isArray(initialContent) && initialContent.length > 0
            ? initialContent
            : undefined,
        // biome-ignore lint/suspicious/noExplicitAny: 상단 주석 참고
      } as any,
      [],
    ) as ColumnEditor;

    useImperativeHandle(
      ref,
      () => ({
        getBlocks: () => editor.document,
        getPlainText: () => blocksToPlainText(editor.document),
        isEmpty: () => isEmptyDocument(editor.document),
      }),
      [editor],
    );

    const containerRef = useRef<HTMLDivElement>(null);
    const sheetRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      // Safari는 일본어 IME 후보 확정용 Enter를 막으려고 compositionend 후 500ms 동안
      // keydown을 통째로 버리는데(prosemirror-view), 한글은 음절마다 조합이 확정돼 이 창이
      // 타이핑 내내 열려 있어 Enter가 씹힌다. 라이브러리 자신의 무효화 센티널(-2e8)로 되돌려
      // 창을 즉시 닫는다.
      const isSafari =
        !!navigator.vendor && /Apple Computer/.test(navigator.vendor);
      const container = containerRef.current;
      if (!isSafari || !container) return;

      // 버블 위상 필수 — capture로 달면 ProseMirror 핸들러보다 먼저 실행돼 직후 덮어써진다.
      const closeSafariCompositionGuard = () => {
        // biome-ignore lint/suspicious/noExplicitAny: prosemirrorView.input은 BlockNote가 공개하지 않는 내부 필드라 공식 타입이 없다.
        const input = (editor as any)?.prosemirrorView?.input;
        if (input && typeof input.compositionEndedAt === "number") {
          input.compositionEndedAt = -2e8;
        }
      };

      container.addEventListener("compositionend", closeSafariCompositionGuard);
      return () =>
        container.removeEventListener(
          "compositionend",
          closeSafariCompositionGuard,
        );
    }, [editor]);

    // 클릭 지점이 .bn-editor(실제 contentEditable) 바깥의 여백(틴트 프레임 또는 시트 패딩)이면
    // 네이티브 contentEditable 캐럿 배치가 일어나지 않으므로 수동으로 포커스를 넘긴다.
    const focusIfFrameClicked = (event: React.MouseEvent<HTMLDivElement>) => {
      if (
        event.target === containerRef.current ||
        event.target === sheetRef.current
      )
        editor.focus();
    };

    return (
      // biome-ignore lint/a11y/noStaticElementInteractions: 여백 클릭 시 실제 contentEditable로 포커스를 넘기는 편의 동작이다(위 주석) — 키보드 사용자는 탭으로 에디터에 바로 도달해 별도 동작이 필요 없다.
      // biome-ignore lint/a11y/useKeyWithClickEvents: 위와 동일.
      <div
        className="block-editor-frame"
        ref={containerRef}
        onClick={focusIfFrameClicked}
      >
        {/* theme="light": OS가 다크 모드여도 BlockNote가 :where(.dark, .dark *) 팔레트로
            전환되지 않도록 강제한다 — 미지정 시 os.colorSchemePreference(matchMedia)를 따라가
            관리자 화면 전체가 라이트인데 에디터만 다크로 렌더되는 문제가 있었다(실측 확인). */}
        {/* .block-editor = 크롬(폭·패딩·그림자), .bn-doc = 공개 렌더러와 공유하는 본문 타이포그래피 */}
        {/* biome-ignore lint/a11y/noStaticElementInteractions: 위 여백 클릭 포커스 전달과 동일한 이유 — 키보드는 탭으로 에디터에 바로 도달한다. */}
        {/* biome-ignore lint/a11y/useKeyWithClickEvents: 위와 동일. */}
        <div
          className="block-editor bn-doc"
          translate="no"
          ref={sheetRef}
          onClick={focusIfFrameClicked}
        >
          <BlockNoteView editor={editor} theme="light" slashMenu={false}>
            <SuggestionMenuController
              triggerCharacter="/"
              getItems={async (query) =>
                filterSuggestionItems(getCustomSlashMenuItems(editor), query)
              }
            />
          </BlockNoteView>
        </div>
      </div>
    );
  },
);

export default BlockEditor;
