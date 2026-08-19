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
function Block({ className = "" }) {
  return <div className={["rounded-md bg-[#e6e5e2]", className].join(" ")} />;
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
      <aside className="flex min-h-screen w-perf-sidebar shrink-0 flex-col bg-performance-sidebar">
        <div className="min-h-37.75 px-perf-inset pt-25">
          <Block className="h-6.5 w-36" />
          <Block className="mt-1 h-5.25 w-24" />
        </div>

        <div className="mt-35">
          <Block className="mx-perf-inset h-5.25 w-12" />
          <div className="mx-2.5 mt-2.75 flex flex-col gap-1.5">
            <Block className="h-9 w-perf-pill" />
            <Block className="h-9 w-perf-pill" />
          </div>
        </div>

        <div className="mt-13.75">
          <Block className="mx-perf-inset h-5.25 w-16" />
          <div className="mx-2.5 mt-2.25 flex flex-col gap-0.25">
            {Array.from({ length: 5 }).map((_, index) => (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: 실데이터 없는 로딩 스켈레톤 placeholder — index 외에 다른 값이 없다.
                key={index}
                className="flex h-9 w-perf-pill items-center gap-4 pl-12.5"
              >
                <Block className="h-5 w-5 shrink-0 rounded-full" />
                <Block className="h-5.25 w-20" />
              </div>
            ))}
          </div>
        </div>
      </aside>

      {/* 캔버스 골격 — 페이지 타이틀 + 콘텐츠 자리. */}
      <main className="min-w-0 flex-1 pb-25 pl-perf-inset pr-perf-inset pt-25">
        <div className="max-w-perf-content">
          <Block className="h-10.5 w-80" />
          <Block className="mt-8 h-24 w-full max-w-perf-bubble" />
          <Block className="mt-4 h-24 w-full max-w-perf-bubble" />
        </div>
      </main>
    </div>
  );
}
