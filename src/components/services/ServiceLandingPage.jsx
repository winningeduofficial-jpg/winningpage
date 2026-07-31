import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, Sparkles, Target, Compass, PenLine, Star } from 'lucide-react';
import { openPaidServiceOrAlert } from '../../lib/paidServiceAccess';
import { formatKRW } from '../../data/pricingCatalog';

// 서비스 랜딩 4종(목표관리/수행평가/자기평가/심화탐구) 공유 스켈레톤.
// 스타일 토큰은 dev 랜딩 정본(Home.jsx·components/landing/*)을 따른다:
//   브랜드 네이비 #013262 / 보조 텍스트 #525252 / 포인트 #0B84FD / 틴트 배경 #F1F8FF
//   컨텐츠 격자 max-w-content(72.75rem), 섹션 리듬은 pt-10 sm:pt-16 lg:pt-[6.25rem] 계열.
// 4개 페이지는 이 컴포넌트에 content 설정 객체(src/data/serviceLandingContent.js)만 전달한다
// — 페이지 간 구조 이질감을 없애기 위해 개별 페이지에서 섹션을 직접 조립하지 않는다.

const HIGHLIGHT_ICONS = [Target, Compass, Sparkles];

function SectionHeading({ eyebrow, title, tone = 'dark' }) {
  return (
    <div className="mx-auto max-w-content px-5 sm:px-8">
      {eyebrow && (
        <p
          className={`text-[1rem] font-semibold leading-[1.3] sm:text-[1.125rem] ${
            tone === 'light' ? 'text-white/70' : 'text-[#0B84FD]'
          }`}
        >
          {eyebrow}
        </p>
      )}
      <h2
        className={`mt-2 break-keep text-[1.5rem] font-semibold leading-[1.4] tracking-[-0.03rem] sm:text-[1.75rem] lg:text-[2rem] lg:tracking-[-0.04rem] ${
          tone === 'light' ? 'text-white' : 'text-[#013262]'
        }`}
      >
        {title}
      </h2>
    </div>
  );
}

function Hero({ hero }) {
  const isPaid = Boolean(hero.paidServiceName);

  return (
    <section aria-label="히어로" className="w-full bg-[#F1F8FF]">
      <div className="mx-auto flex max-w-content flex-col items-start gap-6 px-5 py-16 sm:px-8 sm:py-20 lg:py-24">
        <p className="text-[1rem] font-semibold text-[#0B84FD] sm:text-[1.125rem]">
          {hero.eyebrow}
        </p>
        <h1 className="max-w-[40rem] break-keep text-[2rem] font-semibold leading-[1.3] tracking-[-0.04rem] text-[#013262] sm:text-[2.5rem]">
          {hero.title}
        </h1>
        <p className="max-w-[36rem] break-keep text-[1.0625rem] font-medium leading-[1.6] text-[#525252]">
          {hero.subtitle}
        </p>

        {isPaid ? (
          <button
            type="button"
            onClick={(event) =>
              openPaidServiceOrAlert(event, { name: hero.paidServiceName, to: hero.ctaTo })
            }
            className="mt-2 inline-flex h-14 items-center justify-center rounded-xl bg-[#013262] px-8 text-base font-semibold text-white transition hover:bg-[#012347]"
          >
            {hero.ctaLabel}
          </button>
        ) : (
          <Link
            to={hero.ctaTo}
            className="mt-2 inline-flex h-14 items-center justify-center rounded-xl bg-[#013262] px-8 text-base font-semibold text-white transition hover:bg-[#012347]"
          >
            {hero.ctaLabel}
          </Link>
        )}
      </div>
    </section>
  );
}

