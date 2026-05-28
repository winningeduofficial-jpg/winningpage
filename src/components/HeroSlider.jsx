import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function HeroSlider() {
  const [banners, setBanners] = useState([]);
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    async function fetchBanners() {
      const { data, error } = await supabase
        .from('banners')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (error) {
        console.error('배너 조회 오류:', error);
        return;
      }

      setBanners(data || []);
    }

    fetchBanners();
  }, []);

  useEffect(() => {
    if (banners.length <= 1) return;

    const timer = setInterval(() => {
      setCurrent((prev) => (prev + 1) % banners.length);
    }, 5000);

    return () => clearInterval(timer);
  }, [banners.length]);

  if (!banners.length) return null;

  const banner = banners[current];

  return (
    <section className="relative overflow-hidden bg-slate-950 pt-28 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(37,99,235,0.35),transparent_35%),radial-gradient(circle_at_bottom_left,rgba(245,158,11,0.25),transparent_30%)]" />

      <div className="relative mx-auto grid min-h-[680px] max-w-7xl grid-cols-1 items-center gap-12 px-6 py-20 lg:grid-cols-2">
        <div>
          <div className="mb-6 inline-flex items-center rounded-full border border-amber-400/40 bg-amber-400/10 px-4 py-2 text-sm font-semibold text-amber-300">
            데이터 기반 맞춤 학습 플랫폼
          </div>

          <h1 className="text-5xl font-extrabold leading-tight tracking-tight md:text-6xl">
            {banner.title}
            <br />
            <span className="bg-gradient-to-r from-blue-400 via-blue-500 to-amber-300 bg-clip-text text-transparent">
              {banner.highlight}
            </span>
          </h1>

          <p className="mt-6 max-w-xl text-lg leading-8 text-slate-300">
            {banner.subtitle}
          </p>

          <div className="mt-10 flex gap-4">
            <Link 
              to={banner.button_link || '/signup'}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-8 py-4 font-bold text-white shadow-xl shadow-blue-600/30 hover:bg-blue-500"
            >
              {banner.button_text || '무료로 시작하기'}
              <ArrowRight size={18} />
            </Link>

            <Link 
              to="/services"
              className="inline-flex items-center gap-2 rounded-xl border border-white/20 px-8 py-4 font-bold text-white hover:bg-white/10"
            >
              서비스 둘러보기
            </Link>
          </div>

          <div className="mt-10 flex gap-2">
            {banners.map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrent(index)}
                className={`h-2.5 rounded-full transition-all ${
                  current === index ? 'w-10 bg-blue-500' : 'w-2.5 bg-white/30'
                }`}
                aria-label={`배너 ${index + 1}`}
              />
            ))}
          </div>
        </div>

        <div className="relative">
          <div className="rounded-3xl border border-white/15 bg-white/10 p-4 shadow-2xl backdrop-blur-xl">
            <img
              src={banner.image_url}
              alt={banner.title}
              className="h-[420px] w-full rounded-2xl object-cover"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
