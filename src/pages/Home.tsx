import { useEffect, useRef, useState } from "react";
import AcceptanceSection from "@/components/landing/AcceptanceSection";
import HeroSection from "@/components/landing/HeroSection";
import MentorSection from "@/components/landing/MentorSection";
import NewsSection from "@/components/landing/NewsSection";
import ServicesSection from "@/components/landing/ServicesSection";
import * as landingPreview from "@/data/landingPreview";
import type { NormalizedMentor } from "@/hooks/useHomeMentors";
import { useHomeMentors } from "@/hooks/useHomeMentors";
import { supabase } from "@/lib/supabase";

// 랜딩 콘텐츠(배너/대학/서비스/멘토): Supabase DB fetch 모드 (LANDING_PREVIEW=false).
// true로 되돌리면 ../data/landingPreview 정적 픽스처로 렌더 (로컬 프리뷰 전용 스위치).
// fetch 실패 시 각 섹션은 빈 배열 폴백으로 미렌더 처리 — 픽스처 자동 폴백은 없음.
// 공지사항 섹션(company_news/notices)은 이 플래그와 무관하게 항상 DB 연동.
const LANDING_PREVIEW = false;
const NEWS_SECTION_PREVIEW_COUNT = 5;

type Banner = {
  id?: string;
  title?: string;
  highlight?: string | null;
  image_url: string;
  button_text?: string | null;
  button_link?: string;
  link_url?: string;
  sort_order?: number;
  is_active?: boolean;
};

type SideBanner = {
  id?: string;
  title?: string;
  subtitle?: string;
  image_url?: string;
  mobile_image_url?: string;
  link_url?: string;
  open_new_window?: boolean;
  sort_order?: number;
};

type University = {
  id: string;
  name: string;
  emblem_url?: string;
  subtitle?: string;
  count?: number | null;
  track: "general" | "medical_special";
  sort_order?: number;
};

type Service = {
  id: string;
  name: string;
  description?: string;
  link?: string;
  icon?: string;
  icon_image_url?: string;
  sort_order?: number;
};

type Popup = {
  id: string;
  title?: string;
  url?: string;
  image_url?: string;
  mobile_image_url?: string;
  open_new_window?: boolean;
  start_date?: string | null;
  end_date?: string | null;
  sort_order?: number;
  is_active?: boolean;
};

type NewsItem = {
  id: string;
  title: string;
  created_at: string;
  category?: string | null;
  sort_order?: number;
  is_pinned?: boolean | null;
};