function Highlights({ highlights }) {
  if (!highlights?.items?.length) return null;

  return (
    <section aria-label="핵심 포인트" className="bg-white">
      <div className="pt-10 sm:pt-16 lg:pt-[6.25rem]">
        <SectionHeading title={highlights.title} />
        <div className="mx-auto mt-8 grid max-w-content grid-cols-1 gap-5 px-5 sm:px-8 lg:mt-10 lg:grid-cols-3">
          {highlights.items.map((item, index) => {
            const Icon = HIGHLIGHT_ICONS[index % HIGHLIGHT_ICONS.length];
            return (
              <div
                key={item.title}
                className="rounded-[1.5rem] border border-[#E8EDF3] bg-white p-6 shadow-[0_0.375rem_1rem_rgba(1,50,98,0.06)]"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#F1F8FF]">
                  <Icon className="h-5 w-5 text-[#013262]" />
                </span>
                <p className="mt-4 text-[1.125rem] font-semibold leading-[1.4] text-[#013262]">
                  {item.title}
                </p>
                <p className="mt-2 text-[0.9375rem] font-medium leading-[1.6] text-[#525252]">
                  {item.desc}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// lg 컬럼 수 — Tailwind JIT는 동적 문자열(`lg:grid-cols-${n}`)을 스캔하지 못해 리터럴
// 클래스명을 그대로 노출해야 한다(고정 스텝 수는 4 또는 5뿐이라 매핑으로 충분).
const PROCESS_GRID_COLS = {
  1: 'sm:grid-cols-1 lg:grid-cols-1',
  2: 'sm:grid-cols-2 lg:grid-cols-2',
  3: 'sm:grid-cols-2 lg:grid-cols-3',
  4: 'sm:grid-cols-2 lg:grid-cols-4',
  5: 'sm:grid-cols-2 lg:grid-cols-5'
};

function Process({ process }) {
  if (!process?.steps?.length) return null;

  const gridColsClass = PROCESS_GRID_COLS[process.steps.length] || PROCESS_GRID_COLS[4];

  return (
    <section aria-label="진행 단계" className="bg-[#F8FAFC]">
      <div className="py-10 sm:py-16 lg:py-[6.25rem]">
        <SectionHeading title={process.title} />
        <div
          className={`mx-auto mt-8 grid max-w-content grid-cols-1 gap-5 px-5 sm:px-8 lg:mt-10 lg:gap-6 ${gridColsClass}`}
        >
          {process.steps.map((step, index) => (
            <div
              key={step.title}
              className="flex flex-col rounded-[1.5rem] bg-white p-6 shadow-[0_0.375rem_1rem_rgba(1,50,98,0.06)]"
            >
              <span className="text-[0.8125rem] font-bold tracking-[0.04em] text-[#0B84FD]">
                STEP {index + 1}
              </span>
              <p className="mt-3 text-[1.125rem] font-semibold leading-[1.4] text-[#013262]">
                {step.title}
              </p>
              <p className="mt-2 text-[0.9375rem] font-medium leading-[1.6] text-[#525252]">
                {step.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Audience({ audience }) {
  if (!audience?.items?.length) return null;

  return (
    <section aria-label="추천 대상" className="bg-white">
      <div className="py-10 sm:py-16 lg:py-[6.25rem]">
        <SectionHeading title={audience.title} />
        <div className="mx-auto mt-8 grid max-w-content grid-cols-1 gap-5 px-5 sm:px-8 sm:grid-cols-2 lg:mt-10 lg:grid-cols-4">
          {audience.items.map((item) => (
            <div
              key={item.title}
              className="rounded-[1.5rem] border border-[#E8EDF3] bg-white p-6"
            >
              <PenLine className="h-5 w-5 text-[#0B84FD]" />
              <p className="mt-4 text-[1.0625rem] font-semibold leading-[1.4] text-[#013262]">
                {item.title}
              </p>
              <p className="mt-2 text-[0.875rem] font-medium leading-[1.6] text-[#525252]">
                {item.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Outcomes({ outcomes }) {
  if (!outcomes?.items?.length) return null;

  return (
    <section aria-label="기대 효과" className="bg-[#013262]">
      <div className="py-10 sm:py-16 lg:py-[6.25rem]">
        <SectionHeading title={outcomes.title} tone="light" />
        <ul className="mx-auto mt-8 flex max-w-content flex-wrap gap-3 px-5 sm:px-8 lg:mt-10">
          {outcomes.items.map((label) => (
            <li
              key={label}
              className="rounded-full border border-white/25 bg-white/10 px-5 py-3 text-[0.9375rem] font-semibold text-white"
            >
              {label}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Testimonials({ testimonials }) {
  if (!testimonials?.items?.length) return null;

  return (
    <section aria-label="이용 후기" className="bg-white">
      <div className="py-10 sm:py-16 lg:py-[6.25rem]">
        <SectionHeading title={testimonials.title} />
        <div className="mx-auto mt-8 grid max-w-content grid-cols-1 gap-5 px-5 sm:px-8 lg:mt-10 lg:grid-cols-3">
          {testimonials.items.map((item) => (
            <figure
              key={item.quote}
              className="flex h-full flex-col justify-between rounded-[1.5rem] bg-[#F8FAFC] p-6"
            >
              <Star className="h-5 w-5 text-[#0B84FD]" fill="#0B84FD" />
              <blockquote className="mt-4 flex-1 break-keep text-[0.9375rem] font-medium leading-[1.6] text-[#525252]">
                “{item.quote}”
              </blockquote>
              <figcaption className="mt-5 text-[0.875rem] font-semibold text-[#013262]">
                {item.badge}
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

function FaqItem({ item, isOpen, onToggle }) {
  return (
    <div className="border-b border-[#E8EDF3] py-5">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between gap-4 text-left"
      >
        <span className="break-keep text-[1rem] font-semibold text-[#013262]">{item.q}</span>
        <ChevronDown
          className={`h-5 w-5 shrink-0 text-[#525252] transition-transform ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>
      {isOpen && (
        <p className="mt-3 break-keep text-[0.9375rem] font-medium leading-[1.6] text-[#525252]">
          {item.a}
        </p>
      )}
    </div>
  );
}

function Faq({ faq }) {
  const [openIndex, setOpenIndex] = useState(0);

  if (!faq?.items?.length) return null;

  return (
    <section aria-label="자주 묻는 질문" className="bg-[#F8FAFC]">
      <div className="py-10 sm:py-16 lg:py-[6.25rem]">
        <SectionHeading title={faq.title} />
        <div className="mx-auto mt-8 max-w-content px-5 sm:px-8 lg:mt-10">
          <div className="rounded-[1.5rem] bg-white px-6">
            {faq.items.map((item, index) => (
              <FaqItem
                key={item.q}
                item={item}
                isOpen={openIndex === index}
                onToggle={() => setOpenIndex((prev) => (prev === index ? -1 : index))}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function PricingCta({ pricing }) {
  if (!pricing?.products?.length) return null;

  return (
    <section aria-label="이용권 안내" className="bg-white">
      <div className="py-10 sm:py-16 lg:py-[6.25rem]">
        <SectionHeading title={pricing.title} />
        <div className="mx-auto mt-8 max-w-content px-5 sm:px-8 lg:mt-10">
          <div className="space-y-3">
            {pricing.products.map((product) => {
              const hasDiscount = product.listPrice > product.price;
              return (
                <div
                  key={product.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#E8EDF3] bg-white px-5 py-4"
                >
                  <span className="flex items-center gap-3 text-[0.9375rem] font-semibold text-[#013262]">
                    {product.name}
                    {product.recommended && (
                      <span className="rounded-md bg-[#0B84FD] px-2 py-0.5 text-[0.6875rem] font-bold text-white">
                        추천
                      </span>
                    )}
                  </span>
                  <span className="flex items-center gap-2">
                    {hasDiscount && (
                      <span className="text-[0.8125rem] text-[#8a8a8a] line-through">
                        {formatKRW(product.listPrice)}
                      </span>
                    )}
                    {product.badge && (
                      <span className="text-[0.8125rem] font-bold text-[#0B84FD]">
                        {product.badge}
                      </span>
                    )}
                    <span className="text-[0.9375rem] font-bold text-[#013262]">
                      {formatKRW(product.price)}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>

          {pricing.note && (
            <p className="mt-4 text-[0.8125rem] font-medium text-[#767676]">{pricing.note}</p>
          )}

          <Link
            to={pricing.ctaTo}
            className="mt-8 inline-flex h-14 items-center justify-center rounded-xl bg-[#013262] px-8 text-base font-semibold text-white transition hover:bg-[#012347]"
          >
            {pricing.ctaLabel}
          </Link>
        </div>
      </div>
    </section>
  );
}

// pricing 실 상품이 없는 서비스(자기평가/심화탐구)용 — 결제 UI 대신 무료진단으로 안내하는
// 실제 이동 CTA(껍데기 버튼 아님). 백엔드 저장 테이블이 없어 이 서비스 전용 신청 폼은
// 만들지 않았다 — 상세는 반환 userNotes 참고.
function ShellCta({ shellCta }) {
  if (!shellCta) return null;

  return (
    <section aria-label="다음 단계 안내" className="bg-white">
      <div className="pb-16 sm:pb-20 lg:pb-[6.25rem]">
        <div className="mx-auto max-w-content px-5 sm:px-8">
          <div className="rounded-[1.5rem] bg-[#F1F8FF] px-6 py-10 text-center sm:px-10">
            <h2 className="break-keep text-[1.375rem] font-semibold leading-[1.4] tracking-[-0.03rem] text-[#013262] sm:text-[1.625rem]">
              {shellCta.title}
            </h2>
            <p className="mx-auto mt-3 max-w-[30rem] break-keep text-[0.9375rem] font-medium leading-[1.6] text-[#525252]">
              {shellCta.desc}
            </p>
            <Link
              to={shellCta.ctaTo}
              className="mt-7 inline-flex h-14 items-center justify-center rounded-xl bg-[#013262] px-8 text-base font-semibold text-white transition hover:bg-[#012347]"
            >
              {shellCta.ctaLabel}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * 서비스 랜딩 4종(목표관리/수행평가/자기평가/심화탐구) 공유 페이지 컴포넌트.
 * @param {object} props
 * @param {object} props.content src/data/serviceLandingContent.js 의 서비스별 설정 객체
 */
export default function ServiceLandingPage({ content }) {
  return (
    <main className="min-h-screen bg-white pt-16 text-[#0D1B2A]">
      <Hero hero={content.hero} />
      <Highlights highlights={content.highlights} />
      <Process process={content.process} />
      <Audience audience={content.audience} />
      <Outcomes outcomes={content.outcomes} />
      <Testimonials testimonials={content.testimonials} />
      <Faq faq={content.faq} />
      {content.pricing ? (
        <PricingCta pricing={content.pricing} />
      ) : (
        <ShellCta shellCta={content.shellCta} />
      )}
    </main>
  );
}
