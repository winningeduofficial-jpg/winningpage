import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

import { alertServiceNotReady } from '../../lib/paidServiceAccess';
import heroAura from '../../assets/services/in-depth-research/hero-aura.svg';
import heroGrain from '../../assets/renewal/landing/hero-grain.png';
import audienceTopic from '../../assets/services/research/audience-topic.png';
import audienceDesign from '../../assets/services/research/audience-design.png';
import audienceData from '../../assets/services/research/audience-data.png';
import outcomeSkill from '../../assets/services/research/outcome-skill.png';
import outcomeWallet from '../../assets/services/research/outcome-wallet.png';
import outcomeFolder from '../../assets/services/research/outcome-folder.png';
import outcomeCalendar from '../../assets/services/research/outcome-calendar.png';

// 심화탐구 서비스 랜딩 — /services/research (구 경로 /page/services-in-depth-research)
// Figma 시안(1907:21352, "심화탐구" 프레임, 1920×5871) + 히어로 합성 프레임(2181:9089) +
// 히어로 오라 원본(3248:2355) + 회전 4프레임(2716:3097/3162/3168/3174) + FAQ 펼침 상태 변형
// (2181:9318) 재실측 정합 전면 재작성. 목표관리(GoalManagement.jsx), 수행평가
// (PerformanceAssessment.jsx), 자기평가(SelfAssessment.jsx)와 같은 방식으로
// components/services/ServiceLandingPage 공용 스켈레톤을 벗어나 bespoke로 구현했다(구
// SERVICE_LANDING_CONTENT.research 항목은 serviceLandingContent.js에서 함께 제거 — 3종 선례와 동일).
// 심화탐구는 상세 페이지(PAID_SERVICE_CONFIGS 미등록 — 실제 서비스 앱이 아직 없다)가 없어,
// 히어로 CTA는 이동 대신 "서비스 준비중입니다" alert로 안내한다(alertServiceNotReady,
// paidServiceAccess.js — 자기평가・콜멘토와 동일 처리, 2026-08-05 사용자 확정). 이전에는
// /free-diagnosis로 임시 우회했으나(자기평가서 선례와 동일한 처리) 무료진단 안내는 히어로
// 문구와 모순돼 폐기했다. 상세 페이지가 생기면 PAID_SERVICE_CONFIGS에 등록하고
// openPaidServiceOrAlert로 교체한다.

// 컨테이너 폭 — 시안은 섹션마다 1436~1444px(1920 기준)로 드리프트하지만(섹션 C의 1520은 좌240/
// 우160 비대칭 오토레이아웃 잔재라 유령 래퍼로 판정), 실 콘텐츠 박스(카드 행) 기준 1439~1444를
// ×0.766 환산하면 1102~1106 ≈ dev 정본 토큰 max-w-content(안쪽 실폭 1100px)와 맞아 전 섹션을
// 이 컨테이너로 통일했다. 시안 예외였던 OutcomesSection 패널(1145px)도 헤더가 카드보다 149.5px
// 왼쪽에 매달린 시안 결함이라 좌단 일치 + full-width로 정규화했다(섹션 C는 헤더/카드 좌단이
// 정확히 일치하므로 D만 어긋난 것 = 시안 실수).
//
// 섹션 간 상단 여백 — 시안 섹션 스택(1907:21353)의 형제 갭은 전 경계 0이고, 리듬은 전적으로 각
// 섹션 내부 상·하 패딩이 만든다. 따라서 경계 실효 갭 = 앞 섹션 하단패딩 + 뒤 섹션 상단패딩으로
// 계산했다. 배경이 히어로~FAQ 전 구간 #FFFFFF로 동일하므로 전 경계 ×0.67을 적용하고 그 값을
// 뒤 섹션 pt에 몰아준다(pb는 마지막 FAQ만 갖는다). FAQ→푸터만 유일한 배경 전환 경계라 ×0.67
// 미적용 — 시안 217px 그대로 lg:pb-[13.5625rem].
//   Hero→Process        120×0.67 = 80   → lg:pt-[5rem]
//   Process→Audience   (120+119)×0.67 = 160 → lg:pt-[10rem]
//   Audience→FiveSteps (182+120)×0.67 = 202 → lg:pt-[12.625rem]
//   FiveSteps→Outcomes (137+120)×0.67 = 172 → lg:pt-[10.75rem]
//   Outcomes→Testi     (120+119)×0.67 = 160 → lg:pt-[10rem]
//   Testi→Faq          (168+100)×0.67 = 180 → lg:pt-[11.25rem]
//   Faq→Footer          217 (배경 전환, 축소 없음) → lg:pb-[13.5625rem]
// 이전 구현은 전 섹션 lg:pt-[6.25rem] 단일값이었다 — 정책 계산값이 아니라 임시 균일값이었으므로
// 위 표대로 경계별 차등으로 교체했다.
const SECTION_HEADING_CLASS =
  'break-keep text-[1.5rem] font-semibold leading-[1.4] tracking-[-0.02em] text-[#0F172A] sm:text-[1.75rem] lg:text-[2rem]';

