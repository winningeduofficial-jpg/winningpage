import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import Header from './components/Header.jsx';
import ProtectedAdmin from './components/ProtectedAdmin.jsx';

import Home from './pages/Home.jsx';
import Services from './pages/Services.jsx';
import LearningAnalysis from './pages/LearningAnalysis.jsx';
import Admissions from './pages/Admissions.jsx';
import Pricing from './pages/Pricing.jsx';
import Reviews from './pages/Reviews.jsx';
import Events from './pages/Events.jsx';
import Login from './pages/Login.jsx';
import Signup from './pages/Signup.jsx';
import Admin from './pages/Admin.jsx';
import MyPage from './pages/MyPage.jsx';

function AppRoutes() {
  const location = useLocation();
  const isAdminPage = location.pathname.startsWith('/admin');

  return (
    <>
      {!isAdminPage && <Header />}

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/services" element={<Services />} />
        <Route path="/learning-analysis" element={<LearningAnalysis />} />
        <Route path="/admissions" element={<Admissions />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/reviews" element={<Reviews />} />
        <Route path="/events" element={<Events />} />

        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/mypage" element={<MyPage />} />

        <Route
          path="/admin/*"
          element={
            <ProtectedAdmin>
              <Admin />
            </ProtectedAdmin>
          }
        />
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
