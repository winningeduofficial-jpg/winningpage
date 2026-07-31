import { useState } from 'react';
import { ChevronDown, CheckCircle2 } from 'lucide-react';
import { openPaidServiceOrAlert } from '../../lib/paidServiceAccess';
import { formatKRW, SERVICES as PRICING_SERVICES } from '../../data/pricingCatalog';

import heroGrain from '../../assets/renewal/landing/hero-grain.png';
import iconBinoculars from '../../assets/services/goal/icon-binoculars.png';
import iconSisyphus from '../../assets/services/performance/icon-sisyphus.png';
import iconLightbulbSketch from '../../assets/services/performance/icon-lightbulb-sketch.png';
import audienceTopic from '../../assets/services/performance/audience-topic.jpg';
import audienceResearch from '../../assets/services/performance/audience-research.jpg';
import audienceStructure from '../../assets/services/performance/audience-structure.jpg';
import audienceQuality from '../../assets/services/performance/audience-quality-v2.jpg';
import iconLock from '../../assets/renewal/landing/icon-lock-v2.png';
import iconCalendar from '../../assets/services/performance/icon-calendar-v2.png';
import iconFolder from '../../assets/renewal/landing/icon-folder-v2.png';
import iconShield from '../../assets/renewal/landing/icon-shield-v2.png';

// 수행평가 서비스 랜딩 — /services/performance (구 경로 /page/services-ai-performance)
// Figma 시안(2393:12041, "수행평가" 프레임, 1920×7325) 전용 구현. 목표관리(GoalManagement.jsx)와
// 같은 방식으로 components/services/ServiceLandingPage 공용 스켈레톤을 벗어나 bespoke로 재작성했다.
// 가격/CTA 연동(SERVICES 카탈로그 'suhaeng', openPaidServiceOrAlert)은 공용 로직 그대로 재사용한다.

const HERO_SERVICE = { name: 'AI 수행평가 서비스', to: '/pricing' };

const SUHAENG_PRODUCTS = PRICING_SERVICES.find((service) => service.key === 'suhaeng')?.products || [];

// 컨테이너 폭 — 시안은 섹션마다 1436/1443/1520/1600px로 제각각이지만(스펙 §3),
// dev 정본 토큰 max-w-content(72.75rem≈1164px)로 전 섹션을 통일했다. 러프 구현 원칙 + 기존
// 페이지들과의 리듬 일관성을 우선한 결정.
const SECTION_HEADING_CLASS =
  'break-keep text-[1.5rem] font-semibold leading-[1.4] tracking-[-0.02em] text-[#0F172A] sm:text-[1.75rem] lg:text-[2rem]';

// 브랜드 남색 — 시안 실측값은 #013162이지만 dev 정본 토큰은 #013262(한 자리 차이, 스펙 §3).
// "코드가 정본" 원칙에 따라 dev 토큰으로 통일한다.
const BRAND_NAVY = '#013262';

const PROCESS_STEPS = [
  {
    step: 'STEP 1',
    title: '요청 내용 입력',
    desc: '과목・유형, 주제 범위, 요구사항을 학생이 직접 입력합니다.'
  },
  {
    step: 'STEP 2',
    title: '주제・자료 방향 제안',
    desc: '학생별 탐구 주제와 자료 수집 방향을 제안합니다.'
  },
  {
    step: 'STEP 3',
    title: '구성 설계 리포트',
    desc: '탐구 흐름・목차구성 설계를 리포트로 제공합니다.'
  },
  {
    step: 'STEP 4',
    title: '결과 점검・피드백',
    desc: '학생이 작성한 결과물의 점검 포인트를 확인합니다.'
  }
];

// 탭 4개(주제 추천/자료 방향/구성 설계 리포트/결과 리포트) vs 카드 3장 — 시안(2393:12041) 자체가
// 탭·카드 문구 체계가 다르고 카드 1장이 부족한 미완성 구간이다(스펙 §S3, §3 카피 결함).
// 없는 4번째 카드를 임의로 지어내지 않고, 시안에 실제로 존재하는 탭 4개 + 카드 3장 구조를 그대로
// 옮겼다(하단 S5 "네 단계로 차근차근" 섹션이 탭 라벨과 동일한 4항목 리포트를 온전히 담고 있어
// 사용자가 콘텐츠 공백을 체감하지 않도록 구성).
const COACHING_TABS = ['주제 추천', '자료 방향', '구성 설계 리포트', '결과 리포트'];

