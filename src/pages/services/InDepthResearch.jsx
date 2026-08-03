import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';

import heroGrain from '../../assets/renewal/landing/hero-grain.png';
import audienceTopic from '../../assets/services/research/audience-topic.png';
import audienceDesign from '../../assets/services/research/audience-design.png';
import audienceData from '../../assets/services/research/audience-data.png';
import outcomeSkill from '../../assets/services/research/outcome-skill.png';
import outcomeWallet from '../../assets/services/research/outcome-wallet.png';
import outcomeFolder from '../../assets/services/research/outcome-folder.png';
import outcomeCalendar from '../../assets/services/research/outcome-calendar.png';

// 심화탐구 서비스 랜딩 — /services/research (구 경로 /page/services-in-depth-research)
// Figma 시안(1907:21352, "심화탐구" 프레임, 1920×5871) 전용 구현. 목표관리(GoalManagement.jsx),
// 수행평가(PerformanceAssessment.jsx), 자기평가(SelfAssessment.jsx)와 같은 방식으로
// components/services/ServiceLandingPage 공용 스켈레톤을 벗어나 bespoke로 재작성했다(구
// SERVICE_LANDING_CONTENT.research 항목은 serviceLandingContent.js에서 함께 제거 — 3종 선례와 동일).
// 심화탐구는 products 테이블에 해당 상품이 없어(스펙 §5) 결제 연동 없이 CTA를 /free-diagnosis로
// 안내한다(자기평가서 선례와 동일한 처리).

const HERO_CTA_TO = '/free-diagnosis';

// 컨테이너 폭 — 시안은 섹션마다 1436~1600px(1920 기준)로 제각각이지만(스펙 §1 표 하단, §3),
// dev 정본 토큰 max-w-content(72.75rem≈1164px)로 전 섹션을 통일했다. 러프 구현 원칙(픽셀 재현
// 아님) + 기존 3종 페이지와의 리듬 일관성을 우선한 결정.
const SECTION_HEADING_CLASS =
  'break-keep text-[1.5rem] font-semibold leading-[1.4] tracking-[-0.02em] text-[#0F172A] sm:text-[1.75rem] lg:text-[2rem]';

const PROCESS_STEPS = [
  {
    step: 'STEP 1',
    title: '주제 선택',
    desc: '관심 분야에서 탐구 주제를 함께 정합니다.'
  },
  {
    step: 'STEP 2',
    title: '탐구 설계',
    desc: '주제・가설・방법・계획을 설계합니다.'
  },
  {
    step: 'STEP 3',
    title: '자료・수행',
    desc: '학생이 자료를 수집하고 탐구를 수행합니다.'
  },
  {
    step: 'STEP 4',
    title: '완성・피드백',
    desc: '학생이 완성한 결과물을 평가하고 피드백합니다.'
  }
];

const AUDIENCE_CARDS = [
  {
    image: audienceTopic,
    title: '주제가 막막한 학생',
    desc: '관심사에서 탐구 주제를 잡기 어려운 학생.'
  },
  {
    image: audienceDesign,
    title: '설계가 어려운 학생',
    desc: '가설・방법・계획을 세우기 어려운 학생.'
  },
  {
    image: audienceData,
    title: '자료 정리가 필요한 학생',
    desc: '자료를 모으고 해석하는 데 어려움을 겪는 학생.'
  },
  {
    // 시안(1907:21486)은 카드1과 동일 일러스트를 재사용한다(스펙 §2 표, 리소스 부족으로 추정).
    // 선례(목표관리/수행평가/자기평가)와 동일하게 시안 구조를 그대로 옮겨 임의로 새 이미지를
    // 지어내지 않았다 — 상세는 반환 userNotes 참고.
    image: audienceTopic,
    title: '완성도를 높이고 싶은 학생',
    desc: '초안은 있으나 더 다듬고 싶은 학생.'
  }
];

const FIVE_STEPS = [
  { title: '주제 추천', desc: '관심 분야・진로 기반으로 탐구 주제를 제안합니다.' },
  { title: '탐구 질문', desc: '탐구 가치가 있는 핵심 질문을 함께 다듬습니다.' },
  { title: '자료 정리', desc: '자료 수집・정리・출처 관리 방향을 안내합니다.' },
  { title: '설계서 작성', desc: '가설→검증→해석→한계의 설계서를 함께 구성합니다.' },
  { title: '완성본 평가', desc: '학생이 완성한 보고서・발표 자료를 평가・피드백합니다.' }
];

