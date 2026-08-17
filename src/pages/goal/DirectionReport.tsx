import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import GoalCard from "@/components/goal/GoalCard";
import DirectionReportBody from "@/components/goal/report/DirectionReportBody";
import { fetchGoalReport } from "@/lib/goalApi";

const VALID_TABS = ["naesin", "jeongsi"] as const;
type DirectionTab = (typeof VALID_TABS)[number];

// DirectionReportBody.tsx의 DirectionReport 타입과 동일한 shape — api/goal/report.js
// buildDirectionReport()가 만드는 그대로다(GrowthReport.tsx의 동일 패턴 참고).
type DirectionReportData = {
  heading?: string;
  meta?: string;
  periodChips: Array<{ value: string; label: string }>;
  activePeriod?: string;
  summary: { meta?: string; typeLabel?: string; body?: string };
  subjects: Array<{
    name: string;
    zoneLabel?: string;
    badge?: string;
    body?: string;
    materials?: string[];
  }>;
};

type DirectionReportResult =
  | { kind: "success"; report: DirectionReportData }
  | { kind: "awaiting-cuts" }
  | { kind: "not-onboarded" }
  | { kind: "no-session" }
  | { kind: "error" };

// 학습방향 리포트 라우트(#37 내신 탭 / #38 정시 탭) — fetch 훅을 여기서 소유한다
// (DirectionReportBody는 mock을 뗀 순수 프레젠테이션). 쿼리 파라미터 `tab`(내신/정시)과
// `period`(기간 칩 value — api/goal/report.js가 돌려주는 periodChips[].value 중 하나) 둘 다
// URL에 유지한다. `period`를 생략하면 서버가 가장 최근 회차를 기본값으로 고른다
// (api/goal/report.js buildDirectionReport() — options[0]).
export default function DirectionReport() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const tab: DirectionTab = VALID_TABS.includes(tabParam as DirectionTab)
    ? (tabParam as DirectionTab)
    : "naesin";
  const periodParam = searchParams.get("period") || undefined;

  const [result, setResult] = useState<DirectionReportResult | null>(null);

  useEffect(() => {
    let alive = true;
    setResult(null);
    fetchGoalReport("direction", periodParam, tab).then(
      (r: DirectionReportResult) => {
        if (alive) setResult(r);
      },
    );
    return () => {
      alive = false;
    };
  }, [tab, periodParam]);

  // 서버가 고른 기본 회차를 URL에 반영한다 — 새로고침·공유 링크에서도 같은 회차가 열리도록.
  useEffect(() => {
    if (
      result?.kind === "success" &&
      !periodParam &&
      result.report.activePeriod
    ) {
      // 클로저 안에서는 위 if 가드의 narrowing이 유지되지 않아 로컬 변수로 한 번 받아둔다.
      const activePeriod = result.report.activePeriod;
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          params.set("period", activePeriod);
          return params;
        },
        { replace: true },
      );
    }
  }, [result, periodParam, setSearchParams]);

  function handleTabChange(nextTab: string) {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      params.set("tab", nextTab);
      params.delete("period"); // 탭이 바뀌면 그 탭의 회차 목록으로 새로 고른다.
      return params;
    });
  }

  function handlePeriodChange(nextPeriod: string) {
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
      <div className="max-w-goal-content px-[3rem] pb-24 pt-[6.25rem]">
        <GoalCard tone="neutral" className="px-[2rem] py-[1.75rem]">
          <p className="text-[0.9375rem] leading-[1.4] text-ink-sub">
            {message}
          </p>
        </GoalCard>
      </div>
    );
  }

  return (
    <DirectionReportBody
      tab={tab}
      onTabChange={handleTabChange}
      report={result.report}
      onPeriodChange={handlePeriodChange}
    />
  );
}
