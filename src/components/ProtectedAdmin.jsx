import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function ProtectedAdmin({ children }) {
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    async function checkAdmin() {
      const { data: userData } = await supabase.auth.getUser();

      if (!userData.user) {
        setStatus('guest');
        return;
      }

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userData.user.id)
        .single();

      if (error || profile?.role !== 'admin') {
        setStatus('forbidden');
        return;
      }

      setStatus('admin');
    }

    checkAdmin();
  }, []);

  if (status === 'loading') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        관리자 권한 확인 중...
      </main>
    );
  }

  if (status === 'guest') {
    return <Navigate to="/login" replace />;
  }

  if (status === 'forbidden') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        관리자 권한이 없습니다.
      </main>
    );
  }

  return children;
}
