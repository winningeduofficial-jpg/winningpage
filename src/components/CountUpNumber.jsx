import { useCountUp } from '../hooks/useCountUp';

export default function CountUpNumber({
  value,
  decimals = 1,
  duration = 1600,
  srLabel,
  className = ''
}) {
  const ref = useCountUp(value, { duration, decimals });
  const finalText = Number.isFinite(value) ? value.toFixed(decimals) : '';

  return (
    <>
      <span
        ref={ref}
        aria-hidden="true"
        className={`inline-block text-right tabular-nums ${className}`}
        // Pretendard가 tnum 글리프를 갖고 있는지 미확인이라, tabular-nums만 믿지
        // 않고 최종 문자열 길이만큼 min-width를 확보한다(보수적 선택).
        // 값이 0에서 target까지 단조 증가하고 소수 자릿수가 고정이므로
        // 중간 문자열이 최종 문자열보다 길어지는 경우는 없다.
        style={{ minWidth: `${finalText.length}ch` }}
      >
        {finalText}
      </span>
      {srLabel ? <span className="sr-only">{srLabel}</span> : null}
    </>
  );
}
