import { useEffect, useRef, useState } from 'react';
import Header from '../components/Header';
import SiteFooter from '../components/SiteFooter';
import HeroSection from '../components/landing/HeroSection';
import AcceptanceSection from '../components/landing/AcceptanceSection';
import ServicesSection from '../components/landing/ServicesSection';
import MentorSection from '../components/landing/MentorSection';
import NewsSection from '../components/landing/NewsSection';
import { supabase } from '../lib/supabase';
import * as landingPreview from '../data/landingPreview';

// 랜딩 콘텐츠(배너/대학/서비스/멘토)를 Supabase 대신 로컬 정적 데이터로 렌더.
// 공지사항 섹션(company_news/notices)은 실 Supabase DB 연동 완료 — 이 플래그의 영향을 받지 않음.
// 나머지 프리뷰 섹션은 DB 전환 시 false로 변경 — 기존 Supabase fetch 경로는 그대로 유지되어 있음.
const LANDING_PREVIEW = true; // TODO: DB 전환 시 false — Supabase fetch 사용

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

export default function Home() {
  const [banners, setBanners] = useState(
    LANDING_PREVIEW ? landingPreview.banners : [],
  );
  const [heroReady, setHeroReady] = useState(false);
  const [popups, setPopups] = useState([]);
  const [sideBanners, setSideBanners] = useState(
    LANDING_PREVIEW ? landingPreview.sideBanners : [],
  );
  const [universities, setUniversities] = useState(
    LANDING_PREVIEW ? landingPreview.universities : [],
  );
  const [services, setServices] = useState(
    LANDING_PREVIEW ? landingPreview.services : [],
  );
  const [mentors, setMentors] = useState(
    LANDING_PREVIEW ? landingPreview.mentors : [],
  );
  // 공지사항 섹션(회사소식/공지사항)은 실 Supabase DB 연동 완료 — 프리뷰 대상 아님.
  const [companyNews, setCompanyNews] = useState([]);
  const [notices, setNotices] = useState([]);

  useEffect(() => {
    if (LANDING_PREVIEW) return undefined;

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

      const normalized = (data || []).filter((item) => item.image_url);
      setBanners(normalized);
    }

    fetchBanners();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (LANDING_PREVIEW) return undefined;

    let mounted = true;

    async function fetchServices() {
      const { data, error } = await supabase
        .from('program_categories')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (!mounted) return;

      if (error) {
        console.error('서비스 조회 오류:', error);
        setServices([]);
        return;
      }

      setServices(data || []);
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
    if (LANDING_PREVIEW) return undefined;

    let mounted = true;

    async function fetchRenewalContents() {
      const today = todayKstYmd();
      const [sideResult, universityResult, mentorResult] =
        await Promise.all([
          supabase
            .from('home_side_banners')
            .select('*')
            .eq('is_active', true)
            .or(`start_date.is.null,start_date.lte.${today}`)
            .or(`end_date.is.null,end_date.gte.${today}`)
            .order('sort_order', { ascending: true }),
          supabase
            .from('university_acceptances')
            .select('*')
            .eq('is_active', true)
            .order('sort_order', { ascending: true }),
          supabase
            .from('home_mentor_strategies')
            .select('*')
            .eq('is_active', true)
            .order('sort_order', { ascending: true }),
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
      }

      if (universityResult.error) {
        // 테이블 미생성/조회 실패 시 섹션 미렌더 fallback
        console.error('합격생 대학 조회 오류:', universityResult.error);
        setUniversities([]);
      } else {
        setUniversities(universityResult.data || []);
      }

      if (mentorResult.error) {
        console.error('멘토 조회 오류:', mentorResult.error);
        setMentors([]);
      } else {
        setMentors(mentorResult.data || []);
      }
    }

    fetchRenewalContents();

    return () => {
      mounted = false;
    };
  }, []);

  // 공지사항 섹션(회사소식/공지사항) — 실 Supabase DB 연동. LANDING_PREVIEW 가드 대상 아님.
  useEffect(() => {
    let mounted = true;

    async function fetchNewsSectionContents() {
      const [companyResult, noticeResult] = await Promise.all([
        supabase
          .from('company_news')
          .select('id, title, created_at, is_pinned, sort_order, image_urls')
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

      if (companyResult.error) {
        console.error('회사소식 조회 오류:', companyResult.error);
        setCompanyNews([]);
      } else {
        setCompanyNews(companyResult.data || []);
      }

      if (noticeResult.error) {
        console.error('공지사항 미리보기 조회 오류:', noticeResult.error);
        setNotices([]);
      } else {
        setNotices(noticeResult.data || []);
      }
    }

    fetchNewsSectionContents();

    return () => {
      mounted = false;
    };
  }, []);

  // 페이지 reveal(첫 배너 이미지 + 폰트 준비) — 히어로 첫 진입 렌더 안정용
  const heroRevealedRef = useRef(false);

  useEffect(() => {
    if (heroRevealedRef.current) return undefined;

    let mounted = true;

    async function prepareHero() {
      const fontReady = document.fonts?.ready || Promise.resolve();
      const firstImage = banners[0]?.image_url;
      await Promise.all([preloadImage(firstImage), fontReady]);

      if (mounted) {
        heroRevealedRef.current = true;
        setHeroReady(true);
      }
    }

    prepareHero();

    return () => {
      mounted = false;
    };
  }, [banners]);

  function closePopup(id) {
    setPopups((prev) => prev.filter((popup) => popup.id !== id));
  }

  function closePopupToday(id) {
    setHiddenPopupToday(id);
    closePopup(id);
  }

  return (
    <>
      <Header />

      <HomePopupLayer
        popups={popups}
        onClose={closePopup}
        onCloseToday={closePopupToday}
      />

      <main
        className={`min-h-screen bg-white pt-[84px] text-[#0D1B2A] transition-opacity duration-500 ${
          heroReady ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {(banners.length > 0 || sideBanners.length > 0) && (
          <HeroSection banners={banners} sideBanners={sideBanners} />
        )}

        {universities.length > 0 && (
          <AcceptanceSection universities={universities} />
        )}

        {services.length > 0 && <ServicesSection services={services} />}

        {mentors.length > 0 && <MentorSection mentors={mentors} />}

        {/* 공지사항 섹션: 실 DB(company_news/notices) 기준 — 0건이어도 항상 렌더, 컬럼별 빈 상태 문구 표시 */}
        <NewsSection companyNews={companyNews} notices={notices} />

        <SiteFooter />
      </main>
    </>
  );
}
