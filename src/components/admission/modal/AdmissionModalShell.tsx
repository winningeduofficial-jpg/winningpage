import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import {
  type ComponentPropsWithoutRef,
  type MutableRefObject,
  type ReactNode,
  type RefObject,
  useRef,
} from "react";
import { cn } from "@/lib/utils";

// 대학모집요강 모달의 공용 "껍데기".
//
// 사용자 기획: "입시정보 > 대학모집요강(서비스)과 어드민 > 대학모집요강,
// 둘 다 같은 표가 나와야 한다. **다이얼로그도 마찬가지.**" 표(AdmissionTable)는
// 이미 한 벌이고, 이 파일이 다이얼로그 쪽 한 벌이다. 서비스 모달이 정본이고
// 어드민이 거기 맞춘다.
//
// shadcn/ui Dialog(Base UI 기반, src/components/ui/dialog.tsx)로 교체 (task:
// AdmissionModalShell Base UI 전환). 예전엔 직접 손으로 짠 useEffect 하나가
// ESC 닫기 · 포커스 트랩 · 배경 스크롤 잠금 · 닫힐 때 트리거 포커스 복귀를
// 전부 구현했다. 지금은 그 네 가지 전부 Base UI Dialog(DialogPrimitive.Root/
// Portal/Backdrop/Popup/Close, @base-ui/react/dialog)가 내장으로 제공한다 —
// 특히 ESC 핸들러의 "IME 조합 중엔 닫지 않는다" 가드(옛 코드의
// event.isComposing 체크)도 Base UI useDismiss 훅이 동일하게
// compositionstart/compositionend를 추적해 이미 처리한다(node_modules/@base-ui/react/
// floating-ui-react/hooks/useDismiss.js 실측 확인). 그래서 수동 useEffect를
// 통째로 들어냈다.
//
// 공개 화면 DOM 유지 규칙 (여전히 유효한 것만 남긴다)
// --------------------------------------------------
// 1. className 은 리터럴 상수 기본값이다. 템플릿으로 합성하지 않는다.
//    Tailwind JIT 이 소스에서 클래스 문자열을 문자 그대로 스캔하기 때문이다
//    (cn()으로 병합은 하되, 각 조각 자체는 항상 완전한 리터럴이어야 한다).
// 2. `{...bodyProps}` 는 반드시 `className` **앞**에 스프레드한다. 이제
//    바이트 골든이 아니라 "호출부가 넘긴 bodyClassName이 항상 이긴다"는
//    prop 우선순위 계약을 위해서다 — bodyProps 안에 우연히 className이
//    섞여 들어와도 명시적 bodyClassName이 덮어써야 한다.
// 3. aria-labelledby 의 id 2개는 idPrefix 로 만들되 기본값이 현행 리터럴과
//    같은 문자열이 되게 한다. Base UI Popup은 자체적으로 title 엘리먼트를
//    등록해 aria-labelledby를 자동 생성하지만, 그 id는 렌더마다 달라지는
//    난수([floatingId] 기반)라 이 컴포넌트는 그 자동 값을 쓰지 않고
//    aria-labelledby를 항상 명시적으로 덮어써 결정론적인 id를 유지한다
//    (h3/p 도 DialogPrimitive.Title을 쓰지 않고 평범한 h3로 남겨 이 id와
//    1:1로 맞춘다).
// 4. belowBody 가 null 이면 그 자리에 DOM 을 하나도 만들지 않는다. 어드민은
//    프록시 가로 스크롤바를 쓰지 않으므로 이 자리가 비어야 한다.
//
// 예전엔 여기서 "renderToStaticMarkup 은 prop 선언 순서대로 속성을 뱉는다"는
// 이유로 스프레드 순서를 협상 불가로 못박았다. Base UI Dialog는 Portal로
// 렌더되는데 renderToStaticMarkup은 포털을 지원하지 않는다(선례:
// src/components/performance/step5/EvaluationReportModal.test.tsx 헤더 주석).
// 그래서 이 셸의 골든 검증도 SSR 바이트 비교에서 jsdom + @testing-library/react
// 렌더 기반 구조 검증으로 전환했다(src/pages/AdmissionGuidelines.modalShell.test.tsx).
// 실제 DOM에서는 속성 삽입 순서가 아니라 최종 attribute 값만 의미가 있으므로
// 바이트 순서 규칙 자체가 더 이상 협상 대상이 아니게 됐다(위 규칙 2가 그
// 자리를 "우선순위 계약"으로 대체한다).
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