const OUTCOME_ITEMS = [
  { icon: outcomeSkill, label: '탐구 역량 향상' },
  { icon: outcomeWallet, label: '자료 해석력 강화' },
  { icon: outcomeFolder, label: '완성도 높은 결과물' },
  { icon: outcomeCalendar, label: '자기주도 탐구 경험' }
];

// 후기 작성자명 — 시안 원본은 "박○석/김민△/이△은"처럼 마스킹 기호와 마스킹 글자 수가
// 일관되지 않은 placeholder였다(스펙 §7, §3 "후기 이름 마스킹 비일관적"). 선례(목표관리・
// 수행평가・자기평가)의 "고N 김OO" 표기로 통일했다(신규 카피 아님, 표기만 정정). 카드 노출
// 순서는 시안 DOM 순서(우→좌→중)가 아니라 실제 x좌표 기준 좌→우 순서로 정렬했다(스펙 §7 주의).
const TESTIMONIALS = [
  {
    emoji: '😉',
    quote: '주제 선정부터 설계, 피드백까지 단계별로 도와주셔서 탐구를 끝까지 마칠 수 있었어요.',
    name: '고1 김OO'
  },
  {
    emoji: '☺️',
    quote: '자료 정리와 분석 방법을 안내해줘서 보고서의 논리성이 크게 좋아졌어요.',
    name: '고2 이OO'
  },
  {
    emoji: '😊',
    quote: '평가 리포트가 정말 구체적이라 스스로 부족한 부분을 보완할 수 있었어요.',
    name: '고2 박OO'
  }
];

// 답변 콘텐츠 — 시안(2181:9284)은 질문 4개만 있고 펼침 답변 텍스트 레이어가 트리에 없다
// (스펙 §8, §3 "답변 프레임이 시안에 전혀 없음"). 구 serviceLandingContent.js에 있던 동일 질문
// 4개의 확정 답변을 그대로 재사용했다(신규 작성 아님 — 선례와 동일 처리).
const FAQ_ITEMS = [
  {
    q: '심화탐구 프로그램은 어떤 학생에게 적합한가요?',
    a: '탐구 주제 선정이나 설계, 자료 정리에 어려움을 느끼는 학생에게 적합합니다.'
  },
  {
    q: '탐구 설계는 얼마나 자세하게 도와주나요?',
    a: '가설・검증 방법・계획을 포함한 설계서 작성을 단계별로 함께 구성합니다.'
  },
  {
    q: '자료 수집은 어디까지 지원되나요?',
    a: '자료 수집・정리 방향과 출처 관리 방법을 안내하며, 직접 수집은 학생이 진행합니다.'
  },
  {
    q: '완성본 평가는 어떤 내용을 확인하나요?',
    a: '보고서와 발표 자료의 논리성, 완성도, 보완 포인트를 중심으로 평가합니다.'
  }
];

