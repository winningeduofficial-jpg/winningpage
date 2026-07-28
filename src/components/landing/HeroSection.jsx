import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

/** 우측 캐러셀 자동 전환 간격 (ms) — 명세 3.1: 6s 유지 */
const SIDE_BANNER_INTERVAL = 6000;
/** 스와이프 판정 최소 이동 거리 (px) */
const SWIPE_THRESHOLD = 40;
/** 트랙패드 휠 좌우 이동 판정 누적 deltaX 임계값 */
const WHEEL_THRESHOLD = 40;
/** 휠 슬라이드 이동 후 연속 이동 방지 쿨다운 (ms) */
const WHEEL_COOLDOWN = 500;
/** 휠 누적값 리셋 유예 — 마지막 휠 이벤트 후 이 시간이 지나면 새 제스처로 간주 (ms) */
const WHEEL_RESET_DELAY = 300;

/**
 * 히어로 섹션 (명세 3.1)
 * - 좌측 969×429: banners 활성 1건(sort_order 최상위) 고정 렌더 (캐러셀/화살표/dot 없음)
 *   통이미지 1장 — 텍스트(헤드라인/CTA)는 디자이너가 이미지에 포함해 관리.
 *   클릭 URL은 banners 테이블 레거시 컬럼 button_link 사용(link_url 컬럼 없음) — 있으면 배너 전체 클릭 가능
 * - 우측 321×429: home_side_banners 자동 전환(6s, setTimeout 체인) + 하단 중앙 pill 인디케이터
 *   + 포인터 스와이프/트랙패드 휠 좌우 이동 (화살표 없음). 1건뿐이면 pill·자동 전환 없이 고정
 * - hover/focus/pointerdown 일시정지, prefers-reduced-motion 시 자동 전환 비활성
 *
 * @param {object} props
 * @param {Array<{id: string, title?: string, image_url: string,
 *   button_link?: string, link_url?: string, sort_order?: number}>} props.banners
 *   활성 메인 배너 목록 (sort_order asc — 첫 항목만 사용)
 * @param {Array<{id: string, title?: string, subtitle?: string, image_url?: string,
 *   mobile_image_url?: string, link_url?: string, open_new_window?: boolean,
 *   sort_order?: number}>} props.sideBanners
 *   활성 우측 소형 배너 목록 (sort_order asc)
 */
