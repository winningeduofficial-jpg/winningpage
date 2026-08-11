import { useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useModalBehavior } from '../../../hooks/useModalBehavior';
import SectionedReportView, { getVisibleSections } from '../report/SectionedReportView';
import PerformanceReportSurface from '../report/PerformanceReportSurface';

// STEP4 설계 리포트 전체보기 모달 — docs/수행평가-상세-명세.md §5.13(`3754:4722` 실측) /
// §10.2 P10 「대형 모달, PDF/인쇄(`@media print`)」.
//
// §5.11 주제 상세 모달(`TopicDetailModal`)과 **껍데기를 공유하지 않는다**: 폭 77.5rem vs
// 47.625rem, 배경 흰색 vs `#fbfbfa`, 본문 인셋이 좌우 비대칭(2.5rem/4.5rem), 푸터 버튼이
// 우측 정렬 균등 2열, 그리고 인쇄 경로가 있다. 공유하는 것은 §5.11과 같이 **동작 로직뿐**이라
// `useModalBehavior`만 재사용한다(치수·구조 관례는 `TopicDetailModal`을 참고했다).
//
// ── 본문 구조가 §5.11과 다르다
// §5.11은 「라벨 + 평문 단락」 2요소지만 §5.13은 **키-값 + 중첩 목록**이다(§5.13 「본문 내부
// 하위 구조」). 그래서 섹션 껍데기는 같은 `SectionedReportView`를 쓰되 본문은 `blocks`
// 변형으로 넘어가고, 그 안쪽 마크업은 `renderBlock` + 블록 뷰가, 룩은
// `PerformanceReportSurface`가 갖는다(역할 경계는 `SectionedReportView` 상단 주석).
//
// ── 포털을 쓰는 이유는 **인쇄**다
// 이 모달은 `document.body` 바로 아래로 포털된다. 인쇄에서 앱 셸(사이드바·채팅 타임라인)을
// 걷어내야 하는데, 트리 안쪽에 있으면 조상 체인을 타고 형제만 골라 숨기는 규칙이 필요해
// 마크업 구조에 종속된 취약한 CSS가 된다(널리 쓰이는 `body * { visibility: hidden }` 트릭은
// 숨긴 요소가 자리를 그대로 차지해 빈 페이지를 만든다). 포털이면 `#root { display: none }`
// 한 줄로 끝나고 리포트가 문서의 유일한 흐름이 된다.
//
// ── 인쇄 규칙 소유권 (저장소 첫 `@media print` — 선례 0건, 전수 검색으로 확인)
//   이 파일: **크롬**. 앱 셸(`#root`)·프리헤더·딤·푸터 버튼을 숨기고, 고정 높이 + 내부
//     스크롤이던 패널을 문서 흐름으로 편다(안 그러면 첫 화면분만 인쇄된다).
//   `PerformanceReportSurface`: **본문**. 색 정규화, 페이지 넘김 회피 단위, 링크 표시.
//   원칙: 인쇄 규칙은 그 요소를 렌더하는 컴포넌트가 소유한다.
//   ⚠️ `#root`/`#pre-header`는 `index.html`이 정하는 전역 id다. 이 `<style>`은 모달이 열려
//     있는 동안에만 문서에 존재하므로 평상시 인쇄에는 영향이 없다.
//
// ── 닫기 수단
// §5.11과 마찬가지로 시안에 X 버튼이 없고 닫기 수단은 `창 닫고 작성하기` 하나다. ESC·딤
// 클릭·그 버튼을 전부 같은 `onClose`로 수렴시킨다.

/** §5.13 헤더 — 시안에 문구 원문이 없다(제목/부제 텍스트가 실측 표에 빠져 있음). 제안. */
const MODAL_TITLE = '통합 설계 리포트';
/** 인쇄 버튼 라벨. §5.13 primary 원문 그대로(가운데 공백 포함). */
const PRINT_LABEL = 'PDF로 저장 / 인쇄';
const CLOSE_LABEL = '창 닫고 작성하기';

/**
 * @param {boolean} open
 * @param {{sections: Array<{id?: string, label: string, blocks?: object[], text?: string}>}} [report]
 *   `design-report` 응답. 섹션 순서는 서버가 `DESIGN_REPORT_SECTIONS`로 이미 정렬해 내려준다
 *   (`api/performance/design-report.js buildSections`) — 클라이언트는 다시 정렬하지 않는다.
 * @param {string} [topicTitle] 확정한 주제 제목. 헤더 부제로 쓴다.
 * @param {() => void} onClose ESC·딤 클릭·`창 닫고 작성하기` 공통 핸들러.
 */
