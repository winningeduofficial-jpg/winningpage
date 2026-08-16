import type { RouteObject } from "react-router";
import RequireEntitlement from "@/components/RequireEntitlement";
import { SessionProvider } from "@/context/SessionContext";

// 수행평가 학생 앱(performance) — 목표관리와 같은 규칙으로 SiteLayout 밖에 둔다.
// 시안 24노드 어디에도 사이트 헤더/푸터가 없고 셸이 자체 사이드바를 갖는다
// (docs/수행평가-상세-명세.md §2.1 「/app/performance/*는 SiteLayout 밖」).
// `/services/performance`(마케팅 랜딩)와는 별개 라우트다.
// ⚠️ 신규 자산 네이밍은 performance지만 **이용권 조회 키는 'suhaeng'** 이다 —
//    운영 DB의 program_access.program_key에 이미 박힌 값이라 개명 대상이 아니다(§1.4).

// 수행평가 학생 앱 셸/페이지 공용 청크 로딩 폴백 — 이용권 없는 사용자가 대다수라
// 초기 번들에서 뺀다(Admin과 동일 패턴). route.lazy가 대기하는 동안 쓰이므로
// 정적 최상위 HydrateFallback으로 둔다(adminRoutes.tsx 주석 참고). 이 그룹은
// RR middleware를 쓰지 않아(SessionProvider/RequireEntitlement가 자체 판정)
// ErrorBoundary는 없다.
function PerformanceChunkLoadingFallback() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F7F4EF] pt-16 text-[#0D1B2A]">
      <div className="rounded-2xl border border-[#0D1B2A]/10 bg-white px-6 py-4 text-sm font-extrabold shadow-[0_18px_45px_rgba(13,27,42,0.10)]">
        불러오는 중...
      </div>
    </main>
  );
}

// 수행평가 학생 앱 — 명세서 §2.1 라우트 표.
// 중첩 순서는 SessionContext.jsx 상단 배선 주석대로 SessionProvider가 가드보다
// **바깥**이다. 그래야 가드가 자기 판정을 따로 하지 않고 컨텍스트 값을 읽고,
// 셸 안쪽 표면(사이드바・회차 배너)도 같은 값을 본다.
// 가드는 이용권 미보유 하나만 막는다 — 잔여 회차 0은 차단 사유가 아니다
// (§2.2 / §11.1 Q47, 근거는 RequireEntitlement.jsx 상단 주석).
// ※ 레거시 리다이렉트(/page/services-ai-performance → /services/performance)와
//   랜딩 CTA의 외부 SSO 목적지는 건드리지 않는다 — 인앱 전환 플래그(§11 Q1)가
//   아직 off이므로 이 라우트 그룹은 직접 URL로만 도달한다.
// ※ forbiddenTo의 목적지 계약은 PerformanceAssessment.jsx가 받는다 —
//   가격 섹션의 id="pricing"(+ scroll-mt-24 + 해시 스크롤 처리)과
//   location.state.entitlementNotice 인라인 배너 2가지다. 목적지에서 그
//   둘을 지우면 사용자는 설명 없이 랜딩 최상단으로 튕긴다.
const performanceAppRoutes: RouteObject[] = [
  {
    Component: () => <SessionProvider serviceKey="suhaeng" />,
    children: [
      {
        Component: () => (
          <RequireEntitlement
            serviceKey="suhaeng"
            forbiddenTo="/services/performance#pricing"
            forbiddenNotice="수행평가 서비스는 유료 이용권을 결제하신 뒤 이용할 수 있습니다."
          />
        ),
        children: [
          // 셸(사이드바 + 페이지 타이틀)은 P4에서 구현됐다 — §3.1/§3.5.
          // TODO(P7~): 나머지 플레이스홀더(저장 리포트·세션 복구)를 실제 페이지로 교체한다.
          //   · P6 STEP1 기본 정보 폼(§5.5) — 아래로 배선 완료
          //   · P7~ STEP2 이후(§5.6~§5.17) · P12 저장 리포트(§5.18~§5.19)
          {
            lazy: async () => {
              const { default: PerformanceAppLayout } = await import(
                "@/components/performance/PerformanceAppLayout"
              );
              return { Component: PerformanceAppLayout };
            },
            HydrateFallback: PerformanceChunkLoadingFallback,
            children: [
              {
                path: "/app/performance",
                lazy: async () => {
                  const { default: PerformanceChatPage } = await import(
                    "@/pages/performance/PerformanceChatPage"
                  );
                  return { Component: PerformanceChatPage };
                },
              },
              // 저장 리포트는 모달이 아니라 라우트다(§11-Q65). 정적 세그먼트가
              // :sessionId보다 우선 매칭되므로 `reports`가 세션 id로 오인되지 않는다.
              {
                path: "/app/performance/reports",
                lazy: async () => {
                  const { default: PerformanceReportsPage } = await import(
                    "@/pages/performance/PerformanceReportsPage"
                  );
                  return { Component: PerformanceReportsPage };
                },
              },
              {
                path: "/app/performance/reports/:sessionId",
                lazy: async () => {
                  const { default: PerformanceReportsPage } = await import(
                    "@/pages/performance/PerformanceReportsPage"
                  );
                  return { Component: PerformanceReportsPage };
                },
              },
              // 새로고침 복구 진입점(§2.1). 외부 앱은 sessionId가 인메모리라 새로고침
              // 시 재로그인으로 떨어졌다. 세션 id는 인증 수단이 아니라 리소스 ID이므로
              // URL에 노출해도 안전하다 — 소유권은 서버가 auth.uid()로 판정한다.
              {
                path: "/app/performance/:sessionId",
                lazy: async () => {
                  const { default: PerformanceChatPage } = await import(
                    "@/pages/performance/PerformanceChatPage"
                  );
                  return { Component: PerformanceChatPage };
                },
              },
            ],
          },
        ],
      },
    ],
  },
];

export default performanceAppRoutes;
