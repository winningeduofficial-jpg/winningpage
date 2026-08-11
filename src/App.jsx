
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useEffect, lazy, Suspense } from 'react';
import Home from './pages/Home';
import Login from './pages/Login';
import MyPage from './pages/MyPage';
import Pricing from './pages/Pricing';
import Checkout from './pages/Checkout';
import Legal from './pages/Legal';
import PaymentSuccess from './pages/PaymentSuccess';
import PaymentFail from './pages/PaymentFail';
import LearningDiagnosis from './pages/LearningDiagnosis';
import LearningDiagnosisLanding from './pages/renewal/LearningDiagnosisLanding';
import Callmentor from './pages/services/Callmentor';
import GoalManagement from './pages/services/GoalManagement';
import PerformanceAssessment from './pages/services/PerformanceAssessment';
import SelfAssessment from './pages/services/SelfAssessment';
import InDepthResearch from './pages/services/InDepthResearch';
import Services from './pages/Services';
import LearningAnalysis from './pages/LearningAnalysis';
import AdmissionBoard from './pages/AdmissionBoard';
import AdmissionCases from './pages/admission/AdmissionCases';
import AdmissionCaseDetail from './pages/admission/AdmissionCaseDetail';
import SpecialHighschoolCases from './pages/special/SpecialHighschoolCases';
import AdmissionGuidelines from './pages/AdmissionGuidelines';
import AdmissionResults from './pages/AdmissionResults';
import ColumnHome from './pages/column/ColumnHome';
import ColumnList from './pages/column/ColumnList';
import ColumnDetail from './pages/column/ColumnDetail';
import Events from './pages/Events';
import Reviews from './pages/Reviews';
import Faq from './pages/Faq';
import DynamicPage from './pages/DynamicPage';
import PremiumApply from './pages/PremiumApply';
import MentorApply from './pages/MentorApply';
import CompanyNews from './pages/CompanyNews';
import CompanyNewsList from './pages/CompanyNewsList';
import ProtectedAdmin from './components/ProtectedAdmin';
import ProtectedRoute from './components/ProtectedRoute';
import SiteLayout from './components/SiteLayout';
import { SignupProvider } from './context/SignupContext';

// 목표관리 학생 앱(goal-app-shell) — 사이드바 셸 + 서브페이지 10종. docs/figma-goal/00-INDEX.md
// §5-1 기준 마케팅 헤더/푸터를 쓰지 않는 별개 앱 셸이라 `/mypage`·`/admin`과 같은 방식으로
// SiteLayout 밖에 라우트 그룹으로 둔다. `/app/goal` 접두어는 `/services/goal`(마케팅 상세)과
// 명사 충돌을 막기 위함 — 마케팅 상세와는 별개 라우트.
import GoalAppLayout from './components/goal/GoalAppLayout';
import RequireGoalAccess from './components/goal/RequireGoalAccess';
import GoalOnboarding from './pages/goal/Onboarding';
import GoalDashboard from './pages/goal/Dashboard';
import GoalTargetUniversity from './pages/goal/TargetUniversity';
import GoalTimer from './pages/goal/Timer';
import GoalDailyRecord from './pages/goal/DailyRecord';
import GoalWeeklyPlan from './pages/goal/WeeklyPlan';
import GoalEfforts from './pages/goal/Efforts';
import GoalGrowthReport from './pages/goal/GrowthReport';
import GoalGrades from './pages/goal/Grades';
import GoalDirectionReport from './pages/goal/DirectionReport';
import GoalSchedules from './pages/goal/Schedules';
import GoalProfile from './pages/goal/Profile';

// 수행평가 학생 앱(performance) — 목표관리와 같은 규칙으로 SiteLayout 밖에 둔다.
// 시안 24노드 어디에도 사이트 헤더/푸터가 없고 셸이 자체 사이드바를 갖는다
// (docs/수행평가-상세-명세.md §2.1 「/app/performance/*는 SiteLayout 밖」).
// `/services/performance`(마케팅 랜딩)와는 별개 라우트다.
// ⚠️ 신규 자산 네이밍은 performance지만 **이용권 조회 키는 'suhaeng'** 이다 —
//    운영 DB의 program_access.program_key에 이미 박힌 값이라 개명 대상이 아니다(§1.4).
import RequireEntitlement from './components/RequireEntitlement';
import { SessionProvider } from './context/SessionContext';
import PerformanceAppLayout from './components/performance/PerformanceAppLayout';
import PerformancePlaceholder from './pages/performance/PerformancePlaceholder';

