import { Fragment, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, CheckCircle2 } from 'lucide-react';
import { openPaidServiceOrAlert } from '../../lib/paidServiceAccess';
import { formatKRW, SERVICES as PRICING_SERVICES } from '../../data/pricingCatalog';

import heroAura from '../../assets/services/goal/hero-aura.png';
import heroDashboard from '../../assets/services/goal/hero-dashboard.png';
import iconBinoculars from '../../assets/services/goal/icon-binoculars.png';
import iconWarrior from '../../assets/services/goal/icon-warrior.png';
import iconTablet from '../../assets/services/goal/icon-tablet.png';
import iconWriting from '../../assets/services/goal/icon-writing.png';
import iconStrength from '../../assets/services/goal/icon-strength.png';
import audienceGoal from '../../assets/services/goal/audience-goal.png';
import audienceDirection from '../../assets/services/goal/audience-direction.png';
import audienceExecution from '../../assets/services/goal/audience-execution.png';
import audienceParent from '../../assets/services/goal/audience-parent.png';
import outcomePencil from '../../assets/services/goal/outcome-pencil.png';
import outcomeCalendar from '../../assets/services/goal/outcome-calendar.png';
import outcomeFolder from '../../assets/services/goal/outcome-folder.png';
import outcomeSettings from '../../assets/services/goal/outcome-settings.png';
import outcomeShield from '../../assets/services/goal/outcome-shield.png';
import phoneReportMockup from '../../assets/services/goal/phone-report-mockup.png';
import stageDiagJuggler from '../../assets/services/goal/stage-diag-juggler.png';
import stageDiagSmartphone from '../../assets/services/goal/stage-diag-smartphone.png';
import stageDiagMeditation from '../../assets/services/goal/stage-diag-meditation.png';
import stageDiagTreadmill from '../../assets/services/goal/stage-diag-treadmill.png';
import stageDiagWeightlifting from '../../assets/services/goal/stage-diag-weightlifting.png';
import stagePlanLaptopChair from '../../assets/services/goal/stage-plan-laptop-chair.png';
import stagePlanAi from '../../assets/services/goal/stage-plan-ai.png';
import stageAlarm from '../../assets/services/goal/stage-alarm.png';
import stagePlanWriting from '../../assets/services/goal/stage-plan-writing.png';
import stagePlanCoffee from '../../assets/services/goal/stage-plan-coffee.png';
import stageExecLaptopWork from '../../assets/services/goal/stage-exec-laptop-work.png';
import stageExecHeart from '../../assets/services/goal/stage-exec-heart.png';
import stageExecStrength from '../../assets/services/goal/stage-exec-strength.png';
import stageExecWizard from '../../assets/services/goal/stage-exec-wizard.png';

// 목표관리 서비스 랜딩 — /services/goal (구 경로 /page/services-goal)
// Figma 시안(1889:6944, "목표관리" 프레임) 전용 구현. 다른 3종 서비스 랜딩과 달리
// components/services/ServiceLandingPage 공용 스켈레톤을 쓰지 않는다 — 시안 섹션 구조가
// 4종 공용으로 흡수하기엔 폭/색/카드 배치가 이질적이라(스펙 §4) 목표관리만 bespoke로 뗐다.
// 가격/CTA 연동(SERVICES 카탈로그, openPaidServiceOrAlert)은 공용 로직 그대로 재사용한다.

const HERO_SERVICE = { name: '목표관리 서비스', to: '/pricing' };

const GOAL_PRODUCTS = PRICING_SERVICES.find((service) => service.key === 'goal')?.products || [];

// 컨테이너 폭 — 시안은 섹션마다 1100/1436/1443/1600px로 제각각이지만(스펙 §4),
// dev 정본 토큰 max-w-content(72.75rem≈1164px, 내부 실콘텐츠 1100px)로 전 섹션을 통일했다.
// 러프 구현 원칙(픽셀 재현 아님) + 기존 페이지들과의 리듬 일관성을 우선한 결정.
// 수직 스페이싱 — 모바일/태블릿은 기존 generic 값을 유지하고, 데스크톱(md:)은
// 무료진단(FreeDiagnosisLanding.jsx) 컨벤션을 따라 시안(1889:6944) 실측 rem 값을 섹션별로
// 개별 지정한다. 섹션 하단 여백은 다음 섹션의 md:pt-가 담당하며(마지막 섹션만 pb 보유),
// 전 섹션 동일값(lg:pt-[6.25rem])을 쓰던 이전 리듬은 폐기했다.
const SECTION_HEADING_CLASS =
  'break-keep text-[1.5rem] font-semibold leading-[1.4] tracking-[-0.02em] text-[#0F172A] sm:text-[1.75rem] lg:text-[2rem]';

