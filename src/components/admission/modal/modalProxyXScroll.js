import { useEffect } from "react";

// 모달 하단 "프록시 가로 스크롤바" 배선.
//
// src/pages/AdmissionGuidelines.jsx 에 인라인으로 있던 effect 를 **로직
// 변경 없이 통째로** 옮긴 것이다. 함수 본문·순서·매직넘버(80ms)·조건식을
// 한 글자도 바꾸지 않았다. 바꾸면 안 되는 이유가 아래에 있다.
//
// 이 장치가 존재하는 이유
// -----------------------
// 모달 본문(.admission-modal-body)은 네이티브 가로 스크롤바를 숨긴다
// (AdmissionGuidelines.jsx 의 스코프 CSS). 대신 시트 바닥에 트랙 하나를
// 그려 놓고, 그 트랙의 scrollLeft 를 본문 안 실제 스크롤 컨테이너
// (.admission-scroll-table / .admission-table-wrap / .admission-existing-html)
// 에 비율로 되먹인다. 그래서 이 파일이 죽으면 공개 모달에서 넓은 표를
// 좌우로 볼 수단 자체가 사라진다.
//
// ⚠ 의존성 배열의 `visible` 자기참조는 오타가 아니다
// --------------------------------------------------
// visible === false 인 동안에는 바 DOM 자체가 렌더되지 않아 barRef.current
// 가 null 이고, `bar?.addEventListener` 가 조용히 no-op 이 된다. 즉
// **visible 이 true 로 바뀌며 effect 가 한 번 더 도는 것만이** 트랙에
// scroll 리스너를 붙인다. 이 의존성을 "불필요해 보인다"며 떨어뜨리면
// 마크업은 100% 그대로인 채 스크롤 거리만 0이 된다 — 어떤 DOM 골든도
// 못 잡는 무증상 사망이다. scripts/verify-admission-modal-shell.mjs 가
// 이 배열에 visible 이 들어 있는지 정적으로 확인한다.
//
// ⚠ 어드민 편집 모달에는 이 훅을 쓰지 않는다
// -------------------------------------------
// 트랙 폭 계산이 "셸 padding == 본문 padding" 을 전제하고(BLOCK3), 대상
// 선택이 오버플로 최대 1개만 고르며(pickTarget), 되먹임이 화면 안 모든
// 대상에 일괄 대입된다(syncTargetsFromBar). 편집 화면은 표가 여러 개고
// 여백 예산도 달라 전제가 깨진다. 어드민은 숨김 CSS 를 상속하지 않는
// 별도 바디 클래스를 써서 네이티브 스크롤바를 그대로 쓴다(커밋 9a9f3f0
// 참고 — 어드민에 모달 CSS 를 딸려 보냈다가 표 스크롤 수단을 잃은 사고).

export default function useModalProxyXScroll({
  selectedInfo,
  bodyRef,
  barRef,
  visible,
  setModalXScroll,
}) {
  // biome-ignore lint/correctness/useExhaustiveDependencies: visible은 파일 상단 주석·verify-admission-modal-shell.mjs가 보호하는 의도된 배열이다. barRef.current/bodyRef.current는 ref라 deps에 넣어도 변경을 못 잡아 의미가 없다.
  useEffect(() => {
    if (!selectedInfo) {
      setModalXScroll({ visible: false, width: 0 });
      return undefined;
    }

    const body = bodyRef.current;
    const bar = barRef.current;
    if (!body) return undefined;

    let activeTarget = null;
    let syncing = false;
    let rafId = 0;

    const getHorizontalTargets = () =>
      Array.from(
        body.querySelectorAll(
          ".admission-scroll-table, .admission-table-wrap, .admission-existing-html",
        ),
      ).filter((element) => element.scrollWidth > element.clientWidth + 6);

    const pickTarget = () => {
      const targets = getHorizontalTargets();
      if (!targets.length) return null;
      return targets.reduce((best, current) => {
        const bestOverflow = best.scrollWidth - best.clientWidth;
        const currentOverflow = current.scrollWidth - current.clientWidth;
        return currentOverflow > bestOverflow ? current : best;
      }, targets[0]);
    };

    const syncTargetsFromBar = () => {
      if (!bar || syncing) return;
      const target = activeTarget || pickTarget();
      if (!target) return;

      syncing = true;
      const maxBar = Math.max(1, bar.scrollWidth - bar.clientWidth);
      const ratio = bar.scrollLeft / maxBar;
      getHorizontalTargets().forEach((element) => {
        const maxElement = Math.max(
          0,
          element.scrollWidth - element.clientWidth,
        );
        element.scrollLeft = maxElement * ratio;
      });
      window.requestAnimationFrame(() => {
        syncing = false;
      });
    };

    const syncBarFromTarget = (target) => {
      if (!bar || syncing || !target) return;

      syncing = true;
      const maxTarget = Math.max(1, target.scrollWidth - target.clientWidth);
      const maxBar = Math.max(0, bar.scrollWidth - bar.clientWidth);
      const ratio = target.scrollLeft / maxTarget;
      bar.scrollLeft = maxBar * ratio;
      window.requestAnimationFrame(() => {
        syncing = false;
      });
    };

    const refresh = () => {
      activeTarget = pickTarget();
      if (!activeTarget) {
        setModalXScroll({ visible: false, width: 0 });
        return;
      }

      setModalXScroll({ visible: true, width: activeTarget.scrollWidth });
      window.requestAnimationFrame(() => syncBarFromTarget(activeTarget));
    };

    const scheduleRefresh = () => {
      window.cancelAnimationFrame(rafId);
      rafId = window.requestAnimationFrame(refresh);
    };

    const onTargetScroll = (event) => {
      activeTarget = event.currentTarget;
      syncBarFromTarget(activeTarget);
    };

    const attachTargetListeners = () => {
      getHorizontalTargets().forEach((element) => {
        element.removeEventListener("scroll", onTargetScroll);
        element.addEventListener("scroll", onTargetScroll, { passive: true });
      });
    };

    scheduleRefresh();
    const timeoutId = window.setTimeout(() => {
      refresh();
      attachTargetListeners();
    }, 80);

    bar?.addEventListener("scroll", syncTargetsFromBar, { passive: true });
    body.addEventListener("scroll", scheduleRefresh, { passive: true });
    window.addEventListener("resize", scheduleRefresh);

    const observer = new ResizeObserver(() => {
      scheduleRefresh();
      attachTargetListeners();
    });
    observer.observe(body);

    return () => {
      window.clearTimeout(timeoutId);
      window.cancelAnimationFrame(rafId);
      bar?.removeEventListener("scroll", syncTargetsFromBar);
      body.removeEventListener("scroll", scheduleRefresh);
      window.removeEventListener("resize", scheduleRefresh);
      getHorizontalTargets().forEach((element) => {
        element.removeEventListener("scroll", onTargetScroll);
      });
      observer.disconnect();
    };
    // 원본(AdmissionGuidelines.jsx)의 [selectedInfo, modalXScroll.visible] 을
    // 문자 그대로 보존한다. 위 "⚠ 의존성 배열" 주석 참고 — 떨어뜨리면 무증상으로 죽는다.
  }, [selectedInfo, visible]);
}