function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-white pb-14 pt-10 sm:pb-16 sm:pt-14">
      {/* 배경 블렌드(스펙 §2-2) — Ellipse(cyan 투명→마젠타 불투명)와 Rectangle(블루 그라디언트) +
          텍스처 오버레이 블렌드 3겹을 Figma 서버 합성 PNG로 export하지 않고(용량 1.7MB, 1MB 상한
          초과) 선례(수행평가/자기평가) 방식대로 CSS 방사형 그라디언트 2겹 + 공용 grain 텍스처
          (mix-blend-overlay)로 재조립했다. 색상만 시안 실측값(cyan/magenta, blue)으로 맞췄다. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-[-6rem] h-[51.25rem] w-[51.25rem] -translate-x-1/2 select-none rounded-full opacity-70 blur-3xl"
        style={{
          background:
            'radial-gradient(circle, rgba(0,194,255,0.35) 0%, rgba(255,41,195,0.32) 55%, rgba(255,41,195,0) 75%)'
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-[-2rem] h-[37.5rem] w-[37.5rem] -translate-x-1/2 select-none rounded-full opacity-60 blur-3xl"
        style={{
          background:
            'radial-gradient(circle, rgba(24,75,255,0.32) 0%, rgba(24,75,255,0.18) 55%, rgba(24,75,255,0) 80%)'
        }}
      />
      <div
        aria-hidden="true"
        style={{ backgroundImage: `url(${heroGrain})` }}
        className="pointer-events-none absolute inset-0 select-none bg-[length:8.375rem_8.375rem] bg-repeat opacity-40 mix-blend-overlay"
      />

      <div className="relative z-10 mx-auto flex w-full max-w-content flex-col items-center px-5 text-center sm:px-8">
        {/* 시안 실측 eyebrow 색 #0B84FD는 dev 정본 accent 토큰과 정확히 일치(스펙 §3). */}
        <p className="text-[1.5rem] font-normal leading-[1.4] text-accent">탐구 설계 프로그램</p>

        <h1 className="mt-4 max-w-[40rem] break-keep text-[1.75rem] font-semibold leading-[1.4] tracking-[-0.02em] text-[#0F172A] sm:text-[2rem]">
          주제 추천부터 탐구 설계까지, 심화탐구를 끝까지
        </h1>

        <p className="mt-4 break-keep text-[1.125rem] font-medium leading-[1.6] text-[#525252] sm:text-[1.5rem]">
          탐구의 방향이 막막한 순간, 위닝 심화탐구가 구체적인 길을 제시해 학생이 스스로
          완성하도록 돕습니다
        </p>

        <Link
          to={HERO_CTA_TO}
          className="mt-7 inline-flex h-14 items-center justify-center rounded-xl bg-[#013262] px-8 text-[1.25rem] font-semibold text-white transition hover:bg-[#012347]"
        >
          지금 시작하기
        </Link>

        {/* 브라우저 목업 — 시안(2181:9094)은 크롬 UI(탭 "winningedue"/주소창)까지만 정교하고
            본문 콘텐츠는 완전히 빈 흰 캔버스인 명백한 placeholder다(스펙 §2-2, §3-1). 선례
            (수행평가/자기평가) 방식대로 크롬 프레임만 CSS로 조립하고 본문은 빈 배경으로 둔다
            (실 제품 스크린샷 자산 없음 — 런칭 전 교체 필요, userNotes 기록). */}
        <div className="relative z-10 mx-auto mt-12 w-full max-w-[68.6875rem] sm:mt-16">
          <div className="overflow-hidden rounded-[0.75rem] border border-[#E5E7EB] bg-white shadow-[0_1.25rem_2.5rem_rgba(1,50,98,0.16)]">
            <div className="flex items-center gap-3 border-b border-[#E5E7EB] bg-[#F5F6F8] px-4 py-2.5">
              <span className="flex gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F57]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#FEBC2E]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#28C840]" />
              </span>
              <span className="flex-1 truncate rounded-full border border-[#E5E7EB] bg-white px-4 py-1 text-center text-[0.75rem] text-[#767676]">
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
        <h2 className={SECTION_HEADING_CLASS}>심화탐구, 이렇게 완성돼요</h2>

        <div className="mt-10 grid grid-cols-1 gap-5 sm:mt-12 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
          {PROCESS_STEPS.map((item) => (
            <div
              key={item.step}
              className="flex flex-col items-center gap-3 rounded-[1.25rem] border border-[#D7D7D7] bg-white px-6 py-8 text-center transition hover:-translate-y-1 hover:shadow-[0_0.75rem_1.5rem_rgba(1,50,98,0.08)]"
            >
              <span className="text-[1rem] font-semibold text-[#013262]">{item.step}</span>
              <p className="text-[1.25rem] font-semibold leading-[1.4] text-[#525252]">
                {item.title}
              </p>
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

function AudienceSection() {
  return (
    <section className="bg-white pt-16 sm:pt-20 lg:pt-[6.25rem]">
      <div className="mx-auto w-full max-w-content px-5 text-center sm:px-8">
        <h2 className={SECTION_HEADING_CLASS}>이런 학생에게 심화 탐구 서비스를 추천해요</h2>

        <div className="mt-10 grid grid-cols-1 gap-5 sm:mt-12 sm:grid-cols-2 lg:grid-cols-4">
          {AUDIENCE_CARDS.map((item) => (
            <article
              key={item.title}
              className="flex flex-col overflow-hidden rounded-[1.25rem] bg-[#FBFAFA] text-left transition hover:-translate-y-1 hover:shadow-[0_1rem_2rem_rgba(82,82,82,0.14)]"
            >
              <img src={item.image} alt={item.title} className="h-44 w-full object-cover" />
              <div className="flex flex-1 flex-col gap-2 px-6 py-6">
                <p className="text-[1.25rem] font-semibold leading-[1.4] text-[#525252]">
                  {item.title}
                </p>
                <p className="break-keep text-[1rem] font-medium leading-[1.5] text-[#525252]">
                  {item.desc}
                </p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function FiveStepsSection() {
  const [firstRow, secondRow] = [FIVE_STEPS.slice(0, 3), FIVE_STEPS.slice(3)];

  return (
    <section className="bg-white pt-16 sm:pt-20 lg:pt-[6.25rem]">
      <div className="mx-auto w-full max-w-content px-5 sm:px-8">
        <h2 className={SECTION_HEADING_CLASS}>다섯 단계로 차근차근</h2>

        <div className="mt-10 grid grid-cols-1 gap-5 sm:mt-12 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
          {firstRow.map((item) => (
            <div key={item.title} className="rounded-xl bg-[#F0F2F5] px-6 py-7">
              <p className="text-[1.25rem] font-semibold leading-[1.4] text-[#525252]">
                {item.title}
              </p>
              <p className="mt-3 break-keep text-[1rem] font-medium leading-[1.5] text-[#767676]">
                {item.desc}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:mx-auto lg:mt-6 lg:max-w-[47.5rem] lg:gap-6">
          {secondRow.map((item) => (
            <div key={item.title} className="rounded-xl bg-[#F0F2F5] px-6 py-7 text-center">
              <p className="text-[1.25rem] font-semibold leading-[1.4] text-[#525252]">
                {item.title}
              </p>
              <p className="mt-3 break-keep text-[1rem] font-medium leading-[1.5] text-[#767676]">
                {item.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function OutcomesSection() {
  return (
    <section className="bg-white pt-16 sm:pt-20 lg:pt-[6.25rem]">
      <div className="mx-auto w-full max-w-content px-5 sm:px-8">
        <h2 className={SECTION_HEADING_CLASS}>심화탐구로 달라지는 것들</h2>

        <div className="mt-8 grid grid-cols-2 gap-6 rounded-xl border border-[#D7D7D7] bg-[#FBFAFA] px-6 py-8 sm:mt-10 sm:grid-cols-4 sm:gap-0 sm:divide-x sm:divide-[#E5E7EB] sm:px-4">
          {OUTCOME_ITEMS.map((item) => (
            <div key={item.label} className="flex flex-col items-center gap-3 px-4 py-2 text-center">
              <img src={item.icon} alt="" aria-hidden="true" className="h-12 w-12 sm:h-14 sm:w-14" />
              <p className="text-[1.125rem] font-medium leading-[1.4] text-[#0F172A]">
                {item.label}
              </p>
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
        <h2 className={SECTION_HEADING_CLASS}>심화탐구 서비스를 받아본 학생들의 후기</h2>

        <div className="mt-10 grid grid-cols-1 gap-5 sm:mt-12 lg:grid-cols-3">
          {TESTIMONIALS.map((item) => (
            <figure
              key={item.quote}
              className="flex h-full flex-col justify-between rounded-[2.5rem] bg-[#F8F9FA] p-7 text-left"
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
                <span className="text-[0.9375rem] font-semibold text-[#0F172A]">{item.name}</span>
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
    <div className="border-b border-[#D7D7D7] py-6">
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
    <section className="bg-white pt-16 pb-20 sm:pt-20 sm:pb-24 lg:pt-[6.25rem]">
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

export default function InDepthResearch() {
  return (
    <main className="min-h-screen bg-white pt-16">
      <HeroSection />
      <ProcessSection />
      <AudienceSection />
      <FiveStepsSection />
      <OutcomesSection />
      <TestimonialsSection />
      <FaqSection />
    </main>
  );
}
