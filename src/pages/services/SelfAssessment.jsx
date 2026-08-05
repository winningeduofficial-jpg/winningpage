import { Fragment, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';

import heroAura from '../../assets/services/self-assessment/hero-aura.svg';
import heroGrain from '../../assets/renewal/landing/hero-grain.png';
import iconBinoculars from '../../assets/services/goal/icon-binoculars.png';
import iconSisyphus from '../../assets/services/performance/icon-sisyphus.png';
import iconLightbulb from '../../assets/services/performance/icon-lightbulb-sketch.png';
import stageOrganizeLaptop from '../../assets/services/goal/stage-exec-laptop-work.png';
import stageOrganizeWeight from '../../assets/services/goal/stage-diag-weightlifting.png';
import stageOrganizeTablet from '../../assets/services/performance/coach-tablet.png';
import stageStrengthRain from '../../assets/services/self-assessment/stage-strength-rain.png';
import stageStrengthWinner from '../../assets/services/self-assessment/stage-strength-winner.png';
import stageStrengthKnot from '../../assets/services/self-assessment/stage-strength-knot.png';
import stageStructWriting from '../../assets/services/goal/stage-plan-writing.png';
import stageStructWand from '../../assets/services/self-assessment/stage-struct-wand.png';
import stageStructWarrior from '../../assets/services/goal/icon-warrior.png';
import stageFeedbackMessage from '../../assets/services/self-assessment/stage-feedback-message.png';
import stageFeedbackShield from '../../assets/services/self-assessment/stage-feedback-shield.png';
import stageFeedbackStrength from '../../assets/services/goal/stage-exec-strength.png';
import studentCardWriting from '../../assets/services/self-assessment/student-card-01-writing.jpg';
import studentCardOrganizing from '../../assets/services/self-assessment/student-card-02-organizing.jpg';
import studentCardStructuring from '../../assets/services/self-assessment/student-card-03-structuring.jpg';
import studentCardPolishing from '../../assets/services/self-assessment/student-card-04-polishing.jpg';
import outcomeSettings from '../../assets/services/goal/outcome-settings.png';
import iconWallet from '../../assets/services/self-assessment/icon-wallet.png';
import outcomeFolder from '../../assets/services/goal/outcome-folder.png';
import outcomeCalendar from '../../assets/services/goal/outcome-calendar.png';

// 자기평가서 서비스 랜딩 — /services/self-assessment (구 경로 /page/services-self-assessment)
// Figma 시안(1907:20783, "자기평가서" 프레임, 1920×6560) + 상태 변형 노드 8개 + 히어로 애니메이션
// 원본(3248:2343) 정합 전면 재작성. 목표관리(GoalManagement.jsx), 수행평가(PerformanceAssessment.jsx)
// 와 같은 방식으로 components/services/ServiceLandingPage 공용 스켈레톤을 벗어나 bespoke로
// 구현했다(구 SERVICE_LANDING_CONTENT.selfAssessment 항목은 serviceLandingContent.js에서 함께
// 제거 — goal/performance 선례와 동일).
// 자기평가는 products 테이블에 해당 상품이 없어 결제 연동 없이 CTA를 /free-diagnosis로 안내한다
// (기존 ServiceLandingPage 스켈레톤의 paidServiceName: null 분기와 동일한 처리).

const HERO_CTA_TO = '/free-diagnosis';

// 컨테이너 폭 — 시안은 섹션마다 1436~1444px(1920 기준)로 드리프트하지만, StageSection 실측
// (1441×0.766 ≈ 1104 ≈ 1100)이 dev 정본 토큰 max-w-content(안쪽 실폭 1100px)와 정확히 맞아
// 토큰 정정 없이 전 섹션을 이 컨테이너로 통일했다. 예외 1건: OutcomesSection은 시안이 명확히
// 1145px(→875px)로 좁아 그 섹션 패널만 lg:max-w-[54.6875rem]를 직접 준다.
//
// 섹션 간 상단 여백 — 시안 실제 형제 갭은 전 경계 0이고 리듬은 섹션 내부 패딩(상 100~120px)이
// 만든다(하단 패딩 편차 113~168px는 line-box 잔여 노이즈로 정규화). 배경이 전 구간 흰색이라
// 인접 두 섹션의 경계 갭(100+100=200px)을 ×0.67로 축소해 각 섹션 pt에 몰아준다
// (134px=lg:pt-[8.375rem]). 히어로→프로세스 경계만 시안 자체가 120px로 더 좁아
// lg:pt-[5rem](80px)를 쓰고, FAQ→푸터 경계는 유일한 배경 전환 지점이라 축소 없이
// lg:pb-[7.0625rem](113px)를 그대로 쓴다.
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

// 탭별 카드 3장×5탭 — 상태 변형 노드 5개(문항분석 1907:20878, 내용정리 2181:1279, 강점추출
// 2181:1365, 구조설계 2181:1533, 피드백 2181:1574)가 전부 존재해(스펙 §3-0) 문항분석 탭만
// 정적으로 노출하던 구현을 폐기하고 인터랙티브 탭으로 전환했다. 문항분석 콘텐츠는 기존 코드
// 그대로 유지, 나머지 4탭은 신규 자산・카피.
const STAGE_CONTENT = {
  문항분석: [
    { icon: iconBinoculars, title: '문항 의도 파악', desc: '문항이 묻는 핵심과 의도를 짚어줍니다.' },
    { icon: iconSisyphus, title: '답변 방향 설정', desc: '무엇을 중심으로 써야 할지 방향을 잡아줍니다.' },
    { icon: iconLightbulb, title: '핵심 키워드 도출', desc: '답변에 담아야 할 핵심 키워드를 정리합니다.' }
  ],
  내용정리: [
    { icon: stageOrganizeLaptop, title: '활동・경험 정리', desc: '학생이 입력한 활동과 경험을 체계적으로 정리합니다.' },
    { icon: stageOrganizeWeight, title: '내용 우선순위', desc: '어떤 경험을 앞세울지 우선순위를 잡아줍니다.' },
    { icon: stageOrganizeTablet, title: '불필요한 내용 정리', desc: '중복・군더더기를 덜어내는 방향을 안내합니다.' }
  ],
  강점추출: [
    { icon: stageStrengthRain, title: '강점 발굴', desc: '경험 속 나만의 강점을 함께 찾습니다.' },
    { icon: stageStrengthWinner, title: '차별화 포인트', desc: '남과 다른 차별화 포인트를 짚어줍니다.' },
    { icon: stageStrengthKnot, title: '강점–근거 연결', desc: '강점을 뒷받침할 근거와 연결합니다.' } // – = U+2013(스펙 §0-6)
  ],
  구조설계: [
    { icon: stageStructWriting, title: '논리 흐름 설계', desc: '도입–전개–마무리의 논리 흐름을 설계합니다.' }, // – ×2 = U+2013
    { icon: stageStructWand, title: '문단 구성 제안', desc: '문단별 구성과 배치를 제안합니다.' },
    { icon: stageStructWarrior, title: '일관성 점검', desc: '전체 흐름의 일관성을 점검합니다.' }
  ],
  피드백: [
    { icon: stageFeedbackMessage, title: '표현 피드백', desc: '학생 초안의 문장・표현을 점검하고 피드백합니다.' },
    { icon: stageFeedbackShield, title: '문항 적합성 점검', desc: '문항 의도에 맞게 답했는지 확인합니다.' },
    { icon: stageFeedbackStrength, title: '완성도 점검', desc: '제출 전 완성도 체크리스트를 제공합니다.' }
  ]
};

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
// "활동 정리 + 강점 추출"로 세분화된 5단계 상세 버전이다(스펙 §5, 숫자 불일치 아님).
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
  { icon: outcomeCalendar, label: '피드백 리포트' } // 시안(1907:21009)은 Settings/Folder 중복 placeholder — 코드가 정상(스펙 §11-2 D3)
];

