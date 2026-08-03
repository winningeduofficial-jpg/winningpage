import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';

import heroGrain from '../../assets/renewal/landing/hero-grain.png';
import iconBinoculars from '../../assets/services/goal/icon-binoculars.png';
import iconSisyphus from '../../assets/services/performance/icon-sisyphus.png';
import iconLightbulb from '../../assets/services/performance/icon-lightbulb-sketch.png';
import studentCardWriting from '../../assets/services/self-assessment/student-card-01-writing.jpg';
import studentCardOrganizing from '../../assets/services/self-assessment/student-card-02-organizing.jpg';
import studentCardStructuring from '../../assets/services/self-assessment/student-card-03-structuring.jpg';
import studentCardPolishing from '../../assets/services/self-assessment/student-card-04-polishing.jpg';
import outcomeSettings from '../../assets/services/goal/outcome-settings.png';
import iconWallet from '../../assets/services/self-assessment/icon-wallet.png';
import outcomeFolder from '../../assets/services/goal/outcome-folder.png';
import outcomeCalendar from '../../assets/services/goal/outcome-calendar.png';

// 자기평가서 서비스 랜딩 — /services/self-assessment (구 경로 /page/services-self-assessment)
// Figma 시안(1907:20783, "자기평가서" 프레임, 1920×6560) 전용 구현. 목표관리(GoalManagement.jsx),
// 수행평가(PerformanceAssessment.jsx)와 같은 방식으로 components/services/ServiceLandingPage
// 공용 스켈레톤을 벗어나 bespoke로 재작성했다(구 SERVICE_LANDING_CONTENT.selfAssessment 항목은
// serviceLandingContent.js에서 함께 제거 — goal/performance 선례와 동일).
// 자기평가는 products 테이블에 해당 상품이 없어(스펙 §5) 결제 연동 없이 CTA를 /free-diagnosis로
// 안내한다(기존 ServiceLandingPage 스켈레톤의 paidServiceName: null 분기와 동일한 처리).

const HERO_CTA_TO = '/free-diagnosis';

// 컨테이너 폭 — 시안은 섹션마다 1436~1600px(1920 기준)로 제각각이지만(스펙 §3-2-2),
// dev 정본 토큰 max-w-content(72.75rem≈1164px)로 전 섹션을 통일했다. 러프 구현 원칙(픽셀 재현
// 아님) + 기존 페이지들과의 리듬 일관성을 우선한 결정.
const SECTION_HEADING_CLASS =
  'break-keep text-[1.5rem] font-semibold leading-[1.4] tracking-[-0.02em] text-[#0F172A] sm:text-[1.75rem] lg:text-[2rem]';

const PROCESS_STEPS = [
  {
    title: '문항・활동 입력',
    desc: '문항과 활동 자료를 학생이 직접 입력합니다.'
  },
  {
    title: '핵심 내용 정리',
    desc: '입력한 내용에서 핵심을 체계적으로 정리합니다.'
  },
  {
    title: '구조 설계',
    desc: '논리적 구성과 흐름을 설계합니다.'
  },
  {
    title: '피드백・점검',
    desc: '학생이 작성한 초안의 표현・완성도를 점검합니다.'
  }
];

const STAGE_TABS = ['문항분석', '내용정리', '강점추출', '구조설계', '피드백'];

const STAGE_CARDS = [
  {
    icon: iconBinoculars,
    title: '문항 의도 파악',
    desc: '문항이 묻는 핵심과 의도를 짚어줍니다.'
  },
  {
    icon: iconSisyphus,
    title: '답변 방향 설정',
    desc: '무엇을 중심으로 써야 할지 방향을 잡아줍니다.'
  },
  {
    icon: iconLightbulb,
    title: '핵심 키워드 도출',
    desc: '답변에 담아야 할 핵심 키워드를 정리합니다.'
  }
];

const AUDIENCE_CARDS = [
  {
    image: studentCardWriting,
    title: '작성이 막막한 학생',
    desc: '어디서부터 시작할지 모르겠는 학생.'
  },
  {
    image: studentCardOrganizing,
    title: '정리가 어려운 학생',
    desc: '경험은 있는데 어떻게 풀지 막막한 학생.'
  },
  {
    image: studentCardStructuring,
    title: '구성이 어려운 학생',
    desc: '설득력 있는 흐름과 구성이 어려운 학생.'
  },
  {
    image: studentCardPolishing,
    title: '완성도를 높이고 싶은 학생',
    desc: '초안은 있으나 더 다듬고 싶은 학생.'
  }
];

