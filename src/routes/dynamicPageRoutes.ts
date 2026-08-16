import type { RouteObject } from "react-router";
import DynamicPage from "@/pages/DynamicPage";

// DB page_contents 기반 동적 정적 페이지. `/page/:slug` 와일드카드라
// applyRoutes(프리미엄이용/멘토신청) 뒤에 조립해야 한다.
const dynamicPageRoutes: RouteObject[] = [
  { path: "/page/:slug", Component: DynamicPage },
];

export default dynamicPageRoutes;