const PROCESS_STEPS = [
  {
    title: '목표 설정',
    desc: '목표 대학・학과를 정하고 현재 위치와 확률을 확인합니다'
  },
  {
    title: '학습 분석',
    desc: '성적과 활동을 진단해 강점과 약점을 데이터로 분석합니다'
  },
  {
    title: '목표 시간 제안',
    desc: '합격에 필요한 학습 시간을 데이터 기반으로 제안합니다.'
  },
  {
    title: '전략 실행 & 점검',
    desc: '주간 실행을 점검하고 전략을 계속 조정해 나갑니다'
  }
];

const STAGE_TABS = ['목표 설정', '성적 진단', '학습 설계', '실행 관리', '학부모 안내'];

// 탭별 카드 콘텐츠 — Figma 시안 3종(2063:11610 성적진단, 2063:11744 학습설계,
// 2063:11878 실행관리)을 반영해 탭마다 실제 카드가 전환되도록 구성했다. '목표 설정' 탭은
// 기존 확정 콘텐츠(구 STAGE_CARDS)를 그대로 이전했다. '학부모 안내' 탭은 시안 파일을
// 전수 확인했으나 콘텐츠가 존재하지 않아 비활성 탭으로 남긴다(아래 StageSection 참고) —
// 시안이 추가되면 이 맵에 '학부모 안내' 키를 등록한다.
//
// 시안(1889:7053, 목표 설정 탭)은 5개 카드 중 2~5번 설명 문구가 전부 "과목과 관심사에 맞는
// 탐구 주제 후보를 제안합니다."로 동일한 placeholder가 남아있다(다른 서비스 카피가 잘못
// 복붙된 것으로 추정 — 스펙 문서에도 결함으로 명시됨). 그대로 옮기면 카드마다 제목과 무관한
// 문장이 반복돼 오히려 사용자에게 결함을 노출하므로, 각 카드 제목에 맞는 설명으로 대체했다
// (구조·순서·아이콘·제목은 시안 그대로).
const STAGE_CONTENT = {
  '목표 설정': [
    {
      icon: iconBinoculars,
      title: '목표 대학・학과 설정',
      desc: '희망 대학과 학과를 정해 목표를 구체화합니다.'
    },
    {
      icon: iconWarrior,
      title: '현재 위치 파악',
      desc: '성적과 활동 데이터로 지금의 위치를 진단합니다.'
    },
    {
      icon: iconTablet,
      title: '목표 확률 분석',
      desc: '목표 대비 합격 확률을 데이터로 분석합니다.'
    },
    {
      icon: iconWriting,
      title: '매일 실행 목표 게시',
      desc: '오늘 해야 할 학습 목표를 매일 안내합니다.'
    },
    {
      icon: iconStrength,
      title: '목표 현황 안내',
      desc: '목표 달성 현황을 한눈에 확인할 수 있게 안내합니다.'
    }
  ],
  '성적 진단': [
    {
      icon: stageDiagJuggler,
      title: '과목별 성적 진단',
      desc: '과목별 성적 흐름과 등급 변화를 추적합니다.'
    },
    {
      icon: stageDiagSmartphone,
      title: '강・약점 분석',
      desc: '어떤 단원・영역이 부족한지 데이터로 짚어냅니다.'
    },
    {
      icon: stageDiagMeditation,
      title: '오답 패턴 파악',
      desc: '반복되는 실수 유형을 찾아 개선 포인트를 제시합니다.'
    },
    {
      icon: stageDiagTreadmill,
      title: '목표 대비 격차',
      desc: '목표 대학 기준과의 격차를 수치로 보여줍니다.'
    },
    {
      icon: stageDiagWeightlifting,
      title: '전형별 유불리',
      desc: '수시・정시 전형별로 유리한 방향을 안내합니다.'
    }
  ],
  '학습 설계': [
    {
      icon: stagePlanLaptopChair,
      title: '맞춤 학습 설계',
      desc: '진단 결과를 바탕으로 개인별 학습 계획을 설계합니다.'
    },
    {
      icon: stagePlanAi,
      title: '주간 플래너',
      desc: '주 단위 학습 분량을 자동으로 배분합니다.'
    },
    {
      icon: stageAlarm,
      title: '목표 학습 시간',
      desc: '합격에 필요한 목표 학습 시간을 제안합니다.'
    },
    {
      icon: stagePlanWriting,
      title: '과제・오답 관리',
      desc: '과제와 오답을 놓치지 않도록 관리합니다.'
    },
    {
      icon: stagePlanCoffee,
      title: '계획 조정',
      desc: '실행 결과에 따라 계획을 유연하게 조정합니다.'
    }
  ],
  '실행 관리': [
    {
      icon: stageExecLaptopWork,
      title: '매일 실행 점검',
      desc: '매일의 목표 실행 여부를 체크하고 기록합니다.'
    },
    {
      icon: stageAlarm,
      title: '일정・시험 알림',
      desc: '시험・제출・마감 일정을 놓치지 않게 알려줍니다.'
    },
    {
      icon: stageExecHeart,
      title: '진도・성취도 기록',
      desc: '과목별 진도와 성취도를 함께 기록합니다.'
    },
    {
      icon: stageExecStrength,
      title: '실행 피드백',
      desc: '실행이 흐트러지면 바로 피드백을 제공합니다.'
    },
    {
      icon: stageExecWizard,
      title: '주간 리포트',
      desc: '한 주의 실행 결과를 리포트로 정리합니다.'
    }
  ]
};