// 가운뎃점 표기 — 시안 원문은 U+00B7 `·`와 U+30FB `・`를 혼용한다(같은 프레임 안에서도 타이틀은
// U+30FB, 설명은 U+00B7). 페이지 전역·3종 선례 페이지가 전부 U+30FB로 통일돼 있어 코드 정본을
// 따라 아래 전 카피를 U+30FB로 맞췄다.
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
    // 시안(1907:21486)은 카드1(1907:21476)과 imageRef·scaleMode·imageTransform까지 완전히 동일한
    // 일러스트를 재사용한다(재실측 확인 — 고유 일러스트는 3종). 선례 3종과 동일하게 시안 구조를
    // 그대로 옮기고 임의로 새 이미지를 지어내지 않았다.
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

// 아이콘 매핑 — 시안(1907:21536) 4열의 x좌표 순서(Settings 슬라이더 → Wallet → Folder →
// Calendar)와 라벨이 1:1 대응함을 재확인했다. 아이콘은 전부 VECTOR(imageRef 0건)이지만 기존
// 200×200 PNG가 투명 배경으로 이미 잘 뽑혀 있고, 시안 프레임에 fill #FFBFBF(분홍) 아트보드
// 배경 잔재가 붙어 있어 재추출하면 분홍 배경이 딸려온다 → 기존 에셋 재사용.
const OUTCOME_ITEMS = [
  { icon: outcomeSkill, label: '탐구 역량 향상' },
  { icon: outcomeWallet, label: '자료 해석력 강화' },
  { icon: outcomeFolder, label: '완성도 높은 결과물' },
  { icon: outcomeCalendar, label: '자기주도 탐구 경험' }
];

// 후기 작성자명 — 시안 원본은 "고1 김민△ / 고2 이△은 / 고2 박○석"처럼 마스킹 기호와 마스킹
// 글자 수가 일관되지 않은 placeholder였다. 선례(목표관리・수행평가・자기평가)의 "고N 김OO"
// 표기로 통일했다(신규 카피 아님, 표기만 정정). 카드 노출 순서는 시안 DOM 순서(우→좌→중)가
// 아니라 실제 x좌표 기준 좌→우 순서다. 인용문 3건은 시안 원문과 문자열 완전 일치.
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

// FAQ — 이전 구현은 "시안(2181:9284)에 답변 레이어가 없다"고 판단해 구 serviceLandingContent.js의
// 답변을 끌어다 썼다. 재실측 결과 답변 정본이 펼침 상태 변형 노드 2181:9318(2181:9332/9339/9346/
// 9353)에 전문으로 존재해 4건 모두 시안 정본으로 교체했다. 시안 답변은 "수행・작성・수집은 학생
// 본인이 한다"는 책임 한계 문구가 4건 중 3건에 들어 있어 카드사 심사/과장광고 관점에서도 구
// 답변보다 안전하다. 질문 4개는 두 노드가 문자열·순서 모두 동일 = 기존 코드와 일치(변경 없음).
const FAQ_ITEMS = [
  {
    q: '심화탐구 프로그램은 어떤 학생에게 적합한가요?',
    a: '탐구 주제 선정・설계・완성 중 어느 단계에서든 도움이 필요한 학생에게 적합합니다.'
  },
  {
    q: '탐구 설계는 얼마나 자세하게 도와주나요?',
    a: '주제・가설・연구 방법・일정까지 설계서를 함께 구성하며, 실제 탐구 수행과 작성은 학생 본인이 진행합니다.'
  },
  {
    q: '자료 수집은 어디까지 지원되나요?',
    a: '신뢰할 수 있는 자료의 방향과 정리・출처 관리 방법을 안내하며, 수집・해석은 학생이 수행합니다.'
  },
  {
    q: '완성본 평가는 어떤 내용을 확인하나요?',
    a: '탐구 논리, 자료 활용, 구성・표현의 완성도를 기준으로 점검하고 피드백합니다. 제출용 결과물은 학생이 직접 완성합니다.'
  }
];