// 후기 작성자명 — 시안 원본은 "고3 김□□/이△△/박○○"처럼 마스킹 기호가 그대로 노출된
// placeholder였다(스펙 §11-2 D2). 목표관리・수행평가 선례의 "고N 김OO" 마스킹 표기로 교체했다.
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

// FAQ 답변 — 시안 펼침 상태 변형(2181:8233)에 답변 5개 전문이 있어(스펙 §8-0) 그 정본으로
// 교체했다. 단 5번(이용 요금)만 예외: 시안 정본은 "서비스 요금 안내 페이지에서 확인하실 수
// 있습니다"이지만, 자기평가는 products 테이블에 상품이 없어 요금 안내 페이지가 실질적으로
// 비어 있다 — 정본을 그대로 넣으면 링크 없는 허위 안내가 된다. 나머지 4개만 교체하고 5번은
// 현행 문구를 유지한다(사용자 결정, 스펙 §12 Q1 (b)).
const FAQ_ITEMS = [
  {
    q: '어떤 자료를 입력해야 하나요?',
    a: '문항과 본인의 활동・경험 자료를 입력하면 됩니다. 입력한 내용을 바탕으로 방향과 구성을 안내합니다.'
  },
  {
    q: 'AI가 대신 작성해 주나요?',
    a: '아니요. 위닝 자기평가서는 문항 해석・구조 설계・피드백을 돕는 코칭 서비스이며, 실제 작성은 학생 본인이 수행합니다. 제공되는 설계안・피드백을 그대로 옮겨 제출하는 것은 학문적 정직성에 어긋날 수 있어 권장하지 않습니다.'
  },
  {
    q: '피드백은 어떤 기준으로 제공되나요?',
    a: '문항 적합성, 논리 구성, 표현의 명료성 등을 기준으로 제공합니다.'
  },
  {
    q: '제공되는 결과물은 어떻게 활용하나요?',
    a: '구조 설계안・요약・피드백은 학생 본인이 서류를 직접 작성・검토하는 데 참고하는 자료입니다. 제출용 서류는 학생이 스스로 완성해야 합니다.'
  },
  {
    q: '이용 요금은 어떻게 되나요?',
    a: '정확한 이용 요금은 상담을 통해 안내드립니다.'
  }
];

