import { supabase } from './supabase';

// 죽은 CTA를 데모 라우트로 보낼지 판정하는 헬퍼. 실제 접근 통제는 라우트의 ProtectedAdmin이
// 최종 방어선이므로, 여기서는 ProtectedAdmin.jsx와 동일한 기준(role=admin)을 그대로 재사용해
// "데모로 보낼지 준비중 alert를 띄울지"만 판단한다.
export async function isAdminUser() {
  if (import.meta.env.DEV && import.meta.env.VITE_ADMIN_BYPASS === 'true') {
    return true;
  }

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user;
    if (!user) return false;

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    return !error && profile?.role === 'admin';
  } catch {
    // 네트워크 장애 등으로 Supabase 호출이 reject되면 CTA가 죽은 버튼이 되므로
    // 여기서 false로 강등해 준비중 alert 흐름으로 안전하게 떨어뜨린다.
    return false;
  }
}
