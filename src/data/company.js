// 사업자 정보 (랜딩/결제 페이지 푸터, 카드사·PG 심사 제출용)
// 값이 바뀌면 이 파일만 수정하면 모든 푸터에 반영된다.
export const COMPANY = {
  name: '주식회사 위닝에듀',
  ceo: '강원석',
  corpRegNo: '180111-0161411', // 법인등록번호
  patentNo: '10-2024-0048889', // 특허출원
  bizRegNo: '266-88-03449', // 사업자 등록번호
  mailOrderNo: '제2025-부산해운대-1466호', // 통신판매업 신고번호
  address: '(본점) 세종특별자치시 마음안1로 61, 404호',
  tel: '010-3664-0081', // 대표전화
  centerTel: '051-902-0080', // 센터문의
  kakao: 'winningedu_official',
};

// 푸터 메뉴 컬럼. label/to 만 바꾸면 된다. 확실한 라우트는 실제 경로, 미확정은 서비스 소개로 연결.
export const FOOTER_COLUMNS = [
  {
    title: '서비스',
    items: [
      { label: '무료진단', to: '/free-diagnosis' },
      { label: '위닝 목표관리', to: '/page/services-goal' },
      { label: '위닝 수시예측', to: '/page/services-susi-prediction' },
      { label: '위닝 콜멘토', to: '/page/services-content' },
      { label: '위닝 AI수행평가', to: '/page/services-ai-performance' },
      { label: '위닝 세특관리', to: '/page/services-record-coach' },
      { label: '위닝 약점관리', to: '/page/services-weakness' },
      { label: '위닝 심화탐구', to: '/services' },
      { label: '위닝 생기부분석', to: '/services' },
    ],
  },
  {
    title: '프리미엄',
    items: [
      { label: '대입컨설팅 프로그램', to: '/page/premium-a' },
      { label: '특목고입학 프로그램', to: '/page/premium-s' },
      { label: '대학원입학 프로그램', to: '/page/services-mentoring' },
      { label: '해외영문대 진학컨설팅', to: '/page/premium-apply' },
      { label: '국제학교 학습관리', to: '/services' },
      { label: '귀국학생 대입컨설팅', to: '/services' },
    ],
  },
  {
    title: '입시정보',
    items: [
      { label: '대입모집요강', to: '/admission/guidelines' },
      { label: '입결정보', to: '/admission/results' },
      { label: '수시정시합격', to: '/admission/susi' },
      { label: '특목고합격', to: '/admission/susi' },
      { label: '교육컬럼', to: '/gallery' },
    ],
  },
  {
    title: '이용신청',
    items: [
      { label: '서비스요금', to: '/pricing' },
      { label: '프리미엄 이용', to: '/page/premium-apply' },
      { label: '멘토신청', to: '/page/services-content' },
    ],
  },
  {
    title: '고객안내',
    items: [
      { label: '회사소식', to: '/company-news' },
      { label: '공지사항', to: '/events' },
      { label: '자주하는 질문', to: '/faq' },
      { label: '온라인문의', to: '/faq' },
    ],
  },
];
