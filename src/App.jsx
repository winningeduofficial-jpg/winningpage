import { useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Home from './pages/Home';
import Login from './pages/Login';
import Signup from './pages/Signup';
import MyPage from './pages/MyPage';
import Pricing from './pages/Pricing';
import Checkout from './pages/Checkout';
import Legal from './pages/Legal';
import PaymentSuccess from './pages/PaymentSuccess';
import PaymentFail from './pages/PaymentFail';
import FreeDiagnosis from './pages/FreeDiagnosis';
import FreeDiagnosisLanding from './pages/renewal/FreeDiagnosisLanding';
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
import CompanyNews from './pages/CompanyNews';
import ProtectedAdmin from './components/ProtectedAdmin';
import SiteLayout from './components/SiteLayout';

const Admin = lazy(() => import('./pages/Admin'));
// 고객사 HTML 목업 5종 데모 라우트 — lazy가 핵심이다. 가드(ProtectedAdmin)를 통과하기 전엔
// HTML 문자열이 든 청크를 네트워크에서 받지도 않는다.
const DemoIndex = lazy(() => import('./pages/demo/DemoIndex'));
const DemoFrame = lazy(() => import('./pages/demo/DemoFrame'));

// 데모 라우트 공용 Suspense fallback — /admin 것과 같은 스타일로 맞춘다.
function DemoFallback() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F7F4EF] pt-16 text-[#0D1B2A]">
      <div className="rounded-2xl border border-[#0D1B2A]/10 bg-white px-6 py-4 text-sm font-extrabold shadow-[0_1.125rem_2.8125rem_rgba(13,27,42,0.10)]">
        데모 페이지 불러오는 중...
      </div>
    </main>
  );
}

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
          <Route path="/checkout" element={<Checkout />} />

          {/* 법적 문서 (카드사·PG 심사 필수) */}
          <Route path="/terms" element={<Legal docKey="terms" />} />
          <Route path="/privacy" element={<Legal docKey="privacy" />} />
          <Route path="/refund" element={<Legal docKey="refund" />} />
          <Route path="/payment-terms" element={<Legal docKey="payment-terms" />} />
          <Route path="/payment-consent" element={<Legal docKey="payment-consent" />} />

          <Route path="/payment/success" element={<PaymentSuccess />} />
          <Route path="/free-diagnosis" element={<FreeDiagnosisLanding />} />
          <Route path="/free-diagnosis/survey" element={<FreeDiagnosis />} />

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
          <Route path="/faq" element={<Faq />} />
          <Route path="/info/column" element={<ColumnHome />} />
          <Route path="/info/column/list" element={<ColumnList />} />
          <Route path="/info/column/:id" element={<ColumnDetail />} />

          <Route path="/page/:slug" element={<DynamicPage />} />
        </Route>

        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/mypage" element={<MyPage />} />
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

        {/* 고객사 목업 5종 데모 — SiteLayout 밖(/admin과 같은 층위)에 둔다. 5개 전부 자체
            크롬(헤더/푸터 또는 전체화면 앱 UI)을 갖고 있어 사이트 헤더/푸터와 겹치면 크롬이
            이중화된다. growth-intro는 /services/growth로 고정 승격한다. */}
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
        <Route
          path="/services/growth"
          element={
            <ProtectedAdmin>
              <Suspense fallback={<DemoFallback />}>
                <DemoFrame demoKeyOverride="growth-intro" />
              </Suspense>
            </ProtectedAdmin>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
