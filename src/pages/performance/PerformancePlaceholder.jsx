import { useParams } from 'react-router-dom';

// ⚠️ 플레이스홀더 — 실제 화면이 아니다.
//
// P4에서 셸(`PerformanceAppLayout` + `PerformanceSidebar`)은 완성됐고, 이 컴포넌트는
// 그 셸 **안쪽** 캔버스에 들어가는 페이지 자리만 채운다. 그래서 전체 화면 중앙정렬이
// 아니라 캔버스 좌기준선을 따르는 인라인 블록이다.
//
// TODO(P5~P6): 아래 페이지들로 교체하고 이 파일을 삭제한다.
//   · P5 `PerformanceChatPage` — 채팅 워크스페이스·진행단계 상태머신 (§5.3~§5.17)
//   · P6 `PerformanceReportsPage` / 상세 (§5.18~§5.19)
// 교체 시점에 App.jsx의 `/app/performance/*` 하위 라우트 element도 함께 바꾼다.
//
// 왜 아직 빈 화면인가: 시안이 확정한 화면 내용(§5, 모달·폼·리포트)을 여기서 임의로
// 흉내 내면 다음 슬라이스가 그것부터 걷어내야 하고, 중간에 사람이 보면 "이게 구현된
// 화면"으로 오해한다. 그래서 디자인을 만들지 않고 상태만 글자로 적는다.

export default function PerformancePlaceholder({ screen }) {
  const params = useParams();

  return (
    <div className="mt-10 rounded-2xl border border-performance-line bg-performance-bubble px-5 py-4">
      <p className="text-[1rem] font-semibold leading-[1.3125rem] text-ink">
        {screen} — 화면 준비 중
      </p>
      {/* ink-sub(#808080) on performance-bubble(#f8f7f5)은 대비 약 3.7:1로 WCAG AA(4.5:1) 미달 —
          ink(#525252, 같은 배경 대비 약 7.3:1)로 렌더한다. */}
      <p className="mt-2 text-[0.875rem] leading-[1.125rem] text-ink">
        셸(사이드바·페이지 타이틀)만 구현된 상태다.
        {params.sessionId ? ` sessionId=${params.sessionId}` : ''}
      </p>
      <p className="mt-1 text-[0.875rem] leading-[1.125rem] text-ink">
        TODO(P5~P6): 채팅 워크스페이스·저장 리포트 화면으로 교체
      </p>
    </div>
  );
}