const COACHING_CARDS = [
  {
    icon: iconBinoculars,
    title: '관심 분야・유형별 주제 제안',
    desc: '과목과 관심사에 맞는 탐구 주제 후보를 제안합니다.'
  },
  {
    icon: iconSisyphus,
    title: '탐구 가치 있는 방향 제시',
    desc: '단순 조사에 그치지 않는 탐구형 주제 방향을 안내합니다.'
  },
  {
    icon: iconLightbulbSketch,
    title: '차별화 포인트 안내',
    desc: '흔한 주제를 나만의 관점으로 좁히는 포인트를 짚어줍니다.'
  }
];

const AUDIENCE_CARDS = [
  {
    image: audienceTopic,
    title: '주제 선정이 막막한 학생',
    desc: '관심 주제나 방향 설정부터 어려운 학생'
  },
  {
    image: audienceResearch,
    title: '자료 분석이 어려운 학생',
    desc: '믿을 자료와 분석 방법이 필요한 학생'
  },
  {
    // 시안 원본 텍스트에 제어문자(U+001D)가 혼입돼 있어(스펙 §3) 정정했다.
    image: audienceStructure,
    title: '구성・전개가 어려운 학생',
    desc: '논리적 흐름과 구성을 고민하는 학생'
  },
  {
    image: audienceQuality,
    title: '완성도를 높이고 싶은 학생',
    desc: '마지막 점검과 보완이 더 필요한 학생'
  }
];

// S3 탭 라벨과 정확히 일치하는 4단계 요약 — 스펙 §S5 참고(탭-카드 매핑 공백을 이 섹션이 보완).
const STAGE_SUMMARY_CARDS = [
  {
    title: '주제 추천',
    desc: '관심 분야・유형별 주제 제안, 탐구 가치 있는 방향과 차별화 포인트를 안내합니다.'
  },
  {
    title: '자료 방향',
    desc: '신뢰할 수 있는 자료 추천, 수집・분석 방향을 제시합니다.'
  },
  {
    title: '구성 설계 리포트',
    desc: '논리적 탐구 흐름 설계, 목차・세부 구성과 핵심 포인트를 정리합니다.'
  },
  {
    title: '결과 리포트',
    desc: '최종 내용 점검・피드백, 보완 포인트와 제출 전 완성도를 점검합니다.'
  }
];

// 아이콘-라벨 의미 매칭이 다소 어색하지만(자물쇠=시간절약 등) 시안 그대로 구현했다(스펙 §S6).
const OUTCOME_ITEMS = [
  { icon: iconLock, label: '시간 절약' },
  { icon: iconCalendar, label: '전문적인 방향성' },
  { icon: iconFolder, label: '체계적인 구성' },
  { icon: iconShield, label: '자신감 향상' }
];

const TESTIMONIALS = [
  {
    emoji: '😉',
    quote:
      '주제 선정부터 자료, 구성까지 단계별로 도와주셔서 막막했던 수행평가가 훨씬 수월했어요. 결과물도 더 체계적이고 완성도가 높아졌습니다!',
    name: '고2 김OO',
    tag: '인문계열'
  },
  {
    emoji: '☺️',
    quote:
      '구성 설계 리포트가 정말 큰 도움이 됐어요. 흐름이 정리되니 자료 분석과 정리도 수월했고, 발표까지 자신 있게 했습니다!',
    name: '고3 박OO',
    tag: '자연계열'
  }
];

