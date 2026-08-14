// 이용신청 > 멘토신청(/mentor-apply) 이미지 에셋 경로 단일 정본.
//
// 왜 이 파일이 있나 —
//   Figma(파일 hsokTD6OilcNEXyCR24sn4, 정본 프레임 3362:2755)에서 내려받은 에셋을
//   `public/images/mentor-apply/` 에 캐시해 두고, 섹션 컴포넌트는 리터럴 경로 대신 이 모듈만
//   import 한다. Figma asset URL 은 발급 후 약 7일이면 만료되므로 URL 을 코드에 박으면 안 되고,
//   경로 문자열을 컴포넌트마다 복붙하면 파일명이 바뀔 때 조용히 깨진다.
//   키는 `src/data/mentorApply.js` 의 MAJOR_CATEGORIES / BENEFITS / COUNSEL_FIELDS 의 `key` 와
//   1:1로 맞췄다 — 카피 배열을 map 하면서 `MENTOR_ASSETS.majors[item.key]` 로 바로 꺼내 쓰라는 뜻이다.
//
// 경로는 전부 `public/` 기준 절대 경로(Vite 는 public 하위를 루트로 서빙)라 `/images/...` 로 시작한다.

const BASE = "/images/mentor-apply";

// ---------------------------------------------------------------------------
// §1 히어로 배경 (3362:2758)
// ---------------------------------------------------------------------------
// 원본 4096×2731 / 17.6MB PNG 는 WebP 로 변환 + 1920/1280/768 리사이즈 세트로 교체했다
// (원본 종횡비 유지). `src` 는 <img> 의 폴백/기본값(1280w)이고, `srcSet` 으로 실제 브라우저가
// 뷰포트에 맞는 폭을 고른다. 원본 PNG 는 삭제했다 — 되살리지 말 것.
// 히어로 딤(3362:2759)은 rgba(0,0,0,0.2) 단색 레이어라 에셋이 아니다 — CSS 로 처리한다.
const heroBg = {
  src: `${BASE}/hero-bg-1280.webp`,
  srcSet: `${BASE}/hero-bg-768.webp 768w, ${BASE}/hero-bg-1280.webp 1280w, ${BASE}/hero-bg-1920.webp 1920w`,
};

// ---------------------------------------------------------------------------
// §2 모집 대상 계열 8종 (3362:2912 하위) — 라인아트 SVG, 112×93 박스, 스트로크/면 #013262
// ---------------------------------------------------------------------------
// 시안에서는 계열별로 path 그룹이 최대 6조각까지 쪼개져 있으나(인문 5 / 예체능 6),
// 조각을 개별 <img> 로 절대배치하면 배치가 깨지므로 **그룹 노드 단위 SVG export = 계열당 1파일**로
// 병합해 저장했다. export 에 따라온 조상 배경 사각형(112×93 플레이스홀더, 페이지 배경 1920×10722,
// 섹션 배경 1920×815)은 불투명하게 딸려와 회색 박스로 보이므로 전부 제거했다 — 순수 일러스트만 남았다.
const majors = {
  medical: `${BASE}/major-medical.svg`, // 청진기
  engineering: `${BASE}/major-engineering.svg`, // 로봇 팔
  naturalScience: `${BASE}/major-natural-science.svg`, // 삼각플라스크
  education: `${BASE}/major-education.svg`, // 깃발 달린 학교 건물
  business: `${BASE}/major-business.svg`, // 막대그래프 + 상승 화살표
  socialScience: `${BASE}/major-social-science.svg`, // 지구본
  humanities: `${BASE}/major-humanities.svg`, // 석고 흉상
  arts: `${BASE}/major-arts.svg`, // 팔레트 + 붓
};

// ---------------------------------------------------------------------------
// §3 활동 혜택 3종 (3408:4297 / 4305 / 4313) — 3D 아이소메트릭 PNG, 150×150 슬롯
// ---------------------------------------------------------------------------
// 배경이 제거된(투명) 원본 변형을 받았다. 해상도는 슬롯 대비 약 2배(명세 §3 "2x 에셋 확보 권장").
const benefits = {
  stipend: `${BASE}/benefit-stipend.png`, // 활동비 지급
  certificate: `${BASE}/benefit-certificate.png`, // 활동 인증서 발급
  training: `${BASE}/benefit-training.png`, // 정기 교육 제공
};

// ---------------------------------------------------------------------------
// §4 상담 분야 7종 (3408:4556 ~ 4604) — 3D 아이소메트릭 PNG, 150×150 슬롯
// ---------------------------------------------------------------------------
// ⚠ 유니크 파일은 6개다. `planning`(계획·시간관리)과 `admissionStrategy`(대학·입시전략)가
//   시안에서 **동일한 달력+시계 이미지**를 공유한다(이미지 노드명·Rectangle ID·export 바이트 모두 일치).
//   디자이너 미완/플레이스홀더로 판단되나 시안이 그러하므로 두 키가 같은 파일을 가리키게 두었다 —
//   입시전략 전용 아이콘이 확정되면 admissionStrategy 만 새 파일로 교체하면 된다(명세 확인 항목 ⑪).
const fields = {
  studyMethod: `${BASE}/field-study-method.png`, // 공부방법 — 전구 + 책
  planning: `${BASE}/field-planning.png`, // 계획·시간관리 — 달력 + 시계
  schoolExam: `${BASE}/field-school-exam.png`, // 내신·시험 대비 — 성적표 + 연필
  career: `${BASE}/field-career.png`, // 진로·학과 — 학사모 + 책
  admissionStrategy: `${BASE}/field-planning.png`, // ⚠ planning 과 동일 파일(위 주석 참고)
  performanceRecord: `${BASE}/field-performance-record.png`, // 수행평가·학생부 — 돋보기 + 리포트
  motivation: `${BASE}/field-motivation.png`, // 공부 의욕·고민 — 스탠드 + 책
};

export const MENTOR_ASSETS = {
  heroBg,
  majors,
  benefits,
  fields,
};
