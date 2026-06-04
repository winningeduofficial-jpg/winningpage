import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Header from '../components/Header';
import { supabase } from '../lib/supabase';
import {
  ArrowRight,
  PlayCircle,
  Users,
  TrendingUp,
  BarChart3,
  ShieldCheck,
  ClipboardList,
  PencilLine,
  FileText,
  Star,
  Award,
  CheckCircle2,
  GraduationCap,
  BookOpenCheck,
  Target,
  Brain,
  Edit3,
} from 'lucide-react';

const DEFAULT_BANNERS = [
  {
    title: '데이터가 발견하고,',
    highlight: '위닝 서포터가 성장을 완성합니다',
    subtitle:
      '학생 개인별 학습 분석부터 대입 전략까지, 위닝에듀가 최적의 길을 제시합니다.',
    image: '/images/banner-1.png',
    image_url: '/images/banner-1.png',
  },
  {
    title: '학습 기록이 쌓이면,',
    highlight: '입시 전략이 더 정교해집니다',
    subtitle:
      '매일의 공부 데이터를 분석해 주간 리포트와 맞춤 전략으로 연결합니다.',
    image: '/images/banner-2.png',
    image_url: '/images/banner-2.png',
  },
  {
    title: '수행평가와 세특까지,',
    highlight: '학생부의 방향을 설계합니다',
    subtitle:
      '진로와 과목을 연결해 학생부에 남는 탐구 흐름을 만듭니다.',
    image: '/images/banner-3.png',
    image_url: '/images/banner-3.png',
  },
  {
    title: '부모님이 확인하는',
    highlight: '성장 리포트 시스템',
    subtitle:
      '학습 시간, 집중도, 과목 비중, 합격 가능성 변화를 한눈에 확인합니다.',
    image: '/images/banner-4.png',
    image_url: '/images/banner-4.png',
  },
];

const stats = [
  { icon: Users, value: '1,240+', label: '누적 회원 수' },
  { icon: TrendingUp, value: '18.7점', label: '평균 성적 향상' },
  { icon: BarChart3, value: '86.7%', label: '상위권 대학 합격률' },
  { icon: ShieldCheck, value: '1,254개', label: '주요대학 합격 사례' },
  { icon: Award, value: '96.2%', label: '이용자 만족도' },
];

const DEFAULT_SERVICES = [
  {
    icon: ClipboardList,
    title: '위닝 생기부 분석',
    desc: '학생부 데이터를 심층 분석하여 맞춤형 전략을 제시합니다.',
    link: '/services/record-analysis',
  },
  {
    icon: Users,
    title: '학습 관리 서비스',
    desc: '학습 습관부터 성적 관리까지 맞춤형으로 지원합니다.',
    link: '/services/study-management',
  },
  {
    icon: PencilLine,
    title: '수행/세특팅',
    desc: '수행평가 아이디어부터 완성까지 체계적으로 지원합니다.',
    link: '/services/assessment',
  },
  {
    icon: FileText,
    title: '세특 문장 가이드',
    desc: '교과별 핵심 문장 예시로 세특 작성 실력을 높여드립니다.',
    link: '/services/record-guide',
  },
  {
    icon: BarChart3,
    title: '위닝 생기부 분석 리포트',
    desc: '정량 분석 리포트로 합격 가능성과 보완점을 확인합니다.',
    link: '/services/report',
  },
  {
    icon: Star,
    title: '수시카드 추천',
    desc: '학생 맞춤 수시 전략과 지원 대학 카드를 추천합니다.',
    link: '/services/susi-card',
  },
];

const serviceIconMap = {
  target: Target,
  brain: Brain,
  file: FileText,
  graduation: GraduationCap,
  chart: BarChart3,
  users: Users,

  clipboard: ClipboardList,
  edit: Edit3,
  star: Star,
  default: ClipboardList
};

const proofCards = [
  ['김OO 학생', '서울대학교 경영학과', '체계적인 관리로 학생부 흐름을 완성했습니다.'],
  ['이OO 학생', '연세대학교 의예과', '생기부 분석과 맞춤 전략이 합격에 큰 도움이 되었습니다.'],
  ['박OO 학생', '고려대학교 컴퓨터학과', 'AI 분석과 컨설팅으로 전략을 명확히 잡았습니다.'],
];

function preloadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();

    img.onload = () => resolve(src);
    img.onerror = () => resolve(src);
    img.src = src;
  });
}