// 답변 콘텐츠 — 시안(2393:12041)은 질문만 있고 펼침 답변 텍스트 레이어가 트리에 없다(스펙 §S8,
// §3 카피 결함). 질문 4개가 구 serviceLandingContent.js의 수행평가 FAQ와 정확히 동일해, 그 확정
// 답변을 그대로 재사용했다(신규 작성 아님).
const FAQ_ITEMS = [
  {
    q: '어떤 과목의 수행평가도 도움을 받을 수 있나요?',
    a: '국・영・수 및 대부분의 교과・창체 수행평가를 지원합니다. 특수 과목은 상담을 통해 확인해 주세요.'
  },
  {
    q: '이용 절차와 소요 시간은 어떻게 되나요?',
    a: '요청 내용 입력 후 담당 멘토가 단계별 리포트를 순차적으로 제공합니다. 자세한 소요 시간은 상담에서 안내드립니다.'
  },
  {
    q: '제시된 내용을 그대로 제출해도 되나요?',
    a: '제공되는 리포트는 방향 제시와 코칭 자료입니다. 최종 제출물은 학생이 직접 작성・보완하는 것을 권장합니다.'
  },
  {
    q: '개인 정보와 결과물은 안전하게 관리되나요?',
    a: '제출된 자료와 결과물은 서비스 제공 목적 외에는 사용되지 않으며 안전하게 관리됩니다.'
  }
];

function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-white pb-14 pt-10 sm:pb-16 sm:pt-14">
      {/* 핑크→오렌지 방사형 글로우(스펙 §2-2) — 재사용 후보였던 hero-glow.svg는 실제로는 블루 계열이라
          (코드 실측 결과 스펙 기재와 불일치) 이 섹션 전용 색으로 새로 조립했다. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-[-6rem] h-[51.25rem] w-[51.25rem] -translate-x-1/2 select-none rounded-full opacity-70 blur-3xl"
        style={{
          background:
            'radial-gradient(circle, rgba(255,123,202,0.46) 0%, rgba(255,197,110,0.3) 55%, rgba(255,197,110,0) 75%)'
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-[-2rem] h-[37.5rem] w-[37.5rem] -translate-x-1/2 select-none rounded-full opacity-60 blur-3xl"
        style={{
          background:
            'radial-gradient(circle, rgba(242,47,176,0.4) 0%, rgba(245,138,37,0.28) 55%, rgba(112,97,163,0) 80%)'
        }}
      />
      <div
        aria-hidden="true"
        style={{ backgroundImage: `url(${heroGrain})` }}
        className="pointer-events-none absolute inset-0 select-none bg-[length:8.375rem_8.375rem] bg-repeat opacity-40 mix-blend-overlay"
      />

      <div className="relative z-10 mx-auto flex w-full max-w-content flex-col items-center px-5 text-center sm:px-8">
        <p className="text-[1.5rem] font-normal leading-[1.4] text-accent">학교 과제부터 보고서까지</p>

        <h1 className="mt-4 max-w-[40rem] break-keep text-[1.75rem] font-semibold leading-[1.4] tracking-[-0.02em] text-[#0F172A] sm:text-[2rem]">
          주제 선정부터 구성・점검까지, 수행평가를 함께 완성합니다
        </h1>

        <p className="mt-4 break-keep text-[1.125rem] font-medium leading-[1.6] text-[#525252] sm:text-[1.5rem]">
          주제-자료-구성-점검까지, 학생이 스스로 완성하도록 돕는 든든한 파트너입니다.
        </p>

        <button
          type="button"
          onClick={(event) => openPaidServiceOrAlert(event, HERO_SERVICE)}
          className="mt-7 inline-flex h-14 items-center justify-center rounded-xl px-8 text-[1.25rem] font-semibold text-white transition hover:opacity-90"
          style={{ backgroundColor: BRAND_NAVY }}
        >
          지금 시작하기
        </button>

        {/* 브라우저 목업 — 시안(2393:12091)은 크롬 UI는 벡터로 존재하나 본문 콘텐츠가 완전히
            비어있다(스펙 §2-4). 스크린샷 자산이 없어 CSS로 크롬만 신규 조립하고 본문은 빈 배경으로
            둔다(디자인 재량). */}
        <div className="relative z-10 mx-auto mt-12 w-full max-w-[68.6875rem] sm:mt-16">
          <div className="overflow-hidden rounded-[0.75rem] border border-[#E5E7EB] bg-white shadow-[0_1.25rem_2.5rem_rgba(1,50,98,0.16)]">
            <div className="flex items-center gap-3 border-b border-[#E5E7EB] bg-[#DFE1E5] px-4 py-2.5">
              <span className="flex gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-[#ED6A5E]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#F6BE4F]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#62C554]" />
              </span>
              <span className="flex-1 truncate rounded-full bg-[#F1F3F4] px-4 py-1 text-center text-[0.75rem] text-[#767676]">
                https://www.winningedu.com
              </span>
            </div>
            <div className="aspect-[1099/475] w-full bg-[#FAFAFA]" aria-hidden="true" />
          </div>
        </div>
      </div>
    </section>
  );
}

