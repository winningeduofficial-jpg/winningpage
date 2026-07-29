import { Link } from 'react-router-dom';
import Header from '../../components/Header';
import SiteFooter from '../../components/SiteFooter';

import heroBrowserV2 from '../../assets/renewal/landing/hero-browser-v2.png';
import heroGlow from '../../assets/renewal/landing/hero-glow.svg';
import heroGrain from '../../assets/renewal/landing/hero-grain.png';
import illustrationStrength from '../../assets/renewal/landing/illustration-strength.png';
import illustrationWeakness from '../../assets/renewal/landing/illustration-weakness.png';
import illustrationTrial from '../../assets/renewal/landing/illustration-trial.png';
import iconLock from '../../assets/renewal/landing/icon-lock.png';
import iconFolder from '../../assets/renewal/landing/icon-folder.png';
import iconShield from '../../assets/renewal/landing/icon-shield.png';
import macbookMockup from '../../assets/renewal/landing/macbook-mockup.png';
import macbookScreenContent from '../../assets/renewal/landing/macbook-screen-content.png';

const CTA_LINK_CLASS =
  'inline-flex h-14 w-full max-w-[18.75rem] items-center justify-center rounded-[1.875rem] px-8 text-base font-semibold text-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 sm:h-[4.25rem] sm:text-[1.25rem]';

const STEPS = [
  { step: 'STEP 1', title: '문항 입력', desc: '학년, 성적 흐름을 간단히 입력해요' },
  { step: 'STEP 2', title: '상세 분석', desc: '지금 겪는 어려움을 선택해요' },
  { step: 'STEP 3', title: '결과 확인', desc: '응답을 바탕으로 유형을 분석해요' },
  { step: 'STEP 4', title: '서비스 추천', desc: '가장 먼저 필요한 서비스를 추천해요' }
];

const AUDIENCE = [
  {
    image: illustrationStrength,
    titleLines: ['내 강점이 뭔지', '아직 정리가 안된 학생'],
    descLines: ['목표는 있는데 지금 무엇을 준비해야', '할지 감이 안 잡히는 경우']
  },
  {
    image: illustrationWeakness,
    titleLines: ['어떤 학습부분에서 약한지', '확인하고 싶은 학생'],
    descLines: ['해야 할 건 많은데 우선순위가', '서지 않아 시작이 어려운 경우']
  },
  {
    image: illustrationTrial,
    titleLines: ['유료 서비스 전에 무료로', '서비스를 경험해보고 싶은 분'],
    descLines: ['내 위치를 데이터로 확인하고', '맞는 서비스를 찾고 있는 경우']
  }
];

const BENEFITS = [
  { icon: iconLock, label: '상세 진단 요약 카드' },
  { icon: iconFolder, label: '나의 강점 정리본' },
  { icon: iconShield, label: '보완 안내' }
];

const FLOATING_BADGES = [
  { emoji: '📊', label: '상세 진단 요약 카드', position: 'left-[1%] top-[52%]' },
  { emoji: '📋', label: '보완 안내', position: 'right-[2%] top-[15%]' },
  { emoji: '✏️', label: '나의 강점 정리본', position: 'right-[1%] top-[70%]' }
];

const SECTION_HEADING_CLASS =
  'break-keep text-[1.5rem] font-bold leading-[1.4] tracking-[-0.02em] text-[#525252] sm:text-[1.75rem] md:text-[2.75rem]';

// 히어로 전용 타이포 — SECTION_HEADING_CLASS는 다른 섹션과 공유하므로 별도 정의.
const HERO_EYEBROW_CLASS =
  'text-[1.25rem] font-normal leading-[1.6] text-[#0B84FD] sm:text-[1.375rem] md:text-[1.5rem]';
const HERO_HEADLINE_CLASS =
  'break-keep max-w-[56rem] text-[1.75rem] font-bold leading-[1.3] tracking-[-0.02em] text-[#0F172A] sm:text-[2.25rem] md:text-[2.75rem] lg:max-w-none lg:whitespace-nowrap';
const HERO_SUBTEXT_CLASS =
  'text-[1.125rem] font-medium leading-[1.6] text-[#525252] sm:text-[1.25rem] md:text-[1.5rem]';

// Figma TILE fill(scalingFactor 0.609 → 134px/8.375rem 타일) + blendMode OVERLAY 재현.
// 글로우 프레임 내부 1겹 + 히어로 프레임 전체 1겹, 총 2겹으로 원본과 동일하게 겹친다.
const HERO_GRAIN_STYLE = { backgroundImage: `url(${heroGrain})` };
const HERO_GRAIN_CLASS =
  'pointer-events-none absolute select-none bg-[length:8.375rem_8.375rem] bg-repeat mix-blend-overlay';

