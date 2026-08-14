import { X } from "lucide-react";
import {
  type ComponentPropsWithoutRef,
  type MutableRefObject,
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
} from "react";

// 대학모집요강 모달의 공용 "껍데기".
//
// 사용자 기획: "입시정보 > 대학모집요강(서비스)과 어드민 > 대학모집요강,
// 둘 다 같은 표가 나와야 한다. **다이얼로그도 마찬가지.**" 표(AdmissionTable)는
// 이미 한 벌이고, 이 파일이 다이얼로그 쪽 한 벌이다. 서비스 모달이 정본이고
// 어드민이 거기 맞춘다 — 그래서 이 컴포넌트는 src/pages/AdmissionGuidelines.jsx
// 의 모달 서브트리를 **재타이핑 없이 그대로 옮겨 온 것**이다.
//
// 공개 화면 DOM 바이트 불변을 지키는 규칙 (전부 협상 불가)
// --------------------------------------------------------
// 1. className 은 리터럴 상수 기본값이다. 템플릿으로 합성하지 않는다.
//    (a) 바이트가 같아야 하고 (b) Tailwind JIT 이 소스에서 클래스 문자열을
//    문자 그대로 스캔하기 때문이다. 합성하는 순간 클래스가 빌드에서 증발한다.
// 2. `{...bodyProps}` 는 반드시 `className` **앞**에 스프레드한다.
//    renderToStaticMarkup 은 prop 선언 순서대로 속성을 뱉는다. 뒤로 가면
//    data-section 과 class 의 순서가 뒤집혀 바이트 골든이 통째로 깨진다.
//    원본 순서가 ref → data-section → className 이었다.
// 3. aria-labelledby 의 id 2개는 idPrefix 로 만들되 기본값이 현행 리터럴과
//    같은 문자열이 되게 한다.
// 4. belowBody 가 null 이면 그 자리에 DOM 을 하나도 만들지 않는다. 어드민은
//    프록시 가로 스크롤바를 쓰지 않으므로 이 자리가 비어야 한다.
//
// 왜 `open` 이 있는데도 호출부가 삼항을 그대로 쓰는가
// ---------------------------------------------------
// JSX children 은 즉시 평가된다. 공개 호출부의 children 은 selectedInfo 의
// 필드를 직접 읽으므로, selectedInfo 가 null 인 동안에는 children 자체가
// 만들어지면 안 된다. 그래서 호출부의 `{selectedInfo ? (...) : null}` 가
// 남아 있고 `open` 은 그 안쪽에서 항상 true 다. `open` 은 상태를 nullable
// 하게 읽지 않는 호출부(어드민)를 위한 것이다.
//
// 스타일(.admission-modal-*)은 형제 파일 AdmissionModalStyles.jsx 가
// 소유한다. 이 컴포넌트가 직접 렌더하지 않는 이유는 그 <style> 노드가
// 오버레이 서브트리 안으로 들어가면 공개 모달의 DOM 바이트가 달라져
// 골든이 통째로 깨지기 때문이다 — 호출부가 자기 화면 어딘가에서 한 번
// 렌더한다(공개: AdmissionGuidelines.jsx, 어드민: AdmissionSectionEditModal).

// AdmissionGuidelines.jsx 원문 그대로.
export const PUBLIC_SHEET_CLASS =
  "admission-modal-sheet flex max-h-[85vh] w-full flex-col overflow-hidden bg-white md:w-[min(78vw,70rem)]";
export const PUBLIC_BODY_CLASS =
  "admission-modal-body admission-surface flex-1 overflow-auto bg-white px-6 py-4 text-sm font-semibold leading-7 text-[#525252] md:px-12";
export const PUBLIC_FOOTER_CLASS =
  "border-t border-[#e5e7eb] bg-white px-6 py-4 text-center md:px-12 md:pb-8 md:pt-4";

