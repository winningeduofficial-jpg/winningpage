import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import ColumnBody, { hasBlockContent } from "@/components/column/ColumnBody";
import { withDedupedKeys } from "@/lib/reactKeys";
import {
  CATEGORY_LABELS,
  fetchAdmissionCaseById,
  normalizeImageUrls,
} from "./admissionCaseData";

type AdmissionCasePost = {
  category?: string;
  title?: string;
  [key: string]: unknown;
};

export default function AdmissionCaseDetail() {
  const { id } = useParams();
  const [post, setPost] = useState<AdmissionCasePost | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);
      // 라우트가 항상 :id를 갖지만(App.jsx) useParams 타입은 optional이다 — 없으면 조회하지 않는다.
      const detail = id ? await fetchAdmissionCaseById(id) : null;
      if (!alive) return;
      setPost(detail);
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, [id]);

  // row.category('susi'|'jungsi')로 목록 경로 판정. 미확정/부재 시 기본 '/admission/susi'.
  const listPath =
    post?.category && CATEGORY_LABELS[post.category]
      ? `/admission/${post.category}`
      : "/admission/susi";
  const hasBlocks = hasBlockContent(post);
  const fallbackImages = post ? normalizeImageUrls(post) : [];

  if (loading) {
    return (
      <main className="bg-white pt-16">
        <div className="mx-auto w-full max-w-content px-5 py-24 text-center sm:px-8">
          <p className="text-sm font-bold text-gray-400">불러오는 중입니다.</p>
        </div>
      </main>
    );
  }

  if (!post) {
    return (
      <main className="bg-white pt-16">
        <div className="mx-auto w-full max-w-content px-5 py-24 text-center sm:px-8">
          <h1 className="text-xl font-bold text-ink">
            게시글을 찾을 수 없습니다.
          </h1>
          <Link
            to={listPath}
            className="mt-8 inline-flex h-11 items-center justify-center rounded-xl bg-primary px-6 text-sm font-semibold text-white"
          >
            합격 사례 목록으로
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="bg-white pt-16">
      <section className="pt-16 md:pt-30">
        <div className="mx-auto w-full max-w-content px-5 sm:px-8">
          <Link
            to={listPath}
            className="w-fit text-base sm:text-xl font-semibold leading-[1.4] tracking-[-0.02em] text-accent"
          >
            수시정시 합격 후기
          </Link>

          <h1 className="mt-2 break-keep text-2xl sm:text-[2.25rem] font-semibold leading-[1.3] tracking-[-0.02em] text-ink">
            {post.title}
          </h1>
        </div>
      </section>

      <section className="pb-20 sm:pb-24 md:pb-33">
        <div className="mx-auto w-full max-w-content px-5 sm:px-8">
          <ColumnBody post={post} className="mt-16 md:mt-32" />

          {!hasBlocks && fallbackImages.length > 0 && (
            <div className="mt-10 space-y-5">
              {withDedupedKeys(fallbackImages).map(
                ({ item: url, key }, index) => (
                  <img
                    key={key}
                    src={url}
                    alt={`${post.title || ""} 이미지 ${index + 1}`}
                    className="w-full rounded-xl object-cover"
                  />
                ),
              )}
            </div>
          )}

          {/* 시안엔 없음: 상세 진입 후 이탈 경로 확보용 — 눈에 띄지 않게 보조 텍스트 톤으로 배치 */}
          <Link
            to={listPath}
            className="mt-16 inline-block text-sm font-medium text-[#7A7A7A] underline-offset-4 hover:underline"
          >
            목록으로
          </Link>
        </div>
      </section>
    </main>
  );
}
