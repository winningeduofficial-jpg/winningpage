import { lazy, Suspense, useEffect } from "react";
import {
  BrowserRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
// 목표관리 학생 앱(goal-app-shell) — 사이드바 셸 + 서브페이지 10종. docs/figma-goal/00-INDEX.md
// §5-1 기준 마케팅 헤더/푸터를 쓰지 않는 별개 앱 셸이라 `/mypage`·`/admin`과 같은 방식으로
// SiteLayout 밖에 라우트 그룹으로 둔다. `/app/goal` 접두어는 `/services/goal`(마케팅 상세)과
// 명사 충돌을 막기 위함 — 마케팅 상세와는 별개 라우트.
import GoalAppLayout from "./components/goal/GoalAppLayout";
import RequireGoalAccess from "./components/goal/RequireGoalAccess";
import ProtectedAdmin from "./components/ProtectedAdmin";
import ProtectedRoute from "./components/ProtectedRoute";
// 수행평가 학생 앱(performance) — 목표관리와 같은 규칙으로 SiteLayout 밖에 둔다.
// 시안 24노드 어디에도 사이트 헤더/푸터가 없고 셸이 자체 사이드바를 갖는다
// (docs/수행평가-상세-명세.md §2.1 「/app/performance/*는 SiteLayout 밖」).
// `/services/performance`(마케팅 랜딩)와는 별개 라우트다.
// ⚠️ 신규 자산 네이밍은 performance지만 **이용권 조회 키는 'suhaeng'** 이다 —
//    운영 DB의 program_access.program_key에 이미 박힌 값이라 개명 대상이 아니다(§1.4).
import RequireEntitlement from "./components/RequireEntitlement";
import SiteLayout from "./components/SiteLayout";
import { SessionProvider } from "./context/SessionContext";
import { SignupProvider } from "./context/SignupContext";
import AdmissionBoard from "./pages/AdmissionBoard";
import AdmissionGuidelines from "./pages/AdmissionGuidelines";
import AdmissionResults from "./pages/AdmissionResults";
import AdmissionCaseDetail from "./pages/admission/AdmissionCaseDetail";
import AdmissionCases from "./pages/admission/AdmissionCases";
import Checkout from "./pages/Checkout";
import CompanyNews from "./pages/CompanyNews";
import CompanyNewsList from "./pages/CompanyNewsList";
import ColumnDetail from "./pages/column/ColumnDetail";
import ColumnHome from "./pages/column/ColumnHome";
import ColumnList from "./pages/column/ColumnList";
import DynamicPage from "./pages/DynamicPage";
import Events from "./pages/Events";
import Faq from "./pages/Faq";
import GoalDailyRecord from "./pages/goal/DailyRecord";
import GoalDashboard from "./pages/goal/Dashboard";
import GoalDirectionReport from "./pages/goal/DirectionReport";
import GoalEfforts from "./pages/goal/Efforts";
import GoalGrades from "./pages/goal/Grades";
import GoalGrowthReport from "./pages/goal/GrowthReport";
import GoalOnboarding from "./pages/goal/Onboarding";
import GoalProfile from "./pages/goal/Profile";
import GoalSchedules from "./pages/goal/Schedules";
import GoalTargetUniversity from "./pages/goal/TargetUniversity";
import GoalTimer from "./pages/goal/Timer";
import GoalWeeklyPlan from "./pages/goal/WeeklyPlan";
import Home from "./pages/Home";
import LearningAnalysis from "./pages/LearningAnalysis";
import Legal from "./pages/Legal";
import Login from "./pages/Login";
import MentorApply from "./pages/MentorApply";
import MyPage from "./pages/MyPage";
import ChildReport from "./pages/mypage/ChildReport";
import PaymentFail from "./pages/PaymentFail";
import PaymentSuccess from "./pages/PaymentSuccess";
import PremiumApply from "./pages/PremiumApply";
import Pricing from "./pages/Pricing";
import Reviews from "./pages/Reviews";
import FreeDiagnosisReport from "./pages/renewal/FreeDiagnosisReport";
import LearningDiagnosisLanding from "./pages/renewal/LearningDiagnosisLanding";
import SurveyPreview from "./pages/renewal/SurveyPreview";
import SurveyStepPage from "./pages/renewal/SurveyStepPage";
import SurveyStepShell from "./pages/renewal/SurveyStepShell";
import Services from "./pages/Services";
import Callmentor from "./pages/services/Callmentor";
import GoalManagement from "./pages/services/GoalManagement";
import InDepthResearch from "./pages/services/InDepthResearch";
import PerformanceAssessment from "./pages/services/PerformanceAssessment";
import SelfAssessment from "./pages/services/SelfAssessment";
// 회원가입 플로우(§5.2) — 유형 선택 → 생년월일 → 학생/학부모 분기 폼 → 완료/온보딩
import MemberType from "./pages/signup/MemberType";
import InviteChild from "./pages/signup/parent/InviteChild";
import InviteDone from "./pages/signup/parent/InviteDone";
import LinkChoice from "./pages/signup/parent/LinkChoice";
import LinkCode from "./pages/signup/parent/LinkCode";
import LinkDone from "./pages/signup/parent/LinkDone";
import ParentForm from "./pages/signup/parent/ParentForm";
import ParentHome from "./pages/signup/parent/ParentHome";
import StudentBirth from "./pages/signup/StudentBirth";
import StudentComplete from "./pages/signup/StudentComplete";
import StudentForm from "./pages/signup/StudentForm";
import Under14Form from "./pages/signup/Under14Form";
import Under14Verify from "./pages/signup/Under14Verify";
import UnifiedSignupForm from "./pages/signup/UnifiedSignupForm";
import SpecialHighschoolCases from "./pages/special/SpecialHighschoolCases";
import ParentMarketing from "./pages/terms/ParentMarketing";
import ParentPrivacy from "./pages/terms/ParentPrivacy";
import ParentService from "./pages/terms/ParentService";
import StudentIdentity from "./pages/terms/StudentIdentity";
import StudentMarketing from "./pages/terms/StudentMarketing";
import StudentPrivacy from "./pages/terms/StudentPrivacy";
import StudentPromotion from "./pages/terms/StudentPromotion";
// 약관 8종(§5.2) — 학생 5종 + 학부모 3종, 전부 정적 문서 페이지
import StudentService from "./pages/terms/StudentService";

// 신규 노드 2516-1974('통합 가입 폼', docs/impl-status-recheck.md §4) — 시안 미확정(손그림
// 낙서) 임시 라우트라 플래그가 켜져 있을 때만 등록한다. 꺼져 있으면 라우트 자체가 없으므로
// 직접 URL 진입도 자연히 막힌다(UnifiedSignupForm.jsx 내부의 이중 방어 useEffect와 함께).
const UNIFIED_SIGNUP_ENABLED =
  import.meta.env.VITE_UNIFIED_SIGNUP_ENABLED === "true";

// /signup 하위 라우트 전용 컨텍스트 경계 — 유형 선택부터 완료/온보딩까지 단계 간 데이터
// (memberType/birthDate/폼데이터/인증 상태)를 SignupProvider(§5.3)로 공유한다.
function SignupFlowLayout() {
  return (
    <SignupProvider>
      <Outlet />
    </SignupProvider>
  );
}

const Admin = lazy(() => import("./pages/Admin"));
// 고객사 HTML 목업 5종 데모 라우트 — lazy가 핵심이다. 가드(ProtectedAdmin)를 통과하기 전엔
// HTML 문자열이 든 청크를 네트워크에서 받지도 않는다.
const DemoIndex = lazy(() => import("./pages/demo/DemoIndex"));
const DemoFrame = lazy(() => import("./pages/demo/DemoFrame"));

// 데모 라우트 공용 Suspense fallback — /admin 것과 같은 스타일로 맞춘다.
function DemoFallback() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F7F4EF] pt-16 text-[#0D1B2A]">
      <div className="rounded-2xl border border-[#0D1B2A]/10 bg-white px-6 py-4 text-sm font-extrabold shadow-[0_18px_45px_rgba(13,27,42,0.10)]">
        데모 페이지 불러오는 중...
      </div>
    </main>
  );
}

