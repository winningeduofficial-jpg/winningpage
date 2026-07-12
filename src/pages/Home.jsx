import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Header from '../components/Header';
import { supabase } from '../lib/supabase';
import {
  ArrowRight,
  BarChart3,
  Brain,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Edit3,
  FileText,
  GraduationCap,
  Image as ImageIcon,
  Megaphone,
  Sparkles,
  Star,
  Target,
  Users,
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
];

const DEFAULT_SIDE_BANNERS = [];

const DEFAULT_ACCEPTANCE_CARDS = [];

const DEFAULT_MENTOR_STRATEGIES = [];

const FREE_DIAGNOSIS_SERVICE = {
  id: 'free-diagnosis',
  icon: Sparkles,
  title: '무료 진단',
  desc: '현재 성적과 학습 상태를 바탕으로 필요한 서비스를 확인합니다.',
  link: '/free-diagnosis',
};

const DEFAULT_SERVICES = [
  {
    icon: ClipboardList,
    title: '위닝 목표관리',
    desc: '학습 목표와 실천 기록을 체계적으로 관리합니다.',
    link: '/page/services-goal',
  },
  {
    icon: BarChart3,
    title: '위닝 수시예측',
    desc: '성적과 전형 데이터를 바탕으로 지원 가능성을 분석합니다.',
    link: '/page/services-susi-prediction',
  },
  {
    icon: Users,
    title: '위닝 콜멘토',
    desc: '학생 상황에 맞춘 멘토 피드백을 제공합니다.',
    link: '/page/services-content',
  },
  {
    icon: Edit3,
    title: '위닝AI 수행평가',
    desc: '과목과 진로를 연결한 수행평가 방향을 설계합니다.',
    link: '/page/services-ai-performance',
  },
  {
    icon: FileText,
    title: '위닝 세특관리',
    desc: '교과 활동의 연결성과 성장 흐름을 관리합니다.',
    link: '/page/services-record-coach',
  },
  {
    icon: Brain,
    title: '위닝 약점관리',
    desc: '학습 데이터로 취약 영역을 확인하고 보완합니다.',
    link: '/page/services-weakness',
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
  default: ClipboardList,
};

function normalizeArray(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  return [];
}

function preloadImage(src) {
  if (!src) return Promise.resolve('');

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(src);
    img.onerror = () => resolve(src);
    img.src = src;
  });
}

function todayKstYmd() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function getHiddenPopupIds() {
  try {
    const saved = localStorage.getItem('hiddenPopupIds');
    return saved ? JSON.parse(saved) : {};
  } catch {
    return {};
  }
}

function setHiddenPopupToday(id) {
  try {
    const today = todayKstYmd();
    const saved = getHiddenPopupIds();
    saved[id] = today;
    localStorage.setItem('hiddenPopupIds', JSON.stringify(saved));
  } catch {
    // localStorage 사용 불가 환경에서는 무시
  }
}

function isExternalLink(url) {
  return /^https?:\/\//i.test(String(url || ''));
}

function SmartLink({ to, className, children, openNewWindow = false, ...props }) {
  const destination = to || '#';

  if (isExternalLink(destination) || openNewWindow) {
    return (
      <a
        href={destination}
        target={openNewWindow ? '_blank' : '_self'}
        rel={openNewWindow ? 'noreferrer' : undefined}
        className={className}
        {...props}
      >
        {children}
      </a>
    );
  }

  return (
    <Link to={destination} className={className} {...props}>
      {children}
    </Link>
  );
}

