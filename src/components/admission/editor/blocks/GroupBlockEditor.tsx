import type { Block } from "../../../../lib/admissionDoc";
import AdmissionBlockEditor, {
  type AdmissionBlock,
} from "../AdmissionBlockEditor";
import * as docOps from "../docBlockOperations";

type GroupBlock = AdmissionBlock & { children?: AdmissionBlock[] };

type GroupBlockEditorProps = {
  section?: unknown;
  block: GroupBlock;
  onChange: (block: GroupBlock) => void;
  universityName?: string | undefined;
  sectionLabel?: string | undefined;
};

// GroupBlock(kind:'group', 제목 + 중첩 children) 편집기.
//
// 이 파일은 GroupBlockSummary(읽기 전용 요약)를 대체한다. 그 파일 주석은
// "children을 편집하려면 순환 참조 구조가 필요하므로 못 한다"고 판단했는데,
// 실측으로 반증됐다: (1) 표시판에 이미 같은 순환이 있고(blocks/renderBlock.jsx
// ⇄ blocks/GroupView.jsx) 프로덕션에서 돈다, (2) 호출이 렌더 시점(함수 본문)
// 에만 일어나 ESM 라이브 바인딩으로 해결된다, (3) 편집판도 SSR 프로브로
// 예외 0·중첩 표 정상 출력을 확인했다. 지연 import·컴포넌트 주입 같은
// 회피 설계는 넣지 않는다.
//
// 열어주는 축은 **children 표 내부(셀 값·행·열)뿐**이다. 제목 수정과 group
// 단위 구성 변경(생성·제거·순서)은 의도적으로 열지 않는다 —
// renderSpecialBlocksHtml(lib/admissionParsing.js:3031)이 group을 **제목 문자열
// 정확 일치**로 찾는 하드코딩 화이트리스트라, 제목이나 개수·순서가 바뀌면
// html 미러에서 그 group이 조용히 사라진다(= `?jsonrender=0` 킬스위치 경로와
// doc-html-drift 게이트가 보는 바로 그 미러). 그래서 title은 <input>이 아니라
// 텍스트로만 렌더한다 — verify-admission-table-editor.mjs 의 12e/12g/12h가
// 이 세 축을 각각 못 박는다.
//
// 표시판(blocks/GroupView.jsx)과 같은 껍데기 class를 쓴다 — 관리자가 공개
// 화면과 같은 모양의 표를 보고 편집해야 하기 때문이다(AdmissionSurface.jsx
// :166-171 의 .admission-special-* 규칙을 그대로 탄다).
export default function GroupBlockEditor({
  section,
  block,
  onChange,
  universityName,
  sectionLabel,
}: GroupBlockEditorProps) {
  const children = block.children || [];

  return (
    <section className="admission-special-block p-2">
      {block.title ? (
        <div className="admission-special-title">{block.title}</div>
      ) : null}
      <p className="text-[11px] font-bold text-gray-400">
        그룹 제목·구성 변경은 지원하지 않습니다 — 그룹 안의 표 내용만 편집할 수
        있습니다.
      </p>
      {children.map((child, idx) => (
        <AdmissionBlockEditor
          // biome-ignore lint/suspicious/noArrayIndexKey: 위 안내문대로 이 에디터는 그룹 구성 변경을 지원하지 않는다 — children 순서가 고정이다.
          key={idx}
          section={section}
          block={child}
          onChange={(next) =>
            onChange({
              ...block,
              // docBlockOperations는 lib/admissionDoc의 엄격한 Block 유니온을
              // 다룬다 — children은 그 값들을 이 편집기의 느슨한 로컬
              // AdmissionBlock 타입으로 통과시켜 온 것이라 런타임 형태는 같다.
              children: docOps.updateBlockAt(
                children as unknown as Block[],
                idx,
                next as unknown as Block,
              ) as unknown as AdmissionBlock[],
            })
          }
          universityName={universityName}
          sectionLabel={sectionLabel}
        />
      ))}
    </section>
  );
}
