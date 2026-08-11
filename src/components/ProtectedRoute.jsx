import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';

// 로그인 여부만 확인하는 라우트 가드. 관리자 권한까지 보는 ProtectedAdmin.jsx
// 의 형제 컴포넌트 — profiles.role 조회 없이 세션 유무만 본다.
//
// /checkout 비회원 결제 차단(감사 M5, 2026-08-12)의 라우트 층. 진짜 방어선은
// api/create-order.js 의 서버 거부다(클라이언트 가드는 devtools로 우회
// 가능) — 여기는 UX 층: 비로그인 사용자가 애초에 결제 화면에 들어오지 않게
// 막아서 입력을 다 채운 뒤에야 막히는 걸 방지한다.
export default function ProtectedRoute({ children }) {
  const location = useLocation();

  const [status, setStatus] = useState('loading');

  useEffect(() => {
    let alive = true;

    async function checkAuth() {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;

      if (!alive) return;

      setStatus(user ? 'authed' : 'guest');
    }

    checkAuth();

    return () => {
      alive = false;
    };
  }, []);

  if (status === 'loading') {
    // 마크업·문구 모두 Signup.jsx(:690) / ProtectedAdmin.jsx(:53) 세션 확인
    // 로딩 화면 재사용 — 신규 문구 아님.
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#F7F4EF] pt-16 text-[#0D1B2A]">
        <div className="rounded-2xl border border-[#0D1B2A]/10 bg-white px-6 py-4 text-sm font-extrabold shadow-[0_18px_45px_rgba(13,27,42,0.10)]">
          로그인 상태 확인 중...
        </div>
      </main>
    );
  }

  if (status === 'guest') {
    // ProtectedAdmin.jsx §5.2 와 같은 관례: Login.jsx는 location.state가 아니라
    // ?redirect= 쿼리만 읽는다. Pricing.jsx의 goCheckout()도 이미
    // '/login?redirect=/checkout'로 보낸다(선(先) 진입 가드, 여기는 후(後) 가드).
    const redirectPath = `${location.pathname}${location.search}${location.hash}`;
    return (
      <Navigate to={`/login?redirect=${encodeURIComponent(redirectPath)}`} replace />
    );
  }

  return children;
}