const AUDIENCE_CARDS = [
  {
    image: audienceGoal,
    title: '명확한 목표가 필요한 학생',
    desc: '어떤 대학을 목표로 해야 할지, 지금 뭘 해야 할지 막막한 학생'
  },
  {
    image: audienceDirection,
    title: '방향이 막막한 학생',
    desc: '성적은 나오는데 목표까지 어떻게 가야할지 모르겠는 학생'
  },
  {
    image: audienceExecution,
    title: '실행이 어려운 학생',
    desc: '계획은 세우지만 매번 실행과 점검이 흐지부지되는 학생'
  },
  {
    image: audienceParent,
    title: '함께 관리하고 싶은 학부모',
    desc: '아이의 학습 진행을 함께 확인하고 소통하고 싶은 학부모'
  }
];

const MANAGEMENT_CARDS = [
  { title: '타이밍', desc: '집중 학습에 가장 좋은 타이밍을 데이터로 잡아줍니다.' },
  { title: '학습 플래너', desc: '일・주 단위 학습 계획을 자동으로 정리합니다' },
  { title: '진도 & 성취도', desc: '과목별 학습 진도와 성취도를 함께 확인합니다' },
  { title: '과제 & 오답 관리', desc: '과제와 오답을 관리해 약점을 놓치지 않습니다' },
  { title: '스케줄 지원', desc: '시험・일정・제출 알림을 놓치지 않게 지원합니다' },
  { title: '리포트', desc: '주간・월간 리포트로 성장 흐름을 한눈에 봅니다' }
];

const OUTCOME_ITEMS = [
  { icon: outcomePencil, label: '합격 확률 향상' },
  { icon: outcomeCalendar, label: '학습 시간 최적화' },
  { icon: outcomeFolder, label: '학습 습관 형성' },
  { icon: outcomeSettings, label: '성적 향상' },
  { icon: outcomeShield, label: '부모님 안심' }
];

// 폰 목업 주변 플로팅 배지 — 시안 1889:7243 실측 좌표(1920px 프레임 기준)를 폰 박스
// (x=911 y=161, 372×781) 기준 %/rem으로 환산했다. FreeDiagnosisLanding(MacbookMockup)의
// 부유 칩 배치·애니메이션 관행을 그대로 이식한다(스펙 §A5/§B).
//   📊 매주 리포트 자동 발송: x585 y435 351×104 (폰 좌측 중단)
//   📋 이번 주 성과를 한눈에: x703 y713 262×104 (폰 좌하단)
//   ✏️ PDF 리포트 확인:      x1231 y713 240×104 (폰 우하단)
// left = (badge.x − phone.x)/phone.w × 100, top = (badge.y − phone.y)/phone.h × 100
// (기존 % 체계 유지, 근사값과 일치 확인).
// width는 폰 목업 렌더 폭(max-w-[20rem]=320px)을 1x 기준으로 badge.w/phone.w × 20rem 환산
// (기존 코드의 고정 rem 폭 관행을 유지 — % width는 absolute 중첩 레이어에서 해석이 불안정해 배제).
//
// X/Y/회전을 keyframes 3종으로 분리(축 분해)하고 칩마다 진폭·주기·delay를 모두 다르게 뒀다
// (FreeDiagnosisLanding FLOATING_BADGES 선례 — 세 사인파 합성 경로가 사실상 반복되지 않는
// 리사주 도형 원리로 패턴 학습을 막는다. 절대 통일하지 말 것).
const PHONE_BADGES = [
  {
    emoji: '📊',
    title: '매주 리포트 자동 발송',
    desc: '따로 챙기지 않아도 카카오톡 알림톡으로 도착해요',
    // 시안(1889:7243) 고정폭 351px — 제목 1줄+설명 1줄 유지, 칩 높이는
    // p-5(40) + title 28 + gap 10 + desc 26 = 104px로 자연히 맞춰진다.
    style: { left: '-87.63%', top: '35.08%', width: '21.9375rem' },
    x: { amplitude: '0.375rem', duration: '4.5s', delay: '0s' },
    y: { amplitude: '1rem', duration: '3.3s', delay: '-1.2s' },
    rot: { amplitude: '1deg', duration: '5.9s', delay: '-2.4s' }
  },
  {
    emoji: '📋',
    title: '이번 주 성과를 한눈에',
    desc: '목표 달성률, 학습 시간, 순위률 요약',
    // 시안 고정폭 262px
    style: { left: '-55.91%', top: '70.68%', width: '16.375rem' },
    x: { amplitude: '0.3125rem', duration: '5.3s', delay: '-0.5s' },
    y: { amplitude: '0.8125rem', duration: '3.9s', delay: '-1.7s' },
    rot: { amplitude: '1.2deg', duration: '6.5s', delay: '-3.5s' }
  },
  {
    emoji: '✏️',
    title: 'PDF 리포트 확인',
    desc: '클릭 한 번으로 전체 내용을 열람',
    // 시안 고정폭 240px
    style: { left: '86.02%', top: '70.68%', width: '15rem' },
    x: { amplitude: '0.375rem', duration: '4.9s', delay: '-1s' },
    y: { amplitude: '1.125rem', duration: '4.3s', delay: '-2.3s' },
    rot: { amplitude: '0.8deg', duration: '7.1s', delay: '-4.2s' }
  }
];

