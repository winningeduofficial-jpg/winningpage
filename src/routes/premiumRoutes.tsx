import type { RouteObject } from "react-router";
import { useParams } from "react-router";
import {
  PREMIUM_ADMISSION_A_PATH,
  PREMIUM_ADMISSION_S_PATH,
  PREMIUM_GLOBAL_UNIVERSITY_PATH,
  PREMIUM_GRADUATE_SCHOOL_PATH,
  PREMIUM_RETURNING_STUDENT_PATH,
  PREMIUM_SPECIAL_HIGHSCHOOL_PATH,
} from "@/components/premium/premiumRoutesPaths";
import DynamicPage from "@/pages/DynamicPage";
import AdmissionConsultingA from "@/pages/premium/AdmissionConsultingA";
import AdmissionConsultingS from "@/pages/premium/AdmissionConsultingS";
import GlobalUniversityConsulting from "@/pages/premium/GlobalUniversityConsulting";
import GraduateSchoolAdmission from "@/pages/premium/GraduateSchoolAdmission";
import ReturningStudentAdmission from "@/pages/premium/ReturningStudentAdmission";
import SpecialHighschoolAdmission from "@/pages/premium/SpecialHighschoolAdmission";

// /page/premium/:program → page_contents.slug `premium/${program}` 조회 래퍼(특목고입학·
// 대학원입학·해외명문대·국제학교·국제해외고 편입 5개 CMS 페이지). 대입컨설팅 A/S는 코드
// 페이지라 이 라우트보다 먼저 매칭돼야 한다(아래 배열 순서 참고).
function PremiumDynamicPage() {
  const { program } = useParams();

  return <DynamicPage slug={`premium/${program}`} />;
}

// 프리미엄 랜딩 — /page/premium/<program>(대입컨설팅 A·S + 대학원입학·해외명문대·
// 특목고입학·국제・해외고 국내대 입학컨설팅 코드 페이지 + CMS 1종). ⚠️ 반드시
// dynamicPageRoutes(/page/:slug)보다 먼저 조립한다 — 아래로 내려가면 DynamicPage가 먼저
// 매칭해 신규 페이지가 뜨지 않는다(applyRoutes.tsx:7 동일 규약). 구 /page/premium-* 경로는
// 코드 라우트·DB 행 모두 없음 → catch-all에서 자연 404.
// ⚠️ 순서 중요: 코드 페이지 라우트는 반드시 catch-all(/page/premium/:program)보다 앞에 와야
// 한다 — 아래로 내려가면 PremiumDynamicPage(CMS)가 먼저 매칭해 코드 페이지가 뜨지 않는다.
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
    path: PREMIUM_RETURNING_STUDENT_PATH,
    Component: ReturningStudentAdmission,
  },
  { path: "/page/premium/:program", Component: PremiumDynamicPage },
];

export default premiumRoutes;
