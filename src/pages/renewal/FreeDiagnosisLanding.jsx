import { Link } from 'react-router-dom';
import Header from '../../components/Header';
import SiteFooter from '../../components/SiteFooter';

import heroBrowserV2 from '../../assets/renewal/landing/hero-browser-v2.png';
import heroGlow from '../../assets/renewal/landing/hero-glow.svg';
import heroGrain from '../../assets/renewal/landing/hero-grain.png';
import illustrationStrength from '../../assets/renewal/landing/illustration-strength.png';
import illustrationWeakness from '../../assets/renewal/landing/illustration-weakness.png';
import illustrationTrial from '../../assets/renewal/landing/illustration-trial.png';
import iconLock from '../../assets/renewal/landing/icon-lock-v2.png';
import iconFolder from '../../assets/renewal/landing/icon-folder-v2.png';
import iconShield from '../../assets/renewal/landing/icon-shield-v2.png';
import macbookShadow from '../../assets/renewal/landing/macbook-shadow.svg';
import macbookBottom from '../../assets/renewal/landing/macbook-bottom.svg';
import macbookScreenContent from '../../assets/renewal/landing/macbook-screen-content-v2.png';

const CTA_LINK_CLASS =
  'inline-flex h-14 w-full max-w-[18.75rem] items-center justify-center rounded-[1.875rem] px-8 text-base font-semibold text-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 sm:h-[4.25rem] sm:text-[1.25rem]';

const STEPS = [
  { step: 'STEP 1', title: '문항 입력', desc: '학년, 성적 흐름을 간단히 입력해요' },
  { step: 'STEP 2', title: '상세 분석', desc: '지금 겪는 어려움을 선택해요' },
  { step: 'STEP 3', title: '결과 확인', desc: '응답을 바탕으로 유형을 분석해요' },
  { step: 'STEP 4', title: '서비스 추천', desc: '가장 먼저 필요한 서비스를 추천해요' }
];

// 시안은 카드마다 이미지 규격이 다르다 — 카드1 353×269/top 0(상단 플러시), 카드2·3 353×235/top 34.
// 아래 imageClass는 lg(데스크톱)에서만 적용되고 그 이하는 기존 aspect-[3/2] 유지.
const AUDIENCE = [
  {
    image: illustrationStrength,
    imageClass: 'lg:mt-0 lg:h-[16.8125rem]',
    titleLines: ['내 강점이 뭔지', '아직 정리가 안된 학생'],
    descLines: ['목표는 있는데 지금 무엇을 준비해야', '할지 감이 안 잡히는 경우']
  },
  {
    image: illustrationWeakness,
    imageClass: 'lg:mt-[2.125rem] lg:h-[14.6875rem]',
    titleLines: ['어떤 학습부분에서 약한지', '확인하고 싶은 학생'],
    descLines: ['해야 할 건 많은데 우선순위가', '서지 않아 시작이 어려운 경우']
  },
  {
    image: illustrationTrial,
    imageClass: 'lg:mt-[2.125rem] lg:h-[14.6875rem]',
    titleLines: ['유료 서비스 전에 무료로', '서비스를 경험해보고 싶은 분'],
    descLines: ['내 위치를 데이터로 확인하고', '맞는 서비스를 찾고 있는 경우']
  }
];

const BENEFITS = [
  { icon: iconLock, label: '상세 진단 요약 카드' },
  { icon: iconFolder, label: '나의 강점 정리본' },
  { icon: iconShield, label: '보완 안내' }
];

// 플로팅 칩 — 시안 절대좌표(x290~1605, 스팬 1315)가 max-w-content(1164) 밖이라 그대로 쓸 수 없다.
// 맥북 박스(1008×591) 기준 %로 재해석: 좌 1개 / 우 2개라는 시안의 배치 관계와 세로 위치는 그대로 두고,
// 가로 오버행만 Lid(rel x 98~914) 바깥 gap 20px 지점까지 당겼다.
//   📊 left -140  (시안 -166) / 📋 left 934 (시안 927) / ✏️ left 934 (시안 948)
const MACBOOK_W = 1008;
const MACBOOK_H = 591;
const pctX = (px) => `${(px / MACBOOK_W) * 100}%`;
const pctY = (px) => `${(px / MACBOOK_H) * 100}%`;

