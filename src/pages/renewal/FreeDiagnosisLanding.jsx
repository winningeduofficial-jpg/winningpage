import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import heroBrowserV2 from '../../assets/renewal/landing/hero-browser-v2.png';
import heroGlow from '../../assets/renewal/landing/hero-glow.svg';
import heroGrain from '../../assets/renewal/landing/hero-grain.png';
import illustrationStrength from '../../assets/renewal/landing/illustration-strength.png';
import illustrationWeakness from '../../assets/renewal/landing/illustration-weakness.png';
import illustrationTrial from '../../assets/renewal/landing/illustration-trial.png';
import iconLock from '../../assets/renewal/landing/icon-lock-v2.png';
import iconFolder from '../../assets/renewal/landing/icon-folder-v2.png';
import iconShield from '../../assets/renewal/landing/icon-shield-v2.png';
import macbookFull from '../../assets/renewal/landing/macbook-full.png';

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
// 가로 오버행만 Lid(rel x 98~914)에 "밀착"하는 한계까지 압축했다.
//   📊 left -120 (칩 폭 218 → right 98 = Lid 좌단) / 📋·✏️ left 914 = Lid 우단
// 시안 갭 46/13/34px을 포기하는 대신 칩 노출 하한이 1340 → 1248로 내려가 1280 랩톱을 살린다(확정).
// top(201 / -69 / 344)은 시안 그대로.
const MACBOOK_W = 1008;
const MACBOOK_H = 591;
const pctX = (px) => `${(px / MACBOOK_W) * 100}%`;
const pctY = (px) => `${(px / MACBOOK_H) * 100}%`;

// X/Y/회전을 별개 keyframes·별개 주기로 분리(축 분해)했다 — 셋의 합성 경로는
// 최소공배주기가 사실상 존재하지 않아(리사주 도형) 눈이 패턴을 학습하지 못한다.
// 주기·진폭이 칩마다 전부 다른 것 + 축마다 다른 delay를 준 것은 의도다. 절대 통일하지 마라.
// 통일하면 위상만 다른 하나의 기계로 읽힌다.
const FLOATING_BADGES = [
  {
    emoji: '📊',
    label: '상세 진단 요약 카드',
    style: { left: pctX(-120), top: pctY(201) },
    x: { amplitude: '0.375rem', duration: '4.3s', delay: '0s' },
    y: { amplitude: '1rem', duration: '3.1s', delay: '-1.1s' },
    rot: { amplitude: '1deg', duration: '5.7s', delay: '-2.3s' }
  },
  {
    emoji: '📋',
    label: '보완 안내',
    style: { left: pctX(914), top: pctY(-69) },
    x: { amplitude: '0.3125rem', duration: '5.1s', delay: '-0.4s' },
    y: { amplitude: '0.8125rem', duration: '3.7s', delay: '-1.6s' },
    rot: { amplitude: '1.2deg', duration: '6.3s', delay: '-3.4s' }
  },
  {
    emoji: '✏️',
    label: '나의 강점 정리본',
    style: { left: pctX(914), top: pctY(344) },
    x: { amplitude: '0.375rem', duration: '4.7s', delay: '-0.9s' },
    y: { amplitude: '1.125rem', duration: '4.1s', delay: '-2.2s' },
    rot: { amplitude: '0.8deg', duration: '6.9s', delay: '-4.1s' }
  }
];

// 맥북 통이미지(macbook-full.png) — 2208×1374 @2x = 1104×687 @1x.
// 몸체(1008×591)를 사방 48px(@1x) 여백으로 감싼 형태라 몸체 원점은 이미지 안 (48, 48).
// 칩 좌표계(몸체 1008×591 기준 %)를 유지하려면 박스는 그대로 두고 img만 음수 inset으로 밀어야 한다.
const MACBOOK_IMG_STYLE = {
  left: pctX(-48),
  top: pctY(-48),
  width: pctX(1104),
  height: pctY(687)
};

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
    <section className="relative overflow-hidden bg-white pb-14 sm:pb-16 md:pb-0 md:pt-[2.25rem]">
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
        <div className="mt-10 grid grid-cols-1 items-stretch justify-center gap-5 sm:grid-cols-2 sm:gap-6 md:mt-[3.125rem] wide:grid-cols-[repeat(4,16.25rem)] wide:gap-[1.25rem]">
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
        <div className="mt-10 grid grid-cols-1 justify-center gap-6 sm:grid-cols-2 md:mt-[3.75rem] wide:grid-cols-[repeat(3,22.0625rem)] wide:gap-[1.25rem]">
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

