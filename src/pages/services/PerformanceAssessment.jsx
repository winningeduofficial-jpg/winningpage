import { Fragment, useEffect, useRef, useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { openPaidServiceOrAlert } from '../../lib/paidServiceAccess';
import { formatKRW } from '../../data/pricingCatalog';
import { useProducts } from '../../lib/products';

import heroAura from '../../assets/services/performance/hero-aura.svg';
import heroGrain from '../../assets/renewal/landing/hero-grain.png';
import coachBinoculars from '../../assets/services/performance/coach-binoculars.png';
import coachSisyphus from '../../assets/services/performance/coach-sisyphus.png';
import coachLightbulb from '../../assets/services/performance/coach-lightbulb.png';
import coachLaptopChair from '../../assets/services/performance/coach-laptop-chair.png';
import coachSummitHiking from '../../assets/services/performance/coach-summit-hiking.png';
import coachTablet from '../../assets/services/performance/coach-tablet.png';
import coachWriting from '../../assets/services/performance/coach-writing.png';
import coachTreadmill from '../../assets/services/performance/coach-treadmill.png';
import coachEmail from '../../assets/services/performance/coach-email.png';
import coachRockingChair from '../../assets/services/performance/coach-rocking-chair.png';
import coachLaptopWork from '../../assets/services/performance/coach-laptop-work.png';
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
// 가격/CTA 연동(Supabase products 테이블 'suhaeng' 서비스 조회, openPaidServiceOrAlert)은
// 공용 로직 그대로 재사용한다. 가격의 유일한 신뢰 소스는 Supabase이며 프론트 폴백은 없다.

const HERO_SERVICE = { name: 'AI 수행평가 서비스', to: '/pricing' };

// 컨테이너 폭 및 배율 — Figma 시안의 디자인 콘텐츠 컬럼은 섹션 공통 1436px이고, 우리
// 컨테이너(max-w-content, 좌우 패딩 안쪽 실폭)는 1100px이다. 배율 = 1100 ÷ 1436 ≈ 0.766.
//
// [배율 적용 범위 — 전면 재환산, 사용자 결정] 이 배율은 치수(카드・박스 폭/높이, 이미지
// 박스, 아이콘, 버튼, 배지, cornerRadius, 내부 패딩)・폰트・섹션 "내부" 여백(헤딩→콘텐츠 gap,
// 요소 간 gap 등) 전부에 적용한다. 폰트는 round(시안값 × 0.766)에 최소 13px 하한을 둔다.
// 예외 둘: ① 각 <section> 태그의 padding-top/bottom(섹션 간 갭)은 아래 "섹션 간 갭 정책"이
// 별도로 정하므로 이번 배율 적용 대상이 아니다. ② HeroSection은 목표관리
// (GoalManagement.jsx)・무료진단(FreeDiagnosisLanding.jsx)과 규격을 통일한 3페이지 공통
// 스펙이라 제외한다(HeroSection 내부 주석 참고). 테두리 두께 1px은 시각적 선명도를 위해
// 환산하지 않고 그대로 유지한다.
//
// [재측정 경위 — 과거 배율 1.0 판단 정정] 이전 작업은 "시안 콘텐츠 폭"을 텍스트 레이어
// 기준으로 측정해(auto-layout stretch로 부모 컨테이너 폭까지 늘어나 렌더되는 특성 때문에
// 실제보다 넓게 측정됨) 카드/박스 실폭이 이미 1100px에 근접한다고 보고 치수・폰트는 배율
// 1.0(시안값 그대로), 여백만 부분 환산했다. 그러나 시안의 진짜 콘텐츠 컬럼은 1436px로 우리
// 컬럼(1100px)보다 훨씬 넓어, 시안값을 그대로 넣은 요소가 좁은 컬럼 안에서 상대적으로 과대해
// 보이는 문제가 실사용에서 확인됐다(예: 코칭 이미지박스 353px = 시안 컬럼의 24.6%인데 우리
// 컬럼에선 32%). 아래는 그 과거 판단의 기록(카드 합 실폭 기준 배율)이며 더 이상 유효하지
// 않다 — 지금은 위 0.766 배율로 전면 재확정했다:
//   히어로               카드/목업 실폭 1099px → 배율 1.000(그대로 유지 — 위 제외 사유 ②)
//   완성까지의 흐름       카드 4장 합 실폭 1180px → (과거) 배율 0.932
//   네 가지 영역으로 코칭  카드 3장 합 실폭 1100px → (과거) 배율 1.000
//   이런 학생에게 추천     카드 4장 합 실폭 1097px → (과거) 배율 1.003
//   네 단계로 차근차근     카드 4장 합 실폭 1100px → (과거) 배율 1.000
// ── 섹션 간 갭 정책(사용자 결정, 이번 재환산과 무관하게 유지) ──────────────────
// 인접한 두 섹션의 배경색이 같으면 시안 갭을 ×0.67로 축소하고, 배경색이 바뀌면 시안 갭을
// 그대로 유지한다. 이유: 배경에 경계선이 생기면(색이 바뀌면) 그 갭이 위/아래 두 덩어리로
// 나뉘어 읽히지만, 경계선이 없으면(색이 같으면) 같은 px라도 통짜 빈 공간으로 읽혀 실제
// 시안보다 훨씬 넓어 보이기 때문이다.
//
// 경계별 적용(md 기준, "관계"는 앞 섹션 배경→뒤 섹션 배경):
//   ProcessSection pt        173→157px   흰→흰(축소)
//   CoachingSection pt       223→149px   흰→흰(축소)
//   CoachingSection pb       181px 유지  흰→틴트(경계, 시안 유지)
//   AudienceSection pt       120px 유지  흰→틴트(경계, 시안 유지)
//   StageSummarySection pt   243→163px   틴트→틴트(축소)
//   StageSummarySection pb   120px 유지  틴트→흰(경계, 시안 유지)
//   OutcomesSection pt       100→120px   틴트→흰(경계, 시안 유지)
//   TestimonialsSection pt   100→160px   흰→흰(축소)
//   FaqSection pt            100→172px   흰→흰(축소)
//   PricingSection pt        100→147px   흰→흰(축소)
//
// 이 저장소의 "하단 여백은 다음 섹션 pt가 담당" 컨벤션은 배경색이 같을 때만 성립한다.
// 배경이 바뀌는 경계에서는 앞 섹션이 자신의 pb를 직접 가져야 색 경계가 정확한 위치에
// 생긴다(CoachingSection pb, StageSummarySection pb 참고 — 둘 다 뒤 섹션 배경이 바뀌는
// 경계라 예외적으로 pb를 직접 갖는다).
// 헤딩 폰트 — 시안 실측 fs32(2393:12299 등)를 배율 0.766 매핑표(32→24)로 환산해 md 이상
// 1.5rem(24px)으로 고정한다. lg 오버라이드는 제거했다 — 컨테이너가 max-w-content(1100px 안쪽
// 실폭)로 고정돼 lg 이상에서도 폭이 늘지 않으므로 헤딩이 더 커질 이유가 없다. sm:는 저장소
// generic 값(1.75rem)을 그대로 유지한다(전역 규칙 6 — 모바일/sm 값은 미환산).
// 이 상수는 파일 전용(다른 페이지가 import하지 않음 — 각 서비스 랜딩이 동일 이름으로 자체
// 정의를 갖는 구조라 정의 변경이 이 파일에만 영향을 준다, grep 확인 완료)이라 직접 수정했다.
const SECTION_HEADING_CLASS =
  'break-keep text-[1.5rem] font-semibold leading-[1.4] tracking-[-0.02em] text-[#0F172A] sm:text-[1.75rem] md:text-[1.5rem]';

// 브랜드 남색 — 시안 실측값은 #013162이지만 dev 정본 토큰은 #013262(한 자리 차이, 스펙 §3).
// "코드가 정본" 원칙에 따라 dev 토큰으로 통일한다.
const BRAND_NAVY = '#013262';

// desc는 시안(2393:12092) 원문 그대로 자동 줄바꿈이 아니라 "명시적 개행"이다(카드 콘텐츠
// 프레임이 고정 크기라 자동 wrap이 시안과 다르게 3줄로 깨진다 — 아래 ProcessSection 주석
// 참고). 배열의 각 원소가 한 줄이며 렌더에서 <br />로 잇는다.
const PROCESS_STEPS = [
  {
    step: 'STEP 1',
    title: '요청 내용 입력',
    desc: ['과목・유형, 주제 범위, 요구사항을', '학생이 직접 입력합니다.']
  },
  {
    step: 'STEP 2',
    // '・' 뒤 공백은 시안(2393:12092) 원문 그대로다.
    title: '주제・ 자료 방향 제안',
    desc: ['학생별 탐구 주제와', '자료 수집 방향을 제안합니다.']
  },
  {
    step: 'STEP 3',
    title: '구성 설계 리포트',
    desc: ['탐구 흐름・목차구성 설계를', '리포트로 제공합니다.']
  },
  {
    step: 'STEP 4',
    title: '결과 점검・피드백',
    desc: ['학생이 작성한 결과물의', '점검 포인트를 확인합니다.']
  }
];

// 탭 4개(주제 추천/자료 방향/구성 설계 리포트/결과 리포트) — 시안 실 배치 노드(2393:12141,
// 1920×741, "네 가지 영역으로 코칭합니다")를 레이아웃 정본으로 구현했다. 탭·카드 콘텐츠
// 자체는 별도 노드(콘텐츠 출처 2159:915 자료방향・2159:998 구성설계・2159:1034 결과리포트)의
// 텍스트/일러스트를 그대로 가져왔다 — 그 노드는 헤딩 fs44・카드 폭 453인 다른 레이아웃이라
// "콘텐츠만 인용, 레이아웃은 2393:12141 기준"(코드가 정본 원칙과 동일하게 시안 다수결 대신
// 페이지 조립본을 우선) 원칙으로 분리했다. GoalManagement.jsx StageSection과 동일하게
// useState 기반 인터랙티브 탭 + 탭당 카드 3장 구조로 구현한다.
const COACHING_TABS = ['주제 추천', '자료 방향', '구성 설계 리포트', '결과 리포트'];

const COACHING_CONTENT = {
  '주제 추천': [
    {
      icon: coachBinoculars,
      title: '관심 분야・유형별 주제 제안',
      desc: '과목과 관심사에 맞는 탐구 주제 후보를 제안합니다.'
    },
    {
      icon: coachSisyphus,
      title: '탐구 가치 있는 방향 제시',
      desc: '단순 조사에 그치지 않는 탐구형 주제 방향을 안내합니다.'
    },
    {
      // 360×360 고해상도판(coach-lightbulb-alt)을 coach-lightbulb.png 이름으로 배치해
      // 탭1・탭3 양쪽에서 재사용한다 — 같은 일러스트의 260×260 저해상도판은 배치하지 않았다.
      icon: coachLightbulb,
      title: '차별화 포인트 안내',
      desc: '흔한 주제를 나만의 관점으로 좁히는 포인트를 짚어줍니다.'
    }
  ],
  '자료 방향': [
    {
      icon: coachLaptopChair,
      title: '신뢰할 수 있는 자료 추천',
      desc: '검증된 출처 중심으로 참고 자료 방향을 안내합니다.'
    },
    {
      icon: coachSummitHiking,
      title: '자료 수집 방향 안내',
      desc: '어디서 무엇을 찾을지 수집 전략을 제시합니다.'
    },
    {
      icon: coachTablet,
      title: '자료 분석 방향 제시',
      desc: '수집한 자료를 어떻게 해석할지 분석 관점을 제안합니다.'
    }
  ],
  '구성 설계 리포트': [
    {
      icon: coachWriting,
      title: '논리적 탐구 흐름 설계',
      desc: '가설 → 검증 → 해석 → 한계의 탐구 흐름을 설계합니다.'
    },
    {
      icon: coachTreadmill,
      title: '목차・세부 구성 제안',
      desc: '보고서 목차와 문단 구성을 제안합니다.'
    },
    {
      icon: coachLightbulb,
      title: '핵심 포인트 정리',
      desc: '담아야 할 핵심 요소를 정리해 방향을 잡아줍니다.'
    }
  ],
  '결과 리포트': [
    {
      icon: coachEmail,
      title: '결과 점검・피드백',
      desc: '학생이 작성한 결과물을 점검하고 피드백합니다.'
    },
    {
      icon: coachRockingChair,
      title: '보완 포인트 안내',
      desc: '부족한 부분과 보완 방향을 구체적으로 안내합니다.'
    },
    {
      icon: coachLaptopWork,
      title: '제출 전 완성도 점검',
      desc: '제출 전 마지막 완성도 체크리스트를 제공합니다.'
    }
  ]
};

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

// 답변 콘텐츠 — 시안 상세(2161:9743, 1920×1002, 전부 펼친 상태)에 실제 답변 텍스트가
// 존재해 그 정본으로 전량 교체했다(이전 버전은 답변 레이어가 트리에 없어 구
// serviceLandingContent.js의 수행평가 FAQ 답변을 가져다 썼던 것 — 이제는 신규 작성 아니라
// 시안 인용). 질문 4개는 기존 그대로 유지(시안과 일치 확인됨).
// 1번 답변: 시안(2161:9743) 원문에 "탐구・보고서형 대해"처럼 조사가 누락돼 있어
// "과제에 대해"로 보정했다.
const FAQ_ITEMS = [
  {
    q: '어떤 과목의 수행평가도 도움을 받을 수 있나요?',
    a: '인문・사회・과학・예체능 등 대부분 과목의 탐구・보고서형 과제에 대해 주제・자료・구성 방향을 안내합니다.'
  },
  {
    q: '이용 절차와 소요 시간은 어떻게 되나요?',
    a: '요청 내용 입력 → 방향 제안 → 구성 설계 리포트 → 결과 점검 순으로 진행되며, 과제 범위에 따라 소요 시간이 달라집니다.'
  },
  {
    q: '제시된 내용을 그대로 제출해도 되나요?',
    a: '아니요. 위닝 수행평가는 주제・자료・구성 방향을 제안하는 코칭 서비스이며, 실제 탐구와 작성은 학생 본인이 수행하는 것을 원칙으로 합니다. 제안 내용을 그대로 옮겨 제출하는 것은 학교 규정 및 학문적 정직성에 어긋날 수 있어 권장하지 않습니다.'
  },
  {
    q: '개인 정보와 결과물은 안전하게 관리되나요?',
    a: '수집 정보는 개인정보처리방침에 따라 목적 범위 내에서만 이용・보관하며, 학생・학부모 동의 절차를 따릅니다.'
  }
];

function HeroSection() {
  const auraRef = useRef(null);
  const [auraInView, setAuraInView] = useState(false);

  // 히어로를 벗어나 스크롤하면 30초 회전을 멈춘다 — SVG 리페인트 비용 절감
  // (GoalManagement.jsx / FreeDiagnosisLanding.jsx HeroSection과 동일 훅 구조).
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
    <section className="relative overflow-hidden bg-white pb-14 pt-10 sm:pb-16 sm:pt-14 md:pb-0 md:pt-[2.25rem]">
      {/* 섹션 패딩(md:pb-0 md:pt-[2.25rem])은 목표관리(GoalManagement.jsx)/무료진단
          (FreeDiagnosisLanding.jsx) 히어로와 동일 규격으로 통일했다(사용자 지시 — 1600px
          실측 대조 결과 두 페이지가 이미 공통 규격을 이루고 있어 그 규격을 정본으로 삼는다).
          시안(2393:12079)이 이 값과 어긋나도 코드가 정본이라는 프로젝트 원칙을 따른다. */}
      {/* 시안(2393:12079)의 `Gradient` 그룹 851×869 @ (375,166)이 4프레임(2716:2003→2069→2135→2201)
          에서 0°/−90°/−180°/+90°로 회전하는 프로토타입이다 — 자식(Eclipse/Planet)은 4프레임 전부
          transform 동일(자체 모션 없음), 피벗은 전부 (800,600) = 1600×1200 좌표계의 중심으로 일치한다.
          즉 프레임 간 유일한 변화는 그룹 전체 회전각뿐이므로 rotate(0→360deg) 무한 반복 하나로 완전히
          대체된다. 시안 주기는 4×3000ms=12초지만, 목표관리(GoalManagement.jsx)·무료진단
          (FreeDiagnosisLanding.jsx) 히어로에서 회전은 전정계 자극 등급이 높은 모션이라 앰비언트
          배경 애니메이션 권장 구간(8~20s)보다도 느린 30초를 채택한 선례가 있어, 3개 서비스 랜딩 간
          모션 리듬 일관성을 위해 이 페이지도 동일하게 30s로 통일한다.

          레이어 구조는 FreeDiagnosisLanding.jsx HeroSection(위치/회전 분리)과 동일하게 따른다 —
          같은 요소에 위치용 translate와 회전용 rotate를 같이 걸면 rotate가 translate를 덮어써
          이미지가 밀려나기 때문에 위치 전담 div와 회전 전담 div를 분리한다.

          바깥 div(auraRef) = 위치 전담. w-[100rem](1600px)과 top-0은 시안 내부 프레임(1600×875)
          좌상단에 Gradient 그룹을 담는 1600×1200 텍스처 프레임이 붙는 배치에 대응하며,
          aspect-[4/3]로 그 프레임의 세로(1200px)를 고정한다.

          안쪽 .perf-aura-spin = 회전 전담이자 실제 정사각(1600×1600) SVG 배치. 위치 래퍼 폭을 w라
          하면 aspect-[4/3]인 래퍼의 높이는 0.75w, 안쪽 정사각(w-full, aspect-square)의 높이는 w다.
          세로로 중심 정렬하려면 위아래 여백이 각각 (0.75w − w)/2 = −0.125w씩 필요하다. CSS의 top%는
          containing block 높이(=래퍼 높이 0.75w) 기준이므로 top% × 0.75w = −0.125w
          → top% = −0.125/0.75 = −16.6667%. SVG 단위로는 −0.125w = 정사각 변 1600 기준 −200, 즉
          위아래로 정확히 200씩(=1600−1200의 절반) 넘친다 — hero-aura.svg의 언클립 뷰박스
          (y −200~1400)와 일치한다. 이렇게 하면 정사각 SVG 중심이 래퍼 중심과 정확히 일치하고, 그
          중심이 곧 SVG 뷰박스 중심(800,600) = Figma 회전 피벗이므로 transform-origin은 기본값
          50% 50% 그대로 두면 된다(별도 선언 금지).

          그레인(아래 별도 div)은 회전 밖(위치 래퍼의 형제)에 둔다 — transform이 걸린 요소는 새
          stacking context를 만들어 mix-blend-overlay가 섹션의 bg-white를 backdrop으로 잡지 못하고
          검정/투명에 합성돼 그레인이 전면 노출되는 회귀가 FreeDiagnosisLanding에서 실제로 있었다. */}
      <div
        ref={auraRef}
        className="pointer-events-none absolute left-1/2 top-0 aspect-[4/3] w-[100rem] max-w-none -translate-x-1/2 select-none"
      >
        <style>{`
          @keyframes perf-aura-spin {
            from { transform: rotate(0deg); }
            to   { transform: rotate(360deg); }
          }
          @media (prefers-reduced-motion: no-preference) {
            .perf-aura-spin[data-float='on'] {
              animation: perf-aura-spin 30s linear infinite;
              will-change: transform;
            }
          }
        `}</style>
        <div
          className="perf-aura-spin absolute left-0 top-[-16.6667%] aspect-square w-full"
          data-float={auraInView ? 'on' : 'off'}
        >
          <img src={heroAura} alt="" aria-hidden="true" draggable="false" className="block w-full" />
        </div>
      </div>
      <div
        aria-hidden="true"
        style={{ backgroundImage: `url(${heroGrain})` }}
        className="pointer-events-none absolute inset-0 select-none bg-[length:8.375rem_8.375rem] bg-repeat opacity-40 mix-blend-overlay"
      />

      <div className="relative z-10 mx-auto flex w-full max-w-content flex-col items-center px-5 text-center sm:px-8">
        {/* eyebrow/h1/서브 문단/CTA 타이포그래피는 목표관리(GoalManagement.jsx) HeroSection
            클래스를 그대로 이식했다(사용자 지시 — 세 히어로 공통 규격 통일). 텍스트 내용만
            수행평가 고유 카피를 유지한다. */}
        <p className="text-[1.25rem] font-normal leading-[1.6] text-accent sm:text-[1.375rem] md:text-[1.5rem]">
          학교 과제부터 보고서까지
        </p>

        {/* max-w는 목표관리의 max-w-[56rem]을 이식하지 않고 생략했다 — 수행평가 헤드라인이
            더 길어 한 줄 유지를 위해 컨테이너(max-w-content) 폭 전체를 그대로 쓴다(스펙 지시:
            "텍스트 내용과 max-w는 수행평가 것을 유지"). */}
        <h1 className="mt-6 break-keep text-[1.75rem] font-semibold leading-[1.3] tracking-[-0.02em] text-[#0F172A] sm:text-[2.25rem] md:text-[2rem]">
          주제 선정부터 구성・점검까지, 수행평가를 함께 완성합니다
        </h1>

        <p className="mt-6 break-keep text-[1.125rem] font-medium leading-[1.6] text-[#525252] sm:text-[1.25rem] md:text-[1.5rem]">
          주제-자료-구성-점검까지, 학생이 스스로 완성하도록 돕는 든든한 파트너입니다.
        </p>

        <button
          type="button"
          onClick={(event) => openPaidServiceOrAlert(event, HERO_SERVICE)}
          className="mt-6 inline-flex h-14 w-full max-w-[18.75rem] items-center justify-center rounded-[1.875rem] bg-[#013262] px-8 text-base font-semibold text-white shadow-[0_0.625rem_1.5625rem_rgba(1,50,98,0.4)] transition hover:bg-[#01498F] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#013262] focus-visible:ring-offset-2 sm:h-[4.25rem] sm:text-[1.25rem]"
        >
          지금 시작하기
        </button>

        {/* 브라우저 목업 — 래퍼/프레임 지오메트리(폭 1068px, radius 5px, 3중 그림자, 상단
            마진 + 하단 음수 마진으로 다음 섹션과 겹치는 처리)는 목표관리(GoalManagement.jsx)
            HeroSection 목업 구조를 그대로 이식했다(사용자 지시 — 세 히어로 공통 규격 통일).
            시안(2393:12091)은 크롬 UI는 벡터로 존재하나 본문 콘텐츠가 완전히 비어있어(스펙
            §2-4) 본문은 계속 빈 배경으로 두되, 크롬 툴바 색상은 수행평가 기존 구현을 유지한다. */}
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
    // 섹션 상단 패딩(md:pt-[9.8125rem]=157px)은 "섹션 간 갭 정책"(파일 상단 주석) 소관이라
    // 이번 배율 재환산 대상이 아니다 — 건드리지 않는다. pb도 두지 않는다(다음 섹션
    // CoachingSection의 pt가 하단 간격을 담당하는 저장소 컨벤션).
    <section className="bg-white pt-16 sm:pt-20 md:pt-[9.8125rem]">
      <div className="mx-auto w-full max-w-content px-5 sm:px-8">
        <h2 className={SECTION_HEADING_CLASS}>위닝 수행평가와 함께하는 완성까지의 흐름</h2>

        {/* 헤딩→카드 gap 시안 실측 60px(2393:12092) × 0.766 ≈ 46px = md:mt-[2.875rem].
            카드 280×178 × 0.766 → 214×136(wide:grid-cols-[repeat(4,13.375rem)],
            wide:h-[8.5rem]), 카드 간 gap 20 × 0.766 ≈ 15px(gap-[0.9375rem]).
            검산: 4×214 + 3×15 = 901 ≤ 1100(컨테이너 실폭) → wide:justify-center로 그리드를
            중앙 정렬한다. wide 미만(모바일~lg)은 저장소 컨벤션대로 고정 폭/높이 없이 콘텐츠에
            맞춰 자유롭게 늘어난다(목표관리 ProcessSection과 동일한 clamp 전략). */}
        <div className="mt-10 grid grid-cols-1 gap-5 sm:mt-12 sm:grid-cols-2 md:mt-[2.875rem] lg:grid-cols-4 wide:grid-cols-[repeat(4,13.375rem)] wide:justify-center">
          {/* 카드: bg #FFFFFF, border 1px #D7D7D7(두께는 환산 제외), radius 20×0.766≈15px
              (rounded-[0.9375rem]), 내부 VERTICAL gap 20×0.766≈15px(gap-[0.9375rem]). 그림자는
              목표관리(GoalManagement.jsx) ProcessSection과 동일 값을 유지한다(치수 카테고리
              밖 — 스펙에서 shadow는 환산 대상으로 명시되지 않았다).

              박스 모델(2393:12092 재실측) — 시안 카드 280×178 안에 콘텐츠 프레임이 상하 22px
              여백으로 "중앙 배치"돼 있다(카드/콘텐츠 폭 차는 음수). 22×0.766≈17px도 py 고정값
              대신 기존과 동일하게 justify-center로 자연히 얻는다(고정 높이가 있는 wide에서만
              유효, wide 미만은 시각적 여유를 위해 py-10 유지 후 wide:py-0으로 해제).
              가로는 카드 폭(214px)과 설명 max-w(199px)를 좌우 패딩 없이(px-0) 맞춘다 — 패딩을
              두면 가용 폭이 좁아져 STEP 1 설명 1줄이 넘쳐 3줄로 깨진다(구 280px 카드 때와 동일
              이유). */}
          {PROCESS_STEPS.map((item) => (
            <div
              key={item.step}
              className="flex flex-col items-center justify-center gap-[0.9375rem] rounded-[0.9375rem] border border-[#D7D7D7] bg-white px-0 py-10 text-center shadow-[0_0.75rem_1.25rem_rgba(215,215,215,0.4)] transition hover:-translate-y-1 hover:shadow-[0_0.75rem_1.5rem_rgba(1,50,98,0.08)] wide:h-[8.5rem] wide:py-0"
            >
              {/* 상단 그룹: VERTICAL gap 4×0.766≈3px(gap-[0.1875rem]). STEP 뱃지는 padding만
                  있고 배경・테두리 없음 — 텍스트 색만 브랜드 남색. 뱃지 패딩 8/12 × 0.766 ≈
                  6/9px(py-[0.375rem] px-[0.5625rem]), cornerRadius 20×0.766≈15px
                  (rounded-[0.9375rem]). 폰트: STEP 16→13(전역 매핑표, 하한), 타이틀 20→15. */}
              <div className="flex flex-col items-center gap-[0.1875rem]">
                <span
                  className="rounded-[0.9375rem] px-[0.5625rem] py-[0.375rem] text-[0.8125rem] font-semibold leading-[1.4]"
                  style={{ color: BRAND_NAVY }}
                >
                  {item.step}
                </span>
                <p className="text-[0.9375rem] font-semibold leading-[1.4] text-[#525252]">{item.title}</p>
              </div>
              {/* 설명 최대 폭 260 × 0.766 ≈ 199px(max-w-[12.4375rem]). 폰트 16→13. 명시적 2줄
                  개행은 유지 — 199px 폭에서 각 줄이 접히지 않는지 확인 완료(검증 섹션 참고). */}
              <p className="mx-auto max-w-[12.4375rem] break-keep text-[0.8125rem] font-medium leading-[1.4] text-[#525252]">
                {item.desc.map((line, index) => (
                  <Fragment key={line}>
                    {index > 0 && <br />}
                    {line}
                  </Fragment>
                ))}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CoachingSection() {
  const [activeTab, setActiveTab] = useState(COACHING_TABS[0]);
  const activeCards = COACHING_CONTENT[activeTab] || [];

  return (
    // 섹션 상단 여백 md:pt-[13.9375rem](223px) 산출 근거 — 시안에서 프로세스 카드 하단(절대 y 1416)과
    // 이 섹션 헤딩 상단(y 1646)의 간격 230px은 두 구간의 합이다: ① ProcessSection 잔여 하단 여백
    // 110px — 이 값은 시안 프로세스 섹션(카드 4장 합 실폭 1180px) 유래이므로 재실측 배율
    // 0.932(=1100÷1180, 파일 상단 컨테이너 폭 주석 참고)를 적용해 110 × 0.932 ≈ 103px. ② 이
    // 섹션(코칭) 자체의 상단 여백 120px — 코칭 섹션은 카드 3장 합 실폭 자체가 1100(우리와 동일)
    // 이라 환산 대상이 아니며 배율 1.0을 그대로 적용해 120px 유지.
    // 따라서 이 섹션의 pt = 103(환산) + 120(비환산) = 223px = 13.9375rem이다.
    // 하단 여백은 예외적으로 이 섹션이 직접 가진다: 다음 AudienceSection의 배경이
    // #F5F5F7(이 섹션은 #FFFFFF)라 "하단 여백은 다음 섹션 pt가 담당" 컨벤션이 깨진다.
    // md:pb-[11.3125rem](181px)는 시안 코칭 섹션(콘텐츠 실폭 1100) 유래값이라 배율 1.0 — 환산하지
    // 않고 시안 실측값 그대로 유지한다. 모바일/태블릿은 저장소 관례상 generic 값을 둔다.
    <section className="bg-white pb-16 pt-16 sm:pb-20 sm:pt-20 md:pb-[11.3125rem] md:pt-[9.3125rem]">
      <div className="mx-auto w-full max-w-content px-5 sm:px-8">
        <h2 className={SECTION_HEADING_CLASS}>네 가지 영역으로 코칭합니다</h2>

        {/* 탭 — GoalManagement.jsx StageSection과 동일한 인터랙티브 탭으로 구현했다(시안
            2393:12141 실측: 항목 간 gap 40px, 세로 구분선 높이 30px, 언더라인・하단 보더
            없음). 헤딩→탭바 gap 40 × 0.766 ≈ 31px(md:mt-[1.9375rem]), 탭 간 gap 40 × 0.766 ≈
            31px(md:gap-[1.9375rem]), 구분선 높이 30 × 0.766 ≈ 23px(h-[1.4375rem]). 폰트:
            탭 24→18(전역 매핑표) — md:text-[1.125rem](모바일 generic 값과 동일해져 사실상
            전 브레이크포인트 균일해졌다). 활성 w600 lh1.4 색 #525252, 비활성 w500 lh1.3
            색 #D9D9D9. */}
        <div
          className="mt-8 flex items-center gap-5 overflow-x-auto sm:mt-10 md:mt-[1.9375rem] md:gap-[1.9375rem]"
          role="tablist"
          aria-label="수행평가 코칭 영역"
        >
          {COACHING_TABS.map((tab, index) => {
            const isActive = tab === activeTab;
            return (
              <Fragment key={tab}>
                <button
                  type="button"
                  role="tab"
                  id={`coaching-tab-${index}`}
                  aria-selected={isActive}
                  aria-controls="coaching-tabpanel"
                  onClick={() => setActiveTab(tab)}
                  className={`shrink-0 whitespace-nowrap text-[1.125rem] md:text-[1.125rem] ${
                    isActive
                      ? 'font-semibold leading-[1.4] text-[#525252]'
                      : 'font-medium leading-[1.3] text-[#D9D9D9]'
                  }`}
                >
                  {tab}
                </button>
                {index < COACHING_TABS.length - 1 && (
                  <span aria-hidden="true" className="h-[1.4375rem] w-px shrink-0 bg-[#D7D7D7]" />
                )}
              </Fragment>
            );
          })}
        </div>

        {/* 카드 — 탭바 하단→카드 gap 55 × 0.766 ≈ 42px(md:mt-[2.625rem]). 이미지 박스
            353×153 × 0.766 → 270×117(wide:grid-cols-[repeat(3,16.875rem)],
            h-[7.3125rem]), radius 12×0.766≈9px(rounded-[0.5625rem]), 카드 간 gap
            20×0.766≈15px(gap-[0.9375rem])는 모든 브레이크포인트에서 동일. 검산: 3×270 + 2×15
            = 840 ≤ 1100(컨테이너 실폭) → wide:justify-center로 중앙 정렬. wide(74rem)
            미만은 ProcessSection과 동일한 clamp 전략으로 고정 폭 없이 유동 처리한다. */}
        <div
          id="coaching-tabpanel"
          role="tabpanel"
          aria-labelledby={`coaching-tab-${COACHING_TABS.indexOf(activeTab)}`}
          // lg 이상에서 패널 높이를 187px(11.6875rem, 244×0.766 실측 최솟값 환산)로 고정 —
          // 탭 전환 시 섹션 전체 높이가 튀는 걸 막기 위한 사용자 지시. "주제 추천" 탭만
          // 3번째 카드 설명이 2줄로 감싸져 더 높아질 수 있으며, 이 초과분은 잘라내지 않고
          // (overflow 유지) 패널 밖으로 자연스럽게 흘러나가게 둔다 — 카드에 배경/테두리가
          // 없고 섹션 하단 여백이 충분해 시각적으로 문제없다.
          // lg 미만은 이 그리드가 grid-cols-1/sm:grid-cols-2로 카드가 여러 줄로 감싸이므로
          // (단일 행이 아니므로) 고정 높이를 걸면 레이아웃이 깨져 lg: 이상에만 적용한다.
          className="mt-8 grid grid-cols-1 gap-5 sm:mt-10 sm:grid-cols-2 md:mt-[2.625rem] lg:h-[11.6875rem] lg:grid-cols-3 wide:grid-cols-[repeat(3,16.875rem)] wide:justify-center"
        >
          {activeCards.map((card) => (
            <div key={`${activeTab}-${card.title}`} className="flex flex-col text-left">
              <div className="flex h-[7.3125rem] items-center justify-center rounded-[0.5625rem] bg-[#F9FAFB]">
                <img
                  src={card.icon}
                  alt=""
                  aria-hidden="true"
                  className="h-[6.375rem] w-[6.375rem] object-contain"
                />
              </div>
              {/* 이미지 박스 하단→제목 gap 21×0.766≈16px(mt-4). 폰트 20→15(text-[0.9375rem])
                  w500 lh1.4 색 #525252 */}
              <p className="mt-4 text-[0.9375rem] font-medium leading-[1.4] text-[#525252]">
                {card.title}
              </p>
              {/* 제목 하단→설명 gap 20×0.766≈15px(mt-[0.9375rem]). 폰트 16→13
                  (text-[0.8125rem]) w400 lh1.4 — 시안 원본 #808080은 프로젝트 회색 하한선
                  (#767676 이상 — GoalManagement StageSection 선례)으로 클램프한다. */}
              <p className="mt-[0.9375rem] break-keep text-[0.8125rem] font-normal leading-[1.4] text-[#767676]">
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
    // 상단 여백 md:pt-[7.5rem](120px) 산출 근거 — 시안(2393:12179) 실측 상단 여백 120px에 이
    // 섹션 카드 4장 합 실폭(1097px) 기준 재실측 배율 1.003(=1100÷1097, 파일 상단 컨테이너 폭
    // 주석 참고)을 적용해 120 × 1.003 ≈ 120px(반올림 시 원값과 동일).
    // 하단 여백은 0 — 다음 StageSummarySection이 별도 섹션으로 분리됐고 두 섹션 배경이
    // 동일(#F5F5F7)이라 "하단 여백은 다음 섹션 pt가 담당" 컨벤션을 그대로 따른다
    // (StageSummarySection 주석 참고, 243px 전액을 그쪽 pt가 가진다).
    <section className="bg-[#F5F5F7] pt-16 sm:pt-20 md:pt-[7.5rem]">
      <div className="mx-auto w-full max-w-content px-5 sm:px-8">
        <h2 className={SECTION_HEADING_CLASS}>이런 학생에게 수행평가를 추천해요</h2>

        {/* 헤딩→카드 gap 93 × 0.766 ≈ 71px(md:mt-[4.4375rem]). 카드 4장 260×354 × 0.766 →
            199×271, bg #FFFFFF, radius 16×0.766≈12px(=rounded-xl, 12px는 Tailwind xl 토큰과
            정확히 일치), 가로 gap 20×0.766≈15px(md:gap-[0.9375rem]). 검산: 4×199+3×15=841 ≤
            1100(컨테이너 실폭) — 더 이상 정확히 꽉 차지 않으므로 ProcessSection/CoachingSection과
            동일한 clamp 전략(wide 이상에서만 고정 폭 그리드 + wide:justify-center로 중앙 정렬)을
            도입했다. wide 미만은 md:grid-cols-4 균등 분할로 유동 처리한다. */}
        <div className="mt-10 grid grid-cols-1 gap-6 sm:mt-12 sm:grid-cols-2 md:mt-[4.4375rem] md:grid-cols-4 md:gap-[0.9375rem] wide:grid-cols-[repeat(4,12.4375rem)] wide:justify-center">
          {AUDIENCE_CARDS.map((item) => (
            <article
              key={item.title}
              className="flex flex-col overflow-hidden rounded-xl bg-white text-left transition hover:-translate-y-1 hover:shadow-[0_1rem_2rem_rgba(82,82,82,0.14)] wide:h-[16.9375rem]"
            >
              {/* 이미지 영역 — 카드 상단 기준 고정 높이 컨테이너. 시안 원본 이미지 4장의 실제
                  표시 높이가 제각각인데 전부 하단선에 정렬돼 있다 — 고정 높이 컨테이너 +
                  object-cover object-bottom으로 하단 기준 크롭해 재현한다. 높이 187×0.766≈
                  143px(md:h-[8.9375rem]). 실제 소스 파일 4장 모두 가로세로비가 컨테이너보다
                  넓어(1.40~1.50) 좌우만 살짝 잘리고 상하 크롭은 거의 없다 — object-bottom은
                  방어적으로 유지. */}
              <div className="h-44 w-full overflow-hidden md:h-[8.9375rem]">
                <img
                  src={item.image}
                  alt={item.title}
                  className="h-full w-full object-cover object-bottom"
                />
              </div>
              {/* 제목 @ 이미지 하단 51×0.766≈39px(md:mt-[2.4375rem]), 카드 좌측에서 26×0.766≈
                  20px 들여쓰기(=pl-5, Tailwind 토큰과 일치). 좌우 패딩은 비대칭이다 — 원본
                  시안도 좌26/우5(각 ×0.766≈20/4)로 비대칭이었다(md:pl-5 md:pr-1). 대칭 처리 시
                  설명 가용폭이 좁아져 줄바꿈이 늘고 카드가 부풀어 오르는 문제가 있었던 선례
                  (구현 이력 참고) — 비대칭을 유지한다. fs20→15(text-[0.9375rem]) w600 lh1.4
                  색 #525252(시안 원본이 #0F172A가 아니라 #525252임에 유의). 설명은 제목 하단
                  25×0.766≈19px(md:mt-[1.1875rem]), fs14→13(md:text-[0.8125rem]) w500 lh1.4
                  동색. 카드 하단 여백 45×0.766≈34px(md:pb-[2.125rem]). 카드 높이는 카드 폭과
                  함께 wide:h-[16.9375rem](271px)로 4장 균일 고정 — wide 미만은 콘텐츠 길이에
                  맞춰 자유롭게 늘어난다(ProcessSection/CoachingSection과 동일 clamp 컨벤션). */}
              <div className="flex flex-1 flex-col px-6 py-6 md:pb-[2.125rem] md:pl-5 md:pr-1 md:pt-[2.4375rem]">
                <p className="text-[0.9375rem] font-semibold leading-[1.4] text-[#525252]">
                  {item.title}
                </p>
                <p className="mt-2 break-keep text-[1rem] font-medium leading-[1.5] text-[#525252] md:mt-[1.1875rem] md:text-[0.8125rem] md:leading-[1.4]">
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

function StageSummarySection() {
  return (
    // 섹션 상단 여백 md:pt-[15.1875rem](243px) — 시안(2393:12209, 1920×531)에서 이 섹션 헤딩
    // 상단(절대 y 3122)과 앞 추천 섹션(AudienceSection) 카드 하단(절대 y 2879)의 간격이
    // 243px이다. 두 섹션 배경이 모두 #F5F5F7라 "하단 여백은 다음 섹션 pt가 담당" 컨벤션을
    // 그대로 따라 AudienceSection의 pb는 0으로 두고 이 섹션이 243px 전액을 pt로 가진다.
    // 이 섹션 콘텐츠(카드 4장 합) 실폭도 1100px로 우리 콘텐츠 폭과 정확히 같아 배율 1.0
    // (환산 불필요, 파일 상단 컨테이너 폭 주석 참고).
    //
    // md:pb-[7.5rem](120px)은 예외적으로 이 섹션이 직접 가진다 — 다음 OutcomesSection의 배경이
    // 흰색(#FFFFFF)으로 바뀌어 "하단 여백은 다음 섹션 pt가 담당" 컨벤션이 성립하지 않기
    // 때문이다(코칭↔추천 경계에서 이미 겪은 것과 동일한 배경-전환 예외 — CoachingSection
    // 주석 참고).
    <section className="bg-[#F5F5F7] pb-16 pt-16 sm:pb-20 sm:pt-20 md:pb-[7.5rem] md:pt-[10.1875rem]">
      <div className="mx-auto w-full max-w-content px-5 sm:px-8">
        {/* 이 섹션만 헤딩이 가운데 정렬이다(시안 실측 — 다른 섹션은 전부 좌측 정렬이며
            SECTION_HEADING_CLASS 자체엔 정렬을 넣지 않으므로 이 섹션에서만 text-center를
            덧붙인다). */}
        <h2 className={`${SECTION_HEADING_CLASS} text-center`}>네 단계로 차근차근</h2>

        {/* 헤딩→카드 gap 87 × 0.766 ≈ 67px(md:mt-[4.1875rem]). 카드 4장 260×159 × 0.766 →
            199×122, radius 12×0.766≈9px(rounded-[0.5625rem]), 가로 gap 20×0.766≈15px
            (md:gap-[0.9375rem]). 4×199+3×15=841 ≤ 1100(컨테이너 실폭) → 더 이상 정확히 꽉
            차지 않으므로 ProcessSection/CoachingSection/AudienceSection과 동일한 clamp
            전략(wide 이상 고정 폭 그리드 + wide:justify-center)을 적용한다. */}
        <div className="mt-10 grid grid-cols-1 gap-5 sm:mt-12 sm:grid-cols-2 md:mt-[4.1875rem] md:grid-cols-4 md:gap-[0.9375rem] wide:grid-cols-[repeat(4,12.4375rem)] wide:justify-center">
          {STAGE_SUMMARY_CARDS.map((card) => (
            <div
              key={card.title}
              className="rounded-[0.5625rem] bg-white px-6 py-7 text-left wide:h-[7.625rem] md:px-0 md:py-0 md:pt-[0.875rem]"
            >
              {/* 제목 상단 오프셋 18×0.766≈14px(md:pt-[0.875rem], 위 컨테이너), 좌측 들여쓰기
                  20×0.766≈15px(md:pl-[0.9375rem]). 폰트 24→18(md:text-[1.125rem]) w600
                  lh1.4 색 #191D23. */}
              <p className="text-[1.25rem] font-semibold leading-[1.4] text-[#0F172A] md:pl-[0.9375rem] md:text-[1.125rem] md:text-[#191D23]">
                {card.title}
              </p>
              {/* 설명 상단 오프셋 72×0.766≈55px — 제목 오프셋(14) + 제목 렌더 높이(fs18×lh1.4≈
                  25px) + gap(20×0.766≈15px, md:mt-[0.9375rem]) ≈ 54px로 근사한다. 폰트
                  16→13(md:text-[0.8125rem]) w500 lh1.4, 폭 225×0.766≈172px
                  (md:max-w-[10.75rem]), 좌측 들여쓰기 17×0.766≈13px(md:pl-[0.8125rem]). 시안
                  원본 색 #808080은 프로젝트 회색 하한선(#767676 이상 — GoalManagement
                  StageSection 선례)으로 클램프한다. 첫 카드 설명만 3줄이고 나머지는 2줄 —
                  172px 폭에서 3줄로 감싸지는지, 카드 높이 122px을 넘지 않는지 검증 완료(파일
                  하단 검증 섹션 참고). */}
              <p className="mt-3 break-keep text-[1rem] font-medium leading-[1.5] text-[#767676] md:mt-[0.9375rem] md:max-w-[10.75rem] md:pl-[0.8125rem] md:text-[0.8125rem] md:leading-[1.4]">
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
    // md:pt-[7.5rem](120px)은 틴트→흰 배경 전환 경계라 시안 값을 그대로 유지한다(위 섹션 간
    // 갭 정책 주석 참고). 이 섹션 pt/pb는 건드리지 않는다.
    <section className="bg-white pt-16 sm:pt-20 md:pt-[7.5rem]">
      <div className="mx-auto w-full max-w-content px-5 sm:px-8">
        <h2 className={SECTION_HEADING_CLASS}>수행평가로 서비스로 달라지는 것들</h2>

        {/* 헤딩→박스 gap 60 × 0.766 ≈ 46px(md:mt-[2.875rem]). 바깥 박스 높이 224 × 0.766 ≈
            172px(md:h-[10.75rem]), 배경 #F9FAFB, 테두리 1px #D9D9D9(환산 제외), radius
            12×0.766≈9px(rounded-[0.5625rem]). 내부 상하 패딩(칸 my로 구현) 29×0.766≈22px
            (md:my-[1.375rem]), 칸 높이 172−22×2=128px(md:h-[8rem]). 4칸 구분선 #D7D7D7,
            아이콘 100×0.766≈77px(md:h-[4.8125rem] md:w-[4.8125rem]), 아이콘→라벨 gap
            20×0.766≈15px(md:gap-[0.9375rem]). 폰트: 라벨 24→18(md:text-[1.125rem]) —
            GoalManagement.jsx OutcomesSection과 동일 형태(1박스+세로 구분선 4칸, 박스
            py-0 + 칸 my로 내부 높이 확보)로 정합. */}
        <div className="mt-8 grid grid-cols-2 gap-6 rounded-[0.5625rem] border border-[#D9D9D9] bg-[#F9FAFB] px-6 py-8 sm:mt-10 md:mt-[2.875rem] sm:grid-cols-4 sm:gap-0 sm:divide-x sm:divide-[#D7D7D7] sm:px-4 md:h-[10.75rem] md:px-0 md:py-0 md:items-center">
          {OUTCOME_ITEMS.map((item) => (
            <div
              key={item.label}
              className="flex flex-col items-center gap-3 px-4 py-2 text-center md:my-[1.375rem] md:h-[8rem] md:justify-center md:gap-[0.9375rem] md:py-0"
            >
              <img
                src={item.icon}
                alt=""
                aria-hidden="true"
                className="h-12 w-12 sm:h-14 sm:w-14 md:h-[4.8125rem] md:w-[4.8125rem]"
              />
              <p className="text-[1.125rem] font-medium leading-[1.4] text-[#0F172A] md:text-[1.125rem] md:font-semibold md:leading-[1.4] md:text-[#525252]">
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
    <section className="bg-white pt-16 sm:pt-20 md:pt-[10rem]">
      <div className="mx-auto w-full max-w-content px-5 sm:px-8">
        <h2 className={SECTION_HEADING_CLASS}>수행평가 서비스를 받아본 학생들의 후기</h2>

        {/* 헤딩→카드 gap 77 × 0.766 ≈ 59px(md:mt-[3.6875rem], 기존값과 일치해 변경 없음).
            카드 폭 688×0.766≈527px, gap 62×0.766≈47px, radius 40×0.766≈31px
            (rounded-[1.9375rem]). 검산: 2×527+47=1101 ≈ 1100(컨테이너 실폭) → 컨테이너를
            거의 꽉 채운다. 카드 폭 고정(wide:grid-cols-[repeat(2,32.9375rem)])은
            ProcessSection 등과 동일하게 wide(74rem) 이상에서만 적용 — 그 미만 뷰포트에서는
            컨테이너 실폭이 1101px보다 좁아질 수 있어 고정 폭을 걸면 넘치므로, wide 미만은
            md:grid-cols-2로 폭을 자연 분배한다. gap은 폭 고정 여부와 무관하게 md 이상 항상
            47px(md:gap-[2.9375rem]). */}
        <div className="mt-10 grid grid-cols-1 gap-5 sm:mt-12 md:mt-[3.6875rem] md:grid-cols-2 md:gap-[2.9375rem] wide:grid-cols-[repeat(2,32.9375rem)] wide:justify-center">
          {TESTIMONIALS.map((item) => (
            // 카드 bg #F9FAFB・radius 40×0.766≈31px(rounded-[1.9375rem])・DROP_SHADOW
            // offset(0,2) blur4 rgba(213,213,213,.25)(치수 카테고리 밖 — 환산 대상 아님).
            // 상하 패딩 56×0.766≈43px(md:py-[2.6875rem], 기존값과 일치), 좌우 패딩
            // 40×0.766≈31px(md:px-[1.9375rem]). 높이는 고정하지 않는다 — 그리드 기본
            // align-items:stretch로 두 카드 높이를 맞춘다.
            <figure
              key={item.quote}
              className="flex flex-col rounded-[1.9375rem] bg-[#F9FAFB] p-7 text-left shadow-[0_0.125rem_0.25rem_rgba(213,213,213,0.25)] md:px-[1.9375rem] md:py-[2.6875rem]"
            >
              {/* 헤더 행(이모지+이름) — 인용문보다 위. 이모지 40→31(md:text-[1.9375rem],
                  leading 52×0.766≈40px=md:leading-[2.5rem]), 이모지→이름 gap
                  12×0.766≈9px(md:gap-[0.5625rem], 기존값과 일치). 이름은 시안에서 "고2 김OO"
                  개행 "인문계열" 두 줄(name/tag를 <br />로 렌더), 폰트 18→14
                  (md:text-[0.875rem]), 시안색 #808080은 회색 하한 규칙에 따라 #767676으로
                  클램프. */}
              <figcaption className="flex items-center gap-3 md:gap-[0.5625rem]">
                <span
                  aria-hidden="true"
                  className="text-[1.75rem] leading-none md:text-[1.9375rem] md:leading-[2.5rem]"
                >
                  {item.emoji}
                </span>
                <span className="text-[0.9375rem] font-medium leading-[1.4] text-[#767676] md:text-[0.875rem] md:leading-[1.4]">
                  {item.name}
                  <br />
                  {item.tag}
                </span>
              </figcaption>

              {/* 헤더→인용문 gap 20×0.766≈15px(md:mt-[0.9375rem], 기존값과 일치). 폰트
                  22→17(md:text-[1.0625rem]), 색 #525252. 시안 원문의 큰따옴표(" ")를
                  렌더에서 붙인다. */}
              <blockquote className="mt-6 break-keep text-[1.25rem] font-normal leading-[1.5] text-[#525252] md:mt-[0.9375rem] md:text-[1.0625rem] md:leading-[1.4]">
                “{item.quote}”
              </blockquote>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

function FaqItem({ item, isOpen, onToggle }) {
  return (
    // 항목 간 수직 간격(질문↔구분선↔다음 질문, 펼쳤을 때 질문↔답변)이 시안에서 전부
    // 32px로 균일하다(2161:9743 상세, 2393:12299 레이아웃 대조) → round(32×0.766)=25px
    // (1.5625rem, 폰트 매핑표 32→24와 달리 일반 치수는 반올림을 그대로 쓴다). py-[1.5625rem]
    // 상하 패딩 하나로 이 두 간격을 동시에 만족한다: 질문 바닥→구분선 25px, 구분선→다음
    // 질문 25px. 구분선 1px #D7D7D7(환산 제외), 마지막 항목 뒤에는 구분선이 없다(시안 확인)
    // → last:border-b-0.
    <div className="border-b border-[#D7D7D7] py-6 last:border-b-0 md:py-[1.5625rem]">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between gap-4 text-left"
      >
        {/* 질문 행 높이 40×0.766≈31px은 fs18 텍스트와 18×18 아이콘을 items-center로 정렬한
            자연스러운 결과라 별도 고정 높이를 걸지 않는다. 폰트 24→18(sm:text-[1.125rem],
            모바일 generic 값과 동일해져 사실상 전 브레이크포인트 균일해졌다) w500 #525252
            좌측 정렬. */}
        <span className="break-keep text-[1.125rem] font-medium text-[#525252] sm:text-[1.125rem]">
          {item.q}
        </span>
        {/* 셰브론 24×0.766≈18px(h-[1.125rem] w-[1.125rem]), 시안 원본 #808080은 회색 하한
            규칙에 따라 #767676으로 클램프. */}
        <ChevronDown
          className={`h-[1.125rem] w-[1.125rem] shrink-0 text-[#767676] transition-transform ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>
      {isOpen && (
        // 질문→답변 gap 32×0.766≈25px(md:mt-[1.5625rem]). 폰트 24→18(md:text-[1.125rem])
        // w400, 시안 원본 #808080은 회색 하한 규칙으로 #767676 클램프. 좌측 정렬.
        <p className="mt-4 break-keep text-[1rem] font-normal leading-[1.6] text-[#767676] md:mt-[1.5625rem] md:text-[1.125rem]">
          {item.a}
        </p>
      )}
    </div>
  );
}

function FaqSection() {
  const [openIndex, setOpenIndex] = useState(-1);

  return (
    // 상단 패딩(md:pt-[10.75rem]=172px)은 기존값 유지 — 건드리지 않는다.
    <section className="bg-white pt-16 sm:pt-20 md:pt-[10.75rem]">
      <div className="mx-auto w-full max-w-content px-5 sm:px-8">
        {/* 헤딩 — 페이지 조립본(2393:12299, fs32)과 상세(2161:9743, fs44) 두 시안의
            헤딩 크기가 달라, 레이아웃 기준인 페이지 조립본(fs32)을 채택했다. 기존
            SECTION_HEADING_CLASS 그대로 재사용(정의 변경 없음). */}
        <h2 className={SECTION_HEADING_CLASS}>자주 묻는 질문</h2>

        {/* 헤딩→첫 항목 gap 77(2393:12299) → ×0.764 = 59px(md:mt-[3.6875rem]). */}
        <div className="mt-8 sm:mt-10 md:mt-[3.6875rem]">
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

// 이용권 리스트 — 시안(2393:12326, 1920×1174, 콘텐츠 폭 1209) 실측 배율 ×0.910(=1100÷1209).
// 정책(파일 상단 컨테이너 폭 주석): 세로 여백・간격만 배율 환산하고 폰트 크기・박스 치수는
// 그대로 둔다. 리스트 레이아웃 자체는 목표관리(GoalManagement.jsx) PricingSection과 거의
// 동일한 이용권 구성이라(콘텐츠 폭도 1206으로 근접) 그 클래스 구성・주석 톤을 그대로 따랐다.
//
// [가격 정본 안내] 가격은 Supabase `products` 테이블(service_key='suhaeng')에서 조회한다.
// 정본은 DB이며 프론트에는 가격을 하드코딩하지 않는다 — 시안 실측 가격과 실제 렌더값이
// 다를 수 있으며 그 경우 DB 값이 맞다.
function PricingSection() {
  const { services, loading, error, refetch } = useProducts('suhaeng');
  const suhaengProducts = services[0]?.products || [];

  if (loading) {
    return (
      <section className="bg-white pb-20 pt-16 sm:pb-24 sm:pt-20 md:pt-[9.1875rem]">
        <div className="mx-auto w-full max-w-content px-5 text-center sm:px-8">
          <h2 className={SECTION_HEADING_CLASS}>위닝AI 수행평가 이용권 구매하기</h2>
          <p className="mt-10 text-[1rem] font-medium text-[#767676] sm:mt-12 md:mt-[5.625rem]">
            이용권 정보를 불러오는 중입니다.
          </p>
        </div>
      </section>
    );
  }

  if (error || suhaengProducts.length === 0) {
    return (
      <section className="bg-white pb-20 pt-16 sm:pb-24 sm:pt-20 md:pt-[9.1875rem]">
        <div className="mx-auto w-full max-w-content px-5 text-center sm:px-8">
          <h2 className={SECTION_HEADING_CLASS}>위닝AI 수행평가 이용권 구매하기</h2>
          <p className="mt-10 text-[1rem] font-medium text-red-600 sm:mt-12 md:mt-[5.625rem]">
            요금 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
          </p>
          <button
            type="button"
            onClick={refetch}
            className="mt-6 inline-flex h-11 items-center justify-center rounded-[0.9375rem] border border-[#0B84FD] px-6 text-[0.9375rem] font-semibold text-[#013262] transition hover:bg-[#F1F8FF]"
          >
            다시 시도
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="bg-white pb-20 pt-16 sm:pb-24 sm:pt-20 md:pt-[9.1875rem]">
      <div className="mx-auto w-full max-w-content px-5 text-center sm:px-8">
        <h2 className={SECTION_HEADING_CLASS}>위닝AI 수행평가 이용권 구매하기</h2>

        {/* 헤딩→리스트 gap 117 × 0.766 ≈ 90px(md:mt-[5.625rem]). */}
        <div className="mt-10 flex flex-col gap-3 text-left sm:mt-12 md:mt-[5.625rem] md:gap-[0.5625rem]">
          {suhaengProducts.map((product) => {
            const hasDiscount = product.listPrice > product.price;
            return (
              /* 행 폭 1209 × 0.766 ≈ 926px, 컨테이너(최대 1100px) 안에서 md:mx-auto로 중앙
                 정렬한다(md:max-w-[57.875rem] md:w-full). 행 높이 119 × 0.766 ≈ 91px
                 (md:h-[5.6875rem]), 패딩 상하 28×0.766≈21px(md:py-[1.3125rem]), 좌우
                 32×0.766≈25px(md:px-[1.5625rem]). radius 16×0.766≈12px(=rounded-xl, 12px는
                 Tailwind xl 토큰과 정확히 일치). bg #FFFFFF, border 1px #D9D9D9(환산 제외).
                 정가 블록과 할인 블록(할인율+할인가) 사이 실제 gap은 형제 프레임 y좌표 차에서
                 앞 블록(정가) 높이를 뺀 4px이 원본이며, ×0.766≈3px(gap-[0.1875rem])로
                 환산했다. */
              <div
                key={product.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#D9D9D9] bg-white px-6 py-6 sm:px-8 md:mx-auto md:h-[5.6875rem] md:w-full md:max-w-[57.875rem] md:px-[1.5625rem] md:py-[1.3125rem]"
              >
                <span className="flex items-center gap-[0.9375rem]">
                  {/* 체크박스 24×0.766≈18px(h-[1.125rem] w-[1.125rem]), bg #D9D9D9, radius
                      6×0.766≈5px(rounded-[0.3125rem]), 내부 흰색 체크 아이콘도 동일 배율로
                      축소(h-[0.6875rem] w-[0.6875rem]). 체크박스→라벨 gap 20×0.766≈15px
                      (gap-[0.9375rem], 위 wrapper에서 겸용) */}
                  <span
                    className="flex h-[1.125rem] w-[1.125rem] shrink-0 items-center justify-center rounded-[0.3125rem] bg-[#D9D9D9]"
                    aria-hidden="true"
                  >
                    <Check className="h-[0.6875rem] w-[0.6875rem] text-white" strokeWidth={3} />
                  </span>
                  {/* 라벨 폰트 24→18(md:text-[1.125rem]) w500 lh1.3 ls-0.02em #525252 */}
                  <span className="text-[1.0625rem] font-medium leading-[1.3] tracking-[-0.02em] text-[#525252] sm:text-[1.375rem] md:text-[1.125rem]">
                    {product.name}
                  </span>
                  {product.recommended && (
                    /* 추천 배지 — 라벨→배지 gap 20(위 wrapper gap-[0.9375rem]로 겸용).
                       52×32 × 0.766 → 40×25(h-[1.5625rem] w-[2.5rem]), bg #0B84FD, radius
                       12×0.766≈9px(rounded-[0.5625rem]), 텍스트 16→13(text-[0.8125rem])
                       w500 흰색 가운데 정렬. */
                    <span className="flex h-[1.5625rem] w-[2.5rem] shrink-0 items-center justify-center rounded-[0.5625rem] bg-[#0B84FD] text-[0.8125rem] font-medium text-white">
                      추천
                    </span>
                  )}
                </span>
                <span className="flex flex-col items-end">
                  {hasDiscount ? (
                    /* 정가(취소선) 폰트 20→15(md:text-[0.9375rem]) w400 lh1.4 ls-0.02em
                       #D9D9D9. */
                    <span className="flex flex-col items-end gap-[0.1875rem]">
                      <span className="text-[0.875rem] font-normal leading-[1.4] tracking-[-0.02em] text-[#D9D9D9] line-through sm:text-[1rem] md:text-[0.9375rem]">
                        {formatKRW(product.listPrice)}
                      </span>
                      <span className="flex items-center gap-4">
                        {product.badge && (
                          /* 할인율 폰트 24→18(md:text-[1.125rem]) w500 ls-0.02em #013262 */
                          <span className="text-[0.875rem] font-medium tracking-[-0.02em] text-[#013262] sm:text-[1.125rem] md:text-[1.125rem]">
                            {product.badge}
                          </span>
                        )}
                        {/* 할인가 폰트 24→18(md:text-[1.125rem]) w500 ls-0.02em #525252 */}
                        <span className="text-[1.0625rem] font-medium leading-[1.3] tracking-[-0.02em] text-[#525252] sm:text-[1.375rem] md:text-[1.125rem]">
                          {formatKRW(product.price)}
                        </span>
                      </span>
                    </span>
                  ) : (
                    /* 할인 없는 상품 — 가격만, 라벨과 동일 타이포 */
                    <span className="text-[1.0625rem] font-medium leading-[1.3] tracking-[-0.02em] text-[#525252] sm:text-[1.375rem] md:text-[1.125rem]">
                      {formatKRW(product.price)}
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </div>

        {/* 리스트 하단→안내문 gap 12×0.766≈9px(md:mt-[0.5625rem]). 폰트 18→14
            (md:text-[0.875rem], 모바일 generic 값과 동일해져 사실상 전 브레이크포인트
            균일해졌다) w500 #525252 좌측 정렬(부모 컨테이너 text-center 상속을 text-left로
            해제). */}
        <p className="mt-4 break-keep text-left text-[0.875rem] font-medium text-[#525252] sm:mt-4 md:mt-[0.5625rem] md:text-[0.875rem]">
          한 서비스 내에서 여러 플랜을 동시 선택할 수 없어요. 하나의 플랜만 선택 가능합니다.
        </p>

        {/* 안내문→CTA gap 64×0.766≈49px(md:mt-[3.0625rem]). 300×68 × 0.766 → 230×52
            (md:w-[14.375rem] md:h-[3.25rem], max-w-[14.375rem]), bg #013262, border 1px
            #0B84FD(환산 제외), radius 20×0.766≈15px(rounded-[0.9375rem]), 텍스트 20→15
            (text-[0.9375rem]) w600 흰색. 부모 컨테이너 text-center 상속으로 가로 가운데
            정렬. */}
        <button
          type="button"
          onClick={(event) => openPaidServiceOrAlert(event, HERO_SERVICE)}
          className="mt-8 inline-flex h-14 w-full max-w-[14.375rem] items-center justify-center rounded-[0.9375rem] border border-[#0B84FD] px-8 text-[0.9375rem] font-semibold text-white transition hover:opacity-90 md:mt-[3.0625rem] md:h-[3.25rem] md:w-[14.375rem] md:px-0"
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
      <StageSummarySection />
      <OutcomesSection />
      <TestimonialsSection />
      <FaqSection />
      <PricingSection />
    </main>
  );
}
