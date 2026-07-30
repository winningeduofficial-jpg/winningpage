import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import Home from './pages/Home';
import Login from './pages/Login';
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
import AdmissionGuidelines from './pages/AdmissionGuidelines';
import AdmissionResults from './pages/AdmissionResults';
import Gallery from './pages/Gallery';
import Events from './pages/Events';
import Reviews from './pages/Reviews';
import Faq from './pages/Faq';
import Admin from './pages/Admin';
import DynamicPage from './pages/DynamicPage';
import CompanyNews from './pages/CompanyNews';
import ProtectedAdmin from './components/ProtectedAdmin';
import SiteLayout from './components/SiteLayout';
import { SignupProvider } from './context/SignupContext';

// 회원가입 플로우(§5.2) — 유형 선택 → 생년월일 → 학생/학부모 분기 폼 → 완료/온보딩
import MemberType from './pages/signup/MemberType';
import StudentBirth from './pages/signup/StudentBirth';
import StudentForm from './pages/signup/StudentForm';
import Under14Verify from './pages/signup/Under14Verify';
import Under14Form from './pages/signup/Under14Form';
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

// /signup 하위 라우트 전용 컨텍스트 경계 — 유형 선택부터 완료/온보딩까지 단계 간 데이터
// (memberType/birthDate/폼데이터/인증 상태)를 SignupProvider(§5.3)로 공유한다.
function SignupFlowLayout() {
  return (
    <SignupProvider>
      <Outlet />
    </SignupProvider>
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

          <Route path="/admission/guidelines" element={<AdmissionGuidelines />} />
          <Route path="/admission/results" element={<AdmissionResults />} />

          {/* 수시와 정시는 각각 자신의 category만 조회합니다. */}
          <Route path="/admission/susi" element={<AdmissionBoard />} />
          <Route path="/admission/jungsi" element={<AdmissionBoard />} />
          <Route path="/admission/susi/:id" element={<AdmissionBoard />} />
          <Route path="/admission/jungsi/:id" element={<AdmissionBoard />} />

          {/* 메인 합격생 카드에서 사용하는 통합 상세 주소는 유지합니다. */}
          <Route path="/admission/susi-jungsi/:id" element={<AdmissionBoard />} />
          <Route
            path="/admission/susi-jungsi"
            element={<Navigate to="/admission/susi" replace />}
          />

          <Route path="/admission/essay" element={<AdmissionBoard />} />
          <Route path="/admission/essay/:id" element={<AdmissionBoard />} />
          <Route path="/admission/:category" element={<AdmissionBoard />} />
          <Route path="/admission/:category/:id" element={<AdmissionBoard />} />

          <Route path="/events" element={<Events />} />
          <Route path="/company-news" element={<CompanyNews />} />
          <Route path="/faq" element={<Faq />} />
          <Route path="/gallery" element={<Gallery />} />
          <Route path="/gallery/:id" element={<Gallery />} />

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
        <Route path="/payment/fail" element={<PaymentFail />} />
        <Route path="/reviews" element={<Reviews />} />
        <Route path="/services" element={<Services />} />
        <Route path="/learning-analysis" element={<LearningAnalysis />} />

        <Route
          path="/admin"
          element={
            <ProtectedAdmin>
              <Admin />
            </ProtectedAdmin>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
