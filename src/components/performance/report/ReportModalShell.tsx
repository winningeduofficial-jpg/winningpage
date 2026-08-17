import type { ReactNode } from "react";
import { useId, useRef } from "react";
import { createPortal } from "react-dom";
import { useModalBehavior } from "@/hooks/useModalBehavior";

// 대형 리포트 모달의 **껍데기** — docs/수행평가-상세-명세.md §5.13(`3754:4722` 설계 리포트) /
// §5.16(`3754:4512` 평가 리포트) 공통.
//
// ── 왜 공유 껍데기인가 (판단이 아니라 명세 실측이다)
// §7.3 표 L1456 「평가/설계 리포트 모달 (`4512`/`4722`) | 77.5rem(1240) | 좌 2.5rem(40) |
// 콘텐츠 70.5rem(1128) | 우 4.5rem(72) | 스크롤바 @1645, 우변에서 6px」 — 두 노드가
// **한 행으로 묶여 같은 수치**를 갖는다. 헤더 타이포·구분선, 본문 섹션 gap, 푸터
// 1240×80·우측 정렬 버튼 2개, 딤 `#00000066`도 §5.13/§5.16 실측이 서로 같다.
// 다른 것은 ⓐ 헤더 문구 ⓑ 본문 내용 ⓒ 푸터 버튼 2개뿐이라 그 셋만 prop으로 받는다.
//
// **이 파일은 P10 `DesignReportModal`에서 껍데기를 그대로 들어올린 것이다**(치수·인쇄·
// 스크롤 영역 처리 관례 전부 그쪽이 확립했다). 아래 주석도 그 파일에서 옮겨 온 것이며,
// 옮기면서 바뀐 동작은 없다.
//
// ── 포털을 쓰는 이유는 **인쇄**다
// 이 모달은 `document.body` 바로 아래로 포털된다. 인쇄에서 앱 셸(사이드바·채팅 타임라인)을
// 걷어내야 하는데, 트리 안쪽에 있으면 조상 체인을 타고 형제만 골라 숨기는 규칙이 필요해
// 마크업 구조에 종속된 취약한 CSS가 된다(널리 쓰이는 `body * { visibility: hidden }` 트릭은
// 숨긴 요소가 자리를 그대로 차지해 빈 페이지를 만든다). 포털이면 `#root { display: none }`
// 한 줄로 끝나고 리포트가 문서의 유일한 흐름이 된다.
//
// ── 인쇄 규칙 소유권 (저장소 첫 `@media print`)
//   이 파일: **크롬**. 앱 셸(`#root`)·프리헤더·딤·푸터 버튼을 숨기고, 고정 높이 + 내부
//     스크롤이던 패널을 문서 흐름으로 편다(안 그러면 첫 화면분만 인쇄된다).
//   `PerformanceReportSurface`: **본문**. 색 정규화, 페이지 넘김 회피 단위, 링크 표시.
//   원칙: 인쇄 규칙은 그 요소를 렌더하는 컴포넌트가 소유한다.
//   ⚠️ `#root`/`#pre-header`는 `index.html`이 정하는 전역 id다. 이 `<style>`은 모달이 열려
//     있는 동안에만 문서에 존재하므로 평상시 인쇄에는 영향이 없다.
//
// ── 닫기 수단
// §5.11·§5.13·§5.16 어느 시안에도 X 버튼이 없다. ESC·딤 클릭·푸터 secondary 버튼을 전부
// 같은 `onClose`로 수렴시키는 것이 이 앱의 관례다.
//
// ── 호출부 계약
//   · `open`은 **이미 파생된 값**을 넘긴다(예: `open && Boolean(report)`). 훅 입력과 렌더
//     조건이 갈리면 `open=true, 내용=null` 조합에서 body 스크롤이 잠기고 ESC 리스너가
//     붙는데 아무것도 렌더되지 않는 무음 실패에 빠진다.
//   · 모달을 **자동으로** 여는 호출부(리포트 완성 즉시 오픈)는 닫을 때 포커스 목적지를
//     직접 지정해야 한다 — `useModalBehavior`가 기억한 트리거(로딩 버블)는 그 시점에 이미
//     언마운트돼 있어 자동 복귀가 `<body>`로 떨어진다.
type ReportModalShellProps = {
  /** 이미 파생된 열림 여부. */
  open: boolean;
  /** 헤더 제목(`<h2>`, 다이얼로그 접근 이름). */
  title: string;
  /** 헤더 부제. 없으면 줄을 통째로 뺀다(빈 자리를 지어내지 않는다). */
  subtitle?: string;
  /** 스크롤 영역의 `aria-label`. */
  scrollLabel: string;
  /** 본문(폭 70.5rem 래퍼 안에 들어간다). */
  children: ReactNode;
  /** 푸터 우측 정렬 버튼 그룹. */
  footer?: ReactNode;
  /** ESC·딤 클릭 공통 핸들러(푸터 닫기 버튼도 호출부가 여기로 묶는다). */
  onClose: () => void;
};