function ProcessSection() {
  return (
    <section className="bg-white pt-16 sm:pt-20 lg:pt-[6.25rem]">
      <div className="mx-auto w-full max-w-content px-5 sm:px-8">
        <h2 className={SECTION_HEADING_CLASS}>위닝 수행평가와 함께하는 완성까지의 흐름</h2>

        <div className="mt-10 grid grid-cols-1 gap-5 sm:mt-12 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
          {PROCESS_STEPS.map((item) => (
            <div
              key={item.step}
              className="flex flex-col items-center gap-3 rounded-2xl border border-[#E5E7EB] bg-white px-6 py-8 text-center transition hover:-translate-y-1 hover:shadow-[0_0.75rem_1.5rem_rgba(1,50,98,0.08)]"
            >
              <span className="text-[1rem] font-semibold" style={{ color: BRAND_NAVY }}>
                {item.step}
              </span>
              <p className="text-[1.25rem] font-semibold leading-[1.4] text-[#525252]">{item.title}</p>
              <p className="break-keep text-[1rem] font-medium leading-[1.5] text-[#525252]">
                {item.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CoachingSection() {
  return (
    <section className="bg-white pt-16 sm:pt-20 lg:pt-[6.25rem]">
      <div className="mx-auto w-full max-w-content px-5 sm:px-8">
        <h2 className={SECTION_HEADING_CLASS}>네 가지 영역으로 코칭합니다</h2>

        {/* 탭 — 시안은 "주제 추천" 탭만 활성 상태로 캡처돼 있고 나머지 3탭의 카드 콘텐츠는 시안에
            없다(위 COACHING_TABS 주석 참고). 정적 시각 요소로만 두고(비인터랙티브) 아래 3카드를
            그대로 노출한다. */}
        <div
          className="mt-8 flex gap-8 overflow-x-auto border-b border-[#E5E7EB] sm:mt-10"
          role="tablist"
          aria-label="수행평가 코칭 영역"
        >
          {COACHING_TABS.map((tab, index) => (
            <span
              key={tab}
              role="tab"
              aria-selected={index === 0}
              className={`shrink-0 whitespace-nowrap pb-4 text-[1.125rem] font-medium ${
                index === 0 ? 'border-b-2 text-[#525252]' : 'text-[#D7D7D7]'
              }`}
              style={index === 0 ? { borderColor: BRAND_NAVY } : undefined}
            >
              {tab}
            </span>
          ))}
        </div>

        <div className="mt-8 grid grid-cols-1 gap-5 sm:mt-10 sm:grid-cols-3 lg:gap-6">
          {COACHING_CARDS.map((card) => (
            <div
              key={card.title}
              className="flex items-center gap-5 rounded-2xl bg-[#FBFAFA] px-6 py-7"
            >
              <img src={card.icon} alt="" aria-hidden="true" className="h-16 w-16 shrink-0 object-contain" />
              <div>
                <p className="text-[1.25rem] font-medium leading-[1.4] text-[#525252]">{card.title}</p>
                <p className="mt-2 break-keep text-[1rem] font-normal leading-[1.5] text-[#767676]">
                  {card.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function AudienceSection() {
  return (
    <section className="bg-[#F5F5F7] py-16 sm:py-20 lg:py-[6.25rem]">
      <div className="mx-auto w-full max-w-content px-5 text-center sm:px-8">
        <h2 className={SECTION_HEADING_CLASS}>이런 학생에게 수행평가를 추천해요</h2>

        <div className="mt-10 grid grid-cols-1 gap-6 sm:mt-12 sm:grid-cols-2 lg:grid-cols-4">
          {AUDIENCE_CARDS.map((item) => (
            <article
              key={item.title}
              className="flex flex-col overflow-hidden rounded-2xl bg-white text-left transition hover:-translate-y-1 hover:shadow-[0_1rem_2rem_rgba(82,82,82,0.14)]"
            >
              <img src={item.image} alt={item.title} className="h-44 w-full object-cover" />
              <div className="flex flex-1 flex-col gap-2 px-6 py-6">
                <p className="text-[1.25rem] font-semibold leading-[1.4] text-[#0F172A]">
                  {item.title}
                </p>
                <p className="break-keep text-[1rem] font-medium leading-[1.5] text-[#525252]">
                  {item.desc}
                </p>
              </div>
            </article>
          ))}
        </div>

        <div className="mt-16 sm:mt-20 lg:mt-[6.25rem]">
          <h2 className={SECTION_HEADING_CLASS}>네 단계로 차근차근</h2>

          <div className="mt-10 grid grid-cols-1 gap-5 sm:mt-12 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
            {STAGE_SUMMARY_CARDS.map((card) => (
              <div key={card.title} className="rounded-xl bg-white px-6 py-7 text-left">
                <p className="text-[1.25rem] font-semibold leading-[1.4] text-[#0F172A]">
                  {card.title}
                </p>
                <p className="mt-3 break-keep text-[1rem] font-medium leading-[1.5] text-[#767676]">
                  {card.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function OutcomesSection() {
  return (
    <section className="bg-white pt-16 sm:pt-20 lg:pt-[6.25rem]">
      <div className="mx-auto w-full max-w-content px-5 sm:px-8">
        <h2 className={SECTION_HEADING_CLASS}>수행평가로 서비스로 달라지는 것들</h2>

        <div className="mt-8 grid grid-cols-2 gap-6 rounded-xl border border-[#D7D7D7] bg-[#FBFAFA] px-6 py-8 sm:mt-10 sm:grid-cols-4 sm:gap-0 sm:divide-x sm:divide-[#E5E7EB] sm:px-4">
          {OUTCOME_ITEMS.map((item) => (
            <div key={item.label} className="flex flex-col items-center gap-3 px-4 py-2 text-center">
              <img src={item.icon} alt="" aria-hidden="true" className="h-12 w-12 sm:h-14 sm:w-14" />
              <p className="text-[1.125rem] font-medium leading-[1.4] text-[#0F172A]">{item.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function TestimonialsSection() {
  return (
    <section className="bg-white pt-16 sm:pt-20 lg:pt-[6.25rem]">
      <div className="mx-auto w-full max-w-content px-5 text-center sm:px-8">
        <h2 className={SECTION_HEADING_CLASS}>수행평가 서비스를 받아본 학생들의 후기</h2>

        <div className="mt-10 grid grid-cols-1 gap-5 sm:mt-12 lg:grid-cols-2">
          {TESTIMONIALS.map((item) => (
            <figure
              key={item.quote}
              className="flex h-full flex-col justify-between rounded-2xl bg-[#F8F9FA] p-7 text-left"
            >
              <blockquote className="break-keep text-[1.25rem] font-normal leading-[1.5] text-[#525252]">
                “{item.quote}”
              </blockquote>
              <figcaption className="mt-6 flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="flex h-[3.25rem] w-[3.25rem] items-center justify-center rounded-full bg-[#F1F1F1] text-[1.75rem]"
                >
                  {item.emoji}
                </span>
                <span className="text-[0.9375rem] font-semibold text-[#0F172A]">
                  {item.name}
                  <span className="ml-1 font-medium text-[#767676]">{item.tag}</span>
                </span>
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
    <div className="border-b border-[#E5E7EB] py-6">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between gap-4 text-left"
      >
        <span className="break-keep text-[1.125rem] font-medium text-[#525252] sm:text-[1.5rem]">
          {item.q}
        </span>
        <ChevronDown
          className={`h-6 w-6 shrink-0 text-[#767676] transition-transform ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>
      {isOpen && (
        <p className="mt-4 break-keep text-[1rem] font-medium leading-[1.6] text-[#525252]">
          {item.a}
        </p>
      )}
    </div>
  );
}

function FaqSection() {
  const [openIndex, setOpenIndex] = useState(-1);

  return (
    <section className="bg-white pt-16 sm:pt-20 lg:pt-[6.25rem]">
      <div className="mx-auto w-full max-w-content px-5 sm:px-8">
        <h2 className={SECTION_HEADING_CLASS}>자주 묻는 질문</h2>

        <div className="mt-8 sm:mt-10">
          {FAQ_ITEMS.map((item, index) => (
            <FaqItem
              key={item.q}
              item={item}
              isOpen={openIndex === index}
              onToggle={() => setOpenIndex((prev) => (prev === index ? -1 : index))}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function PricingSection() {
  if (!SUHAENG_PRODUCTS.length) return null;

  return (
    <section className="bg-white pb-20 pt-16 sm:pb-24 sm:pt-20 lg:pt-[6.25rem]">
      <div className="mx-auto w-full max-w-content px-5 text-center sm:px-8">
        <h2 className={SECTION_HEADING_CLASS}>위닝AI 수행평가 이용권 구매하기</h2>

        <div className="mt-10 overflow-hidden rounded-2xl border border-[#E5E7EB] text-left sm:mt-12">
          {SUHAENG_PRODUCTS.map((product) => {
            const hasDiscount = product.listPrice > product.price;
            return (
              <div
                key={product.id}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E5E7EB] px-6 py-6 last:border-b-0 sm:px-8"
              >
                <span className="flex items-center gap-3">
                  <CheckCircle2 className="h-6 w-6 shrink-0" style={{ color: BRAND_NAVY }} aria-hidden="true" />
                  <span className="text-[1.0625rem] font-medium text-[#0F172A] sm:text-[1.5rem]">
                    {product.name}
                  </span>
                  {product.recommended && (
                    <span className="rounded-md bg-accent px-2 py-1 text-[0.75rem] font-bold text-white">
                      추천
                    </span>
                  )}
                </span>
                <span className="flex items-center gap-2">
                  {hasDiscount && (
                    <span className="text-[0.875rem] text-[#8a8a8a] line-through">
                      {formatKRW(product.listPrice)}
                    </span>
                  )}
                  {product.badge && (
                    <span className="text-[0.875rem] font-bold" style={{ color: BRAND_NAVY }}>
                      {product.badge}
                    </span>
                  )}
                  <span className="text-[1.0625rem] font-bold text-[#0F172A] sm:text-[1.25rem]">
                    {formatKRW(product.price)}
                  </span>
                </span>
              </div>
            );
          })}
        </div>

        <p className="mt-4 break-keep text-[0.875rem] font-medium text-[#767676]">
          한 서비스 내에서 여러 플랜을 동시 선택할 수 없어요. 하나의 플랜만 선택 가능합니다.
        </p>

        <button
          type="button"
          onClick={(event) => openPaidServiceOrAlert(event, HERO_SERVICE)}
          className="mt-8 inline-flex h-14 items-center justify-center rounded-xl px-8 text-[1.25rem] font-semibold text-white transition hover:opacity-90"
          style={{ backgroundColor: BRAND_NAVY }}
        >
          이용권 구매하기
        </button>
      </div>
    </section>
  );
}

export default function PerformanceAssessment() {
  return (
    <main className="min-h-screen bg-white pt-16">
      <HeroSection />
      <ProcessSection />
      <CoachingSection />
      <AudienceSection />
      <OutcomesSection />
      <TestimonialsSection />
      <FaqSection />
      <PricingSection />
    </main>
  );
}