const FLOATING_BADGES = [
  { emoji: '📊', label: '상세 진단 요약 카드', style: { left: pctX(-140), top: pctY(201) } },
  { emoji: '📋', label: '보완 안내', style: { left: pctX(934), top: pctY(-69) } },
  { emoji: '✏️', label: '나의 강점 정리본', style: { left: pctX(934), top: pctY(344) } }
];

// 시안 칩 폰트 굵기가 하나만 600, 둘은 500 → 시안 실수로 보고 셋 다 500으로 통일.
const BADGE_BASE_CLASS =
  'inline-flex items-center whitespace-nowrap rounded-[1.875rem] bg-[#F5FAFF] font-medium leading-[1.4] text-[#013262]';

const SECTION_HEADING_CLASS =
  'break-keep text-[1.5rem] font-semibold leading-[1.4] tracking-[-0.02em] sm:text-[1.75rem] md:text-[2rem]';

// 히어로 전용 타이포 — SECTION_HEADING_CLASS는 다른 섹션과 공유하므로 별도 정의.
const HERO_EYEBROW_CLASS =
  'text-[1.25rem] font-normal leading-[1.6] text-accent sm:text-[1.375rem] md:text-[1.5rem]';
const HERO_HEADLINE_CLASS =
  'break-keep max-w-[56rem] text-[1.75rem] font-semibold leading-[1.3] tracking-[-0.02em] text-[#0F172A] sm:text-[2.25rem] md:text-[2rem] lg:max-w-none lg:whitespace-nowrap';
const HERO_SUBTEXT_CLASS =
  'text-[1.125rem] font-medium leading-[1.6] text-[#525252] sm:text-[1.25rem] md:text-[1.5rem]';

// Figma TILE fill(scalingFactor 0.609 → 134px/8.375rem 타일) + blendMode OVERLAY 재현.
// 글로우 프레임 내부 1겹 + 히어로 프레임 전체 1겹, 총 2겹으로 원본과 동일하게 겹친다.
const HERO_GRAIN_STYLE = { backgroundImage: `url(${heroGrain})` };
const HERO_GRAIN_CLASS =
  'pointer-events-none absolute select-none bg-[length:8.375rem_8.375rem] bg-repeat mix-blend-overlay';

