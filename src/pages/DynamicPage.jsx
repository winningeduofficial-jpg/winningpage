import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Header from '../components/Header';
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

      if (error) {
        console.error('세부 페이지 조회 실패:', error);
      }

      if (alive) {
        setPage(data || null);
        setLoading(false);
      }
    }

    loadPage();

    const channel = supabase
      .channel(`page-content-${slug}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'page_contents' },
        () => loadPage()
      )
      .subscribe();

    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen bg-white">
        <Header />
        <main className="pt-[84px]">
          <div className="mx-auto max-w-[1200px] px-8 py-28 text-center">
            <p className="text-lg font-black text-gray-500">페이지를 불러오는 중입니다.</p>
          </div>
        </main>
      </div>
    );
  }

  if (!page) {
    return (
      <div className="min-h-screen bg-white">
        <Header />
        <main className="pt-[84px]">
          <div className="mx-auto max-w-[1200px] px-8 py-28 text-center">
            <h1 className="text-4xl font-black text-[#0D1B2A]">페이지를 찾을 수 없습니다.</h1>
            <p className="mt-4 text-base font-bold text-gray-500">
              관리자 페이지에서 해당 세부 페이지가 노출 상태인지 확인해주세요.
            </p>
            <Link
              to="/"
              className="mt-8 inline-flex rounded-xl bg-[#0D1B2A] px-6 py-3 text-sm font-black text-white"
            >
              홈으로 돌아가기
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const pageImages = normalizeArray(page.image_urls);
  const heroImage = page.image_url || pageImages[0] || '';

  return (
    <div className="min-h-screen bg-white">
      <Header />

      <main className="pt-[84px]">
        <section className="relative overflow-hidden bg-[#F7F4EC]">
          <div className="mx-auto grid min-h-[420px] max-w-[1500px] grid-cols-1 items-center gap-10 px-8 py-20 lg:grid-cols-[1fr_520px]">
            <div>
              <p className="mb-4 inline-flex rounded-full border border-[#B88737]/30 bg-white/80 px-4 py-2 text-sm font-black text-[#B88737]">
                {page.menu_group}
              </p>

              <h1 className="text-[42px] font-black leading-tight tracking-[-0.06em] text-[#0D1B2A] md:text-[56px]">
                {page.title}
              </h1>

              {page.subtitle && (
                <p className="mt-6 max-w-[760px] text-lg font-bold leading-8 text-[#5F6875]">
                  {page.subtitle}
                </p>
              )}

              {page.button_text && page.button_link && (
                <Link
                  to={page.button_link}
                  className="mt-8 inline-flex rounded-xl bg-[#0D1B2A] px-7 py-4 text-base font-black text-white shadow-[0_14px_34px_rgba(13,27,42,0.22)] transition hover:bg-[#172B42]"
                >
                  {page.button_text}
                </Link>
              )}
            </div>

            {heroImage && (
              <div className="relative">
                <div className="absolute -left-6 -top-6 h-32 w-32 rounded-full bg-[#B88737]/20 blur-3xl" />
                <div className="relative overflow-hidden rounded-[30px] border border-white/70 bg-white shadow-[0_28px_70px_rgba(13,27,42,0.16)]">
                  <img
                    src={heroImage}
                    alt={page.title}
                    className="h-[320px] w-full object-cover"
                  />
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="bg-white py-20">
          <div className="mx-auto max-w-[1100px] px-8">
            <div className="rounded-[28px] border border-[#E6E9EF] bg-white p-8 shadow-[0_20px_60px_rgba(13,27,42,0.08)] md:p-12">
              <div className="mb-8 border-b border-[#E6E9EF] pb-6">
                <p className="text-sm font-black tracking-[0.16em] text-[#B88737]">
                  {page.menu_label}
                </p>
                <h2 className="mt-3 text-3xl font-black tracking-[-0.05em] text-[#0D1B2A]">
                  상세 안내
                </h2>
              </div>

              <div className="whitespace-pre-line text-[17px] font-medium leading-9 text-[#374151]">
                {page.body || '관리자 페이지에서 내용을 입력해주세요.'}
              </div>
            </div>

            {pageImages.length > 0 && (
              <div className="mt-14 space-y-0 overflow-hidden rounded-[22px] border border-[#E6E9EF] bg-white shadow-[0_18px_50px_rgba(13,27,42,0.08)]">
                {pageImages.map((url, index) => (
                  <img
                    key={`${url}-${index}`}
                    src={url}
                    alt={`${page.title} 이미지 ${index + 1}`}
                    className="w-full object-contain"
                  />
                ))}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
