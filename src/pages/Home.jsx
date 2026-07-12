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

function AcceptanceCarousel({ items }) {
  const safeItems = Array.isArray(items)
    ? items.filter((item) => item?.image_url)
    : [];
  const scrollRef = useRef(null);

  if (safeItems.length === 0) return null;

  function move(direction) {
    const container = scrollRef.current;
    if (!container) return;

    const firstCard = container.querySelector('[data-acceptance-card]');
    const cardWidth = firstCard?.getBoundingClientRect().width || 250;
    const gap = 18;
    const nextLeft = container.scrollLeft + direction * (cardWidth + gap);
    const maxLeft = container.scrollWidth - container.clientWidth;

    if (direction > 0 && nextLeft >= maxLeft - 8) {
      container.scrollTo({ left: 0, behavior: 'smooth' });
      return;
    }

    if (direction < 0 && nextLeft <= 8) {
      container.scrollTo({ left: maxLeft, behavior: 'smooth' });
      return;
    }

    container.scrollBy({ left: direction * (cardWidth + gap), behavior: 'smooth' });
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => move(-1)}
        className="absolute left-0 top-1/2 z-20 flex h-11 w-11 -translate-x-1/3 -translate-y-1/2 items-center justify-center rounded-full border border-[#173F7A]/18 bg-white text-[#0D1B2A] shadow-[0_10px_28px_rgba(13,27,42,0.14)] transition hover:bg-[#0D1B2A] hover:text-white sm:h-12 sm:w-12"
        aria-label="이전 합격생 카드"
      >
        <ChevronLeft size={24} />
      </button>

      <div
        ref={scrollRef}
        className="flex snap-x snap-mandatory gap-[18px] overflow-x-auto px-2 py-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {safeItems.map((item, index) => (
          <AcceptanceCard key={item.id || `${item.image_url}-${index}`} item={item} />
        ))}
      </div>

      <button
        type="button"
        onClick={() => move(1)}
        className="absolute right-0 top-1/2 z-20 flex h-11 w-11 translate-x-1/3 -translate-y-1/2 items-center justify-center rounded-full border border-[#173F7A]/18 bg-white text-[#0D1B2A] shadow-[0_10px_28px_rgba(13,27,42,0.14)] transition hover:bg-[#0D1B2A] hover:text-white sm:h-12 sm:w-12"
        aria-label="다음 합격생 카드"
      >
        <ChevronRight size={24} />
      </button>
    </div>
  );
}

function AcceptanceCard({ item }) {
  return (
    <div
      data-acceptance-card
      className="group block w-[210px] shrink-0 snap-start overflow-hidden rounded-[22px] border border-[#173F7A]/12 bg-white shadow-[0_12px_30px_rgba(13,27,42,0.09)] transition duration-300 hover:-translate-y-2 hover:shadow-[0_22px_42px_rgba(13,27,42,0.16)] sm:w-[235px] lg:w-[250px]"
    >
      <div className="aspect-[4/5] overflow-hidden bg-[#F4F6F8]">
        {item.image_url ? (
          <img
            src={item.image_url}
            alt="합격생 사례"
            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.035]"
          />
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm font-black text-[#173F7A]">
            합격생 이미지
          </div>
        )}
      </div>
    </div>
  );
}

