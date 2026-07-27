// =====================================================================
// 랜딩페이지 프리뷰용 정적 데이터
// - Supabase 없이 로컬 정적 파일/데이터로 랜딩 섹션을 렌더하기 위한 픽스처.
// - 각 배열의 항목 shape은 Supabase row(select 컬럼)와 동일하게 맞춤
//   (src/pages/Home.jsx의 select 목록 / 각 섹션 컴포넌트 jsdoc 참고).
// - DB 전환 시 src/pages/Home.jsx의 LANDING_PREVIEW 플래그만 false로 변경.
// =====================================================================

// ---------------------------------------------------------------------
// banners : 메인 히어로 좌측 고정 배너 (HeroSection)
// select: 'id, title, highlight, image_url, button_text, button_link, sort_order, is_active'
// ---------------------------------------------------------------------
export const banners = [
  {
    id: 'preview-main',
    title: '메인 배너',
    highlight: null,
    image_url: '/images/landing/hero/main-banner-full.png',
    button_text: null,
    button_link: '/free-diagnosis', // App.jsx 라우트 확인 (src/App.jsx:59)
    sort_order: 1,
    is_active: true,
  },
];

// ---------------------------------------------------------------------
// sideBanners : 메인 히어로 우측 소형 캐러셀 (home_side_banners, HeroSection)
// select('*') — HeroSection jsdoc 기준 필드 구성
// ---------------------------------------------------------------------
export const sideBanners = [
  {
    id: 'preview-side',
    title: '이벤트 배너',
    subtitle: null,
    image_url: '/images/landing/hero/side-banner-full.png',
    mobile_image_url: null,
    link_url: null,
    open_new_window: false,
    sort_order: 1,
    is_active: true,
  },
];

