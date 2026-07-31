// 서비스 랜딩 1종(심화탐구) 콘텐츠 — 신 라우트 /services/*.
// 목표관리(goal)는 src/pages/services/GoalManagement.jsx, 수행평가(performance)는
// src/pages/services/PerformanceAssessment.jsx, 자기평가(self-assessment)는
// src/pages/services/SelfAssessment.jsx 전용 bespoke 구현이라 이 파일에서 빠졌다.
// 카피 출처: Figma REST 노드 실측(1907:21352) 텍스트 레이어.
// 스타일 값은 이 파일이 아닌 각 섹션 컴포넌트(src/components/services)가 dev 랜딩 정본을 따라 담당.
//
// pricing이 있는 서비스(goal/suhaeng)는 실제 Supabase products 테이블에 해당 상품이 존재해
// (2026-07-31 확인) src/data/pricingCatalog.js SERVICES에서 재사용한다 — 별도 가격 하드코딩 금지
// (가격 변경 시 한 곳만 갱신). 상품 테이블이 없는 서비스(심화탐구)는 pricing: null이며
// 하단 CTA가 /free-diagnosis(기존 실제 라우트)로 안내한다 — 결제 UI 없음(껍데기 아님, 실제 이동).

// 시안 이미지 에셋(Figma 1907:21352 노드 렌더 기반, alpha 보존 원본에서 채택).
// 목표관리(goal)·수행평가(performance)·자기평가(self-assessment)는 각각 전용 bespoke 페이지로
// 분리돼 이 파일의 공용 콘텐츠 객체를 더 이상 쓰지 않는다 — 에셋 import·콘텐츠 블록 제거.
import researchThinkingBooks from '../assets/services/research/thinking-books.jpg';
import researchThinkingMindmap from '../assets/services/research/thinking-mindmap.jpg';

export const SERVICE_LANDING_CONTENT = {
  research: {
    slug: 'research',
    hero: {
      eyebrow: '심화탐구',
      title: '탐구 설계 프로그램',
      subtitle: '주제 추천부터 탐구 설계까지, 심화탐구를 끝까지',
      ctaLabel: '지금 시작하기',
      ctaTo: '/free-diagnosis',
      paidServiceName: null
    },
    highlights: {
      title: '위닝 심화탐구의 핵심 포인트',
      items: [
        {
          title: '관심사 기반 주제 추천',
          desc: '진로・관심 분야를 바탕으로 탐구 주제를 함께 찾습니다.'
        },
        {
          title: '체계적인 탐구 설계',
          desc: '가설부터 검증・해석까지 논리적으로 설계합니다.'
        },
        {
          title: '완성도 있는 결과물 피드백',
          desc: '완성한 보고서와 발표 자료를 꼼꼼히 피드백합니다.'
        }
      ]
    },
    process: {
      title: '심화탐구, 이렇게 완성돼요',
      steps: [
        { title: '주제 선택', desc: '관심 분야에서 탐구 주제를 함께 정합니다.' },
        { title: '탐구 설계', desc: '주제・가설・방법・계획을 설계합니다.' },
        { title: '자료・수행', desc: '학생이 자료를 수집하고 계획에 따라 탐구를 수행합니다.' },
        { title: '완성・피드백', desc: '학생이 완성한 결과물을 점검하고 피드백합니다.' }
      ]
    },
    audience: {
      title: '이런 학생에게 심화탐구 서비스를 추천해요',
      items: [
        {
          title: '주제가 막막한 학생',
          desc: '관심사에서 탐구 주제를 잡기 어려운 학생',
          image: { src: researchThinkingBooks, alt: '탐구 주제를 고민하는 학생' }
        },
        {
          title: '설계가 어려운 학생',
          desc: '가설・방법・계획을 세우기 어려운 학생',
          image: { src: researchThinkingMindmap, alt: '탐구 설계를 고민하는 학생' }
        },
        {
          title: '자료 정리가 필요한 학생',
          desc: '자료를 모으고 해석하는 데 어려움을 겪는 학생',
          image: { src: researchThinkingMindmap, alt: '자료를 정리하는 학생' }
        },
        {
          title: '완성도를 높이고 싶은 학생',
          desc: '초안은 있으나 더 다듬고 싶은 학생',
          image: { src: researchThinkingBooks, alt: '탐구 보고서 완성도를 다듬는 학생' }
        }
      ]
    },
    outcomes: {
      title: '심화탐구로 달라지는 것들',
      items: ['탐구 역량 향상', '자료 해석력 강화', '완성도 높은 결과물', '자기주도 탐구 경험']
    },
    testimonials: {
      title: '심화탐구 서비스를 받아본 학생들의 후기',
      items: [
        {
          quote: '주제 선정부터 설계, 피드백까지 단계별로 도와주셔서 탐구를 끝까지 마칠 수 있었어요.',
          badge: '고1 김민△'
        },
        {
          quote: '평가 리포트가 정말 구체적이라 스스로 부족한 부분을 보완할 수 있었어요.',
          badge: '고2 박○석'
        },
        {
          quote: '자료 정리와 분석 방법을 안내해줘서 보고서의 논리성이 크게 좋아졌어요.',
          badge: '고2 이△은'
        }
      ]
    },
    faq: {
      title: '자주 묻는 질문',
      items: [
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
      ]
    },
    // products 테이블에 해당 상품 없음(2026-07-31 확인) — 결제 UI 대신 무료진단으로 안내.
    pricing: null,
    shellCta: {
      title: '심화탐구, 무료진단으로 먼저 확인해보세요',
      desc: '무료진단에서 학생에게 맞는 프로그램을 추천해 드립니다.',
      ctaLabel: '무료진단 시작하기',
      ctaTo: '/free-diagnosis'
    }
  }
};
