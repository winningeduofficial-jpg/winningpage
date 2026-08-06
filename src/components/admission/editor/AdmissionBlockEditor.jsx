import TableBlockEditor from './TableBlockEditor';
import NoteBlockEditor from './blocks/NoteBlockEditor';
import EmptyBoxBlockEditor from './blocks/EmptyBoxBlockEditor';
import HeadingBlockEditor from './blocks/HeadingBlockEditor';
import PreTextBlockEditor from './blocks/PreTextBlockEditor';
import PlainListBlockEditor from './blocks/PlainListBlockEditor';
import FootnoteBlockEditor from './blocks/FootnoteBlockEditor';
import GroupBlockSummary from './blocks/GroupBlockSummary';

// Block.kind 디스패처(편집판). AdmissionSectionView/blocks/renderBlock.jsx
// (표시판)와 나란한 구조지만 재사용하지 않는다 — 표시판은 Gate B 바이트
// 계약 보호 대상이라 편집 관심사를 섞으면 안 된다.
export default function AdmissionBlockEditor({ section, block, onChange }) {
  switch (block.kind) {
    case 'table':
      return <TableBlockEditor section={section} block={block} onChange={onChange} />;
    case 'note':
      return <NoteBlockEditor block={block} onChange={onChange} />;
    case 'emptyBox':
      return <EmptyBoxBlockEditor block={block} onChange={onChange} />;
    case 'heading':
      return <HeadingBlockEditor block={block} onChange={onChange} />;
    case 'preText':
      return <PreTextBlockEditor block={block} onChange={onChange} />;
    case 'plainList':
      return <PlainListBlockEditor block={block} onChange={onChange} />;
    case 'footnote':
      return <FootnoteBlockEditor block={block} onChange={onChange} />;
    case 'group':
      // 중첩 편집 범위 밖(1단계 읽기 전용 요약만) — GroupBlockSummary 주석 참고.
      return <GroupBlockSummary block={block} />;
    case 'rawHtml':
      return (
        <p className="p-2 text-[11px] text-gray-400">
          rawHtml 블록은 이 편집기에서 수정할 수 없습니다(레거시 승계 콘텐츠, reason: {block.reason || '미상'}).
        </p>
      );
    default:
      return <p className="p-2 text-[11px] font-bold text-red-500">알 수 없는 블록 종류: {String(block.kind)}</p>;
  }
}
