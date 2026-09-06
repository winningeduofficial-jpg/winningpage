// 수행평가 앱 진입 스켈레톤 — `RequireEntitlement`가 세션·이용권을 조회하는 동안 셸 자리에
// 보여 주는 단독 화면이다. 실제 셸(PerformanceAppLayout + AppShellSidebar)이 마운트되는 순간
// 레이아웃 시프트가 없도록 **같은 치수 토큰**만 쓴다: 헤더 높이 4rem(`pt-16`), 사이드바 폭
// `--spacing-app-sidebar`(`w-app-sidebar`), 사이드바 내부 인셋 1rem(`px-4`, shadcn
// SidebarContent 기본), 캔버스 인셋 `perf-inset`·상단 여백 `pt-14`, 타이틀 높이
// `text-app-title`(1.75rem×1.4).
//
// (2026-09-06) shadcn Sidebar 전환 후 옛 pill 폭 토큰(19rem)이 새 사이드바 폭(18rem)보다
// 넓어 골격이 사이드바 밖으로 삐져나오던 것을 고쳤다 — pill은 고정 폭 대신 부모 인셋에
// 맞춰 `w-full`로 채운다. 헤더·사이드바가 아직 마운트되기 전이라 `position: fixed` 고정은
// 여기서 흉내내지 않는다(스크롤할 내용도 없다).

function Block({ className = "" }) {
  return <div className={["rounded-md bg-[#e6e5e2]", className].join(" ")} />;
}

export default function PerformanceSkeleton() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="이용 가능 여부 확인 중"
      className="flex min-h-screen w-full animate-pulse bg-white pt-16 motion-reduce:animate-none"
    >
      {/* 사이드바 골격 — 프로필 자리 + 메뉴 2자리 + 진행단계 5자리(AppShellSidebar 구조 순). */}
      <aside className="flex w-app-sidebar shrink-0 flex-col bg-sidebar">
        <div className="px-6 pt-6">
          <Block className="h-6.25 w-36" />
          <Block className="mt-2 h-4.75 w-24" />
        </div>

        <div className="mt-6 px-4">
          <Block className="mx-2 h-4.5 w-8" />
          <div className="mt-2 flex flex-col gap-1.5">
            <Block className="h-9 w-full" />
            <Block className="h-9 w-full" />
          </div>
        </div>

        <div className="mt-6 px-4">
          <Block className="mx-2 h-4.5 w-12" />
          <div className="mt-2 flex flex-col gap-0.25">
            {["s1", "s2", "s3", "s4", "s5"].map((id) => (
              <div key={id} className="flex h-9 items-center gap-4 px-3">
                <Block className="h-5 w-5 shrink-0 rounded-full" />
                <Block className="h-4.75 w-20" />
              </div>
            ))}
          </div>
        </div>
      </aside>

      {/* 캔버스 골격 — 페이지 타이틀 + 말풍선 2자리. */}
      <main className="min-w-0 flex-1 pb-14 pl-perf-inset pr-perf-inset pt-14">
        <div className="max-w-perf-content">
          <Block className="h-[2.45rem] w-72" />
          <Block className="mt-8 h-24 w-full max-w-perf-bubble" />
          <Block className="mt-4 h-24 w-full max-w-perf-bubble" />
        </div>
      </main>
    </div>
  );
}
