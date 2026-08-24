import type { RouteObject } from "react-router";
import {
  PREMIUM_ADMISSION_A_PATH,
  PREMIUM_ADMISSION_S_PATH,
  PREMIUM_GLOBAL_UNIVERSITY_PATH,
  PREMIUM_GRADUATE_SCHOOL_PATH,
  PREMIUM_INTERNATIONAL_SCHOOL_PATH,
  PREMIUM_RETURNING_STUDENT_PATH,
  PREMIUM_SPECIAL_HIGHSCHOOL_PATH,
} from "@/components/premium/premiumRoutesPaths";
import AdmissionConsultingA from "@/pages/premium/AdmissionConsultingA";
import AdmissionConsultingS from "@/pages/premium/AdmissionConsultingS";
import GlobalUniversityConsulting from "@/pages/premium/GlobalUniversityConsulting";
import GraduateSchoolAdmission from "@/pages/premium/GraduateSchoolAdmission";
import InternationalSchool from "@/pages/premium/InternationalSchool";
import ReturningStudentAdmission from "@/pages/premium/ReturningStudentAdmission";
import SpecialHighschoolAdmission from "@/pages/premium/SpecialHighschoolAdmission";

// 프리미엄 랜딩 — /page/premium/<program>(대입컨설팅 A·S + 대학원입학·해외명문대·특목고입학·
// 국제학교 학습관리·국제・해외고 국내대 입학컨설팅, 전 6종 코드 페이지). premium-db-decouple로
// CMS(page_contents/DynamicPage) 의존을 완전히 제거했다 — 프리미엄 프로그램 6종은 전부 이
// 코드 라우트가 전담하고, catch-all(/page/premium/:program → DynamicPage)은 더 이상 없다.
// (구 페이지_contents 프리미엄 행은 20260824000007에서 삭제.) 구 /page/premium-* 경로는 코드
// 라우트・DB 행 모두 없음 → catch-all(dynamicPageRoutes)에서 자연 404.
const premiumRoutes: RouteObject[] = [
  { path: PREMIUM_ADMISSION_A_PATH, Component: AdmissionConsultingA },
  { path: PREMIUM_ADMISSION_S_PATH, Component: AdmissionConsultingS },
  { path: PREMIUM_GRADUATE_SCHOOL_PATH, Component: GraduateSchoolAdmission },
  {
    path: PREMIUM_GLOBAL_UNIVERSITY_PATH,
    Component: GlobalUniversityConsulting,
  },
  {
    path: PREMIUM_SPECIAL_HIGHSCHOOL_PATH,
    Component: SpecialHighschoolAdmission,
  },
  {
    path: PREMIUM_INTERNATIONAL_SCHOOL_PATH,
    Component: InternationalSchool,
  },
  {
    path: PREMIUM_RETURNING_STUDENT_PATH,
    Component: ReturningStudentAdmission,
  },
];

export default premiumRoutes;
