import { Outlet } from "react-router-dom";
import Header from "./Header";
import SiteFooter from "./SiteFooter";

// 헤더/푸터 전역 레이아웃. Header는 position:fixed, SiteFooter는 일반 흐름 배치라
// 개별 페이지에서 렌더하던 것과 시각적으로 동일한 DOM 순서(Header → 페이지 콘텐츠 → Footer)를
// 유지한다.
export default function SiteLayout() {
  return (
    <>
      <Header />
      <Outlet />
      <SiteFooter />
    </>
  );
}
