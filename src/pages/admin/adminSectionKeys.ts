// CONFIGS(Admin.tsx)의 각 도메인 섹션 키를 라우터 계층(App.jsx)에서 개별 <Route>로
// 매핑하기 위한 정적 목록이다. App.jsx가 Admin.tsx(CONFIGS 조립 + 도메인 config
// 파일 8종 + 폼 컴포넌트)를 직접 import하면 /admin에 진입하지 않는 사용자도 그
// 무게를 초기 번들에서 받게 된다 — Admin이 lazy(() => import("./pages/Admin"))로
// 분리돼 있는 이유와 같은 제약이라, 여기서는 문자열 키만 별도로 들고 있는다.
// CONFIGS와의 어긋남은 Admin.tsx 모듈 스코프의 dev 전용 검증(assertAdminSectionKeysInSync)이 잡는다.
export const ADMIN_SECTION_KEYS = [
  // 메인 관리
  "popups",
  "banners",
  "sideBanners",
  "universityAcceptances",
  "programCategories",
  "mentorStrategies",
  "pageContents",
  "premiumBookPages",
  "premiumConsults",
  // 게시판 관리
  "notices",
  "companyNews",
  "galleries",
  "faqs",
  "mentorApplyFaqs",
  "mentorApplyCopy",
  "learningDiagnosis",
  "learningDiagnosisV2SurveyCopy",
  // 게시판 관리 — 대입정보(수시정시합격/특목고합격/대입모집요강 계열, 탭 하위 키 포함)
  "specialHighschool",
  "specialHighschoolRates",
  "acceptanceRates",
  "admissionCaseLogos",
  "admissionGuidelines",
  "admissionUniversities",
  "admissionResults",
  "trendingDepartments",
  "admissionSusiJungsi",
  // 회원 관리
  "members",
  "enrollments",
  "mentorApplications",
  // 프로그램 관리
  "dailyEntries",
  "usageStatus",
  // 위닝관리
  "winningSuhaengTopicDb",
  "winningSuhaengResourceDb",
  "winningSetukDb",
  "winningDeepReportDb",
  "winningStudentRecordDb",
  "winningBaseData",
  "winningDbInputs",
  // 수입·매출 관리
  "payments",
  "settlements",
  "dailySettlements",
  "refunds",
  "refundRequests",
  "coupons",
  // 목표관리
  "goalUniversityCuts",
  "goalStudents",
] as const;

export type AdminSectionKey = (typeof ADMIN_SECTION_KEYS)[number];

export const ADMIN_DEFAULT_SECTION_KEY: AdminSectionKey = "popups";