// ---------------------------------------------------------------------
// universities : 합격생 섹션 (university_acceptances, AcceptanceSection)
// select('*') — sql/20_landing_renewal.sql 시드 26건과 동일 (general 16 + medical_special 10)
// subtitle: 카드 서브라벨 — 일반계열·의약학·특수계열 모두 학과명 체계로 통일(인원수 표기 폐지)
// count는 전 행 null — 컬럼·컴포넌트 폴백은 하위호환용으로만 존치
// medical_special 엠블럼 일부는 시안 placeholder — 운영에서 관리자 교체 예정
// ---------------------------------------------------------------------
export const universities = [
  // 일반계열 (Figma 1889:5211, 16건)
  { id: 'preview-uni-chungang-biosystem', name: '중앙대학교', subtitle: '시스템생명공학', emblem_url: '/images/landing/acceptance/chung-ang.png', count: null, track: 'general', sort_order: 10, is_active: true },
  { id: 'preview-uni-snu-nuclear', name: '서울대학교', subtitle: '원자핵공학', emblem_url: '/images/landing/acceptance/seoul-national.png', count: null, track: 'general', sort_order: 20, is_active: true },
  { id: 'preview-uni-ewha-business', name: '이화여대', subtitle: '경역학과', emblem_url: '/images/landing/acceptance/ewha.png', count: null, track: 'general', sort_order: 30, is_active: true },
  { id: 'preview-uni-hanyang-finance', name: '한양대학교', subtitle: '파이낸스', emblem_url: '/images/landing/acceptance/hanyang.png', count: null, track: 'general', sort_order: 40, is_active: true },
  { id: 'preview-uni-postech-ie', name: '포스텍', subtitle: '산업경영공학', emblem_url: '/images/landing/acceptance/postech.png', count: null, track: 'general', sort_order: 50, is_active: true },
  { id: 'preview-uni-korea-telecom', name: '고려대학교', subtitle: '차세대통신', emblem_url: '/images/landing/acceptance/korea.png', count: null, track: 'general', sort_order: 60, is_active: true },
  { id: 'preview-uni-yonsei-english', name: '연세대학교', subtitle: '영어영문학과', emblem_url: '/images/landing/acceptance/yonsei.png', count: null, track: 'general', sort_order: 70, is_active: true },
  { id: 'preview-uni-skku-engineering', name: '성균관대학교', subtitle: '공학계열', emblem_url: '/images/landing/acceptance/sungkyunkwan.png', count: null, track: 'general', sort_order: 80, is_active: true },
  { id: 'preview-uni-sogang-chinese', name: '서강대학교', subtitle: '중국문화', emblem_url: '/images/landing/acceptance/sogang.png', count: null, track: 'general', sort_order: 90, is_active: true },
  { id: 'preview-uni-hanyang-global', name: '한양대학교', subtitle: '국제학부', emblem_url: '/images/landing/acceptance/hanyang.png', count: null, track: 'general', sort_order: 100, is_active: true },
  { id: 'preview-uni-yonsei-cs', name: '연세대학교', subtitle: '컴퓨터공학', emblem_url: '/images/landing/acceptance/yonsei.png', count: null, track: 'general', sort_order: 110, is_active: true },
  { id: 'preview-uni-hongik-art', name: '홍익대학교', subtitle: '미술대학', emblem_url: '/images/landing/acceptance/hongik.png', count: null, track: 'general', sort_order: 120, is_active: true },
  { id: 'preview-uni-snu-vet', name: '서울대학교', subtitle: '수의학과', emblem_url: '/images/landing/acceptance/seoul-national.png', count: null, track: 'general', sort_order: 130, is_active: true },
  { id: 'preview-uni-sogang-econ', name: '서강대학교', subtitle: '경제학과', emblem_url: '/images/landing/acceptance/sogang.png', count: null, track: 'general', sort_order: 140, is_active: true },
  { id: 'preview-uni-chungang-biz', name: '중앙대학교', subtitle: '경영학', emblem_url: '/images/landing/acceptance/chung-ang.png', count: null, track: 'general', sort_order: 150, is_active: true },
  { id: 'preview-uni-kyunghee-biz', name: '경희대학교', subtitle: '경영학', emblem_url: '/images/landing/acceptance/kyunghee.png', count: null, track: 'general', sort_order: 160, is_active: true },
  // 의약학 · 특수계열 (시안 1685:1452)
  { id: 'preview-uni-11', name: '고려대학교', subtitle: '의예과', emblem_url: '/images/landing/acceptance/medical/korea-med.png', count: null, track: 'medical_special', sort_order: 10, is_active: true },
  { id: 'preview-uni-12', name: '한양대학교', subtitle: '의예과', emblem_url: '/images/landing/acceptance/medical/hanyang-med.png', count: null, track: 'medical_special', sort_order: 20, is_active: true },
  { id: 'preview-uni-13', name: '경북대학교', subtitle: '의예과', emblem_url: '/images/landing/acceptance/medical/kyungpook-med.png', count: null, track: 'medical_special', sort_order: 30, is_active: true },
  { id: 'preview-uni-14', name: '고신대학교', subtitle: '의과대학', emblem_url: '/images/landing/acceptance/medical/kosin-med.png', count: null, track: 'medical_special', sort_order: 40, is_active: true },
  { id: 'preview-uni-15', name: '가톨릭관동대학교', subtitle: '의과대학', emblem_url: '/images/landing/acceptance/medical/catholic-kwandong-med.png', count: null, track: 'medical_special', sort_order: 50, is_active: true },
  { id: 'preview-uni-16', name: '부산대학교', subtitle: '치의예과', emblem_url: '/images/landing/acceptance/medical/pusan-dent.png', count: null, track: 'medical_special', sort_order: 60, is_active: true },
  { id: 'preview-uni-17', name: '동의대학교', subtitle: '한의예과', emblem_url: '/images/landing/acceptance/medical/dongeui-kmed.png', count: null, track: 'medical_special', sort_order: 70, is_active: true },
  { id: 'preview-uni-18', name: '원광대학교', subtitle: '한의예과', emblem_url: '/images/landing/acceptance/medical/wonkwang-kmed.png', count: null, track: 'medical_special', sort_order: 80, is_active: true },
  { id: 'preview-uni-19', name: '해군사관학교', subtitle: '84기', emblem_url: '/images/landing/acceptance/medical/naval-academy.png', count: null, track: 'medical_special', sort_order: 90, is_active: true },
  { id: 'preview-uni-20', name: '고려대학교', subtitle: '삼성전자 연계', emblem_url: '/images/landing/acceptance/medical/korea-samsung.png', count: null, track: 'medical_special', sort_order: 100, is_active: true },
];

