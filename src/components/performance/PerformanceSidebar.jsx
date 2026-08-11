import { NavLink, useLocation } from 'react-router-dom';

// 수행평가 앱 좌측 고정 사이드바 — docs/수행평가-상세-명세.md §3.2 / §3.4.
//
// ⚠️ **최소 스텁이다.** 이번 슬라이스(P4)의 범위는 셸 골격과 디자인 토큰까지이고,
//    사이드바 내용물은 다음 슬라이스가 채운다. 지금 있는 것은 레이아웃이 성립하는 데
//    필요한 최소치(폭·배경·좌 인셋 + 라우트 이동용 메뉴 2항목)뿐이다.
//
// TODO(P5): 아래를 채운다.
//   · 프로필 블록 실데이터 — `useSession()`의 사용자·프로필로 교체(§3.2 @60,100 / @60,130).
//     시안 원문은 `김주원의 목표관리`인데 수행평가 사이드바에 목표관리 문구가 박힌
//     시안 오류로 보인다. 문구 정본이 정해지기 전까지 가짜 이름을 렌더하지 않는다.
//   · 진행단계 5스텝(`기본 정보`/`안내문 입력`/`주제 추천`/`설계 리포트`/`작성・평가`)과
//     3상태 머신(done/current/todo) — §3.3. 배지는 §3.2 제안대로 원형 번호 배지 방식
//     (done `surface-badge` + 체크, current `accent` + 흰 숫자, todo `surface-04`).
//     저장 리포트 화면에서는 활성 스텝이 0개다(§3.3 노드별 표).
//
// 실측 규격(§3.2/§7.3): 폭 324px(20.25rem), 좌 인셋 60px(3.75rem), 활성 pill 304×36 @x=10 r6.
// 시안 절대 y좌표(프로필 100/130, 메뉴 섹션 291, 항목 328·370)는 초기 배치 근거로만 쓰고
// flex column + gap으로 구현한다 — GoalSidebar가 같은 관례를 쓴다.

const MENU_ITEMS = [
  // §3.4: `3754:3035` 한 노드만 `위닝 채팅`이고 나머지 전 노드가 `위닝 AI 채팅`이라 후자가 정본.
  // 세 번째 항목 `설정`(3754:4872 단독)은 이번 범위 제외(§11 Q3).
  { label: '위닝 AI 채팅', to: '/app/performance' },
  { label: '저장 리포트', to: '/app/performance/reports' }
];

export default function PerformanceSidebar() {
  const { pathname } = useLocation();
  // `/app/performance/:sessionId`(새로고침 복구)도 채팅 화면이므로 `위닝 AI 채팅`이 활성이어야 한다.
  // NavLink의 `end`만으로는 그 경로에서 활성이 꺼지므로 경로 판정을 직접 한다.
  const isReports = pathname.startsWith('/app/performance/reports');

  return (
    <aside className="flex min-h-screen w-perf-sidebar flex-shrink-0 flex-col bg-performance-sidebar">
      {/* 프로필 — TODO(P5)에서 실데이터로 교체. 자리만 잡아 둔다. */}
      <div className="px-perf-inset pt-[6.25rem]">
        <p className="text-[1.25rem] font-semibold leading-[1.625rem] text-ink-sub">
          위닝 수행평가
        </p>
        <p className="mt-2 text-[1rem] leading-[1.3125rem] text-ink-sub">학생 프로필 준비 중</p>
      </div>

      {/* 메뉴 — 섹션 라벨 @60,291 / 항목 피치 42px(§3.2) */}
      <nav className="mt-[6.25rem]">
        <p className="px-perf-inset pb-4 text-[1rem] font-semibold leading-[1.3125rem] text-ink-sub">
          메뉴
        </p>
        <ul className="flex flex-col gap-1">
          {MENU_ITEMS.map((item) => {
            const isActive = item.to === '/app/performance' ? !isReports : isReports;
            return (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  className={[
                    // pill 304×36 @x=10 r6 — 활성/비활성 텍스트 색이 같고 배경 pill 하나로만
                    // 구분하는 것이 시안 정본이다(§3.2 단정).
                    'mx-[0.625rem] flex h-9 w-perf-pill items-center rounded-md pl-[3.125rem]',
                    'text-[1.25rem] font-medium leading-[1.625rem] text-ink transition-colors',
                    isActive ? 'bg-performance-activePill' : 'hover:bg-performance-activePill/60'
                  ].join(' ')}
                >
                  {item.label}
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* TODO(P5): 진행단계 섹션(라벨 @60,456 + 5스텝, 메뉴와 60px 간격)이 여기 들어간다. */}
    </aside>
  );
}