// 회원가입 플로우(§5.2) — 유형 선택 → 생년월일 → 학생/학부모 분기 폼 → 완료/온보딩
import MemberType from './pages/signup/MemberType';
import StudentBirth from './pages/signup/StudentBirth';
import StudentForm from './pages/signup/StudentForm';
import Under14Verify from './pages/signup/Under14Verify';
import Under14Form from './pages/signup/Under14Form';
import UnifiedSignupForm from './pages/signup/UnifiedSignupForm';
import StudentComplete from './pages/signup/StudentComplete';
import ParentForm from './pages/signup/parent/ParentForm';
import LinkChoice from './pages/signup/parent/LinkChoice';
import LinkCode from './pages/signup/parent/LinkCode';
import LinkDone from './pages/signup/parent/LinkDone';
import InviteChild from './pages/signup/parent/InviteChild';
import InviteDone from './pages/signup/parent/InviteDone';
import ParentHome from './pages/signup/parent/ParentHome';

// 약관 8종(§5.2) — 학생 5종 + 학부모 3종, 전부 정적 문서 페이지
import StudentService from './pages/terms/StudentService';
import StudentPrivacy from './pages/terms/StudentPrivacy';
import StudentIdentity from './pages/terms/StudentIdentity';
import StudentMarketing from './pages/terms/StudentMarketing';
import StudentPromotion from './pages/terms/StudentPromotion';
import ParentService from './pages/terms/ParentService';
import ParentPrivacy from './pages/terms/ParentPrivacy';
import ParentMarketing from './pages/terms/ParentMarketing';

// 신규 노드 2516-1974('통합 가입 폼', docs/impl-status-recheck.md §4) — 시안 미확정(손그림
// 낙서) 임시 라우트라 플래그가 켜져 있을 때만 등록한다. 꺼져 있으면 라우트 자체가 없으므로
// 직접 URL 진입도 자연히 막힌다(UnifiedSignupForm.jsx 내부의 이중 방어 useEffect와 함께).
const UNIFIED_SIGNUP_ENABLED = import.meta.env.VITE_UNIFIED_SIGNUP_ENABLED === 'true';

// /signup 하위 라우트 전용 컨텍스트 경계 — 유형 선택부터 완료/온보딩까지 단계 간 데이터
// (memberType/birthDate/폼데이터/인증 상태)를 SignupProvider(§5.3)로 공유한다.
function SignupFlowLayout() {
  return (
    <SignupProvider>
      <Outlet />
    </SignupProvider>
  );
}

const Admin = lazy(() => import('./pages/Admin'));