// 시안(1907:20945)은 상위 4단계 프로세스(ProcessSection)의 "핵심 내용 정리" 단계가
// "활동 정리 + 강점 추출"로 세분화된 5단계 상세 버전이다(스펙 §1-5, 숫자 불일치 아님).
const FIVE_STEPS = [
  { title: '문항 해석', desc: '문항의 의도와 핵심을 짚어 답변 방향을 잡습니다.' },
  { title: '활동 정리', desc: '입력한 활동・경험을 체계적으로 정리합니다.' },
  { title: '강점 추출', desc: '나만의 강점과 차별화 포인트를 함께 찾습니다.' },
  { title: '구조 설계', desc: '논리적 구성과 흐름을 설계합니다.' },
  { title: '피드백', desc: '학생 초안의 표현・완성도를 점검하고 보완합니다.' }
];

const OUTCOME_ITEMS = [
  { icon: outcomeSettings, label: '구조 설계안' },
  { icon: iconWallet, label: '핵심 내용 요약본' },
  { icon: outcomeFolder, label: '강점・차별화 포인트' },
  { icon: outcomeCalendar, label: '피드백 리포트' }
];

// 후기 작성자명 — 시안 원본은 "고3 김□□/이△△/박○○"처럼 마스킹 기호가 그대로 노출된
// placeholder였다(스펙 §3-3). 목표관리・수행평가 선례의 "고N 김OO" 마스킹 표기로 교체했다.
const TESTIMONIALS = [
  {
    emoji: '😉',
    quote: '문항 해석부터 구조까지 단계별로 도와주셔서 수월하게 작성할 수 있었어요.',
    name: '고3 이OO'
  },
  {
    emoji: '☺️',
    quote: '제가 가진 강점을 잘 정리해줘서 자소서 설득력이 높아졌어요.',
    name: '고3 박OO'
  },
  {
    emoji: '😊',
    quote: '피드백이 정말 구체적이라 부족했던 부분을 스스로 고칠 수 있었어요.',
    name: '고3 김OO'
  }
];

// 답변 콘텐츠 — 시안(2181:8127)은 닫힌 상태만 존재해 질문 텍스트만 확정돼 있다(스펙 §1-8,
// §3-3). 구 serviceLandingContent.js에 있던 동일 질문 5개의 확정 답변을 그대로 재사용했다
// (신규 작성 아님).
const FAQ_ITEMS = [
  {
    q: '어떤 자료를 입력해야 하나요?',
    a: '지원 문항, 활동 기록, 초안 등 보유한 자료를 입력하면 이를 기반으로 분석합니다.'
  },
  {
    q: 'AI가 대신 작성해 주나요?',
    a: '직접 작성을 대신하지 않으며, 방향 제시와 피드백을 통해 학생이 스스로 완성하도록 돕습니다.'
  },
  {
    q: '피드백은 어떤 기준으로 제공되나요?',
    a: '문항 의도 부합도, 논리적 구성, 표현의 설득력을 기준으로 피드백을 제공합니다.'
  },
  {
    q: '제공되는 결과물은 어떻게 활용하나요?',
    a: '구조 설계안과 피드백 리포트를 참고해 학생이 직접 최종본을 작성・보완하는 데 활용합니다.'
  },
  {
    q: '이용 요금은 어떻게 되나요?',
    a: '정확한 이용 요금은 상담을 통해 안내드립니다.'
  }
];

