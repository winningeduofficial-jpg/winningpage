import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '../lib/supabase';

const FALLBACK_BANNERS = [
  {
    id: 'fallback-1',
    title: '데이터가 발견하고,',
    highlight: '위닝 서포터가 성장을 완성합니다',
    subtitle: '학생 개인별 학습 분석부터 대입 전략까지, 위닝에듀가 최적의 길을 제시합니다.',
    button_text: '지금 시작하기',
    button_link: '/signup',
    image_url: '/images/banner-1.png'
  },
  {
    id: 'fallback-2',
    title: '학습 기록이 쌓이면,',
    highlight: '입시 전략이 더 정교해집니다',
    subtitle: '매일의 공부 데이터를 분석해 주간 리포트와 맞춤 전략으로 연결합니다.',
    button_text: '지금 시작하기',
    button_link: '/signup',
    image_url: '/images/banner-2.png'
  },
  {
    id: 'fallback-3',
    title: '수행평가와 세특까지,',
    highlight: '학생부의 방향을 설계합니다',
    subtitle: '진로와 과목을 연결해 학생부에 남는 탐구 흐름을 만듭니다.',
    button_text: '지금 시작하기',
    button_link: '/signup',
    image_url: '/images/banner-3.png'
  },
  {
    id: 'fallback-4',
    title: '부모님이 확인하는',
    highlight: '성장 리포트 시스템',
    subtitle: '학습 시간, 집중도, 과목 비중, 합격 가능성 변화를 한눈에 확인합니다.',
    button_text: '지금 시작하기',
    button_link: '/signup',
    image_url: '/images/banner-4.png'
  }
];

function normalizeBanner(row) {
  return {
    id: row.id,
    title: row.title || '',
    highlight: row.highlight || '',
    subtitle: row.subtitle || '',
    button_text: row.button_text || '지금 시작하기',
    button_link: row.button_link || '/signup',
    image_url: row.image_url || '/images/banner-1.png'
  };
}

export default function HeroSlider() {
  const [banners, setBanners] = useState(FALLBACK_BANNERS);
  const [active, setActive] = useState(0);

  useEffect(() => {
    let alive = true;

    async function loadBanners() {
      const { data, error } = await supabase
        .from('banners')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (error) {
        console.error('배너 조회 실패:', error);
        return;
      }

      const next = (data || []).map(normalizeBanner);

      if (alive && next.length > 0) {
        setBanners(next);
        setActive(0);
      }
    }

    loadBanners();

    const channel = supabase
      .channel('public-banners-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'banners' },
        () => loadBanners()
      )
      .subscribe();

    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (banners.length <= 1) return undefined;

    const timer = window.setInterval(() => {
      setActive((prev) => (prev + 1) % banners.length);
    }, 5500);

    return () => window.clearInterval(timer);
  }, [banners.length]);

  const current = useMemo(() => banners[active] || banners[0], [banners, active]);

  function prev() {
    setActive((index) => (index - 1 + banners.length) % banners.length);
  }

  function next() {
    setActive((index) => (index + 1) % banners.length);
  }

  return (
    <section className="relative overflow-hidden bg-[#F7F4EC]">
      <div className="mx-auto grid min-h-[620px] max-w-[1500px] grid-cols-1 items-center gap-10 px-8 py-20 lg:grid-cols-[1fr_620px]">
        <div className="relative z-10">
          <p className="mb-5 inline-flex rounded-full border border-[#B88737]/30 bg-white/70 px-4 py-2 text-sm font-black text-[#B88737]">
            WINNING EDU
          </p>

          <h1 className="text-[44px] font-black leading-[1.18] tracking-[-0.06em] text-[#0D1B2A] md:text-[60px]">
            {current.title}
            <br />
            <span className="text-[#B88737]">{current.highlight}</span>
          </h1>

          <p className="mt-7 max-w-[620px] text-lg font-bold leading-8 text-[#5F6875]">
            {current.subtitle}
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link
              to={current.button_link || '/signup'}
              className="inline-flex h-13 items-center justify-center rounded-xl bg-[#0D1B2A] px-8 py-4 text-base font-black text-white shadow-[0_14px_34px_rgba(13,27,42,0.25)] transition hover:bg-[#172B42]"
            >
              {current.button_text || '지금 시작하기'}
            </Link>

            <Link
              to="/services"
              className="inline-flex h-13 items-center justify-center rounded-xl border border-[#0D1B2A]/20 bg-white px-8 py-4 text-base font-black text-[#0D1B2A] transition hover:border-[#B88737] hover:text-[#B88737]"
            >
              서비스 보기
            </Link>
          </div>
        </div>

        <div className="relative">
          <div className="absolute -left-8 -top-8 h-40 w-40 rounded-full bg-[#B88737]/15 blur-3xl" />
          <div className="absolute -bottom-10 -right-10 h-56 w-56 rounded-full bg-[#0D1B2A]/10 blur-3xl" />

          <div className="relative overflow-hidden rounded-[32px] border border-white/70 bg-white shadow-[0_30px_80px_rgba(13,27,42,0.18)]">
            <img
              src={current.image_url}
              alt={current.title}
              className="h-[420px] w-full object-cover"
            />
          </div>

          {banners.length > 1 && (
            <div className="absolute bottom-5 right-5 flex gap-2">
              <button
                type="button"
                onClick={prev}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-white/90 text-[#0D1B2A] shadow hover:bg-white"
              >
                <ChevronLeft size={20} />
              </button>

              <button
                type="button"
                onClick={next}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-white/90 text-[#0D1B2A] shadow hover:bg-white"
              >
                <ChevronRight size={20} />
              </button>
            </div>
          )}
        </div>
      </div>

      {banners.length > 1 && (
        <div className="absolute bottom-8 left-1/2 flex -translate-x-1/2 gap-2">
          {banners.map((banner, index) => (
            <button
              key={banner.id}
              type="button"
              onClick={() => setActive(index)}
              className={`h-2 rounded-full transition ${
                active === index ? 'w-9 bg-[#B88737]' : 'w-2 bg-[#0D1B2A]/25'
              }`}
            />
          ))}
        </div>
      )}
    </section>
  );
}
