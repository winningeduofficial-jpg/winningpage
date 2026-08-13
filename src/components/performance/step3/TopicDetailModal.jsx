import { useId, useRef } from "react";
import { useModalBehavior } from "../../../hooks/useModalBehavior";
import SectionedReportView, {
  getVisibleSections,
} from "../report/SectionedReportView";

// STEP3 주제 상세 모달 — docs/수행평가-상세-명세.md §5.11(`3754:4872` 실측) / §10.2 P9
// 「범용 모달(ESC/딤/포커스 트랩), `SectionedReportView`, 6섹션 렌더, 확정 버튼은 모달
// 하단에만」.
//
// goal `AppModal`과 프레젠테이션을 공유하지 않는다(폭 47.625rem vs 33.125rem, X 버튼 없음,
// 배경 `#fbfbfa` vs 흰색, 비대칭 2버튼 푸터 vs 균등 2열 취소/저장 — §11.1 Q48/작업 지시
// 근거). 공유하는 것은 동작 로직뿐이라 `useModalBehavior`(src/hooks/useModalBehavior.js,
// goal `AppModal`도 같은 훅을 쓴다)만 재사용한다.
//
// **닫기 수단이 하나로 수렴한다.** 시안 단정: 모달에 X 버튼이 없고 닫기 수단은
// `다른 주제 보기` 버튼뿐이다. 그러나 §10.2 P9가 ESC/딤 클릭/포커스 트랩을 명시적으로
// 요구하므로 셋 다 구현하되, 전부 `다른 주제 보기`와 같은 동작(모달을 닫고 카드 목록으로
// 복귀)으로 수렴시킨다 — `onClose` 하나가 셋의 핸들러다.
//
// **`이 주제로 확정하기`는 확정 처리를 하지 않는다.** §10.2 P10(설계 리포트)이 "주제 확정 +
// 리포트 생성"을 한 트랜잭션(`design-report` API)으로 묶는 설계이고(§8.6 근거 — 외부 앱의
// 2회 왕복 결함을 피하기 위함), 여기서 별도 확정 API를 부르면 그 설계가 깨진다. 그래서 이
// 버튼은 `onConfirm(topic)` 콜백만 부른다 — 모달을 닫을지, STEP4 로딩으로 전환할지는 전부
// 호출부(`PerformanceChatPage`, P9 작업 3) 몫이다. **다음 단계(P10)는 아직 구현되지 않았다.**
//
// **접근성 배경 차단**: `aria-modal="true"` 하나에만 의존한다(goal `AppModal`과 같은 저장소
// 관례) — 이 컴포넌트는 앱 루트에 대한 참조가 없는 저수준 모달이라 형제 트리에 `inert`를
// 직접 걸 수 없고, 새 인프라(포털+루트 ref)를 이번 슬라이스에서 만들지 않는다.
/**
 * @param {boolean} open
 * @param {{id: string, title: string, detail: Array<{id?: string, label: string, text: string}>}} [topic]
 *   `recommend-topics` 응답의 주제 1건. `detail`은 서버가 `TOPIC_DETAIL_SECTIONS` 순서로
 *   이미 정렬해 내려준다(`api/performance/recommend-topics.js` `buildDetail`) — 클라이언트는
 *   순서를 다시 정하지 않고 받은 그대로 렌더한다.
 * @param {() => void} onClose ESC·딤 클릭·`다른 주제 보기` 공통 핸들러. 모달을 닫고 카드
 *   목록으로 복귀시킨다.
 * @param {(topic: object) => void} [onConfirm] `이 주제로 확정하기` 클릭 시 호출. **여기서
 *   확정 API를 부르지 않는다** — 위 주석 참고.
 */
