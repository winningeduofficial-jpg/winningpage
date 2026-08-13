import GoalCard from "../GoalCard";
import GoalProgressBar from "../GoalProgressBar";
import DeltaBadge from "../DeltaBadge";

// Row3 카드③ `합격 가능성 변화` — docs/figma-goal/00-INDEX.md §5-4 `AdmissionChanceCard`.
// 대학 2블록 × (수시/정시) 2행. 데이터 형태는 goalMock.js의 `mockAdmissionChance`와 동일 스키마
// (`{ university, susi: { delta, rate }, jeongsi: { delta, rate } }`)로 맞춰 주간(mockAdmissionChance)
// ↔ 월간(monthlyAdmissionChance)을 동일 컴포넌트로 렌더한다.
//
// ⚠︎ 결함3: 시안은 4행 모두 채움 80px 고정이라 확률값과 무관했다 — 여기서는 rate(0~100 사이의
// 실제 퍼센트 값)를 그대로 GoalProgressBar의 value/max=100에 넘겨 값 비례로 렌더한다.
//
// 결함5 대응: `delta`는 `{ direction: 'up'|'down', value: '0.42%' }` 구조다. 예전엔 `▲ 0.42%` 같은
// 문자열을 정규식으로 까서 글리프를 떼어내고 direction="up"을 하드코딩했는데, `▼`가 들어오면
// `▲▼ 0.5%`처럼 이중 글리프로 렌더되는 결함이 있었다. DeltaBadge가 direction/tone을 분리 설계한
// 취지를 살려 여기서는 문자열 파싱을 완전히 제거한다. 합격률은 높을수록 좋은 지표이므로
// direction="up" → tone="positive", "down" → tone="negative"로 그대로 대응시킨다.
function AdmissionBlock({ university, susi, jeongsi }) {
  const rows = [
    { label: "수시", ...susi },
    { label: "정시", ...jeongsi },
  ];

  return (
    <div className="flex flex-col gap-3">
      <h4 className="text-[0.875rem] font-semibold leading-[1.4] text-ink-strong">
        {university}
      </h4>
      {rows.map((row) => (
        <div key={row.label} className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-[0.8125rem] leading-[1.4]">
            <span className="text-ink-sub">{row.label}</span>
            <span className="flex items-center gap-2">
              <DeltaBadge
                value={row.delta.value}
                direction={row.delta.direction}
                tone={row.delta.direction === "down" ? "negative" : "positive"}
              />
              <span className="font-semibold text-ink-strong">{row.rate}%</span>
            </span>
          </div>
          <GoalProgressBar value={row.rate} max={100} thickness="0.375rem" />
        </div>
      ))}
    </div>
  );
}

export default function AdmissionChanceCard({ title, data }) {
  return (
    <GoalCard
      tone="neutral"
      className="flex min-h-[22.4375rem] flex-col gap-5 px-6 py-6"
    >
      <h3 className="text-[1rem] font-bold leading-[1.4] text-ink-strong">
        {title}
      </h3>
      <div className="flex flex-1 flex-col justify-between gap-4">
        <AdmissionBlock {...data.upper} />
        <AdmissionBlock {...data.lower} />
      </div>
    </GoalCard>
  );
}
