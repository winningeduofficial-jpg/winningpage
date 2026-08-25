import type { RouteObject } from "react-router";
import { Navigate, useParams } from "react-router";

// ---------------------------------------------------------------------------
// 알림톡 승인 링크 → 실제 라우트 리다이렉트.
//
// 알리고에 **이미 승인된** 템플릿의 버튼 링크가 실제 앱 라우트와 다르다.
// 템플릿을 고치면 재심사에 며칠이 걸리므로, 앱이 승인된 주소를 받아주는 쪽으로
// 맞춘다. 여기 있는 경로는 전부 "알림톡이 부르는 주소"이고, 사람이 화면에서
// 눌러 들어오는 길이 아니다 — 새 링크가 필요하면 실제 라우트를 쓸 것.
//
//   승인 링크                                          실제
//   /services/goal/reports/weekly/{reportId}    →  /app/goal/reports/growth?period=weekly&at=…
//   /services/goal/reports/monthly/{reportId}   →  /app/goal/reports/growth?period=monthly&at=…
//
// 가입 축하 알림톡의 /mypage/coupons 리다이렉트는 걷어냈다(2026-08-25) —
// 쿠폰함 화면을 만들지 않기로 하면서 그 템플릿을 **버튼 없는 문안으로
// 재심사**했기 때문이다. 그 버튼으로 들어온 사람은 한 명도 없다(알림톡이
// 배선되기 전이라 signupCoupon 은 한 번도 발송된 적이 없다).
//
// ⚠️ /services/goal 은 원래 마케팅 랜딩이다(serviceLandingRoutes). 그 아래
//   /reports/* 만 이 파일이 가로채므로 랜딩 자체는 영향이 없다.
//
// reportId 에 무엇이 들어가는가
//   리포트는 저장되지 않고 요청 시점에 계산된다 — goal_reports 같은 테이블이
//   없어서 "리포트 id"라는 게 애초에 존재하지 않는다. 대신 api/goal/report 가
//   period 인자를 받는다(주간=그 주 월요일 YMD, 월간=YYYY-MM). 그래서 알림톡을
//   보낼 때 #{reportId} 자리에 **그 기간 키**를 넣고, 여기서 ?at= 으로 넘긴다.
//   이렇게 해야 2주 뒤에 링크를 눌러도 그때의 리포트가 열린다 — 무시하면 항상
//   "이번 주"가 열려서 지난 알림톡을 누른 사람이 엉뚱한 내용을 본다.
// ---------------------------------------------------------------------------

const VALID_PERIODS = new Set(["weekly", "monthly"]);

function GoalReportRedirect() {
  const { period, reportId } = useParams();

  // 승인 문구에 없는 period 가 들어오면(오타·수기 발송 등) 주간으로 떨어뜨린다 —
  // 404 보다 낫다. 알림톡을 누른 사람에게 빈 화면을 보이지 않는 게 우선이다.
  const safePeriod = VALID_PERIODS.has(String(period)) ? period : "weekly";

  const search = new URLSearchParams({ period: String(safePeriod) });
  // reportId 가 비어 있으면 at 을 붙이지 않는다 → API 가 오늘 기준 이번 주/달로
  // 기본값을 잡는다(api/goal/report 상단 주석).
  if (reportId) search.set("at", reportId);

  return <Navigate to={`/app/goal/reports/growth?${search}`} replace />;
}

const alimtalkLinkRoutes: RouteObject[] = [
  {
    path: "/services/goal/reports/:period/:reportId",
    Component: GoalReportRedirect,
  },
  // reportId 없이 온 경우도 받는다(문구 수정·수기 발송 대비).
  {
    path: "/services/goal/reports/:period",
    Component: GoalReportRedirect,
  },
];

export default alimtalkLinkRoutes;