export default function ReportModalShell({
  open,
  title,
  subtitle,
  scrollLabel,
  children,
  footer,
  onClose,
}: ReportModalShellProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useModalBehavior({ open, onClose, panelRef });

  if (!open) return null;

  return createPortal(
    <div className="performance-report-overlay fixed inset-0 z-[100] flex items-center justify-center p-4">
      <style>{`
        @media print {
          /* 앱 셸과 프리헤더를 통째로 걷는다 — 인쇄되는 것은 이 포털의 리포트뿐이다. */
          #root, #pre-header { display: none !important; }
          /* useModalBehavior가 걸어 둔 배경 스크롤 잠금을 인쇄에서는 푼다 —
             overflow:hidden인 body는 브라우저에 따라 첫 페이지에서 잘린다. */
          body { overflow: visible !important; background: #ffffff !important; }

          .performance-report-overlay {
            position: static !important;
            display: block !important;
            padding: 0 !important;
          }
          /* 딤(잉크 낭비 + 본문 가림)과 푸터 버튼(종이에서 누를 수 없다). */
          .performance-report-dim,
          .performance-print-hide { display: none !important; }

          /* 고정 높이 + 내부 스크롤 → 문서 흐름. 이 전환이 없으면 첫 화면분만 인쇄된다. */
          .performance-report-panel {
            position: static !important;
            width: 100% !important;
            max-width: none !important;
            height: auto !important;
            max-height: none !important;
            overflow: visible !important;
            border: 0 !important;
            border-radius: 0 !important;
            box-shadow: none !important;
          }
          /* 인셋은 @page 여백(15mm)이 대신한다. **헤더와 본문을 같이 걷는다** — 본문만
             0으로 만들면 제목·부제만 20px 들여쓰인 채 남아 좌측 정렬이 어긋난다
             (xl: 분기는 A4 페이지 박스 폭(약 794px)에서 걸리지 않아 px-[1.25rem]이 남는다). */
          .performance-report-head,
          .performance-report-scroll {
            padding-left: 0 !important;
            padding-right: 0 !important;
          }
          .performance-report-scroll {
            overflow: visible !important;
            max-height: none !important;
            flex: none !important;
            padding-top: 0 !important;
            padding-bottom: 0 !important;
          }
          .performance-report-scroll > * { max-width: none !important; }

          @page { margin: 15mm; }
        }
      `}</style>

      {/* 딤 — `#00000066`(검정 40%, §5.13/§5.16 실측 = `performance-dim` 토큰). 클릭 시 닫기. */}
      <div
        className="performance-report-dim absolute inset-0 bg-performance-dim"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        // 높이 46.9375rem(751px, §5.13/§5.16/§7.3 정본) + `max-h-[90vh]` 병기. `max-h`만 두면
        // 섹션 길이에 따라 모달 높이가 출렁이고 내부 스크롤을 전제한 751px 고정값이
        // 무의미해진다(P9 `TopicDetailModal`에서 확립된 규칙).
        // 폭 77.5rem(1240) — `w-full max-w-`로 좁은 뷰포트에서는 오버레이 패딩(p-4)만 남기고
        // 줄어든다. 가로 스크롤은 생기지 않는다.
        className="performance-report-panel relative flex h-[46.9375rem] max-h-[90vh] w-full max-w-[77.5rem] flex-col overflow-hidden rounded-[1.25rem] bg-white shadow-[0_24px_60px_rgba(0,0,0,0.24)]"
      >
        {/* 헤더 — §5.13/§5.16 실측: 패널 상단에서 2.5rem 내려 시작, 세로 gap 0.25rem,
            아래 구분선까지 1.1875rem. 좌 인셋은 본문과 같은 2.5rem(넓은 뷰포트 기준,
            좁은 화면은 1.25rem으로 줄인다). 구분선 폭이 모달보다 11px 넓은 것은 시안
            오차라(§13 오류 표 「헤더 구분선 폭 1251」) 따르지 않는다. */}
        <div className="performance-report-head shrink-0 border-b border-performance-line px-[1.25rem] pb-[1.1875rem] pt-10 xl:px-10">
          <h2
            id={titleId}
            className="break-words text-[1.25rem] font-semibold leading-[1.625rem] text-ink"
          >
            {title}
          </h2>
          {subtitle ? (
            <p className="mt-1 break-words text-[1rem] font-medium leading-[1.3125rem] text-ink-sub">
              {subtitle}
            </p>
          ) : null}
        </div>

        {/* 본문 — 폭 70.5rem이 정본(§7.3), 인셋 좌 2.5rem / 우 4.5rem 비대칭(콘텐츠 우변 →
            모달 우변 실측이라 좌우를 맞바꾸지 말 것). 2.5 + 70.5 + 4.5 = 77.5rem으로 모달
            폭과 정확히 맞는다.
            ⚠ 시안의 72px은 스크롤바를 그린 상태의 실측이지만, 여기서는 **스크롤바를 이 padding
            안에 접어 넣지 않고 그 바깥의 별도 거터로 본다** — 즉 72px은 콘텐츠 우변에서
            스크롤바까지의 거리다. 그 결과 클래식 스크롤바 플랫폼(Windows/Linux Chrome, 약 15px)
            에서는 실제 콘텐츠 폭이 70.5rem에서 스크롤바 폭만큼 줄고, 오버레이 스크롤바(macOS)
            에서는 정확히 70.5rem이 된다. 반대로 두면(padding에서 스크롤바 폭을 빼면) 플랫폼에
            따라 우측 인셋이 57px까지 좁아져 시안 실측과 눈에 띄게 어긋나고, CSS는 스크롤바
            실폭을 읽을 수 없어 두 값을 동시에 만족시킬 방법이 없다.
            비대칭 인셋은 모달이 온전히 들어가는 뷰포트(xl≥1280px, 1240+패딩)에서만 적용하고
            그 아래에서는 좌우 1.25rem 대칭으로 떨어뜨린다 — 좁은 화면에서 우측 4.5rem을
            유지하면 본문이 과하게 눌린다.
            포커서블 요소가 없는 스크롤 컨테이너는 Tab으로 도달할 수 없으므로 `tabIndex`를
            준다(ARIA APG "Scrollable Regions"). 이름 없는 generic div가 포커스 스톱이 되면
            낭독이 무음이라 `role="region"` + `aria-label`을 함께 준다. */}
        <section
          // biome-ignore lint/a11y/noNoninteractiveTabindex: 위 주석 참고 — APG Scrollable Regions 패턴.
          tabIndex={0}
          aria-label={scrollLabel}
          className="performance-report-scroll min-h-0 flex-1 overflow-y-auto px-[1.25rem] py-10 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent xl:pl-10 xl:pr-[4.5rem]"
        >
          <div className="max-w-[70.5rem]">{children}</div>
        </section>

        {/* 푸터 — 높이 5rem, 흰 배경, 버튼 우측 정렬 그룹 33.25rem(16.25 + 0.75 + 16.25) ×
            3.25rem(§5.13/§5.16 실측). 상단 구분선은 시안 실측에 없으나 본문이 그 아래로
            스크롤해 들어가므로 경계 표시로 둔다(§5.11 푸터와 같은 처리 — 의도적 추가).
            좌우 인셋은 헤더·본문과 같은 2.5rem으로 근사한다(푸터는 스크롤바가 없어 정확한
            우측 인셋 실측치가 명세에 없다). */}
        {footer ? (
          <div className="performance-print-hide flex h-20 shrink-0 items-center justify-end gap-3 rounded-b-[1.25rem] border-t border-performance-line bg-white px-[1.25rem] xl:px-10">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

/**
 * 푸터 버튼 2종. §5.13/§5.16 실측이 같다 — 16.25rem×3.25rem r0.75rem, secondary는 stroke
 * `#d9d9d9` + 1rem w500 `ink-sub`, primary는 `fill #013262`(§11.1 Q5 결정) + 1rem w600 흰색.
 *
 * `shrink-0`을 두지 않는다 — 필요 폭 33.25rem(532px)이 가용 폭을 넘는 좁은 뷰포트
 * (vw < 604px)에서 축소가 막히면 `justify-end` 때문에 넘치는 분량이 좌측으로 밀리고 패널의
 * `overflow-hidden`이 그것을 잘라낸다. 하필 잘리는 쪽이 유일한 명시적 닫기 버튼(secondary)이다.
 * 축소를 허용하면 두 버튼이 같이 줄고 라벨은 3.25rem 높이 안에서 두 줄로 접힌다
 * (1.25rem 줄높이 × 2 < 3.25rem). `min-w-0`은 플렉스 아이템의 기본 `min-width: auto`가
 * 축소를 다시 막는 것을 푼다.
 */
export const REPORT_MODAL_FOOTER_BUTTON = {
  secondary:
    "flex h-[3.25rem] w-[16.25rem] min-w-0 max-w-full items-center justify-center rounded-xl border border-performance-line px-2 text-center text-[1rem] font-medium leading-[1.25rem] text-ink-sub transition hover:bg-performance-bubble active:scale-[0.97] motion-reduce:active:scale-100 disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100",
  primary:
    "flex h-[3.25rem] w-[16.25rem] min-w-0 max-w-full items-center justify-center rounded-xl bg-primary px-2 text-center text-[1rem] font-semibold leading-[1.25rem] text-white transition hover:bg-primary/90 active:scale-[0.97] motion-reduce:active:scale-100 disabled:cursor-not-allowed disabled:bg-performance-line disabled:hover:bg-performance-line disabled:active:scale-100",
};
