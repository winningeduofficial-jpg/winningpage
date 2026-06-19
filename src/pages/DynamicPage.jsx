import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';

function normalizeArray(value) {
  if (Array.isArray(value)) return value;

  if (!value) return [];

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return value ? [value] : [];
    }
  }

  return [];
}

function cleanText(value) {
  return String(value || '').trim();
}

export default function DynamicPage() {
  const { slug } = useParams();

  const [page, setPage] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    async function loadPage() {
      setLoading(true);

      const { data, error } = await supabase
        .from('page_contents')
        .select('*')
        .eq('slug', slug)
        .eq('is_active', true)
        .maybeSingle();

      if (!alive) return;

      if (error) {
        console.error('세부 페이지 조회 실패:', error);
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
      <main className="min-h-screen bg-white pt-[84px] text-[#0D1B2A]">
        <div className="mx-auto max-w-[1180px] px-6 py-24 text-center text-sm font-bold text-gray-500">
          페이지를 불러오는 중입니다.
        </div>
      </main>
    );
  }

  if (!page) {
    return (
      <main className="min-h-screen bg-white pt-[84px] text-[#0D1B2A]">
        <div className="mx-auto max-w-[1180px] px-6 py-24 text-center">
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
  const topImage = cleanText(page.image_url);
  const bottomImages = normalizeArray(page.image_urls).filter(Boolean);

  return (
    <main className="min-h-screen bg-white pt-[84px] text-[#0D1B2A]">
      <section className="bg-[#F6F1E8]">
        <div className="mx-auto grid min-h-[430px] max-w-[1500px] grid-cols-1 items-center gap-12 px-8 py-20 lg:grid-cols-[1fr_560px]">
          <div>
            {menuGroup && (
              <span className="inline-flex rounded-full border border-[#D9B56D]/50 bg-white/70 px-5 py-2 text-sm font-black text-[#B88737]">
                {menuGroup}
              </span>
            )}

            <h1 className="mt-7 text-5xl font-black leading-tight tracking-[-0.06em] text-[#0D1B2A] md:text-6xl">
              {title}
            </h1>

            {subtitle && (
              <p className="mt-7 max-w-[760px] text-xl font-bold leading-8 tracking-[-0.04em] text-[#5E6A7B]">
                {subtitle}
              </p>
            )}

            {page.button_text && page.button_link && (
              <Link
                to={page.button_link}
                className="mt-9 inline-flex h-14 items-center justify-center rounded-2xl bg-[#0D1B2A] px-8 text-base font-black text-white shadow-[0_16px_36px_rgba(13,27,42,0.20)] transition hover:bg-[#162A40]"
              >
                {page.button_text}
              </Link>
            )}
          </div>

          {topImage && (
            <div className="overflow-hidden rounded-[28px] shadow-[0_24px_70px_rgba(13,27,42,0.18)]">
              <img
                src={topImage}
                alt=""
                className="h-[300px] w-full object-cover md:h-[360px]"
              />
            </div>
          )}
        </div>
      </section>

      {(body || bottomImages.length > 0) && (
        <section className="bg-white">
          <div className="mx-auto max-w-[1180px] px-6 py-20">
            {body && (
              <div className="mb-14 whitespace-pre-line text-xl font-semibold leading-9 tracking-[-0.04em] text-[#26364A]">
                {body}
              </div>
            )}

            {bottomImages.length > 0 && (
              <div className="space-y-6">
                {bottomImages.map((url, index) => (
                  <img
                    key={`${url}-${index}`}
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