// ---------------------------------------------------------------------
// services : 핵심 서비스 섹션 (program_categories, ServicesSection)
// select('*') — 카피는 sql/20_landing_renewal.sql 시드와 동일, icon_image_url 6/6 매칭
// ---------------------------------------------------------------------
export const services = [
  { id: 'preview-svc-01', name: '무료진단', description: '무료로 경험하는\n위닝 AE시스템', link: '/free-diagnosis', icon: 'default', icon_image_url: '/images/landing/services/free-diagnosis.png', sort_order: 1, is_active: true },
  { id: 'preview-svc-02', name: '목표관리', description: '목표 대학과\n진로에 맞춘 관리 서비스', link: '/services', icon: 'default', icon_image_url: '/images/landing/services/goal-management.png', sort_order: 2, is_active: true },
  { id: 'preview-svc-03', name: '콜멘토', description: '필요한 순간에\n멘토와 바로 연결', link: '/services', icon: 'default', icon_image_url: '/images/landing/services/call-mentor.png', sort_order: 3, is_active: true },
  { id: 'preview-svc-04', name: '수행평가', description: '수행평가를\n함께 완성', link: '/services', icon: 'default', icon_image_url: '/images/landing/services/performance-assessment.png', sort_order: 4, is_active: true },
  { id: 'preview-svc-05', name: '자기평가', description: '문항 해석부터\n구조 설계까지', link: '/services', icon: 'default', icon_image_url: '/images/landing/services/self-assessment.png', sort_order: 5, is_active: true },
  { id: 'preview-svc-06', name: '심화탐구', description: '주제 추천부터\n탐구 설계까지', link: '/services', icon: 'default', icon_image_url: '/images/landing/services/deep-inquiry.png', sort_order: 6, is_active: true },
];

