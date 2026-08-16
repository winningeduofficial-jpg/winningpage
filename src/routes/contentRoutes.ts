import type { RouteObject } from "react-router";
import CompanyNews from "../pages/CompanyNews";
import CompanyNewsList from "../pages/CompanyNewsList";
import ColumnDetail from "../pages/column/ColumnDetail";
import ColumnHome from "../pages/column/ColumnHome";
import ColumnList from "../pages/column/ColumnList";
import Events from "../pages/Events";
import Faq from "../pages/Faq";

// 공지/뉴스/FAQ/칼럼 — 마케팅 정보성 콘텐츠 그룹.
const contentRoutes: RouteObject[] = [
  { path: "/events", Component: Events },
  { path: "/company-news", Component: CompanyNews },
  { path: "/company-news/list", Component: CompanyNewsList },
  { path: "/faq", Component: Faq },
  { path: "/info/column", Component: ColumnHome },
  { path: "/info/column/list", Component: ColumnList },
  { path: "/info/column/:id", Component: ColumnDetail },
];

export default contentRoutes;
