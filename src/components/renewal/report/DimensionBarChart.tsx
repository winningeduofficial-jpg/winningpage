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
// R3(2026-08-11) — 데스크톱 고정 gap(3.75rem×2 + 4.625rem + 14.4375rem + 3.75rem ≈ 30rem/480px)은
// 390px 모바일에 들어가지 않는다. ScoreBar 를 responsive(flex-1)로 바꿔 남는 폭을 흡수시키고
// 좌우 라벨만 축소 고정폭으로 남긴다 — 데스크톱은 lg: 로 원래 값 그대로 되돌린다.
const DimensionBarChart = ({ areas }: DimensionBarChartProps) => {
  return (
    <div className="mt-6 flex flex-col gap-2">
      {/*
        fd-dim-row / fd-dim-label / fd-dim-bar / fd-dim-status — 인쇄 훅. 이 컴포넌트는
        hidden/lg:block 이 아니라 같은 요소에 lg: 로 값만 바꾸는 방식이라(ReportSheetA4 R3
        주석 참고) report-print.css 가 데스크톱 값(기존 lg: 리터럴과 동일한 rem 값)을
        !important 로 되돌린다.
      */}
      {areas.map((area) => (
        <div
          key={area.name}
          className="fd-dim-row flex h-auto items-center gap-3 lg:h-5 lg:gap-[3.75rem]"
        >
          {/* text-base(16px) 유지 — 본문 최소 크기. 폭만 데스크톱(4.625rem)보다 좁혀 4~5자
              영역명이 필요하면 자연스럽게 2줄로 접히게 한다(줄바꿈 허용, nowrap 금지).
              break-keep — PriorityTable/AdmissionSection 과 동일한 사유로 좁은 칸에서
              "교과 관리" 가 "관/리" 처럼 음절 단위로 쪼개지는 것을 막는다. */}
          <span className="fd-dim-label w-14 shrink-0 break-keep text-base text-[#525252] lg:w-[4.625rem]">
            {area.name}
          </span>
          <ScoreBar
            score={area.score}
            tone={area.tone}
            responsive
            className="fd-dim-bar flex-1 lg:flex-none"
          />
          <span className="fd-dim-status w-16 shrink-0 text-right text-base text-[#525252] lg:w-[3.75rem] lg:text-left lg:whitespace-nowrap">
            {area.status}
          </span>
        </div>
      ))}
    </div>
  );
};

export default DimensionBarChart;
