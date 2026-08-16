import type { RouteObject } from "react-router";
import ParentMarketing from "../pages/terms/ParentMarketing";
import ParentPrivacy from "../pages/terms/ParentPrivacy";
import ParentService from "../pages/terms/ParentService";
import StudentIdentity from "../pages/terms/StudentIdentity";
import StudentMarketing from "../pages/terms/StudentMarketing";
import StudentPrivacy from "../pages/terms/StudentPrivacy";
import StudentPromotion from "../pages/terms/StudentPromotion";
import StudentService from "../pages/terms/StudentService";

// 약관 8종(§5.2) — 학생 5종 + 학부모 3종, 전부 정적 문서 페이지
const termsRoutes: RouteObject[] = [
  { path: "/terms/student/service", Component: StudentService },
  { path: "/terms/student/privacy", Component: StudentPrivacy },
  { path: "/terms/student/identity", Component: StudentIdentity },
  { path: "/terms/student/marketing", Component: StudentMarketing },
  { path: "/terms/student/promotion", Component: StudentPromotion },
  { path: "/terms/parent/service", Component: ParentService },
  { path: "/terms/parent/privacy", Component: ParentPrivacy },
  { path: "/terms/parent/marketing", Component: ParentMarketing },
];

export default termsRoutes;
