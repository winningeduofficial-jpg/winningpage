import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ChevronRight, Link as LinkIcon, Share2 } from 'lucide-react';
import ColumnCard from '../../components/column/ColumnCard';
import {
  ALL_CATEGORY,
  fetchActiveColumns,
  fetchColumnById,
  getCategoryLabel,
  getCoverUrl,
  normalizeImageUrls
} from './columnData';

const RELATED_PAGE_SIZE = 4;

export default function ColumnDetail() {
  const { id } = useParams();
  const [post, setPost] = useState(null);
  const [relatedPool, setRelatedPool] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sharePopoverOpen, setSharePopoverOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [relatedStart, setRelatedStart] = useState(0);

  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);
      setSharePopoverOpen(false);
      setCopied(false);
      setRelatedStart(0);

      const [detail, allRows] = await Promise.all([fetchColumnById(id), fetchActiveColumns()]);

      if (!alive) return;

      setPost(detail);
      setRelatedPool(allRows);
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, [id]);

  const coverUrl = post ? getCoverUrl(post) : '';
  const remainingImages = post ? normalizeImageUrls(post).slice(1) : [];

  const relatedRows = useMemo(() => {
    if (!post) return [];

    const categoryLabel = getCategoryLabel(post);
    const pool = relatedPool.filter((row) => row.id !== post.id);
    const sameCategory =
      categoryLabel !== ALL_CATEGORY ? pool.filter((row) => getCategoryLabel(row) === categoryLabel) : pool;

    return sameCategory.length > 0 ? sameCategory : pool;
  }, [post, relatedPool]);

  const visibleRelated = relatedRows.slice(relatedStart, relatedStart + RELATED_PAGE_SIZE);
  const hasMoreRelated = relatedStart + RELATED_PAGE_SIZE < relatedRows.length;

  function handleShareClick() {
    setSharePopoverOpen((prev) => !prev);
    setCopied(false);
  }

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  if (loading) {
    return (
      <main className="bg-white pt-16">
        <div className="mx-auto w-full max-w-[94rem] px-5 py-24 text-center sm:px-8">
          <p className="text-sm font-bold text-gray-400">불러오는 중입니다.</p>
        </div>
      </main>
    );
  }

  if (!post) {
    return (
      <main className="bg-white pt-16">
        <div className="mx-auto w-full max-w-[94rem] px-5 py-24 text-center sm:px-8">
          <h1 className="text-xl font-bold text-[#525252]">게시글을 찾을 수 없습니다.</h1>
          <Link
            to="/info/column"
            className="mt-8 inline-flex h-11 items-center justify-center rounded-xl bg-[#013262] px-6 text-sm font-semibold text-white"
          >
            교육칼럼 홈으로
          </Link>
        </div>
      </main>
    );
  }

  const titleBlock = (
    <div className="flex flex-col gap-2">
      <Link
        to="/info/column"
        className="w-fit text-xl font-semibold leading-[1.4] tracking-[-0.02em] text-accent"
      >
        교육칼럼
      </Link>

      <div className="flex items-start justify-between gap-6">
        <h1 className="break-keep text-3xl font-semibold leading-[1.3] tracking-[-0.02em] text-[#525252] sm:text-[2.75rem]">
          {post.title}
        </h1>

        <div className="relative shrink-0">
          <button
            type="button"
            onClick={handleShareClick}
            aria-label="공유하기"
            className="flex h-12 w-12 items-center justify-center rounded-full text-[#525252] transition-colors hover:bg-[#F4F4F4]"
          >
            <Share2 size={34} />
          </button>

          {sharePopoverOpen && (
            <div className="absolute right-0 top-14 z-10 flex w-[7.3125rem] flex-col items-center gap-2 rounded-2xl bg-white p-4 shadow-[0_0.5rem_1.5rem_rgba(0,0,0,0.15)]">
              <button
                type="button"
                onClick={handleCopyLink}
                aria-label="링크 복사"
                className="flex h-12 w-12 items-center justify-center rounded-full bg-[#F4F4F4] text-[#525252]"
              >
                <LinkIcon size={35} />
              </button>
              <span className="text-xs font-medium text-[#7A7A7A]">
                {copied ? '복사되었습니다' : '링크 복사'}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <main className="bg-white pt-16">
      {coverUrl ? (
        <>
          <img
            src={coverUrl}
            alt={post.title || ''}
            className="h-[26rem] w-full object-cover md:h-[42.0625rem]"
          />
          <section className="mt-16 md:mt-[8.25rem]">
            <div className="mx-auto w-full max-w-[94rem] px-5 sm:px-8">{titleBlock}</div>
          </section>
        </>
      ) : (
        <div className="flex h-[26rem] w-full flex-col justify-end bg-[#F4F4F4] pb-10 md:h-[42.0625rem] md:pb-[6.25rem]">
          <div className="mx-auto w-full max-w-[94rem] px-5 sm:px-8">{titleBlock}</div>
        </div>
      )}

      <section>
        <div className="mx-auto w-full max-w-[94rem] px-5 sm:px-8">
          <div className={`prose prose-lg mt-16 max-w-none whitespace-pre-wrap break-keep leading-8 text-[#525252] ${coverUrl ? 'md:mt-[8rem]' : 'md:mt-[5.9375rem]'}`}>
            {post.content}
          </div>

          {remainingImages.length > 0 && (
            <div className="mt-10 space-y-5">
              {remainingImages.map((url, index) => (
                <img
                  key={`${url}-${index}`}
                  src={url}
                  alt={`${post.title || ''} 이미지 ${index + 2}`}
                  className="w-full rounded-xl object-cover"
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {relatedRows.length > 0 && (
        <section className="mt-20 pb-20 sm:pb-24 md:mt-[8.25rem] md:pb-[8.25rem]">
          <div className="mx-auto w-full max-w-[94rem] px-5 sm:px-8">
            <h2 className="break-keep text-[2.75rem] font-semibold leading-[1.3] tracking-[-0.02em] text-black">
              함께 읽으면 좋은 글
            </h2>

            <div className="relative mt-[2.875rem]">
              <div className="grid grid-cols-1 gap-x-5 gap-y-9 sm:grid-cols-2 wide:grid-cols-4">
                {visibleRelated.map((row) => (
                  <ColumnCard key={row.id} column={row} variant="grid" />
                ))}
              </div>

              {hasMoreRelated && (
                <button
                  type="button"
                  onClick={() => setRelatedStart((prev) => prev + RELATED_PAGE_SIZE)}
                  aria-label="다음 관련 글"
                  className="absolute -right-4 top-1/2 flex h-12 w-[3.125rem] -translate-y-1/2 items-center justify-center rounded-full bg-white text-[#525252] shadow-[0_0.25rem_0.75rem_rgba(0,0,0,0.15)] sm:right-0 sm:translate-x-1/2 wide:top-[15.125rem]"
                >
                  <ChevronRight size={24} />
                </button>
              )}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
