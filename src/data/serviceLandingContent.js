// 서비스 랜딩 4종(목표관리/수행평가/자기평가/심화탐구) 콘텐츠 — 신 라우트 /services/*.
// 카피 출처: Figma REST 노드 실측(1889:6944, 1889:6486, 1907:20783, 1907:21352) 텍스트 레이어.
// 스타일 값은 이 파일이 아닌 각 섹션 컴포넌트(src/components/services)가 dev 랜딩 정본을 따라 담당.
//
// pricing이 있는 서비스(goal/suhaeng)는 실제 Supabase products 테이블에 해당 상품이 존재해
// (2026-07-31 확인) src/data/pricingCatalog.js SERVICES에서 재사용한다 — 별도 가격 하드코딩 금지
// (가격 변경 시 한 곳만 갱신). 상품 테이블이 없는 서비스(자기평가/심화탐구)는 pricing: null이며
// 하단 CTA가 /free-diagnosis(기존 실제 라우트)로 안내한다 — 결제 UI 없음(껍데기 아님, 실제 이동).
import { SERVICES as PRICING_SERVICES } from './pricingCatalog';

// 시안 이미지 에셋(Figma 1889:6944·1889:6486·1907:20783·1907:21352 노드 렌더 기반, alpha 보존 원본에서 채택).
import goalHeroDashboard from '../assets/services/goal/hero-dashboard.png';
import goalStepGoalSetting from '../assets/services/goal/step-goal-setting.png';
import goalStepAnalysis from '../assets/services/goal/step-analysis.png';
import goalStepTimePlan from '../assets/services/goal/step-time-plan.png';
import goalStepExecution from '../assets/services/goal/step-execution.png';

import perfAudienceTopic from '../assets/services/performance/audience-topic.jpg';
import perfAudienceResearch from '../assets/services/performance/audience-research.jpg';
import perfAudienceStructure from '../assets/services/performance/audience-structure.jpg';
import perfAudienceQuality from '../assets/services/performance/audience-quality.jpg';

import saAudienceWriting from '../assets/services/self-assessment/audience-writing.jpg';
import saAudienceOrganizing from '../assets/services/self-assessment/audience-organizing.jpg';
import saAudienceStructure from '../assets/services/self-assessment/audience-structure.jpg';
import saAudienceQuality from '../assets/services/self-assessment/audience-quality.jpg';

import researchThinkingBooks from '../assets/services/research/thinking-books.jpg';
import researchThinkingMindmap from '../assets/services/research/thinking-mindmap.jpg';

const GOAL_PRODUCTS = PRICING_SERVICES.find((service) => service.key === 'goal')?.products || [];
const SUHAENG_PRODUCTS =
  PRICING_SERVICES.find((service) => service.key === 'suhaeng')?.products || [];

