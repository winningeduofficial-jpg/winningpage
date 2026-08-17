// 6축 육각 레이더 차트 — 순수 SVG 직접 구현(라이브러리 금지, radarSpec 산식).
// viewBox 좌표는 컨테이너에 종속되는 SVG 내부 값이라 px 직접 사용(rem 규칙 예외).
const CX = 223;
const CY = 205;
const R_MAX = 130;
const R_LABEL = R_MAX + 18;

// 축 인덱스(k)별 라벨 배치 — 결정된 6축 순서(12시부터 시계방향) 전제.
// k0 위(가운데 정렬, 라벨 위쪽) · k3 아래(가운데 정렬, 라벨 아래쪽) · k1·k2 우측(start) · k4·k5 좌측(end).
const LABEL_LAYOUT: Array<{
  anchor: "start" | "middle" | "end";
  nameDy: number;
  scoreDy: number;
}> = [
  { anchor: "middle", nameDy: -22, scoreDy: 0 },
  { anchor: "start", nameDy: -4, scoreDy: 18 },
  { anchor: "start", nameDy: -4, scoreDy: 18 },
  { anchor: "middle", nameDy: 0, scoreDy: 22 },
  { anchor: "end", nameDy: -4, scoreDy: 18 },
  { anchor: "end", nameDy: -4, scoreDy: 18 },
];

function polarPoint(angleDeg: number, radius: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: CX + radius * Math.cos(rad),
    y: CY + radius * Math.sin(rad),
  };
}

function toPointsAttr(points: Array<{ x: number; y: number }>) {
  return points.map((p) => `${p.x},${p.y}`).join(" ");
}

type RadarAxis = { name: string; score: number };

type RadarChart6Props = {
  axes: RadarAxis[];
  max?: number;
  rings?: number;
  className?: string;
};

export default function RadarChart6({
  axes,
  max = 100,
  rings = 4,
  className = "",
}: RadarChart6Props) {
  const count = axes.length;
  // θ_k = -90° + (360/count)·k — k=0 이 12시, 시계방향.
  const angles = axes.map((_, k) => -90 + (360 / count) * k);
  const ringRatios = Array.from({ length: rings }, (_, i) => (i + 1) / rings);

  const dataPoints = axes.map((axis, k) =>
    // angles는 axes와 동일 length로 생성되어 k는 항상 범위 내(noUncheckedIndexedAccess 대응).
    polarPoint(angles[k]!, (axis.score / max) * R_MAX),
  );
  const spokeEnds = angles.map((angle) => polarPoint(angle, R_MAX));
  const labelPoints = angles.map((angle) => polarPoint(angle, R_LABEL));

  return (
    <svg
      viewBox="0 0 446 399"
      // R3(2026-08-11) — viewBox 가 이미 내부 좌표계를 고정하므로 외부 크기만 fluid 로 바꾸면
      // 벡터 전체(폴리곤·라벨 텍스트 포함)가 함께 스케일된다(축소 transform과 달리 브라우저
      // 네이티브 SVG 스케일이라 별도 보정이 필요 없다). 모바일은 뷰포트 폭에 맞추되 320px 를
      // 넘지 않게 해 라벨 겹침을 막고, lg 이상은 기존 고정 rem 치수를 그대로 유지한다.
      // fd-radar-svg — 인쇄 훅(BLOCK 수정). report-print.css 가 기존 lg: 리터럴과 동일한
      // 값(24.9375rem/27.875rem)으로 강제한다.
      className={`fd-radar-svg h-auto w-full max-w-[22rem] lg:h-[24.9375rem] lg:w-[27.875rem] lg:max-w-none ${className}`}
      role="img"
      aria-label="학습 6축 레이더 차트"
    >
      {ringRatios.map((ratio) => {
        const ringPoints = angles.map((angle) =>
          polarPoint(angle, R_MAX * ratio),
        );
        const isOutermost = ratio === 1;
        return (
          <polygon
            key={ratio}
            points={toPointsAttr(ringPoints)}
            fill="none"
            stroke={isOutermost ? "#d7d7d7" : "#e5e5e5"}
            strokeWidth="1"
          />
        );
      })}

      {spokeEnds.map((end, index) => (
        <line
          // spokeEnds는 angles(=axes와 동일 length)에서 파생되어 index는 항상 범위 내.
          key={`spoke-${axes[index]!.name}`}
          x1={CX}
          y1={CY}
          x2={end.x}
          y2={end.y}
          stroke="#e5e5e5"
          strokeWidth="1"
        />
      ))}

      <polygon
        points={toPointsAttr(dataPoints)}
        fill="#d9d9d9"
        fillOpacity="0.55"
        stroke="#737373"
        strokeWidth="2"
        strokeLinejoin="round"
      />

      {axes.map((axis, k) => {
        // LABEL_LAYOUT[0]은 리터럴 6원소 배열의 첫 항목으로 항상 존재(폴백 보장).
        const layout = LABEL_LAYOUT[k] ?? LABEL_LAYOUT[0]!;
        // labelPoints는 angles(=axes와 동일 length)에서 파생되어 k는 항상 범위 내.
        const { x, y } = labelPoints[k]!;
        return (
          <text key={axis.name} x={x} textAnchor={layout.anchor}>
            <tspan
              x={x}
              y={y + layout.nameDy}
              fontSize="16"
              fontWeight="500"
              fill="#525252"
            >
              {axis.name}
            </tspan>
            <tspan
              x={x}
              y={y + layout.scoreDy}
              fontSize="20"
              fontWeight="600"
              fill="#191919"
            >
              {axis.score}
            </tspan>
          </text>
        );
      })}
    </svg>
  );
}