function HeroSection() {
  const auraRef = useRef(null);
  const [auraInView, setAuraInView] = useState(false);

  // 히어로를 벗어나 스크롤하면 30초 회전을 멈춘다 — 3개 서비스 랜딩(목표관리/수행평가/
  // 자기평가) 공통 훅 구조(PerformanceAssessment.jsx HeroSection 선례).
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
    // 섹션 패딩(md:pb-0 md:pt-[2.25rem])은 목표관리・수행평가 히어로와 동일 규격으로
    // 통일했다(3페이지 공통 규격, 사용자 지시).
    <section className="relative overflow-hidden bg-white pb-14 pt-10 sm:pb-16 sm:pt-14 md:pb-0 md:pt-[2.25rem]">
      {/* 오라 애니메이션 — hero-aura.svg(노드 3248:2343 정본, 회전 4프레임 2716:3011→3076→
          3082→3088을 단일 rotate(0→360deg) 루프로 무손실 대체)를 위치/회전 레이어 2단 구조로
          렌더한다(PerformanceAssessment.jsx HeroSection 선례 그대로 이식 — 같은 요소에 위치용
          translate와 회전용 rotate를 같이 걸면 rotate가 translate를 덮어써 이미지가 밀려난다).
          바깥 div(auraRef) = 위치 전담(1600×1200 = 4:3). 안쪽 .sa-aura-spin = 회전 전담이자
          실제 정사각(1600×1600) SVG 배치 — hero-aura.svg의 viewBox("0 -220 1600 1600")가 이미
          뷰박스 중심을 회전 피벗(800,580)과 일치시켜 뒀으므로 transform-origin은 기본값
          50% 50% 그대로 둔다. top-[-16.6667%]는 4:3 위치 래퍼(높이 0.75w) 안에 정사각(높이 w)
          SVG를 세로 중앙 정렬하는 상수로, 비율 자체에서 나오는 값이라 수행평가와 동일하다
          (임의로 바꾸지 말 것).

          위치 래퍼 자체의 top은 -14.375rem(230px 상향) — 시안 히어로 프레임(2181:10043,
          1920×875) 실측상 Eclipse 중심이 섹션 상단 기준 y=370에 있다. main의 pt-16(64px)을
          더한 목표 페이지 y = 64+370 = 434인데, top-0 기준으로는 Eclipse 중심이 페이지
          y≈664(래퍼 top 0 + 회전 캔버스 중심 664)에 놓여 브라우저 목업(상단 y≈410)에 시안
          조각이 완전히 가려진다. 회전 피벗(안쪽 .sa-aura-spin)은 그대로 두고 위치 래퍼만
          230px 끌어올려 정합시킨다. */}
      <div
        ref={auraRef}
        className="pointer-events-none absolute left-1/2 top-[-14.375rem] aspect-[4/3] w-[100rem] max-w-none -translate-x-1/2 select-none"
      >
        <style>{`
          @keyframes sa-aura-spin {
            from { transform: rotate(0deg); }
            to   { transform: rotate(360deg); }
          }
          @media (prefers-reduced-motion: no-preference) {
            .sa-aura-spin[data-float='on'] {
              animation: sa-aura-spin 30s linear infinite;
              will-change: transform;
            }
          }
        `}</style>
        <div
          className="sa-aura-spin absolute left-0 top-[-16.6667%] aspect-square w-full"
          data-float={auraInView ? 'on' : 'off'}
        >
          <img src={heroAura} alt="" aria-hidden="true" draggable="false" className="block w-full" />
        </div>
      </div>
      {/* 그레인 — 회전 래퍼의 형제(밖)에 둔다. transform이 걸린 요소는 새 stacking context를
          만들어 mix-blend-overlay가 섹션 배경(bg-white)을 backdrop으로 못 잡고 그레인이 전면
          노출되는 회귀가 실제로 있었다(수행평가・무료진단 선례). */}
      <div
        aria-hidden="true"
        style={{ backgroundImage: `url(${heroGrain})` }}
        className="pointer-events-none absolute inset-0 select-none bg-[length:8.375rem_8.375rem] bg-repeat opacity-40 mix-blend-overlay"
      />

      <div className="relative z-10 mx-auto flex w-full max-w-content flex-col items-center px-5 text-center sm:px-8">
        {/* eyebrow/H1/서브 문단/CTA/목업 폭 — 목표관리・수행평가와 통일한 3페이지 공통 규격으로
            교체했다(스펙 §1-2, 사용자 지시). 카피 자체는 자기평가 고유 문구 그대로 유지. */}
        <p className="text-[1.25rem] font-normal leading-[1.6] text-accent sm:text-[1.375rem] md:text-[1.5rem]">
          서류 작성 지원 프로그램
        </p>

        <h1 className="mt-6 break-keep text-[1.75rem] font-semibold leading-[1.3] tracking-[-0.02em] text-[#0F172A] sm:text-[2.25rem] md:text-[2rem]">
          문항 해석부터 구조 설계까지, 자기평가서를 더 설득력 있게
        </h1>

        <p className="mt-6 break-keep text-[1.125rem] font-medium leading-[1.6] text-[#525252] sm:text-[1.25rem] md:text-[1.5rem]">
          문항 핵심을 파악하고 나만의 강점을 구조화해, 학생이 스스로 완성하도록 돕습니다
        </p>

        <Link
          to={HERO_CTA_TO}
          className="mt-6 inline-flex h-14 w-full max-w-[18.75rem] items-center justify-center rounded-[1.875rem] bg-[#013262] px-8 text-base font-semibold text-white shadow-[0_0.625rem_1.5625rem_rgba(1,50,98,0.4)] transition hover:bg-[#01498F] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#013262] focus-visible:ring-offset-2 sm:h-[4.25rem] sm:text-[1.25rem]"
        >
          지금 시작하기
        </Link>

        {/* 브라우저 목업 — 시안(2181:10054)은 크롬 UI만 있고 실제 서비스 화면 자식 노드
            자체가 없다(빈 흰 화면, 스펙 §11-1 M1). 크롬 프레임 지오메트리(폭/그림자/상단
            마진+하단 음수 마진)는 목표관리・수행평가 공통 규격을 이식하고 본문은 계속 빈
            배경으로 둔다(실 캡처 자산 없음, 디자인 재량). */}
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
        {/* 타이틀 — 시안 원문은 "위닝 목표관리의 4단계 핵심 프로세스"로 다른 서비스(목표관리)
            카피가 그대로 복사돼 있었다(스펙 §11-2 D1). 자기평가서 문맥에 맞게 정정했다. 2행
            "4단계 핵심 프로세스"만 네이비 강조(시안 상태 변형 노드 2181:1533/1574/8233 실측,
            스펙 §2-2 신규). 굵기는 시안(700)과 달리 다른 6개 H2와 동일한 600으로 통일
            (SECTION_HEADING_CLASS 공통 규칙, 스펙 §0-2). */}
        <h2 className={SECTION_HEADING_CLASS}>
          위닝 자기평가서의
          <br />
          <span className="text-[#013262]">4단계 핵심 프로세스</span>
        </h2>

        <div className="mt-10 grid grid-cols-1 gap-5 sm:mt-12 sm:grid-cols-2 lg:mt-[4.3125rem] lg:grid-cols-4 lg:gap-[1.875rem]">
          {PROCESS_STEPS.map((item, index) => (
            <div
              key={item.title}
              className="flex flex-col items-center gap-3 rounded-2xl border border-[#D7D7D7] bg-white px-6 py-8 text-center shadow-[0_0.75rem_1.25rem_rgba(216,216,216,0.4)] transition hover:-translate-y-1"
            >
              <span className="text-[1rem] font-semibold text-[#013262]">STEP {index + 1}</span>
              <p className="text-[1.125rem] font-semibold leading-[1.4] text-[#525252]">
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
  const [activeTab, setActiveTab] = useState(STAGE_TABS[0]);
  const activeCards = STAGE_CONTENT[activeTab] || [];

  return (
    <section className="bg-white pt-16 sm:pt-20 lg:pt-[8.375rem]">
      <div className="mx-auto w-full max-w-content px-5 sm:px-8">
        {/* 타이틀 — 시안 5프레임 전부 "단계별로, 목표를 관리합니다"로 목표관리 카피가
            복붙돼 있었다(스펙 §11-2 D1, 3-1). 이 섹션 콘텐츠에 맞게 정정했다. */}
        <h2 className={SECTION_HEADING_CLASS}>단계별로, 자기평가서를 완성합니다</h2>

        {/* 탭 — 상태 변형 노드 5개(문항분석 1907:20878, 내용정리 2181:1279, 강점추출
            2181:1365, 구조설계 2181:1533, 피드백 2181:1574)가 전부 존재해(스펙 §3-0) 정적
            표시("나머지 4탭 콘텐츠는 시안에 없다")를 폐기하고 인터랙티브 탭으로 전환했다.
            활성 밑줄 없음・weight 600, 비활성은 시안 #D9D9D9(대비 1.3:1 미달) 대신 프로젝트
            회색 하한 #A3A3A3 유지(접근성 우선, 코드 정본 — 스펙 §11-3 C1). lineHeight는 시안
            결함(활성 140%/비활성 130%)을 140%로 고정해 탭 전환 시 레이아웃 점프를 막는다
            (스펙 §11-2 D5). 탭 간 세로 구분선은 신규(시안 실측 1px×30px #D9D9D9 →
            #D7D7D7 정규화). 탭 행 하단 보더는 시안에 없어 삭제했다. */}
        <div
          className="mt-8 flex items-center gap-5 overflow-x-auto sm:mt-10 lg:mt-[2.875rem] lg:gap-[1.9375rem]"
          role="tablist"
          aria-label="자기평가서 작성 단계"
        >
          {STAGE_TABS.map((tab, index) => {
            const isActive = tab === activeTab;
            return (
              <Fragment key={tab}>
                <button
                  type="button"
                  role="tab"
                  id={`stage-tab-${index}`}
                  aria-selected={isActive}
                  aria-controls="stage-tabpanel"
                  onClick={() => setActiveTab(tab)}
                  className={`shrink-0 whitespace-nowrap text-[1.125rem] leading-[1.4] ${
                    isActive ? 'font-semibold text-[#525252]' : 'font-medium text-[#A3A3A3]'
                  }`}
                >
                  {tab}
                </button>
                {index < STAGE_TABS.length - 1 && (
                  <span aria-hidden="true" className="h-[1.4375rem] w-px shrink-0 bg-[#D7D7D7]" />
                )}
              </Fragment>
            );
          })}
        </div>

        {/* 카드 — 이 섹션만 "이미지 박스(453×200, 아이콘 138px) + 박스 밖 좌측정렬 텍스트"
            2단 구조다. 카드 자체엔 배경/패딩/보더가 없다(스펙 §3-4, §12 Q2 (a) 채택 — 다른
            카드 섹션과 리듬이 갈리지만 시안이 명확히 이렇게 그려져 있고 5탭 인터랙티브 전환과
            어차피 전면 재작성 구간이라 비용 차이가 작다). 카드 행 정렬은 시안 자체 불일치
            (CENTER/MIN 스펙 §11-2 D11)를 items-start로 통일한다.
            lg 이상 패널 높이 고정(16.1875rem=259px) — 실측(1500px 뷰포트) 탭별 패널 높이가
            문항분석/강점추출/구조설계 234px, 내용정리・피드백 259px로 갈린다(각 1번 카드 설명이
            2줄로 감겨 25px 더 높음). 최소값(234px)으로 고정하면 2줄 설명이 잘리므로 최대값을
            채택해 탭 전환 시 아래 섹션이 밀렸다 당겨지는 레이아웃 점프를 막는다(수행평가
            CoachingSection 탭패널 lg:h-[...] 선례와 동일 처리). 카드가 남는 탭은 items-start로
            콘텐츠를 위로 붙인다 — 세로 중앙 정렬 시 3카드 간 이미지 박스 상단선이 어긋난다. */}
        <div
          id="stage-tabpanel"
          role="tabpanel"
          aria-labelledby={`stage-tab-${STAGE_TABS.indexOf(activeTab)}`}
          className="mt-8 grid grid-cols-1 items-start gap-5 sm:mt-10 sm:grid-cols-3 lg:mt-[1.9375rem] lg:h-[16.1875rem] lg:gap-[1.9375rem]"
        >
          {activeCards.map((card) => (
            <div key={`${activeTab}-${card.title}`} className="flex flex-col text-left">
              <div className="flex aspect-[453/200] items-center justify-center rounded-[0.5625rem] border border-[#D7D7D7] bg-[#F9FAFB]">
                <img src={card.icon} alt="" aria-hidden="true" className="h-[8.625rem] w-[8.625rem] object-contain" />
              </div>
              <p className="mt-4 text-[1.125rem] font-semibold leading-[1.4] text-[#525252]">
                {card.title}
              </p>
              <p className="mt-[0.9375rem] break-keep text-[1.125rem] font-medium leading-[1.4] text-[#767676]">
                {card.desc}
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
    <section className="bg-white pt-16 sm:pt-20 lg:pt-[8.375rem]">
      <div className="mx-auto w-full max-w-content px-5 sm:px-8">
        {/* H2 정렬 — 다른 6개 H2와 동일한 좌측 정렬(시안 실측, 컨테이너 text-center 제거).
            강조 런은 시안 characterStyleOverrides 그대로 "자기 평가 서비스를 추천해요" 전체를
            네이비(#013262)로 — GoalManagement.jsx AudienceSection(L570)이 이미 이 토큰을 써서
            3페이지 일관성도 이 값이 맞다(accent #0B84FD 아님, 스펙 §12 Q3 (a)). */}
        <h2 className={SECTION_HEADING_CLASS}>
          이런 학생에게 <span className="text-[#013262]">자기 평가 서비스를 추천해요</span>
        </h2>

        <div className="mt-10 grid grid-cols-1 gap-4 sm:mt-12 sm:grid-cols-2 lg:grid-cols-4">
          {AUDIENCE_CARDS.map((item) => (
            <article
              key={item.title}
              className="flex flex-col overflow-hidden rounded-2xl bg-[#F9FAFB] text-left transition hover:-translate-y-1 hover:shadow-[0_1rem_2rem_rgba(82,82,82,0.14)]"
            >
              <img src={item.image} alt={item.title} className="h-[11.75rem] w-full object-cover" />
              <div className="flex flex-1 flex-col gap-2 px-6 py-6">
                <p className="text-[1.125rem] font-semibold leading-[1.4] text-[#525252]">
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
    <section className="bg-white pt-16 sm:pt-20 lg:pt-[8.375rem]">
      <div className="mx-auto w-full max-w-content px-5 sm:px-8">
        <h2 className={SECTION_HEADING_CLASS}>다섯 단계로 차근차근</h2>

        <div className="mt-10 grid grid-cols-1 gap-5 sm:mt-12 sm:grid-cols-2 lg:grid-cols-3 lg:gap-[1.9375rem]">
          {firstRow.map((item) => (
            <div key={item.title} className="rounded-xl bg-[#F9FAFB] px-6 py-7">
              <p className="text-[1.125rem] font-semibold leading-[1.4] text-[#525252]">
                {item.title}
              </p>
              <p className="mt-[0.9375rem] break-keep text-[1.125rem] font-medium leading-[1.4] text-[#767676]">
                {item.desc}
              </p>
            </div>
          ))}
        </div>

        {/* 2행 정렬 — 시안은 1행과 동일하게 좌측 정렬이다(text-center 삭제). */}
        <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:mx-auto lg:mt-[1.9375rem] lg:max-w-[45.1875rem] lg:gap-[1.9375rem]">
          {secondRow.map((item) => (
            <div key={item.title} className="rounded-xl bg-[#F9FAFB] px-6 py-7 text-left">
              <p className="text-[1.125rem] font-semibold leading-[1.4] text-[#525252]">
                {item.title}
              </p>
              <p className="mt-[0.9375rem] break-keep text-[1.125rem] font-medium leading-[1.4] text-[#767676]">
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
    <section className="bg-white pt-16 sm:pt-20 lg:pt-[8.375rem]">
      <div className="mx-auto w-full max-w-content px-5 text-center sm:px-8">
        <h2 className={SECTION_HEADING_CLASS}>자기평가로 정리되는 것들</h2>

        {/* 패널 폭 — 이 섹션만 시안이 명확히 1145px(→875px)로 좁다(스펙 §0-1 예외 1건).
            컨테이너 통일 원칙(max-w-content)의 유일한 예외로 lg:max-w-[54.6875rem]를 직접
            준다. 아이콘 매핑은 절대배치 x좌표로 재계산해 확정했다(자식 배열 순서로 읽으면
            1↔2가 뒤바뀐다, 스펙 §11-4). */}
        <div className="mt-8 grid grid-cols-2 gap-6 rounded-xl border border-[#D7D7D7] bg-[#F9FAFB] px-6 py-8 sm:mt-10 sm:grid-cols-4 sm:gap-0 sm:divide-x sm:divide-[#D7D7D7] sm:px-4 lg:mx-auto lg:max-w-[54.6875rem]">
          {OUTCOME_ITEMS.map((item) => (
            <div key={item.label} className="flex flex-col items-center gap-3 px-4 py-2 text-center">
              <img src={item.icon} alt="" aria-hidden="true" className="h-[4.8125rem] w-[4.8125rem]" />
              <p className="text-[1.125rem] font-semibold leading-[1.4] text-[#525252]">
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
    <section className="bg-white pt-16 sm:pt-20 lg:pt-[8.375rem]">
      <div className="mx-auto w-full max-w-content px-5 text-center sm:px-8">
        {/* 타이틀 — 시안 원문은 "목표관리 서비스를 받아본 학생들의 후기"로 다른 서비스 카피가
            그대로 복사돼 있었다(스펙 §11-2 D1). 자기평가서 문맥에 맞게 정정했다. */}
        <h2 className={SECTION_HEADING_CLASS}>자기평가 서비스를 받아본 학생들의 후기</h2>

        <div className="mt-10 grid grid-cols-1 gap-5 sm:mt-12 lg:grid-cols-3 lg:gap-[2.875rem]">
          {TESTIMONIALS.map((item) => (
            <figure
              key={item.quote}
              className="flex h-full flex-col justify-between rounded-[2rem] bg-[#F9FAFB] p-[1.875rem] text-left shadow-[0_0.125rem_0.25rem_rgba(213,213,213,0.25)]"
            >
              <blockquote className="break-keep text-[1.0625rem] font-normal leading-[1.5] text-[#525252]">
                “{item.quote}”
              </blockquote>
              {/* 이모지 원형 칩・따옴표 래핑은 시안에 없는 코드 추가분이다(스펙 §11-1 M3) —
                  가독성을 위해 유지한다(코드 재량). */}
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
  return (
    <div className="border-b border-[#D7D7D7] py-6 last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between gap-4 text-left"
      >
        <span className="break-keep text-[1.125rem] font-medium leading-[1.4] tracking-[-0.02em] text-[#525252]">
          {item.q}
        </span>
        <ChevronDown
          className={`h-[1.125rem] w-[1.125rem] shrink-0 text-[#767676] transition-transform ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>
      {isOpen && (
        <p className="mt-6 break-keep text-[1.125rem] font-normal leading-[1.6] text-[#767676]">
          {item.a}
        </p>
      )}
    </div>
  );
}

function FaqSection() {
  const [openIndex, setOpenIndex] = useState(-1);

  return (
    <section className="bg-white pt-16 pb-20 sm:pt-20 sm:pb-24 lg:pt-[8.375rem] lg:pb-[7.0625rem]">
      <div className="mx-auto w-full max-w-content px-5 sm:px-8">
        <h2 className={SECTION_HEADING_CLASS}>자주 묻는 질문</h2>

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
