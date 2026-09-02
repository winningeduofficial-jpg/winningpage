import { useEffect, useState } from "react";
import type { RouteObject } from "react-router";
import { Link, Navigate, useLocation, useParams } from "react-router";
import { useMemberType } from "@/hooks/useMemberType";
import { supabase } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// 알림톡 승인 링크 → 실제 라우트 리다이렉트.
//
// 알리고에 **이미 승인된** 템플릿의 버튼 링크가 실제 앱 라우트와 다르다.
// 템플릿을 고치면 재심사에 며칠이 걸리므로, 앱이 승인된 주소를 받아주는 쪽으로
// 맞춘다. 여기 있는 경로는 전부 "알림톡이 부르는 주소"이고, 사람이 화면에서
// 눌러 들어오는 길이 아니다 — 새 링크가 필요하면 실제 라우트를 쓸 것.
//
//   승인 링크                                          실제(학생)
//   /services/goal/reports/weekly/{reportId}    →  /app/goal/reports/growth?period=weekly&at=…
//   /services/goal/reports/monthly/{reportId}   →  /app/goal/reports/growth?period=monthly&at=…
//
//   실제(학부모, QA 시트 행210) — 알림톡은 학생이 아니라 approved 학부모에게만
//   발송된다(api/_lib/goalReportNotify.ts resolveParentRecipients). 그래서
//   버튼을 누르는 사람은 사실상 항상 학부모다. 로그인 사용자의 회원유형
//   (useMemberType)으로 분기한다.
//   /services/goal/reports/weekly/{reportId}    →  /mypage/children/{studentId}/report?period=weekly&at=…
//   /services/goal/reports/monthly/{reportId}   →  /mypage/children/{studentId}/report?period=monthly&at=…
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
//
//   2026-09-02(QA 시트 행210) — 학부모가 어느 자녀의 리포트인지 구분할 수
//   있어야 해서 reportId 형식을 `<기간키>.<학생profile id>` 로 확장한다
//   (api/cron/weekly-report.ts·monthly-report.ts 가 발신 시 병기). 템플릿
//   URL 자체는 안 바뀐다 — #{reportId} 변수값만 길어질 뿐이다. 기간키에는
//   '.'이 나오지 않으므로(YYYY-MM-DD, YYYY-MM) 첫 '.' 을 기준으로 나누면
//   되고, 학생 id가 없는 구 형식(발신 당시 병기 전 발송분·수기 발송)도 계속
//   파싱된다 — parseReportId 참고.
// ---------------------------------------------------------------------------

const VALID_PERIODS = new Set(["weekly", "monthly"]);

/**
 * reportId 변수값을 (기간키, 학생 profile id)로 나눈다.
 *
 *   "2026-08-17"                                → { at: "2026-08-17", studentProfileId: undefined }  (구 형식)
 *   "2026-08-17.3f2a9c1e-....-....-....-......"  → { at: "2026-08-17", studentProfileId: "3f2a9c1e-...." }
 *   undefined / ""                               → { at: undefined, studentProfileId: undefined }
 *
 * 첫 '.' 로만 나눈다 — 기간키(YYYY-MM-DD, YYYY-MM)에는 '.'이 나오지 않고
 * UUID에도 '.'이 없으므로 두 번째 이후 '.'을 걱정할 필요가 없다.
 */
export function parseReportId(reportId: string | undefined): {
  at: string | undefined;
  studentProfileId: string | undefined;
} {
  if (!reportId) return { at: undefined, studentProfileId: undefined };

  const dotIndex = reportId.indexOf(".");
  if (dotIndex === -1) return { at: reportId, studentProfileId: undefined };

  const at = reportId.slice(0, dotIndex) || undefined;
  const studentProfileId = reportId.slice(dotIndex + 1) || undefined;
  return { at, studentProfileId };
}

function buildReportSearch(period: string, at: string | undefined) {
  const search = new URLSearchParams({ period });
  // at 이 비어 있으면 붙이지 않는다 → API/화면이 오늘 기준 이번 주/달로
  // 기본값을 잡는다.
  if (at) search.set("at", at);
  return search;
}

