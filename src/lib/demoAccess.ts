import { supabase } from "./supabase";

// CTA를 3갈래(로그인 유도 / 데모 라우트 / 준비중 alert)로 분기하기 위한 헬퍼. 실제 접근
// 통제는 라우트의 ProtectedAdmin이 최종 방어선이므로, 여기서는 ProtectedAdmin.jsx와 동일한
// 기준(role=admin)을 그대로 재사용해 "어디로 보낼지"만 판단한다.
//
// 반환값은 3상태 문자열이다.
//   'guest'  — 로그인 세션이 없다 → /login으로 보낸다.
//   'member' — 로그인은 했지만 role이 admin이 아니다 → 준비중 alert.
//   'admin'  — role이 admin이다 → 데모 라우트로 보낸다.
//
// 네트워크 장애(Supabase 호출 reject) 시에는 'guest'로 떨어뜨린다. 'member'로 떨어뜨리면
// 실제로 로그인된 관리자가 장애 순간 alert만 보고 데모에 못 들어가는 죽은 CTA가 되고,
// 'admin'으로 떨어뜨리면 미검증 상태에서 데모로 보내는 꼴이라 더 위험하다. 'guest'는
// Login.jsx가 세션을 다시 확인해 이미 로그인된 사용자를 원래 자리로 되돌려보내므로
// (§4.2 R-2/R-5) 가장 안전하게 fail한다 — 최악의 경우도 "로그인 화면을 한 번 더 본다"에
// 그치고, 정상 로그인 사용자가 무한 루프에 빠지지는 않는다(랜딩은 CTA를 자동 재실행하지
// 않는다).
export async function getDemoAccessState() {
  if (import.meta.env.DEV && import.meta.env.VITE_ADMIN_BYPASS === "true") {
    return "admin";
  }

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user;
    if (!user) return "guest";

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    return !error && profile?.role === "admin" ? "admin" : "member";
  } catch {
    // 네트워크 장애 등으로 Supabase 호출이 reject되면 로그인 안 됨으로 취급해 'guest'로
    // 강등한다(위 주석 근거). 과거 이 catch가 없어 CTA가 죽은 버튼이 됐던 결함의 재발
    // 방지 처리이므로 3상태 확장 후에도 반드시 유지한다.
    return "guest";
  }
}
