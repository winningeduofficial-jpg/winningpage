import type { RouteObject } from "react-router";
import SpecialHighschool from "@/pages/premium/SpecialHighschool";

// 프리미엄 랜딩 — /page/premium-special-highschool(특목고입학 A 프로그램).
// ⚠️ 반드시 dynamicPageRoutes(/page/:slug)보다 먼저 조립한다 — 아래로 내려가면
// DynamicPage가 먼저 매칭해 신규 페이지가 뜨지 않는다(applyRoutes.tsx:7 동일 규약).
const premiumRoutes: RouteObject[] = [
  { path: "/page/premium-special-highschool", Component: SpecialHighschool },
];

export default premiumRoutes;