export default function TopicDetailModal({ open, topic, onClose, onConfirm }) {
  const panelRef = useRef(null);
  const titleId = useId();

  // `open`과 `topic`을 한 표현식에서 파생시킨다 — 훅 입력과 렌더 조건이 따로 놀면
  // `open=true, topic=null`(호출부가 둘을 다른 소스에서 파생시키는 재사용 케이스) 같은 조합에서
  // body 스크롤이 잠기고 ESC 리스너가 붙는데 아무것도 렌더되지 않아 포커스 트랩이 무음
  // 실패하는 상태에 빠진다(검토 D-1). 현재 호출부(`PerformanceChatPage`)는 두 값을 같은
  // `topicDetail` 상태에서 파생시켜 실제로는 도달 불가하지만, 재사용을 노린 컴포넌트라 계약을
  // 코드로 못박는다.
  const isOpen = open && Boolean(topic);
  // 유효 섹션이 0개면(§5.11이 전제하는 "근거를 보고 확정" 흐름이 성립하지 않는다 — §11.1 Q48)
  // 안내 문구로 대체하고 확정 버튼을 비활성화한다(검토 C-2). 신규 생성 경로는
  // `validateTopicsPayload`가 6필드 공백을 걸러 도달하지 않지만, 기존 세션을 복원하는 경로
  // (`recommend-topics.js`의 `detail: Array.isArray(row.detail) ? row.detail : []`)는 빈
  // 배열을 그대로 통과시켜 여기까지 온다.
  const hasVisibleDetail = topic
    ? getVisibleSections(topic.detail).length > 0
    : false;

  useModalBehavior({ open: isOpen, onClose, panelRef });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* 딤 — `#00000066`(검정 40%, §5.11 실측 = `performance-dim` 토큰). 클릭 시 닫기. */}
      <div
        className="absolute inset-0 bg-performance-dim"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        // 높이 h-[50.9375rem](815px, §5.11/§7.3 정본) + max-h-[90vh]를 함께 둔다. `max-h`만
        // 있으면 6섹션 본문 길이에 따라 모달 높이가 출렁이고(짧은 `detail`이면 400px대,
        // 1920×1080에서 90vh=972px까지도 자란다) 본문 내부 스크롤을 전제로 한 815px 고정값이
        // 무의미해진다. `h-`가 뷰포트보다 크면 `max-h-[90vh]`가 낮은 뷰포트에서 잘림을
        // 막는다(검토 B-1).
        //
        // `bg-[#fbfbfa]`는 임의값이다 — `tailwind.config.js`의 `goal.card`(#FBFBFA)와 같은 값이
        // 이미 있지만 의도적으로 재사용하지 않았다(goal/performance 두 앱은 시안이 독립적으로
        // 개정되므로 값이 같아도 토큰을 합치지 않는 게 이 저장소 관례 — 아래 `performance` 색
        // 블록 상단 경고 참고). 그렇다고 `performance` 스코프에 새 토큰을 만들지도 않았다 —
        // 이 저장소는 "반복되는 것만 토큰화"한다(`tailwind.config.js` spacing 섹션 주석과 동일
        // 원칙)는데 이 배경색은 지금 이 모달 1곳에서만 쓰인다. §5.13/§5.16 리포트 모달이
        // 만들어질 때 같은 배경을 요구하면(시안 근거로 확인 후) 그때 `performance.card` 같은
        // 토큰으로 승격할 것(검토 E-3).
        //
        // `shadow-[0_24px_60px_rgba(0,0,0,0.24)]`는 §5.11에 실측이 없다 — `goal/AppModal.jsx`의
        // 모달 그림자와 동일 값을 저장소 관례로 차용했다(검토 E-4). 시안 미실측 값이므로 실제
        // 디자인 확인 시 조정될 수 있다.
        className="relative flex h-[50.9375rem] max-h-[90vh] w-full max-w-[47.625rem] flex-col overflow-hidden rounded-2xl border border-performance-line bg-[#fbfbfa] shadow-[0_24px_60px_rgba(0,0,0,0.24)]"
      >
        {/* 헤더 — 제목 1.25rem/1.625rem w600 ink, 부제 1rem/1.3125rem w500 ink-sub, 하단
            구분선 performance-line. §5.11 실측 좌 인셋 2.125rem을 헤더·본문·푸터 공통으로
            쓴다(우측 인셋은 본문 스크롤바 거터를 포함한 산출값이라 헤더·푸터에 그대로 옮기지
            않는다 — 명세 「인과로 읽지 말 것」 경고). */}
        <div className="shrink-0 border-b border-performance-line px-[2.125rem] py-[1.5rem]">
          {/* break-words — 긴 무공백 문자열(URL 등)이 제목에 오면 패널 `overflow-hidden`에
              잘려서 소실된다(검토 D-4). */}
          <h2
            id={titleId}
            className="break-words text-[1.25rem] font-semibold leading-[1.625rem] text-ink"
          >
            {topic.title}
          </h2>
          {/* 시안 원문 고정 문구(§5.11 「문구 원문」 둘째 줄) — 특정 주제의 샘플 본문이 아니라
              이 모달 전체에 붙는 안내 카피라 하드코딩한다(§5.11 경고가 금지하는 "헤더 제목 ↔
              본문 6섹션 불일치 더미"와는 다른 대상 — 그쪽은 `topic.title`/`topic.detail`처럼
              서버 데이터로 대체된다). */}
          <p className="mt-1 text-[1rem] font-medium leading-[1.3125rem] text-ink-sub">
            선정 근거와 심화 방향을 확인한 뒤 확정하세요
          </p>
        </div>

        {/* 본문 — 폭 41.875rem이 정본(§5.11), 좌 인셋 2.125rem 고정. 키보드 스크롤이
            가능해야 하므로(포커서블 요소가 없는 스크롤 컨테이너는 Tab으로 도달 불가)
            tabIndex를 준다. `role="region"` + `aria-label`은 ARIA APG "Scrollable Regions"
            패턴 — 이름·역할 없는 generic div가 포커스 스톱이 되는 것을 막는다(검토 C-1).
            `useModalBehavior`의 초기 포커스가 `panel.querySelector(FOCUSABLE_SELECTOR)`로
            바로 이 div를 잡으므로, 라벨이 없으면 모달이 열리는 순간의 첫 낭독이 무음이었다.
            상하 패딩 1.25rem(20px) — §5.11 실측(헤더 구분선 y673 → 섹션1 라벨 y693)이 상단만
            직접 규정하고 하단 대응 좌표는 없다(마지막 섹션이 스크롤 대상이라 "끝까지 스크롤한
            뒤 여백"이라는 별도 실측 자체가 시안에 없음). 별도 근거가 없는 한 상하를 같은
            값으로 둔다(검토 B-2). */}
        <section
          // biome-ignore lint/a11y/noNoninteractiveTabindex: APG Scrollable Regions 패턴 — useModalBehavior가 이 요소를 초기 포커스로 잡는다.
          tabIndex={0}
          aria-label="주제 상세 내용"
          className="min-h-0 flex-1 overflow-y-auto px-[2.125rem] py-[1.25rem] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
        >
          <div className="max-w-[41.875rem]">
            {hasVisibleDetail ? (
              <SectionedReportView sections={topic.detail} />
            ) : (
              // 유효 섹션이 0개 — 검토 C-2. 근거 없이 확정할 수 있는 상태를 막는다(§11.1 Q48).
              <p className="text-[1rem] font-medium leading-[1.3125rem] text-ink-sub">
                이 주제의 선정 근거 정보를 아직 불러오지 못했어요. 다른 주제를
                선택해 주세요.
              </p>
            )}
          </div>
        </section>

        {/* 푸터 — 높이 5rem, 흰 배경, 상단 구분선, 하단 모서리만 라운드. 비대칭 2버튼 +
            gap 1.25rem(§5.11 실측). 좌우 인셋은 본문과 같은 2.125rem으로 근사한다(푸터는
            스크롤바가 없어 정확한 우측 인셋 실측치가 명세에 없다).
            순서는 secondary(다른 주제 보기) → primary(확정하기)다 — §5.11 「문구 원문」
            블록의 추출 순서, 그리고 이 저장소의 다른 모달(`goal/AppModal` 취소→저장
            2열)과 같은 좌:보조/우:주요 관례를 따른다.

            **폭 여유가 0.25rem(4px)뿐이다 — 검산(검토 E-2), 건드리기 전에 다시 계산할 것:**
              25.9375 + 15.9375              = 41.875rem   (버튼 합)
              + 1.25 (gap-5)                 = 43.125rem
              + 2.125×2 (px-[2.125rem])      = 47.375rem   (푸터 소요)
              모달 폭                          = 47.625rem
              → 여유 0.25rem (4px)
            본문의 비대칭 우측값(3.625rem, 스크롤바 거터 포함값)으로 "맞추면" 47.375rem 대신
            43.125 + 2.125 + 3.625 = 48.875rem이 되어 모달 폭을 1.25rem 초과한다 — 본문 우측
            인셋과 푸터 인셋은 서로 다른 산출식이라 맞바꾸지 말 것.
            버튼에 `shrink-0`을 줘 794px 미만(모달 47.625rem/762px 미만)에서 컨테이너가
            좁아져도 라벨이 2줄로 무너지지 않게 한다(완화 목적 — 셸 자체가 이 폭 미만에서
            이미 반응형 분기가 없으므로 여기서 과하게 대응하지 않는다). */}
        <div className="flex h-20 shrink-0 items-center gap-5 rounded-b-2xl border-t border-performance-line bg-white px-[2.125rem]">
          <button
            type="button"
            onClick={onClose}
            className="flex h-[3.25rem] w-[15.9375rem] max-w-full shrink-0 items-center justify-center rounded-xl border border-performance-line text-[1rem] font-medium leading-[1.25rem] text-ink-sub transition hover:bg-performance-bubble active:scale-[0.97] motion-reduce:active:scale-100"
          >
            다른 주제 보기
          </button>
          <button
            type="button"
            onClick={() => onConfirm?.(topic)}
            disabled={!onConfirm || !hasVisibleDetail}
            className="flex h-[3.25rem] w-[25.9375rem] max-w-full shrink-0 items-center justify-center rounded-xl bg-primary text-[1rem] font-semibold leading-[1.25rem] text-white transition hover:bg-primary/90 active:scale-[0.97] motion-reduce:active:scale-100 disabled:cursor-not-allowed disabled:bg-performance-line disabled:hover:bg-performance-line disabled:active:scale-100"
          >
            이 주제로 확정하기
          </button>
        </div>
      </div>
    </div>
  );
}
