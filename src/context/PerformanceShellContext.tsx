import {
  createContext,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useContext,
  useMemo,
  useState,
} from "react";

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
// P15 [FIX] — 같은 통로에 회차 소진 배너(§5.20 (A)) 노출 여부도 얹는다. 판정 근거
// (bootstrap의 lastSession·현재 진행 세션)는 채팅 페이지만 알고, 배너를 그리는 자리는
// 셸(PerformanceAppLayout)이라 stepStates와 같은 자식→부모 방향 문제다. 저장 리포트 등
// 판정 근거가 없는 화면은 기본값 false를 그대로 받는다 — 판정 불가를 "안 띄움"으로
// 보수적으로 처리하는 것이 §5.20 취지(선제 안내이지 강제 차단이 아님)에 맞는다.
//
// 지금은 stepStates·quotaBannerVisible 두 값뿐이다. 프로필(이름/학교유형/학년, P5 몫)까지
// 이 통로로 옮기는 확장 여지는 있지만 이번 범위 밖이라 만들지 않는다 — PerformanceSidebar
// 상단 주석·PerformanceAppLayout TODO(P5) 참고.

type StepState = "done" | "current" | "todo";

const DEFAULT_STEP_STATES: StepState[] = [
  "todo",
  "todo",
  "todo",
  "todo",
  "todo",
];

interface PerformanceShellContextValue {
  stepStates: StepState[];
  setStepStates: Dispatch<SetStateAction<StepState[]>>;
  quotaBannerVisible: boolean;
  setQuotaBannerVisible: Dispatch<SetStateAction<boolean>>;
}

const PerformanceShellContext =
  createContext<PerformanceShellContextValue | null>(null);

export function PerformanceShellProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [stepStates, setStepStates] =
    useState<StepState[]>(DEFAULT_STEP_STATES);
  const [quotaBannerVisible, setQuotaBannerVisible] = useState(false);

  const value = useMemo(
    () => ({
      stepStates,
      setStepStates,
      quotaBannerVisible,
      setQuotaBannerVisible,
    }),
    [stepStates, quotaBannerVisible],
  );

  return (
    <PerformanceShellContext.Provider value={value}>
      {children}
    </PerformanceShellContext.Provider>
  );
}

export function usePerformanceShell(): PerformanceShellContextValue {
  const ctx = useContext(PerformanceShellContext);
  if (!ctx) {
    throw new Error(
      "usePerformanceShell은 PerformanceShellProvider 내부에서만 호출할 수 있다.",
    );
  }
  return ctx;
}
