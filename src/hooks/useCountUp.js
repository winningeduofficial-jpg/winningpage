import { useEffect, useRef } from 'react';

// easeOutExpo — 초반 급가속 후 길게 감속. t === 1 특수 처리를 빼면
// 1 - 2^-10 = 0.999…로 끝나 최종값이 미세하게 어긋난다.
const easeOutExpo = (t) => (t === 1 ? 1 : 1 - 2 ** (-10 * t));

// 정수부를 target의 자릿수만큼 0으로 패딩한다("00.0" → "95.4").
// 렌더 문자열 길이를 처음부터 끝까지 고정해 CountUpNumber가 min-width 없이도
// 흔들리지 않게 한다.
const formatPadded = (value, decimals, intDigits) => {
  const fixed = value.toFixed(decimals);
  const negative = fixed.startsWith('-');
  const raw = negative ? fixed.slice(1) : fixed;
  const [intPart, decPart] = raw.split('.');
  const paddedInt = intPart.padStart(intDigits, '0');
  const result = decPart !== undefined ? `${paddedInt}.${decPart}` : paddedInt;
  return negative ? `-${result}` : result;
};

/**
 * 숫자 카운트업 훅. 반환한 ref를 텍스트 노드를 가진 엘리먼트에 붙인다.
 * 프레임마다 setState 하지 않고 el.textContent를 직접 갱신한다(리렌더 0회).
 *
 * @param {number} target 최종값
 * @param {{ duration?: number, decimals?: number }} options
 * @returns {import('react').RefObject<HTMLElement>}
 */
export function useCountUp(target, { duration = 1600, decimals = 1 } = {}) {
  const ref = useRef(null);
  // 마지막으로 페인트한 값. target이 바뀌어 effect가 재실행될 때 0이 아니라
  // 이 값에서 새 target까지 이어서 보간하기 위해 cleanup을 넘어 살아남아야 한다.
  const lastValueRef = useRef(null);
  // IO가 최초로 교차를 통지해 애니메이션을 한 번이라도 시작했는지.
  // false면 아직 관찰 대기 중(0에서 시작), true면 target 변경으로 인한
  // 재실행(마지막 페인트 값에서 이어서 시작)임을 구분한다.
  const startedRef = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    if (!Number.isFinite(target)) return undefined;

    // target 자체의 정수 자릿수를 패딩 폭으로 쓴다 — 95.4 → 2자리, 100.0 → 3자리.
    const intDigits = Math.max(1, Math.trunc(Math.abs(target)).toString().length);

    const paint = (value) => {
      lastValueRef.current = value;
      el.textContent = formatPadded(value, decimals, intDigits);
    };

    // JS 애니메이션은 CSS @media가 잡아주지 않는다 — matchMedia로 직접 분기.
    // 모듈 로드 시점에 캐싱하지 않고 effect 실행 시점에 읽는다.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      paint(target);
      return undefined;
    }

    let raf = 0;
    let t0 = 0;
    // 최초 실행은 0에서, target 변경으로 인한 재실행은 마지막 페인트 값에서
    // 시작한다. startedRef는 IO 콜백 안에서만 true로 바뀌므로 이 시점에는
    // 아직 이전 렌더의 값을 정확히 반영한다.
    const from = startedRef.current ? lastValueRef.current ?? 0 : 0;

    const step = (ts) => {
      // 첫 rAF 콜백의 timestamp를 t0로 채택.
      // performance.now()로 미리 찍으면 첫 프레임까지의 지연이 duration에서 차감돼 튄다.
      if (!t0) t0 = ts;
      const p = Math.min((ts - t0) / duration, 1);
      paint(p === 1 ? target : from + (target - from) * easeOutExpo(p));
      if (p < 1) raf = requestAnimationFrame(step);
    };

    if (!startedRef.current) {
      // observe() 이후 IO의 첫 통지는 최소 2프레임 뒤에 온다. 그 사이 초기
      // DOM 텍스트(JSX에 박힌 최종값)가 그대로 페인트되는 프레임이 끼어들면
      // '최종값 → 0 → 카운트업'으로 번쩍인다. 관찰을 걸기 전에 동기적으로
      // 0을 한 번 페인트해 관찰 시작 시점부터 DOM이 0을 들고 있게 한다.
      paint(0);

      const io = new IntersectionObserver(
        ([entry]) => {
          if (!entry.isIntersecting) return;
          io.unobserve(el); // 재진입 시 재실행 차단 (ref 플래그 가드 금지)
          startedRef.current = true;
          raf = requestAnimationFrame(step);
        },
        { threshold: 0.4 }
      );

      io.observe(el);

      // StrictMode(dev)에서 effect가 실행→cleanup→재실행 된다.
      // cleanup을 넘어 살아남는 'hasAnimated' ref 가드를 두면 숫자가 중간값에
      // 영구히 얼어붙는다. 가드 없이 처음부터 다시 재생하게 두는 것이 정답.
      // (startedRef는 IO 콜백 내부에서만 true가 되므로 StrictMode의
      // 즉시 cleanup에는 영향받지 않고, 이 재생 정책과 충돌하지 않는다.)
      return () => {
        io.disconnect();
        cancelAnimationFrame(raf);
      };
    }

    // 이미 한 번 이상 애니메이션을 시작한 뒤 target만 바뀐 경우 —
    // 뷰포트 재확인 없이 마지막 페인트 값에서 새 target까지 바로 이어서 보간한다.
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [target, duration, decimals]);

  return ref;
}
