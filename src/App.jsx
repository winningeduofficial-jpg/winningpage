import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Header from './components/Header';
import ProtectedAdmin from './components/ProtectedAdmin';

import Home from './pages/Home';
import Services from './pages/Services';
import LearningAnalysis from './pages/LearningAnalysis';
import Admissions from './pages/Admissions';
import Pricing from './pages/Pricing';
import Reviews from './pages/Reviews';
import Events from './pages/Events';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Admin from './pages/Admin';

export default function App() {
  return (
    <BrowserRouter>
      <Header />

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

        <Route 
          path="/admin" 
          element={
            <ProtectedAdmin>
              <Admin />
            </ProtectedAdmin>
          } 
        />
      </Routes>
    </BrowserRouter>
  );
}
