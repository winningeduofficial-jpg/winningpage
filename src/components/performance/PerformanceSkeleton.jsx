// 수행평가 앱 셸 전체 화면 스켈레톤 — docs/수행평가-상세-명세.md §2.2("loading | 세션/이용권
// 조회 중 | 전체 화면 스켈레톤(사이드바 골격만)"). `RequireEntitlement`의 `loading` 상태에서
// 셸이 마운트되기 전에 보여준다.
//
// 이 저장소엔 블록 스켈레톤 관례가 없었다(`StateBlocks.jsx` 주석 — grep 0건, 텍스트
// 플레이스홀더가 정본이었다). 펄스 톤만 `AiLoadingBubble`(`animate-pulse` +
// `motion-reduce:animate-none`)을 그대로 따른다.
//
// 치수는 `PerformanceAppLayout`/`PerformanceSidebar` 실측을 그대로 재사용한다(사이드바
// `w-perf-sidebar`, 인셋 `perf-inset`, pill 폭 `w-perf-pill`) — 실제 셸이 마운트되는 순간
// 골격이 그 자리에서 자연스럽게 채워지도록 레이아웃 시프트를 만들지 않기 위해서다. 값
// 자체(이름·메뉴 라벨 등)는 아직 없으므로 회색 블록으로만 자리를 잡는다.
function Block({ className = '' }) {
  return <div className={['rounded-md bg-[#e6e5e2]', className].join(' ')} />;
}

export default function PerformanceSkeleton() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="이용 가능 여부 확인 중"
      className="flex min-h-screen animate-pulse bg-white motion-reduce:animate-none"
    >
      {/* 사이드바 골격 — 프로필 자리 + 메뉴 2자리 + 진행단계 5자리. */}
      <aside className="flex min-h-screen w-perf-sidebar flex-shrink-0 flex-col bg-performance-sidebar">
        <div className="min-h-[9.4375rem] px-perf-inset pt-[6.25rem]">
          <Block className="h-[1.625rem] w-36" />
          <Block className="mt-[0.25rem] h-[1.3125rem] w-24" />
        </div>

        <div className="mt-[8.75rem]">
          <Block className="mx-perf-inset h-[1.3125rem] w-12" />
          <div className="mx-[0.625rem] mt-[0.6875rem] flex flex-col gap-[0.375rem]">
            <Block className="h-9 w-perf-pill" />
            <Block className="h-9 w-perf-pill" />
          </div>
        </div>

        <div className="mt-[3.4375rem]">
          <Block className="mx-perf-inset h-[1.3125rem] w-16" />
          <div className="mx-[0.625rem] mt-[0.5625rem] flex flex-col gap-[0.0625rem]">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="flex h-9 items-center gap-4 pl-[0.625rem]">
                <Block className="h-5 w-5 flex-shrink-0 rounded-full" />
                <Block className="h-[1.3125rem] w-20" />
              </div>
            ))}
          </div>
        </div>
      </aside>

      {/* 캔버스 골격 — 페이지 타이틀 + 콘텐츠 자리. */}
      <main className="min-w-0 flex-1 pb-[6.25rem] pl-perf-inset pr-perf-inset pt-[6.25rem]">
        <div className="max-w-perf-content">
          <Block className="h-8 w-80" />
          <Block className="mt-8 h-24 w-full max-w-perf-bubble" />
          <Block className="mt-4 h-24 w-full max-w-perf-bubble" />
        </div>
      </main>
    </div>
  );
}
