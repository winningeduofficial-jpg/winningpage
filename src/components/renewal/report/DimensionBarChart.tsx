import ScoreBar from "./ScoreBar";

type DimensionArea = {
  name: string;
  score: number;
  tone?: string;
  status?: string;
};

type DimensionBarChartProps = {
  areas: DimensionArea[];
};

// 6영역 수평 바 그래프 — StatusBadge 미사용(상태는 일반 텍스트), ScoreBar 소비.
// fill 폭은 ScoreBar 내부에서 점수→폭 선형 환산(결정6)으로 렌더된다.
// props: { areas } = [{ name, score, tone, status }] x6 — data.readiness.areas.
// A4 출력물 컨셉(2026-08-20) — 모바일 리플로우(R3)를 폐기하고 데스크톱 고정값 하나로 렌더한다.
const DimensionBarChart = ({ areas }: DimensionBarChartProps) => {
  return (
    <div className="mt-6 flex flex-col gap-2">
      {areas.map((area) => (
        <div key={area.name} className="flex h-5 items-center gap-perf-inset">
          {/* break-keep — PriorityTable/AdmissionSection 과 동일한 사유로 좁은 칸에서
              "교과 관리" 가 "관/리" 처럼 음절 단위로 쪼개지는 것을 막는다. */}
          <span className="w-18.5 shrink-0 break-keep text-base text-ink">
            {area.name}
          </span>
          <ScoreBar
            score={area.score}
            // exactOptionalPropertyTypes 대응 — undefined일 때 tone 키 자체를 생략(ScoreBar 미수정 범위).
            {...(area.tone !== undefined ? { tone: area.tone } : {})}
          />
          <span className="w-perf-inset shrink-0 whitespace-nowrap text-left text-base text-ink">
            {area.status}
          </span>
        </div>
      ))}
    </div>
  );
};

export default DimensionBarChart;
