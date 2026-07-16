import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Header from '../components/Header';
import SiteFooter from '../components/SiteFooter';
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
  Star,
  Target,
  Users,
} from 'lucide-react';


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
  const safeItems = useMemo(
    () => (Array.isArray(items) ? items.filter((item) => item?.image_url) : []),
    [items],
  );

  const scrollRef = useRef(null);
  const animationFrameRef = useRef(null);
  const manualPauseTimerRef = useRef(null);
  const hoverPausedRef = useRef(false);
  const focusPausedRef = useRef(false);
  const manualPausedRef = useRef(false);

  const repeatedItems = useMemo(() => {
    if (safeItems.length === 0) return [];
    return [...safeItems, ...safeItems, ...safeItems];
  }, [safeItems]);

  function getStep(container) {
    const firstCard = container?.querySelector('[data-acceptance-card]');
    const cardWidth = firstCard?.getBoundingClientRect().width || 250;
    return cardWidth + 18;
  }

  function normalizePosition(container) {
    if (!container || safeItems.length === 0) return;

    const cycleWidth = container.scrollWidth / 3;
    if (!cycleWidth) return;

    if (container.scrollLeft >= cycleWidth * 2) {
      container.scrollLeft -= cycleWidth;
    } else if (container.scrollLeft < cycleWidth * 0.5) {
      container.scrollLeft += cycleWidth;
    }
  }

  function move(direction) {
    const container = scrollRef.current;
    if (!container || safeItems.length <= 1) return;

    manualPausedRef.current = true;
    window.clearTimeout(manualPauseTimerRef.current);

    container.scrollBy({
      left: direction * getStep(container),
      behavior: 'smooth',
    });

    manualPauseTimerRef.current = window.setTimeout(() => {
      normalizePosition(container);
      manualPausedRef.current = false;
    }, 700);
  }

  useEffect(() => {
    const container = scrollRef.current;
    if (!container || safeItems.length === 0) return undefined;

    const positionAtMiddle = () => {
      const cycleWidth = container.scrollWidth / 3;
      if (cycleWidth) {
        container.scrollTo({ left: cycleWidth, behavior: 'auto' });
      }
    };

    const frame = window.requestAnimationFrame(positionAtMiddle);
    window.addEventListener('resize', positionAtMiddle);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', positionAtMiddle);
    };
  }, [safeItems.length]);

  useEffect(() => {
    if (safeItems.length <= 1) return undefined;

    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    if (reduceMotion) return undefined;

    let previousTime = performance.now();

    const animate = (currentTime) => {
      const container = scrollRef.current;
      const delta = Math.min(currentTime - previousTime, 50);
      previousTime = currentTime;

      const isPaused =
        hoverPausedRef.current ||
        focusPausedRef.current ||
        manualPausedRef.current;

      if (container && !isPaused) {
        container.scrollLeft += delta * 0.025;
        normalizePosition(container);
      }

      animationFrameRef.current = window.requestAnimationFrame(animate);
    };

    animationFrameRef.current = window.requestAnimationFrame(animate);

    return () => {
      window.cancelAnimationFrame(animationFrameRef.current);
    };
  }, [safeItems.length]);

  useEffect(
    () => () => {
      window.cancelAnimationFrame(animationFrameRef.current);
      window.clearTimeout(manualPauseTimerRef.current);
    },
    [],
  );

  if (safeItems.length === 0) return null;

  return (
    <div
      className="relative"
      onMouseEnter={() => {
        hoverPausedRef.current = true;
      }}
      onMouseLeave={() => {
        hoverPausedRef.current = false;
      }}
      onFocusCapture={() => {
        focusPausedRef.current = true;
      }}
      onBlurCapture={() => {
        focusPausedRef.current = false;
      }}
    >
      {safeItems.length > 1 && (
        <button
          type="button"
          onClick={() => move(-1)}
          className="absolute left-0 top-1/2 z-20 flex h-11 w-11 -translate-x-1/3 -translate-y-1/2 items-center justify-center rounded-full border border-[#D9E1EB] bg-white text-[#10243A] shadow-[0_10px_28px_rgba(13,27,42,0.13)] transition hover:border-[#173F7A] hover:bg-[#173F7A] hover:text-white sm:h-12 sm:w-12"
          aria-label="이전 합격생 카드"
        >
          <ChevronLeft size={24} />
        </button>
      )}

      <div
        ref={scrollRef}
        className="flex gap-[18px] overflow-x-auto px-2 py-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {repeatedItems.map((item, index) => (
          <AcceptanceCard
            key={`${item.id || item.image_url}-${index}`}
            item={item}
          />
        ))}
      </div>

      {safeItems.length > 1 && (
        <button
          type="button"
          onClick={() => move(1)}
          className="absolute right-0 top-1/2 z-20 flex h-11 w-11 translate-x-1/3 -translate-y-1/2 items-center justify-center rounded-full border border-[#D9E1EB] bg-white text-[#10243A] shadow-[0_10px_28px_rgba(13,27,42,0.13)] transition hover:border-[#173F7A] hover:bg-[#173F7A] hover:text-white sm:h-12 sm:w-12"
          aria-label="다음 합격생 카드"
        >
          <ChevronRight size={24} />
        </button>
      )}
    </div>
  );
}