function HomePopupLayer({ popups, onClose, onCloseToday }) {
  if (!popups.length) return null;

  return (
    <div className="fixed inset-0 z-[9999] overflow-y-auto bg-black/50 px-4 py-6">
      <div className="mx-auto flex min-h-full w-full max-w-[1480px] items-center justify-center gap-5">
        <div className="flex w-full flex-wrap items-center justify-center gap-5">
          {popups.slice(0, 3).map((popup) => {
            const imageSrc = popup.mobile_image_url || popup.image_url;
            const Wrapper = popup.url ? 'a' : 'div';
            const wrapperProps = popup.url
              ? {
                  href: popup.url,
                  target: popup.open_new_window ? '_blank' : '_self',
                  rel: popup.open_new_window ? 'noreferrer' : undefined,
                }
              : {};

            return (
              <div
                key={popup.id}
                className="flex w-[clamp(320px,28vw,440px)] shrink-0 flex-col overflow-hidden rounded-[24px] bg-white shadow-[0_28px_90px_rgba(0,0,0,0.36)]"
              >
                <Wrapper
                  {...wrapperProps}
                  className="block aspect-[3/4] w-full overflow-hidden bg-white"
                >
                  <picture>
                    {popup.mobile_image_url && (
                      <source media="(max-width: 768px)" srcSet={popup.mobile_image_url} />
                    )}
                    <img
                      src={imageSrc}
                      alt={popup.title || '팝업'}
                      className="h-full w-full object-contain"
                    />
                  </picture>
                </Wrapper>

                <div className="flex h-[62px] shrink-0 items-center justify-between border-t border-slate-100 bg-white px-5">
                  <button
                    type="button"
                    onClick={() => onCloseToday(popup.id)}
                    className="inline-flex items-center gap-2 text-[15px] font-bold text-[#0D1B2A]"
                  >
                    <span className="text-[22px] leading-none text-blue-500">✓</span>
                    오늘 하루 보지않기
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onClose(popup.id)}
                      className="text-[15px] font-bold text-[#111827]"
                    >
                      닫기
                    </button>
                    <button
                      type="button"
                      onClick={() => onClose(popup.id)}
                      className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-300 text-sm font-black text-white"
                      aria-label="팝업 닫기"
                    >
                      ×
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function AutoScrollRow({ items, renderItem, speed = 34, ariaLabel }) {
  const safeItems = Array.isArray(items) ? items : [];
  const trackItems = safeItems.length > 0 ? [...safeItems, ...safeItems] : [];

  if (safeItems.length === 0) return null;

  return (
    <div className="winning-marquee overflow-hidden" aria-label={ariaLabel}>
      <div
        className="winning-marquee-track flex w-max gap-5"
        style={{ animationDuration: `${speed}s` }}
      >
        {trackItems.map((item, index) => (
          <div
            key={`${item.id || item.title || 'item'}-${index}`}
            aria-hidden={index >= safeItems.length ? true : undefined}
          >
            {renderItem(item, index)}
          </div>
        ))}
      </div>
    </div>
  );
}

function AcceptanceCard({ item }) {
  return (
    <SmartLink
      to={item.link_url || '/reviews'}
      openNewWindow={!!item.open_new_window}
      className="group block w-[220px] shrink-0 overflow-hidden rounded-[22px] border border-[#173F7A]/15 bg-white shadow-[0_14px_32px_rgba(13,27,42,0.09)] transition hover:-translate-y-1 hover:shadow-[0_20px_44px_rgba(13,27,42,0.15)] sm:w-[250px]"
    >
      <div className="relative aspect-[4/5] overflow-hidden bg-[linear-gradient(145deg,#FFF4B8,#F5C94B)]">
        {item.image_url ? (
          <img
            src={item.image_url}
            alt={item.result_title || item.student_name || '합격 사례'}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center text-[#173F7A]">
            <GraduationCap size={48} strokeWidth={1.8} />
            <p className="mt-4 text-sm font-black">합격 사례 이미지</p>
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#071829]/95 via-[#071829]/75 to-transparent px-5 pb-5 pt-16 text-white">
          <p className="text-sm font-extrabold text-[#F3CB68]">
            {item.student_name || '합격생 선배'}
          </p>
          <h3 className="mt-1 break-keep text-lg font-black leading-6">
            {item.result_title || item.title || '합격 사례'}
          </h3>
          {item.description && (
            <p className="mt-2 line-clamp-2 text-xs font-semibold leading-5 text-white/78">
              {item.description}
            </p>
          )}
        </div>
      </div>
    </SmartLink>
  );
}

function MentorStrategyCard({ item }) {
  return (
    <SmartLink
      to={item.link_url || '/page/services-mentoring'}
      openNewWindow={!!item.open_new_window}
      className="group block w-[250px] shrink-0 overflow-hidden rounded-[22px] border border-[#173F7A]/15 bg-white shadow-[0_14px_32px_rgba(13,27,42,0.08)] transition hover:-translate-y-1 hover:shadow-[0_20px_44px_rgba(13,27,42,0.14)] sm:w-[280px]"
    >
      <div className="aspect-[5/4] overflow-hidden bg-[linear-gradient(145deg,#E7F4DF,#B8DBA5)]">
        {item.image_url ? (
          <img
            src={item.image_url}
            alt={item.title || '멘토 성공전략'}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center text-[#173F7A]">
            <Target size={45} strokeWidth={1.8} />
            <p className="mt-4 text-sm font-black">멘토 성공전략 이미지</p>
          </div>
        )}
      </div>
      <div className="p-5">
        <p className="text-xs font-black text-[#0B73C9]">
          {item.mentor_name || '위닝 멘토'}
        </p>
        <h3 className="mt-2 line-clamp-2 min-h-[52px] break-keep text-lg font-black leading-[1.45] text-[#0D1B2A]">
          {item.title || '성공전략'}
        </h3>
        {item.description && (
          <p className="mt-3 line-clamp-2 min-h-[40px] text-sm font-semibold leading-5 text-slate-500">
            {item.description}
          </p>
        )}
      </div>
    </SmartLink>
  );
}

function NewsPreviewCard({ title, rows, moreLink, emptyText }) {
  return (
    <section className="rounded-[20px] border border-[#173F7A]/20 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <h3 className="text-xl font-black text-[#0D1B2A]">{title}</h3>
        <Link to={moreLink} className="text-xs font-black text-[#0B73C9]">
          더보기
        </Link>
      </div>

      <div className="mt-3 space-y-1">
        {rows.length === 0 ? (
          <p className="py-5 text-center text-sm font-bold text-slate-400">{emptyText}</p>
        ) : (
          rows.slice(0, 3).map((row) => (
            <Link
              key={row.id}
              to={`${moreLink}?id=${row.id}`}
              className="block rounded-lg px-1 py-2.5 transition hover:bg-slate-50"
            >
              <p className="line-clamp-1 text-sm font-extrabold text-[#26364A]">
                {row.title}
              </p>
              <p className="mt-1 text-xs font-semibold text-slate-400">
                {formatDate(row.created_at)}
              </p>
            </Link>
          ))
        )}
      </div>
    </section>
  );
}

export default function Home() {
  const [banners, setBanners] = useState(DEFAULT_BANNERS);
  const [currentBanner, setCurrentBanner] = useState(0);
  const [bannerTimerKey, setBannerTimerKey] = useState(0);
  const [heroReady, setHeroReady] = useState(false);
  const [serviceItems, setServiceItems] = useState(DEFAULT_SERVICES);
  const [popups, setPopups] = useState([]);
  const [sideBanners, setSideBanners] = useState(DEFAULT_SIDE_BANNERS);
  const [acceptanceCards, setAcceptanceCards] = useState(DEFAULT_ACCEPTANCE_CARDS);
  const [mentorStrategies, setMentorStrategies] = useState(DEFAULT_MENTOR_STRATEGIES);
  const [companyNews, setCompanyNews] = useState([]);
  const [notices, setNotices] = useState([]);
  const serviceScrollRef = useRef(null);

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
        .map((item) => ({ ...item, image: item.image_url }));

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

    async function fetchPopups() {
      const today = todayKstYmd();
      const { data, error } = await supabase
        .from('popups')
        .select('id, title, url, image_url, mobile_image_url, open_new_window, start_date, end_date, sort_order, is_active')
        .eq('is_active', true)
        .or(`start_date.is.null,start_date.lte.${today}`)
        .or(`end_date.is.null,end_date.gte.${today}`)
        .order('sort_order', { ascending: true });

      if (!mounted) return;

      if (error) {
        console.error('팝업 조회 오류:', error);
        setPopups([]);
        return;
      }

      const hidden = getHiddenPopupIds();
      const visiblePopups = (data || [])
        .filter((popup) => popup.image_url || popup.mobile_image_url)
        .filter((popup) => hidden[popup.id] !== today);

      setPopups(visiblePopups);
    }

    fetchPopups();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    async function fetchRenewalContents() {
      const today = todayKstYmd();
      const [sideResult, acceptanceResult, mentorResult, companyResult, noticeResult] = await Promise.all([
        supabase
          .from('home_side_banners')
          .select('*')
          .eq('is_active', true)
          .or(`start_date.is.null,start_date.lte.${today}`)
          .or(`end_date.is.null,end_date.gte.${today}`)
          .order('sort_order', { ascending: true }),
        supabase
          .from('home_acceptance_cards')
          .select('*')
          .eq('is_active', true)
          .order('sort_order', { ascending: true }),
        supabase
          .from('home_mentor_strategies')
          .select('*')
          .eq('is_active', true)
          .order('sort_order', { ascending: true }),
        supabase
          .from('company_news')
          .select('id, title, created_at, is_pinned, sort_order')
          .eq('is_active', true)
          .order('is_pinned', { ascending: false })
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: false })
          .limit(5),
        supabase
          .from('notices')
          .select('id, title, created_at, is_pinned, sort_order')
          .eq('is_active', true)
          .order('is_pinned', { ascending: false })
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: false })
          .limit(5),
      ]);

      if (!mounted) return;

      if (sideResult.error) {
        console.error('우측 배너 조회 오류:', sideResult.error);
        setSideBanners([]);
      } else {
        const visible = (sideResult.data || []).filter(
          (item) => item.image_url || item.mobile_image_url,
        );
        setSideBanners(visible.slice(0, 3));
      }

      if (acceptanceResult.error) {
        console.error('합격생 카드 조회 오류:', acceptanceResult.error);
        setAcceptanceCards([]);
      } else {
        setAcceptanceCards(acceptanceResult.data || []);
      }

      if (mentorResult.error) {
        console.error('멘토 성공전략 조회 오류:', mentorResult.error);
        setMentorStrategies([]);
      } else {
        setMentorStrategies(mentorResult.data || []);
      }

      if (companyResult.error) {
        console.error('회사소식 조회 오류:', companyResult.error);
      } else {
        setCompanyNews(companyResult.data || []);
      }

      if (noticeResult.error) {
        console.error('공지사항 미리보기 조회 오류:', noticeResult.error);
      } else {
        setNotices(noticeResult.data || []);
      }
    }

    fetchRenewalContents();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    async function prepareHero() {
      const fontReady = document.fonts?.ready || Promise.resolve();
      const firstImage = banners[0]?.image || banners[0]?.image_url;
      await Promise.all([preloadImage(firstImage), fontReady]);

      if (mounted) setHeroReady(true);
      banners.slice(1).forEach((item) => preloadImage(item.image || item.image_url));
    }

    setHeroReady(false);
    prepareHero();

    return () => {
      mounted = false;
    };
  }, [banners]);

  useEffect(() => {
    if (!heroReady || banners.length <= 1) return undefined;

    const timer = window.setTimeout(() => {
      setCurrentBanner((prev) => (prev + 1) % banners.length);
      setBannerTimerKey((prev) => prev + 1);
    }, 10000);

    return () => window.clearTimeout(timer);
  }, [heroReady, banners.length, bannerTimerKey]);

  const banner = banners[currentBanner] || DEFAULT_BANNERS[0];

  const visibleServiceItems = useMemo(
    () => [
      FREE_DIAGNOSIS_SERVICE,
      ...serviceItems.filter(
        (service) =>
          service.link !== FREE_DIAGNOSIS_SERVICE.link &&
          service.title !== FREE_DIAGNOSIS_SERVICE.title,
      ),
    ].slice(0, 7),
    [serviceItems],
  );

  function resetBannerTimer() {
    setBannerTimerKey((prev) => prev + 1);
  }

  function goPrevBanner() {
    setCurrentBanner((prev) => (prev === 0 ? banners.length - 1 : prev - 1));
    resetBannerTimer();
  }

  function goNextBanner() {
    setCurrentBanner((prev) => (prev + 1) % banners.length);
    resetBannerTimer();
  }

  function goBanner(index) {
    setCurrentBanner(index);
    resetBannerTimer();
  }

  function closePopup(id) {
    setPopups((prev) => prev.filter((popup) => popup.id !== id));
  }

  function closePopupToday(id) {
    setHiddenPopupToday(id);
    closePopup(id);
  }

  function scrollServices(direction) {
    serviceScrollRef.current?.scrollBy({
      left: direction * 320,
      behavior: 'smooth',
    });
  }

  return (
    <>
      <style>{`
        @keyframes winning-home-marquee {
          from { transform: translateX(0); }
          to { transform: translateX(calc(-50% - 10px)); }
        }
        .winning-marquee-track {
          animation-name: winning-home-marquee;
          animation-timing-function: linear;
          animation-iteration-count: infinite;
          will-change: transform;
        }
        .winning-marquee:hover .winning-marquee-track {
          animation-play-state: paused;
        }
        @media (prefers-reduced-motion: reduce) {
          .winning-marquee-track { animation: none !important; }
        }
      `}</style>

      <Header />

      <HomePopupLayer
        popups={popups}
        onClose={closePopup}
        onCloseToday={closePopupToday}
      />

      <main className="min-h-screen bg-white pt-[84px] text-[#0D1B2A]">
        <section className="border-b border-[#E7ECF2] bg-[#F7F9FC] py-7 lg:py-10">
          <div
            className={`mx-auto grid max-w-[1500px] gap-5 px-5 sm:px-8 ${
              sideBanners.length > 0
                ? 'lg:grid-cols-[minmax(0,3fr)_minmax(245px,1fr)]'
                : 'lg:grid-cols-1'
            }`}
          >
            <div className="relative min-h-[360px] overflow-hidden rounded-[26px] bg-[#0D1B2A] shadow-[0_22px_55px_rgba(13,27,42,0.16)] lg:min-h-[470px]">
              <img
                src={banner.image || banner.image_url}
                alt={banner.title || '위닝에듀 메인 배너'}
                loading="eager"
                decoding="sync"
                fetchPriority="high"
                className="absolute inset-0 h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(5,18,32,0.88)_0%,rgba(5,18,32,0.66)_45%,rgba(5,18,32,0.12)_100%)]" />

              <div
                className={`relative z-10 flex h-full min-h-[360px] max-w-[780px] flex-col justify-center px-7 py-14 transition-opacity duration-500 sm:px-12 lg:min-h-[470px] lg:px-16 ${
                  heroReady ? 'opacity-100' : 'opacity-0'
                }`}
              >
                <p className="text-sm font-black text-[#F0C96B]">WINNING EDU</p>
                <h1 className="mt-4 break-keep text-[34px] font-black leading-[1.16] tracking-[-0.055em] text-white sm:text-[48px] lg:text-[58px]">
                  {banner.title}
                  {banner.highlight && (
                    <span className="mt-1 block text-[#F0C96B]">{banner.highlight}</span>
                  )}
                </h1>
                {banner.subtitle && (
                  <p className="mt-5 max-w-[700px] break-keep text-sm font-bold leading-7 text-white/82 sm:text-base lg:text-lg">
                    {banner.subtitle}
                  </p>
                )}
                <div className="mt-8">
                  <SmartLink
                    to={banner.button_link || '/signup'}
                    className="inline-flex h-12 items-center gap-2 rounded-xl bg-white px-6 text-sm font-black text-[#0D1B2A] shadow-lg transition hover:bg-[#F6E9C8]"
                  >
                    {banner.button_text || '지금 시작하기'}
                    <ArrowRight size={18} />
                  </SmartLink>
                </div>
              </div>

              {banners.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={goPrevBanner}
                    className="absolute left-3 top-1/2 z-20 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/25 bg-[#0D1B2A]/45 text-white backdrop-blur transition hover:bg-[#0D1B2A]/75 sm:left-5"
                    aria-label="이전 메인 배너"
                  >
                    <ChevronLeft size={25} />
                  </button>
                  <button
                    type="button"
                    onClick={goNextBanner}
                    className="absolute right-3 top-1/2 z-20 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/25 bg-[#0D1B2A]/45 text-white backdrop-blur transition hover:bg-[#0D1B2A]/75 sm:right-5"
                    aria-label="다음 메인 배너"
                  >
                    <ChevronRight size={25} />
                  </button>

                  <div className="absolute bottom-5 left-1/2 z-20 flex -translate-x-1/2 gap-2">
                    {banners.map((_, index) => (
                      <button
                        key={index}
                        type="button"
                        onClick={() => goBanner(index)}
                        className={`h-2.5 rounded-full transition-all ${
                          currentBanner === index ? 'w-9 bg-white' : 'w-2.5 bg-white/45'
                        }`}
                        aria-label={`메인 배너 ${index + 1}`}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>

            {sideBanners.length > 0 && (
              <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
                {sideBanners.slice(0, 3).map((item) => {
                const imageSrc = item.image_url || item.mobile_image_url;

                return (
                  <SmartLink
                    key={item.id}
                    to={item.link_url || '#'}
                    openNewWindow={!!item.open_new_window}
                    className="group relative min-h-[150px] overflow-hidden rounded-[22px] border border-[#173F7A]/15 bg-[#0D1B2A] shadow-[0_14px_36px_rgba(13,27,42,0.11)] lg:min-h-0"
                  >
                    {imageSrc ? (
                      <picture>
                        {item.mobile_image_url && (
                          <source media="(max-width: 768px)" srcSet={item.mobile_image_url} />
                        )}
                        <img
                          src={imageSrc}
                          alt={item.title || '이벤트 배너'}
                          className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
                        />
                      </picture>
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center bg-[#E8EEF6] text-[#173F7A]">
                        <ImageIcon size={32} />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-r from-[#06192D]/88 via-[#06192D]/55 to-[#06192D]/10" />
                    <div className="relative z-10 flex h-full min-h-[150px] flex-col justify-end p-5 text-white lg:min-h-0">
                      <h2 className="break-keep text-lg font-black leading-6">
                        {item.title || '새 소식'}
                      </h2>
                      {item.subtitle && (
                        <p className="mt-1 line-clamp-2 text-xs font-semibold leading-5 text-white/76">
                          {item.subtitle}
                        </p>
                      )}
                    </div>
                  </SmartLink>
                );
                })}
              </div>
            )}
          </div>
        </section>

        {acceptanceCards.length > 0 && (
          <section className="overflow-hidden py-14 lg:py-18">
            <div className="mx-auto max-w-[1500px] px-5 sm:px-8">
              <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-sm font-black text-[#D81F26]">SUCCESS STORIES</p>
                <h2 className="mt-2 text-[28px] font-black tracking-[-0.045em] text-[#D81F26] sm:text-[34px]">
                  합격생 선배들의 압도적 선택
                </h2>
              </div>
              <Link to="/reviews" className="text-sm font-black text-[#0D1B2A]">
                합격사례 전체보기 →
              </Link>
            </div>
          </div>

          <div className="mx-auto max-w-[1500px] px-5 sm:px-8">
            <AutoScrollRow
              items={acceptanceCards}
              speed={Math.max(28, acceptanceCards.length * 5)}
              ariaLabel="합격생 사례 자동 흐름"
              renderItem={(item) => <AcceptanceCard item={item} />}
            />
            </div>
          </section>
        )}

        <section className="border-y border-[#E7ECF2] bg-[#F7F9FC] py-9">
          <div className="mx-auto max-w-[1500px] px-5 sm:px-8">
            <div className="mb-4 flex items-center justify-between lg:hidden">
              <h2 className="text-xl font-black text-[#0D1B2A]">위닝에듀 서비스</h2>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => scrollServices(-1)}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-[#173F7A]/20 bg-white"
                  aria-label="서비스 이전"
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  type="button"
                  onClick={() => scrollServices(1)}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-[#173F7A]/20 bg-white"
                  aria-label="서비스 다음"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>

            <div
              ref={serviceScrollRef}
              className="flex snap-x gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:grid lg:grid-cols-7 lg:overflow-visible lg:pb-0"
            >
              {visibleServiceItems.map((service) => {
                const Icon = service.icon || ClipboardList;

                return (
                  <SmartLink
                    key={service.id || service.title}
                    to={service.link || '/services'}
                    className="group flex min-h-[150px] min-w-[190px] snap-start flex-col justify-between rounded-[18px] border border-[#173F7A]/12 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:border-[#173F7A]/30 hover:shadow-[0_16px_34px_rgba(13,27,42,0.10)] lg:min-w-0"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#EEF2F7] text-[#173F7A] transition group-hover:bg-[#173F7A] group-hover:text-white">
                      <Icon size={21} />
                    </div>
                    <div className="mt-6">
                      <h3 className="break-keep text-[15px] font-black leading-5 text-[#0D1B2A]">
                        {service.title}
                      </h3>
                      <p className="mt-2 line-clamp-2 text-xs font-semibold leading-5 text-slate-500">
                        {service.desc}
                      </p>
                    </div>
                  </SmartLink>
                );
              })}
            </div>
          </div>
        </section>

        <section className="overflow-hidden py-14 lg:py-18">
          <div className="mx-auto max-w-[1500px] px-5 sm:px-8">
            <div className="mb-7">
              <p className="text-sm font-black text-[#0B73C9]">MENTOR STRATEGY</p>
              <h2 className="mt-2 text-[28px] font-black tracking-[-0.045em] text-[#0B73C9] sm:text-[34px]">
                위닝 멘토와 완성하는 성공전략
                <span className="ml-2 text-sm font-black text-[#0B73C9]/75">
                  ({mentorStrategies.length}개)
                </span>
              </h2>
            </div>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
              <div className="min-w-0 overflow-hidden rounded-[24px] bg-[#F7F9FC] p-5 sm:p-6">
                {mentorStrategies.length > 0 ? (
                  <AutoScrollRow
                    items={mentorStrategies}
                    speed={Math.max(34, mentorStrategies.length * 5)}
                    ariaLabel="멘토 성공전략 자동 흐름"
                    renderItem={(item) => <MentorStrategyCard item={item} />}
                  />
                ) : (
                  <div className="flex min-h-[260px] items-center justify-center rounded-[18px] border border-dashed border-[#173F7A]/20 bg-white px-6 text-center text-sm font-bold text-slate-400">
                    등록된 멘토 성공전략이 없습니다.
                  </div>
                )}
              </div>

              <aside className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
                <NewsPreviewCard
                  title="회사소식"
                  rows={companyNews}
                  moreLink="/company-news"
                  emptyText="등록된 회사소식이 없습니다."
                />
                <NewsPreviewCard
                  title="공지사항"
                  rows={notices}
                  moreLink="/events"
                  emptyText="등록된 공지사항이 없습니다."
                />
              </aside>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