export default function AdmissionModalShell({
  open = true,
  onClose,
  eyebrow,
  title,
  idPrefix = "admission-modal",
  sheetClassName = PUBLIC_SHEET_CLASS,
  bodyRef,
  bodyProps,
  bodyClassName = PUBLIC_BODY_CLASS,
  belowBody = null,
  footerClassName = PUBLIC_FOOTER_CLASS,
  footer,
  triggerRef,
  children,
}: {
  open?: boolean;
  onClose: () => void;
  eyebrow?: ReactNode;
  title?: ReactNode;
  idPrefix?: string;
  sheetClassName?: string;
  bodyRef?: RefObject<HTMLDivElement | null>;
  bodyProps?: ComponentPropsWithoutRef<"div">;
  bodyClassName?: string;
  belowBody?: ReactNode;
  footerClassName?: string;
  footer?: ReactNode;
  triggerRef?: MutableRefObject<HTMLElement | null>;
  children?: ReactNode;
}) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  // 호출부가 트리거를 직접 들고 있으면(공개 모달은 목록의 "보기" 버튼을
  // 클릭 시점에 기억한다) 그것을 쓰고, 아니면 열릴 때의 activeElement 를
  // 폴백으로 잡는다. 공개 경로의 동작을 바꾸지 않으려고 폴백 대입은
  // triggerRef 가 없을 때만 한다.
  const fallbackTriggerRef = useRef<HTMLElement | null>(null);
  const activeTriggerRef = triggerRef || fallbackTriggerRef;

  // ESC 핸들러는 아래 effect 안에서 만들어지고 의존성이 [open] 하나뿐이라,
  // onClose 를 직접 붙잡으면 **모달이 열린 순간의 onClose 에 영원히 고정**된다.
  // 공개 모달은 onClose 가 () => setSelectedInfo(null) 라 무해하지만, 같은
  // 껍데기를 쓸 어드민 편집 모달은 onClose 가 dirty 를 읽어 confirm 을 띄운다 —
  // 고정되면 ESC 로 닫을 때 편집 이전의 dirty(=false)를 보고 확인 없이 닫혀
  // 변경이 조용히 날아간다. ref 로 최신 값만 흘려보내 의존성은 [open] 그대로 둔다.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const requestClose = () => onCloseRef.current?.();

  // 모달 접근성: Escape 닫기, 포커스 트랩, 배경 스크롤 잠금, 닫힐 때 트리거로 포커스 복귀.
  // 로딩/에러/본문 상태 전환마다 재실행되지 않도록 열림 여부에만 의존한다.
  // biome-ignore lint/correctness/useExhaustiveDependencies: triggerRef/activeTriggerRef는 ref라 deps에 넣어도 변경을 못 잡는다. 의도적으로 [open]에만 의존해 상태 전환마다 재실행되지 않게 한다(위 주석).
  useEffect(() => {
    if (!open) return undefined;

    if (!triggerRef) {
      fallbackTriggerRef.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
    }

    const sheet = sheetRef.current;
    const previouslyFocused = activeTriggerRef.current;
    const focusableSelector =
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

    const getFocusable = () =>
      sheet
        ? Array.from(
            sheet.querySelectorAll<HTMLElement>(focusableSelector),
          ).filter((el) => el.offsetParent !== null)
        : [];

    const rafId = window.requestAnimationFrame(() => {
      closeButtonRef.current?.focus();
    });

    function handleKeyDown(event: KeyboardEvent) {
      // IME 조합 중(한글 자모를 조립하는 동안)의 Escape/Tab 은 "입력 취소"를
      // 뜻하지 "모달 닫기"가 아니다. 가드가 없으면 한글을 치다 Escape 한 번에
      // 편집 모달이 닫히고 dirty confirm 이 조합 중간에 뜬다. 공개 모달은
      // 본문에 입력 요소가 0개라 관측 변화가 없다(그래서 이 커밋을 1줄로
      // 격리했다). keyCode 229 는 isComposing 을 안 주는 구형 IME 폴백이다.
      if (event.isComposing || event.keyCode === 229) return;

      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current?.();
        return;
      }

      if (event.key !== "Tab") return;

      const focusable = getFocusable();
      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    // 배경 스크롤 잠금. 스크롤바가 사라지며 레이아웃이 흔들리지 않도록 그만큼 padding으로 보정한다.
    const scrollbarWidth =
      window.innerWidth - document.documentElement.clientWidth;
    const originalOverflow = document.body.style.overflow;
    const originalPaddingRight = document.body.style.paddingRight;
    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    return () => {
      window.cancelAnimationFrame(rafId);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = originalOverflow;
      document.body.style.paddingRight = originalPaddingRight;
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus();
      }
      activeTriggerRef.current = null;
    };
    // 원본의 [isModalOpen] 을 그대로 옮긴 것. onClose 를 의존성에 넣으면
    // 인라인 화살표 함수 때문에 매 렌더 재구독이 되어 원본과 달라진다.
  }, [open]);

  if (!open) return null;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: APG 모달 백드롭 패턴 — role="presentation"으로 장식 레이어임을 명시했다. Escape는 위 document keydown 리스너가 처리한다.
    <div
      role="presentation"
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/30 px-4"
      onClick={requestClose}
    >
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: onClick은 배경 클릭이 대화상자 안까지 닫지 않도록 막는 stopPropagation 가드일 뿐, 키보드로 도달할 사용자 동작이 없다. */}
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${idPrefix}-university-name ${idPrefix}-title`}
        className={sheetClassName}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="admission-modal-sheet-head relative px-6 pb-4 pt-8 md:px-12 md:pb-5 md:pt-10">
          <button
            ref={closeButtonRef}
            type="button"
            onClick={requestClose}
            aria-label="닫기"
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full text-[#667085] transition hover:bg-[#e9f4ff] hover:text-[#013262] md:right-6 md:top-6"
          >
            <X className="h-5 w-5" />
          </button>
          <p
            id={`${idPrefix}-university-name`}
            className="text-center text-base font-medium tracking-[-0.02em] text-[#013262]"
          >
            {eyebrow}
          </p>
          <h3
            id={`${idPrefix}-title`}
            className="admission-modal-sheet-title mt-1 text-xl md:text-[1.75rem]"
          >
            {title}
          </h3>
        </div>
        <div ref={bodyRef} {...bodyProps} className={bodyClassName}>
          {children}
        </div>
        {belowBody}
        <div className={footerClassName}>{footer}</div>
      </div>
    </div>
  );
}