function AcceptanceCard({ item }) {
  return (
    <Link
      to={item.link_url || '/admission/susi-jungsi'}
      data-acceptance-card
      aria-label={`${item.title || '합격 사례'} 게시글 보기`}
      className="group block w-[210px] shrink-0 overflow-hidden rounded-[20px] border border-[#DDE5EE] bg-white shadow-[0_9px_24px_rgba(13,27,42,0.08)] transition duration-300 hover:-translate-y-1.5 hover:border-[#BFCBDC] hover:shadow-[0_18px_38px_rgba(13,27,42,0.14)] focus:outline-none focus:ring-2 focus:ring-[#173F7A]/35 sm:w-[235px] lg:w-[250px]"
    >
      <div className="aspect-[4/5] overflow-hidden bg-[#F4F6F8]">
        <img
          src={item.image_url}
          alt={item.title || '합격생 사례'}
          className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.025]"
        />
      </div>
    </Link>
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
    setCenterIndex((current) =>
      (current + direction + safeItems.length) % safeItems.length,
    );
  }

  const slotOffsets = safeItems.length >= 5
    ? [-2, -1, 0, 1, 2]
    : Array.from({ length: safeItems.length }, (_, index) =>
        index - Math.floor(safeItems.length / 2),
      );

  const visibleItems = slotOffsets.map((offset) => {
    const index = (centerIndex + offset + safeItems.length) % safeItems.length;
    return { item: safeItems[index], offset, sourceIndex: index };
  });

  const slotStyles = {
    '-2': {
      left: '0%', top: '92px', width: '25%', zIndex: 1,
      transform: 'translateY(8px) scale(0.92)', opacity: 0.72,
    },
    '-1': {
      left: '15%', top: '52px', width: '31%', zIndex: 3,
      transform: 'translateY(3px) scale(0.97)', opacity: 0.92,
    },
    '0': {
      left: '31%', top: '14px', width: '38%', zIndex: 7,
      transform: 'translateY(0) scale(1)', opacity: 1,
    },
    '1': {
      left: '54%', top: '52px', width: '31%', zIndex: 3,
      transform: 'translateY(3px) scale(0.97)', opacity: 0.92,
    },
    '2': {
      left: '75%', top: '92px', width: '25%', zIndex: 1,
      transform: 'translateY(8px) scale(0.92)', opacity: 0.72,
    },
  };

  return (
    <div className="relative px-1 pb-2 pt-1 sm:px-3">
      <div className="pointer-events-none absolute left-1/2 top-[52%] h-28 w-[72%] -translate-x-1/2 rounded-[50%] bg-[radial-gradient(ellipse_at_center,rgba(30,64,107,0.16)_0%,rgba(30,64,107,0.05)_48%,transparent_72%)] blur-xl" />
      <div className="pointer-events-none absolute left-1/2 top-[49%] h-[210px] w-[82%] -translate-x-1/2 rounded-[50%] border-t border-[#DDE6F0]" />

      {safeItems.length > 1 && (
        <button
          type="button"
          onClick={() => move(-1)}
          className="absolute left-0 top-1/2 z-30 flex h-11 w-11 -translate-x-1/4 -translate-y-1/2 items-center justify-center rounded-full border border-[#D9E1EB] bg-white text-[#10243A] shadow-[0_10px_28px_rgba(13,27,42,0.13)] transition hover:border-[#173F7A] hover:bg-[#173F7A] hover:text-white sm:h-12 sm:w-12"
          aria-label="이전 멘토 성공전략"
        >
          <ChevronLeft size={24} />
        </button>
      )}

      <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto px-10 pb-3 pt-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:hidden">
        {safeItems.map((item, index) => (
          <button
            type="button"
            key={item.id || `${item.image_url}-${index}`}
            onClick={() => setCenterIndex(index)}
            className="w-[88%] min-w-[88%] snap-center overflow-hidden rounded-[18px] border border-[#DCE4ED] bg-white shadow-[0_14px_34px_rgba(13,27,42,0.13)]"
          >
            <div className="aspect-[14/5] bg-slate-100">
              <img
                src={item.image_url}
                alt={`위닝 멘토 성공전략 ${index + 1}`}
                className="h-full w-full object-cover"
              />
            </div>
          </button>
        ))}
      </div>

      <div className="relative hidden h-[300px] lg:block" aria-label="멘토 성공전략 이미지">
        {visibleItems.map(({ item, offset, sourceIndex }) => {
          const style = slotStyles[String(offset)] || slotStyles['0'];
          const isCenter = offset === 0;

          return (
            <button
              type="button"
              key={`${item.id || item.image_url}-${sourceIndex}-${offset}`}
              onClick={() => setCenterIndex(sourceIndex)}
              className={`absolute overflow-hidden rounded-[20px] border bg-white text-left transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                isCenter
                  ? 'border-white shadow-[0_28px_62px_rgba(13,27,42,0.23),0_7px_18px_rgba(13,27,42,0.12)] ring-1 ring-[#D9B45B]/45'
                  : 'border-[#E1E7EE] shadow-[0_13px_32px_rgba(13,27,42,0.13)]'
              }`}
              style={style}
              aria-label={`멘토 성공전략 ${sourceIndex + 1} 보기`}
            >
              <div className="aspect-[14/5] overflow-hidden bg-slate-100">
                <img
                  src={item.image_url}
                  alt={`위닝 멘토 성공전략 ${sourceIndex + 1}`}
                  className={`h-full w-full object-cover transition duration-500 ${
                    isCenter ? 'brightness-100 saturate-100' : 'brightness-[0.97] saturate-[0.94]'
                  }`}
                />
              </div>
              {isCenter && (
                <span className="pointer-events-none absolute inset-0 rounded-[20px] ring-1 ring-white/80" />
              )}
            </button>
          );
        })}
      </div>

      {safeItems.length > 1 && (
        <button
          type="button"
          onClick={() => move(1)}
          className="absolute right-0 top-1/2 z-30 flex h-11 w-11 translate-x-1/4 -translate-y-1/2 items-center justify-center rounded-full border border-[#D9E1EB] bg-white text-[#10243A] shadow-[0_10px_28px_rgba(13,27,42,0.13)] transition hover:border-[#173F7A] hover:bg-[#173F7A] hover:text-white sm:h-12 sm:w-12"
          aria-label="다음 멘토 성공전략"
        >
          <ChevronRight size={24} />
        </button>
      )}
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
  const [banners, setBanners] = useState([]);
  const [currentBanner, setCurrentBanner] = useState(0);
  const [bannerTimerKey, setBannerTimerKey] = useState(0);
  const [heroReady, setHeroReady] = useState(false);
  const [serviceItems, setServiceItems] = useState([]);
  const [popups, setPopups] = useState([]);
  const [sideBanners, setSideBanners] = useState([]);
  const [sideBannersLoaded, setSideBannersLoaded] = useState(false);
  const [currentSideBanner, setCurrentSideBanner] = useState(0);
  const [sideBannerTimerKey, setSideBannerTimerKey] = useState(0);
  const [acceptanceCards, setAcceptanceCards] = useState([]);
  const [mentorStrategies, setMentorStrategies] = useState([]);
  const [companyNews, setCompanyNews] = useState([]);
  const [notices, setNotices] = useState([]);
  const serviceScrollRef = useRef(null);

  useEffect(() => {
    let mounted = true;

    async function fetchBanners() {
      const { data, error } = await supabase
        .from('banners')
        .select('id, title, highlight, image_url, button_text, button_link, sort_order, is_active')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (!mounted) return;

      if (error) {
        console.error('배너 조회 오류:', error);
        setBanners([]);
        return;
      }

      const normalized = (data || [])
        .filter((item) => item.image_url)
        .map((item) => ({ ...item, image: item.image_url }));

      setBanners(normalized);
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
        setServiceItems([]);
        return;
      }

      const normalized = (data || []).map((service) => ({
        id: service.id,
        icon: serviceIconMap[service.icon] || ClipboardList,
        title: service.name,
        desc: service.description,
        link: service.link || '/services',
      }));

      setServiceItems(normalized);
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
          .from('admission_posts')
          .select('id, category, title, image_url, image_urls, sort_order, created_at')
          .in('category', ['susi', 'jungsi'])
          .eq('is_active', true)
          .eq('show_on_home', true)
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: false }),
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
        setSideBanners(visible);
        setCurrentSideBanner(0);
      }
      setSideBannersLoaded(true);

      if (acceptanceResult.error) {
        console.error('수시·정시 메인 합격생 게시글 조회 오류:', acceptanceResult.error);
        setAcceptanceCards([]);
      } else {
        const cards = (acceptanceResult.data || [])
          .map((post) => {
            const images = normalizeArray(post.image_urls);
            const firstImage = images[0] || post.image_url || '';
            if (!firstImage) return null;

            return {
              id: post.id,
              title: post.title,
              image_url: firstImage,
              link_url: `/admission/susi-jungsi/${post.id}`,
            };
          })
          .filter(Boolean);

        setAcceptanceCards(cards);
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
      const firstImage = banners[0]?.image_url;
      await Promise.all([preloadImage(firstImage), fontReady]);

      if (mounted) setHeroReady(true);
      banners.slice(1).forEach((item) => preloadImage(item.image_url));
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


  useEffect(() => {
    if (sideBanners.length <= 1) return undefined;

    const timer = window.setTimeout(() => {
      setCurrentSideBanner((prev) => (prev + 1) % sideBanners.length);
      setSideBannerTimerKey((prev) => prev + 1);
    }, 6000);

    return () => window.clearTimeout(timer);
  }, [sideBanners.length, sideBannerTimerKey]);

  useEffect(() => {
    if (sideBanners.length === 0) {
      setCurrentSideBanner(0);
      return;
    }

    if (currentSideBanner >= sideBanners.length) {
      setCurrentSideBanner(0);
    }
  }, [currentSideBanner, sideBanners.length]);

  const banner = banners[currentBanner] || null;
  const sideBanner = sideBanners[currentSideBanner] || null;
  const shouldReserveSideBannerSlot = !sideBannersLoaded || Boolean(sideBanner);

  const visibleServiceItems = useMemo(
    () => serviceItems.slice(0, 7),
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

  function resetSideBannerTimer() {
    setSideBannerTimerKey((prev) => prev + 1);
  }

  function goPrevSideBanner() {
    if (sideBanners.length <= 1) return;
    setCurrentSideBanner((prev) =>
      prev === 0 ? sideBanners.length - 1 : prev - 1,
    );
    resetSideBannerTimer();
  }

  function goNextSideBanner() {
    if (sideBanners.length <= 1) return;
    setCurrentSideBanner((prev) => (prev + 1) % sideBanners.length);
    resetSideBannerTimer();
  }

  function goSideBanner(index) {
    setCurrentSideBanner(index);
    resetSideBannerTimer();
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
              shouldReserveSideBannerSlot
                ? 'lg:grid-cols-[minmax(0,3fr)_minmax(245px,1fr)]'
                : 'lg:grid-cols-1'
            }`}
          >
            <div className="relative min-h-[360px] overflow-hidden rounded-[26px] bg-[#0D1B2A] shadow-[0_22px_55px_rgba(13,27,42,0.16)] lg:min-h-[470px]">
              {banner?.image_url && (
                <img
                  src={banner.image_url}
                  alt={banner.title || ''}
                  loading="eager"
                  decoding="sync"
                  fetchPriority="high"
                  className="absolute inset-0 h-full w-full object-cover"
                />
              )}
              <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(5,18,32,0.88)_0%,rgba(5,18,32,0.66)_45%,rgba(5,18,32,0.12)_100%)]" />

              {banner && (
                <div
                  className={`relative z-10 flex h-full min-h-[360px] max-w-[780px] flex-col justify-center px-7 py-14 transition-opacity duration-500 sm:px-12 lg:min-h-[470px] lg:px-16 ${
                    heroReady ? 'opacity-100' : 'opacity-0'
                  }`}
                >
                  <h1 className="break-keep text-[34px] font-black leading-[1.16] tracking-[-0.055em] text-white sm:text-[48px] lg:text-[58px]">
                    {banner.title}
                    {banner.highlight && (
                      <span className="mt-1 block text-[#F0C96B]">
                        {banner.highlight}
                      </span>
                    )}
                  </h1>

                  {banner.button_text && (
                    <div className="mt-8">
                      <SmartLink
                        to={banner.button_link || '#'}
                        className="inline-flex h-12 items-center gap-2 rounded-xl bg-white px-6 text-sm font-black text-[#0D1B2A] shadow-lg transition hover:bg-[#F6E9C8]"
                      >
                        {banner.button_text}
                        <ArrowRight size={18} />
                      </SmartLink>
                    </div>
                  )}
                </div>
              )}

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
                    {banners.map((item, index) => (
                      <button
                        key={item.id || index}
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

            {!sideBannersLoaded ? (
              <div
                aria-hidden="true"
                className="relative min-h-[220px] overflow-hidden rounded-[26px] border border-[#173F7A]/15 bg-[#0D1B2A] shadow-[0_14px_36px_rgba(13,27,42,0.11)] lg:min-h-[470px]"
              >
                <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(20,45,72,0.52)_0%,rgba(13,27,42,0.96)_72%)]" />
              </div>
            ) : sideBanner ? (
              <div className="relative min-h-[220px] overflow-hidden rounded-[26px] border border-[#173F7A]/15 bg-[#0D1B2A] shadow-[0_14px_36px_rgba(13,27,42,0.11)] lg:min-h-[470px]">
                <SmartLink
                  to={sideBanner.link_url || '#'}
                  openNewWindow={!!sideBanner.open_new_window}
                  className="group absolute inset-0 block"
                >
                  {(sideBanner.image_url || sideBanner.mobile_image_url) ? (
                    <picture>
                      {sideBanner.mobile_image_url && (
                        <source
                          media="(max-width: 768px)"
                          srcSet={sideBanner.mobile_image_url}
                        />
                      )}
                      <img
                        src={sideBanner.image_url || sideBanner.mobile_image_url}
                        alt={sideBanner.title || ''}
                        className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
                      />
                    </picture>
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center bg-[#E8EEF6] text-[#173F7A]">
                      <ImageIcon size={32} />
                    </div>
                  )}

                  <div className="absolute inset-0 bg-gradient-to-r from-[#06192D]/88 via-[#06192D]/55 to-[#06192D]/10" />

                  <div className="relative z-10 flex h-full min-h-[220px] flex-col justify-end px-6 pb-14 pt-6 lg:min-h-[470px] lg:px-7 lg:pb-16">
                    {sideBanner.title && (
                      <h2 className="break-keep text-xl font-black leading-7 text-white lg:text-2xl">
                        {sideBanner.title}
                      </h2>
                    )}
                    {sideBanner.subtitle && (
                      <p className="mt-2 line-clamp-3 text-sm font-black leading-6 text-[#F0C96B]">
                        {sideBanner.subtitle}
                      </p>
                    )}
                  </div>
                </SmartLink>

                {sideBanners.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={goPrevSideBanner}
                      className="absolute left-3 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/25 bg-[#0D1B2A]/45 text-white backdrop-blur transition hover:bg-[#0D1B2A]/75"
                      aria-label="이전 소형 배너"
                    >
                      <ChevronLeft size={22} />
                    </button>
                    <button
                      type="button"
                      onClick={goNextSideBanner}
                      className="absolute right-3 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/25 bg-[#0D1B2A]/45 text-white backdrop-blur transition hover:bg-[#0D1B2A]/75"
                      aria-label="다음 소형 배너"
                    >
                      <ChevronRight size={22} />
                    </button>

                    <div className="absolute bottom-5 left-1/2 z-20 flex -translate-x-1/2 gap-2">
                      {sideBanners.map((item, index) => (
                        <button
                          key={item.id || index}
                          type="button"
                          onClick={() => goSideBanner(index)}
                          className={`h-2 rounded-full transition-all ${
                            currentSideBanner === index
                              ? 'w-7 bg-white'
                              : 'w-2 bg-white/45'
                          }`}
                          aria-label={`소형 배너 ${index + 1}`}
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>
            ) : null}
          </div>
        </section>

        <section className="overflow-hidden border-b border-[#E7ECF2] bg-white py-14 lg:py-18">
          <div className="mx-auto max-w-[1500px] px-5 sm:px-8">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-sm font-black tracking-[0.08em] text-[#1B5A8E]">
                  SUCCESS STORIES
                </p>
                <h2 className="mt-2 text-[28px] font-black tracking-[-0.045em] text-[#0D1B2A] sm:text-[34px]">
                  합격생 선배들의 압도적 선택
                </h2>
              </div>

              <Link
                to="/admission/susi-jungsi"
                className="inline-flex items-center gap-1 text-sm font-black text-[#173F7A] transition hover:text-[#0D1B2A]"
              >
                수시·정시 합격 게시물 전체보기 <ArrowRight size={16} />
              </Link>
            </div>

            <div className="min-h-[303px] sm:min-h-[334px] lg:min-h-[353px]">
              {acceptanceCards.length > 0 && (
                <AcceptanceCarousel items={acceptanceCards} />
              )}
            </div>
          </div>
        </section>

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
                      <p className="text-sm font-black tracking-[0.08em] text-[#1B5A8E]">
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

        <SiteFooter />
      </main>
    </>
  );
}
