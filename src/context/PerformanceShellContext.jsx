import { createContext, useContext, useMemo, useState } from 'react';

// 수행평가 셸(사이드바) ↔ 채팅 페이지(Outlet 자식) 간 진행단계 상태 통로.
// docs/수행평가-상세-명세.md §3.3(진행단계 5스텝 상태 머신) — P13.
//
// `PerformanceSidebar`는 표시 전용이라 `stepStates` prop을 받기만 하는데, 그 prop을
// 채워 줄 위치가 셸(`PerformanceAppLayout`)이고 값의 출처는 Outlet 자식(채팅 페이지)의
// 라이브 세션 상태다. 라우터 트리에서 부모가 자식의 상태를 직접 읽을 수 없으므로
// 작은 컨텍스트로 자식 → 부모 방향 통로를 만든다. Provider는 `PerformanceAppLayout`이
// 감싼다.
//
// 저장 리포트 페이지 등 setter를 호출하지 않는 화면은 기본값(all-todo)을 그대로
// 받는다 — §3.3 「저장 리포트 = 활성 스텝 0개」와 일치하는 정상 입력이다. 채팅 페이지가
// 언마운트될 때(라우트 전환)는 컨텍스트 상태가 저장 리포트로 새어 들어가지 않도록
// 채팅 페이지 쪽 `useEffect` cleanup에서 직접 기본값으로 리셋한다(컨텍스트 자체는
// 리셋 시점을 모른다 — 값을 들고 있을 뿐이다).
//
// 지금은 stepStates 전용이다. 프로필(이름/학교유형/학년, P5 몫)까지 이 통로로 옮기는
// 확장 여지는 있지만 이번 범위 밖이라 만들지 않는다 — PerformanceSidebar 상단 주석·
// PerformanceAppLayout TODO(P5) 참고.

const DEFAULT_STEP_STATES = ['todo', 'todo', 'todo', 'todo', 'todo'];

const PerformanceShellContext = createContext(null);

export function PerformanceShellProvider({ children }) {
  const [stepStates, setStepStates] = useState(DEFAULT_STEP_STATES);

  const value = useMemo(() => ({ stepStates, setStepStates }), [stepStates]);

  return (
    <PerformanceShellContext.Provider value={value}>{children}</PerformanceShellContext.Provider>
  );
}

/** @returns {{stepStates: Array<'done'|'current'|'todo'>, setStepStates: (next: Array<'done'|'current'|'todo'>) => void}} */
export function usePerformanceShell() {
  const ctx = useContext(PerformanceShellContext);
  if (!ctx) {
    throw new Error('usePerformanceShell은 PerformanceShellProvider 내부에서만 호출할 수 있다.');
  }
  return ctx;
}

export { DEFAULT_STEP_STATES };