const TESTIMONIALS = [
  {
    quote: '내 목표 대학까지의 확률이 눈에 보이니까, 막연하던 공부가 방향이 생겼어요.',
    name: '고2 김OO',
    tag: '인문계열'
  },
  {
    quote: '매일 뭘 해야 할지 콕 짚어주니, 미루던 습관이 줄었습니다.',
    name: '고2 김OO',
    tag: '인문계열'
  },
  {
    quote: '주간 리포트로 아이 상황을 함께 볼 수 있어 안심이 됩니다.',
    name: '고2 김OO',
    tag: '학부모'
  }
];

// 답변 콘텐츠 — 시안(2281:1297)은 닫힌 상태만 존재해 질문 텍스트만 확정돼 있다.
// 아코디언을 펼쳤을 때 빈 화면이 되는 걸 막기 위해 구 serviceLandingContent.js에 있던
// 동일 질문 4개의 답변을 그대로 재사용했다(신규 작성 아님 — 기존 확정 카피).
const FAQ_ITEMS = [
  {
    q: '합격 확률은 어떻게 계산되나요?',
    a: '성적, 모의고사 결과, 활동 데이터를 종합해 목표 대학・학과 기준으로 산출합니다. 세부 산출 기준은 상담에서 자세히 안내드립니다.'
  },
  {
    q: '목표 학습 시간은 어떻게 제안되나요?',
    a: '현재 성취도와 목표 확률의 격차를 기준으로 과목별 우선순위와 주간 학습 시간을 제안합니다.'
  },
  {
    q: '학부모에게 어떤 알림이 오나요?',
    a: '매주 학습 리포트가 카카오톡 알림톡으로 전송되며, 목표 달성률・학습 시간・학습 순위를 확인할 수 있습니다.'
  },
  {
    q: '개인 정보는 안전하게 관리되나요?',
    a: '수집된 정보는 서비스 제공 목적에 한해 안전하게 관리됩니다. 자세한 내용은 개인정보처리방침을 확인해 주세요.'
  }
];