export const SERVICE_LANDING_CONTENT = {
  goal: {
    slug: 'goal',
    hero: {
      eyebrow: '목표관리',
      title: '목표의 합격 확률을 관리합니다',
      subtitle: '데이터가 합격을 만들고, 실행이 결과를 만듭니다',
      ctaLabel: '지금 시작하기',
      ctaTo: '/pricing',
      paidServiceName: '목표관리 서비스',
      visual: {
        src: goalHeroDashboard,
        alt: 'TMP 주간 성장 리포트 대시보드 화면 — 이번 주 공부 시간, 목표 달성률, 목표군 내 위치를 보여준다'
      }
    },
    highlights: {
      title: '위닝 목표관리의 핵심 포인트',
      items: [
        {
          title: '데이터 기반 목표 확률',
          desc: '성적과 활동을 데이터로 분석해 목표 대학・학과 합격 확률을 확인합니다.'
        },
        {
          title: '맞춤 학습 시간 제안',
          desc: '목표 확률과 현재 위치를 비교해 과목별 우선순위와 학습 시간을 제안합니다.'
        },
        {
          title: '주간 리포트 알림',
          desc: '매주 실행 현황을 정리해 카카오톡 알림톡으로 학부모님께 전달합니다.'
        }
      ]
    },
    process: {
      title: '위닝 목표관리, 단계별로 이렇게 관리합니다',
      steps: [
        {
          title: '목표 설정',
          desc: '목표 대학・학과를 정하고 현재 위치와 목표 확률을 확인합니다.',
          image: { src: goalStepGoalSetting, alt: '목표 대학・학과를 정하는 학생 일러스트' }
        },
        {
          title: '학습 분석',
          desc: '성적과 활동을 진단해 강점과 약점을 파악합니다.',
          image: { src: goalStepAnalysis, alt: '성적과 활동을 진단하며 고민하는 학생 일러스트' }
        },
        {
          title: '목표 시간 제안',
          desc: '합격에 필요한 학습 시간을 과목별로 제안합니다.',
          image: { src: goalStepTimePlan, alt: '과목별 학습 시간을 계획하는 학생 일러스트' }
        },
        {
          title: '전략 실행 & 점검',
          desc: '주간 실행을 점검하고 목표를 꾸준히 관리합니다.',
          image: { src: goalStepExecution, alt: '쌓인 자료를 점검하며 실행을 관리하는 학생 일러스트' }
        }
      ]
    },
    audience: {
      title: '이런 학생에게 목표관리 서비스를 추천해요',
      items: [
        {
          title: '방향이 막막한 학생',
          desc: '어떤 대학을 목표로 해야 할지, 지금 뭘 해야 할지 막막한 학생'
        },
        {
          title: '실행이 어려운 학생',
          desc: '계획은 세우지만 매번 실행과 점검이 흐지부지되는 학생'
        },
        {
          title: '명확한 목표가 필요한 학생',
          desc: '성적은 나오는데 목표까지 어떻게 가야 할지 모르겠는 학생'
        },
        {
          title: '함께 관리하고 싶은 학부모',
          desc: '아이의 학습 진행을 함께 확인하고 소통하고 싶은 학부모'
        }
      ]
    },
    outcomes: {
      title: '목표관리로 달라지는 것들',
      items: ['성적 향상', '학습 습관 형성', '학습 시간 최적화', '합격 확률 향상', '부모님 안심']
    },
    testimonials: {
      title: '목표관리 서비스를 받아본 학생&학부모 후기',
      items: [
        {
          quote: '매일 뭘 해야 할지 콕 짚어주니, 미루던 습관이 줄었습니다.',
          badge: '고2 김OO'
        },
        {
          quote: '주간 리포트로 아이 상황을 함께 볼 수 있어 안심이 됩니다.',
          badge: '고2 학부모'
        },
        {
          quote: '내 목표 대학까지의 확률이 눈에 보이니까, 막연하던 공부가 방향이 생겼어요.',
          badge: '고2 김OO'
        }
      ]
    },
    faq: {
      title: '자주 묻는 질문',
      items: [
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
      ]
    },
    pricing: {
      title: '목표관리 이용권 구매하기',
      note: '한 서비스 내에서 여러 플랜을 동시 선택할 수 없어요. 하나의 플랜만 선택 가능합니다.',
      products: GOAL_PRODUCTS,
      ctaLabel: '이용권 구매하러 가기',
      ctaTo: '/pricing'
    }
  },

  performance: {
    slug: 'performance',
    hero: {
      eyebrow: '수행평가',
      title: '학교 과제부터 보고서까지',
      subtitle: '주제 선정부터 구성・점검까지, 수행평가를 함께 완성합니다',
      ctaLabel: '지금 시작하기',
      ctaTo: '/pricing',
      paidServiceName: 'AI 수행평가 서비스'
    },
    highlights: {
      title: '위닝 수행평가의 차별화 포인트',
      items: [
        {
          title: '관심 분야・유형별 주제 제안',
          desc: '과목과 관심사에 맞는 탐구 주제 후보를 제안합니다.'
        },
        {
          title: '탐구 가치 있는 방향 제시',
          desc: '단순 조사에 그치지 않는 탐구형 주제 방향을 안내합니다.'
        },
        { title: '나만의 관점으로 차별화', desc: '흔한 주제를 나만의 관점으로 좁히는 포인트를 짚어줍니다.' }
      ]
    },
    process: {
      title: '위닝 수행평가와 함께하는 완성까지의 흐름',
      steps: [
        {
          title: '주제・자료 방향 제안',
          desc: '관심 분야・유형별 주제 제안, 탐구 가치 있는 방향과 차별화 포인트를 안내합니다.'
        },
        {
          title: '구성 설계 리포트',
          desc: '논리적 탐구 흐름 설계, 목차・세부 구성과 핵심 포인트를 정리합니다.'
        },
        {
          title: '요청 내용 입력',
          desc: '과목・유형, 주제 범위, 요구사항을 입력하면 네 가지 영역으로 코칭합니다.'
        },
        {
          title: '결과 점검・피드백',
          desc: '최종 내용 점검・피드백, 보완 포인트와 제출 전 완성도를 점검합니다.'
        }
      ]
    },
    audience: {
      title: '이런 학생에게 수행평가를 추천해요',
      items: [
        {
          title: '주제 선정이 막막한 학생',
          desc: '관심 주제나 방향 설정부터 어려운 학생',
          image: { src: perfAudienceTopic, alt: '수행평가 주제 선정을 고민하는 학생' }
        },
        {
          title: '자료 분석이 어려운 학생',
          desc: '믿을 자료와 분석 방법이 필요한 학생',
          image: { src: perfAudienceResearch, alt: '자료 분석 방법을 고민하는 학생' }
        },
        {
          title: '구성・전개가 어려운 학생',
          desc: '논리적 흐름과 구성을 고민하는 학생',
          image: { src: perfAudienceStructure, alt: '보고서 구성과 전개를 고민하는 학생' }
        },
        {
          title: '완성도를 높이고 싶은 학생',
          desc: '마지막 점검과 보완이 더 필요한 학생',
          image: { src: perfAudienceQuality, alt: '수행평가 완성도를 점검하는 학생' }
        }
      ]
    },
    outcomes: {
      title: '수행평가 서비스로 달라지는 것들',
      items: ['시간 절약', '자신감 향상', '체계적인 구성', '전문적인 방향성']
    },
    testimonials: {
      title: '수행평가 서비스를 받아본 학생들의 후기',
      items: [
        {
          quote:
            '주제 선정부터 자료, 구성까지 단계별로 도와주셔서 막막했던 수행평가가 훨씬 수월했어요. 결과물도 더 체계적이고 완성도가 높아졌습니다!',
          badge: '고2 김OO'
        },
        {
          quote:
            '구성 설계 리포트가 정말 큰 도움이 됐어요. 흐름이 정리되니 자료 분석과 정리도 수월했고, 발표까지 자신 있게 했습니다!',
          badge: '고3 박OO'
        }
      ]
    },
    faq: {
      title: '자주 묻는 질문',
      items: [
        {
          q: '어떤 과목의 수행평가도 도움을 받을 수 있나요?',
          a: '국・영・수 및 대부분의 교과・창체 수행평가를 지원합니다. 특수 과목은 상담을 통해 확인해 주세요.'
        },
        {
          q: '이용 절차와 소요 시간은 어떻게 되나요?',
          a: '요청 내용 입력 후 담당 멘토가 단계별 리포트를 순차적으로 제공합니다. 자세한 소요 시간은 상담에서 안내드립니다.'
        },
        {
          q: '제시된 내용을 그대로 제출해도 되나요?',
          a: '제공되는 리포트는 방향 제시와 코칭 자료입니다. 최종 제출물은 학생이 직접 작성・보완하는 것을 권장합니다.'
        },
        {
          q: '개인 정보와 결과물은 안전하게 관리되나요?',
          a: '제출된 자료와 결과물은 서비스 제공 목적 외에는 사용되지 않으며 안전하게 관리됩니다.'
        }
      ]
    },
    pricing: {
      title: '위닝AI 수행평가 이용권 구매하기',
      note: '한 서비스 내에서 여러 플랜을 동시 선택할 수 없어요. 하나의 플랜만 선택 가능합니다.',
      products: SUHAENG_PRODUCTS,
      ctaLabel: '이용권 구매하러 가기',
      ctaTo: '/pricing'
    }
  },

  selfAssessment: {
    slug: 'self-assessment',
    hero: {
      eyebrow: '자기평가',
      title: '서류 작성 지원 프로그램',
      subtitle: '문항 해석부터 구조 설계까지, 자기평가서를 더 설득력 있게',
      ctaLabel: '지금 시작하기',
      ctaTo: '/free-diagnosis',
      paidServiceName: null
    },
    highlights: {
      title: '위닝 자기평가의 핵심 포인트',
      items: [
        { title: '문항 의도 파악', desc: '문항이 묻는 핵심과 의도를 짚어줍니다.' },
        { title: '답변 방향 설정', desc: '무엇을 중심으로 써야 할지 방향을 잡아줍니다.' },
        { title: '핵심 키워드 도출', desc: '답변에 담아야 할 핵심 키워드를 정리합니다.' }
      ]
    },
    process: {
      title: '자기평가서, 다섯 단계로 차근차근',
      steps: [
        { title: '문항 해석', desc: '문항 의도와 핵심을 짚어 답변 방향을 잡습니다.' },
        { title: '활동 정리', desc: '입력한 활동・경험을 체계적으로 정리합니다.' },
        { title: '강점 추출', desc: '나만의 강점과 차별화 포인트를 함께 찾습니다.' },
        { title: '구조 설계', desc: '논리적 구성과 흐름을 설계합니다.' },
        { title: '피드백・점검', desc: '학생 초안의 표현・완성도를 점검하고 보완합니다.' }
      ]
    },
    audience: {
      title: '이런 학생에게 자기평가 서비스를 추천해요',
      items: [
        {
          title: '작성이 막막한 학생',
          desc: '어디서부터 시작할지 모르겠는 학생',
          image: { src: saAudienceWriting, alt: '자기평가서 작성을 어디서부터 시작할지 고민하는 학생' }
        },
        {
          title: '정리가 어려운 학생',
          desc: '경험은 있는데 어떻게 풀지 막막한 학생',
          image: { src: saAudienceOrganizing, alt: '경험을 어떻게 정리할지 고민하는 학생' }
        },
        {
          title: '구성이 어려운 학생',
          desc: '설득력 있는 흐름과 구성이 어려운 학생',
          image: { src: saAudienceStructure, alt: '설득력 있는 구성을 고민하는 학생' }
        },
        {
          title: '완성도를 높이고 싶은 학생',
          desc: '초안은 있으나 더 다듬고 싶은 학생',
          image: { src: saAudienceQuality, alt: '자기평가서 초안을 다듬는 학생' }
        }
      ]
    },
    outcomes: {
      title: '자기평가로 정리되는 것들',
      items: ['구조 설계안', '피드백 리포트', '강점・차별화 포인트', '핵심 내용 요약본']
    },
    testimonials: {
      title: '자기평가 서비스를 받아본 학생들의 후기',
      items: [
        { quote: '피드백이 정말 구체적이라 부족했던 부분을 스스로 고칠 수 있었어요.', badge: '고3 김□□' },
        {
          quote: '문항 해석부터 구조까지 단계별로 도와주셔서 수월하게 작성할 수 있었어요.',
          badge: '고3 이△△'
        },
        { quote: '제가 가진 강점을 잘 정리해줘서 자소서 설득력이 높아졌어요.', badge: '고3 박○○' }
      ]
    },
    faq: {
      title: '자주 묻는 질문',
      items: [
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
      ]
    },
    // products 테이블에 해당 상품 없음(2026-07-31 확인) — 결제 UI 대신 무료진단으로 안내.
    pricing: null,
    shellCta: {
      title: '자기평가서, 무료진단으로 먼저 확인해보세요',
      desc: '무료진단에서 학생에게 맞는 프로그램을 추천해 드립니다.',
      ctaLabel: '무료진단 시작하기',
      ctaTo: '/free-diagnosis'
    }
  },

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
