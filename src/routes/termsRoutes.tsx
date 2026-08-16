import { Route } from "react-router";
import ParentMarketing from "../pages/terms/ParentMarketing";
import ParentPrivacy from "../pages/terms/ParentPrivacy";
import ParentService from "../pages/terms/ParentService";
import StudentIdentity from "../pages/terms/StudentIdentity";
import StudentMarketing from "../pages/terms/StudentMarketing";
import StudentPrivacy from "../pages/terms/StudentPrivacy";
import StudentPromotion from "../pages/terms/StudentPromotion";
import StudentService from "../pages/terms/StudentService";

// 약관 8종(§5.2) — 학생 5종 + 학부모 3종, 전부 정적 문서 페이지
export default function termsRoutes() {
  return (
    <>
      <Route path="/terms/student/service" element={<StudentService />} />
      <Route path="/terms/student/privacy" element={<StudentPrivacy />} />
      <Route path="/terms/student/identity" element={<StudentIdentity />} />
      <Route path="/terms/student/marketing" element={<StudentMarketing />} />
      <Route path="/terms/student/promotion" element={<StudentPromotion />} />
      <Route path="/terms/parent/service" element={<ParentService />} />
      <Route path="/terms/parent/privacy" element={<ParentPrivacy />} />
      <Route path="/terms/parent/marketing" element={<ParentMarketing />} />
    </>
  );
}