export default function DesignReportModal({ open, report, topicTitle, onClose }) {
  const panelRef = useRef(null);
  const titleId = useId();

  // `open`과 `report`를 한 표현식에서 파생시킨다 — 훅 입력과 렌더 조건이 갈리면
  // `open=true, report=null` 조합에서 body 스크롤이 잠기고 ESC 리스너가 붙는데 아무것도
  // 렌더되지 않는 무음 실패에 빠진다(`TopicDetailModal`과 같은 계약).
  const isOpen = open && Boolean(report);
  const visibleSections = report ? getVisibleSections(report.sections) : [];
  const hasContent = visibleSections.length > 0;

  useModalBehavior({ open: isOpen, onClose, panelRef });

  if (!isOpen) return null;

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

      {/* 딤 — `#00000066`(검정 40%, §5.13 실측 = `performance-dim` 토큰). 클릭 시 닫기. */}
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
        // 높이 46.9375rem(751px, §5.13/§7.3 정본) + `max-h-[90vh]` 병기. `max-h`만 두면 섹션
        // 길이에 따라 모달 높이가 출렁이고 내부 스크롤을 전제한 751px 고정값이 무의미해진다
        // (P9 `TopicDetailModal`에서 확립된 규칙).
        // 폭 77.5rem(1240) — `w-full max-w-`로 좁은 뷰포트에서는 오버레이 패딩(p-4)만 남기고
        // 줄어든다. 가로 스크롤은 생기지 않는다.
        className="performance-report-panel relative flex h-[46.9375rem] max-h-[90vh] w-full max-w-[77.5rem] flex-col overflow-hidden rounded-[1.25rem] bg-white shadow-[0_24px_60px_rgba(0,0,0,0.24)]"
      >
        {/* 헤더 — §5.13 실측: 패널 상단(y685)에서 2.5rem 내려 시작(y725), 세로 gap 0.25rem,
            아래 구분선(y795)까지 1.1875rem. 좌 인셋은 본문과 같은 2.5rem(넓은 뷰포트 기준,
            좁은 화면은 1.25rem으로 줄인다). 구분선 폭이 모달보다 11px 넓은 것은 시안 오차라
            (§5.13 표) 따르지 않는다. */}
        <div className="performance-report-head shrink-0 border-b border-performance-line px-[1.25rem] pb-[1.1875rem] pt-10 xl:px-10">
          <h2
            id={titleId}
            className="break-words text-[1.25rem] font-semibold leading-[1.625rem] text-ink"
          >
            {MODAL_TITLE}
          </h2>
          {/* 부제는 확정한 주제 제목이다. §5.13 헤더는 39.125rem×3.1875rem VERTICAL gap
              0.25rem 2줄 구조인데 **문구 원문이 실측 표에 없다** — 리포트 전체가 어느 주제의
              것인지가 이 자리에서 가장 필요한 정보라 주제명을 넣었다(제안). 주제가 없으면
              줄을 통째로 뺀다(가짜 문구를 지어내지 않는다). */}
          {topicTitle ? (
            <p className="mt-1 break-words text-[1rem] font-medium leading-[1.3125rem] text-ink-sub">
              {topicTitle}
            </p>
          ) : null}
        </div>

        {/* 본문 — 폭 70.5rem이 정본(§5.13), 인셋 좌 2.5rem / 우 4.5rem 비대칭(§7.3 —
            콘텐츠 우변 1508 → 모달 우변 1580 실측이라 좌우를 맞바꾸지 말 것). 2.5 + 70.5 +
            4.5 = 77.5rem으로 모달 폭과 정확히 맞는다.
            ⚠ 시안의 72px은 스크롤바를 그린 상태의 실측이지만, 여기서는 **스크롤바를 이 padding
            안에 접어 넣지 않고 그 바깥의 별도 거터로 본다** — 즉 72px은 콘텐츠 우변에서
            스크롤바까지의 거리다. 그 결과 클래식 스크롤바 플랫폼(Windows/Linux Chrome, 약 15px)
            에서는 실제 콘텐츠 폭이 70.5rem에서 스크롤바 폭만큼 줄고, 오버레이 스크롤바(macOS)
            에서는 정확히 70.5rem이 된다. 반대로 두면(padding에서 스크롤바 폭을 빼면) 플랫폼에
            따라 우측 인셋이 57px까지 좁아져 시안 실측과 눈에 띄게 어긋나고, CSS는 스크롤바
            실폭을 읽을 수 없어 두 값을 동시에 만족시킬 방법이 없다. 폭 정본이 우선이라고
            판정이 뒤집히면 `scrollbar-gutter: stable` + `calc()`로 거터를 고정하면 된다.
            비대칭 인셋은 모달이 온전히 들어가는
            뷰포트(xl≥1280px, 1240+패딩)에서만 적용하고 그 아래에서는 좌우 1.25rem 대칭으로
            떨어뜨린다 — 좁은 화면에서 우측 4.5rem을 유지하면 본문이 과하게 눌린다.
            포커서블 요소가 없는 스크롤 컨테이너는 Tab으로 도달할 수 없으므로 `tabIndex`를
            준다(ARIA APG "Scrollable Regions"). 이름 없는 generic div가 포커스 스톱이 되면
            낭독이 무음이라 `role="region"` + `aria-label`을 함께 준다. */}
        <div
          tabIndex={0}
          role="region"
          aria-label="설계 리포트 본문"
          className="performance-report-scroll min-h-0 flex-1 overflow-y-auto px-[1.25rem] py-10 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent xl:pl-10 xl:pr-[4.5rem]"
        >
          <div className="max-w-[70.5rem]">
            {hasContent ? (
              <PerformanceReportSurface>
                <SectionedReportView sections={visibleSections} />
              </PerformanceReportSurface>
            ) : (
              // 서버가 빈 섹션을 걸러 내려주므로(`buildSections`의 마지막 filter) 정상 경로에서는
              // 도달하지 않는다. 저장된 옛 리포트를 복원하는 경로(`toClientReport`가 `sections`를
              // 그대로 통과시킨다)를 위한 방어선이다 — 이때 인쇄 버튼도 비활성이다.
              <p className="text-[1rem] font-medium leading-[1.3125rem] text-ink-sub">
                설계 리포트 내용을 불러오지 못했어요. 창을 닫고 다시 시도해 주세요.
              </p>
            )}
          </div>
        </div>

        {/* 푸터 — 높이 5rem, 흰 배경, 버튼 우측 정렬 그룹 33.25rem(16.25 + 0.75 + 16.25) ×
            3.25rem(§5.13 실측). 상단 구분선은 시안 실측에 없으나 본문이 그 아래로 스크롤해
            들어가므로 경계 표시로 둔다(§5.11 푸터와 같은 처리 — 의도적 추가).
            좌우 인셋은 헤더·본문과 같은 2.5rem으로 근사한다(푸터는 스크롤바가 없어 정확한
            우측 인셋 실측치가 명세에 없다).
            버튼은 `shrink-0`을 두지 않는다 — 필요 폭 33.25rem(532px)이 가용 폭을 넘는 좁은
            뷰포트(vw < 604px)에서 축소가 막히면 `justify-end` 때문에 넘치는 분량이 좌측으로
            밀리고 패널의 `overflow-hidden`이 그것을 잘라낸다. 하필 잘리는 쪽이 유일한 명시적
            닫기 버튼(secondary)이다. 축소를 허용하면 두 버튼이 같이 줄고 라벨은 3.25rem 높이
            안에서 두 줄로 접힌다(1.25rem 줄높이 × 2 < 3.25rem). `min-w-0`은 플렉스 아이템의
            기본 `min-width: auto`가 축소를 다시 막는 것을 푼다. */}
        <div className="performance-print-hide flex h-20 shrink-0 items-center justify-end gap-3 rounded-b-[1.25rem] border-t border-performance-line bg-white px-[1.25rem] xl:px-10">
          <button
            type="button"
            onClick={onClose}
            className="flex h-[3.25rem] w-[16.25rem] min-w-0 max-w-full items-center justify-center rounded-xl border border-performance-line px-2 text-center text-[1rem] font-medium leading-[1.25rem] text-ink-sub transition hover:bg-performance-bubble active:scale-[0.97] motion-reduce:active:scale-100"
          >
            {CLOSE_LABEL}
          </button>
          <button
            type="button"
            // 브라우저 인쇄 다이얼로그를 그대로 쓴다 — "PDF로 저장"도 그 다이얼로그의 대상
            // 선택이라 별도 PDF 생성 라이브러리가 필요 없다(§10.2 P10이 요구한 것은
            // `@media print`다). 본문이 비면 인쇄할 것이 없으므로 비활성.
            onClick={() => window.print()}
            disabled={!hasContent}
            className="flex h-[3.25rem] w-[16.25rem] min-w-0 max-w-full items-center justify-center rounded-xl bg-primary px-2 text-center text-[1rem] font-semibold leading-[1.25rem] text-white transition hover:bg-primary/90 active:scale-[0.97] motion-reduce:active:scale-100 disabled:cursor-not-allowed disabled:bg-performance-line disabled:hover:bg-performance-line disabled:active:scale-100"
          >
            {PRINT_LABEL}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