// 라우트 이동 시 페이지 최상단으로 스크롤 (해시 앵커 이동은 예외)
function ScrollToTop() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) return;
    window.scrollTo(0, 0);
  }, [pathname, hash]);
  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <Routes>
        <Route element={<SiteLayout />}>
          <Route path="/" element={<Home />} />

          <Route path="/pricing" element={<Pricing />} />
          {/* 비회원 결제 차단(감사 M5, 2026-08-12) 라우트 층 — 진짜 방어선은
              api/create-order.js 의 서버 거부다. Pricing.jsx의 goCheckout()도
              선(先) 가드를 이미 하지만, 북마크·직접 URL 진입은 그걸 우회하므로
              여기 후(後) 가드가 필요하다. */}
          <Route
            path="/checkout"
            element={(
              <ProtectedRoute>
                <Checkout />
              </ProtectedRoute>
            )}
          />

          {/* 법적 문서 (카드사·PG 심사 필수) */}
          <Route path="/terms" element={<Legal docKey="terms" />} />
          <Route path="/privacy" element={<Legal docKey="privacy" />} />
          <Route path="/refund" element={<Legal docKey="refund" />} />
          <Route path="/payment-terms" element={<Legal docKey="payment-terms" />} />
          <Route path="/payment-consent" element={<Legal docKey="payment-consent" />} />

          <Route path="/payment/success" element={<PaymentSuccess />} />
          {/* 결제 실패도 완료와 같은 셸(헤더/푸터 포함)을 쓴다 — 실패 화면에서
              GNB·문의 연락처가 사라지면 이탈 경로가 없어진다. */}
          <Route path="/payment/fail" element={<PaymentFail />} />

          {/* 학습진단 6종 URL 통일 규칙 정본(2026-08-10) — 소개(마케팅) 페이지는
              /services/{slug}(자식 = /services 목록 페이지), 앱(이용 화면)은 /app/{slug}/...
              목표관리(/app/goal/*)에 이어 학습진단도 이 규칙으로 이관했다. */}
          <Route path="/services/learning-diagnosis" element={<LearningDiagnosisLanding />} />
          {/* ⚠️ 설계 리스크 — 이 화면은 무료·체험 성격이라 로그인 없이 접근 가능해야 할 수 있다.
              추후 /app/* 전체에 일괄 로그인 가드를 걸 때 이 라우트를 예외 처리해야 한다(이번
              단계에서는 가드 자체를 구현하지 않는다). */}
          <Route path="/app/learning-diagnosis/survey" element={<LearningDiagnosis />} />

          {/* 구 경로 4종 호환. 외부 링크·북마크 보호용이라 영구 유지한다.
              /free-diagnosis 계열은 원래 /learning-diagnosis로 2홉 리다이렉트였으나, 목적지가
              신 경로로 바뀌면서 함께 갱신 — 항상 신 경로로 1홉만 거치도록 유지한다. */}
          <Route
            path="/learning-diagnosis"
            element={<Navigate to="/services/learning-diagnosis" replace />}
          />
          <Route
            path="/learning-diagnosis/survey"
            element={<Navigate to="/app/learning-diagnosis/survey" replace />}
          />
          <Route
            path="/free-diagnosis"
            element={<Navigate to="/services/learning-diagnosis" replace />}
          />
          <Route
            path="/free-diagnosis/survey"
            element={<Navigate to="/app/learning-diagnosis/survey" replace />}
          />

          {/* 목표관리 온보딩(설문 7단계) — 시안상 공통 헤더/푸터가 있고 사이드바가 없어
              SiteLayout 안에 둔다(GoalAppLayout 사이드바 셸에는 넣지 않는다). RequireGoalAccess가
              로그인・이용권 판정을 적용하되, 온보딩 경로 자체는 3단계(온보딩 완료 판정)를
              건너뛴다 — 자세한 이유는 RequireGoalAccess.jsx 상단 주석 참고. */}
          <Route element={<RequireGoalAccess />}>
            <Route
              path="/app/goal/onboarding"
              element={<Navigate to="/app/goal/onboarding/step-1" replace />}
            />
            <Route path="/app/goal/onboarding/:step" element={<GoalOnboarding />} />
          </Route>

          <Route path="/services/callmentor" element={<Callmentor />} />
          {/* 구 경로 — GNB/DB services-content 슬러그가 가리키던 곳. 신규 랜딩으로 리다이렉트 */}
          <Route path="/page/services-content" element={<Navigate to="/services/callmentor" replace />} />

          {/* 서비스 랜딩 4종 (Figma 예시 1889:6944/1889:6486/1907:20783/1907:21352) */}
          <Route path="/services/goal" element={<GoalManagement />} />
          <Route path="/services/performance" element={<PerformanceAssessment />} />
          <Route path="/services/self-assessment" element={<SelfAssessment />} />
          <Route path="/services/research" element={<InDepthResearch />} />

          {/* 구 경로(DB page_contents 미갱신 시 잔존) → 신규 라우트로 리다이렉트 */}
          <Route path="/page/services-goal" element={<Navigate to="/services/goal" replace />} />
          <Route
            path="/page/services-ai-performance"
            element={<Navigate to="/services/performance" replace />}
          />
          <Route
            path="/page/services-self-assessment"
            element={<Navigate to="/services/self-assessment" replace />}
          />
          <Route
            path="/page/services-in-depth-research"
            element={<Navigate to="/services/research" replace />}
          />
          <Route
            path="/page/admission-special-highschool-results"
            element={<Navigate to="/admission/special-highschool" replace />}
          />

          <Route path="/admission/guidelines" element={<AdmissionGuidelines />} />
          <Route path="/admission/results" element={<AdmissionResults />} />

          {/* 수시와 정시는 각각 자신의 category만 조회합니다. */}
          <Route path="/admission/susi" element={<AdmissionCases />} />
          <Route path="/admission/jungsi" element={<AdmissionCases />} />
          <Route path="/admission/susi/:id" element={<AdmissionCaseDetail />} />
          <Route path="/admission/jungsi/:id" element={<AdmissionCaseDetail />} />

          {/* 메인 합격생 카드에서 사용하는 통합 상세 주소는 유지합니다. */}
          <Route path="/admission/susi-jungsi/:id" element={<AdmissionCaseDetail />} />
          <Route
            path="/admission/susi-jungsi"
            element={<Navigate to="/admission/susi" replace />}
          />

          {/* 특목고합격 — 카드가 링크가 아니라 상세 라우트는 두지 않는다(시안 2239:1559에 상세 없음). */}
          <Route path="/admission/special-highschool" element={<SpecialHighschoolCases />} />

          <Route path="/admission/essay" element={<AdmissionBoard />} />
          <Route path="/admission/essay/:id" element={<AdmissionBoard />} />
          <Route path="/admission/:category" element={<AdmissionBoard />} />
          <Route path="/admission/:category/:id" element={<AdmissionBoard />} />

          <Route path="/events" element={<Events />} />
          <Route path="/company-news" element={<CompanyNews />} />
          <Route path="/company-news/list" element={<CompanyNewsList />} />
          <Route path="/faq" element={<Faq />} />
          <Route path="/info/column" element={<ColumnHome />} />
          <Route path="/info/column/list" element={<ColumnList />} />
          <Route path="/info/column/:id" element={<ColumnDetail />} />

          {/* 이용신청 > 프리미엄 이용 — 구 슬러그(/page/premium-apply)는 전용 라우트로 리다이렉트 */}
          <Route path="/premium-apply" element={<PremiumApply />} />
          <Route path="/page/premium-apply" element={<Navigate to="/premium-apply" replace />} />

          {/* 이용신청 > 멘토신청 — premium-apply 선례 그대로. 반드시 /page/:slug 와일드카드보다 위에
              둔다(아래로 내려가면 DynamicPage가 먼저 매칭해 신규 페이지가 뜨지 않는다). */}
          <Route path="/mentor-apply" element={<MentorApply />} />
          <Route path="/page/mentor-apply" element={<Navigate to="/mentor-apply" replace />} />

          <Route path="/page/:slug" element={<DynamicPage />} />

          {/* 로그인·회원가입 리뉴얼(§5.2) — 헤더/푸터 포함 풀 페이지가 시안 확정이므로
              SiteLayout 안으로 편입(구 Login.jsx/Signup.jsx의 pt-16 보정 관례 그대로 재사용). */}
          <Route path="/login" element={<Login />} />

          <Route element={<SignupFlowLayout />}>
            <Route path="/signup" element={<MemberType />} />
            <Route path="/signup/student/birth" element={<StudentBirth />} />
            <Route path="/signup/student" element={<StudentForm />} />
            <Route path="/signup/student/under14/verify" element={<Under14Verify />} />
            <Route path="/signup/student/under14" element={<Under14Form />} />
            {UNIFIED_SIGNUP_ENABLED && (
              <Route path="/signup/unified" element={<UnifiedSignupForm />} />
            )}
            <Route path="/signup/student/complete" element={<StudentComplete />} />
            <Route path="/signup/parent" element={<ParentForm />} />
            <Route path="/signup/parent/link" element={<LinkChoice />} />
            <Route path="/signup/parent/link/add" element={<LinkChoice mode="add" />} />
            <Route path="/signup/parent/link/code" element={<LinkCode />} />
            <Route path="/signup/parent/link/done" element={<LinkDone />} />
            <Route path="/signup/parent/invite" element={<InviteChild />} />
            <Route path="/signup/parent/invite/done" element={<InviteDone />} />
            <Route path="/signup/parent/home" element={<ParentHome />} />
          </Route>

          {/* 약관 8종(§5.2) — 학생 5종 + 학부모 3종 */}
          <Route path="/terms/student/service" element={<StudentService />} />
          <Route path="/terms/student/privacy" element={<StudentPrivacy />} />
          <Route path="/terms/student/identity" element={<StudentIdentity />} />
          <Route path="/terms/student/marketing" element={<StudentMarketing />} />
          <Route path="/terms/student/promotion" element={<StudentPromotion />} />
          <Route path="/terms/parent/service" element={<ParentService />} />
          <Route path="/terms/parent/privacy" element={<ParentPrivacy />} />
          <Route path="/terms/parent/marketing" element={<ParentMarketing />} />
        </Route>

        <Route path="/mypage" element={<MyPage />} />

        {/* 목표관리 학생 앱 — 사이드바 셸(GoalAppLayout) 그룹. 진입 가드(로그인 → 이용권 →
            온보딩 완료 → 대시보드)는 RequireGoalAccess가 소유한다(2026-08-10 확정,
            GoalAppLayout.jsx 상단 TODO는 해소됨). */}
        <Route element={<RequireGoalAccess />}>
          <Route element={<GoalAppLayout />}>
            <Route path="/app/goal" element={<GoalDashboard />} />
            <Route path="/app/goal/target-university" element={<GoalTargetUniversity />} />
            <Route path="/app/goal/timer" element={<GoalTimer />} />
            <Route path="/app/goal/daily-record" element={<GoalDailyRecord />} />
            <Route path="/app/goal/weekly-plan" element={<GoalWeeklyPlan />} />
            <Route path="/app/goal/efforts" element={<GoalEfforts />} />
            <Route path="/app/goal/reports/growth" element={<GoalGrowthReport />} />
            <Route path="/app/goal/grades" element={<GoalGrades />} />
            <Route path="/app/goal/reports/direction" element={<GoalDirectionReport />} />
            <Route path="/app/goal/schedules" element={<GoalSchedules />} />
            <Route path="/app/goal/profile" element={<GoalProfile />} />
          </Route>
        </Route>

        {/* 수행평가 학생 앱 — 명세서 §2.1 라우트 표.
            중첩 순서는 SessionContext.jsx 상단 배선 주석대로 SessionProvider가 가드보다
            **바깥**이다. 그래야 가드가 자기 판정을 따로 하지 않고 컨텍스트 값을 읽고,
            셸 안쪽 표면(사이드바·회차 배너)도 같은 값을 본다.
            가드는 이용권 미보유 하나만 막는다 — 잔여 회차 0은 차단 사유가 아니다
            (§2.2 / §11.1 Q47, 근거는 RequireEntitlement.jsx 상단 주석).
            ※ 레거시 리다이렉트(/page/services-ai-performance → /services/performance)와
              랜딩 CTA의 외부 SSO 목적지는 건드리지 않는다 — 인앱 전환 플래그(§11 Q1)가
              아직 off이므로 이 라우트 그룹은 직접 URL로만 도달한다.
            ※ forbiddenTo의 목적지 계약은 PerformanceAssessment.jsx가 받는다 —
              가격 섹션의 id="pricing"(+ scroll-mt-24 + 해시 스크롤 처리)과
              location.state.entitlementNotice 인라인 배너 2가지다. 목적지에서 그
              둘을 지우면 사용자는 설명 없이 랜딩 최상단으로 튕긴다. */}
        <Route element={<SessionProvider serviceKey="suhaeng" />}>
          <Route
            element={
              <RequireEntitlement
                serviceKey="suhaeng"
                forbiddenTo="/services/performance#pricing"
                forbiddenNotice="AI 수행평가 서비스는 유료 이용권을 결제하신 뒤 이용할 수 있습니다."
              />
            }
          >
            {/* 셸(사이드바 + 페이지 타이틀)은 P4에서 구현됐다 — §3.1/§3.5.
                TODO(P5~P6): 아래 4개 element(플레이스홀더)를 실제 페이지로 교체한다.
                  · P5 채팅 워크스페이스(§5.3~§5.17) · P6 저장 리포트(§5.18~§5.19) */}
            <Route element={<PerformanceAppLayout />}>
              <Route path="/app/performance" element={<PerformancePlaceholder screen="채팅 워크스페이스" />} />
              {/* 저장 리포트는 모달이 아니라 라우트다(§11-Q65). 정적 세그먼트가
                  :sessionId보다 우선 매칭되므로 `reports`가 세션 id로 오인되지 않는다. */}
              <Route
                path="/app/performance/reports"
                element={<PerformancePlaceholder screen="저장 리포트 목록" />}
              />
              <Route
                path="/app/performance/reports/:sessionId"
                element={<PerformancePlaceholder screen="저장 리포트 상세" />}
              />
              {/* 새로고침 복구 진입점(§2.1). 외부 앱은 sessionId가 인메모리라 새로고침
                  시 재로그인으로 떨어졌다. 세션 id는 인증 수단이 아니라 리소스 ID이므로
                  URL에 노출해도 안전하다 — 소유권은 서버가 auth.uid()로 판정한다. */}
              <Route
                path="/app/performance/:sessionId"
                element={<PerformancePlaceholder screen="세션 복구" />}
              />
            </Route>
          </Route>
        </Route>
        <Route path="/payment/fail" element={<PaymentFail />} />
        <Route path="/reviews" element={<Reviews />} />
        <Route path="/services" element={<Services />} />
        <Route path="/learning-analysis" element={<LearningAnalysis />} />

        <Route
          path="/admin"
          element={
            <ProtectedAdmin>
              <Suspense
                fallback={
                  <main className="flex min-h-screen items-center justify-center bg-[#F7F4EF] pt-16 text-[#0D1B2A]">
                    <div className="rounded-2xl border border-[#0D1B2A]/10 bg-white px-6 py-4 text-sm font-extrabold shadow-[0_18px_45px_rgba(13,27,42,0.10)]">
                      관리자 페이지 불러오는 중...
                    </div>
                  </main>
                }
              >
                <Admin />
              </Suspense>
            </ProtectedAdmin>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