// ---------------------------------------------------------------------
// mentors : 멘토 섹션 (home_mentor_strategies, MentorSection)
// select('*') — 카드 22건, Figma 스트립 순서 (sql/20_landing_renewal.sql 시드 순서와 동일)
// mentor_name은 테이블 실컬럼은 아니고 alt 텍스트 폴백용 (MentorSection jsdoc 참고)
// Figma 1982:7301 리뉴얼: 흰 카드 + 상단 텍스트(badge/title_lines) + 하단 투명 인물사진(photo_url/photo) 합성.
//   image_url(통이미지)은 구버전 rows 대비 하위호환 폴백용으로 존치.
// 오탈자/표기는 Figma 원문 그대로 유지 (교정 금지, 기존 프로젝트 결정사항):
//   김성훈 badge="김성훈멘토"(공백 없음), 김무경 "연세대 응용계학과", 이승현 "연세대 신소재 공학과"
// ---------------------------------------------------------------------
export const mentors = [
  {
    id: 'preview-mentor-01',
    image_url: '/images/landing/mentors/cards/강지후.png',
    mentor_name: '강지후',
    badge: '예체능계열 멘토',
    title_lines: ['강지후 멘토', '서울대 동양학과'],
    photo_url: '/images/landing/mentors/photos/강지후.png',
    photo: { top: 106, left: 0, width: 210, height: 270 },
    card_width: 210,
    sort_order: 10,
    is_active: true,
  },
  {
    id: 'preview-mentor-02',
    image_url: '/images/landing/mentors/cards/김형준.png',
    mentor_name: '김형준',
    badge: '위닝 8기',
    title_lines: ['김형준 멘토', '서울대 수의예과'],
    photo_url: '/images/landing/mentors/photos/김형준.png',
    photo: { top: 106, left: 0, width: 210, height: 315 },
    card_width: 210,
    sort_order: 20,
    is_active: true,
  },
  {
    id: 'preview-mentor-03',
    image_url: '/images/landing/mentors/cards/박서정.png',
    mentor_name: '박서정',
    badge: '위닝 10기',
    title_lines: ['박서정 멘토', '뉴욕대 경제학과'],
    photo_url: '/images/landing/mentors/photos/박서정.png',
    photo: { top: 106, left: 0, width: 210, height: 289 },
    card_width: 210,
    sort_order: 30,
    is_active: true,
  },
  {
    id: 'preview-mentor-04',
    image_url: '/images/landing/mentors/cards/박찬일.png',
    mentor_name: '박찬일',
    badge: '위닝 13기',
    title_lines: ['박찬일 멘토', '포항공대 무은재학부'],
    photo_url: '/images/landing/mentors/photos/박찬일.png',
    photo: { top: 106, left: 0, width: 210, height: 270 },
    card_width: 210,
    sort_order: 40,
    is_active: true,
  },
  {
    id: 'preview-mentor-05',
    image_url: '/images/landing/mentors/cards/이청훈.png',
    mentor_name: '이청훈',
    badge: '위닝 8기',
    title_lines: ['이청훈 멘토', '고려대 신소재공학부'],
    photo_url: '/images/landing/mentors/photos/이청훈.png',
    photo: { top: 106, left: 0, width: 210, height: 270 },
    card_width: 210,
    sort_order: 50,
    is_active: true,
  },
  {
    id: 'preview-mentor-06',
    image_url: '/images/landing/mentors/cards/김무경.png',
    mentor_name: '김무경',
    badge: '위닝 8기',
    title_lines: ['김무경 멘토', '연세대 응용계학과'],
    photo_url: '/images/landing/mentors/photos/김무경.png',
    photo: { top: 95, left: 0, width: 230, height: 296 },
    card_width: 230,
    sort_order: 60,
    is_active: true,
  },
  {
    id: 'preview-mentor-07',
    image_url: '/images/landing/mentors/cards/하현서.png',
    mentor_name: '하현서',
    badge: '위닝 11기',
    title_lines: ['하현서 멘토', '유니스트 디자인학과'],
    photo_url: '/images/landing/mentors/photos/하현서.png',
    photo: { top: 111, left: 0, width: 210, height: 270 },
    card_width: 210,
    sort_order: 70,
    is_active: true,
  },
  {
    id: 'preview-mentor-08',
    image_url: '/images/landing/mentors/cards/제민규.png',
    mentor_name: '제민규',
    badge: '위닝 12기',
    title_lines: ['제민규 멘토', '서울대 원자핵공학과'],
    photo_url: '/images/landing/mentors/photos/제민규.png',
    photo: { top: 106, left: 0, width: 210, height: 271 },
    card_width: 210,
    sort_order: 80,
    is_active: true,
  },
  {
    id: 'preview-mentor-09',
    image_url: '/images/landing/mentors/cards/김단아.png',
    mentor_name: '김단아',
    badge: '학습멘토 위닝 2기',
    title_lines: ['김단아 멘토', '포항공대 신소재공학과'],
    photo_url: '/images/landing/mentors/photos/김단아.png',
    photo: { top: 106, left: 0, width: 210, height: 315 },
    card_width: 210,
    sort_order: 90,
    is_active: true,
  },
  {
    id: 'preview-mentor-10',
    image_url: '/images/landing/mentors/cards/김성훈.png',
    mentor_name: '김성훈',
    badge: '위닝 9기',
    title_lines: ['김성훈멘토', '서울대 수의학과'],
    photo_url: '/images/landing/mentors/photos/김성훈.png',
    // 사진 h(392px)이 카드 h(360px)를 초과 — Figma 원본대로 내부 img를 상단 크롭
    photo: { top: 92, left: 0, width: 210, height: 392, crop: { top: '-16.26%', height: '116.12%' } },
    card_width: 210,
    sort_order: 100,
    is_active: true,
  },
  {
    id: 'preview-mentor-11',
    image_url: '/images/landing/mentors/cards/박민정.png',
    mentor_name: '박민정',
    badge: '해외유학 위닝 14기',
    title_lines: ['박민정 멘토', 'Syracuse University 법학전공'],
    photo_url: '/images/landing/mentors/photos/박민정.png',
    photo: { top: 100, left: 5, width: 200, height: 280 },
    card_width: 210,
    sort_order: 110,
    is_active: true,
  },
  {
    id: 'preview-mentor-12',
    image_url: '/images/landing/mentors/cards/김정윤.png',
    mentor_name: '김정윤',
    badge: '위닝 9기',
    title_lines: ['김정윤 멘토', '성균관대 국제통상학과'],
    photo_url: '/images/landing/mentors/photos/김정윤.png',
    photo: { top: 111, left: 0, width: 210, height: 270 },
    card_width: 210,
    sort_order: 120,
    is_active: true,
  },
  {
    id: 'preview-mentor-13',
    image_url: '/images/landing/mentors/cards/손주연.png',
    mentor_name: '손주연',
    badge: '위닝 8기',
    title_lines: ['손주연 멘토', '한양대 미디어커뮤니케이션'],
    photo_url: '/images/landing/mentors/photos/손주연.png',
    photo: { top: 87, left: 0, width: 210, height: 286 },
    card_width: 210,
    sort_order: 130,
    is_active: true,
  },
  {
    id: 'preview-mentor-14',
    image_url: '/images/landing/mentors/cards/신영진.png',
    mentor_name: '신영진',
    badge: '학습 위닝 2기',
    title_lines: ['신영진 멘토', '대구한의대 한의예과'],
    photo_url: '/images/landing/mentors/photos/신영진.png',
    photo: { top: 98, left: 17, width: 200, height: 300 },
    card_width: 210,
    sort_order: 140,
    is_active: true,
  },
  {
    id: 'preview-mentor-15',
    image_url: '/images/landing/mentors/cards/정재웅.png',
    mentor_name: '정재웅',
    badge: '위닝 13기',
    title_lines: ['정재웅 멘토', '홍익대 디자인컨버전스학과'],
    photo_url: '/images/landing/mentors/photos/정재웅.png',
    photo: { top: 109, left: 0, width: 210, height: 271 },
    card_width: 210,
    sort_order: 150,
    is_active: true,
  },
  {
    id: 'preview-mentor-16',
    image_url: '/images/landing/mentors/cards/성민우.png',
    mentor_name: '성민우',
    badge: '위닝 14기',
    title_lines: ['성민우 멘토', '대구한의대 한의학과'],
    photo_url: '/images/landing/mentors/photos/성민우.png',
    photo: { top: 110, left: 0, width: 210, height: 270 },
    card_width: 210,
    sort_order: 160,
    is_active: true,
  },
  {
    id: 'preview-mentor-17',
    image_url: '/images/landing/mentors/cards/최정연.png',
    mentor_name: '최정연',
    badge: '아트멘토 위닝 1기',
    title_lines: ['최정연 멘토', '서울대 공예과'],
    photo_url: '/images/landing/mentors/photos/최정연.png',
    photo: { top: 110, left: 0, width: 210, height: 280 },
    card_width: 210,
    sort_order: 170,
    is_active: true,
  },
  {
    id: 'preview-mentor-18',
    image_url: '/images/landing/mentors/cards/이승현.png',
    mentor_name: '이승현',
    badge: '학습 위닝 2기',
    title_lines: ['이승현 멘토', '연세대 신소재 공학과'],
    photo_url: '/images/landing/mentors/photos/이승현.png',
    photo: { top: 110, left: 0, width: 210, height: 269 },
    card_width: 210,
    sort_order: 180,
    is_active: true,
  },
  {
    id: 'preview-mentor-19',
    image_url: '/images/landing/mentors/cards/한정원.png',
    mentor_name: '한정원',
    badge: '학습 위닝 2기',
    title_lines: ['한정원 멘토', '카네기 맬런 대학교', '전기 및 컴퓨터 공학'],
    photo_url: '/images/landing/mentors/photos/한정원.png',
    photo: { top: 110, left: 11, width: 210, height: 254 },
    card_width: 210,
    sort_order: 190,
    is_active: true,
  },
  {
    id: 'preview-mentor-20',
    image_url: '/images/landing/mentors/cards/정채윤.png',
    mentor_name: '정채윤',
    badge: '위닝 10기',
    title_lines: ['정채윤 멘토', '가천대 한의예과'],
    photo_url: '/images/landing/mentors/photos/정채윤.png',
    photo: { top: 100, left: 0, width: 210, height: 280 },
    card_width: 210,
    sort_order: 200,
    is_active: true,
  },
  {
    id: 'preview-mentor-21',
    image_url: '/images/landing/mentors/cards/함다현.png',
    mentor_name: '함다현',
    badge: '위닝 3기',
    title_lines: ['함다현 멘토', '홍익대 회화과'],
    photo_url: '/images/landing/mentors/photos/함다현.png',
    photo: { top: 100, left: 0, width: 210, height: 264 },
    card_width: 210,
    sort_order: 210,
    is_active: true,
  },
  {
    id: 'preview-mentor-22',
    image_url: '/images/landing/mentors/cards/한혜원.png',
    mentor_name: '한혜원',
    badge: '위닝 15기',
    title_lines: ['한혜원 멘토', '한양대 자율전공'],
    photo_url: '/images/landing/mentors/photos/한혜원.png',
    photo: { top: 102, left: 0, width: 200, height: 268 },
    card_width: 210,
    sort_order: 220,
    is_active: true,
  },
];

