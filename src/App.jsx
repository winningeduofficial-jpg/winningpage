import { useEffect } from 'react';
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
        <Route path="/" element={<Home />} />

        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/mypage" element={<MyPage />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/checkout" element={<Checkout />} />

        {/* 법적 문서 (카드사·PG 심사 필수) */}
        <Route path="/terms" element={<Legal docKey="terms" />} />
        <Route path="/privacy" element={<Legal docKey="privacy" />} />
        <Route path="/refund" element={<Legal docKey="refund" />} />
        <Route path="/payment-terms" element={<Legal docKey="payment-terms" />} />
        <Route path="/payment-consent" element={<Legal docKey="payment-consent" />} />

        <Route path="/payment/success" element={<PaymentSuccess />} />
        <Route path="/payment/fail" element={<PaymentFail />} />
        <Route path="/free-diagnosis" element={<FreeDiagnosis />} />

        <Route path="/services" element={<Services />} />
        <Route path="/learning-analysis" element={<LearningAnalysis />} />

        <Route path="/admission/guidelines" element={<AdmissionGuidelines />} />
        <Route path="/admission/results" element={<AdmissionResults />} />

        {/* 수시와 정시는 각각 자신의 category만 조회합니다. */}
        <Route path="/admission/susi" element={<AdmissionBoard />} />
        <Route path="/admission/jungsi" element={<AdmissionBoard />} />
        <Route path="/admission/susi/:id" element={<AdmissionBoard />} />
        <Route path="/admission/jungsi/:id" element={<AdmissionBoard />} />

        {/* 메인 합격생 카드에서 사용하는 통합 상세 주소는 유지합니다. */}
        <Route path="/admission/susi-jungsi/:id" element={<AdmissionBoard />} />
        <Route path="/admission/susi-jungsi" element={<Navigate to="/admission/susi" replace />} />

        <Route path="/admission/essay" element={<AdmissionBoard />} />
        <Route path="/admission/essay/:id" element={<AdmissionBoard />} />
        <Route path="/admission/:category" element={<AdmissionBoard />} />
        <Route path="/admission/:category/:id" element={<AdmissionBoard />} />

        <Route path="/events" element={<Events />} />
        <Route path="/company-news" element={<CompanyNews />} />
        <Route path="/reviews" element={<Reviews />} />
        <Route path="/faq" element={<Faq />} />
        <Route path="/gallery" element={<Gallery />} />
        <Route path="/gallery/:id" element={<Gallery />} />

        <Route path="/page/:slug" element={<DynamicPage />} />

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
