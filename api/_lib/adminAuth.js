// 서버측 관리자 판정 — SQL `public.is_admin()`의 JS 미러.
//
// 왜 미러가 필요한가
//   api/ 라우트는 `createSupabaseAdmin()`(service_role)로 붙는데, service_role은
//   **RLS를 통째로 우회한다.** 즉 `is_admin()`을 술어로 쓰는 RLS 정책이
//   (예: sql/53_performance.sql의 winning_assessment_knowledge_items 정책)
//   서버 경로에서는 아무것도 막아주지 않는다. 그래서 "누가 무엇을 할 수
//   있는지"는 라우트가 직접 검사해야 한다(api/_lib/supabaseAdmin.js 상단 주석).
//
// 무엇을 미러하는가 — sql/00_base_schema.sql:1273-1286
//   create function public.is_admin() returns boolean
//     select exists (select 1 from public.profiles
//                     where id = auth.uid() and role = 'admin');
//   판정 축은 **uid 단일**, 허용 role은 **'admin' 단독**이다. 아래 구현은
//   `auth.uid()` 자리에 `supabaseAdmin.auth.getUser(token)`으로 검증한 uid를
//   넣은 것 외에는 같은 술어다.
//
// ⚠️ `is_winning_admin()`(:1338-1353)이 아니다. 그쪽은 uid 외에 JWT의 email
//   문자열로도 profiles 행을 찾고(`profiles.email`에 UNIQUE가 없어 동일 이메일
//   행이 둘 이상이면 다른 계정이 admin 행에 매칭될 수 있다) role 집합도 4개로
//   넓다(단 `profiles_role_check`가 값을 'user'/'admin' 둘로 제한하므로 확장분은
//   이 DB에서 사문이다). 지식베이스는 유료 상품의 원천 자산이라 판정 축을 넓힐
//   이유가 없어 좁은 쪽인 `is_admin()`으로 잠근다.
//   (근거: docs/수행평가-상세-명세.md §8.7, sql/53_performance.sql (1-a))
//
// ⚠️ 여기서 `is_active`는 보지 않는다. `is_admin()`이 보지 않기 때문이다.
//   DB 판정과 서버 판정이 어긋나면 "어드민 화면에서는 되는데 API는 막힌다"
//   (혹은 그 반대)가 되므로, 조건을 임의로 더하지 않는다. 비활성 관리자까지
//   막으려면 SQL 함수와 이 파일을 **같이** 고쳐야 한다.

import { getBearerToken } from './serviceAccess.js';

export { getBearerToken };

/**
 * Authorization: Bearer <supabase access token> → 관리자 판정.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseAdmin service_role 클라이언트
 * @param {{ headers: Record<string, string> }} req
 * @returns {Promise<{ ok: true, userId: string } | { ok: false, status: number, detail: string }>}
 *   호출부는 실패 시 `status`/`detail`을 그대로 응답에 실으면 된다.
 */
export async function resolveAdmin(supabaseAdmin, req) {
  const token = getBearerToken(req);

  if (!token) {
    return { ok: false, status: 401, detail: '로그인이 필요합니다.' };
  }

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);

  if (userError || !userData?.user?.id) {
    return { ok: false, status: 401, detail: '로그인이 필요합니다.' };
  }

  const userId = userData.user.id;

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle();

  // 조회 자체가 실패한 것을 "권한 없음"으로 뭉개면 원인이 안 보인다.
  // 권한 거부(403)와 서버 오류(500)를 구분해서 돌려준다.
  if (profileError) {
    return { ok: false, status: 500, detail: '관리자 권한 확인에 실패했습니다.' };
  }

  if (!profile || String(profile.role || '') !== 'admin') {
    return { ok: false, status: 403, detail: '관리자 권한이 필요합니다.' };
  }

  return { ok: true, userId };
}