function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-white pb-14 pt-10 sm:pb-16 sm:pt-14 md:pb-20 md:pt-[6.25rem] lg:pb-0">
      <img
        src={heroGlow}
        alt=""
        aria-hidden="true"
        draggable="false"
        className="pointer-events-none absolute left-1/2 top-[-1.09%] w-[83.34%] max-w-none -translate-x-1/2 select-none"
      />
      <div
        aria-hidden="true"
        style={HERO_GRAIN_STYLE}
        className={`${HERO_GRAIN_CLASS} left-1/2 top-[-1.09%] aspect-[4/3] w-[83.34%] -translate-x-1/2`}
      />
      <div aria-hidden="true" style={HERO_GRAIN_STYLE} className={`${HERO_GRAIN_CLASS} inset-0`} />

      <div className="relative z-10 mx-auto flex w-full max-w-content flex-col items-center px-5 text-center sm:px-8">
        <p className={HERO_EYEBROW_CLASS}>무료진단</p>

        <h1 className={`mt-6 ${HERO_HEADLINE_CLASS}`}>
          학생부 업로드 없이 나에게 딱 맞는 서비스를 추천받아요
        </h1>

        <p className={`mt-6 ${HERO_SUBTEXT_CLASS}`}>설문조사로 나의 강점과 약점을 찾아드려요</p>

        <Link
          to="/free-diagnosis/survey"
          className={`${CTA_LINK_CLASS} mt-6 bg-[#013262] shadow-[0_0.625rem_1.5625rem_rgba(1,50,98,0.4)] hover:bg-[#01498F] focus-visible:ring-[#013262]`}
        >
          지금 시작하기
        </Link>

        <div className="relative z-10 mx-auto mt-8 w-full max-w-[66.75rem] sm:mt-10 md:mt-[3.0625rem] lg:mb-[-5.75rem]">
          <div className="overflow-hidden rounded-[0.3125rem] shadow-[0_0_0.0625rem_rgba(0,0,0,0.7),0_1.25rem_1.875rem_rgba(0,0,0,0.3),0_0.625rem_3.125rem_rgba(0,0,0,0.2)]">
            <img
              src={heroBrowserV2}
              alt="위닝에듀 무료진단 문항 화면이 담긴 브라우저 목업"
              width={1280}
              height={553}
              className="w-full"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function StepsSection() {
  return (
    <section className="bg-white pt-20 pb-10">
      <div className="mx-auto w-full max-w-content px-5 sm:px-8">
        <h2 className={SECTION_HEADING_CLASS}>
          학생부 업로드 없이,
          <br />
          20분이면 완성하는 무료진단
        </h2>

        <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6 lg:grid-cols-4 lg:gap-8">
          {STEPS.map((item) => (
            <div
              key={item.step}
              className="flex flex-col items-center gap-5 rounded-[1.25rem] border border-[#D7D7D7] bg-white px-6 py-8 text-center shadow-[0_0.75rem_0.625rem_rgba(215,215,215,0.4)] transition hover:-translate-y-1 hover:shadow-[0_1rem_1.5rem_rgba(215,215,215,0.55)] sm:px-[1.875rem] sm:py-10"
            >
              <div className="flex flex-col items-center gap-1">
                <p className="text-base font-semibold text-[#013262]">{item.step}</p>
                <p className="text-xl font-semibold text-[#525252]">{item.title}</p>
              </div>
              <p className="break-keep text-base font-medium leading-[1.4] text-[#525252]">
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
    <section className="bg-white pt-20 pb-10">
      <div className="mx-auto w-full max-w-content px-5 sm:px-8">
        <h2 className={SECTION_HEADING_CLASS}>이런 학생에게 무료 진단을 추천해요</h2>

        <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 lg:gap-8">
          {AUDIENCE.map((item) => (
            <article
              key={item.titleLines.join('')}
              className="flex flex-col overflow-hidden rounded-[1.875rem] bg-[#FBFAFA] transition hover:-translate-y-1 hover:shadow-[0_1.25rem_2.5rem_rgba(82,82,82,0.14)]"
            >
              <img
                src={item.image}
                alt={item.titleLines.join(' ')}
                className="aspect-[3/2] w-full object-cover"
              />
              <div className="flex flex-col gap-3 px-7 py-8 sm:px-9">
                <p className="break-keep text-lg font-semibold leading-[1.3] tracking-[-0.02em] text-[#525252] sm:text-xl md:text-[1.5rem]">
                  {item.titleLines[0]}
                  <br />
                  {item.titleLines[1]}
                </p>
                <p className="break-keep text-base font-medium leading-[1.4] tracking-[-0.02em] text-[#6B6B6B]">
                  {item.descLines[0]}
                  <br />
                  {item.descLines[1]}
                </p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function BenefitsSection() {
  return (
    <section className="bg-white pb-10 pt-20">
      <div className="mx-auto flex w-full max-w-content flex-col items-center gap-10 px-5 sm:px-8 md:gap-14">
        <h2 className={`text-center ${SECTION_HEADING_CLASS}`}>무료진단으로 얻을 수 있는 것</h2>

        <div className="w-full max-w-[60.625rem] rounded-[0.75rem] border border-[#D7D7D7] bg-[#FBFAFA] px-6 py-10 sm:px-10 md:py-12">
          <div className="grid grid-cols-1 divide-y divide-[#E2E2E2] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {BENEFITS.map((item) => (
              <div
                key={item.label}
                className="flex flex-col items-center gap-4 py-6 first:pt-0 last:pb-0 sm:px-6 sm:py-0"
              >
                <img
                  src={item.icon}
                  alt=""
                  width={100}
                  height={100}
                  className="h-[5rem] w-[5rem] sm:h-[6.25rem] sm:w-[6.25rem]"
                />
                <p className="text-lg font-semibold tracking-[-0.02em] text-[#525252] sm:text-xl md:text-[1.5rem]">
                  {item.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function MacbookShowcase() {
  return (
    <section className="relative overflow-hidden bg-white py-16 sm:py-20 md:py-24 lg:py-[9rem]">
      <div className="relative mx-auto w-full max-w-content px-5 sm:px-8">
        <h2 className={`text-center ${SECTION_HEADING_CLASS}`}>
          지금 내 입시 좌표를 확인 해보세요
        </h2>

        <div className="relative mx-auto mt-16 flex max-w-[58rem] flex-col items-center sm:mt-20 md:mt-24 lg:mt-28">
          <div
            className="pointer-events-none absolute -z-10 aspect-[3/2] w-[185%] max-w-none rounded-full bg-[radial-gradient(ellipse_at_center,rgba(11,132,253,0.28),rgba(11,132,253,0.1)_45%,transparent_78%)] blur-3xl"
            aria-hidden="true"
          />

          <div className="relative w-full">
            <img
              src={macbookMockup}
              alt="위닝에듀 무료진단 결과 화면이 표시된 맥북 목업"
              width={931}
              height={562}
              className="w-full"
            />
            <div className="pointer-events-none absolute left-[12%] top-[5%] h-[82.8%] w-[76%] overflow-hidden rounded-[0.3rem] sm:rounded-[0.45rem]">
              <img
                src={macbookScreenContent}
                alt=""
                aria-hidden="true"
                width={991}
                height={484}
                className="absolute inset-0 h-full w-full object-cover object-left-top"
              />
            </div>
          </div>

          <div className="mt-8 flex w-full max-w-[26rem] flex-col gap-3 lg:hidden">
            {FLOATING_BADGES.map((badge) => (
              <span
                key={badge.label}
                className="inline-flex items-center justify-center gap-2 rounded-[1.875rem] bg-[#F5FAFF] px-5 py-3 text-base font-semibold text-[#013262] shadow-[0_0.25rem_0.625rem_rgba(11,132,253,0.25)]"
              >
                {badge.emoji} {badge.label}
              </span>
            ))}
          </div>
        </div>

        <div className="pointer-events-none absolute inset-0 hidden lg:block" aria-hidden="true">
          {FLOATING_BADGES.map((badge) => (
            <span
              key={badge.label}
              className={`absolute ${badge.position} inline-flex items-center whitespace-nowrap rounded-[1.875rem] bg-[#F5FAFF] px-5 py-3 text-base font-semibold text-[#013262] shadow-[0_0.5rem_1.5rem_rgba(11,132,253,0.35)]`}
            >
              {badge.emoji} {badge.label}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function BottomCta() {
  return (
    <section className="bg-[#172437] py-14 md:py-20 lg:py-[7.5rem]">
      <div className="mx-auto flex w-full max-w-content flex-col items-center gap-8 px-5 text-center sm:gap-10 sm:px-8">
        <h2 className="break-keep text-[1.5rem] font-bold leading-[1.4] tracking-[-0.02em] text-white sm:text-[1.75rem] md:text-[2.75rem]">
          어서 무료진단을 경험해보세요
        </h2>

        <Link
          to="/free-diagnosis/survey"
          className={`${CTA_LINK_CLASS} bg-[#013262] shadow-[0_0.625rem_1.5625rem_rgba(1,50,98,0.4)] hover:bg-[#01498F] focus-visible:ring-white`}
        >
          무료진단 시작하기 →
        </Link>
      </div>
    </section>
  );
}

export default function FreeDiagnosisLanding() {
  return (
    <>
      <Header />

      <main className="min-h-screen bg-white pt-[5.25rem]">
        <HeroSection />
        <StepsSection />
        <AudienceSection />
        <BenefitsSection />
        <MacbookShowcase />
        <BottomCta />
      </main>

      <SiteFooter />
    </>
  );
}