function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-white pb-14 pt-10 sm:pb-16 sm:pt-14 md:pb-0 md:pt-[2.25rem]">
      <img
        src={heroAura}
        alt=""
        aria-hidden="true"
        draggable="false"
        className="pointer-events-none absolute left-1/2 top-0 w-[100rem] max-w-none -translate-x-1/2 select-none opacity-90"
      />

      <div className="relative z-10 mx-auto flex w-full max-w-content flex-col items-center px-5 text-center sm:px-8">
        <p className="text-[1.25rem] font-normal leading-[1.6] text-accent sm:text-[1.375rem] md:text-[1.5rem]">목표관리</p>

        <h1 className="mt-6 break-keep max-w-[56rem] text-[1.75rem] font-semibold leading-[1.3] tracking-[-0.02em] text-[#0F172A] sm:text-[2.25rem] md:text-[2rem]">
          목표의 합격 확률을 관리합니다
        </h1>

        <p className="mt-6 break-keep text-[1.125rem] font-medium leading-[1.6] text-[#525252] sm:text-[1.25rem] md:text-[1.5rem]">
          데이터가 합격을 만들고, 실행이 결과를 만듭니다
        </p>

        <button
          type="button"
          onClick={(event) => openPaidServiceOrAlert(event, HERO_SERVICE)}
          className="mt-6 inline-flex h-14 w-full max-w-[18.75rem] items-center justify-center rounded-[1.875rem] bg-[#013262] px-8 text-base font-semibold text-white shadow-[0_0.625rem_1.5625rem_rgba(1,50,98,0.4)] transition hover:bg-[#01498F] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#013262] focus-visible:ring-offset-2 sm:h-[4.25rem] sm:text-[1.25rem]"
        >
          지금 시작하기
        </button>

        <div className="relative z-10 mx-auto mt-8 w-full max-w-[66.75rem] sm:mt-10 md:mt-[3.0625rem] lg:mb-[-7.89375rem]">
          <div className="overflow-hidden rounded-[0.3125rem] bg-white shadow-[0_0_0.0625rem_rgba(0,0,0,0.7),0_1.25rem_1.875rem_rgba(0,0,0,0.3),0_0.625rem_3.125rem_rgba(0,0,0,0.2)] md:flex md:aspect-[1280/553] md:flex-col">
            <div className="flex items-center gap-3 border-b border-[#E5E7EB] bg-[#F5F6F8] px-4 py-2.5 md:shrink-0">
              <span className="flex gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F57]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#FEBC2E]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#28C840]" />
              </span>
              <span className="flex-1 truncate rounded-full border border-[#E5E7EB] bg-white px-4 py-1 text-center text-[0.75rem] text-[#767676]">
                https://www.winningedu.com
              </span>
            </div>
            <img
              src={heroDashboard}
              alt="TMP 주간 성장 리포트 대시보드 화면 — 이번 주 공부 시간, 목표 달성률, 목표군 내 위치를 보여준다"
              className="w-full md:min-h-0 md:flex-1 md:object-cover md:object-top"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function ProcessSection() {
  return (
    <section className="bg-white pt-16 sm:pt-20 md:pt-[8.75rem]">
      <div className="mx-auto w-full max-w-content px-5 sm:px-8">
        <h2 className={SECTION_HEADING_CLASS}>
          위닝 목표관리의
          <br />
          <span className="font-bold text-[#013262]">4단계 핵심 프로세스</span>
        </h2>

        {/* 시안(1889:7004) 카드 폭 280px, 4장 총폭 1180px는 컨테이너 max-w-content(1164px)를
            넘어선다 — wide(74rem) 이상에서 폭을 276px(17.25rem)로 클램프해 총폭을 1164px에
            맞춘다. */}
        <div className="mt-10 grid grid-cols-1 gap-5 sm:mt-12 md:mt-[4.375rem] sm:grid-cols-2 lg:grid-cols-4 lg:gap-5 wide:grid-cols-[repeat(4,17.25rem)] wide:justify-center">
          {PROCESS_STEPS.map((item, index) => (
            <div
              key={item.title}
              className="flex flex-col items-center rounded-[1.25rem] border border-[#D7D7D7] bg-white px-6 pb-8 pt-8 text-center shadow-[0_0.75rem_1.25rem_rgba(215,215,215,0.4)] transition hover:-translate-y-1 hover:shadow-[0_0.75rem_1.5rem_rgba(1,50,98,0.08)] md:px-4 md:pb-6"
            >
              <span className="text-[1rem] font-semibold text-[#013262]">STEP {index + 1}</span>
              <p className="mt-3 text-[1.25rem] font-semibold leading-[1.3] text-[#525252]">
                {item.title}
              </p>
              <p className="mt-5 break-keep text-[1rem] font-medium leading-[1.375] text-[#525252]">
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
    <section className="bg-white pt-16 sm:pt-20 md:pt-[13.75rem]">
      <div className="mx-auto w-full max-w-content px-5 sm:px-8">
        <h2 className={SECTION_HEADING_CLASS}>단계별로, 목표를 관리합니다</h2>

        {/* 탭 — 시안 3종(2063:11610 성적진단, 2063:11744 학습설계, 2063:11878 실행관리)의
            카드 콘텐츠를 반영해 인터랙티브 탭으로 전환했다. '목표 설정' 탭은 기존 확정 콘텐츠를
            그대로 쓴다. '학부모 안내' 탭 콘텐츠 시안 미제공(파일 전수 확인) — 시안 추가 시
            STAGE_CONTENT에 등록한다. 그 전까지는 비활성(disabled) 처리한다. */}
        <div
          className="mt-8 flex items-center gap-5 overflow-x-auto sm:mt-10 md:mt-[3.75rem] md:gap-10"
          role="tablist"
          aria-label="목표관리 단계"
        >
          {STAGE_TABS.map((tab, index) => {
            const isParentTab = !STAGE_CONTENT[tab];
            const isActive = tab === activeTab;

            return (
              <Fragment key={tab}>
                {isParentTab ? (
                  <button
                    type="button"
                    role="tab"
                    disabled
                    aria-disabled="true"
                    aria-selected={false}
                    className="shrink-0 cursor-default whitespace-nowrap text-[1.125rem] font-medium text-[#D7D7D7] md:text-[1.5rem] md:leading-[1.2917]"
                  >
                    {tab}
                  </button>
                ) : (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => setActiveTab(tab)}
                    className={`shrink-0 whitespace-nowrap text-[1.125rem] md:text-[1.5rem] md:leading-[1.2917] ${
                      isActive
                        ? 'font-semibold text-[#525252]'
                        : 'font-medium text-[#D7D7D7]'
                    }`}
                  >
                    {tab}
                  </button>
                )}
                {index < STAGE_TABS.length - 1 && (
                  <span aria-hidden="true" className="h-[1.875rem] w-px shrink-0 bg-[#D7D7D7]" />
                )}
              </Fragment>
            );
          })}
        </div>

        <div className="mt-8 grid grid-cols-2 gap-4 sm:mt-10 md:mt-[2.75rem] sm:grid-cols-3 lg:grid-cols-5 lg:gap-[1.1875rem]">
          {activeCards.map((card) => (
            <div key={`${activeTab}-${card.title}`} className="flex flex-col gap-4 md:gap-10">
              <div className="flex h-40 items-center justify-center rounded-xl border border-[#D7D7D7] bg-[#FBFAFA]">
                <img
                  src={card.icon}
                  alt=""
                  aria-hidden="true"
                  className="h-24 w-24 object-contain md:h-[8.5rem] md:w-[8.5rem]"
                />
              </div>
              <div>
                <p className="text-[1.25rem] font-semibold leading-[1.3] text-[#525252]">
                  {card.title}
                </p>
                {/* 시안 원본은 #808080이나, 프로젝트 회색 하한선(#767676 이상)을 지키기 위해
                    더 진한 톤으로 클램프한다 — ManagementSection 선례 참고. */}
                <p className="mt-2 break-keep text-[1rem] font-medium leading-[1.3125] text-[#767676] md:mt-5">
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
    <section className="bg-white pt-16 sm:pt-20 md:pt-[17.9375rem]">
      <div className="mx-auto w-full max-w-content px-5 sm:px-8">
        <h2 className={SECTION_HEADING_CLASS}>
          이런 학생에게 <span className="text-[#013262]">목표관리 서비스를 추천해요</span>
        </h2>

        <div className="mt-10 grid grid-cols-1 gap-5 sm:mt-12 md:mt-[3.75rem] sm:grid-cols-2 lg:grid-cols-4 lg:gap-5 wide:grid-cols-[repeat(4,16.25rem)] wide:justify-center">
          {AUDIENCE_CARDS.map((item) => (
            <article
              key={item.title}
              className="flex flex-col overflow-hidden rounded-[1.25rem] bg-[#FBFAFA] text-left transition hover:-translate-y-1 hover:shadow-[0_1rem_2rem_rgba(82,82,82,0.14)]"
            >
              <div className="flex h-44 w-full items-end md:h-[13.5625rem]">
                <img src={item.image} alt={item.title} className="w-full object-contain" />
              </div>
              <div className="flex flex-1 flex-col px-6 pb-6 pt-6 md:pl-[2.125rem] md:pr-[1.3125rem] md:pb-10 md:pt-[3.9375rem]">
                <p className="text-[1.25rem] font-semibold leading-[1.3] text-[#525252]">
                  {item.title}
                </p>
                <p className="mt-2 break-keep text-[1rem] font-medium leading-[1.375] text-[#525252] md:mt-[1.4375rem]">
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

function ManagementSection() {
  return (
    <section className="bg-white pt-16 sm:pt-20 md:pt-[13.875rem]">
      <div className="mx-auto w-full max-w-content px-5 sm:px-8">
        <h2 className={SECTION_HEADING_CLASS}>목표 달성까지, 이 모든 걸 함께 관리합니다</h2>

        <div className="mt-10 grid grid-cols-1 gap-4 sm:mt-12 md:mt-[3.75rem] sm:grid-cols-2 lg:grid-cols-3 lg:gap-5">
          {MANAGEMENT_CARDS.map((card) => (
            <div key={card.title} className="rounded-xl bg-[#F6F5F4] px-6 py-7 md:min-h-[10rem] md:pb-0 md:pt-9">
              <p className="text-[1.25rem] font-semibold leading-[1.3] text-[#525252]">
                {card.title}
              </p>
              {/* 시안 원본은 이 카드군만 #808080을 쓰지만, 프로젝트 회색 하한선(#767676 이상 —
                  ServiceLandingPage.jsx 선례)을 지키기 위해 더 진한 톤으로 대체했다. */}
              <p className="mt-3 break-keep text-[1rem] font-medium leading-[1.3125] text-[#767676] md:mt-5">
                {card.desc}
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
    <section className="bg-white pt-16 sm:pt-20 md:pt-[15rem]">
      <div className="mx-auto w-full max-w-content px-5 sm:px-8">
        <h2 className={SECTION_HEADING_CLASS}>목표관리로 달라지는 것들</h2>

        <div className="mt-8 grid grid-cols-2 gap-6 rounded-xl border border-[#D7D7D7] bg-[#FBFAFA] px-6 py-8 sm:mt-10 md:mt-[2.25rem] sm:grid-cols-5 sm:gap-0 sm:divide-x sm:divide-[#D7D7D7] sm:px-4 md:h-[10.625rem] md:px-0 md:py-0 md:items-center">
          {OUTCOME_ITEMS.map((item) => (
            <div
              key={item.label}
              className="flex flex-col items-center gap-3 px-4 py-2 text-center md:my-[0.9375rem] md:h-[8.75rem] md:justify-center md:py-0"
            >
              <img
                src={item.icon}
                alt=""
                aria-hidden="true"
                className="h-12 w-12 sm:h-14 sm:w-14 md:h-20 md:w-20"
              />
              <p className="text-[1.125rem] font-medium leading-[1.3] text-[#0F172A] md:text-[1.25rem] md:text-[#525252]">
                {item.label}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function PhoneReportSection() {
  const chipLayerRef = useRef(null);
  const [chipsInView, setChipsInView] = useState(false);

  // 이 섹션도 스크롤 상당히 아래(md:pt-[16.125rem])라 뷰포트에 들어와 있는 동안만
  // 애니메이션을 돌린다(FreeDiagnosisLanding MacbookMockup과 동일 훅 구조).
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
    <section className="overflow-x-clip bg-white pt-16 sm:pt-20 md:pt-[16.125rem]">
      <div className="mx-auto w-full max-w-content px-5 sm:px-8">
        <div className="flex flex-col items-center gap-10 lg:flex-row lg:items-center lg:justify-between lg:gap-16">
          <div className="max-w-[26rem] text-center lg:text-left">
            <h2 className={SECTION_HEADING_CLASS}>
              아이의 일주일 목표 관리를
              <br />
              확인 할 수 있어요
            </h2>
            <p className="mt-4 break-keep text-[1.25rem] font-medium leading-[1.6] text-[#525252]">
              매주 정리된 리포트가 카카오톡 알림톡으로 도착하고, 달성률부터 학습시간까지 한눈에
              확인할 수 있어요.
            </p>
          </div>

          <div className="relative mx-auto w-full max-w-[20rem] shrink-0 lg:mx-0">
            {/* 부유 모션 — src/index.css를 건드릴 수 없어 컴포넌트 로컬 <style>로 정의한다
                (FreeDiagnosisLanding MacbookMockup 선례). prefers-reduced-motion: no-preference
                **opt-in**이라 쿼리 미지원 브라우저에서는 정지가 기본값. */}
            <style>{`
              @keyframes goal-chip-x {
                from { transform: translateX(calc(var(--gc-x) * -1)); }
                to { transform: translateX(var(--gc-x)); }
              }
              @keyframes goal-chip-y {
                from { transform: translateY(0rem); }
                to { transform: translateY(calc(var(--gc-y) * -1)); }
              }
              @keyframes goal-chip-rot {
                from { transform: rotate(calc(var(--gc-rot) * -1)); }
                to { transform: rotate(var(--gc-rot)); }
              }
              @media (prefers-reduced-motion: no-preference) {
                .goal-chip-x[data-float='on'],
                .goal-chip-y[data-float='on'],
                .goal-chip-rot[data-float='on'] {
                  animation-timing-function: ease-in-out;
                  animation-iteration-count: infinite;
                  animation-direction: alternate;
                  will-change: transform;
                }
                .goal-chip-x[data-float='on'] { animation-name: goal-chip-x; }
                .goal-chip-y[data-float='on'] { animation-name: goal-chip-y; }
                .goal-chip-rot[data-float='on'] { animation-name: goal-chip-rot; }
              }
            `}</style>

            <img
              src={phoneReportMockup}
              alt="아이폰 화면 속 카카오톡 알림톡 — 주간 목표관리 리포트 도착 카드, 목표 달성률 84%, 총 학습시간 32시간 10분, 학습 순위 상위 12%"
              className="relative z-0 w-full"
            />

            {/* 플로팅 배지 — lg 미만은 폰 하단에 스택으로(기존 목록 UI 그대로), lg 이상은
                시안(1889:7243) 좌표 기반 절대배치 + 부유 애니메이션 */}
            <div className="mt-6 flex flex-col gap-3 lg:hidden">
              {PHONE_BADGES.map((badge) => (
                <div
                  key={badge.title}
                  className="rounded-2xl bg-white px-5 py-3 text-left shadow-[0_0.5rem_1.5rem_rgba(1,50,98,0.12)]"
                >
                  <p className="text-[1rem] font-semibold leading-[1.4] text-[#013262]">
                    {badge.emoji} {badge.title}
                  </p>
                  <p className="mt-1 break-keep text-[0.8125rem] font-medium leading-[1.5] text-[#013262]/80">
                    {badge.desc}
                  </p>
                </div>
              ))}
            </div>

            <div
              ref={chipLayerRef}
              className="pointer-events-none absolute inset-0 hidden lg:block"
              aria-hidden="true"
            >
              {PHONE_BADGES.map((badge) => {
                const floatState = chipsInView ? 'on' : 'off';
                return (
                  /* 바깥 래퍼 = 위치 전담(left/top/width 절대배치 + 진폭 CSS 변수 주입).
                     변수는 하위로 상속되므로 keyframes 3종은 자식 쪽에서 그대로 var()로 읽는다. */
                  <div
                    key={badge.title}
                    className="absolute"
                    style={{
                      ...badge.style,
                      '--gc-x': badge.x.amplitude,
                      '--gc-y': badge.y.amplitude,
                      '--gc-rot': badge.rot.amplitude
                    }}
                  >
                    <div
                      className="goal-chip-x block w-full"
                      data-float={floatState}
                      style={{ animationDuration: badge.x.duration, animationDelay: badge.x.delay }}
                    >
                      <div
                        className="goal-chip-y block w-full"
                        data-float={floatState}
                        style={{ animationDuration: badge.y.duration, animationDelay: badge.y.delay }}
                      >
                        {/* 회전 요소 = 실제 칩(시안 1889:7243 실측): bg #F1F8FF, radius 40px,
                            padding 20px, shadow accent(#0B84FD) 40% off(0,2) blur20 */}
                        <div
                          className="goal-chip-rot w-full rounded-[2.5rem] bg-[#F1F8FF] p-5 text-left shadow-[0_0.125rem_1.25rem_rgba(11,132,253,0.4)]"
                          data-float={floatState}
                          style={{ animationDuration: badge.rot.duration, animationDelay: badge.rot.delay }}
                        >
                          <p className="text-[1.25rem] font-medium leading-[1.4] text-[#013262]">
                            {badge.emoji} {badge.title}
                          </p>
                          {/* 시안 원본 #808080 → 프로젝트 회색 하한선(#767676 이상 —
                              ManagementSection/StageSection 선례)으로 클램프 */}
                          <p className="mt-[0.625rem] break-keep text-[1rem] font-normal leading-[1.625] text-[#767676]">
                            {badge.desc}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function TestimonialsSection() {
  return (
    <section className="bg-white pt-16 sm:pt-20 md:pt-[13.375rem]">
      <div className="mx-auto w-full max-w-content px-5 text-center sm:px-8">
        <h2 className={SECTION_HEADING_CLASS}>목표관리 서비스를 받아본 학생&학부모 후기</h2>

        <div className="mt-10 grid grid-cols-1 gap-5 sm:mt-12 md:mt-[4.25rem] lg:grid-cols-3">
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
                  😉
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
          className={`h-6 w-6 shrink-0 text-[#525252] transition-transform ${
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
    <section className="bg-white pt-16 sm:pt-20 md:pt-[15.1875rem]">
      <div className="mx-auto w-full max-w-content px-5 sm:px-8">
        <h2 className={SECTION_HEADING_CLASS}>자주 묻는 질문</h2>

        <div className="mt-8 sm:mt-10 md:mt-[3.75rem]">
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
  if (!GOAL_PRODUCTS.length) return null;

  return (
    <section className="bg-white pb-20 pt-16 sm:pb-24 sm:pt-20 md:pb-[6.875rem] md:pt-[15.1875rem]">
      <div className="mx-auto w-full max-w-content px-5 text-center sm:px-8">
        <h2 className={SECTION_HEADING_CLASS}>목표관리 이용권 구매하기</h2>

        <div className="mt-10 overflow-hidden rounded-2xl border border-[#E5E7EB] text-left sm:mt-12 md:mt-[4.1875rem]">
          {GOAL_PRODUCTS.map((product) => {
            const hasDiscount = product.listPrice > product.price;
            return (
              <div
                key={product.id}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E5E7EB] px-6 py-6 last:border-b-0 sm:px-8"
              >
                <span className="flex items-center gap-3">
                  <CheckCircle2 className="h-6 w-6 shrink-0 text-[#013262]" aria-hidden="true" />
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
                    <span className="text-[0.875rem] font-bold text-accent">{product.badge}</span>
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

        <Link
          to="/pricing"
          className="mt-8 inline-flex h-14 items-center justify-center rounded-xl bg-[#013262] px-8 text-[1.25rem] font-semibold text-white transition hover:bg-[#012347] md:mt-[3.75rem]"
        >
          이용권 구매하기
        </Link>
      </div>
    </section>
  );
}

export default function GoalManagement() {
  return (
    <main className="min-h-screen bg-white pt-16">
      <HeroSection />
      <ProcessSection />
      <StageSection />
      <AudienceSection />
      <ManagementSection />
      <OutcomesSection />
      <PhoneReportSection />
      <TestimonialsSection />
      <FaqSection />
      <PricingSection />
    </main>
  );
}