export default function Home() {
  const [banners, setBanners] = useState(DEFAULT_BANNERS);
  const [currentBanner, setCurrentBanner] = useState(0);
  const [heroReady, setHeroReady] = useState(false);
  const [serviceItems, setServiceItems] = useState(DEFAULT_SERVICES);

  useEffect(() => {
    let mounted = true;

    async function fetchBanners() {
      const { data, error } = await supabase
        .from('banners')
        .select('id, title, highlight, subtitle, image_url, button_text, button_link, sort_order, is_active')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (!mounted) return;

      if (error) {
        console.error('배너 조회 오류:', error);
        setBanners(DEFAULT_BANNERS);
        return;
      }

      const normalized = (data || [])
        .filter((item) => item.image_url)
        .map((item) => ({
          ...item,
          image: item.image_url
        }));

      setBanners(normalized.length ? normalized : DEFAULT_BANNERS);
      setCurrentBanner(0);
    }

    fetchBanners();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    async function fetchServices() {
      const { data, error } = await supabase
  .from('program_categories')
  .select('id, name, description, link, icon, sort_order, is_active')
  .eq('is_active', true)
  .order('sort_order', { ascending: true });

      if (!mounted) return;

      if (error) {
        console.error('서비스 조회 오류:', error);
        setServiceItems(DEFAULT_SERVICES);
        return;
      }

      const normalized = (data || []).map((service) => ({
  id: service.id,
  icon: serviceIconMap[service.icon] || ClipboardList,
  title: service.name,
  desc: service.description,
  link: service.link || '/services',
}));

      setServiceItems(normalized.length ? normalized : DEFAULT_SERVICES);
    }

    fetchServices();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    async function prepareHero() {
      const fontReady =
        document.fonts && document.fonts.ready
          ? document.fonts.ready
          : Promise.resolve();
      const firstImage = banners[0]?.image || banners[0]?.image_url;

      await Promise.all([preloadImage(firstImage), fontReady]);

      if (mounted) {
        setHeroReady(true);
      }

      banners.slice(1).forEach((item) => {
        preloadImage(item.image || item.image_url);
      });
    }

    setHeroReady(false);
    prepareHero();

    return () => {
      mounted = false;
    };
  }, [banners]);

  useEffect(() => {
    if (!heroReady) return undefined;

    const timer = setInterval(() => {
      setCurrentBanner((prev) => (prev + 1) % banners.length);
    }, 5000);

    return () => clearInterval(timer);
  }, [heroReady, banners.length]);

  const banner = banners[currentBanner];

  return (
   <>
    <Header />
    <main className="bg-[#F8F7F3] pt-[84px]">
      <section className="relative isolate overflow-hidden bg-[#F7F3EA] text-white">
        <div className="relative mx-auto w-full max-w-[2172px] overflow-hidden bg-[#F7F3EA]">
          <div className="relative aspect-[2172/724] w-full">
            <img
              src={banner.image || banner.image_url}
              alt=""
              loading="eager"
              decoding="sync"
              fetchPriority="high"
              className="absolute inset-0 h-full w-full object-cover object-center"
            />

            <div className="absolute inset-y-0 left-0 z-[1] w-[62%] bg-[linear-gradient(90deg,rgba(13,27,42,0.80)_0%,rgba(13,27,42,0.60)_38%,rgba(13,27,42,0.32)_68%,rgba(13,27,42,0)_100%)]" />
            <div className="absolute inset-y-0 left-0 z-[2] w-[52%] bg-[radial-gradient(circle_at_28%_40%,rgba(0,0,0,0.26),transparent_66%)]" />

            <div
              className={`absolute left-[clamp(72px,4.7vw,102px)] top-[clamp(86px,5.65vw,122px)] z-10 w-[clamp(600px,42vw,850px)] transform-none ${
                heroReady ? 'opacity-100' : 'opacity-0'
              }`}
            >
              <div className="mb-[clamp(14px,1.35vw,24px)] inline-flex h-[44px] items-center gap-2 rounded-full border border-[#D6B06A]/55 bg-[#0D1B2A]/68 px-5 text-[clamp(12px,0.75vw,15px)] font-extrabold text-[#D6B06A] shadow-[0_8px_24px_rgba(0,0,0,0.18)] backdrop-blur">
                <Star size={15} fill="currentColor" />
                데이터 기반 맞춤 학습 플랫폼
              </div>

              <h1 className="h-[clamp(120px,8.1vw,166px)] font-black leading-[1.12] tracking-[-0.045em] text-[clamp(38px,3.2vw,70px)] drop-shadow-[0_4px_18px_rgba(0,0,0,0.52)]">
                <span className="block whitespace-nowrap text-white">
                  {banner.title}
                </span>
                <span className="block whitespace-nowrap text-[#D6B06A] drop-shadow-[0_3px_14px_rgba(0,0,0,0.40)]">
                  {banner.highlight}
                </span>
              </h1>

              <p className="mt-[clamp(6px,0.75vw,14px)] h-[clamp(48px,3.5vw,70px)] max-w-[790px] break-keep text-[clamp(14px,1vw,20px)] font-extrabold leading-[1.65] text-white drop-shadow-[0_3px_12px_rgba(0,0,0,0.52)]">
                {banner.subtitle}
              </p>

              <div className="mt-[clamp(24px,2vw,36px)] flex h-[56px] flex-wrap gap-4">
                <Link
                  to={banner.button_link || "/signup"}
                  className="inline-flex h-[56px] items-center gap-2 rounded-xl bg-white px-[clamp(22px,1.65vw,32px)] text-[clamp(14px,0.9vw,18px)] font-black text-[#0D1B2A] shadow-[0_16px_36px_rgba(0,0,0,0.20)] transition hover:bg-[#F2EBDD]"
                >
                  {banner.button_text || '지금 시작하기'}
                  <ArrowRight size={20} />
                </Link>

                <Link
                  to="/services"
                  className="inline-flex h-[56px] items-center gap-2 rounded-xl border border-white/38 bg-[#0D1B2A]/34 px-[clamp(22px,1.65vw,32px)] text-[clamp(14px,0.9vw,18px)] font-black text-white shadow-[0_14px_32px_rgba(0,0,0,0.18)] backdrop-blur transition hover:border-white/65 hover:bg-[#0D1B2A]/46"
                >
                  서비스 둘러보기
                  <PlayCircle size={20} />
                </Link>
              </div>

              <div className="mt-[clamp(22px,1.8vw,32px)] flex h-[50px] items-center gap-4">
                <div className="flex -space-x-3">
                  {['김', '이', '박', '최'].map((item) => (
                    <div
                      key={item}
                      className="flex h-[clamp(40px,2.35vw,48px)] w-[clamp(40px,2.35vw,48px)] items-center justify-center rounded-full border-2 border-[#0D1B2A] bg-white text-sm font-black text-[#0D1B2A] shadow-md"
                    >
                      {item}
                    </div>
                  ))}
                </div>

                <p className="text-[clamp(12px,0.82vw,16px)] font-bold leading-[1.45] text-white drop-shadow-[0_3px_10px_rgba(0,0,0,0.45)]">
                  <span className="text-[clamp(16px,1.05vw,20px)] font-black text-[#D6B06A]">
                    1,240+
                  </span>{' '}
                  학생들이
                  <br />
                  위닝에듀와 함께 하고 있어요!
                </p>
              </div>

              <div className="mt-[clamp(18px,1.45vw,28px)] flex h-[12px] gap-2">
                {banners.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => setCurrentBanner(index)}
                    className={`h-2.5 rounded-full transition-all ${
                      currentBanner === index
                        ? 'w-10 bg-white'
                        : 'w-2.5 bg-white/35'
                    }`}
                    aria-label={`배너 ${index + 1}`}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="relative z-30 mx-auto mt-8 max-w-[1500px] px-8">
        <div className="grid overflow-hidden rounded-[24px] border border-[#0D1B2A]/10 bg-white shadow-[0_24px_60px_rgba(13,27,42,0.13)] md:grid-cols-5">
          {stats.map((item, index) => {
            const Icon = item.icon;

            return (
              <div
                key={item.label}
                className={`flex items-center justify-center gap-4 px-6 py-5 ${
                  index !== stats.length - 1
                    ? 'border-b border-slate-100 md:border-b-0 md:border-r'
                    : ''
                }`}
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#0D1B2A]/6 text-[#0D1B2A]">
                  <Icon size={25} strokeWidth={2.25} />
                </div>

                <div>
                  <p className="text-2xl font-black text-[#0D1B2A]">
                    {item.value}
                  </p>
                  <p className="mt-1 text-sm font-bold text-slate-500">
                    {item.label}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mx-auto max-w-[1500px] px-8 py-14">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <p className="text-sm font-black text-[#B88737]">
              위닝에듀 핵심 서비스
            </p>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-[#0D1B2A]">
              위닝 서포터와 완성하는 대입 성공 전략
            </h2>
          </div>

          <Link
            to="/services"
            className="rounded-xl border border-[#0D1B2A]/10 bg-white px-5 py-3 text-sm font-black text-[#0D1B2A] shadow-sm transition hover:border-[#0D1B2A]/25 hover:bg-[#F7F5EF]"
          >
            모든 서비스 보기 →
          </Link>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {serviceItems.map((service) => {
            const Icon = service.icon;

            return (
              <Link
                key={service.id || service.title}
                to={service.link}
                className="group rounded-2xl border border-[#0D1B2A]/10 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:border-[#0D1B2A]/20 hover:shadow-[0_22px_50px_rgba(13,27,42,0.12)]"
              >
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[#0D1B2A]/6 text-[#0D1B2A] transition group-hover:bg-[#0D1B2A] group-hover:text-white">
                  <Icon size={24} />
                </div>

                <h3 className="min-h-[48px] text-base font-black leading-6 text-[#0D1B2A]">
                  {service.title}
                </h3>

                <p className="mt-2 min-h-[72px] text-sm font-medium leading-6 text-slate-600">
                  {service.desc}
                </p>

                <p className="mt-4 text-sm font-black text-[#0D1B2A]">
                  자세히 보기 →
                </p>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="mx-auto grid max-w-[1500px] gap-6 px-8 pb-20 lg:grid-cols-[1.1fr_1.3fr_1fr]">
        <div className="rounded-3xl border border-[#0D1B2A]/10 bg-white p-7 shadow-sm">
          <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#0D1B2A] text-white">
            <CheckCircle2 size={25} />
          </div>

          <h3 className="text-2xl font-black text-[#0D1B2A]">
            위닝에듀와 함께 하면 달라집니다
          </h3>

          <div className="mt-6 space-y-4">
            {[
              ['학생 맞춤 전략', '보통', '매우 높음'],
              ['생기부 완성도', '보통', '매우 높음'],
              ['합격 가능성', '보통', '매우 높음'],
              ['관리/피드백', '불규칙', '지속성 & 체계적'],
            ].map(([label, before, after]) => (
              <div key={label}>
                <div className="mb-2 flex justify-between text-sm font-bold text-slate-600">
                  <span>{label}</span>
                  <span>
                    {before} → <span className="text-[#0D1B2A]">{after}</span>
                  </span>
                </div>
                <div className="h-3 rounded-full bg-[#E9E6DE]">
                  <div className="h-3 w-[86%] rounded-full bg-[#0D1B2A]" />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-[#0D1B2A]/10 bg-white p-7 shadow-sm">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="mb-1 text-sm font-black text-[#B88737]">
                합격 사례
              </p>
              <h3 className="text-2xl font-black text-[#0D1B2A]">
                합격으로 증명하는 위닝에듀
              </h3>
            </div>
            <a href="/reviews" className="text-sm font-black text-[#0D1B2A]">
              더 많은 합격사례 보기 →
            </a>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {proofCards.map(([name, result, desc]) => (
              <article
                key={name}
                className="rounded-2xl border border-[#0D1B2A]/10 bg-[#FAF9F5] p-4"
              >
                <div className="mb-4 flex h-24 items-center justify-center rounded-xl bg-[#0D1B2A] text-white">
                  <GraduationCap size={34} />
                </div>
                <p className="font-black text-[#0D1B2A]">{name}</p>
                <p className="mt-1 text-sm font-black text-[#B88737]">
                  {result}
                </p>
                <p className="mt-3 text-sm font-medium leading-6 text-slate-600">
                  {desc}
                </p>
              </article>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-[#0D1B2A]/10 bg-[#0D1B2A] p-7 text-white shadow-[0_24px_60px_rgba(13,27,42,0.18)]">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="mb-1 text-sm font-black text-[#D6B06A]">Review</p>
              <h3 className="text-2xl font-black">이용자 후기</h3>
            </div>
            <a href="/reviews" className="text-sm font-black text-[#D6B06A]">
              더보기
            </a>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/8 p-6 text-center backdrop-blur">
            <BookOpenCheck className="mx-auto mb-4 text-[#D6B06A]" size={30} />
            <p className="text-base font-bold leading-8 text-white/88">
              AI 분석과 컨설팅 덕분에 제 강점을 정확히 알게 되었고,
              목표 대학에 합격할 수 있었습니다.
            </p>

            <div className="mt-5 border-t border-white/10 pt-4">
              <p className="font-black text-white">김OO 학생</p>
              <p className="mt-1 text-sm font-bold text-[#D6B06A]">
                서울대학교 합격
              </p>
            </div>
          </div>
        </div>
      </section>
   </main>
  </>
);
}