// 본문(bodyRef 대상 div)은 오버레이 스크롤바(ScrollArea, src/components/ui/scroll-area.tsx)로
// 바꾸지 않는다 — 전역 네이티브 스크롤바 숨김 CSS(src/index.css)로 공간은 이미 0이라 시각
// 결함은 없고, 전환 시도 시 (a) DOM 골든(AdmissionGuidelines.modalShell.test.tsx)이 본문
// 구조 변경으로 깨져 scripts/capture-admission-modal-shell-golden.mjs --capture 재생성이
// 필요하고 (b) 프록시 가로 스크롤바(modalProxyXScroll.ts)가 bodyRef.current에 직접 붙이는
// scroll 리스너를 osInstance().elements().viewport로 재배선해야 해서 보류했다(2026-09).

// AdmissionGuidelines.jsx 원문 그대로.
const PUBLIC_SHEET_CLASS =
  "admission-modal-sheet flex max-h-[85vh] w-full flex-col overflow-hidden bg-white md:w-[min(78vw,70rem)]";
const PUBLIC_BODY_CLASS =
  "admission-modal-body admission-surface flex-1 overflow-auto bg-white px-6 py-4 text-sm font-semibold leading-7 text-ink md:px-12";
const PUBLIC_FOOTER_CLASS =
  "border-t border-[#e5e7eb] bg-white px-6 py-4 text-center md:px-12 md:pb-8 md:pt-4";

// 시트(팝업)를 화면 정중앙에 고정하는 위치 지정 클래스. 예전엔 바깥 오버레이
// div가 `flex items-center justify-center`로 중앙 정렬했지만, Base UI에서는
// Backdrop과 Popup이 Portal 아래 형제로 렌더되므로(오버레이가 팝업을 감싸는
// 구조가 아니다) 시트 자신이 위치를 갖는다. shadcn 기본 dialog.tsx와 동일한
// fixed+translate 중앙 정렬 기법이고, `max-w-[calc(100%-2rem)]`는 옛 오버레이의
// `px-4`(좌우 1rem씩)와 동일한 화면 여백을 재현한다. z-10000은 이 앱이 다른
// 플로팅 UI 위에 항상 뜨도록 쓰는 기존 값 그대로다(shadcn 기본 z-50이 아니다).
const SHEET_POSITION_CLASS =
  "fixed left-1/2 top-1/2 z-10000 max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2";

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
  // React 19 @types/react부터 RefObject<T>.current가 더는 암묵적으로 T | null이
  // 아니다(불변). useRef<T>(null)의 반환 타입이 RefObject<T | null>이므로 호출부와
  // 맞추려면 여기도 명시적으로 null을 더해야 한다.
  bodyRef?: RefObject<HTMLDivElement | null>;
  // ComponentPropsWithoutRef<"div">는 data-* 인덱스 시그니처가 없어(호출부가
  // 넘기는 { "data-section": ... } 실사용과 어긋난다) 명시적으로 얹는다.
  bodyProps?: ComponentPropsWithoutRef<"div"> & {
    [dataAttr: `data-${string}`]: string | undefined;
  };
  bodyClassName?: string;
  belowBody?: ReactNode;
  footerClassName?: string;
  footer?: ReactNode;
  triggerRef?: MutableRefObject<HTMLElement | null>;
  children?: ReactNode;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  if (!open) return null;

  return (
    <DialogPrimitive.Root
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-10000 bg-black/30" />
        <DialogPrimitive.Popup
          aria-labelledby={`${idPrefix}-university-name ${idPrefix}-title`}
          // Base UI DialogPrimitive.Popup은 role="dialog"/aria-labelledby는 자동
          // 배선하지만 aria-modal은 배선하지 않는다(패키지 전수 검색으로 확인) —
          // 옛 구현에 있던 aria-modal="true"를 리터럴로 보강한다.
          aria-modal="true"
          className={cn(SHEET_POSITION_CLASS, sheetClassName)}
          // 열릴 때 X 버튼에 포커스(예전 rAF + closeButtonRef.focus()와 동일한
          // 목적지). 닫힐 때는 triggerRef가 있으면 그 요소로, 없으면 Base UI
          // 기본값("이전에 포커스돼 있던 요소")으로 — 예전 fallbackTriggerRef가
          // document.activeElement를 열릴 때 캡처해 두던 것과 같은 결과다.
          initialFocus={closeButtonRef}
          finalFocus={triggerRef}
        >
          <div className="admission-modal-sheet-head relative px-6 pb-4 pt-8 md:px-12 md:pb-5 md:pt-10">
            <DialogPrimitive.Close
              ref={closeButtonRef}
              aria-label="닫기"
              className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full text-[#667085] transition hover:bg-[#e9f4ff] hover:text-primary md:right-6 md:top-6"
            >
              <X className="h-5 w-5" />
            </DialogPrimitive.Close>
            <p
              id={`${idPrefix}-university-name`}
              className="text-center text-base font-medium tracking-[-0.02em] text-primary"
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
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
