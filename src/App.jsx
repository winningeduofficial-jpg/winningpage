import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Home from './pages/Home';
import Login from './pages/Login';
import Signup from './pages/Signup';
import MyPage from './pages/MyPage';
import Pricing from './pages/Pricing';
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
import ProtectedAdmin from './components/ProtectedAdmin';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />

        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/mypage" element={<MyPage />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/free-diagnosis" element={<FreeDiagnosis />} />

        <Route path="/services" element={<Services />} />
        <Route path="/learning-analysis" element={<LearningAnalysis />} />

        <Route path="/admission/guidelines" element={<AdmissionGuidelines />} />
        <Route path="/admission/results" element={<AdmissionResults />} />
        <Route path="/admission/susi-jungsi" element={<AdmissionBoard />} />
        <Route path="/admission/susi-jungsi/:id" element={<AdmissionBoard />} />

        <Route path="/admission/susi" element={<Navigate to="/admission/susi-jungsi" replace />} />
        <Route path="/admission/jungsi" element={<Navigate to="/admission/susi-jungsi" replace />} />
        <Route path="/admission/essay" element={<Navigate to="/admission/susi-jungsi" replace />} />
        <Route path="/admission/susi/:id" element={<Navigate to="/admission/susi-jungsi" replace />} />
        <Route path="/admission/jungsi/:id" element={<Navigate to="/admission/susi-jungsi" replace />} />
        <Route path="/admission/essay/:id" element={<Navigate to="/admission/susi-jungsi" replace />} />

        <Route path="/admission/:category" element={<AdmissionBoard />} />
        <Route path="/admission/:category/:id" element={<AdmissionBoard />} />

        <Route path="/events" element={<Events />} />
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