function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-white pb-14 pt-10 sm:pb-16 sm:pt-14">
      {/* 장식 블롭(스펙 §1-1) — Eclipse(투명주황→코랄)와 Rectangle 31(연보라→시안)을 CSS
          gradient+blur로 조립했다(스펙 §2-표 권고: 노드 export보다 CSS 구현이 실용적). */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-[-6rem] h-[51.25rem] w-[51.25rem] -translate-x-1/2 select-none rounded-full opacity-70 blur-3xl"
        style={{
          background:
            'radial-gradient(circle, rgba(255,165,110,0.4) 0%, rgba(255,127,140,0.28) 55%, rgba(255,127,140,0) 75%)'
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-[-2rem] h-[37.5rem] w-[37.5rem] -translate-x-1/2 select-none rounded-full opacity-60 blur-3xl"
        style={{
          background:
            'radial-gradient(circle, rgba(196,167,255,0.35) 0%, rgba(110,197,255,0.26) 55%, rgba(110,197,255,0) 80%)'
        }}
      />
      <div
        aria-hidden="true"
        style={{ backgroundImage: `url(${heroGrain})` }}
        className="pointer-events-none absolute inset-0 select-none bg-[length:8.375rem_8.375rem] bg-repeat opacity-40 mix-blend-overlay"
      />

      <div className="relative z-10 mx-auto flex w-full max-w-content flex-col items-center px-5 text-center sm:px-8">
        <p className="text-[1.5rem] font-normal leading-[1.4] text-accent">서류 작성 지원 프로그램</p>

        <h1 className="mt-4 max-w-[40rem] break-keep text-[1.75rem] font-semibold leading-[1.4] tracking-[-0.02em] text-[#0F172A] sm:text-[2rem]">
          문항 해석부터 구조 설계까지, 자기평가서를 더 설득력 있게
        </h1>

        <p className="mt-4 break-keep text-[1.125rem] font-medium leading-[1.6] text-[#525252] sm:text-[1.5rem]">
          문항 핵심을 파악하고 나만의 강점을 구조화해, 학생이 스스로 완성하도록 돕습니다
        </p>

        <Link
          to={HERO_CTA_TO}
          className="mt-7 inline-flex h-14 items-center justify-center rounded-xl bg-[#013262] px-8 text-[1.25rem] font-semibold text-white transition hover:bg-[#012347]"
        >
          지금 시작하기
        </Link>

        {/* 브라우저 목업 — 시안(2181:10054)은 크롬 UI만 있고 실제 서비스 화면이 비어있다
            (스펙 §1-1, §3-3). 수행평가 선례와 동일하게 크롬 프레임만 CSS로 조립하고 본문은
            빈 배경으로 둔다(실 캡처 자산 없음, 디자인 재량). */}
        <div className="relative z-10 mx-auto mt-12 w-full max-w-[68.125rem] sm:mt-16">
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
        {/* 타이틀 — 시안 원문은 "위닝 목표관리의 4단계 핵심 프로세스"로 다른 서비스(목표관리)
            카피가 그대로 복사돼 있었다(스펙 §1-2 실측 결함). 자기평가서 문맥에 맞게 정정했다
            (userNotes 기록). 굵기도 시안(700)과 달리 다른 6개 H2와 동일한 600으로 통일(스펙
            §3-2-3 통일 권장, 목표관리 선례와 동일 처리). */}
        <h2 className={SECTION_HEADING_CLASS}>
          위닝 자기평가서의
          <br />
          4단계 핵심 프로세스
        </h2>

        <div className="mt-10 grid grid-cols-1 gap-5 sm:mt-12 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
          {PROCESS_STEPS.map((item, index) => (
            <div
              key={item.title}
              className="flex flex-col items-center gap-3 rounded-2xl border border-[#D8D8D8] bg-white px-6 py-8 text-center shadow-[0_0.75rem_1.25rem_rgba(216,216,216,0.4)] transition hover:-translate-y-1"
            >
              <span className="text-[1rem] font-semibold text-[#013262]">STEP {index + 1}</span>
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

function StageSection() {
  return (
    <section className="bg-white pt-16 sm:pt-20 lg:pt-[6.25rem]">
      <div className="mx-auto w-full max-w-content px-5 sm:px-8">
        {/* 타이틀 — 시안 원문은 "단계별로, 목표를 관리합니다"로 목표관리 프레임의 카피가
            그대로 복사돼 있었다(스펙 §1-3 실측 결함, §1-2·§1-7과 동일한 계열의 복붙 잔재).
            이 섹션 콘텐츠(문항분석 탭 3카드)에 맞게 정정했다(userNotes 기록). */}
        <h2 className={SECTION_HEADING_CLASS}>단계별로, 자기평가서를 완성합니다</h2>

        {/* 탭 — 시안(1907:20878)은 "문항분석" 탭만 활성 상태로 카드 콘텐츠가 그려져 있고
            나머지 4탭(내용정리・강점추출・구조설계・피드백)의 콘텐츠는 시안에 없다(스펙 §1-3,
            §3-3). 없는 콘텐츠를 추정해 채우면 오히려 신뢰를 해치므로 탭은 시안 그대로의 정적
            시각 요소로만 두고(비인터랙티브, 목표관리・수행평가 선례와 동일), 아래 3개 카드는
            "문항분석" 탭 콘텐츠를 그대로 노출한다. */}
        <div
          className="mt-8 flex gap-8 overflow-x-auto border-b border-[#E5E7EB] sm:mt-10"
          role="tablist"
          aria-label="자기평가서 작성 단계"
        >
          {STAGE_TABS.map((tab, index) => (
            <span
              key={tab}
              role="tab"
              aria-selected={index === 0}
              className={`shrink-0 whitespace-nowrap pb-4 text-[1.125rem] font-medium ${
                index === 0 ? 'border-b-2 border-[#013262] text-[#013262]' : 'text-[#A3A3A3]'
              }`}
            >
              {tab}
            </span>
          ))}
        </div>

        <div className="mt-8 grid grid-cols-1 gap-5 sm:mt-10 sm:grid-cols-3 lg:gap-6">
          {STAGE_CARDS.map((card) => (
            <div
              key={card.title}
              className="flex flex-col items-center gap-4 rounded-2xl bg-[#FBFAFA] px-6 py-8 text-center"
            >
              <img src={card.icon} alt="" aria-hidden="true" className="h-24 w-24 object-contain" />
              <div>
                <p className="text-[1.25rem] font-semibold leading-[1.4] text-[#525252]">
                  {card.title}
                </p>
                <p className="mt-2 break-keep text-[1rem] font-medium leading-[1.5] text-[#767676]">
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
    <section className="bg-white pt-16 sm:pt-20 lg:pt-[6.25rem]">
      <div className="mx-auto w-full max-w-content px-5 text-center sm:px-8">
        <h2 className={SECTION_HEADING_CLASS}>
          이런 학생에게 <span className="text-accent">자기 평가 서비스를 추천</span>해요
        </h2>

        <div className="mt-10 grid grid-cols-1 gap-6 sm:mt-12 sm:grid-cols-2 lg:grid-cols-4">
          {AUDIENCE_CARDS.map((item) => (
            <article
              key={item.title}
              className="flex flex-col overflow-hidden rounded-2xl bg-[#FBFAFA] text-left transition hover:-translate-y-1 hover:shadow-[0_1rem_2rem_rgba(82,82,82,0.14)]"
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
            <div key={item.title} className="rounded-xl bg-[#F5F5F7] px-6 py-7">
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
            <div key={item.title} className="rounded-xl bg-[#F5F5F7] px-6 py-7 text-center">
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
      <div className="mx-auto w-full max-w-content px-5 text-center sm:px-8">
        <h2 className={SECTION_HEADING_CLASS}>자기평가로 정리되는 것들</h2>

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
        {/* 타이틀 — 시안 원문은 "목표관리 서비스를 받아본 학생들의 후기"로 다른 서비스 카피가
            그대로 복사돼 있었다(스펙 §1-7 실측 결함). 자기평가서 문맥에 맞게 정정했다
            (userNotes 기록). */}
        <h2 className={SECTION_HEADING_CLASS}>자기평가 서비스를 받아본 학생들의 후기</h2>

        <div className="mt-10 grid grid-cols-1 gap-5 sm:mt-12 lg:grid-cols-3">
          {TESTIMONIALS.map((item) => (
            <figure
              key={item.quote}
              className="flex h-full flex-col justify-between rounded-2xl bg-[#F8F9FA] p-7 text-left shadow-[0_0.125rem_0.25rem_rgba(213,213,213,0.25)]"
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

export default function SelfAssessment() {
  return (
    <main className="min-h-screen bg-white pt-16">
      <HeroSection />
      <ProcessSection />
      <StageSection />
      <AudienceSection />
      <FiveStepsSection />
      <OutcomesSection />
      <TestimonialsSection />
      <FaqSection />
    </main>
  );
}
