import { useEffect, useRef, useState } from "react";

/**
 * 엘리먼트가 뷰포트에 걸쳐 있는 동안만 true인 상태를 반환하는 훅.
 * 서비스 랜딩 4종 + LearningDiagnosisLanding의 히어로 오라 회전/부유 애니메이션이
 * 화면 밖에서도 계속 도는 리페인트 비용을 막기 위해 쓰인다(GoalManagement.jsx
 * HeroSection 선례가 원본).
 *
 * once가 아니다 — 뷰포트를 벗어나면 다시 false로 돌아가고, threshold 없이
 * 한 픽셀이라도 걸치면 true다. 옵션이 필요 없을 만큼 6곳 전부 동일해 인자를
 * 두지 않는다(YAGNI).
 *
 * @returns {[import('react').RefObject<HTMLElement>, boolean]} [관찰 대상에 붙일 ref, 교차 여부]
 */
export function useInView() {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") return undefined;

    const observer = new IntersectionObserver((entries) => {
      setInView(entries.some((entry) => entry.isIntersecting));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return [ref, inView];
}
