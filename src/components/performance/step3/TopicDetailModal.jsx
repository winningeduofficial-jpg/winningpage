import { useId, useRef } from 'react';
import { useModalBehavior } from '../../../hooks/useModalBehavior';
import SectionedReportView from '../report/SectionedReportView';

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

  useModalBehavior({ open, onClose, panelRef });

  if (!open || !topic) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* 딤 — `#00000066`(검정 40%, §5.11 실측 = `performance-dim` 토큰). 클릭 시 닫기. */}
      <div className="absolute inset-0 bg-performance-dim" onClick={onClose} aria-hidden="true" />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex max-h-[90vh] w-full max-w-[47.625rem] flex-col overflow-hidden rounded-2xl border border-performance-line bg-[#fbfbfa] shadow-[0_24px_60px_rgba(0,0,0,0.24)]"
      >
        {/* 헤더 — 제목 1.25rem/1.625rem w600 ink, 부제 1rem/1.3125rem w500 ink-sub, 하단
            구분선 performance-line. §5.11 실측 좌 인셋 2.125rem을 헤더·본문·푸터 공통으로
            쓴다(우측 인셋은 본문 스크롤바 거터를 포함한 산출값이라 헤더·푸터에 그대로 옮기지
            않는다 — 명세 「인과로 읽지 말 것」 경고). */}
        <div className="shrink-0 border-b border-performance-line px-[2.125rem] py-[1.5rem]">
          <h2 id={titleId} className="text-[1.25rem] font-semibold leading-[1.625rem] text-ink">
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
            tabIndex를 준다. */}
        <div
          tabIndex={0}
          className="min-h-0 flex-1 overflow-y-auto px-[2.125rem] py-[1.75rem] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
        >
          <div className="max-w-[41.875rem]">
            <SectionedReportView sections={topic.detail} />
          </div>
        </div>

        {/* 푸터 — 높이 5rem, 흰 배경, 상단 구분선, 하단 모서리만 라운드. 비대칭 2버튼 +
            gap 1.25rem(§5.11 실측). 좌우 인셋은 본문과 같은 2.125rem으로 근사한다(푸터는
            스크롤바가 없어 정확한 우측 인셋 실측치가 명세에 없다).
            순서는 secondary(다른 주제 보기) → primary(확정하기)다 — §5.11 「문구 원문」
            블록의 추출 순서, 그리고 이 저장소의 다른 모달(`goal/AppModal` 취소→저장
            2열)과 같은 좌:보조/우:주요 관례를 따른다. */}
        <div className="flex h-20 shrink-0 items-center gap-5 rounded-b-2xl border-t border-performance-line bg-white px-[2.125rem]">
          <button
            type="button"
            onClick={onClose}
            className="flex h-[3.25rem] w-[15.9375rem] max-w-full items-center justify-center rounded-xl border border-performance-line text-[1rem] font-medium text-ink-sub transition hover:bg-performance-bubble active:scale-[0.97] motion-reduce:active:scale-100"
          >
            다른 주제 보기
          </button>
          <button
            type="button"
            onClick={onConfirm ? () => onConfirm(topic) : undefined}
            className="flex h-[3.25rem] w-[25.9375rem] max-w-full items-center justify-center rounded-xl bg-primary text-[1rem] font-semibold text-white transition hover:bg-primary/90 active:scale-[0.97] motion-reduce:active:scale-100"
          >
            이 주제로 확정하기
          </button>
        </div>
      </div>
    </div>
  );
}