// ---------------------------------------------------------------------
// companyNews : 소식 섹션 좌측 회사소식 (company_news, NewsSection)
// 미사용(실 DB 전환됨) — Home.jsx가 이제 company_news 테이블을 직접 fetch함.
// select: 'id, title, created_at, is_pinned, sort_order, image_urls'
// image_urls[0]이 있으면 썸네일, 없으면 placeholder (NewsSection.CompanyNewsRow)
// 1건은 썸네일 렌더 확인용으로 서비스 아이콘 재사용
// ---------------------------------------------------------------------
export const companyNews = [
  {
    id: 'preview-news-01',
    title: '위닝에듀, AI팀 매칭 특허 출원 완료',
    created_at: '2026-07-14',
    is_pinned: true,
    sort_order: 1,
    image_urls: ['/images/landing/services/free-diagnosis.png'], // 썸네일 렌더 확인용
  },
  {
    id: 'preview-news-02',
    title: '위닝에듀, AI팀 매칭 특허 출원 완료',
    created_at: '2026-07-14',
    is_pinned: true,
    sort_order: 2,
    image_urls: [], // placeholder 렌더 확인용
  },
  {
    id: 'preview-news-03',
    title: '위닝에듀, AI팀 매칭 특허 출원 완료',
    created_at: '2026-07-14',
    is_pinned: true,
    sort_order: 3,
    image_urls: [], // placeholder 렌더 확인용
  },
];

// ---------------------------------------------------------------------
// notices : 소식 섹션 우측 공지사항 (notices, NewsSection)
// 미사용(실 DB 전환됨) — Home.jsx가 이제 notices 테이블을 직접 fetch함.
// select: 'id, title, created_at, is_pinned, sort_order'
// ---------------------------------------------------------------------
export const notices = [
  {
    id: 'preview-notice-01',
    title: '[중요] 개인정보처리방침 개정 안내 (2028년 08월 01일 시행)',
    created_at: '2026-07-14',
    is_pinned: true,
    sort_order: 1,
  },
  {
    id: 'preview-notice-02',
    title: '[중요] 개인정보처리방침 개정 안내 (2028년 08월 01일 시행)',
    created_at: '2026-07-14',
    is_pinned: true,
    sort_order: 2,
  },
  {
    id: 'preview-notice-03',
    title: '[중요] 개인정보처리방침 개정 안내 (2028년 08월 01일 시행)',
    created_at: '2026-07-14',
    is_pinned: true,
    sort_order: 3,
  },
];

export default {
  banners,
  sideBanners,
  universities,
  services,
  mentors,
  companyNews,
  notices,
};