export default function HeroSection({ banners = [], sideBanners = [] }) {
  const mainBanner = banners[0] || null;
  const slides = sideBanners.filter((item) => item.image_url || item.mobile_image_url);
  const slideCount = slides.length;

  const [activeIndex, setActiveIndex] = useState(0);
  const [hoverPaused, setHoverPaused] = useState(false);
  const [focusPaused, setFocusPaused] = useState(false);
  const [pointerPaused, setPointerPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  const dragStartXRef = useRef(null);
  const dragMovedRef = useRef(false);
  const wheelAccumRef = useRef(0);
  const wheelCooldownUntilRef = useRef(0);
  const wheelLastEventAtRef = useRef(0);

  // prefers-reduced-motion 감지 (change 리스너 포함)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mql.matches);
    const onChange = (event) => setReducedMotion(event.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  // 슬라이드 개수 변동 시 인덱스 보정
  useEffect(() => {
    if (activeIndex >= slideCount) setActiveIndex(0);
  }, [slideCount, activeIndex]);

  const isPaused = hoverPaused || focusPaused || pointerPaused;

  // 자동 전환: setTimeout 체인 (activeIndex 변경 시 자동 리셋)
  useEffect(() => {
    if (slideCount <= 1 || isPaused || reducedMotion) return undefined;
    const timer = setTimeout(() => {
      setActiveIndex((prev) => (prev + 1) % slideCount);
    }, SIDE_BANNER_INTERVAL);
    return () => clearTimeout(timer);
  }, [slideCount, isPaused, reducedMotion, activeIndex]);

  const goTo = useCallback(
    (index) => {
      if (slideCount === 0) return;
      setActiveIndex(((index % slideCount) + slideCount) % slideCount);
    },
    [slideCount],
  );

  // 트랙패드 휠 좌우 이동 (명세 3.1 인터랙션): 가로 성분 우세 시 누적 deltaX로 슬라이드 전환.
  // 이동 후 쿨다운으로 관성 스크롤 연속 전환 방지. activeIndex 변경으로 자동 전환 타이머는 리셋됨.
  const handleWheel = useCallback(
    (event) => {
      if (slideCount <= 1) return;
      if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;

      const now = performance.now();
      if (now < wheelCooldownUntilRef.current) {
        wheelLastEventAtRef.current = now;
        return;
      }
      if (now - wheelLastEventAtRef.current > WHEEL_RESET_DELAY) {
        wheelAccumRef.current = 0;
      }
      wheelLastEventAtRef.current = now;

      wheelAccumRef.current += event.deltaX;
      if (Math.abs(wheelAccumRef.current) >= WHEEL_THRESHOLD) {
        goTo(activeIndex + (wheelAccumRef.current > 0 ? 1 : -1));
        wheelAccumRef.current = 0;
        wheelCooldownUntilRef.current = now + WHEEL_COOLDOWN;
      }
    },
    [activeIndex, goTo, slideCount],
  );

  // 포인터 스와이프 (터치/마우스 드래그 공용)
  const handlePointerDown = useCallback((event) => {
    dragStartXRef.current = event.clientX;
    dragMovedRef.current = false;
    setPointerPaused(true);
  }, []);

  const handlePointerMove = useCallback((event) => {
    if (dragStartXRef.current === null) return;
    if (Math.abs(event.clientX - dragStartXRef.current) > 8) {
      dragMovedRef.current = true;
    }
  }, []);

  const handlePointerUp = useCallback(
    (event) => {
      if (dragStartXRef.current !== null) {
        const deltaX = event.clientX - dragStartXRef.current;
        if (Math.abs(deltaX) >= SWIPE_THRESHOLD && slideCount > 1) {
          goTo(activeIndex + (deltaX < 0 ? 1 : -1));
        }
      }
      dragStartXRef.current = null;
      setPointerPaused(false);
    },
    [activeIndex, goTo, slideCount],
  );

  const handlePointerCancel = useCallback(() => {
    dragStartXRef.current = null;
    dragMovedRef.current = false;
    setPointerPaused(false);
  }, []);

  // 마우스 드래그가 컨테이너 밖에서 끝나면 컨테이너에 pointerup/pointercancel이
  // 전달되지 않아 pointerPaused가 고착됨 → 드래그 중에만 window 폴백 리스너 부착
  useEffect(() => {
    if (!pointerPaused) return undefined;
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerCancel);
    return () => {
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerCancel);
    };
  }, [pointerPaused, handlePointerUp, handlePointerCancel]);

  // 드래그 직후 링크 클릭 방지
  const handleSlideClick = useCallback((event) => {
    if (dragMovedRef.current) {
      event.preventDefault();
      dragMovedRef.current = false;
    }
  }, []);

  if (!mainBanner && slideCount === 0) return null;

  return (
    <section aria-label="메인 히어로" className="w-full">
      {/* lg 가로 배치: basis 합 96.99% 기준으로 gap은 lg에서 1.25rem(20px)로 축소
          — max-w-content(1100px, 콘텐츠 1036px)에서 1036×0.9699+20=1024.8px로 오버플로 없음 */}
      <div className="mx-auto flex w-full max-w-content flex-col items-center gap-10 px-5 py-8 sm:px-8 lg:flex-row lg:items-start lg:justify-center lg:gap-5">
        {/* 좌측 고정 배너 969×429 — 통이미지 (텍스트는 이미지에 포함) */}
        {mainBanner && (() => {
          const image = (
            <img
              src={mainBanner.image_url}
              alt={mainBanner.title || '메인 배너'}
              width="969"
              height="429"
              // LCP 대상 — React 18은 camelCase fetchPriority 미지원, 소문자로 DOM 통과
              fetchpriority="high"
              className="absolute inset-0 h-full w-full object-cover"
            />
          );
          const containerClass =
            'relative w-full overflow-hidden rounded-[2rem] bg-[#050D2B] aspect-[969/429] lg:basis-[72.85%] lg:grow lg:shrink-0 hero-reveal-left';
          const label = mainBanner.title || '메인 배너';
          // banners 테이블에는 link_url 컬럼이 없고 레거시 button_link가 클릭 URL로 쓰임
          // (Home.jsx select 목록 참조). link_url은 향후 스키마 대비 우선 폴백으로만 유지.
          const clickUrl = mainBanner.link_url || mainBanner.button_link;

          if (!clickUrl) {
            return <div className={containerClass}>{image}</div>;
          }
          return clickUrl.startsWith('/') ? (
            <Link to={clickUrl} aria-label={label} className={`block ${containerClass}`}>
              {image}
            </Link>
          ) : (
            <a href={clickUrl} aria-label={label} className={`block ${containerClass}`}>
              {image}
            </a>
          );
        })()}

        {/* 우측 캐러셀 321×429 + 카드 바깥 하단 인디케이터 */}
        {slideCount > 0 && (
          <div className="flex w-full max-w-[20.0625rem] flex-col items-center md:max-w-[26rem] lg:max-w-none lg:basis-[24.14%] lg:grow lg:shrink-0">
            <div
              role="region"
              aria-roledescription="carousel"
              aria-label="이벤트 배너"
              className="relative w-full touch-pan-y select-none overflow-hidden rounded-[2rem] bg-[#001950] aspect-[321/429] hero-reveal-right"
              onMouseEnter={() => setHoverPaused(true)}
              onMouseLeave={() => setHoverPaused(false)}
              onFocusCapture={() => setFocusPaused(true)}
              onBlurCapture={() => setFocusPaused(false)}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerCancel}
              onWheel={handleWheel}
            >
              <div
                className="flex h-full transition-transform duration-500 ease-out motion-reduce:transition-none"
                style={{ transform: `translateX(-${activeIndex * 100}%)` }}
              >
                {slides.map((slide, index) => {
                  const image = (
                    <picture className="block h-full w-full">
                      {slide.mobile_image_url && (
                        <source media="(max-width: 768px)" srcSet={slide.mobile_image_url} />
                      )}
                      <img
                        src={slide.image_url || slide.mobile_image_url}
                        alt={slide.title || `이벤트 배너 ${index + 1}`}
                        width="321"
                        height="429"
                        draggable="false"
                        className="h-full w-full object-cover"
                      />
                    </picture>
                  );

                  return (
                    <div
                      key={slide.id ?? index}
                      className="h-full w-full flex-none"
                      aria-hidden={index !== activeIndex}
                    >
                      {slide.link_url ? (
                        <a
                          href={slide.link_url}
                          target={slide.open_new_window ? '_blank' : undefined}
                          rel={slide.open_new_window ? 'noopener noreferrer' : undefined}
                          tabIndex={index === activeIndex ? 0 : -1}
                          draggable="false"
                          onClick={handleSlideClick}
                          className="block h-full w-full"
                          aria-label={slide.title || `이벤트 배너 ${index + 1}`}
                        >
                          {image}
                        </a>
                      ) : (
                        image
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 페이지네이션 인디케이터 — 카드 바깥 아래, 카드 기준 가로 중앙 (2건 이상일 때만) */}
            {slideCount > 1 && (
              <div className="mt-3 flex items-center gap-[0.625rem] hero-reveal-indicator">
                {slides.map((slide, index) => (
                  <button
                    key={slide.id ?? index}
                    type="button"
                    aria-label={`${index + 1}번째 배너로 이동`}
                    aria-current={index === activeIndex}
                    onClick={() => goTo(index)}
                    className={`relative h-3 w-3 rounded-full transition-colors duration-300 after:absolute after:-inset-4 after:content-[''] ${index === activeIndex ? 'bg-[#013262]' : 'bg-[#D9D9D9]'
                      }`}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
