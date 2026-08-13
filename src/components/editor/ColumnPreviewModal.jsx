import { useEffect } from "react";
import { X } from "lucide-react";
import ColumnBody, { getContentBlocks } from "../column/ColumnBody";
import { getCoverUrl } from "../../pages/column/columnData";
import { isEmptyDocument } from "./BlockEditor";

// 온디맨드 스냅샷 렌더러 — 에디터 state를 구독하지 않는다.
// post는 "미리보기" 버튼을 눌렀을 때 editorRef.getBlocks()를 1회 호출해 만든 스냅샷이며,
// 여기서 에디터로 되돌아가는 데이터 경로는 없다(읽기 전용).
export default function ColumnPreviewModal({
  open,
  onClose,
  post,
  label = "교육칼럼",
}) {
  useEffect(() => {
    if (!open) return undefined;

    const { style } = document.body;
    const previousOverflow = style.overflow;
    style.overflow = "hidden";

    return () => {
      style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const coverUrl = post ? getCoverUrl(post) : "";
  // hasBlockContent(길이만 검사)는 항상 true다 — BlockNote 문서는 항상 최소 1개의 빈 paragraph를
  // 포함하기 때문에, 본문을 안 쓴 미리보기도 절대 "비어 있음"으로 판정되지 않았다.
  // isEmptyDocument(전부 빈 paragraph인지 검사)를 재사용한다 — 이미지·구분선만 있는 문서는
  // 빈 paragraph가 아니므로 여전히 "비어 있지 않음"으로 판정된다(기존 의도 유지).
  const isEmpty =
    isEmptyDocument(getContentBlocks(post)) &&
    !String(post?.content ?? "").trim();

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-8"
      role="dialog"
      aria-modal="true"
      aria-label={`${label} 미리보기`}
    >
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div className="relative flex h-[90vh] w-full max-w-[64rem] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-[#edf0f4] px-6 py-4">
          <h2 className="text-sm font-black text-[#111827]">
            미리보기 — 공개 페이지에서 이렇게 보입니다
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="미리보기 닫기"
            className="flex h-9 w-9 items-center justify-center rounded-full text-[#525252] hover:bg-[#F4F4F4]"
          >
            <X size={20} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-white">
          {coverUrl && (
            <img
              src={coverUrl}
              alt={post?.title || ""}
              className="h-[16rem] w-full object-cover sm:h-[20rem]"
            />
          )}

          {/* 45rem 캡은 ColumnBody 자신의 루트 div가 이미 가지고 있다(공개 페이지와 동일 클래스).
              여기서 또 max-w-[45rem]을 씌우면 좌우 padding만큼 줄어든 폭이 되어 720px를 못 채운다 —
              바깥은 넉넉한 폭만 주고 실제 캡은 ColumnBody에 맡긴다. */}
          <div className="mx-auto w-full max-w-[52rem] px-5 py-10 sm:px-8">
            <p className="mb-2 text-base font-semibold leading-[1.4] tracking-[-0.02em] text-accent">
              {label}
            </p>
            <h1 className="mb-8 break-keep text-3xl font-semibold leading-[1.3] tracking-[-0.02em] text-[#525252] sm:text-[2.25rem]">
              {post?.title || "(제목 없음)"}
            </h1>

            {isEmpty ? (
              <p className="text-sm text-gray-400">본문이 비어 있습니다.</p>
            ) : (
              <ColumnBody post={post} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
