import type { RouteObject } from "react-router";
import AdmissionConsulting from "@/pages/premium/AdmissionConsulting";

// 프리미엄 랜딩 — /page/premium-a(대입컨설팅 A 프로그램).
// ⚠️ 반드시 dynamicPageRoutes(/page/:slug)보다 먼저 조립한다 — 아래로 내려가면
// DynamicPage가 먼저 매칭해 신규 페이지가 뜨지 않는다(applyRoutes.tsx:7 동일 규약).
const premiumRoutes: RouteObject[] = [
  { path: "/page/premium-a", Component: AdmissionConsulting },
];

export default premiumRoutes;
