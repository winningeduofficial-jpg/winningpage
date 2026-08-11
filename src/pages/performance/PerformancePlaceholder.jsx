import { useParams } from 'react-router-dom';

// ⚠️ 플레이스홀더 — 실제 화면이 아니다.
//
// TODO(P4): 이 컴포넌트를 실제 셸·페이지로 교체한다.
//   · `PerformanceAppLayout` (사이드바 셸, 명세서 §3.1~§3.5)
//   · `PerformanceChatPage` (채팅 워크스페이스, §5.3~§5.17)
//   · `PerformanceReportsPage` / 상세 (§5.18~§5.19)
// 교체 시점에 App.jsx의 `/app/performance/*` 라우트 element도 함께 바꾸고
// 이 파일은 삭제한다.
//
// 왜 지금 빈 화면인가: 이번 슬라이스(P3)의 범위는 **부트스트랩 API와 라우트
// 배선**까지다. 시안이 확정한 레이아웃(§3, §7 디자인 토큰)을 여기서 임의로
// 흉내 내면 P4가 그것부터 걷어내야 하고, 중간에 사람이 보면 "이게 구현된
// 화면"으로 오해한다. 그래서 디자인을 만들지 않고 상태만 글자로 적는다.
//
// 이 자리에 도달했다는 것 자체가 배선 검증이다 — SessionProvider →
// RequireEntitlement(로그인·이용권) 체인을 통과했다는 뜻이다.

export default function PerformancePlaceholder({ screen }) {
  const params = useParams();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-2 bg-white px-6 text-center text-[#0D1B2A]">
      <p className="text-sm font-extrabold">수행평가 앱 — 화면 준비 중</p>
      <p className="text-xs text-[#0D1B2A]/60">
        {screen}
        {params.sessionId ? ` · sessionId=${params.sessionId}` : ''}
      </p>
      <p className="text-[0.6875rem] text-[#0D1B2A]/40">TODO(P4): 셸·채팅·리포트 화면으로 교체</p>
    </main>
  );
}
