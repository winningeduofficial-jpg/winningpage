import { useEffect, useRef, useState } from "react";

/**
 * 엘리먼트가 뷰포트에 걸쳐 있는 동안만 true인 상태를 반환하는 훅.
 * 서비스 랜딩 4종 + LearningDiagnosisLanding의 히어로 오라 회전/부유 애니메이션이
 * 화면 밖에서도 계속 도는 리페인트 비용을 막기 위해 쓰인다(GoalManagement.jsx
 * HeroSection 선례가 원본).
 *
 * once가 아니다 — 뷰포트를 벗어나면 다시 false로 돌아가고, threshold 없이
 * 한 픽셀이라도 걸치면 true다. 옵션이 필요 없을 만큼 6곳 전부 동일해 인자를
 * 두지 않는다(YAGNI) — 단 rootMargin만은 예외로 둔다(QA 행 106): 기본값 "0px"는
 * 기존 6곳 전부와 동일하게 동작하고, 트리거 지점을 앞당기고 싶은 호출부만
 * 아래쪽 마진을 양수로 넘긴다. IntersectionObserver 스펙상 rootMargin은
 * px·%만 허용해 rem을 쓸 수 없다(CSS 속성이 아닌 JS API 값이라 이 저장소의
 * rem 우선 규칙 예외).
 *
 * @returns [관찰 대상에 붙일 ref, 교차 여부]
 */
export function useInView(rootMargin = "0px") {
  const ref = useRef<HTMLElement | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        setInView(entries.some((entry) => entry.isIntersecting));
      },
      { rootMargin },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [rootMargin]);

  return [ref, inView];
}