type ParentChildRow = {
  student_profile_id: string;
  student_name: string;
  link_status: string;
};

/** 로그인 학부모의 approved 자녀 목록. null = 아직 로딩 중. */
function useApprovedChildren(enabled: boolean): ParentChildRow[] | null {
  const [children, setChildren] = useState<ParentChildRow[] | null>(null);

  useEffect(() => {
    if (!enabled) return undefined;

    let alive = true;
    setChildren(null);

    (async () => {
      const { data, error } = await supabase.rpc("fn_parent_children");
      if (!alive) return;

      if (error) {
        console.error("알림톡 리다이렉트 자녀 조회 실패:", error);
        setChildren([]);
        return;
      }

      setChildren((data || []).filter((row) => row.link_status === "approved"));
    })();

    return () => {
      alive = false;
    };
  }, [enabled]);

  return children;
}

function GoalReportRedirect() {
  const { period, reportId } = useParams();
  const location = useLocation();

  // 승인 문구에 없는 period 가 들어오면(오타·수기 발송 등) 주간으로 떨어뜨린다 —
  // 404 보다 낫다. 알림톡을 누른 사람에게 빈 화면을 보이지 않는 게 우선이다.
  const safePeriod = VALID_PERIODS.has(String(period)) ? period : "weekly";
  const { at, studentProfileId } = parseReportId(reportId);

  // 세션 + 회원유형이 아직 확정 전이면 아무것도 그리지 않는다 — 학생/학부모
  // 분기를 잘못 그렸다가 다시 갈아엎는 깜빡임을 피한다.
  const { loading: memberLoading, memberType } = useMemberType();
  const isParent = memberType === "parent";
  const children = useApprovedChildren(isParent);

  if (memberLoading) return null;

  // 비로그인 — 원래 이 알림톡 링크로 되돌아오게 하고 로그인부터 시킨다.
  // 로그인 후엔 세션이 생겨 이 컴포넌트가 다시 평가되고, 그때는 회원유형에
  // 맞는 목적지로 정확히 갈라진다(login 화면들이 쓰는 ?redirect= 관례,
  // src/lib/routeMiddleware.ts loginRedirect 참고).
  if (!memberType) {
    const target = `${location.pathname}${location.search}`;
    return (
      <Navigate to={`/login?redirect=${encodeURIComponent(target)}`} replace />
    );
  }

  if (isParent) {
    // fn_parent_children 조회가 아직 안 끝났으면 대기.
    if (children === null) return null;

    if (children.length === 0) {
      return <Navigate to="/mypage?tab=children" replace />;
    }

    const matched = studentProfileId
      ? children.find((c) => c.student_profile_id === studentProfileId)
      : undefined;

    const target = matched || (children.length === 1 ? children[0] : undefined);

    if (target) {
      const search = buildReportSearch(String(safePeriod), at);
      return (
        <Navigate
          to={`/mypage/children/${target.student_profile_id}/report?${search}`}
          replace
        />
      );
    }

    // 자녀가 둘 이상이고 reportId 로 특정할 수 없으면(구 형식 발송분 등) 고른다.
    const search = buildReportSearch(String(safePeriod), at);
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-white px-5 pt-16">
        <p className="text-[0.9375rem] font-medium text-ink">
          어느 자녀의 리포트를 보시겠어요?
        </p>
        <div className="flex w-full max-w-xs flex-col gap-2.5">
          {children.map((child) => (
            <Link
              key={child.student_profile_id}
              to={`/mypage/children/${child.student_profile_id}/report?${search}`}
              className="rounded-lg border border-line px-5 py-3 text-center text-[0.875rem] font-medium text-ink transition hover:bg-surface-04"
            >
              {child.student_name}
            </Link>
          ))}
        </div>
      </main>
    );
  }

  // 학생(그 외 회원유형 포함) — 기존 동작 그대로. 비로그인 처리는 이미 위에서
  // 끝났으므로 여기 도달했다면 로그인 상태이고, 목표관리 이용권 판정은
  // /app/goal 그룹의 requireGoalAccessMiddleware 가 그대로 맡는다.
  const search = buildReportSearch(String(safePeriod), at);
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
