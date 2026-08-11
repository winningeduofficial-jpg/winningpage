import { useEffect, useRef } from 'react';

// 모달 동작 로직(ESC 닫기, Tab focus trap, 배경 스크롤 잠금, 포커스 이동/복귀) 공용 훅.
//
// **goal `AppModal`(src/components/goal/AppModal.jsx)의 원래 구현을 그대로 옮긴 것이다.**
// 원래는 그 파일 안에 있었으나, 수행평가 앱의 주제 상세 모달(docs/수행평가-상세-명세.md
// §5.11 `TopicDetailModal`)이 프레젠테이션은 goal과 거의 겹치지 않으면서(폭·X버튼 유무·
// 배경색·푸터 레이아웃 전부 다르다) 이 4가지 동작만은 그대로 재사용해야 해서 분리했다.
// 즉 **goal 전용도 performance 전용도 아니고, 두 앱의 모달 셸이 함께 쓰는 훅**이다.
//
// 호출부(모달 셸)가 지켜야 하는 계약:
//   · `panelRef`는 모달 패널(다이얼로그) 루트 엘리먼트에 붙인 ref여야 한다 — 포커스 이동/
//     trap이 그 안에서만 포커서블 엘리먼트를 찾는다.
//   · `open`이 `false`→`true`로 바뀌기 **전에** `panelRef.current`가 아직 없어도 된다(열릴 때
//     이펙트가 `open`을 보고 다시 붙는다).
//   · 딤 클릭으로 닫는 것은 이 훅의 책임이 아니다 — 호출부가 스크림에 직접
//     `onClick={onClose}`를 건다(간단하고 훅에 없어도 되는 로직이라 옮기지 않았다).
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * @param {object} params
 * @param {boolean} params.open
 * @param {() => void} params.onClose
 * @param {import('react').RefObject<HTMLElement>} params.panelRef 모달 패널 루트 ref.
 */
export function useModalBehavior({ open, onClose, panelRef }) {
  const triggerElRef = useRef(null);

  // 배경 스크롤 잠금 + 포커스 복귀. 포커스 복귀를 별도 effect의 `open: true → false` 전이에만
  // 의존하면, 모달이 열린 채로 컴포넌트가 언마운트되는 경우(예: 라우트 전환으로 모달을 감싼
  // 컴포넌트째 사라지는 경우) 복귀 로직이 실행되지 않고 포커스가 <body>로 떨어진다. 스크롤
  // 잠금과 같은 cleanup에 묶어 언마운트 시에도 항상 실행되게 한다.
  useEffect(() => {
    if (!open) return undefined;

    triggerElRef.current = document.activeElement;
    const { style } = document.body;
    const previousOverflow = style.overflow;
    style.overflow = 'hidden';

    return () => {
      style.overflow = previousOverflow;
      const trigger = triggerElRef.current;
      if (trigger instanceof HTMLElement) {
        trigger.focus();
      }
      triggerElRef.current = null;
    };
  }, [open]);

  // 열릴 때 패널 내 첫 포커서블 엘리먼트로 포커스 이동.
  useEffect(() => {
    if (!open) return undefined;
    const raf = requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const first = panel.querySelector(FOCUSABLE_SELECTOR);
      first?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [open, panelRef]);

  // ESC 닫기 + Tab focus trap.
  useEffect(() => {
    if (!open) return undefined;

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;

      const panel = panelRef.current;
      if (!panel) return;
      const focusables = Array.from(panel.querySelectorAll(FOCUSABLE_SELECTOR));
      if (focusables.length === 0) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose, panelRef]);
}