// 수행평가 학생 앱 셸/페이지 — 이용권 없는 사용자가 대다수라 초기 번들에서 뺀다(Admin과 동일 패턴).
const PerformanceAppLayout = lazy(
  () => import("./components/performance/PerformanceAppLayout"),
);
const PerformanceChatPage = lazy(
  () => import("./pages/performance/PerformanceChatPage"),
);
const PerformanceReportsPage = lazy(
  () => import("./pages/performance/PerformanceReportsPage"),
);

// 라우트 이동 시 페이지 최상단으로 스크롤 (해시 앵커 이동은 예외)
function ScrollToTop() {
  const { pathname, hash } = useLocation();
  // biome-ignore lint/correctness/useExhaustiveDependencies: TODO(useEffectEvent) pathname은 effect 안에서 읽지 않는 트리거 전용 값 — 라우트가 바뀔 때마다 스크롤을 맨 위로 되돌리기 위한 재실행 신호다.
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
            element={
              <ProtectedRoute>
                <Checkout />
              </ProtectedRoute>
            }
          />

          {/* 법적 문서 (카드사·PG 심사 필수) */}
          <Route path="/terms" element={<Legal docKey="terms" />} />
          <Route path="/privacy" element={<Legal docKey="privacy" />} />
          <Route path="/refund" element={<Legal docKey="refund" />} />
          <Route
            path="/payment-terms"
            element={<Legal docKey="payment-terms" />}
          />
          <Route
            path="/payment-consent"
            element={<Legal docKey="payment-consent" />}
          />

          <Route path="/payment/success" element={<PaymentSuccess />} />
          {/* 결제 실패도 완료와 같은 셸(헤더/푸터 포함)을 쓴다 — 실패 화면에서
              GNB·문의 연락처가 사라지면 이탈 경로가 없어진다. */}
          <Route path="/payment/fail" element={<PaymentFail />} />
          <Route
            path="/learning-diagnosis/report"
            element={<FreeDiagnosisReport />}
          />

          {/* 학습진단 6종 URL 통일 규칙 정본(2026-08-10) — 소개(마케팅) 페이지는
              /services/{slug}(자식 = /services 목록 페이지), 앱(이용 화면)은 /app/{slug}/...
              목표관리(/app/goal/*)에 이어 학습진단도 이 규칙으로 이관했다. */}
          <Route
            path="/services/learning-diagnosis"
            element={<LearningDiagnosisLanding />}
          />
          {/* ⚠️ 설계 리스크 — 이 화면은 무료·체험 성격이라 로그인 없이 접근 가능해야 할 수 있다.
              추후 /app/* 전체에 일괄 로그인 가드를 걸 때 이 라우트를 예외 처리해야 한다(이번
              단계에서는 가드 자체를 구현하지 않는다). */}
          <Route
            path="/app/learning-diagnosis/survey"
            element={<SurveyStepShell />}
          >
            {/* /survey 진입은 스텝1로 명시 리다이렉트. 없으면 최하단 catch-all 이 홈으로 삼킨다. */}
            <Route
              index
              element={
                <Navigate to="/app/learning-diagnosis/survey/1" replace />
              }
            />
            {/* 정적 세그먼트를 :step 보다 먼저 선언 — v6 랭킹상 정적이 우선이지만 의도를 코드로 고정한다. */}
            <Route path="preview" element={<SurveyPreview />} />
            <Route path=":step" element={<SurveyStepPage />} />
            {/* /survey/1/2 같은 초과 세그먼트 방어. 반드시 마지막. */}
            <Route
              path="*"
              element={
                <Navigate to="/app/learning-diagnosis/survey/1" replace />
              }
            />
          </Route>

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
          <Route
            path="/free-diagnosis/report"
            element={<Navigate to="/learning-diagnosis/report" replace />}
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
            <Route
              path="/app/goal/onboarding/:step"
              element={<GoalOnboarding />}
            />
          </Route>

          <Route path="/services/callmentor" element={<Callmentor />} />
          {/* 구 경로 — GNB/DB services-content 슬러그가 가리키던 곳. 신규 랜딩으로 리다이렉트 */}
          <Route
            path="/page/services-content"
            element={<Navigate to="/services/callmentor" replace />}
          />

          {/* 서비스 랜딩 4종 (Figma 예시 1889:6944/1889:6486/1907:20783/1907:21352) */}
          <Route path="/services/goal" element={<GoalManagement />} />
          <Route
            path="/services/performance"
            element={<PerformanceAssessment />}
          />
          <Route
            path="/services/self-assessment"
            element={<SelfAssessment />}
          />
          <Route path="/services/research" element={<InDepthResearch />} />

          {/* 구 경로(DB page_contents 미갱신 시 잔존) → 신규 라우트로 리다이렉트 */}
          <Route
            path="/page/services-goal"
            element={<Navigate to="/services/goal" replace />}
          />
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

          <Route
            path="/admission/guidelines"
            element={<AdmissionGuidelines />}
          />
          <Route path="/admission/results" element={<AdmissionResults />} />

          {/* 수시와 정시는 각각 자신의 category만 조회합니다. */}
          <Route path="/admission/susi" element={<AdmissionCases />} />
          <Route path="/admission/jungsi" element={<AdmissionCases />} />
          <Route path="/admission/susi/:id" element={<AdmissionCaseDetail />} />
          <Route
            path="/admission/jungsi/:id"
            element={<AdmissionCaseDetail />}
          />

          {/* 메인 합격생 카드에서 사용하는 통합 상세 주소는 유지합니다. */}
          <Route
            path="/admission/susi-jungsi/:id"
            element={<AdmissionCaseDetail />}
          />
          <Route
            path="/admission/susi-jungsi"
            element={<Navigate to="/admission/susi" replace />}
          />

          {/* 특목고합격 — 카드가 링크가 아니라 상세 라우트는 두지 않는다(시안 2239:1559에 상세 없음). */}
          <Route
            path="/admission/special-highschool"
            element={<SpecialHighschoolCases />}
          />

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
          <Route
            path="/page/premium-apply"
            element={<Navigate to="/premium-apply" replace />}
          />

          {/* 이용신청 > 멘토신청 — premium-apply 선례 그대로. 반드시 /page/:slug 와일드카드보다 위에
              둔다(아래로 내려가면 DynamicPage가 먼저 매칭해 신규 페이지가 뜨지 않는다). */}
          <Route path="/mentor-apply" element={<MentorApply />} />
          <Route
            path="/page/mentor-apply"
            element={<Navigate to="/mentor-apply" replace />}
          />

          <Route path="/page/:slug" element={<DynamicPage />} />

          {/* 로그인·회원가입 리뉴얼(§5.2) — 헤더/푸터 포함 풀 페이지가 시안 확정이므로
              SiteLayout 안으로 편입(구 Login.jsx/Signup.jsx의 pt-16 보정 관례 그대로 재사용). */}
          <Route path="/login" element={<Login />} />

          <Route element={<SignupFlowLayout />}>
            <Route path="/signup" element={<MemberType />} />
            <Route path="/signup/student/birth" element={<StudentBirth />} />
            <Route path="/signup/student" element={<StudentForm />} />
            <Route
              path="/signup/student/under14/verify"
              element={<Under14Verify />}
            />
            <Route path="/signup/student/under14" element={<Under14Form />} />
            {UNIFIED_SIGNUP_ENABLED && (
              <Route path="/signup/unified" element={<UnifiedSignupForm />} />
            )}
            <Route
              path="/signup/student/complete"
              element={<StudentComplete />}
            />
            <Route path="/signup/parent" element={<ParentForm />} />
            <Route path="/signup/parent/link" element={<LinkChoice />} />
            <Route
              path="/signup/parent/link/add"
              element={<LinkChoice mode="add" />}
            />
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
          <Route
            path="/terms/student/marketing"
            element={<StudentMarketing />}
          />
          <Route
            path="/terms/student/promotion"
            element={<StudentPromotion />}
          />
          <Route path="/terms/parent/service" element={<ParentService />} />
          <Route path="/terms/parent/privacy" element={<ParentPrivacy />} />
          <Route path="/terms/parent/marketing" element={<ParentMarketing />} />

          {/* 마이페이지 리뉴얼(Figma 3762:18713 학생/멘토, 3762:20390 학부모) — 공통
              헤더/푸터가 있는 시안이라 SiteLayout 안으로 편입(구 /app/goal, /admin과 달리
              별도 셸이 없다). 탭 상태는 MyPage.jsx 내부에서 ?tab= 쿼리로 관리한다. */}
          <Route path="/mypage" element={<MyPage />} />

          {/* 학부모가 자녀의 성장 리포트를 여는 뷰어. 본문(GrowthReportBody)은 학생
              뷰와 공유하지만 셸은 다르다 — 목표관리 앱 셸(GoalAppLayout, 사이드바)이
              아니라 마이페이지와 같은 SiteLayout 안에 둔다. 학부모는 목표관리 앱의
              이용자가 아니라 열람자라서 사이드바 메뉴(타이머·일일기록 등)가 의미가
              없기 때문이다. 권한 판정은 ChildReport 안에서 fn_parent_children 으로 한다. */}
          <Route
            path="/mypage/children/:studentId/report"
            element={<ChildReport />}
          />
        </Route>

        {/* 목표관리 학생 앱 — 사이드바 셸(GoalAppLayout) 그룹. 진입 가드(로그인 → 이용권 →
            온보딩 완료 → 대시보드)는 RequireGoalAccess가 소유한다(2026-08-10 확정,
            GoalAppLayout.jsx 상단 TODO는 해소됨). */}
        <Route element={<RequireGoalAccess />}>
          <Route element={<GoalAppLayout />}>
            <Route path="/app/goal" element={<GoalDashboard />} />
            <Route
              path="/app/goal/target-university"
              element={<GoalTargetUniversity />}
            />
            <Route path="/app/goal/timer" element={<GoalTimer />} />
            <Route
              path="/app/goal/daily-record"
              element={<GoalDailyRecord />}
            />
            <Route path="/app/goal/weekly-plan" element={<GoalWeeklyPlan />} />
            <Route path="/app/goal/efforts" element={<GoalEfforts />} />
            <Route
              path="/app/goal/reports/growth"
              element={<GoalGrowthReport />}
            />
            <Route path="/app/goal/grades" element={<GoalGrades />} />
            <Route
              path="/app/goal/reports/direction"
              element={<GoalDirectionReport />}
            />
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
                forbiddenNotice="수행평가 서비스는 유료 이용권을 결제하신 뒤 이용할 수 있습니다."
              />
            }
          >
            {/* 셸(사이드바 + 페이지 타이틀)은 P4에서 구현됐다 — §3.1/§3.5.
                TODO(P7~): 나머지 플레이스홀더(저장 리포트·세션 복구)를 실제 페이지로 교체한다.
                  · P6 STEP1 기본 정보 폼(§5.5) — 아래로 배선 완료
                  · P7~ STEP2 이후(§5.6~§5.17) · P12 저장 리포트(§5.18~§5.19) */}
            <Route
              element={
                <Suspense
                  fallback={
                    <main className="flex min-h-screen items-center justify-center bg-[#F7F4EF] pt-16 text-[#0D1B2A]">
                      <div className="rounded-2xl border border-[#0D1B2A]/10 bg-white px-6 py-4 text-sm font-extrabold shadow-[0_18px_45px_rgba(13,27,42,0.10)]">
                        불러오는 중...
                      </div>
                    </main>
                  }
                >
                  <Outlet />
                </Suspense>
              }
            >
              <Route element={<PerformanceAppLayout />}>
                <Route
                  path="/app/performance"
                  element={<PerformanceChatPage />}
                />
                {/* 저장 리포트는 모달이 아니라 라우트다(§11-Q65). 정적 세그먼트가
                    :sessionId보다 우선 매칭되므로 `reports`가 세션 id로 오인되지 않는다. */}
                <Route
                  path="/app/performance/reports"
                  element={<PerformanceReportsPage />}
                />
                <Route
                  path="/app/performance/reports/:sessionId"
                  element={<PerformanceReportsPage />}
                />
                {/* 새로고침 복구 진입점(§2.1). 외부 앱은 sessionId가 인메모리라 새로고침
                    시 재로그인으로 떨어졌다. 세션 id는 인증 수단이 아니라 리소스 ID이므로
                    URL에 노출해도 안전하다 — 소유권은 서버가 auth.uid()로 판정한다. */}
                <Route
                  path="/app/performance/:sessionId"
                  element={<PerformanceChatPage />}
                />
              </Route>
            </Route>
          </Route>
        </Route>
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

        {/* /demo, /demo/:demoKey — 고객사 목업 데모 원문(어드민 전용). SiteLayout 밖(/admin과
            같은 층위)에 둔다. 자체 크롬(헤더/푸터 또는 전체화면 앱 UI)을 갖고 있어 사이트
            헤더/푸터와 겹치면 크롬이 이중화된다. */}
        <Route
          path="/demo"
          element={
            <ProtectedAdmin>
              <Suspense fallback={<DemoFallback />}>
                <DemoIndex />
              </Suspense>
            </ProtectedAdmin>
          }
        />
        <Route
          path="/demo/:demoKey"
          element={
            <ProtectedAdmin>
              <Suspense fallback={<DemoFallback />}>
                <DemoFrame />
              </Suspense>
            </ProtectedAdmin>
          }
        />

        {/* /services/growth — 서비스 랜딩 중 하나로 비로그인 포함 전원 공개. 렌더하는 실체는
            고객사 제공 HTML 목업(growth-intro)이라 위 /demo 라우트들과 같은 이유로 SiteLayout
            밖에 두지만, 접근 통제는 걸지 않는다. */}
        <Route
          path="/services/growth"
          element={
            <Suspense fallback={<DemoFallback />}>
              <DemoFrame demoKeyOverride="growth-intro" />
            </Suspense>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
