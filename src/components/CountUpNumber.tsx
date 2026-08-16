import { useCountUp } from "./useCountUp";

type CountUpNumberProps = {
  value: number;
  decimals?: number;
  duration?: number;
  srLabel?: string;
  className?: string;
};

export default function CountUpNumber({
  value,
  decimals = 1,
  duration = 1600,
  srLabel,
  className = "",
}: CountUpNumberProps) {
  const ref = useCountUp(value, { duration, decimals });
  const finalText = Number.isFinite(value) ? value.toFixed(decimals) : "";

  return (
    <>
      <span
        ref={ref}
        aria-hidden="true"
        className={`inline-block tabular-nums ${className}`}
        // useCountUp이 정수부를 0으로 패딩해 렌더 문자열 길이를 처음부터
        // 고정하므로 min-width/text-right 없이도 폭이 흔들리지 않는다.
        // tabular-nums는 그대로 유지 — 자릿수가 고정돼도 글리프 폭 차이는
        // 폰트에 따라 남을 수 있다.
      >
        {finalText}
      </span>
      {srLabel ? <span className="sr-only">{srLabel}</span> : null}
    </>
  );
}
