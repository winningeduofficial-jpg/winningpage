import type { RouteObject } from "react-router";
import MyPage from "@/pages/MyPage";
import ChildDiagnosisReport from "@/pages/mypage/ChildDiagnosisReport";
import ChildDiagnosisReports from "@/pages/mypage/ChildDiagnosisReports";
import ChildReport from "@/pages/mypage/ChildReport";

const mypageRoutes: RouteObject[] = [
  // 마이페이지 리뉴얼(Figma 3762:18713 학생/멘토, 3762:20390 학부모) — 공통
  // 헤더/푸터가 있는 시안이라 SiteLayout 안으로 편입(구 /app/goal, /admin과 달리
  // 별도 셸이 없다). 탭 상태는 MyPage.jsx 내부에서 ?tab= 쿼리로 관리한다.
  { path: "/mypage", Component: MyPage },

  // 학부모가 자녀의 성장 리포트를 여는 뷰어. 본문(GrowthReportBody)은 학생
  // 뷰와 공유하지만 셸은 다르다 — 목표관리 앱 셸(GoalAppLayout, 사이드바)이
  // 아니라 마이페이지와 같은 SiteLayout 안에 둔다. 학부모는 목표관리 앱의
  // 이용자가 아니라 열람자라서 사이드바 메뉴(타이머·일일기록 등)가 의미가
  // 없기 때문이다. 권한 판정은 ChildReport 안에서 fn_parent_children 으로 한다.
  { path: "/mypage/children/:studentId/report", Component: ChildReport },

  // B5 — 학부모가 자녀의 학습진단 리포트를 여는 뷰어(목록 → 회차 상세).
  // 위 성장 리포트와 같은 셸 원칙(SiteLayout 안, fn_parent_children 게이트)을 쓰지만
  // 별도 라우트 세그먼트(report/diagnosis)로 둔다 — 서비스가 다르면 리포트 도메인도
  // 다르다(diagnosis_reports는 goal report와 무관한 별도 테이블·권한 판정 경로).
  {
    path: "/mypage/children/:studentId/report/diagnosis",
    Component: ChildDiagnosisReports,
  },
  {
    path: "/mypage/children/:studentId/report/diagnosis/:attemptId",
    Component: ChildDiagnosisReport,
  },
];

export default mypageRoutes;
