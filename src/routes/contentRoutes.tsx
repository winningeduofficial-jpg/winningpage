import { Route } from "react-router";
import CompanyNews from "../pages/CompanyNews";
import CompanyNewsList from "../pages/CompanyNewsList";
import ColumnDetail from "../pages/column/ColumnDetail";
import ColumnHome from "../pages/column/ColumnHome";
import ColumnList from "../pages/column/ColumnList";
import Events from "../pages/Events";
import Faq from "../pages/Faq";

// 공지/뉴스/FAQ/칼럼 — 마케팅 정보성 콘텐츠 그룹.
export default function contentRoutes() {
  return (
    <>
      <Route path="/events" element={<Events />} />
      <Route path="/company-news" element={<CompanyNews />} />
      <Route path="/company-news/list" element={<CompanyNewsList />} />
      <Route path="/faq" element={<Faq />} />
      <Route path="/info/column" element={<ColumnHome />} />
      <Route path="/info/column/list" element={<ColumnList />} />
      <Route path="/info/column/:id" element={<ColumnDetail />} />
    </>
  );
}
