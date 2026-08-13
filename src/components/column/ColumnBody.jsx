import { Component, lazy, Suspense } from "react";

// 본문 렌더는 BlockNote 자체 렌더 경로(BlockNoteView editable={false})로 통일한다.
// 자체 블록 매핑 렌더러는 에디터와 계속 어긋났기 때문에 폐기했다 — 일치성이 0순위.
// BlockNote 번들은 이 lazy 경계 뒤에만 존재하므로 목록·랜딩 방문자는 청크를 받지 않는다.
const ColumnBodyBlockNote = lazy(() => import("./ColumnBodyBlockNote"));

// bn-doc = blockNoteContent.css의 스코프 클래스. 에디터도 같은 클래스를 감싸므로(BlockEditor.jsx)
// 이 한 글자가 "에디터와 공개 페이지가 같은 본문 스타일을 쓴다"는 계약 그 자체다 — 빼면 안 된다.
const RICH_BASE =
  "bn-doc max-w-[45rem] break-keep text-base font-normal leading-8 text-[#525252]";
const PLAIN_BASE =
  "max-w-[45rem] whitespace-pre-wrap break-keep text-base font-normal leading-8 text-[#525252]";

/**
 * content_json 봉투를 벗긴다.
 * 정본: { v:1, editor:'blocknote@0.52.1', blocks:[...] }
 * 미리보기 스냅샷: { blocks:[...] }        (v/editor 없음)
 * 레거시 방어: 배열 그대로 저장된 행
 * v 필드를 검사하지 마라 — 미리보기 스냅샷이 즉시 깨진다.
 * @returns {Array<object>} 항상 배열(없으면 빈 배열)
 */
export function getContentBlocks(post) {
  const cj = post?.content_json;
  if (Array.isArray(cj)) return cj;
  return Array.isArray(cj?.blocks) ? cj.blocks : [];
}

/** 호출부 3곳에 흩어져 있던 hasBlocks 판정의 유일한 정본. */
export function hasBlockContent(post) {
  return getContentBlocks(post).length > 0;
}

// Suspense는 pending만 처리하고 throw는 못 잡는다. 앱에 다른 ErrorBoundary가 없으므로
// 청크 로드 실패·스키마 밖 블록 타입(예: 구버전 프런트에 imageRow 문서) 같은 렌더 에러가
// 여기서 안 잡히면 React 트리 전체가 언마운트돼 헤더·푸터까지 사라진 백지가 된다.
// fallback으로 평문 미러를 재사용해 "본문만 평문으로 보인다"로 격하시킨다.
class ColumnBodyBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    if (import.meta.env?.DEV)
      console.error("[ColumnBody] block 렌더 실패, 평문으로 대체", error);
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

export default function ColumnBody({ post, className = "" }) {
  const blocks = getContentBlocks(post);
  // 이중 저장의 롤백 안전망 = 평문 미러. 청크 로딩 중 fallback으로도 재사용해
  // LCP/크롤러가 본문을 즉시 보게 한다.
  const plain = (
    <div className={`${PLAIN_BASE} ${className}`}>{post?.content}</div>
  );

  if (blocks.length === 0) return plain;

  return (
    // key: 게시글이 바뀌면(id 변경) 경계도 강제 remount해 이전 글의 에러 상태가 새 글로 새지 않게 한다.
    <ColumnBodyBoundary key={post?.id ?? "preview"} fallback={plain}>
      <Suspense fallback={plain}>
        {/* RICH_BASE의 text-base/leading-8/text-[#525252]는 blockNoteContent.css와 중복이지만
            남겨둔다 — 청크 로딩 중 fallback→본문 전환 시 폰트 크기 점프를 막는다. */}
        <div className={`${RICH_BASE} ${className}`}>
          {/* key: 상세 페이지에서 id만 바뀌고 컴포넌트가 유지될 때 강제 remount.
              useCreateBlockNote는 deps []라 key 없이는 이전 문서가 남는다. */}
          <ColumnBodyBlockNote key={post?.id ?? "preview"} blocks={blocks} />
        </div>
      </Suspense>
    </ColumnBodyBoundary>
  );
}
