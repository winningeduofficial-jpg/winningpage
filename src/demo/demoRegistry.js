// 고객사(위닝에듀) 자립형 HTML 목업 5종의 단일 소스.
// ?raw로 문자열 import해 JS 번들 안에만 존재시킨다 — public/에 두면 Vercel이 정적 파일로
// 바로 200 응답해 어드민 게이트가 성립하지 않는다(vercel.json SPA rewrite가 확장자 포함
// 경로를 제외). 라우트(App.jsx)와 CTA(demoAccess.js 사용처)가 전부 이 key를 참조하게 해
// 경로 오타로 App.jsx의 path="*" 홈 리다이렉트에 조용히 튕기는 사고를 막는다.
import selfAssessmentHtml from './html/self-assessment.html?raw';
import growthDesignHtml from './html/growth-design.html?raw';
import researchHtml from './html/research.html?raw';
import researchIntroHtml from './html/research-intro.html?raw';
import growthIntroHtml from './html/growth-intro.html?raw';

export const DEMO_REGISTRY = {
  'self-assessment': { title: '자기평가서 데모', html: selfAssessmentHtml },
  'growth-design': { title: '성장설계 데모', html: growthDesignHtml },
  research: { title: '심화탐구 데모', html: researchHtml },
  'research-intro': { title: '심화탐구 소개', html: researchIntroHtml },
  'growth-intro': { title: '성장설계 소개', html: growthIntroHtml }
};