function preloadImage(src: string | undefined): Promise<string> {
  if (!src) return Promise.resolve("");

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

function getHiddenPopupIds(): Record<string, string> {
  try {
    const saved = localStorage.getItem("hiddenPopupIds");
    return saved ? JSON.parse(saved) : {};
  } catch {
    return {};
  }
}

function setHiddenPopupToday(id: string) {
  try {
    const today = todayKstYmd();
    const saved = getHiddenPopupIds();
    saved[id] = today;
    localStorage.setItem("hiddenPopupIds", JSON.stringify(saved));
  } catch {
    // localStorage 사용 불가 환경에서는 무시
  }
}

function HomePopupLayer({
  popups,
  onClose,
  onCloseToday,
}: {
  popups: Popup[];
  onClose: (id: string) => void;
  onCloseToday: (id: string) => void;
}) {
  if (!popups.length) return null;

  return (
    <div className="fixed inset-0 z-9999 overflow-y-auto bg-black/50 px-4 py-6">
      <div className="mx-auto flex min-h-full w-full max-w-[1480px] items-center justify-center gap-5">
        <div className="flex w-full flex-wrap items-center justify-center gap-5">
          {popups.slice(0, 3).map((popup) => {
            const imageSrc = popup.mobile_image_url || popup.image_url;
            const Wrapper = popup.url ? "a" : "div";
            const wrapperProps = popup.url
              ? {
                  href: popup.url,
                  target: popup.open_new_window ? "_blank" : "_self",
                  rel: popup.open_new_window ? "noreferrer" : undefined,
                }
              : {};

            return (
              <div
                key={popup.id}
                className="flex w-[clamp(320px,28vw,440px)] shrink-0 flex-col overflow-hidden rounded-[24px] bg-white shadow-[0_28px_90px_rgba(0,0,0,0.36)]"
              >
                <Wrapper
                  // biome-ignore lint/suspicious/noExplicitAny: Wrapper는 'a' | 'div' 중 런타임에 결정되는 태그명이라 각 태그 전용 props(href/target/rel)를 하나의 정적 타입으로 표현할 수 없다.
                  {...(wrapperProps as any)}
                  className="block aspect-3/4 w-full overflow-hidden bg-white"
                >
                  <picture>
                    {popup.mobile_image_url && (
                      <source
                        media="(max-width: 768px)"
                        srcSet={popup.mobile_image_url}
                      />
                    )}
                    <img
                      src={imageSrc}
                      alt={popup.title || "팝업"}
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
                    <span className="text-[22px] leading-none text-blue-500">
                      ✓
                    </span>
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
  const [banners, setBanners] = useState<Banner[]>(
    LANDING_PREVIEW ? (landingPreview.banners as Banner[]) : [],
  );
  const [heroReady, setHeroReady] = useState(false);
  const [popups, setPopups] = useState<Popup[]>([]);
  const [sideBanners, setSideBanners] = useState<SideBanner[]>(
    // landingPreview 픽스처의 subtitle/link_url 등은 null 리터럴이라 SideBanner(undefined 허용)와
    // 구조적으로 충분히 겹치지 않는다 — 프리뷰 전용 데이터 캐스팅이라 unknown 경유로 좁힌다.
    LANDING_PREVIEW
      ? (landingPreview.sideBanners as unknown as SideBanner[])
      : [],
  );
  const [universities, setUniversities] = useState<University[]>(
    LANDING_PREVIEW ? (landingPreview.universities as University[]) : [],
  );
  const [services, setServices] = useState<Service[]>(
    LANDING_PREVIEW ? (landingPreview.services as Service[]) : [],
  );
  // 멘토 fetch+정규화는 useHomeMentors로 추출됨(프리미엄 랜딩 섹션 9와 공유) — LANDING_PREVIEW일
  // 때는 기존과 동일하게 정적 픽스처를 쓰고, 아니면 훅이 마운트 시 자체 fetch한다(enabled 가드로
  // LANDING_PREVIEW 중에는 fetch 자체를 건너뛰어 기존 동작과 100% 동일).
  const { mentors: fetchedMentors } = useHomeMentors({
    enabled: !LANDING_PREVIEW,
  });
  const mentors = LANDING_PREVIEW
    ? (landingPreview.mentors as NormalizedMentor[])
    : fetchedMentors;
  // 공지사항 섹션(회사소식/공지사항)은 실 Supabase DB 연동 완료 — 프리뷰 대상 아님.
  const [companyNews, setCompanyNews] = useState<NewsItem[]>([]);
  const [notices, setNotices] = useState<NewsItem[]>([]);

  useEffect(() => {
    if (LANDING_PREVIEW) return undefined;

    let mounted = true;

    async function fetchBanners() {
      const { data, error } = await supabase
        .from("banners")
        .select(
          "id, title, highlight, image_url, button_text, button_link, sort_order, is_active",
        )
        .eq("is_active", true)
        .order("sort_order", { ascending: true });

      if (!mounted) return;

      if (error) {
        console.error("배너 조회 오류:", error);
        setBanners([]);
        return;
      }

      const normalized = ((data || []) as Banner[]).filter(
        (item) => item.image_url,
      );
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
        .from("program_categories")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });

      if (!mounted) return;

      if (error) {
        console.error("서비스 조회 오류:", error);
        setServices([]);
        return;
      }

      setServices((data || []) as Service[]);
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
        .from("popups")
        .select(
          "id, title, url, image_url, mobile_image_url, open_new_window, start_date, end_date, sort_order, is_active",
        )
        .eq("is_active", true)
        .or(`start_date.is.null,start_date.lte.${today}`)
        .or(`end_date.is.null,end_date.gte.${today}`)
        .order("sort_order", { ascending: true });

      if (!mounted) return;

      if (error) {
        console.error("팝업 조회 오류:", error);
        setPopups([]);
        return;
      }

      const hidden = getHiddenPopupIds();
      const visiblePopups = ((data || []) as Popup[])
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
      const [sideResult, universityResult] = await Promise.all([
        supabase
          .from("home_side_banners")
          .select("*")
          .eq("is_active", true)
          .or(`start_date.is.null,start_date.lte.${today}`)
          .or(`end_date.is.null,end_date.gte.${today}`)
          .order("sort_order", { ascending: true }),
        supabase
          .from("university_acceptances")
          .select("*")
          .eq("is_active", true)
          .order("sort_order", { ascending: true }),
      ]);

      if (!mounted) return;

      if (sideResult.error) {
        console.error("우측 배너 조회 오류:", sideResult.error);
        setSideBanners([]);
      } else {
        const visible = ((sideResult.data || []) as SideBanner[]).filter(
          (item) => item.image_url || item.mobile_image_url,
        );
        setSideBanners(visible);
      }

      if (universityResult.error) {
        // 테이블 미생성/조회 실패 시 섹션 미렌더 fallback
        console.error("합격생 대학 조회 오류:", universityResult.error);
        setUniversities([]);
      } else {
        setUniversities((universityResult.data || []) as University[]);
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
          .from("company_news")
          .select("id, title, created_at, is_pinned, sort_order, category")
          .eq("is_active", true)
          .order("is_pinned", { ascending: false })
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: false })
          .limit(NEWS_SECTION_PREVIEW_COUNT),
        supabase
          .from("notices")
          .select("id, title, created_at, is_pinned, sort_order, category")
          .eq("is_active", true)
          .order("is_pinned", { ascending: false })
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: false })
          .limit(NEWS_SECTION_PREVIEW_COUNT),
      ]);

      if (!mounted) return;

      if (companyResult.error) {
        console.error("회사소식 조회 오류:", companyResult.error);
        setCompanyNews([]);
      } else {
        setCompanyNews((companyResult.data || []) as NewsItem[]);
      }

      if (noticeResult.error) {
        console.error("공지사항 미리보기 조회 오류:", noticeResult.error);
        setNotices([]);
      } else {
        setNotices((noticeResult.data || []) as NewsItem[]);
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

  function closePopup(id: string) {
    setPopups((prev) => prev.filter((popup) => popup.id !== id));
  }

  function closePopupToday(id: string) {
    setHiddenPopupToday(id);
    closePopup(id);
  }

  return (
    <>
      <HomePopupLayer
        popups={popups}
        onClose={closePopup}
        onCloseToday={closePopupToday}
      />

      <main
        className={`min-h-screen bg-white pt-16 text-[#0D1B2A] transition-opacity duration-500 ${
          heroReady ? "opacity-100" : "opacity-0"
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
      </main>
    </>
  );
}
