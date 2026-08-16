import type { RouteObject } from "react-router";
import { Navigate } from "react-router";
import MentorApply from "@/pages/MentorApply";
import PremiumApply from "@/pages/PremiumApply";

// 이용신청 > 프리미엄 이용 / 멘토신청 + 구 경로 리다이렉트.
// ⚠️ 반드시 dynamicPageRoutes(/page/:slug)보다 먼저 조립한다 — 아래로 내려가면
// DynamicPage가 먼저 매칭해 신규 페이지가 뜨지 않는다.
const applyRoutes: RouteObject[] = [
  { path: "/premium-apply", Component: PremiumApply },
  {
    path: "/page/premium-apply",
    Component: () => <Navigate to="/premium-apply" replace />,
  },

  { path: "/mentor-apply", Component: MentorApply },
  {
    path: "/page/mentor-apply",
    Component: () => <Navigate to="/mentor-apply" replace />,
  },
];

export default applyRoutes;