function MentorArchGallery({ items }) {
  const safeItems = Array.isArray(items)
    ? items.filter((item) => item?.image_url)
    : [];
  const [centerIndex, setCenterIndex] = useState(0);

  useEffect(() => {
    if (centerIndex > safeItems.length - 1) setCenterIndex(0);
  }, [safeItems.length, centerIndex]);

  if (safeItems.length === 0) return null;

  function move(direction) {
    setCenterIndex((current) => {
      const next = current + direction;
      if (next < 0) return safeItems.length - 1;
      if (next >= safeItems.length) return 0;
      return next;
    });
  }

  const slotOffsets = safeItems.length >= 5
    ? [-2, -1, 0, 1, 2]
    : Array.from({ length: safeItems.length }, (_, index) => {
        return index - Math.floor(safeItems.length / 2);
      });

  const visibleItems = slotOffsets.map((offset) => {
    const index = (centerIndex + offset + safeItems.length) % safeItems.length;
    return { item: safeItems[index], offset, sourceIndex: index };
  });

  const slotStyles = {
    '-2': {
      left: '0%', top: '124px', width: '29%', zIndex: 1,
      transform: 'perspective(1100px) rotateY(18deg) rotateZ(-2.4deg) scale(0.92)',
      opacity: 0.76,
    },
    '-1': {
      left: '14%', top: '72px', width: '35%', zIndex: 3,
      transform: 'perspective(1100px) rotateY(10deg) rotateZ(-1.2deg) scale(0.97)',
      opacity: 0.92,
    },
    '0': {
      left: '30%', top: '20px', width: '42%', zIndex: 7,
      transform: 'perspective(1100px) rotateY(0deg) rotateZ(0deg) scale(1)',
      opacity: 1,
    },
    '1': {
      left: '55%', top: '72px', width: '35%', zIndex: 3,
      transform: 'perspective(1100px) rotateY(-10deg) rotateZ(1.2deg) scale(0.97)',
      opacity: 0.92,
    },
    '2': {
      left: '72%', top: '124px', width: '29%', zIndex: 1,
      transform: 'perspective(1100px) rotateY(-18deg) rotateZ(2.4deg) scale(0.92)',
      opacity: 0.76,
    },
  };

  return (
    <div className="relative overflow-hidden rounded-[30px] border border-[#173F7A]/10 bg-[radial-gradient(circle_at_50%_34%,rgba(46,94,151,0.12),rgba(255,255,255,0)_48%),linear-gradient(180deg,#FBFCFE_0%,#F5F8FC_100%)] px-3 py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] sm:px-5 lg:px-7 lg:py-7">
      <div className="pointer-events-none absolute left-1/2 top-[62%] h-24 w-[70%] -translate-x-1/2 rounded-[50%] bg-[#173F7A]/10 blur-3xl" />
      <div className="pointer-events-none absolute inset-x-[12%] bottom-8 h-px bg-gradient-to-r from-transparent via-[#173F7A]/18 to-transparent" />

      <button
        type="button"
        onClick={() => move(-1)}
        className="absolute left-3 top-1/2 z-30 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-[#173F7A]/15 bg-white/95 text-[#0D1B2A] shadow-[0_12px_30px_rgba(13,27,42,0.18)] backdrop-blur transition hover:bg-[#0D1B2A] hover:text-white sm:left-5 sm:h-12 sm:w-12"
        aria-label="이전 멘토 성공전략"
      >
        <ChevronLeft size={25} />
      </button>

      <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto px-12 pb-3 pt-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:hidden">
        {safeItems.map((item, index) => (
          <div
            key={item.id || `${item.image_url}-${index}`}
            className="w-[86%] min-w-[86%] snap-center overflow-hidden rounded-[22px] border border-white bg-white shadow-[0_18px_42px_rgba(13,27,42,0.16)]"
          >
            <div className="aspect-[14/5] bg-slate-100">
              <img
                src={item.image_url}
                alt={`위닝 멘토 성공전략 ${index + 1}`}
                className="h-full w-full object-cover"
              />
            </div>
          </div>
        ))}
      </div>

      <div className="relative hidden h-[410px] lg:block" aria-label="멘토 성공전략 이미지">
        {visibleItems.map(({ item, offset, sourceIndex }) => {
          const style = slotStyles[String(offset)] || slotStyles['0'];
          const isCenter = offset === 0;

          return (
            <button
              type="button"
              key={`${item.id || item.image_url}-${sourceIndex}-${offset}`}
              onClick={() => setCenterIndex(sourceIndex)}
              className={`absolute overflow-hidden rounded-[26px] border bg-white text-left transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                isCenter
                  ? 'border-white shadow-[0_34px_80px_rgba(13,27,42,0.28),0_10px_24px_rgba(13,27,42,0.16)] ring-1 ring-[#E1B85A]/35'
                  : 'border-white/90 shadow-[0_20px_48px_rgba(13,27,42,0.19)]'
              }`}
              style={style}
              aria-label={`멘토 성공전략 ${sourceIndex + 1} 보기`}
            >
              <div className="aspect-[14/5] overflow-hidden bg-slate-100">
                <img
                  src={item.image_url}
                  alt={`위닝 멘토 성공전략 ${sourceIndex + 1}`}
                  className={`h-full w-full object-cover transition duration-700 ${
                    isCenter ? 'saturate-100 brightness-100' : 'saturate-[0.9] brightness-[0.94]'
                  }`}
                />
              </div>
              {isCenter && (
                <span className="pointer-events-none absolute inset-0 rounded-[26px] ring-2 ring-white/75" />
              )}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => move(1)}
        className="absolute right-3 top-1/2 z-30 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-[#173F7A]/15 bg-white/95 text-[#0D1B2A] shadow-[0_12px_30px_rgba(13,27,42,0.18)] backdrop-blur transition hover:bg-[#0D1B2A] hover:text-white sm:right-5 sm:h-12 sm:w-12"
        aria-label="다음 멘토 성공전략"
      >
        <ChevronRight size={25} />
      </button>
    </div>
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
          <section className="overflow-hidden border-b border-[#E7ECF2] bg-[linear-gradient(180deg,#FFFFFF_0%,#F8FAFD_100%)] py-14 lg:py-18">
            <div className="mx-auto max-w-[1500px] px-5 sm:px-8">
              <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-sm font-black tracking-[0.08em] text-[#B58A2A]">SUCCESS STORIES</p>
                  <h2 className="mt-2 text-[28px] font-black tracking-[-0.045em] text-[#0D1B2A] sm:text-[34px]">
                    합격생 선배들의 압도적 선택
                  </h2>
                </div>
                <Link
                  to="/reviews"
                  className="inline-flex items-center gap-1 text-sm font-black text-[#173F7A] transition hover:text-[#0D1B2A]"
                >
                  합격사례 전체보기 <ArrowRight size={16} />
                </Link>
              </div>

              <AcceptanceCarousel items={acceptanceCards} />
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

        <section className="overflow-hidden py-14 lg:py-20">
          <div className="mx-auto max-w-[1500px] px-5 sm:px-8">
            <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_300px]">
              <div className="min-w-0">
                {mentorStrategies.length > 0 && (
                  <>
                    <div className="mb-6">
                      <p className="text-sm font-black tracking-[0.08em] text-[#B58A2A]">
                        MENTOR STRATEGY
                      </p>
                      <h2 className="mt-2 break-keep text-[28px] font-black tracking-[-0.045em] text-[#0D1B2A] sm:text-[36px]">
                        위닝 멘토와 완성하는 성공전략
                      </h2>
                    </div>
                    <MentorArchGallery items={mentorStrategies} />
                  </>
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