// 맥북 목업 — 시안(2240:4579) 벡터 조립(Lid/DarkScreen/Screen/각인/shadow/bottom)을 전부 걷어내고
// 그림자까지 구운 통이미지 1장으로 대체했다.
// 칩이 몸체 1008×591 기준 %로 배치돼 있으므로 그 비율의 relative 박스는 유지하고,
// img만 absolute + 음수 inset(-48)으로 밀어 몸체를 박스에 정확히 정렬한다.
function MacbookMockup() {
  const chipLayerRef = useRef(null);
  const [chipsInView, setChipsInView] = useState(false);

  // 이 섹션은 페이지 y2750 지점이라 대부분의 시간 화면 밖이다.
  // 뷰포트에 들어와 있는 동안만 애니메이션을 돌린다(이탈 시 정지).
  useEffect(() => {
    const node = chipLayerRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') return undefined;

    const observer = new IntersectionObserver((entries) => {
      setChipsInView(entries.some((entry) => entry.isIntersecting));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="relative mx-auto aspect-[1008/591] w-full max-w-[63rem]">
      {/* 부유 모션 — src/index.css를 건드릴 수 없어 컴포넌트 로컬 <style>로 정의한다
          (AdmissionGuidelines.jsx에 동일 관행 존재).
          prefers-reduced-motion: no-preference **opt-in**이라 쿼리 미지원 브라우저에서는 정지가 기본값.

          "움직임이 인위적이다" 피드백 원인은 닫힌 궤도 하나를 linear+alternate로 등속 왕복시킨 것.
          → X/Y/회전을 keyframes 3종으로 완전히 분리(축 분해)하고 칩마다 셋의 주기를 전부 다르게 잡았다.
          세 사인파의 합성 경로는 사실상 반복되지 않아(리사주 도형) 패턴 학습이 안 된다.
          진폭은 --fd-x/--fd-y/--fd-rot로 각 칩 래퍼에 주입해 keyframes 자체는 공유한다. */}
      <style>{`
        @keyframes fd-chip-x {
          from { transform: translateX(calc(var(--fd-x) * -1)); }
          to { transform: translateX(var(--fd-x)); }
        }
        @keyframes fd-chip-y {
          from { transform: translateY(0rem); }
          to { transform: translateY(calc(var(--fd-y) * -1)); }
        }
        @keyframes fd-chip-rot {
          from { transform: rotate(calc(var(--fd-rot) * -1)); }
          to { transform: rotate(var(--fd-rot)); }
        }
        @media (prefers-reduced-motion: no-preference) {
          /* ease-in-out + alternate = 축마다 단순조화운동(사인파). 부력 받는 물체의 가감속에 가깝다.
             linear를 걷어낸 건 등속 왕복이 정확히 대칭이라 눈이 반환점을 즉시 포착하기 때문이다. */
          .fd-chip-x[data-float='on'],
          .fd-chip-y[data-float='on'],
          .fd-chip-rot[data-float='on'] {
            animation-timing-function: ease-in-out;
            animation-iteration-count: infinite;
            animation-direction: alternate;
            will-change: transform;
          }
          .fd-chip-x[data-float='on'] { animation-name: fd-chip-x; }
          .fd-chip-y[data-float='on'] { animation-name: fd-chip-y; }
          .fd-chip-rot[data-float='on'] { animation-name: fd-chip-rot; }
        }
      `}</style>

      {/* 통이미지 2208×1374(@2x) = 1104×687(@1x). 몸체 오프셋 (48,48)만큼 음수 inset. */}
      <img
        src={macbookFull}
        alt=""
        aria-hidden="true"
        draggable="false"
        width={2208}
        height={1374}
        className="pointer-events-none absolute max-w-none select-none"
        style={MACBOOK_IMG_STYLE}
      />

      {/* 플로팅 칩 — 칩이 Lid 밖으로 오버행하므로 컨테이너 폭 여유가 있는 xl(1280+)에서만 띄운다.
          아래 목록 블록이 xl:hidden이라 두 블록의 노출 구간은 xl 경계에서 정확히 상보다. */}
      <div
        ref={chipLayerRef}
        className="pointer-events-none absolute inset-0 hidden xl:block"
        aria-hidden="true"
      >
        {FLOATING_BADGES.map((badge) => {
          const floatState = chipsInView ? 'on' : 'off';
          return (
            /* 바깥 래퍼 = 위치 전담(left/top 절대배치 + 진폭 CSS 변수 주입).
               변수는 하위로 상속되므로 keyframes 3종은 자식 쪽에서 그대로 var()로 읽는다. */
            <div
              key={badge.label}
              className="absolute"
              style={{
                ...badge.style,
                '--fd-x': badge.x.amplitude,
                '--fd-y': badge.y.amplitude,
                '--fd-rot': badge.rot.amplitude
              }}
            >
              <div
                className="fd-chip-x inline-block"
                data-float={floatState}
                style={{ animationDuration: badge.x.duration, animationDelay: badge.x.delay }}
              >
                <div
                  className="fd-chip-y inline-block"
                  data-float={floatState}
                  style={{ animationDuration: badge.y.duration, animationDelay: badge.y.delay }}
                >
                  {/* 회전 요소 = 실제 칩. drop-shadow → box-shadow: 시각 결과는 같고
                      애니메이션 중 필터 래스터화 비용이 사라진다. */}
                  <span
                    className={`fd-chip-rot h-[4.25rem] px-[1.25rem] text-[1.25rem] shadow-[0_0.25rem_0.625rem_rgba(11,132,253,0.4)] ${BADGE_BASE_CLASS}`}
                    data-float={floatState}
                    style={{ animationDuration: badge.rot.duration, animationDelay: badge.rot.delay }}
                  >
                    {badge.emoji} {badge.label}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// 섹션 overflow-hidden은 제거했다 — 구시안 radial 글로우 잔재였고, 맥북 통이미지 전환으로
// shadow 클리핑 문제도 소멸했다. 칩은 xl(1280+)에서만 뜨므로 뷰포트를 넘을 일이 없다.
function MacbookShowcase() {
  return (
    <section className="relative bg-white pt-16 pb-16 sm:pt-20 sm:pb-20 md:pt-[12.125rem] md:pb-0">
      <div className="relative mx-auto w-full max-w-content px-5 sm:px-8">
        <h2 className={`text-center ${SECTION_HEADING_CLASS} text-[#525252]`}>
          지금 내 입시 좌표를 확인 해보세요
        </h2>

        <div className="relative mx-auto mt-16 flex flex-col items-center sm:mt-20 md:mt-[4.3125rem]">
          <MacbookMockup />

          {/* 칩 목록 — <768 세로 스택 / ≥768 가로 1행 중앙정렬(칩 3개 합 약 590px) / ≥1280 숨김.
              위 데스크톱 칩 레이어가 hidden xl:block + aria-hidden이라 노출 구간이 xl 경계에서 상보다. */}
          <div className="mt-8 flex w-full max-w-[26rem] flex-col gap-3 md:max-w-none md:flex-row md:flex-wrap md:justify-center md:gap-4 xl:hidden">
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
    <main className="min-h-screen bg-white pt-16">
      <HeroSection />
      <StepsSection />
      <AudienceSection />
      <BenefitsSection />
      <MacbookShowcase />
      <BottomCta />
    </main>
  );
}