function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-white pb-14 sm:pb-16 md:pb-0">
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

        <div className="relative z-10 mx-auto mt-8 w-full max-w-[66.75rem] sm:mt-10 md:mt-[3.0625rem] lg:mb-[-7.89375rem]">
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
    <section className="bg-white pt-20 pb-10 md:pt-[8.75rem] md:pb-0">
      <div className="mx-auto w-full max-w-content px-5 sm:px-8">
        <h2 className={`${SECTION_HEADING_CLASS} text-[#181D24]`}>
          학생부 업로드 없이,
          <br />
          20분이면 완성하는 무료진단
        </h2>

        {/* 시안 카드행 1180(280×4 + gap20×3)이 컨테이너 내부 1100을 초과 → 결정 B7(a): 카드 260(16.25rem)로 축소.
            검산: 260×4 + 20×3 = 1100 ✓ */}
        <div className="mt-10 grid grid-cols-1 items-stretch justify-center gap-5 sm:grid-cols-2 sm:gap-6 md:mt-[3.125rem] lg:grid-cols-[repeat(4,16.25rem)] lg:gap-[1.25rem]">
          {STEPS.map((item) => (
            <div
              key={item.step}
              className="flex flex-col items-center justify-center gap-5 rounded-[1.25rem] border border-[#D7D7D7] bg-white px-6 py-8 text-center shadow-[0_0.75rem_0.625rem_rgba(215,215,215,0.4)] transition hover:-translate-y-1 hover:shadow-[0_1rem_1.5rem_rgba(215,215,215,0.55)] sm:px-[1.875rem] sm:py-10 lg:min-h-[11.125rem] lg:px-[1.875rem] lg:py-[2.5rem]"
            >
              <div className="flex flex-col items-center gap-1">
                {/* STEP 배지 — 시안상 배경·보더 없음(여백만 담당). padding 8/12 */}
                <p className="rounded-[1.25rem] px-[0.75rem] py-[0.5rem] text-base font-semibold leading-[1.4] text-[#013262]">
                  {item.step}
                </p>
                <p className="text-xl font-semibold leading-[1.3] text-[#525252]">{item.title}</p>
              </div>
              {/* 260 − 좌우 패딩 60 = 200 가용이라 시안 260px 1줄이 불가 → 2줄 래핑 허용(B7).
                  2줄 + py40이면 시안 고정높이 178을 넘으므로 min-h로 완화하고 grid stretch로 4장 높이를 맞춘다. */}
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
    <section className="bg-white pt-20 pb-10 md:pt-[15.625rem] md:pb-0">
      <div className="mx-auto w-full max-w-content px-5 sm:px-8">
        <h2 className={`${SECTION_HEADING_CLASS} text-[#181D24]`}>이런 학생에게 무료 진단을 추천해요</h2>

        {/* 353×498 카드 3장 + gap 20 = 1099 → 컨테이너 내부 1100 안에 정확히 수용 */}
        <div className="mt-10 grid grid-cols-1 justify-center gap-6 sm:grid-cols-2 md:mt-[3.75rem] lg:grid-cols-[repeat(3,22.0625rem)] lg:gap-[1.25rem]">
          {AUDIENCE.map((item) => (
            <article
              key={item.titleLines.join('')}
              className="flex flex-col overflow-hidden rounded-[1.875rem] bg-[#FBFAFA] transition hover:-translate-y-1 hover:shadow-[0_1.25rem_2.5rem_rgba(82,82,82,0.14)] lg:h-[31.125rem]"
            >
              <img
                src={item.image}
                alt={item.titleLines.join(' ')}
                className={`aspect-[3/2] w-full shrink-0 object-cover lg:aspect-auto lg:w-[22.0625rem] ${item.imageClass}`}
              />
              <div className="flex flex-col gap-3 px-7 py-8 sm:px-9 lg:ml-[1.9375rem] lg:mt-[2.75rem] lg:w-[17.6875rem] lg:gap-5 lg:p-0">
                <p className="break-keep text-lg font-semibold leading-[1.3] tracking-[-0.025rem] text-[#525252] sm:text-xl md:text-[1.25rem]">
                  {item.titleLines[0]}
                  <br />
                  {item.titleLines[1]}
                </p>
                <p className="break-keep text-base font-medium leading-[1.3] tracking-[-0.02em] text-[#808080]">
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
    <section className="bg-white pb-10 pt-20 md:pt-[15rem] md:pb-0">
      <div className="mx-auto flex w-full max-w-content flex-col items-center gap-10 px-5 sm:px-8 md:gap-[3.75rem]">
        <h2 className={`text-center ${SECTION_HEADING_CLASS} text-[#4D4D4D]`}>무료진단으로 얻을 수 있는 것</h2>

        <div className="w-full max-w-[60.625rem] rounded-[0.75rem] border border-[#D7D7D7] bg-[#FBFAFA] px-6 py-10 sm:px-10 md:py-12">
          <div className="grid grid-cols-1 divide-y divide-[#E2E2E2] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {BENEFITS.map((item) => (
              <div
                key={item.label}
                className="flex flex-col items-center gap-4 py-6 first:pt-0 last:pb-0 sm:px-6 sm:py-0"
              >
                {/* @3x(300×300) 원본을 시안 표시 크기 100×100(6.25rem)으로 고정. 컨테이너가 크기를 소유하고 img는 100%로 채운다. */}
                <div className="h-[5rem] w-[5rem] shrink-0 sm:h-[6.25rem] sm:w-[6.25rem]">
                  <img
                    src={item.icon}
                    alt=""
                    width={300}
                    height={300}
                    className="block h-full w-full"
                  />
                </div>
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

// 맥북 목업 — 시안(2240:4579)은 다크 벡터 조립이라 기존 실버 PNG로 재현 불가.
// 전체 1008×591 박스를 aspect 비율로 잡고 내부 부품을 % 절대배치(=1008px에서 시안 실측치와 일치, 이하 폭에서는 등비 축소).
function MacbookMockup() {
  return (
    <div className="relative mx-auto w-full max-w-[63rem] aspect-[1008/591]">
      {/* Shadow — SVG 실제 박스는 993×98(코어 타원 905×10 + stdDeviation 22 블러).
          시안 위치(코어 top 581)로 두면 박스 하단이 591을 44px 넘어가고, 섹션 overflow-hidden + pb0에
          직선으로 잘린다. 코어를 맥북 접지면(Bottom 하단 y=580)에 유지한 채 박스를 591 안에 담으려면
          블러를 세로로 압축하는 수밖에 없다(preserveAspectRatio="none").
          → 박스 높이 98 → 22, top 569(=591-22). 코어 중심 569+11=580 = 접지면. 클리핑 없음. */}
      <img
        src={macbookShadow}
        alt=""
        aria-hidden="true"
        draggable="false"
        className="pointer-events-none absolute select-none"
        style={{ left: pctX(8), top: pctY(569), width: pctX(993), height: pctY(22) }}
      />

      {/* Lid 816×554 — bg #1A202C, border 2px #4A5568, radius 28/28/4/4 */}
      <div
        aria-hidden="true"
        className="absolute rounded-t-[1.75rem] rounded-b-[0.25rem] border-2 border-[#4A5568] bg-[#1A202C]"
        style={{ left: pctX(98), top: 0, width: pctX(816), height: pctY(554) }}
      />

      {/* Dark Screen 806×528 — bg #000000, radius top 22 */}
      <div
        aria-hidden="true"
        className="absolute rounded-t-[1.375rem] bg-black"
        style={{ left: pctX(103), top: pctY(5), width: pctX(806), height: pctY(528) }}
      />

      {/* Screen 770×480 — bg #FFFFFF */}
      <div
        aria-hidden="true"
        className="absolute bg-white"
        style={{ left: pctX(119), top: pctY(31), width: pctX(770), height: pctY(480) }}
      />

      {/* Body 768×478 — 결과 화면 캡처(@2x 1536×956) */}
      <img
        src={macbookScreenContent}
        alt="위닝에듀 무료진단 결과 리포트 화면"
        width={1536}
        height={956}
        className="absolute object-cover object-left-top"
        style={{ left: pctX(121), top: pctY(33), width: pctX(768), height: pctY(478) }}
      />

      {/* "Macbook Pro" 각인 — 13px Inter SemiBold, lh 0.9, #A0AEC0 */}
      <span
        aria-hidden="true"
        className="absolute text-center text-[0.8125rem] font-semibold leading-[0.9] text-[#A0AEC0]"
        style={{
          left: pctX(463),
          top: pctY(534),
          width: pctX(83),
          fontFamily: 'Inter, Pretendard, sans-serif'
        }}
      >
        Macbook Pro
      </span>

      {/* Bottom 1008×30 (Base 18 + Curve 12 + Groove) */}
      <img
        src={macbookBottom}
        alt=""
        aria-hidden="true"
        draggable="false"
        className="pointer-events-none absolute select-none"
        style={{ left: 0, top: pctY(550), width: '100%', height: pctY(30) }}
      />

      {/* 플로팅 칩 — 데스크톱(lg+)에서만 맥북 주변에 띄운다 */}
      <div className="pointer-events-none absolute inset-0 hidden lg:block" aria-hidden="true">
        {FLOATING_BADGES.map((badge) => (
          <span
            key={badge.label}
            style={badge.style}
            className={`absolute h-[4.25rem] px-[1.25rem] text-[1.25rem] drop-shadow-[0_0.25rem_0.625rem_rgba(11,132,253,0.4)] ${BADGE_BASE_CLASS}`}
          >
            {badge.emoji} {badge.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function MacbookShowcase() {
  return (
    <section className="relative overflow-hidden bg-white pt-16 pb-16 sm:pt-20 sm:pb-20 md:pt-[12.125rem] md:pb-0">
      <div className="relative mx-auto w-full max-w-content px-5 sm:px-8">
        <h2 className={`text-center ${SECTION_HEADING_CLASS} text-[#525252]`}>
          지금 내 입시 좌표를 확인 해보세요
        </h2>

        <div className="relative mx-auto mt-16 flex flex-col items-center sm:mt-20 md:mt-[4.3125rem]">
          <MacbookMockup />

          <div className="mt-8 flex w-full max-w-[26rem] flex-col gap-3 lg:hidden">
            {FLOATING_BADGES.map((badge) => (
              <span
                key={badge.label}
                className={`justify-center gap-2 px-5 py-3 text-base shadow-[0_0.25rem_0.625rem_rgba(11,132,253,0.25)] ${BADGE_BASE_CLASS}`}
              >
                {badge.emoji} {badge.label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function BottomCta() {
  return (
    <section className="bg-[#172437] py-14 md:mt-[14.75rem] md:pt-[8.8125rem] md:pb-[8.875rem]">
      <div className="mx-auto flex w-full max-w-content flex-col items-center gap-8 px-5 text-center sm:gap-10 sm:px-8 md:gap-[3.75rem]">
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

      <main className="min-h-screen bg-white pt-[calc(6.25rem-var(--wn-header-h))]">
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
