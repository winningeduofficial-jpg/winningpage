import { CheckCircle2, Info, X, XCircle } from "lucide-react";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

// 인앱 토스트 컨텍스트 — docs/수행평가-상세-명세.md §6.1(P18, 신규 컴포넌트 표).
//
// 외부 앱(index.html:3121-3126, 승계 이전 레거시)은 전역 엘리먼트 1개를 `textContent`로
// 덮어쓰고 3000ms 후 클래스를 떼는 싱글턴이었다. 연속 호출 시 뒤 호출이 앞 타이머를
// 취소하지 않아 먼저 뜬 토스트가 화면에서 잘려 사라졌다. 여기서는 토스트마다 독립된
// id·타이머를 갖는 스택으로 바꿔 그 결함을 없앤다 — 서로의 clearTimeout을 절대 건드리지
// 않는다.

type ToastTone = "success" | "error" | "info";

interface Toast {
  id: string;
  type: ToastTone;
  message: string;
}

interface ToastOptions {
  duration?: number;
}

interface ToastContextValue {
  success: (message: string, options?: ToastOptions) => string;
  error: (message: string, options?: ToastOptions) => string;
  info: (message: string, options?: ToastOptions) => string;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_DURATION = 3000;

const TONE: Record<
  ToastTone,
  {
    icon: typeof CheckCircle2;
    iconClass: string;
    barClass: string;
    role: "status" | "alert";
    ariaLive: "polite" | "assertive";
  }
> = {
  success: {
    icon: CheckCircle2,
    iconClass: "text-emerald-600",
    barClass: "bg-emerald-500",
    role: "status",
    ariaLive: "polite",
  },
  error: {
    icon: XCircle,
    iconClass: "text-red-600",
    barClass: "bg-red-500",
    role: "alert",
    ariaLive: "assertive",
  },
  info: {
    icon: Info,
    iconClass: "text-primary",
    barClass: "bg-primary",
    role: "status",
    ariaLive: "polite",
  },
};

let toastSeq = 0;

const MAX_TOASTS = 3;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const removeToast = useCallback((id: string) => {
    const timerId = timersRef.current.get(id);
    if (timerId) {
      clearTimeout(timerId);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const pushToast = useCallback(
    (
      type: ToastTone,
      message: string,
      { duration = DEFAULT_DURATION }: ToastOptions = {},
    ) => {
      toastSeq += 1;
      const id = `toast-${toastSeq}`;
      setToasts((prev) => {
        const next = [...prev, { id, type, message }];
        if (next.length <= MAX_TOASTS) return next;

        // 스택 상한 초과분은 가장 오래된 것부터 제거 — 뷰포트 밖으로 넘치지 않게.
        const overflowCount = next.length - MAX_TOASTS;
        next.slice(0, overflowCount).forEach((overflowToast) => {
          const overflowTimerId = timersRef.current.get(overflowToast.id);
          if (overflowTimerId) {
            clearTimeout(overflowTimerId);
            timersRef.current.delete(overflowToast.id);
          }
        });
        return next.slice(overflowCount);
      });

      // 이 토스트 전용 타이머 — 다른 토스트의 타이머와 절대 공유하지 않는다.
      const timerId = setTimeout(() => removeToast(id), duration);
      timersRef.current.set(id, timerId);

      return id;
    },
    [removeToast],
  );

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((timerId) => {
        clearTimeout(timerId);
      });
      timers.clear();
    };
  }, []);

  const value = useMemo(
    () => ({
      success: (message, options) => pushToast("success", message, options),
      error: (message, options) => pushToast("error", message, options),
      info: (message, options) => pushToast("info", message, options),
      dismiss: removeToast,
    }),
    [pushToast, removeToast],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastStack toasts={toasts} onDismiss={removeToast} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx)
    throw new Error("useToast는 ToastProvider 내부에서만 호출할 수 있다.");
  return ctx;
}

function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}) {
  // 토스트가 없어도 aria-live 리전 자체는 항상 DOM에 유지한다 — 첫 토스트와
  // 동시에 리전이 삽입되면 스크린리더가 공지를 놓치는 경우가 있어서다.
  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed bottom-6 right-6 z-[200] flex w-full max-w-[22.5rem] flex-col gap-3"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: (id: string) => void;
}) {
  const tone = TONE[toast.type] ?? TONE.info;
  const Icon = tone.icon;

  return (
    <div
      role={tone.role}
      aria-live={tone.ariaLive}
      className="pointer-events-auto flex items-start gap-3 overflow-hidden rounded-2xl bg-white py-3 pl-4 pr-3 shadow-[0_0.75rem_2.5rem_rgba(1,50,98,0.16)]"
    >
      <span
        className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${tone.barClass}`}
        aria-hidden="true"
      />
      <Icon
        className={`h-5 w-5 shrink-0 ${tone.iconClass}`}
        aria-hidden="true"
      />
      <p className="min-w-0 flex-1 whitespace-pre-line text-sm font-medium leading-[1.3125rem] text-ink-strong">
        {toast.message}
      </p>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="알림 닫기"
        className="shrink-0 rounded-full p-1 text-ink-sub transition hover:bg-black/5 hover:text-ink-strong"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
