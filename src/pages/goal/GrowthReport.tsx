import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import GoalCard from "../../components/goal/GoalCard";
import GrowthReportBody from "../../components/goal/report/GrowthReportBody";
import { fetchGoalReport } from "../../lib/goalApi";

const VALID_PERIODS = ["weekly", "monthly"] as const;
type ReportPeriod = (typeof VALID_PERIODS)[number];

type GoalReportResult =
  | { kind: "success"; report: unknown }
  | { kind: "awaiting-cuts" }
  | { kind: "error" };

// 성장 리포트 라우트(#33 주간 / #34 월간) — fetch 훅을 여기서 소유한다(GrowthReportBody는
// 순수 프레젠테이션으로 mock을 뗐다). 쿼리 파라미터 `period`는 이 페이지의 탭 상태(주간/월간)만
// 담는다 — API의 `period`(그 주/달을 특정하는 YMD/YYYY-MM) 인자와는 별개다. 이번 범위엔
// 특정 과거 주·달을 골라 보는 UI가 없어(GoalTabs 2탭뿐) 항상 "이번 주/이번 달"만 조회한다
// (api/goal/report.js가 period 인자 생략 시 오늘 KST 기준으로 기본값을 잡는다).
export default function GrowthReport() {
  const [searchParams, setSearchParams] = useSearchParams();
  const periodParam = searchParams.get("period");
  const period: ReportPeriod = VALID_PERIODS.includes(
    periodParam as ReportPeriod,
  )
    ? (periodParam as ReportPeriod)
    : "weekly";

  // fetchGoalReport() 결과를 discriminated union 그대로 보관한다(재가공하지 않는다 —
  // goalApi.js의 kind 계약을 이 컴포넌트가 다시 해석하는 지점을 하나로 좁혀 둔다).
  // null = 아직 응답 도착 전(로딩 중). RequireGoalAccess가 이미 onboarded:true만
  // 통과시키므로 정상 경로에선 kind는 대개 'success'다 — 그 외는 방어적 분기.
  const [result, setResult] = useState<GoalReportResult | null>(null);

  useEffect(() => {
    let alive = true;
    setResult(null);
    fetchGoalReport(period).then((r: GoalReportResult) => {
      if (alive) setResult(r);
    });
    return () => {
      alive = false;
    };
  }, [period]);

  function handlePeriodChange(nextPeriod: ReportPeriod) {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      params.set("period", nextPeriod);
      return params;
    });
  }

  if (result === null || result.kind !== "success") {
    const message =
      result === null
        ? "리포트를 불러오는 중입니다…"
        : result.kind === "awaiting-cuts"
          ? "합격 기준 데이터를 준비 중입니다. 잠시 후 다시 확인해 주세요."
          : "리포트를 불러오지 못했습니다. 새로고침해 주세요.";

    return (
      <div className="max-w-goal-content px-[3rem] pb-24 pt-[3.75rem]">
        <GoalCard tone="neutral" className="px-[2rem] py-[1.75rem]">
          <p className="text-[0.9375rem] leading-[1.4] text-ink-sub">
            {message}
          </p>
        </GoalCard>
      </div>
    );
  }

  return (
    <GrowthReportBody
      period={period}
      onPeriodChange={handlePeriodChange}
      report={result.report}
    />
  );
}
