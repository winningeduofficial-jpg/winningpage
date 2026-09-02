import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { openPaidServiceOrAlert } from "@/lib/paidServiceAccess";
import { withDedupedKeys } from "@/lib/reactKeys";
import { supabase } from "@/lib/supabase";

function normalizeArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;

  if (!value) return [];

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return value ? [value] : [];
    }
  }

  return [];
}

function cleanText(value: unknown) {
  return String(value || "").trim();
}

type PageContent = {
  menu_group?: string | null;
  title?: string | null;
  subtitle?: string | null;
  body?: string | null;
  image_urls?: unknown;
  button_text?: string | null;
  button_link?: string | null;
};

type DynamicPageProps = {
  /** /page/premium/:program 래퍼(premiumRoutes.tsx)처럼 URL 파라미터가 아닌 조합된
   * slug로 조회해야 할 때 명시적으로 넘긴다. 없으면 기존처럼 라우트 :slug를 그대로 쓴다. */
  slug?: string;
};

export default function DynamicPage({ slug: slugProp }: DynamicPageProps) {
  const params = useParams();
  const slug = slugProp ?? params.slug;

  const [page, setPage] = useState<PageContent | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    async function loadPage() {
      setLoading(true);

      if (!slug) {
        setPage(null);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("page_contents")
        .select("*")
        .eq("slug", slug)
        .eq("is_active", true)
        .maybeSingle();

      if (!alive) return;

      if (error) {
        console.error("세부 페이지 조회 실패:", error);
        setPage(null);
      } else {
        setPage(data || null);
      }

      setLoading(false);
    }

    loadPage();

    return () => {
      alive = false;
    };
  }, [slug]);

  if (loading) {
    return (
      <main className="min-h-screen bg-white pt-16 text-[#0D1B2A]">
        <div className="mx-auto max-w-content px-6 py-24 text-center text-sm font-bold text-gray-500">
          페이지를 불러오는 중입니다.
        </div>
      </main>
    );
  }

  if (!page) {
    return (
      <main className="min-h-screen bg-white pt-16 text-[#0D1B2A]">
        <div className="mx-auto max-w-content px-6 py-24 text-center">
          <h1 className="text-3xl font-black tracking-[-0.04em]">
            페이지를 찾을 수 없습니다.
          </h1>
          <p className="mt-4 text-base font-medium text-gray-500">
            요청하신 페이지가 없거나 비활성화되어 있습니다.
          </p>
          <Link
            to="/"
            className="mt-8 inline-flex h-12 items-center justify-center rounded-xl bg-[#0D1B2A] px-7 text-sm font-black text-white"
          >
            메인으로 이동
          </Link>
        </div>
      </main>
    );
  }

  const menuGroup = cleanText(page.menu_group);
  const title = cleanText(page.title);
  const subtitle = cleanText(page.subtitle);
  const body = cleanText(page.body);
  const bottomImages = normalizeArray(page.image_urls).filter(
    Boolean,
  ) as string[];

  // PaidServiceLike는 옵셔널 필드를 string|null로 받는다(exactOptionalPropertyTypes가 명시적
  // undefined는 막는다) — button_text/button_link/slug의 undefined를 null로 정규화한다.
  const paidServiceContext = {
    name: title,
    title,
    label: page.button_text ?? null,
    description: subtitle || body,
    link: page.button_link ?? null,
    to: page.button_link ?? null,
    slug: slug ?? null,
  };

  return (
    <main className="min-h-screen bg-white pt-16 text-[#0D1B2A]">
      <section className="border-b border-[#E8EDF3] bg-[#F8FAFC]">
        <div className="mx-auto max-w-content px-6 py-20 text-center">
          {menuGroup && (
            <p className="text-sm font-black tracking-[-0.02em] text-[#B88737]">
              {menuGroup}
            </p>
          )}

          <h1 className="mx-auto mt-5 max-w-[900px] text-5xl font-black leading-tight tracking-[-0.06em] text-[#0D1B2A] md:text-6xl">
            {title}
          </h1>

          {subtitle && (
            <p className="mx-auto mt-6 max-w-[820px] text-xl font-bold leading-8 tracking-[-0.04em] text-[#5E6A7B]">
              {subtitle}
            </p>
          )}

          {page.button_text && page.button_link && (
            <button
              type="button"
              onClick={(event) =>
                openPaidServiceOrAlert(event, paidServiceContext)
              }
              className="mt-9 inline-flex h-13 items-center justify-center rounded-xl bg-[#0D1B2A] px-7 py-4 text-sm font-black text-white shadow-[0_12px_28px_rgba(13,27,42,0.18)] transition hover:bg-[#162A40]"
            >
              {page.button_text}
            </button>
          )}
        </div>
      </section>

      {(body || bottomImages.length > 0) && (
        <section className="bg-white">
          <div className="mx-auto max-w-content px-6 py-16">
            {body && (
              <div className="mb-12 whitespace-pre-line text-lg font-semibold leading-9 tracking-[-0.04em] text-[#26364A]">
                {body}
              </div>
            )}

            {bottomImages.length > 0 && (
              <div className="space-y-6">
                {withDedupedKeys(bottomImages).map(({ item: url, key }) => (
                  <img
                    key={key}
                    src={url}
                    alt=""
                    className="mx-auto w-full max-w-[980px] object-contain"
                  />
                ))}
              </div>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
