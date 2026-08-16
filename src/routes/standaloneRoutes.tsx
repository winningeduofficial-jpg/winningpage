import { Route } from "react-router";
import LearningAnalysis from "../pages/LearningAnalysis";
import Reviews from "../pages/Reviews";
import Services from "../pages/Services";

// /reviews, /services, /learning-analysis — SiteLayout 밖 최상위 단독 라우트.
// 이 배치는 원본 그대로 유지한다 — SiteLayout 안으로 옮기지 마라.
export default function standaloneRoutes() {
  return (
    <>
      <Route path="/reviews" element={<Reviews />} />
      <Route path="/services" element={<Services />} />
      <Route path="/learning-analysis" element={<LearningAnalysis />} />
    </>
  );
}