function HeroSection() {
  const auraRef = useRef(null);
  const [auraInView, setAuraInView] = useState(false);

  // 히어로를 벗어나 스크롤하면 30초 회전을 멈춘다 — 서비스 랜딩 4종 공통 훅 구조
  // (PerformanceAssessment / SelfAssessment HeroSection 선례 그대로).
  useEffect(() => {
    const node = auraRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') return undefined;

    const observer = new IntersectionObserver((entries) => {
      setAuraInView(entries.some((entry) => entry.isIntersecting));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    // 섹션 패딩(md:pb-0 md:pt-[2.25rem])은 목표관리・수행평가・자기평가 히어로와 동일 규격
    // (4페이지 공통 규격). 이전 구현의 pb-14 pt-10 sm:pb-16 sm:pt-14 단독 조합은 md 이상에서
    // 목업 음수 마진과 충돌해 다음 섹션 pt 계산이 어긋난다.
    <section className="relative overflow-hidden bg-white pb-14 pt-10 sm:pb-16 sm:pt-14 md:pb-0 md:pt-[2.25rem]">
      {/* 오라 애니메이션 — 이전 구현의 CSS 방사형 그라디언트 2겹(마젠타 0.32를 강하게 섞은 것)을
          폐기하고 시안 정본 벡터(hero-aura.svg = 3248:2356 Eclipse + 3248:2357 Rectangle 29)로
          교체했다. 회전 4프레임(2716:3097/3162/3168/3174)이 0°/90°/180°/270° 등간격 Smart
          Animate라 단일 rotate(0→360deg) 루프로 무손실 붕괴된다.

          ⚠ 자기평가 값을 복사하지 말 것 2건:
          (1) 회전 피벗이 Eclipse 중심(800,541)이 아니라 Texture 사각형 중심 (800,600)이다.
              180° 프레임의 중점 역산으로 두 도형이 같은 점에 수렴함을 확인했고, 90°/−90° 8개
              좌표로 교차검증했다. 그래서 SVG viewBox가 "-40 -240 1680 1680"이며(1600 정사각은
              Rect 29 하단 블러 808.69px > 반변 800으로 잘린다) transform-origin은 뷰박스 중심이
              곧 피벗이므로 기본값 50% 50% 그대로 둔다.
          (2) 히어로 합성 프레임(2181:9089)에서 Texture의 상대 y = 0 이다(자기평가는 −230).
              따라서 위치 래퍼는 top-0 — 자기평가의 top-[-14.375rem]을 복사하면 오라가 화면
              위로 사라진다.

          바깥 div(auraRef) = 위치 전담(Texture 박스 1600×1200 = 4:3, 1600px = 100rem).
          안쪽 .idr-aura-spin = 회전 전담(viewBox 1680 정사각을 1600×1200 좌표계에 맞춤:
          폭 1680/1600 = 105%, left −40/1600 = −2.5%, top −240/1200 = −20%).
          같은 요소에 위치용 translate와 회전용 rotate를 같이 걸면 rotate가 translate를 덮어써
          가운데 정렬이 깨진다 — 반드시 2단으로 분리한다. */}
      <div
        ref={auraRef}
        className="pointer-events-none absolute left-1/2 top-0 aspect-[4/3] w-[100rem] max-w-none -translate-x-1/2 select-none"
      >
        <style>{`
          @keyframes idr-aura-spin {
            from { transform: rotate(0deg); }
            to   { transform: rotate(360deg); }
          }
          @media (prefers-reduced-motion: no-preference) {
            .idr-aura-spin[data-float='on'] {
              animation: idr-aura-spin 30s linear infinite;
              will-change: transform;
            }
          }
        `}</style>
        <div
          className="idr-aura-spin absolute left-[-2.5%] top-[-20%] aspect-square w-[105%]"
          data-float={auraInView ? 'on' : 'off'}
        >
          <img src={heroAura} alt="" aria-hidden="true" draggable="false" className="block w-full" />
        </div>
      </div>
      {/* 그레인 — 회전 래퍼의 형제(밖)에 둔다. transform이 걸린 요소는 새 stacking context를
          만들어 mix-blend-overlay가 섹션 배경(bg-white)을 backdrop으로 못 잡고 그레인이 전면
          노출되는 회귀가 실제로 있었다(수행평가・무료진단 선례). 타일 8.375rem은 시안 Texture의
          imageRef(bcfa0f2e…, 220×220) × scalingFactor 0.609091 = 134px 실측값이며, opacity-40은
          시안(opacity 1 + OVERLAY)보다 옅다 — 4페이지 통일값을 우선했다. */}
      <div
        aria-hidden="true"
        style={{ backgroundImage: `url(${heroGrain})` }}
        className="pointer-events-none absolute inset-0 select-none bg-[length:8.375rem_8.375rem] bg-repeat opacity-40 mix-blend-overlay"
      />

      <div className="relative z-10 mx-auto flex w-full max-w-content flex-col items-center px-5 text-center sm:px-8">
        {/* eyebrow/H1/서브 문단/CTA/목업 폭 — 목표관리・수행평가・자기평가와 통일한 4페이지 공통
            규격. 카피 자체는 시안 원문(3163:4724~4728) 그대로다.
            시안 실측 eyebrow 색 #0B84FD는 dev 정본 accent 토큰과 정확히 일치.
            시안 weight는 500이지만 선례 3종이 전부 font-normal이라 선례를 따랐다. */}
        <p className="text-[1.25rem] font-normal leading-[1.6] text-accent sm:text-[1.375rem] md:text-[1.5rem]">
          탐구 설계 프로그램
        </p>

        {/* max-w-[40rem] 제거 — 시안 H1은 1443px 폭에 강제 개행 없는 1줄인데 40rem(640px)로
            묶으면 데스크톱에서도 억지로 2줄이 된다. */}
        <h1 className="mt-6 break-keep text-[1.75rem] font-semibold leading-[1.3] tracking-[-0.02em] text-[#0F172A] sm:text-[2.25rem] md:text-[2rem]">
          주제 추천부터 탐구 설계까지, 심화탐구를 끝까지
        </h1>

        <p className="mt-6 break-keep text-[1.125rem] font-medium leading-[1.6] text-[#525252] sm:text-[1.25rem] md:text-[1.5rem]">
          탐구의 방향이 막막한 순간, 위닝 심화탐구가 구체적인 길을 제시해 학생이 스스로 완성하도록
          돕습니다
        </p>

        {/* CTA — 시안(3163:4727)은 280×68 / cornerRadius 50(높이 68이라 실효 pill) / 그림자
            visible:false 이지만, 4페이지 CTA 통일을 우선해 선례 규격(max-w-[18.75rem],
            rounded-[1.875rem], 네이비 그림자)을 그대로 쓴다. 클릭 시 준비중 alert로 안내한다
            (alertServiceNotReady — 상세 페이지 미구현, 위 상단 주석 참고). */}
        <button
          type="button"
          onClick={alertServiceNotReady}
          className="mt-6 inline-flex h-14 w-full max-w-[18.75rem] items-center justify-center rounded-[1.875rem] bg-[#013262] px-8 text-base font-semibold text-white shadow-[0_0.625rem_1.5625rem_rgba(1,50,98,0.4)] transition hover:bg-[#01498F] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#013262] focus-visible:ring-offset-2 sm:h-[4.25rem] sm:text-[1.25rem]"
        >
          지금 시작하기
        </button>

        {/* 브라우저 목업 — 시안(2181:9094)은 툴바 인스턴스와 탭 파비콘 로고 둘뿐이고 툴바 79px
            아래 1280×474 영역에 자식 노드가 전혀 없다(순백 빈 캔버스). 선례 방식대로 크롬
            프레임만 CSS로 조립하고 본문은 빈 배경으로 둔다(실 제품 스크린샷 자산 없음).
            프레임 값은 시안과 선례가 정확히 일치한다: radius 5 = rounded-[0.3125rem], border
            없음, 그림자 3겹(0/10/50 @20%, 0/20/30 @30%, 0/0/1 @70%). 신호등 #ED6A5E/#F6BE4F/
            #62C554 · 주소창 #F1F3F4 pill · 탭바 #DFE1E5 도 시안 실측값 그대로다(이전 구현의
            #FF5F57/#FEBC2E/#28C840, border 있는 흰 주소창은 시안 근거가 없었다).
            하단 음수 마진은 시안 오버플로 111px(→85px)보다 큰 선례값(126.3px)을 쓴다 — 4페이지
            공통 규격 우선. */}
        <div className="relative z-10 mx-auto mt-8 w-full max-w-[66.75rem] sm:mt-10 md:mt-[3.0625rem] lg:mb-[-7.89375rem]">
          <div className="overflow-hidden rounded-[0.3125rem] bg-white shadow-[0_0_0.0625rem_rgba(0,0,0,0.7),0_1.25rem_1.875rem_rgba(0,0,0,0.3),0_0.625rem_3.125rem_rgba(0,0,0,0.2)] md:flex md:aspect-[1280/553] md:flex-col">
            <div className="flex items-center gap-3 border-b border-[#E5E7EB] bg-[#DFE1E5] px-4 py-2.5 md:shrink-0">
              <span className="flex gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-[#ED6A5E]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#F6BE4F]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#62C554]" />
              </span>
              <span className="flex-1 truncate rounded-full bg-[#F1F3F4] px-4 py-1 text-center text-[0.75rem] text-[#767676]">
                https://www.winningedu.com
              </span>
            </div>
            <div
              className="aspect-[1280/553] w-full bg-[#FAFAFA] md:aspect-auto md:min-h-0 md:flex-1"
              aria-hidden="true"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function ProcessSection() {
  return (
    <section className="bg-white pt-16 sm:pt-20 lg:pt-[5rem]">
      <div className="mx-auto w-full max-w-content px-5 sm:px-8">
        {/* 시안 원문은 쉼표 뒤 스페이스 2개(U+0020 ×2)지만 HTML은 연속 공백을 접으므로 렌더
            결과가 같다 → 1스페이스 유지(디자인 파일 오타로 판단). 정렬은 시안도 LEFT다. */}
        <h2 className={SECTION_HEADING_CLASS}>심화탐구, 이렇게 완성돼요</h2>

        {/* 4열 폭 검산: (1100 − 30×3) / 4 = 252.5px, 시안 331×0.766 = 253.5px ✓
            헤딩→카드행 gap은 시안 실효 90px(itemSpacing 80 + 래퍼 padding 10) × 0.766 = 69px. */}
        <div className="mt-10 grid grid-cols-1 gap-5 sm:mt-12 sm:grid-cols-2 lg:mt-[4.3125rem] lg:grid-cols-4 lg:gap-[1.875rem]">
          {PROCESS_STEPS.map((item) => (
            // 기본 상태 그림자를 상시 적용한다 — 시안은 offset(0,12)/radius 20/#D7D7D7 40%가
            // 항상 켜져 있다(이전 구현은 hover에만 있어 기본 상태가 밋밋했다).
            // 카드 높이는 고정하지 않는다: 시안 상하 여백이 카드마다 33/22px로 갈리는 것은
            // 패딩이 아니라 수직 중앙 정렬이고, 미환산 폰트에서는 콘텐츠가 시안 178px를 넘긴다.
            <div
              key={item.step}
              className="flex flex-col items-center justify-center gap-[0.9375rem] rounded-[1.25rem] border border-[#D7D7D7] bg-white px-6 py-8 text-center shadow-[0_0.75rem_1.25rem_rgba(215,215,215,0.4)] transition hover:-translate-y-1 hover:shadow-[0_0.75rem_1.5rem_rgba(1,50,98,0.08)]"
            >
              {/* 시안 내부 리듬은 균등 12px가 아니라 2단이다: 뱃지↔타이틀 4px(→3px),
                  상단그룹↔설명 20px(→15px). STEP 뱃지는 radius 20 + padding을 갖고 있지만
                  fills/strokes가 전부 비어 있어(렌더 캡처로도 확인) 배경 없이 구현한다. */}
              <div className="flex flex-col items-center gap-[0.1875rem]">
                <span className="text-[1rem] font-semibold leading-[1.4] text-[#013262]">
                  {item.step}
                </span>
                <p className="text-[1.25rem] font-semibold leading-[1.4] text-[#525252]">
                  {item.title}
                </p>
              </div>
              {/* 설명 폭 260 × 0.766 = 199px. 시안은 STEP 3/4에 명시 개행이 있으나 이 폭 +
                  break-keep이면 같은 자리에서 자연 개행되므로 강제 <br/>은 넣지 않았다. */}
              <p className="mx-auto max-w-[12.4375rem] break-keep text-[1rem] font-medium leading-[1.4] text-[#525252]">
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
    <section className="bg-white pt-16 sm:pt-20 lg:pt-[10rem]">
      <div className="mx-auto w-full max-w-content px-5 sm:px-8">
        {/* 시안(1907:21472)은 characterStyleOverrides로 "이런 학생에게 "(#525252) +
            "심화 탐구 서비스를 추천해요"(#013262) 2-tone 좌측 정렬이다. 컨테이너의 text-center를
            제거하고 강조 런만 네이비로 넣었다(자기평가 AudienceSection과 동일한 처리 — accent
            #0B84FD가 아니라 #013262). 기본 색은 SECTION_HEADING_CLASS(#0F172A) 코드 정본 유지. */}
        <h2 className={SECTION_HEADING_CLASS}>
          이런 학생에게 <span className="text-[#013262]">심화 탐구 서비스를 추천해요</span>
        </h2>

        {/* 4열 폭 검산: (1100 − 16×3) / 4 = 263px, 시안 345×0.766 = 264.3px ✓
            (시안 gap 20 → 15.3px지만 gap-4(16px)로 올려야 총폭이 1100 안에 정확히 떨어진다:
             264.3×4 + 15.3×3 = 1103.1 로 3.1px 초과) */}
        <div className="mt-10 grid grid-cols-1 gap-4 sm:mt-12 sm:grid-cols-2 lg:mt-[3.75rem] lg:grid-cols-4">
          {AUDIENCE_CARDS.map((item) => (
            // 카드 배경은 시안 #F9FAFB = dev 카드 배경 토큰과 정확히 일치(이전 #FBFAFA는 오타).
            // 시안은 그림자 없음 — 호버 그림자만 코드 관용으로 남긴다.
            <article
              key={item.title}
              className="flex flex-col overflow-hidden rounded-2xl bg-[#F9FAFB] text-left transition hover:-translate-y-1 hover:shadow-[0_1rem_2rem_rgba(82,82,82,0.14)]"
            >
              {/* 시안 이미지 인셋은 카드마다 6~36px로 제각각이다(원본 일러스트 여백 차이를
                  디자이너가 눈대중으로 얹은 것) → 고정 높이 이미지 영역 하나로 통일했다.
                  221 × 0.766 = 169.3px = 10.5rem.
                  object-cover였을 때 원본 비율(1.24 vs 1.50)이 서로 달라 카드1・4(비율 1.24)만
                  상하로 크게 잘려 확대돼 보이는 문제가 있었다(실측 노출률 79% vs 96%) → 잘림 없는
                  object-contain으로 교체. 카드 배경(#F9FAFB)이 그대로 뒤에 깔려 있어 레터박스
                  여백도 시안처럼 자연스럽게 카드색으로 채워진다. */}
              <img
                src={item.image}
                alt={item.title}
                className="h-[10.5rem] w-full object-contain"
              />
              {/* 제목↔본문 간격은 시안 30px(→23px) — 이전 gap-2(8px)는 시안보다 훨씬 촘촘했다.
                  하단 패딩 51px(→39px), 좌우 34px(→26px ≈ px-6). */}
              <div className="flex flex-1 flex-col gap-[1.4375rem] px-6 pb-[2.4375rem] pt-[1.75rem]">
                <p className="text-[1.25rem] font-semibold leading-[1.4] tracking-[-0.02em] text-[#525252]">
                  {item.title}
                </p>
                {/* 본문 16px를 환산하면 12.3px로 가독성 하한 미달 → 시안 절대치 1rem 유지. */}
                <p className="break-keep text-[1rem] font-medium leading-[1.4] text-[#525252]">
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
    <section className="bg-white pt-16 sm:pt-20 lg:pt-[12.625rem]">
      <div className="mx-auto w-full max-w-content px-5 sm:px-8">
        <h2 className={SECTION_HEADING_CLASS}>다섯 단계로 차근차근</h2>

        {/* 3열 폭 검산: (1100 − 30×2) / 3 = 346.7px, 시안 453×0.7644 = 346.3px ✓
            (섹션 C의 실 콘텐츠 박스는 프레임 1520이 아니라 카드 행 1439 = 453×3 + 40×2 이다.
             1520은 1920 안에서 좌240/우160 비대칭이라 오토레이아웃 잔재로 판정) */}
        <div className="mt-10 grid grid-cols-1 gap-5 sm:mt-12 sm:grid-cols-2 lg:mt-[3.75rem] lg:grid-cols-3 lg:gap-[1.875rem]">
          {firstRow.map((item) => (
            // 카드 배경 #F5F5F7은 시안 실측값(이전 #F0F2F5는 근거 없음). 패딩은 시안 실효
            // pt 44 / pb 40 / px 30.5 → ×0.7644 = 33.6 / 30.6 / 23.3.
            // radius 12는 스케일 미적용(rounded-xl 유지).
            <div key={item.title} className="rounded-xl bg-[#F5F5F7] px-6 pb-[1.875rem] pt-[2.125rem]">
              {/* 시안은 title/desc가 둘 다 24px이고 weight(600/500)·색·lineHeight로만 위계를
                  만든다. 환산하면 18.35px/18.35px인데, 코드 정본은 이미 1.25rem/1rem으로 위계를
                  벌려놨고 페이지 내 다른 카드 섹션과 리듬이 맞아 코드 값을 유지했다. */}
              <p className="text-[1.25rem] font-semibold leading-[1.4] tracking-[-0.02em] text-[#525252]">
                {item.title}
              </p>
              {/* 시안 desc 색은 #808080으로 가독성 하한 미달 → #767676으로 상향. */}
              <p className="mt-[0.9375rem] break-keep text-[1rem] font-medium leading-[1.4] text-[#767676]">
                {item.desc}
              </p>
            </div>
          ))}
        </div>

        {/* 2행 — 시안(1907:21515)은 946px 폭으로 1439 안에서 정중앙. 946 × 0.7644 = 723px =
            45.25rem. 폭 검산: (724 − 30) / 2 = 347px ✓ (1행 카드폭 346.7과 일치)
            카드 내부 텍스트는 1행과 동일하게 좌정렬이다 — 이전 구현의 text-center는 시안 근거가
            없어 제거했다. */}
        <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:mx-auto lg:mt-[1.875rem] lg:max-w-[45.25rem] lg:gap-[1.875rem]">
          {secondRow.map((item) => (
            <div
              key={item.title}
              className="rounded-xl bg-[#F5F5F7] px-6 pb-[1.875rem] pt-[2.125rem] text-left"
            >
              <p className="text-[1.25rem] font-semibold leading-[1.4] tracking-[-0.02em] text-[#525252]">
                {item.title}
              </p>
              <p className="mt-[0.9375rem] break-keep text-[1rem] font-medium leading-[1.4] text-[#767676]">
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
    <section className="bg-white pt-16 sm:pt-20 lg:pt-[10.75rem]">
      <div className="mx-auto w-full max-w-content px-5 sm:px-8">
        <h2 className={SECTION_HEADING_CLASS}>심화탐구로 달라지는 것들</h2>

        {/* 패널 폭 — 시안은 헤더 좌단(x=82823)이 카드 좌단(x=82972.5)보다 149.5px 왼쪽에 매달려
            있다. 바로 앞 섹션(FiveSteps)은 헤더/카드 좌단이 정확히 일치하므로 이건 시안 결함으로
            판단하고, 코드 정본대로 헤더 = 카드 = max-w-content 좌단 일치 + 카드 full-width로
            구현했다(시안 그대로면 1100 컨테이너 안에 872px 카드가 중앙에 떠 있고 헤더만 좌단에
            붙는 기형이 된다).
            4열 폭 검산: 1100 / 4 = 275px, 시안 열폭 292/290/290/273 × 0.7618 = 222/221/221/208 —
            시안 열폭 편차는 그룹 bbox 오차라 균등 4열로 정규화했다.
            보더/구분선은 시안 #D9D9D9 / #D7D7D7 두 색을 dev 보더 토큰 #D7D7D7 하나로 통일했다
            (2단계 차이라 육안 구분 불가, 오히려 카드 외곽선과 구분선이 정합된다).
            카드 배경 #F9FAFB는 시안 실측 = 토큰 정본 일치(이전 #FBFAFA는 오타). */}
        <div className="mt-8 grid grid-cols-2 gap-6 rounded-xl border border-[#D7D7D7] bg-[#F9FAFB] px-6 py-[1.375rem] sm:mt-10 sm:grid-cols-4 sm:gap-0 sm:divide-x sm:divide-[#D7D7D7] sm:px-4 lg:mt-[3.75rem]">
          {OUTCOME_ITEMS.map((item) => (
            // 아이콘 100 × 0.7618 = 76.2px = 4.75rem, 아이콘↔라벨 18 → 13.75px = 0.875rem.
            // 라벨은 시안 weight 600 / #525252 (이전 font-medium / #0F172A는 근거 없음).
            <div
              key={item.label}
              className="flex flex-col items-center gap-[0.875rem] px-4 py-2 text-center"
            >
              <img
                src={item.icon}
                alt=""
                aria-hidden="true"
                className="h-12 w-12 sm:h-[4.75rem] sm:w-[4.75rem]"
              />
              <p className="text-[1.125rem] font-semibold leading-[1.4] tracking-[-0.02em] text-[#525252]">
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
    <section className="bg-white pt-16 sm:pt-20 lg:pt-[10rem]">
      <div className="mx-auto w-full max-w-content px-5 sm:px-8">
        {/* 헤딩 정렬 — 시안 헤딩 x가 카드 좌단 x와 동일한 좌측 정렬이다(컨테이너 text-center
            제거). 시안 색은 #525252지만 페이지 8개 섹션이 공유하는 SECTION_HEADING_CLASS
            코드 정본(#0F172A)을 유지했다. */}
        <h2 className={SECTION_HEADING_CLASS}>심화탐구 서비스를 받아본 학생들의 후기</h2>

        {/* 3열 폭 검산: (1100 − 46×2) / 3 = 336px, 시안 440×0.766 = 337px ✓ */}
        <div className="mt-10 grid grid-cols-1 gap-5 sm:mt-12 lg:mt-[3.75rem] lg:grid-cols-3 lg:gap-[2.875rem]">
          {TESTIMONIALS.map((item) => (
            // 카드 배경 #F9FAFB = 시안 실측 = 토큰 정본(이전 #F8F9FA는 근사값).
            // radius 40 → 30.6px = rounded-[2rem], padding 40 → 30.6px = p-[1.875rem],
            // 그림자 offset(0,2)/blur 4/rgba(213,213,213,0.25)는 시안 실측 그대로.
            <figure
              key={item.quote}
              className="flex h-full flex-col justify-between rounded-[2rem] bg-[#F9FAFB] p-[1.875rem] text-left shadow-[0_0.125rem_0.25rem_rgba(213,213,213,0.25)]"
            >
              {/* 블록 순서 — 시안은 이름행이 위, 인용문이 아래다. 선례 3종이 전부 인용문 → 이름
                  순이라 4페이지 리듬 일관성을 우선해 코드 정본을 유지했다. 이모지 원형 칩과
                  따옴표 래핑도 시안에 없는 코드 추가분이지만 선례와 동일하게 유지. */}
              <blockquote className="break-keep text-[1.0625rem] font-normal leading-[1.5] text-[#525252]">
                “{item.quote}”
              </blockquote>
              {/* 이름 색 시안값 #808080은 가독성 하한 미달 → #767676으로 상향. */}
              <figcaption className="mt-[0.9375rem] flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="flex h-[3.25rem] w-[3.25rem] items-center justify-center rounded-full bg-[#F1F1F1] text-[1.75rem]"
                >
                  {item.emoji}
                </span>
                <span className="text-[0.875rem] font-medium text-[#767676]">{item.name}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

function FaqItem({ item, isOpen, onToggle }) {
  // 시안 구분선은 LINE 3개뿐 — 마지막 항목 뒤에는 선이 없다(last:border-b-0).
  // 시안 stroke #D9D9D9는 dev 보더 토큰 #D7D7D7로 정규화.
  return (
    <div className="border-b border-[#D7D7D7] py-6 last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between gap-4 text-left"
      >
        {/* 질문 24 × 0.766 = 18.4px = 1.125rem. 이전 구현의 sm:text-[1.5rem] 반응형 확대는
            환산 정책 위반이라 제거했다. 질문 행은 열림/닫힘에 스타일 차이가 전혀 없다
            (시안 두 상태 노드 대조 확인) — 하이라이트·배경 변화 없음. */}
        <span className="break-keep text-[1.125rem] font-medium leading-[1.4] tracking-[-0.02em] text-[#525252]">
          {item.q}
        </span>
        {/* chevron 24 × 0.766 = 18.4px. 시안은 24×24 래퍼가 양 상태 모두 90° 회전돼 있고
            (컴포넌트 붙여넣기 잔재) 내부 벡터만 열림에서 추가 180° 회전한다 — 래퍼의 90°는
            재현하지 않고 실질 의미인 rotate-180만 구현한다. 색 #808080 → #767676 상향. */}
        <ChevronDown
          className={`h-[1.125rem] w-[1.125rem] shrink-0 text-[#767676] transition-transform ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>
      {isOpen && (
        // 질문↔답변 32 × 0.766 = 24.5px = mt-6. 시안 답변 lineHeight(20/33.6/31.2/20)는 h=40
        // 고정 프레임에서 생긴 Figma 잔여 노이즈라 그대로 옮기지 않고 선례값 1.6을 쓴다.
        // 답변 색 #808080 → #767676 상향.
        <p className="mt-6 break-keep text-[1.125rem] font-normal leading-[1.6] text-[#767676]">
          {item.a}
        </p>
      )}
    </div>
  );
}

function FaqSection() {
  // 시안 펼침 보드(2181:9318)는 4개가 모두 열려 있으나 이는 답변 전문 표시용 스펙 보드이지
  // 동작 정의가 아니다 — 선례대로 단일 open을 유지한다.
  const [openIndex, setOpenIndex] = useState(-1);

  return (
    // FAQ→푸터는 페이지에서 유일한 배경 전환 경계라 시안 하단 여백 217px를 ×0.67 축소 없이
    // 그대로 쓴다(lg:pb-[13.5625rem]). 자기평가의 동일 경계값(113px)보다 크지만 시안 실측 차이다.
    <section className="bg-white pb-20 pt-16 sm:pb-24 sm:pt-20 lg:pb-[13.5625rem] lg:pt-[11.25rem]">
      <div className="mx-auto w-full max-w-content px-5 sm:px-8">
        {/* 헤딩 크기 — 펼침 보드(2181:9318)만 44px이고 페이지 안 8개 섹션 헤딩은 전부 32px이다.
            떼어놓은 보드의 확대 표기로 판단해 SECTION_HEADING_CLASS(32px)를 그대로 쓴다. */}
        <h2 className={SECTION_HEADING_CLASS}>자주 묻는 질문</h2>

        {/* 헤딩→목록 60 × 0.766 = 46px = 2.875rem. */}
        <div className="mt-8 sm:mt-10 lg:mt-[2.875rem]">
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
